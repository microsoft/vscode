/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken, NotebookCell, NotebookDocument, Position, Uri } from 'vscode';
import { getLanguage } from '../../../util/common/languages';
import { isUri } from '../../../util/common/types';
import { findLast } from '../../../util/vs/base/common/arraysFind';
import { EndOfLine, NotebookCellKind } from '../../../vscodeTypes';
import { BaseAlternativeNotebookContentProvider } from './alternativeContentProvider';
import { AlternativeNotebookDocument } from './alternativeNotebookDocument';
import { EOL, getCellIdMap, getDefaultLanguage, LineOfCellText, LineOfText, summarize, SummaryCell } from './helpers';

export function generateCellTextMarker(cell: SummaryCell, lineComment: string): string {
	const cellIdStr = cell.id ? `[id=${cell.id}] ` : '';
	return `${lineComment}%% vscode.cell ${cellIdStr}[language=${cell.language}]`;
}

export function lineMightHaveCellMarker(line: string) {
	return line.toLowerCase().includes('vscode.cell');
}

class AlternativeTextDocument extends AlternativeNotebookDocument {
	constructor(text: string, private readonly cellOffsetMap: { offset: number; sourceOffset: number; cell: NotebookCell }[], notebook: NotebookDocument) {
		super(text, notebook);
	}

	override fromCellPosition(cell: NotebookCell, position: Position): Position {
		const cellSummary = summarize(cell);
		const lineCommentStart = getLineCommentStart(this.notebook);
		const cellMarker = generateCellTextMarker(cellSummary, lineCommentStart);

		const eolLength = cell.document.eol === EndOfLine.LF ? 1 : 2;
		const blockComment = getBlockComment(this.notebook);
		const alternativeContentText = this.getText();
		const offsetInCell = cell.document.offsetAt(position);
		const markdownOffset = cell.kind === NotebookCellKind.Markup ? blockComment[0].length + eolLength : 0;
		const offset = alternativeContentText.indexOf(cellMarker) + cellMarker.length + eolLength + markdownOffset + offsetInCell;
		return this.positionAt(offset);
	}

	override toCellPosition(position: Position): { cell: NotebookCell; position: Position } | undefined {
		const offset = this.offsetAt(position);
		const cell = findLast(this.cellOffsetMap, (cell) => cell.sourceOffset <= offset);
		if (!cell) {
			return undefined;
		}
		const cellPosition = cell.cell.document.positionAt(offset - cell.sourceOffset);
		return { cell: cell.cell, position: cellPosition };
	}
}


export class AlternativeTextNotebookContentProvider extends BaseAlternativeNotebookContentProvider {
	constructor() {
		super('text');
	}

	public stripCellMarkers(text: string): string {
		const lines = text.split(EOL);
		if (lines.length && lineMightHaveCellMarker(lines[0])) {
			lines.shift();
			return lines.join(EOL);
		} else {
			return text;
		}
	}

	public override getSummaryOfStructure(notebook: NotebookDocument, cellsToInclude: NotebookCell[], existingCodeMarker: string): string {
		const blockComment = getBlockComment(notebook);
		const lineCommentStart = getLineCommentStart(notebook);
		const existingCodeMarkerWithComment = `${lineCommentStart} ${existingCodeMarker}`;
		const lines: string[] = [];
		notebook.getCells().forEach((cell) => {
			if (cellsToInclude.includes(cell)) {
				const cellSummary = summarize(cell);
				if (cellSummary.source.length && cellSummary.source[0].trim().length) {
					cellSummary.source = [cellSummary.source[0], existingCodeMarkerWithComment];
				} else if (cellSummary.source.length && cellSummary.source.some(line => line.trim().length)) {
					cellSummary.source = [existingCodeMarkerWithComment, cellSummary.source.filter(line => line.trim().length)[0], existingCodeMarkerWithComment];
				} else {
					cellSummary.source = [existingCodeMarkerWithComment];
				}
				lines.push(generateAlternativeCellTextContent(cellSummary, lineCommentStart, blockComment).content);
			} else if (!lines.length || lines[lines.length - 1] !== existingCodeMarkerWithComment) {
				lines.push(existingCodeMarkerWithComment);
			}
		});
		return lines.join(EOL);
	}


	public override async *parseAlternateContent(notebookOrUri: NotebookDocument | Uri, inputStream: AsyncIterable<LineOfText>, token: CancellationToken): AsyncIterable<LineOfCellText> {
		const isNotebook = !isUri(notebookOrUri);
		const cellIdMap = isNotebook ? getCellIdMap(notebookOrUri) : new Map<string, NotebookCell>();

		let inMarkdownCell = false;
		let isInTripleQuotes = false;
		let pendingTripleQuotes = false;
		let emittedStart = false;
		let cellIndex = -1;

		const lineCommentStart = getLineCommentStart(isNotebook ? notebookOrUri : undefined);
		const blockComment = getBlockComment(isNotebook ? notebookOrUri : undefined);
		const defaultLanguage = isNotebook ? getLanguage(getDefaultLanguage(notebookOrUri)).languageId : undefined;
		const cellIdsSeen = new Set<string>();
		for await (const lineOfText of inputStream) {
			if (token.isCancellationRequested) {
				break;
			}
			const line = lineOfText.value;

			// Check for new cell delimiter
			// Sometimes LLM returns cells without the `vscode.cell` marker such as .
			const isLineCommentForEmptyCellWithoutCellMarker = line.startsWith(`${lineCommentStart}%% [`) && line.trimEnd().endsWith(']');
			const isLineCommentWithCellMarker = line.startsWith(`${lineCommentStart}%% vscode.cell`);
			// Attempt to extract only if we think we have a cell marker, else we end up doing this for every single line and thats expensive.
			const cellParts = (isLineCommentWithCellMarker || isLineCommentForEmptyCellWithoutCellMarker) ? extractCellParts(line, defaultLanguage) : undefined;
			if ((isLineCommentWithCellMarker || isLineCommentForEmptyCellWithoutCellMarker) && cellParts?.language) {
				if (pendingTripleQuotes) {
					pendingTripleQuotes = false;
				}
				const lineOfCellText: LineOfCellText & { emitted: Boolean } = { index: -1, uri: undefined, language: undefined, kind: NotebookCellKind.Code, emitted: false, type: 'start' };
				lineOfCellText.index = cellIndex += 1;
				lineOfCellText.emitted = false;
				// LLM returns duplicate cell with the same id.
				if (cellParts.id && cellIdMap.get(cellParts.id)?.document.languageId === cellParts.language) {
					if (cellIdsSeen.has(cellParts.id)) {
						cellParts.id = '';
					} else {
						cellIdsSeen.add(cellParts.id);
					}
				} else {
					// Possible duplicate cell with the same id but different language.
					// In such cases, treat them as new cells.
					cellParts.id = '';
				}

				const cell = cellIdMap.get(cellParts.id);
				lineOfCellText.id = cellParts.id;
				lineOfCellText.language = cellParts.language;
				lineOfCellText.uri = cell?.document.uri;
				lineOfCellText.kind = cell?.kind || (lineOfCellText.language === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code);
				inMarkdownCell = lineOfCellText.language === 'markdown';
				isInTripleQuotes = false;

				if (emittedStart) {
					yield { index: cellIndex - 1, type: 'end' };
				}

				emittedStart = true;
				yield lineOfCellText;
				continue;
			}

			if (!emittedStart) {
				continue;
			}
			if (inMarkdownCell) {
				if (!isInTripleQuotes) {
					// Look for the opening triple quotes
					if (line === blockComment[0]) {
						isInTripleQuotes = true;
					} else {
						// lineEmitted = true;
						yield { index: cellIndex, line, type: 'line' };
					}
				} else {
					// We are in triple quotes
					if (line === blockComment[1]) {
						// Closing triple quotes found
						isInTripleQuotes = false;
						pendingTripleQuotes = true;
					} else {
						yield { index: cellIndex, line, type: 'line' };
					}
				}
			} else {
				// Non-markdown cell or default
				yield { index: cellIndex, line, type: 'line' };
			}
		}

		if (emittedStart) {
			yield { index: cellIndex, type: 'end' };
		}
	}

	public override getAlternativeDocumentFromText(text: string, notebook: NotebookDocument): AlternativeNotebookDocument {
		const blockComment = getBlockComment(notebook);
		const lineCommentStart = getLineCommentStart(notebook);
		const cellIdMap = getCellIdMap(notebook);
		const cellOffsetMap: { offset: number; sourceOffset: number; cell: NotebookCell }[] = [];

		// Parse the text to find cell markers and build the offset map
		const lines = text.split(EOL);
		let currentOffset = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const isLineCommentForEmptyCellWithoutCellMarker = line.startsWith(`${lineCommentStart}%% [`) && line.trimEnd().endsWith(']');
			const isLineCommentWithCellMarker = line.startsWith(`${lineCommentStart}%% vscode.cell`);

			if (isLineCommentWithCellMarker || isLineCommentForEmptyCellWithoutCellMarker) {
				const cellParts = extractCellParts(line, undefined);
				if (cellParts) {
					const cell = cellIdMap.get(cellParts.id) || notebook.getCells().find(c =>
						c.document.languageId === cellParts.language &&
						!cellOffsetMap.some(entry => entry.cell === c)
					);

					if (cell) {
						const offset = currentOffset;
						// Calculate sourceOffset: skip the cell marker line and any markdown block comment start
						const eolLength = EOL.length;
						const isMarkdown = cellParts.language === 'markdown';
						const sourceOffset = offset + line.length + eolLength + (isMarkdown ? blockComment[0].length + eolLength : 0);

						cellOffsetMap.push({ offset, sourceOffset, cell });
					}
				}
			}

			currentOffset += line.length + EOL.length;
		}

		return new AlternativeTextDocument(text, cellOffsetMap, notebook);
	}

	public override getAlternativeDocument(notebook: NotebookDocument, excludeMarkdownCells?: boolean): AlternativeNotebookDocument {
		const cells = notebook.getCells().filter(cell => excludeMarkdownCells ? cell.kind !== NotebookCellKind.Markup : true).map(cell => summarize(cell));
		const blockComment = getBlockComment(notebook);
		const lineCommentStart = getLineCommentStart(notebook);
		const cellContent = cells.map(cell => ({ ...generateAlternativeCellTextContent(cell, lineCommentStart, blockComment), cell: notebook.cellAt(cell.index) }));
		const content = cellContent.map(cell => cell.content).join(EOL);
		const cellOffsetMap = cellContent.map(cellContent => {
			const offset = content.indexOf(cellContent.content);
			const sourceOffset = offset + cellContent.prefix.length;
			return { offset, sourceOffset, cell: notebook.cellAt(cellContent.cell.index) };
		});

		return new AlternativeTextDocument(content, cellOffsetMap, notebook);
	}

}

function generateAlternativeCellTextContent(cell: SummaryCell, lineCommentStart: string, blockComment: [string, string]): { content: string; prefix: string } {
	const cellMarker = generateCellTextMarker(cell, lineCommentStart);
	const src = cell.source.join(EOL);
	const prefix = cell.language === 'markdown' ? `${cellMarker}${EOL}${blockComment[0]}${EOL}` : `${cellMarker}${EOL}`;
	const content = cell.language === 'markdown'
		? `${prefix}${src}${EOL}${blockComment[1]}`
		: `${prefix}${src}`;
	return { content, prefix };
}

export function getBlockComment(notebook?: NotebookDocument): [string, string] {
	if (!notebook) {
		return ['"""', '"""'];
	}
	const language = getLanguage(getDefaultLanguage(notebook));
	return language.blockComment ?? ['```', '```'];
}

export function getLineCommentStart(notebook?: NotebookDocument): string {
	if (!notebook) {
		return '#';
	}
	const language = getLanguage(getDefaultLanguage(notebook));
	return language.lineComment.start || '#';
}

function extractCellParts(line: string, defaultLanguage: string | undefined): { id: string; language: string } | undefined {
	const idMatch = line.match(/\[id=(.+?)\]/);
	const languageMatch = line.match(/\[language=(.+?)\]/);
	if (!languageMatch) {
		if (lineMightHaveCellMarker(line) && typeof defaultLanguage === 'string') {
			// If we have a cell marker but no language, we assume the default language.
			return { id: idMatch ? idMatch[1].trim() : '', language: defaultLanguage };
		}
		return;
	}
	return { id: idMatch ? idMatch[1].trim() : '', language: languageMatch[1].trim() };
}
