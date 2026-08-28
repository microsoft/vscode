/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { CharCode } from '../../../util/vs/base/common/charCode';
import { Constants } from '../../../util/vs/base/common/uint';
import { Range, TextEdit } from '../../../vscodeTypes';
import { looksLikeCode } from '../common/codeGuesser';
import { isImportStatement } from '../common/importStatement';
import { EditStrategy, Lines, trimLeadingWhitespace } from './editGeneration';
import { computeIndentLevel2, guessIndentation, normalizeIndentation } from './indentationGuesser';

export interface IStreamingEditsStrategy {
	processStream(stream: AsyncIterable<LineOfText>): Promise<StreamingEditsResult>;
}

export interface IStreamingEditsStrategyFactory {
	(lineFilter: ILineFilter, streamingWorkingCopyDocument: StreamingWorkingCopyDocument): IStreamingEditsStrategy;
}

export class InsertOrReplaceStreamingEdits implements IStreamingEditsStrategy {

	private replyIndentationTracker: ReplyIndentationTracker | null = null;

	constructor(
		private readonly myDocument: StreamingWorkingCopyDocument,
		private readonly initialSelection: vscode.Range,
		private readonly adjustedSelection: vscode.Range,
		private readonly editStrategy: EditStrategy,
		private readonly collectImports: boolean = true,
		private readonly lineFilter: ILineFilter = LineFilters.noop,
	) {
	}

	public async processStream(_stream: AsyncIterable<LineOfText>): Promise<StreamingEditsResult> {
		// console.log();
		// console.log();
		let stream = AsyncIterableObject.filter(_stream, this.lineFilter);
		if (this.collectImports) {
			stream = collectImportsIfNoneWereSentInRange(stream, this.myDocument, this.adjustedSelection);
		}

		let anchorLineIndex = this.myDocument.firstSentLineIndex;

		for await (const el of this.findInitialAnchor(stream)) {
			if (el instanceof LineWithAnchorInfo) {
				anchorLineIndex = this.handleFirstReplyLine(el.anchor, el.line);
			} else {
				anchorLineIndex = this.handleSubsequentReplyLine(anchorLineIndex, el.value);
			}
		}

		if (this.myDocument.didReplaceEdits && anchorLineIndex <= this.adjustedSelection.end.line) {
			// anchorIndex hasn't reached the end of the ICodeContextInfo.range
			// Emit a deletion of all remaining lines in the selection block
			this.myDocument.deleteLines(anchorLineIndex, this.adjustedSelection.end.line);
		}

		return new StreamingEditsResult(
			this.myDocument.didNoopEdits,
			this.myDocument.didEdits,
			this.myDocument.additionalImports
		);
	}

	private handleFirstReplyLine(anchor: MatchedDocumentLine | null, line: string): number {

		if (anchor) {
			this.replyIndentationTracker = new ReplyIndentationTracker(this.myDocument, anchor.lineIndex, line);
			const fixedLine = this.replyIndentationTracker.reindent(line, this.myDocument.indentStyle);
			if (this.myDocument.getLine(anchor.lineIndex).sentInCodeBlock === SentInCodeBlock.Range) {
				// Matched a line in the range => replace the entire sent range
				return this.myDocument.replaceLines(this.adjustedSelection.start.line, anchor.lineIndex, fixedLine);
			} else {
				return this.myDocument.replaceLine(anchor.lineIndex, fixedLine);
			}
		}

		// No anchor found
		const firstRangeLine = this.adjustedSelection.start.line;
		this.replyIndentationTracker = new ReplyIndentationTracker(this.myDocument, firstRangeLine, line);
		const fixedLine = this.replyIndentationTracker.reindent(line, this.myDocument.indentStyle);

		if (this.initialSelection.isEmpty) {
			const cursorLineContent = this.myDocument.getLine(firstRangeLine).content;
			if (
				/^\s*$/.test(cursorLineContent)
				|| fixedLine.adjustedContent.startsWith(cursorLineContent)
			) {
				// Cursor sitting on an empty or whitespace only line or the reply continues the line
				return this.myDocument.replaceLine(firstRangeLine, fixedLine, /*isPreserving*/true);
			}
		}

		if (this.editStrategy === EditStrategy.FallbackToInsertAboveRange) {
			return this.myDocument.insertLineBefore(firstRangeLine, fixedLine);
		}
		if (this.editStrategy === EditStrategy.FallbackToInsertBelowRange || this.editStrategy === EditStrategy.ForceInsertion) {
			return this.myDocument.insertLineAfter(firstRangeLine, fixedLine);
		}
		// DefaultEditStrategy.ReplaceRange
		return this.myDocument.replaceLine(firstRangeLine, fixedLine);
	}

	private handleSubsequentReplyLine(anchorLineIndex: number, line: string): number {
		const fixedLine = this.replyIndentationTracker!.reindent(line, this.myDocument.indentStyle);

		if (fixedLine.trimmedContent !== '' || this.myDocument.didReplaceEdits) {
			// search for a matching line only if the incoming line is not empty
			// or if we have already made destructive edits
			const matchedLine = this.matchReplyLine(fixedLine, anchorLineIndex);
			if (matchedLine) {
				return this.myDocument.replaceLines(anchorLineIndex, matchedLine.lineIndex, fixedLine);
			}
		}


		if (anchorLineIndex >= this.myDocument.getLineCount()) {
			// end of file => insert semantics!
			return this.myDocument.appendLineAtEndOfDocument(fixedLine);
		}

		const existingLine = this.myDocument.getLine(anchorLineIndex);
		if (!existingLine.isSent || existingLine.content === '' || fixedLine.trimmedContent === '') {
			// line not sent or dealing empty lines => insert semantics!
			return this.myDocument.insertLineBefore(anchorLineIndex, fixedLine);
		}

		if (existingLine.indentLevel < fixedLine.adjustedIndentLevel) {
			// do not leave current scope with the incoming line
			return this.myDocument.insertLineBefore(anchorLineIndex, fixedLine);
		}

		if (existingLine.indentLevel === fixedLine.adjustedIndentLevel && !this.myDocument.didReplaceEdits) {
			// avoid overwriting sibling scope if no destructive edits have been made so far
			return this.myDocument.insertLineBefore(anchorLineIndex, fixedLine);
		}

		return this.myDocument.replaceLine(anchorLineIndex, fixedLine);
	}

	private matchReplyLine(replyLine: ReplyLine, minimumLineIndex: number): MatchedDocumentLine | null {
		const isVeryShortReplyLine = replyLine.trimmedContent.length <= 3;

		for (let lineIndex = minimumLineIndex; lineIndex < this.myDocument.getLineCount(); lineIndex++) {
			const documentLine = this.myDocument.getLine(lineIndex);
			if (!documentLine.isSent) {
				continue;
			}
			if (documentLine.normalizedContent === replyLine.adjustedContent) {
				// bingo!
				return new MatchedDocumentLine(lineIndex);
			}
			if (documentLine.trimmedContent.length > 0 && documentLine.indentLevel < replyLine.adjustedIndentLevel) {
				// we shouldn't proceed with the search if we need to jump over original code that is more outdented
				return null;
			}
			if (isVeryShortReplyLine && documentLine.trimmedContent.length > 0) {
				// don't jump over original code with content if the reply is very short
				return null;
			}
		}
		return null;
	}

	/**
	 * Waits until at least 10 non-whitespace characters are seen in the stream
	 * Then tries to find a sequence of sent lines that match those first lines in the stream
	 */
	private findInitialAnchor(lineStream: AsyncIterable<LineOfText>): AsyncIterable<LineOfText | LineWithAnchorInfo> {
		return new AsyncIterableObject<LineOfText | LineWithAnchorInfo>(async (emitter) => {
			const accumulatedLines: LineOfText[] = [];
			let accumulatedRealChars = 0; // non whitespace chars
			let anchorFound = false;
			for await (const line of lineStream) {
				if (!anchorFound) {
					accumulatedLines.push(line);
					accumulatedRealChars += line.value.trim().length;
					if (accumulatedRealChars > 10) {
						const anchor = this.searchForEqualSentLines(accumulatedLines);
						anchorFound = true;
						emitter.emitOne(new LineWithAnchorInfo(accumulatedLines[0].value, anchor));
						emitter.emitMany(accumulatedLines.slice(1));
					}
				} else {
					emitter.emitOne(line);
				}
			}
		});
	}

	/**
	 * Search for a contiguous set of lines in the document that match the lines.
	 * The equality is done with trimmed content.
	 */
	private searchForEqualSentLines(lines: LineOfText[]): MatchedDocumentLine | null {
		const trimmedLines = lines.map(line => line.value.trim());

		for (let i = this.myDocument.firstSentLineIndex, stopAt = this.myDocument.getLineCount() - lines.length; i <= stopAt; i++) {
			if (!this.myDocument.getLine(i).isSent) {
				continue;
			}
			let matchedAllLines = true;
			for (let j = 0; j < trimmedLines.length; j++) {
				const documentLine = this.myDocument.getLine(i + j);
				if (!documentLine.isSent || documentLine.trimmedContent !== trimmedLines[j]) {
					matchedAllLines = false;
					break;
				}
			}
			if (matchedAllLines) {
				return new MatchedDocumentLine(i);
			}
		}
		return null;
	}
}

export class InsertionStreamingEdits implements IStreamingEditsStrategy {

	private replyIndentationTracker: ReplyIndentationTracker | null = null;

	constructor(
		private readonly _myDocument: IStreamingWorkingCopyDocument,
		private readonly _cursorPosition: vscode.Position,
		private readonly _lineFilter: ILineFilter = LineFilters.noop
	) { }

	public async processStream(_stream: AsyncIterable<LineOfText>): Promise<StreamingEditsResult> {
		let stream = AsyncIterableObject.filter(_stream, this._lineFilter);
		stream = collectImportsIfNoneWereSentInRange(stream, this._myDocument, new Range(this._cursorPosition, this._cursorPosition));

		let anchorLineIndex = 0;

		for await (const line of stream) {
			if (!this.replyIndentationTracker) {
				// This is the first line
				anchorLineIndex = this.handleFirstReplyLine(line.value);
			} else {
				anchorLineIndex = this.handleSubsequentReplyLine(anchorLineIndex, line.value);
			}
		}

		return new StreamingEditsResult(
			this._myDocument.didNoopEdits,
			this._myDocument.didEdits,
			this._myDocument.additionalImports,
		);
	}

	private handleFirstReplyLine(replyLine: string): number {

		const firstRangeLine = this._cursorPosition.line;

		const cursorLineContent = this._myDocument.getLine(firstRangeLine).content;

		// Cursor sitting on an empty or whitespace only line or the reply continues the line
		const shouldLineBeReplaced = /^\s*$/.test(cursorLineContent) || replyLine.trimStart().startsWith(cursorLineContent.trimStart());

		const lineNumForIndentGuessing = shouldLineBeReplaced // @ulugbekna: if we are insert line "after" (ie using `insertLineAfter`) we should guess indentation starting from where we insert the line
			? firstRangeLine
			: (this._myDocument.getLineCount() <= firstRangeLine + 1 ? firstRangeLine : firstRangeLine + 1);

		this.replyIndentationTracker = new ReplyIndentationTracker(this._myDocument, lineNumForIndentGuessing, replyLine);
		const fixedLine = this.replyIndentationTracker.reindent(replyLine, this._myDocument.indentStyle);

		if (shouldLineBeReplaced) {
			return this._myDocument.replaceLine(firstRangeLine, fixedLine, /*isPreserving*/true);
		}

		return this._myDocument.insertLineAfter(firstRangeLine, fixedLine);
	}

	private handleSubsequentReplyLine(anchorLineIndex: number, line: string): number {
		const fixedLine = this.replyIndentationTracker!.reindent(line, this._myDocument.indentStyle);

		return this._myDocument.insertLineBefore(anchorLineIndex, fixedLine);
	}
}

export class ReplaceSelectionStreamingEdits implements IStreamingEditsStrategy {

	private replyIndentationTracker: ReplyIndentationTracker | null = null;

	constructor(
		private readonly _myDocument: IStreamingWorkingCopyDocument,
		private readonly _selection: vscode.Range,
		private readonly _lineFilter: ILineFilter = LineFilters.noop
	) { }

	public async processStream(_stream: AsyncIterable<LineOfText>): Promise<StreamingEditsResult> {
		let stream = AsyncIterableObject.filter(_stream, this._lineFilter);
		stream = collectImportsIfNoneWereSentInRange(stream, this._myDocument, this._selection);

		let anchorLineIndex = 0;

		let replaceLineCount: number;
		let initialTextOnLineAfterSelection: string = '';
		if (this._selection.end.line > this._selection.start.line && this._selection.end.character === 0) {
			replaceLineCount = this._selection.end.line - this._selection.start.line;
		} else {
			replaceLineCount = this._selection.end.line - this._selection.start.line + 1;
			initialTextOnLineAfterSelection = this._myDocument.getLine(this._selection.end.line).content.substring(this._selection.end.character);
		}

		for await (const line of stream) {
			if (!this.replyIndentationTracker) {
				// This is the first line
				// anchorLineIndex = this.handleFirstReplyLine(line);
				const firstRangeLine = this._selection.start.line;
				this.replyIndentationTracker = new ReplyIndentationTracker(this._myDocument, firstRangeLine, line.value);
				const fixedLine = this.replyIndentationTracker.reindent(line.value, this._myDocument.indentStyle);
				anchorLineIndex = this._myDocument.replaceLine(firstRangeLine, fixedLine);
				replaceLineCount--;
			} else {
				// anchorLineIndex = this.handleSubsequentReplyLine(anchorLineIndex, line);
				const fixedLine = this.replyIndentationTracker!.reindent(line.value, this._myDocument.indentStyle);
				if (replaceLineCount > 0) {
					anchorLineIndex = this._myDocument.replaceLine(anchorLineIndex, fixedLine);
					replaceLineCount--;
				} else {
					anchorLineIndex = this._myDocument.insertLineAfter(anchorLineIndex - 1, fixedLine);
					// anchorLineIndex = this._myDocument.insertLineBefore(anchorLineIndex, fixedLine);
				}
			}
		}

		if (this._myDocument.didEdits && replaceLineCount > 0) {
			this._myDocument.deleteLines(anchorLineIndex, anchorLineIndex + replaceLineCount - 1);
		}
		if (this._myDocument.didEdits && initialTextOnLineAfterSelection.length > 0) {
			this._myDocument.replaceLine(anchorLineIndex - 1, this._myDocument.getLine(anchorLineIndex - 1).content + initialTextOnLineAfterSelection);
		}

		return new StreamingEditsResult(
			this._myDocument.didNoopEdits,
			this._myDocument.didEdits,
			this._myDocument.additionalImports
		);
	}
}

/**
 * A filter which can be used to ignore lines from a stream.
 * Returns true if the line should be kept.
 */
export interface ILineFilter {
	(line: LineOfText): boolean;
}

export class StreamingEditsResult {
	constructor(
		public readonly didNoopEdits: boolean,
		public readonly didEdits: boolean,
		public readonly additionalImports: string[],
	) { }
}

/**
 * Keeps track of the indentation of the reply lines and is able to
 * reindent reply lines to match the document, keeping their relative indentation.
 */
class ReplyIndentationTracker {

	private _replyIndentStyle: vscode.FormattingOptions | undefined;
	private indentDelta: number;

	constructor(
		document: IStreamingWorkingCopyDocument,
		documentLineIdx: number,
		replyLine: string
	) {
		let docIndentLevel = 0;
		for (let i = documentLineIdx; i >= 0; i--) {
			const documentLine = document.getLine(i);
			// Use the indent of the first non-empty line
			if (documentLine.content.length > 0) {
				docIndentLevel = documentLine.indentLevel;
				if (i !== documentLineIdx) {
					// The first non-empty line is not the current line, indent if necessary
					if (
						documentLine.content.endsWith('{') ||
						(document.languageId === 'python' && documentLine.content.endsWith(':'))
					) {
						// TODO: this is language specific
						docIndentLevel += 1;
					}
				}
				break;
			}
		}

		this._replyIndentStyle = IndentUtils.guessIndentStyleFromLine(replyLine);
		const replyIndentLevel = computeIndentLevel2(replyLine, this._replyIndentStyle?.tabSize ?? 4);

		this.indentDelta = replyIndentLevel - docIndentLevel;
	}

	public reindent(replyLine: string, desiredStyle: vscode.FormattingOptions): ReplyLine {
		if (replyLine === '') {
			// Do not indent empty lines artificially
			return new ReplyLine('', 0, '', 0);
		}

		if (!this._replyIndentStyle) {
			this._replyIndentStyle = IndentUtils.guessIndentStyleFromLine(replyLine);
		}

		let originalIndentLevel = 0;
		let adjustedIndentLevel = 0;
		const determineAdjustedIndentLevel = (currentIndentLevel: number) => {
			originalIndentLevel = currentIndentLevel;
			adjustedIndentLevel = Math.max(originalIndentLevel - this.indentDelta, 0);
			return adjustedIndentLevel;
		};
		const adjustedContent = IndentUtils.reindentLine(replyLine, this._replyIndentStyle ?? { insertSpaces: true, tabSize: 4 }, desiredStyle, determineAdjustedIndentLevel);

		return new ReplyLine(replyLine, originalIndentLevel, adjustedContent, adjustedIndentLevel);
	}
}

class LineWithAnchorInfo {
	constructor(
		readonly line: string,
		readonly anchor: MatchedDocumentLine | null,
	) { }
}

export class SentLine {
	constructor(
		readonly lineIndex: number,
		readonly sentInCodeBlock: SentInCodeBlock.Above | SentInCodeBlock.Range | SentInCodeBlock.Below | SentInCodeBlock.Other
	) { }
}

export class LineRange {
	constructor(
		readonly startLineIndex: number,
		readonly endLineIndex: number
	) { }
}

export interface IStreamingWorkingCopyDocument {
	readonly languageId: string;
	readonly indentStyle: vscode.FormattingOptions;
	readonly didNoopEdits: boolean;
	readonly didEdits: boolean;
	readonly additionalImports: string[];

	getLineCount(): number;
	getLine(index: number): DocumentLine;
	addAdditionalImport(importStatement: string): void;
	replaceLine(index: number, line: ReplyLine | string, isPreserving?: boolean): number;
	replaceLines(fromIndex: number, toIndex: number, line: ReplyLine): number;
	appendLineAtEndOfDocument(line: ReplyLine): number;
	insertLineAfter(index: number, line: ReplyLine): number;
	insertLineBefore(index: number, line: ReplyLine): number;
	deleteLines(fromIndex: number, toIndex: number): number;
}

/**
 * Keeps track of the current document with edits applied immediately.
 */
export class StreamingWorkingCopyDocument implements IStreamingWorkingCopyDocument {

	public readonly indentStyle: vscode.FormattingOptions;
	private readonly _originalLines: string[] = [];
	private lines: DocumentLine[] = [];
	public readonly firstSentLineIndex: number;
	private _didNoopEdits = false;
	private _didEdits = false;
	private _didReplaceEdits = false;
	private readonly _additionalImports: string[] = [];

	public get didNoopEdits(): boolean {
		return this._didNoopEdits;
	}

	public get didEdits(): boolean {
		return this._didEdits;
	}

	public get didReplaceEdits(): boolean {
		return this._didReplaceEdits;
	}

	public get additionalImports(): string[] {
		return this._additionalImports;
	}

	constructor(
		private readonly outputStream: vscode.ChatResponseStream,
		private readonly uri: vscode.Uri,
		sourceCode: string,
		sentLines: SentLine[],
		selection: LineRange,
		public readonly languageId: string,
		fileIndentInfo: vscode.FormattingOptions | undefined
	) {
		// console.info(`---------\nNEW StreamingWorkingCopyDocument`);
		this.indentStyle = IndentUtils.getDocumentIndentStyle(sourceCode, fileIndentInfo);

		this._originalLines = sourceCode.split(/\r\n|\r|\n/g);
		for (let i = 0; i < this._originalLines.length; i++) {
			this.lines[i] = new DocumentLine(this._originalLines[i], this.indentStyle);
		}

		this.firstSentLineIndex = Number.MAX_SAFE_INTEGER;
		for (const sentLine of sentLines) {
			this.lines[sentLine.lineIndex].markSent(sentLine.sentInCodeBlock);
			this.firstSentLineIndex = Math.min(this.firstSentLineIndex, sentLine.lineIndex);
		}

		this.firstSentLineIndex = Math.min(this.firstSentLineIndex, selection.startLineIndex);
	}

	public getText(): string {
		return this.lines.map(line => line.content).join('\n');
	}

	public getLineCount(): number {
		return this.lines.length;
	}

	public getLine(index: number): DocumentLine {
		if (index < 0 || index >= this.lines.length) {
			throw new Error(`Invalid index`);
		}
		return this.lines[index];
	}

	public addAdditionalImport(importStatement: string): void {
		this._additionalImports.push(importStatement);
	}

	public replaceLine(index: number, line: ReplyLine | string, isPreserving: boolean = false): number {
		const newLineContent = typeof line === 'string' ? line : line.adjustedContent;
		// console.info(`replaceLine(${index}, ${this.lines[index].content}, ${newLineContent})`);
		if (this.lines[index].content === newLineContent) {
			this._didNoopEdits = true;
			// no need to really replace the line
			return index + 1;
		}
		this.lines[index] = new DocumentLine(newLineContent, this.indentStyle);
		this.outputStream.textEdit(this.uri, [new TextEdit(new Range(index, 0, index, Constants.MAX_SAFE_SMALL_INTEGER), newLineContent)]);
		this._didEdits = true;
		this._didReplaceEdits = this._didReplaceEdits || (isPreserving ? false : true);
		return index + 1;
	}

	public replaceLines(fromIndex: number, toIndex: number, line: ReplyLine): number {
		if (fromIndex > toIndex) {
			throw new Error(`Invalid range`);
		}
		if (fromIndex === toIndex) {
			return this.replaceLine(fromIndex, line);
		}
		// console.info(`replaceLines(${fromIndex}, ${toIndex}, ${line.adjustedContent})`);
		this.lines.splice(fromIndex, toIndex - fromIndex + 1, new DocumentLine(line.adjustedContent, this.indentStyle));
		this.outputStream.textEdit(this.uri, [new TextEdit(new Range(fromIndex, 0, toIndex, Constants.MAX_SAFE_SMALL_INTEGER), line.adjustedContent)]);
		this._didEdits = true;
		this._didReplaceEdits = true;
		return fromIndex + 1;
	}

	public appendLineAtEndOfDocument(line: ReplyLine): number {
		// console.info(`appendLine(${line.adjustedContent})`);
		this.lines.push(new DocumentLine(line.adjustedContent, this.indentStyle));
		this.outputStream.textEdit(this.uri, [new TextEdit(new Range(this.lines.length - 1, Constants.MAX_SAFE_SMALL_INTEGER, this.lines.length - 1, Constants.MAX_SAFE_SMALL_INTEGER), '\n' + line.adjustedContent)]);
		this._didEdits = true;
		return this.lines.length;
	}

	public insertLineAfter(index: number, line: ReplyLine): number {
		// console.info(`insertLineAfter(${index}, ${this.lines[index].content}, ${line.adjustedContent})`);
		this.lines.splice(index + 1, 0, new DocumentLine(line.adjustedContent, this.indentStyle));
		this.outputStream.textEdit(this.uri, [new TextEdit(new Range(index, Constants.MAX_SAFE_SMALL_INTEGER, index, Constants.MAX_SAFE_SMALL_INTEGER), '\n' + line.adjustedContent)]);
		this._didEdits = true;
		return index + 2;
	}

	public insertLineBefore(index: number, line: ReplyLine): number {
		if (index === this.lines.length) {
			// we must insert after the last line
			return this.insertLineAfter(index - 1, line);
		}
		// console.info(`insertLineBefore(${index}, ${this.lines[index].content}, ${line.adjustedContent})`);
		this.lines.splice(index, 0, new DocumentLine(line.adjustedContent, this.indentStyle));
		this.outputStream.textEdit(this.uri, [new TextEdit(new Range(index, 0, index, 0), line.adjustedContent + '\n')]);
		this._didEdits = true;
		return index + 1;
	}

	public deleteLines(fromIndex: number, toIndex: number): number {
		// console.info(`deleteLines(${fromIndex}, ${toIndex})`);
		this.lines.splice(fromIndex, toIndex - fromIndex + 1);
		this.outputStream.textEdit(this.uri, [new TextEdit(new Range(fromIndex, 0, toIndex + 1, 0), '')]); // TODO: what about end of document??
		this._didEdits = true;
		this._didReplaceEdits = true;
		return fromIndex + 1;
	}
}

class ReplyLine {
	public readonly trimmedContent: string = this.originalContent.trim();

	constructor(
		public readonly originalContent: string, // as returned from the LLM
		public readonly originalIndentLevel: number,
		public readonly adjustedContent: string, // adjusted for insertion in the document
		public readonly adjustedIndentLevel: number
	) { }
}

class MatchedDocumentLine {
	constructor(
		public readonly lineIndex: number
	) { }
}

export const enum SentInCodeBlock {
	None,
	Above,
	Range,
	Below,
	Other,
}

class DocumentLine {

	private _sentInCodeBlock: SentInCodeBlock = SentInCodeBlock.None;
	public get isSent(): boolean {
		return this._sentInCodeBlock !== SentInCodeBlock.None;
	}
	public get sentInCodeBlock(): SentInCodeBlock {
		return this._sentInCodeBlock;
	}

	private _trimmedContent: string | null = null;
	public get trimmedContent(): string {
		if (this._trimmedContent === null) {
			this._trimmedContent = this.content.trim();
		}
		return this._trimmedContent;
	}

	private _normalizedContent: string | null = null;
	public get normalizedContent(): string {
		if (this._normalizedContent === null) {
			this._normalizedContent = normalizeIndentation(this.content, this._indentStyle.tabSize, this._indentStyle.insertSpaces);
		}
		return this._normalizedContent;
	}

	private _indentLevel: number = -1;
	public get indentLevel(): number {
		if (this._indentLevel === -1) {
			this._indentLevel = computeIndentLevel2(this.content, this._indentStyle.tabSize);
		}
		return this._indentLevel;
	}

	constructor(
		public readonly content: string,
		private readonly _indentStyle: vscode.FormattingOptions
	) { }

	public markSent(sentInCodeBlock: SentInCodeBlock): void {
		this._sentInCodeBlock = sentInCodeBlock;
	}
}

class IndentUtils {

	public static getDocumentIndentStyle(sourceCode: string, fileIndentInfo: vscode.FormattingOptions | undefined): vscode.FormattingOptions {
		if (fileIndentInfo) {
			// the indentation is known
			return fileIndentInfo;
		}

		// we need to detect the indentation
		return <vscode.FormattingOptions>guessIndentation(Lines.fromString(sourceCode), 4, false);
	}

	public static guessIndentStyleFromLine(line: string): vscode.FormattingOptions | undefined {
		const leadingWhitespace = IndentUtils._getLeadingWhitespace(line);
		if (leadingWhitespace === '' || leadingWhitespace === ' ') {
			// insufficient information
			return undefined;
		}
		return <vscode.FormattingOptions>guessIndentation([line], 4, false);
	}

	public static reindentLine(line: string, originalIndentStyle: vscode.FormattingOptions, desiredIndentStyle: vscode.FormattingOptions, getDesiredIndentLevel: (currentIndentLevel: number) => number = (n) => n): string {
		let indentLevel = computeIndentLevel2(line, originalIndentStyle.tabSize);
		const desiredIndentLevel = getDesiredIndentLevel(indentLevel);

		// First we outdent to 0 and then we indent to the desired level
		// This ensures that we normalize indentation in the process and that we
		// maintain any trailing spaces at the end of the tab stop
		while (indentLevel > 0) {
			line = this._outdent(line, originalIndentStyle);
			indentLevel--;
		}

		while (indentLevel < desiredIndentLevel) {
			line = '\t' + line;
			indentLevel++;
		}

		return normalizeIndentation(line, desiredIndentStyle.tabSize, desiredIndentStyle.insertSpaces);
	}

	private static _outdent(line: string, indentStyle: vscode.FormattingOptions): string {
		let chrIndex = 0;
		while (chrIndex < line.length) {
			const chr = line.charCodeAt(chrIndex);
			if (chr === CharCode.Tab) {
				// consume the tab and stop
				chrIndex++;
				break;
			}
			if (chr !== CharCode.Space) {
				// never remove non whitespace characters
				break;
			}
			if (chrIndex === indentStyle.tabSize) {
				// reached the maximum number of spaces
				break;
			}
			chrIndex++;
		}
		return line.substring(chrIndex);
	}

	/**
	 * Gets all whitespace characters at the start of a string.
	 */
	private static _getLeadingWhitespace(line: string): string {
		for (let i = 0; i < line.length; i++) {
			const char = line.charCodeAt(i);
			if (char !== 32 && char !== 9) { // 32 is ASCII for space and 9 is ASCII for tab
				return line.substring(0, i);
			}
		}
		return line;
	}
}

export class LineFilters {

	public static combine(...filters: (ILineFilter | undefined)[]): ILineFilter {
		return (line: LineOfText) => filters.every(filter => filter ? filter(line) : true);
	}

	public static noop: ILineFilter = () => true;

	/**
	 * Keeps only lines that are inside ``` code blocks.
	 */
	public static createCodeBlockFilter(): ILineFilter {
		const enum State {
			BeforeCodeBlock,
			InCodeBlock,
			AfterCodeBlock
		}
		let state = State.BeforeCodeBlock;
		return (line: LineOfText) => {
			if (state === State.BeforeCodeBlock) {
				if (/^```/.test(line.value)) {
					state = State.InCodeBlock;
				}
				return false;
			}
			if (state === State.InCodeBlock) {
				if (/^```/.test(line.value)) {
					state = State.AfterCodeBlock;
					return false;
				}
				return true;
			}
			// text after code block
			return false;
		};
	}
}

/**
 * A line of text. Does not include the newline character.
 */
export class LineOfText {
	readonly __lineOfTextBrand: void = undefined;
	public readonly value: string;
	constructor(
		value: string
	) {
		this.value = value.replace(/\r$/, '');
	}
}

export const enum TextPieceKind {
	/**
	 * A text piece that appears outside a code block
	 */
	OutsideCodeBlock,
	/**
	 * A text piece that appears inside a code block
	 */
	InsideCodeBlock,
	/**
	 * A text piece that is a delimiter
	 */
	Delimiter,
}

export class ClassifiedTextPiece {
	constructor(
		public readonly value: string,
		public readonly kind: TextPieceKind
	) { }
}

/**
 * Can classify pieces of text into different kinds.
 */
export interface IStreamingTextPieceClassifier {
	(textSource: AsyncIterable<string>): AsyncIterableObject<ClassifiedTextPiece>;
}

export class TextPieceClassifiers {
	/**
	 * Classifies lines using ``` code blocks.
	 */
	public static createCodeBlockClassifier(): IStreamingTextPieceClassifier {
		return TextPieceClassifiers.attemptToRecoverFromMissingCodeBlock(
			TextPieceClassifiers.createFencedBlockClassifier('```')
		);
	}

	private static attemptToRecoverFromMissingCodeBlock(classifier: IStreamingTextPieceClassifier): IStreamingTextPieceClassifier {
		return (source: AsyncIterable<string>) => {
			return new AsyncIterableObject<ClassifiedTextPiece>(async (emitter) => {
				// We buffer all pieces until the first code block, then
				// we open the gate and start emitting all pieces immediately.
				const bufferedPieces: ClassifiedTextPiece[] = [];
				let sawOnlyLeadingText = true;
				for await (const piece of classifier(source)) {
					if (!sawOnlyLeadingText) {
						emitter.emitOne(piece);
					} else if (piece.kind === TextPieceKind.OutsideCodeBlock) {
						bufferedPieces.push(piece);
					} else {
						sawOnlyLeadingText = false;
						for (const p of bufferedPieces) {
							emitter.emitOne(p);
						}
						bufferedPieces.length = 0;
						emitter.emitOne(piece);
					}
				}

				// if we never found a code block, we emit all pieces at the end
				if (sawOnlyLeadingText) {
					const allText = bufferedPieces.map(p => p.value).join('');
					if (looksLikeCode(allText)) {
						emitter.emitOne(new ClassifiedTextPiece(allText, TextPieceKind.InsideCodeBlock));
					} else {
						emitter.emitOne(new ClassifiedTextPiece(allText, TextPieceKind.OutsideCodeBlock));
					}
				}
			});
		};
	}

	/**
	 * Classifies lines using fenced blocks with the provided fence.
	 */
	public static createAlwaysInsideCodeBlockClassifier(): IStreamingTextPieceClassifier {
		return (source: AsyncIterable<string>) => {
			return AsyncIterableObject.map(source, line => new ClassifiedTextPiece(line, TextPieceKind.InsideCodeBlock));
		};
	}

	/**
	 * Classifies lines using fenced blocks with the provided fence.
	 */
	public static createFencedBlockClassifier(fence: string): IStreamingTextPieceClassifier {
		return (source: AsyncIterable<string>) => {
			return new AsyncIterableObject<ClassifiedTextPiece>(async (emitter) => {
				const reader = new PartialAsyncTextReader(source[Symbol.asyncIterator]());

				let state = TextPieceKind.OutsideCodeBlock;

				while (!reader.endOfStream) {

					const text = await reader.peek(fence.length);

					if (text !== fence) {

						// consume and emit immediately all pieces until newline or end of stream
						while (!reader.endOfStream) {
							// we want to consume any piece that is available in order to emit it immediately
							const piece = reader.readImmediateExcept('\n');
							if (piece.length > 0) {
								emitter.emitOne(new ClassifiedTextPiece(piece, state));
							}
							const nextChar = await reader.peek(1);
							if (nextChar === '\n') {
								reader.readImmediate(1);
								emitter.emitOne(new ClassifiedTextPiece('\n', state));
								break;
							}
						}

					} else {

						const lineWithFence = await reader.readLineIncludingLF();
						state = state === TextPieceKind.InsideCodeBlock ? TextPieceKind.OutsideCodeBlock : TextPieceKind.InsideCodeBlock;
						emitter.emitOne(new ClassifiedTextPiece(lineWithFence, TextPieceKind.Delimiter));

					}
				}
			});
		};
	}

}

export class PartialAsyncTextReader {

	private _buffer: string = '';
	private _atEnd = false;

	public get endOfStream(): boolean { return this._buffer.length === 0 && this._atEnd; }

	constructor(
		private readonly _source: AsyncIterator<string>
	) {
	}

	private async extendBuffer(): Promise<void> {
		if (this._atEnd) {
			return;
		}
		const { value, done } = await this._source.next();
		if (done) {
			this._atEnd = true;
		} else {
			this._buffer += value;
		}
	}

	/**
	 * Waits until n characters are available in the buffer or the end of the stream is reached.
	 */
	async waitForLength(n: number): Promise<void> {
		while (this._buffer.length < n && !this._atEnd) {
			await this.extendBuffer();
		}
	}

	/**
	 * Peeks `n` characters or less if the stream ends.
	 */
	async peek(n: number): Promise<string> {
		await this.waitForLength(n);
		return this._buffer.substring(0, n);
	}

	/**
	 * Reads `n` characters or less if the stream ends.
	 */
	async read(n: number): Promise<string> {
		await this.waitForLength(n);
		const result = this._buffer.substring(0, n);
		this._buffer = this._buffer.substring(n);
		return result;
	}

	/**
	 * Read all available characters until `char`
	 */
	async readUntil(char: string): Promise<string> {
		let result = '';
		while (!this.endOfStream) {
			const piece = this.readImmediateExcept(char);
			result += piece;
			const nextChar = await this.peek(1);

			if (nextChar === char) {
				break;
			}
		}

		return result;
	}

	/**
	 * Read an entire line including \n or until end of stream.
	 */
	async readLineIncludingLF(): Promise<string> {
		// consume all pieces until newline or end of stream
		let line = await this.readUntil('\n');
		// the next char should be \n or we're at end of stream
		line += await this.read(1);
		return line;
	}

	/**
	 * Read an entire line until \n (excluding \n) or until end of stream.
	 * The \n is consumed from the stream
	 */
	async readLine(): Promise<string> {
		// consume all pieces until newline or end of stream
		const line = await this.readUntil('\n');
		// the next char should be \n or we're at end of stream
		await this.read(1);
		return line;
	}

	/**
	 * Returns immediately with all available characters until `char`.
	 */
	readImmediateExcept(char: string): string {
		const endIndex = this._buffer.indexOf(char);
		return this.readImmediate(endIndex === -1 ? this._buffer.length : endIndex);
	}

	/**
	 * Returns immediately with all available characters, but at most `n` characters.
	 */
	readImmediate(n: number): string {
		const result = this._buffer.substring(0, n);
		this._buffer = this._buffer.substring(n);
		return result;
	}
}

export class AsyncReaderEndOfStream { }

export class AsyncReader<T> {

	public static EOS = new AsyncReaderEndOfStream();

	private _buffer: T[] = [];
	private _atEnd = false;

	public get endOfStream(): boolean { return this._buffer.length === 0 && this._atEnd; }

	constructor(
		private readonly _source: AsyncIterator<T>
	) {
	}

	private async extendBuffer(): Promise<void> {
		if (this._atEnd) {
			return;
		}
		const { value, done } = await this._source.next();
		if (done) {
			this._atEnd = true;
		} else {
			this._buffer.push(value);
		}
	}

	public async peek(): Promise<T | AsyncReaderEndOfStream> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await this.extendBuffer();
		}
		if (this._buffer.length === 0) {
			return AsyncReader.EOS;
		}
		return this._buffer[0];
	}

	public async read(): Promise<T | AsyncReaderEndOfStream> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await this.extendBuffer();
		}
		if (this._buffer.length === 0) {
			return AsyncReader.EOS;
		}
		return this._buffer.shift()!;
	}

	public async readWhile(predicate: (value: T) => boolean, callback: (element: T) => unknown): Promise<void> {
		do {
			const piece = await this.peek();
			if (piece instanceof AsyncReaderEndOfStream) {
				break;
			}
			if (!predicate(piece)) {
				break;
			}
			await this.read(); // consume
			await callback(piece);
		} while (true);
	}

	public async consumeToEnd(): Promise<void> {
		while (!this.endOfStream) {
			await this.read();
		}
	}
}

/**
 * Split an incoming stream of text to a stream of lines.
 */
export function streamLines(source: AsyncIterable<string>): AsyncIterableObject<LineOfText> {
	return new AsyncIterableObject<LineOfText>(async (emitter) => {
		let buffer = '';
		for await (const str of source) {
			buffer += str;
			do {
				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex === -1) {
					break;
				}

				// take the first line
				const line = buffer.substring(0, newlineIndex);
				buffer = buffer.substring(newlineIndex + 1);

				emitter.emitOne(new LineOfText(line));
			} while (true);
		}

		if (buffer.length > 0) {
			// last line which doesn't end with \n
			emitter.emitOne(new LineOfText(buffer));
		}
	});
}

function hasImportsInRange(doc: IStreamingWorkingCopyDocument, range: vscode.Range): boolean {
	const startLine = (range.start.character === 0 ? range.start.line : range.start.line + 1);
	const endLine = (doc.getLine(range.end.line).content.length === range.end.character ? range.end.line : range.end.line - 1);
	for (let i = startLine; i <= endLine; i++) {
		if (isImportStatement(doc.getLine(i).content, doc.languageId)) {
			return true;
		}
	}
	return false;
}

function collectImportsIfNoneWereSentInRange(stream: AsyncIterableObject<LineOfText>, doc: IStreamingWorkingCopyDocument, rangeToCheckForImports: vscode.Range): AsyncIterableObject<LineOfText> {
	if (hasImportsInRange(doc, rangeToCheckForImports)) {
		// there are imports in the sent code block
		// no need to collect imports
		return stream;
	}
	// collect imports separately
	let extractedImports = false;
	let hasCode = false;
	return stream.filter(line => {
		if (isImportStatement(line.value, doc.languageId)) {
			doc.addAdditionalImport(trimLeadingWhitespace(line.value));
			extractedImports = true;
			return false;
		}
		const isOnlyWhitespace = (line.value.trim().length === 0);
		if (isOnlyWhitespace && extractedImports) {
			// there are imports in the reply which we have moved up
			// survive the empty line if it is inside code
			return hasCode;
		}
		hasCode = true;
		return true;
	});
}
