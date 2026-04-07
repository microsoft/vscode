/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, ChatResponseReferencePartStatusKind, Document, Image, PromptElement, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import { UserMessage } from '@vscode/prompt-tsx/dist/base/promptElements';
import { AbstractDocumentWithLanguageId } from '../../../../platform/editing/common/abstractText';
import { NotebookDocumentSnapshot } from '../../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { modelSupportsPDFDocuments } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getNotebookAndCellFromUri, getNotebookCellOutput } from '../../../../util/common/notebooks';
import { isUri } from '../../../../util/common/types';
import { CachedFunction } from '../../../../util/vs/base/common/cache';
import { Schemas } from '../../../../util/vs/base/common/network';
import { basename } from '../../../../util/vs/base/common/resources';
import { splitLines } from '../../../../util/vs/base/common/strings';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Location, Position, Range, Uri } from '../../../../vscodeTypes';
import { IPromptEndpoint } from '../base/promptRenderer';
import { Tag } from '../base/tag';
import { SummarizedDocumentLineNumberStyle } from '../inline/summarizedDocument/implementation';
import { ICostFnFactory, ProjectedDocument, RemovableNode } from '../inline/summarizedDocument/summarizeDocument';
import { DocumentSummarizer, NotebookDocumentSummarizer } from '../inline/summarizedDocument/summarizeDocumentHelpers';
import { BinaryFileHexdump, hexdumpIfBinary } from './binaryFileHexdump';
import { CodeBlock } from './safeElements';

export interface FileVariableProps extends BasePromptElementProps {
	variableName: string;
	variableValue: Uri | Location;
	filePathMode?: FilePathMode;
	lineNumberStyle?: SummarizedDocumentLineNumberStyle | 'legacy';
	alwaysIncludeSummary?: boolean;
	omitReferences?: boolean;
	description?: string;
	/**
	 * If true, file contents are omitted and only the file path is included.
	 */
	omitContents?: boolean;
}

export class FileVariable extends PromptElement<FileVariableProps, unknown> {
	constructor(
		props: FileVariableProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IFileSystemService private readonly fileService: IFileSystemService,
		@INotebookService private readonly notebookService: INotebookService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContent: IAlternativeNotebookContentService,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override async render(_state: unknown, sizing: PromptSizing) {
		const uri = 'uri' in this.props.variableValue ? this.props.variableValue.uri : this.props.variableValue;

		if (await this.ignoreService.isCopilotIgnored(uri)) {
			return <ignoredFiles value={[uri]} />;
		}

		if (uri.scheme === 'untitled' && !this.workspaceService.textDocuments.some(doc => doc.uri.toString() === uri.toString())) {
			// A previously open untitled document that isn't open anymore- opening it would open an empty text editor
			return;
		}

		// When omitContents is true, just render the file path without reading the file contents
		if (this.props.omitContents) {
			const filePath = this.promptPathRepresentationService.getFilePath(uri);
			const attrs: Record<string, string> = {};
			if (this.props.variableName) {
				attrs.id = this.props.variableName;
			}
			attrs.filePath = filePath;
			return (
				<Tag name='attachment' attrs={attrs} />
			);
		}

		if (/\.(png|jpg|jpeg|bmp|gif|webp)$/i.test(uri.path)) {
			const options = { status: { description: l10n.t("{0} does not support images.", this.promptEndpoint.model), kind: ChatResponseReferencePartStatusKind.Omitted } };
			if (this.props.omitReferences) {
				return;
			}

			if (!this.promptEndpoint.supportsVision) {
				return (
					<>
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri, undefined, options)]} />
					</>);
			}

			try {
				const buffer = await this.fileService.readFile(uri);
				const base64string = Buffer.from(buffer).toString('base64');
				return (
					<UserMessage priority={0}>
						<Image src={base64string} detail={'high'} />
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri, undefined, options)]} />
					</UserMessage>

				);

			} catch (err) {
				return (
					<>
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri, undefined, options)]} />
					</>);
			}

		}

		if (/\.pdf$/i.test(uri.path)) {
			if (!this.promptEndpoint.supportsVision || !modelSupportsPDFDocuments(this.promptEndpoint)) {
				if (this.props.omitReferences) {
					return;
				}
				const options = { status: { description: l10n.t("{0} does not support PDF documents.", this.promptEndpoint.model), kind: ChatResponseReferencePartStatusKind.Omitted } };
				return (
					<>
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri, undefined, options)]} />
					</>);
			}

			try {
				const buffer = await this.fileService.readFile(uri);

				// Validate PDF magic bytes (%PDF = 0x25 0x50 0x44 0x46)
				if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
					if (this.props.omitReferences) {
						return;
					}
					const options = { status: { description: l10n.t("File is not a valid PDF."), kind: ChatResponseReferencePartStatusKind.Omitted } };
					return (
						<>
							<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri, undefined, options)]} />
						</>);
				}

				const base64string = Buffer.from(buffer).toString('base64');
				return (
					<UserMessage priority={0}>
						<Document data={base64string} mediaType='application/pdf' />
						{!this.props.omitReferences && <references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri)]} />}
					</UserMessage>
				);
			} catch (err) {
				if (this.props.omitReferences) {
					return;
				}
				const options = { status: { description: l10n.t("Failed to read PDF file."), kind: ChatResponseReferencePartStatusKind.Omitted } };
				return (
					<>
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri, undefined, options)]} />
					</>);
			}
		}

		const binary = await hexdumpIfBinary(this.fileService, uri, { openTextDocuments: this.workspaceService.textDocuments });
		if (binary) {
			return <BinaryFileHexdump uri={uri} data={binary.data} variableName={this.props.variableName} description={this.props.description} omitReferences={this.props.omitReferences} />;
		}

		let range = isUri(this.props.variableValue) ? undefined : this.props.variableValue.range;
		let documentSnapshot: TextDocumentSnapshot | NotebookDocumentSnapshot;
		let fileUri: Uri = uri;

		if (uri.scheme === Schemas.vscodeNotebookCellOutput) {
			// add exception for notebook cell output with image mime type in unsupported endpoint
			const items = getNotebookCellOutput(uri, this.workspaceService.notebookDocuments);
			if (!items) {
				return;
			}
			const outputCell = items[2];
			if (outputCell.items.length > 0 && outputCell.items[0].mime.startsWith('image/') && !this.promptEndpoint.supportsVision) {
				const options = { status: { description: l10n.t("{0} does not support images.", this.promptEndpoint.model), kind: ChatResponseReferencePartStatusKind.Omitted } };
				if (this.props.omitReferences) {
					return;
				}

				return (
					<>
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: this.props.variableValue } : this.props.variableValue, undefined, options)]} />
					</>
				);
			}
		}
		if (uri.scheme === Schemas.vscodeNotebookCell || uri.scheme === Schemas.vscodeNotebookCellOutput) {
			const [notebook, cell] = getNotebookAndCellFromUri(uri, this.workspaceService.notebookDocuments);
			if (!notebook) {
				return;
			}
			fileUri = notebook.uri;
			if (cell) {
				const cellRange = new Range(cell.document.lineAt(0).range.start, cell.document.lineAt(cell.document.lineCount - 1).range.end);
				range = range ?? cellRange;
				// Ensure the range is within the cell range
				if (range.start > cellRange.end || range.end < cellRange.start) {
					range = cellRange;
				}
				const altDocument = this.alternativeNotebookContent.create(this.alternativeNotebookContent.getFormat(this.promptEndpoint)).getAlternativeDocument(notebook);
				//Translate the range to alternative content.
				range = new Range(altDocument.fromCellPosition(cell, range.start), altDocument.fromCellPosition(cell, range.end));
			} else {
				range = undefined;
			}
		}
		try {
			documentSnapshot = this.notebookService.hasSupportedNotebooks(fileUri) ?
				await this.workspaceService.openNotebookDocumentAndSnapshot(fileUri, this.alternativeNotebookContent.getFormat(this.promptEndpoint)) :
				await this.workspaceService.openTextDocumentAndSnapshot(fileUri);
		} catch (err) {
			const options = { status: { description: l10n.t('This file could not be read: {0}', err.message), kind: ChatResponseReferencePartStatusKind.Omitted } };
			if (this.props.omitReferences) {
				return;
			}

			return (
				<>
					<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: this.props.variableValue } : this.props.variableValue, undefined, options)]} />
				</>
			);
		}

		if ((range && (!this.props.alwaysIncludeSummary || range.isEqual(new Range(new Position(0, 0), documentSnapshot.lineAt(documentSnapshot.lineCount - 1).range.end)))) || /\.(svg)$/i.test(uri.path)) {
			// Don't summarize if the file is an SVG, since summarization will almost certainly not work as expected
			return <CodeSelection variableName={this.props.variableName} document={documentSnapshot} range={range} filePathMode={this.props.filePathMode} omitReferences={this.props.omitReferences} description={this.props.description} />;
		}

		if (range) {
			const selectionDesc = this.props.description ? this.props.description : ``;
			const summaryDesc = `User's active file for additional context`;
			return (
				<>
					<CodeSelection variableName={this.props.variableName} document={documentSnapshot} range={range} filePathMode={this.props.filePathMode} omitReferences={this.props.omitReferences} description={selectionDesc} />
					<CodeSummary flexGrow={1} variableName={''} document={documentSnapshot} range={range} filePathMode={this.props.filePathMode} lineNumberStyle={this.props.lineNumberStyle} omitReferences={this.props.omitReferences} description={summaryDesc} />
				</>
			);
		}

		return <CodeSummary variableName={this.props.variableName} document={documentSnapshot} range={range} filePathMode={this.props.filePathMode} lineNumberStyle={this.props.lineNumberStyle} omitReferences={this.props.omitReferences} description={this.props.description} />;
	}
}

interface CodeSelectionProps extends BasePromptElementProps {
	variableName: string;
	document: TextDocumentSnapshot | NotebookDocumentSnapshot;
	range?: Range;
	filePathMode?: FilePathMode;
	omitReferences?: boolean;
	description?: string;
}

class CodeSelection extends PromptElement<CodeSelectionProps, unknown> {

	override async render(_state: unknown, sizing: PromptSizing) {
		const { document, range } = this.props;
		const { uri } = document;
		const references = this.props.omitReferences ? undefined : [new PromptReference(range ? new Location(uri, range) : uri)];
		return (
			<Tag name='attachment' attrs={this.props.variableName ? { id: this.props.variableName } : undefined} >
				{this.props.description ? this.props.description + ':\n' : ''}
				Excerpt from {basename(uri)}{range ? `, lines ${range.start.line + 1} to ${range.end.line + 1}` : ''}:
				<CodeBlock includeFilepath={this.props.filePathMode === FilePathMode.AsComment} languageId={document.languageId} uri={uri} references={references} code={document.getText(range)} />
			</Tag >
		);
	}
}

export enum FilePathMode {
	AsAttribute,
	AsComment,
	None
}

interface CodeSummaryProps extends BasePromptElementProps {
	variableName: string;
	document: TextDocumentSnapshot | NotebookDocumentSnapshot;
	range?: Range;
	filePathMode?: FilePathMode;
	lineNumberStyle?: SummarizedDocumentLineNumberStyle | 'legacy';
	omitReferences?: boolean;
	description?: string;
}

class CodeSummary extends PromptElement<CodeSummaryProps, unknown> {

	constructor(
		props: CodeSummaryProps,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override async render(_state: unknown, sizing: PromptSizing) {
		const { document, range } = this.props;
		const { uri } = document;
		const lineNumberStyle = this.props.lineNumberStyle === 'legacy' ? undefined : this.props.lineNumberStyle;
		const summarized = document instanceof TextDocumentSnapshot ?
			await this.instantiationService.createInstance(DocumentSummarizer).summarizeDocument(document, undefined, range, sizing.tokenBudget, {
				costFnOverride: fileVariableCostFn,
				lineNumberStyle,
			}) :
			await this.instantiationService.createInstance(NotebookDocumentSummarizer).summarizeDocument(document, undefined, range, sizing.tokenBudget, {
				costFnOverride: fileVariableCostFn,
				lineNumberStyle,
			});

		const code = this.props.lineNumberStyle === 'legacy' ? this.includeLineNumbers(summarized) : summarized.text;
		const promptReferenceOptions = !summarized.isOriginal
			? { status: { description: l10n.t('Part of this file was not sent to the model due to context window limitations. Try attaching specific selections from your file instead.'), kind: 2 } }
			: undefined;
		const references = this.props.omitReferences ? undefined : [new PromptReference(uri, undefined, promptReferenceOptions)];
		const attrs: Record<string, string> = {};
		if (this.props.variableName) {
			attrs.id = this.props.variableName;
		}
		if (!summarized.isOriginal) {
			attrs.isSummarized = 'true';
		}
		if (this.props.filePathMode === FilePathMode.AsAttribute) {
			attrs.filePath = this._promptPathRepresentationService.getFilePath(uri);
		}
		return (
			<Tag name='attachment' attrs={attrs} >
				{this.props.description ? this.props.description + ':\n' : ''}
				<CodeBlock includeFilepath={this.props.filePathMode === FilePathMode.AsComment} languageId={document.languageId} uri={uri} references={references} code={code} fence='' />
			</Tag>
		);
	}

	private includeLineNumbers(summarized: ProjectedDocument): string {
		const lines = splitLines(summarized.text);
		const lineNumberWidth = lines.length.toString().length;

		return lines.map((line, index) => {
			let lineNumber: number;
			if (summarized.isOriginal) {
				lineNumber = index;
			} else {
				const offset = summarized.positionOffsetTransformer.getOffset(new Position(index, 0));
				const originalPosition = summarized.originalPositionOffsetTransformer.getPosition(summarized.projectBack(offset));
				lineNumber = originalPosition.line;
			}
			return `${(lineNumber + 1).toString().padStart(lineNumberWidth)}: ${line}`;
		}).join('\n');
	}
}

export const fileVariableCostFn: ICostFnFactory<AbstractDocumentWithLanguageId> = {
	createCostFn(doc) {
		const nodeMultiplier: CachedFunction<RemovableNode, number> = new CachedFunction(node => {
			if (doc.languageId === 'typescript') {
				const parentCost = node.parent ? nodeMultiplier.get(node.parent) : 1;
				const nodeText = node.text.trim();
				if (nodeText.startsWith('private ')) { return parentCost * 1.1; }
				if (nodeText.startsWith('export ') || nodeText.startsWith('public ')) { return parentCost * 0.9; }
			}
			return 1;
		});

		return (node, currentCost) => {
			if (!node) {
				return currentCost;
			}
			if (node.kind === 'import_statement') {
				return 1000; // Include import statements last
			}
			const m = nodeMultiplier.get(node);
			return currentCost * m;
		};
	},
};
