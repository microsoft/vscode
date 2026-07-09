/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';
import type { Range } from 'vscode';
import { VsCodeTextDocument } from '../../../../../platform/editing/common/abstractText';
import { NotebookDocumentSnapshot } from '../../../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../../../platform/editing/common/textDocumentSnapshot';
import { OverlayNode } from '../../../../../platform/parser/node/nodes';
import { IParserService } from '../../../../../platform/parser/node/parserService';
import { StringEdit } from '../../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../../util/vs/editor/common/core/ranges/offsetRange';
import { getStructure } from '../../../../context/node/resolvers/selectionContextHelpers';
import { getAdjustedSelection } from '../adjustSelection';
import { IDocumentSummarizationItem, ISummarizedDocumentSettings, ProjectedDocument, summarizeDocumentsSync } from './summarizeDocument';

export function getCharLimit(tokensBudget: number): number {
	return tokensBudget * 4; // roughly 4 chars per token
}

/**
 * The selection is first adjusted {@link getAdjustedSelection} and then the document is summarized using the adjusted selection.
*/
export async function adjustSelectionAndSummarizeDocument(
	parserService: IParserService,
	document: TextDocumentSnapshot,
	formattingOptions: vscode.FormattingOptions | undefined,
	selection: Range,
	tokensBudget: number,
	settings?: ISummarizedDocumentSettings
): Promise<{ document: ProjectedDocument; selection: OffsetRange; adjustedSelection: OffsetRange }> {
	const structure = await getStructure(parserService, document, formattingOptions);
	const result = getAdjustedSelection(structure, new VsCodeTextDocument(document), selection);
	const doc = summarizeDocumentSync(getCharLimit(tokensBudget), document, selection, structure, settings);
	return {
		document: doc,
		adjustedSelection: doc.projectOffsetRange(result.adjusted),
		selection: doc.projectOffsetRange(result.original),
	};
}

export class NotebookDocumentSummarizer {
	constructor(
	) { }

	async summarizeDocument(
		document: NotebookDocumentSnapshot,
		_formattingOptions: vscode.FormattingOptions | undefined,
		_selection: Range | undefined,
		_tokensBudget: number,
		_settings?: ISummarizedDocumentSettings
	): Promise<ProjectedDocument> {
		return new ProjectedDocument(document.getText(), StringEdit.empty, document.languageId);
	}
}

export class DocumentSummarizer {
	constructor(
		@IParserService private readonly _parserService: IParserService
	) { }

	summarizeDocument(
		document: TextDocumentSnapshot,
		formattingOptions: vscode.FormattingOptions | undefined,
		selection: Range | undefined,
		tokensBudget: number,
		settings?: ISummarizedDocumentSettings
	): Promise<ProjectedDocument> {
		return summarizeDocument(this._parserService, document, formattingOptions, selection, tokensBudget, settings);
	}
}

export async function summarizeDocument(
	parserService: IParserService,
	document: TextDocumentSnapshot,
	formattingOptions: vscode.FormattingOptions | undefined,
	selection: Range | undefined,
	tokensBudget: number,
	settings?: ISummarizedDocumentSettings
): Promise<ProjectedDocument> {
	const structure = await getStructure(parserService, document, formattingOptions);
	return summarizeDocumentSync(getCharLimit(tokensBudget), document, selection, structure, settings);
}

export function summarizeDocumentSync(
	charLimit: number,
	document: TextDocumentSnapshot,
	selection: Range | undefined,
	overlayNodeRoot: OverlayNode,
	settings: ISummarizedDocumentSettings = {}
): ProjectedDocument {
	const result = summarizeDocumentsSync(charLimit, settings, [{ document, overlayNodeRoot, selection }]);
	return result[0];
}

export interface SummarizeDocumentsItem {
	document: TextDocumentSnapshot;
	formattingOptions: vscode.FormattingOptions | undefined;
	selection: Range | undefined;
}

/**
 * Summarizes multiple tokens against a shared token budget
 */
export async function summarizeDocuments(
	parserService: IParserService,
	documentData: SummarizeDocumentsItem[],
	tokensBudget: number,
	settings?: ISummarizedDocumentSettings
): Promise<ProjectedDocument[]> {

	const items: IDocumentSummarizationItem[] = [];

	await Promise.all(documentData.map(async (data) => {
		const overlayNodeRoot = await getStructure(parserService, data.document, data.formattingOptions);
		items.push({
			document: data.document,
			selection: data.selection,
			overlayNodeRoot
		});
	}));

	return summarizeDocumentsSync(tokensBudget, settings ?? {}, items);
}
