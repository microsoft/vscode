/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { findLastIdx } from '../../../../util/vs/base/common/arraysFind';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { Range, TextEdit } from '../../../../vscodeTypes';
import { ISessionTurnStorage, OutcomeAnnotationLabel } from '../../../inlineChat/node/promptCraftingTypes';
import { isImportStatement } from '../../../prompt/common/importStatement';
import { EditStrategy, trimLeadingWhitespace } from '../../../prompt/node/editGeneration';
import { EarlyStopping, IResponseProcessorContext, LeadingMarkdownStreaming, ReplyInterpreter, StreamingEditsController } from '../../../prompt/node/intents';
import { ILineFilter, IStreamingEditsStrategyFactory, IStreamingTextPieceClassifier, InsertOrReplaceStreamingEdits, InsertionStreamingEdits, LineRange, ReplaceSelectionStreamingEdits, SentInCodeBlock, SentLine, StreamingWorkingCopyDocument } from '../../../prompt/node/streamingEdits';
import { ProjectedDocument } from './summarizedDocument/summarizeDocument';
import { adjustSelectionAndSummarizeDocument } from './summarizedDocument/summarizeDocumentHelpers';
import { DocumentSnapshot, WorkingCopyDerivedDocument } from './workingCopies';

export async function createPromptingSummarizedDocument(
	parserService: IParserService,
	document: TextDocumentSnapshot,
	formattingOptions: vscode.FormattingOptions | undefined,
	userSelection: Range,
	tokensBudget: number,
): Promise<PromptingSummarizedDocument> {
	const result = await adjustSelectionAndSummarizeDocument(parserService, document, formattingOptions, userSelection, tokensBudget);
	return new PromptingSummarizedDocument(
		result.selection,
		result.adjustedSelection,
		result.document,
		document,
		formattingOptions,
	);
}

export class PromptingSummarizedDocument {

	public get uri(): vscode.Uri {
		return this._document.uri;
	}

	public get languageId(): string {
		return this._document.languageId;
	}

	constructor(
		private readonly _selection: OffsetRange,
		private readonly _adjustedSelection: OffsetRange,
		private readonly _projectedDocument: ProjectedDocument,
		private readonly _document: TextDocumentSnapshot,
		private readonly _formattingOptions: vscode.FormattingOptions | undefined,
	) { }

	public splitAroundAdjustedSelection(): SummarizedDocumentSplit {
		return new SummarizedDocumentSplit(
			this._projectedDocument,
			this.uri,
			this._formattingOptions,
			this._adjustedSelection
		);
	}

	public splitAroundOriginalSelectionEnd(): SummarizedDocumentSplit {
		return new SummarizedDocumentSplit(
			this._projectedDocument,
			this.uri,
			this._formattingOptions,
			new OffsetRange(
				this._selection.endExclusive,
				this._selection.endExclusive
			)
		);
	}
}

export class SummarizedDocumentSplit {

	public readonly codeAbove: string;
	public readonly codeSelected: string;
	public readonly codeBelow: string;
	private readonly _selection: vscode.Range;

	public get hasCodeWithoutSelection(): boolean {
		return (
			this.codeAbove.trim().length > 0
			|| this.codeBelow.trim().length > 0
		);
	}

	public get hasContent(): boolean {
		return (
			this.codeAbove.trim().length > 0
			|| this.codeSelected.trim().length > 0
			|| this.codeBelow.trim().length > 0
		);
	}

	constructor(
		private readonly _projectedDocument: ProjectedDocument,
		private readonly _uri: vscode.Uri,
		private readonly _formattingOptions: vscode.FormattingOptions | undefined,
		offsetSelection: OffsetRange
	) {
		this._selection = this._projectedDocument.positionOffsetTransformer.toRange(offsetSelection);
		this.codeAbove = this._projectedDocument.text.substring(0, offsetSelection.start);
		this.codeSelected = this._projectedDocument.text.substring(offsetSelection.start, offsetSelection.endExclusive);
		this.codeBelow = this._projectedDocument.text.substring(offsetSelection.endExclusive);
	}

	public get replaceSelectionStreaming(): IStreamingEditsStrategyFactory {
		return (lineFilter, streamingWorkingCopyDocument) => new ReplaceSelectionStreamingEdits(
			streamingWorkingCopyDocument,
			this._selection,
			lineFilter
		);
	}

	public get insertStreaming(): IStreamingEditsStrategyFactory {
		return (lineFilter, streamingWorkingCopyDocument) => new InsertionStreamingEdits(
			streamingWorkingCopyDocument,
			this._selection.end,
			lineFilter
		);
	}

	public get insertOrReplaceStreaming(): IStreamingEditsStrategyFactory {
		return (lineFilter, streamingWorkingCopyDocument) => new InsertOrReplaceStreamingEdits(
			streamingWorkingCopyDocument,
			this._selection,
			this._selection,
			EditStrategy.FallbackToInsertBelowRange,
			true,
			lineFilter
		);
	}

	public createReplyInterpreter(
		leadingMarkdownStreaming: LeadingMarkdownStreaming,
		earlyStopping: EarlyStopping,
		streamingStrategyFactory: IStreamingEditsStrategyFactory,
		textPieceClassifier: IStreamingTextPieceClassifier,
		lineFilter: ILineFilter
	): ReplyInterpreter {
		return new InlineReplyInterpreter(
			this._uri,
			this._projectedDocument,
			this._formattingOptions,
			leadingMarkdownStreaming,
			earlyStopping,
			streamingStrategyFactory,
			textPieceClassifier,
			lineFilter
		);
	}
}

export class InlineReplyInterpreter implements ReplyInterpreter {

	private readonly _initialDocumentSnapshot: DocumentSnapshot;
	private readonly _workingCopySummarizedDoc: WorkingCopyDerivedDocument;
	private _lastText: string = '';

	constructor(
		private readonly _uri: vscode.Uri,
		summarizedDoc: ProjectedDocument,
		private readonly _fileIndentInfo: vscode.FormattingOptions | undefined,
		private readonly _leadingMarkdownStreaming: LeadingMarkdownStreaming,
		private readonly _earlyStopping: EarlyStopping,
		private readonly _streamingStrategyFactory: IStreamingEditsStrategyFactory,
		private readonly _textPieceClassifier: IStreamingTextPieceClassifier,
		private readonly _lineFilter: ILineFilter
	) {
		this._initialDocumentSnapshot = new DocumentSnapshot(summarizedDoc.originalText);
		this._workingCopySummarizedDoc = new WorkingCopyDerivedDocument(summarizedDoc);
	}

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, _outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const outputStream = this._workingCopySummarizedDoc.createDerivedDocumentChatResponseStream(_outputStream);
		const streamingWorkingCopyDocument = new StreamingWorkingCopyDocument(
			outputStream,
			this._uri,
			this._workingCopySummarizedDoc.text,
			this._workingCopySummarizedDoc.text.split('\n').map((_, index) => new SentLine(index, SentInCodeBlock.Other)), // not used
			new LineRange(0, 0), // not used
			this._workingCopySummarizedDoc.languageId,
			this._fileIndentInfo
		);

		const streaming = new StreamingEditsController(
			outputStream,
			this._leadingMarkdownStreaming,
			this._earlyStopping,
			this._textPieceClassifier,
			this._streamingStrategyFactory(this._lineFilter, streamingWorkingCopyDocument),
		);

		for await (const part of inputStream) {
			this._lastText += part.delta.text;
			const { shouldFinish } = streaming.update(this._lastText);
			if (shouldFinish) {
				break;
			}
		}

		const { didEdits, didNoopEdits, additionalImports } = await streaming.finish();
		if (didEdits) {
			const additionalImportsEdits = this._generateAdditionalImportsEdits(additionalImports);

			const reversedEdits = this._workingCopySummarizedDoc.allReportedEdits.inverse(this._initialDocumentSnapshot.text);
			const entireModifiedRangeOffsets = reversedEdits.replacements.reduce((prev, curr) => prev.join(curr.replaceRange), reversedEdits.replacements[0].replaceRange);
			const entireModifiedRange = this._workingCopySummarizedDoc.originalDocumentTransformer.toRange(entireModifiedRangeOffsets);
			const store = {
				lastDocumentContent: this._workingCopySummarizedDoc.originalText,
				lastWholeRange: entireModifiedRange,
			} satisfies ISessionTurnStorage;

			_outputStream.textEdit(this._uri, additionalImportsEdits);
			context.storeInInlineSession(store);
			return;
		}

		if (additionalImports.length > 0) {
			// No edits, but imports encountered
			_outputStream.textEdit(this._uri, this._generateAdditionalImportsEdits(additionalImports));
			return;
		}

		if (didNoopEdits) {
			// we attempted to do edits, but they were not meaningful, i.e. they didn't change anything
			context.addAnnotations([{ label: OutcomeAnnotationLabel.NOOP_EDITS, message: 'Edits were not applied because they were having no actual effects.', severity: 'info' }]);
			return;
		}

		if (!this._lastText) {
			return;
		}

		outputStream.markdown(this._lastText);
	}

	private _generateAdditionalImportsEdits(additionalImports: string[]): vscode.TextEdit[] {
		if (additionalImports.length === 0) {
			return [];
		}

		const documentLines = this._workingCopySummarizedDoc.originalText.split(/\r\n|\r|\n/g);
		const lastImportStatementLineIdx = findLastIdx(documentLines, l => isImportStatement(l, this._workingCopySummarizedDoc.languageId));
		if (lastImportStatementLineIdx === -1) {
			// no existing import statements, we insert it on line 0
			return [new TextEdit(new Range(0, 0, 0, 0), additionalImports.join('\n') + '\n\n')];
		}

		// traverse lines upward starting at `lastImportStatementLineIdx` to capture all existing imports
		const existingImports = new Set<string>();
		for (let i = lastImportStatementLineIdx; i >= 0; i--) {
			const line = documentLines[i];
			if (line.trim() === '') { // skip empty lines
				continue;
			}
			if (isImportStatement(line, this._workingCopySummarizedDoc.languageId)) {
				existingImports.add(trimLeadingWhitespace(line));
			} else {
				break;
			}
		}

		additionalImports = additionalImports.filter(i => !existingImports.has(i));
		if (additionalImports.length === 0) {
			return [];
		}

		const lastImportStatementLineLength = documentLines[lastImportStatementLineIdx].length;
		return [new TextEdit(new Range(lastImportStatementLineIdx, lastImportStatementLineLength, lastImportStatementLineIdx, lastImportStatementLineLength), '\n' + additionalImports.join('\n'))];
	}
}
