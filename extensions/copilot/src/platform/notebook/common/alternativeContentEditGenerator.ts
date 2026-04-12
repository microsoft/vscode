/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, NotebookCell, NotebookDocument } from 'vscode';
import { isJupyterNotebookUri } from '../../../util/common/notebooks';
import { createServiceIdentifier } from '../../../util/common/services';
import { isUri } from '../../../util/common/types';
import { AsyncIterableObject, AsyncIterableSource, DeferredPromise } from '../../../util/vs/base/common/async';
import { StringSHA1 } from '../../../util/vs/base/common/hash';
import { Constants } from '../../../util/vs/base/common/uint';
import { EndOfLine, NotebookCellData, NotebookCellKind, NotebookEdit, NotebookRange, Range, TextEdit, Uri } from '../../../vscodeTypes';
import { IDiffService } from '../../diff/common/diffService';
import { ILogService } from '../../log/common/logService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { AlternativeContentFormat, IAlternativeNotebookContentService } from './alternativeContent';
import { lineMightHaveCellMarker } from './alternativeContentProvider.text';
import { EOL, getCellId, getCellIdMap, LineOfText } from './helpers';
import { computeDiff } from './notebookDiff';

export type NotebookEditGenerationTelemtryOptions = {
	model: Promise<string> | string | undefined;
	requestId: string | undefined;
	source: NotebookEditGenrationSource;
}

export enum NotebookEditGenrationSource {
	codeMapperEditNotebook = 'codeMapperEditNotebook',
	codeMapperEmptyNotebook = 'codeMapperEmptyNotebook',
	codeMapperFastApply = 'codeMapperFastApply',
	createFile = 'createFile',
	stringReplace = 'stringReplace',
	applyPatch = 'applyPatch',
	newNotebookIntent = 'newNotebookIntent',
}

export const IAlternativeNotebookContentEditGenerator = createServiceIdentifier<IAlternativeNotebookContentEditGenerator>('IAlternativeNotebookContentEditGenerator');
export interface IAlternativeNotebookContentEditGenerator {
	readonly _serviceBrand: undefined;
	generateNotebookEdits(notebookOrUri: NotebookDocument | Uri, lines: AsyncIterable<LineOfText> | string, telemetryOptions: NotebookEditGenerationTelemtryOptions | undefined, token: CancellationToken): AsyncIterable<NotebookEdit | [Uri, TextEdit[]]>;
}

export class AlternativeNotebookContentEditGenerator implements IAlternativeNotebookContentEditGenerator {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IAlternativeNotebookContentService private readonly alternativeContentService: IAlternativeNotebookContentService,
		@IDiffService private readonly diffService: IDiffService,
		@ILogService private readonly logger: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
	}

	private getFormat(firstLine: string): AlternativeContentFormat {
		// if the source starts with `{` or `[`, then its a JSON string,
		// If it starts with `<`, then its an XML string, else text
		// Trim, as we want to ensure we remove any leading/trailing whitespace (e.g. its possible there's empty space between the fence and the content)
		const firstChar = firstLine.trim().substring(0, 1);
		const format = firstChar === '{' ? 'json' : firstChar === '<' ? 'xml' : 'text';
		return format;
	}

	/**
	 * Given a NotebookDocument or Uri, and a cell kind, return the EOL for the new cell.
	 * If the notebook is empty, then return the default EOL.
	 * Else default to the EOL of the first cell of the given kind.
	 * This way we have a consistent EOL for new cells (matching existing cells).
	 */
	private getEOLForNewCell(notebookOrUri: NotebookDocument | Uri, cellKind: NotebookCellKind): string | undefined {
		const eolInExistingCodeCell = isUri(notebookOrUri) ? undefined : (notebookOrUri.getCells().find(c => c.kind === cellKind)?.document.eol ?? undefined);
		return eolInExistingCodeCell ? eolInExistingCodeCell === EndOfLine.LF ? '\n' : '\r\n' : EOL;
	}

	/**
	 * Given a stream of lines for the alternative content, generate the corresponding edits to apply to the notebook document.
	 * We accept a NotebookDocument or a Uri.
	 * This is because its possible the Notebook may not have been created/loaded as of yet.
	 * I.e. for new Notebooks, we can emity the Insert Cell Edits without the notebook being created.
	 */
	public async *generateNotebookEdits(notebookOrUri: NotebookDocument | Uri, lines: AsyncIterable<LineOfText> | string, telemetryOptions: NotebookEditGenerationTelemtryOptions | undefined, token: CancellationToken): AsyncIterable<NotebookEdit | [Uri, TextEdit[]]> {
		lines = typeof lines === 'string' ? textToAsyncIterableLines(lines) : lines;
		const firstNonEmptyLinePromise = new DeferredPromise<LineOfText>();
		lines = readFirstNonEmptyLineAndKeepStreaming(lines, firstNonEmptyLinePromise);
		const firstNonEmptyLine = (await firstNonEmptyLinePromise.p).value;
		const format = this.getFormat(firstNonEmptyLine);

		// Sometimes llm hallucinates with jupytext format, and doesn't send the cell markers.
		// Instead just sends plain python code.
		// In such cases, if no new cells were emitted, then emit a new cell with the contents of the entire plain python code.
		const linesCollected: string[] = [];
		lines = collectWhileStreaming(lines, linesCollected);
		const isEmptyNotebook = isUri(notebookOrUri) || notebookOrUri.cellCount === 0;

		let notebookEditEmitted = false;
		let cellTextEditEmitted = false;
		for await (const edit of this.generateNotebookEditsImpl(notebookOrUri, lines, format, token)) {
			notebookEditEmitted = notebookEditEmitted || !Array.isArray(edit);
			if (Array.isArray(edit)) {
				cellTextEditEmitted = true;
			}
			yield edit;
		}

		if (isEmptyNotebook || !isUri(notebookOrUri)) {
			if (!notebookEditEmitted && format === 'text' && linesCollected.length && !lineMightHaveCellMarker(firstNonEmptyLine)) {
				const uri = isUri(notebookOrUri) ? notebookOrUri : notebookOrUri.uri;
				if (isJupyterNotebookUri(uri)) {
					const eolForNewCell = this.getEOLForNewCell(notebookOrUri, NotebookCellKind.Code);
					const cellData = new NotebookCellData(NotebookCellKind.Code, linesCollected.join(eolForNewCell), 'python');
					yield NotebookEdit.insertCells(0, [cellData]);
					this.logger.info(`No new cells were emitted for ${uri.toString()}. Emitting a new cell with the contents of the code.`);
				} else {
					this.logger.warn(`No new cells were emitted for ${uri.toString()}`);
				}
			}
		}

		(async () => {
			const model = await Promise.resolve(telemetryOptions?.model).catch(() => undefined);
			/* __GDPR__
				"notebook.editGeneration" : {
					"owner": "donjayamanne",
					"comment": "Metadata about the code mapper request",
					"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
					"requestSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source from where the request was made" },
					"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selection for the response" },
					"inputFormat": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Input format for the notebook source (xml, json, text)" },
					"isEmptyNotebook": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the notebook is empty", "isMeasurement": true },
					"isNotebookOrUri": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether we're given a notebook or just a uri (1 = Notebook, 0 = Uri)", "isMeasurement": true },
					"isJupyterNotebookUri": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether we're given a Jupyter notebook or just a uri (1 = Jupyter Notebook, 0 = Other)", "isMeasurement": true },
					"isEditEmitted": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a Notebook edit was emitted (insert or delete cell) (1 = Yes, 0 = No)", "isMeasurement": true },
					"isCellTextEditEmitted": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether an edit was emitted for a cell (1 = Yes, 0 = No)", "isMeasurement": true },
					"sourceLength": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of lines in the source code from which we're to generate edits", "isMeasurement": true }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent('notebook.editGeneration', {
				requestId: telemetryOptions?.requestId,
				requestSource: telemetryOptions?.source,
				model,
				inputFormat: format
			}, {
				isEmptyNotebook: isEmptyNotebook ? 1 : 0,
				isNotebookOrUri: isUri(notebookOrUri) ? 0 : 1,
				isJupyterNotebookUri: isJupyterNotebookUri(isUri(notebookOrUri) ? notebookOrUri : notebookOrUri.uri) ? 1 : 0,
				isEditEmitted: notebookEditEmitted ? 1 : 0,
				isCellTextEditEmitted: cellTextEditEmitted ? 1 : 0,
				sourceLength: linesCollected.length
			});
		})();
	}

	public async *generateNotebookEditsImpl(notebookOrUri: NotebookDocument | Uri, lines: AsyncIterable<LineOfText>, format: AlternativeContentFormat, token: CancellationToken): AsyncIterable<NotebookEdit | [Uri, TextEdit[]]> {
		const provider = this.alternativeContentService.create(format);
		const isEmptyNotebook = isUri(notebookOrUri) || notebookOrUri.cellCount === 0;
		const isNotebookAvailable = !isUri(notebookOrUri);
		const cellIdMap = isNotebookAvailable ? getCellIdMap(notebookOrUri) : new Map<string, NotebookCell>();

		const cellInfo: { index: number; language: string; cell?: NotebookCell; lines: string[]; insertEdit?: NotebookEdit; ended: boolean } = {
			index: -1,
			lines: [],
			language: 'markdown',
			ended: false
		};

		const cellsSeen = new WeakSet<NotebookCell>();
		function getCellIdOfNewCell(cell: ExpectedCellInfo): string {
			const hash = new StringSHA1();
			hash.update(cell.index.toString());
			return hash.digest().substring(0, 8);
		}


		// This tracks the order and content of the cells as they are expected to be in the notebook.
		type ExpectedCellInfo = { index: number; cell?: NotebookCell; lines: string[]; language: string };
		const expectedCells: ExpectedCellInfo[] = [];
		const original: { id: string; uri?: Uri }[] = isUri(notebookOrUri) ? [] : notebookOrUri.getCells().map(cell => ({ id: getCellId(cell), uri: cell.document.uri }));
		const allLines: string[] = [];
		lines = collectWhileStreaming(lines, allLines);
		let editsEmitted = false;
		for await (const line of provider.parseAlternateContent(notebookOrUri, lines, token)) {
			if (token.isCancellationRequested) {
				break;
			}
			if (line.type === 'start') {
				const expectedCell: ExpectedCellInfo = {
					index: line.index,
					language: line.language || 'markdown',
					lines: [],
					cell: line.id ? cellIdMap.get(line.id) : undefined
				};
				expectedCells.push(expectedCell);
				cellInfo.ended = false;
				cellInfo.insertEdit = undefined;
				cellInfo.index = expectedCell.index;
				cellInfo.lines = expectedCell.lines;
				cellInfo.language = expectedCell.language;
				cellInfo.cell = expectedCell.cell;
				if (cellInfo.cell) {
					cellsSeen.add(cellInfo.cell);
				}
			} else if (line.type === 'end') {
				cellInfo.ended = true;
				const doc = cellInfo.cell?.document;
				if (!cellInfo.insertEdit && !cellInfo.cell && !cellInfo.lines.length) {
					// This is a case where we have an empty cell.
					// We do not get the line at all, but we only have a start and end,
					// Meaning it is a cell, and it is well structured, but its empty.
					const cellData = new NotebookCellData(cellInfo.language === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code, '', cellInfo.language);
					const insertEdit = NotebookEdit.insertCells(cellInfo.index, [cellData]);
					yield insertEdit;
					editsEmitted = true;
					original.splice(cellInfo.index, 0, { id: getCellIdOfNewCell(cellInfo) });
				} else if (cellInfo.insertEdit && !cellInfo.cell) {
					// Possible we got a cell from LLM that doesn't have an id, but matches the content of an existing cell.
					// This can happen as follows:
					// 1. User asks LLM to insert a cell
					// 2. LLM returns a edit request to insert the cell without the cell id
					// 3. We insert the cell
					// 4. User asks for some other changes,
					// 5. LLM uses history and see that the cell in history that doestn' have an id
					// 6. LLM returns this same cell again along with other cells (new/changes, etc)
					// 7. Some how SD endpoint cannot figure out this is the same cell, and SD returns this cell but without the id
					// 8. Now we see this cell without an id, we insert it and we delete the old cell that was in this place.
					// Solution: If the cell being inserted is the same as the cell that is already in the notebook in the same position, then don't insert it.
					const existingCell = (!isEmptyNotebook && isNotebookAvailable && cellInfo.index < notebookOrUri.cellCount) ? notebookOrUri.cellAt(cellInfo.index) : undefined;
					if (existingCell && existingCell.document.getText() === cellInfo.insertEdit.newCells[0].value) {
						// Emit the edits for this cell.
						// & do not insert this cell.
						cellsSeen.add(existingCell);
						expectedCells[expectedCells.length - 1].cell = existingCell;

						// Remit the edits for all the lines of this existing cell.
						const doc = existingCell.document;
						for (let i = 0; i < doc.lineCount; i++) {
							const line = doc.lineAt(i);
							yield [doc.uri, [new TextEdit(new Range(i, 0, i, Constants.MAX_SAFE_SMALL_INTEGER), line.text)]];
							editsEmitted = true;
						}
					} else {
						yield cellInfo.insertEdit;
						editsEmitted = true;
						original.splice(cellInfo.index, 0, { id: getCellIdOfNewCell(cellInfo) });
					}
				} else if (cellInfo.lines.length && doc && cellInfo.lines.length < doc.lineCount) {
					const range = new Range(cellInfo.lines.length - 1, cellInfo.lines.slice(-1)[0].length, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
					yield [doc.uri, [new TextEdit(range, '')]];
				}
			} else if (line.type === 'line' && !cellInfo.ended) {
				cellInfo.lines.push(line.line);
				if (cellInfo.cell) {
					if (cellInfo.lines.length > cellInfo.cell.document.lineCount) {
						const range = new Range(cellInfo.lines.length - 1, 0, cellInfo.lines.length - 1, 0);
						const eol = cellInfo.cell.document.eol === EndOfLine.LF ? '\n' : '\r\n';
						const newText = `${eol}${line.line}`;
						yield [cellInfo.cell.document.uri, [new TextEdit(range, newText)]];
					} else {
						const lineIndex = cellInfo.lines.length - 1;
						yield [cellInfo.cell.document.uri, [new TextEdit(new Range(lineIndex, 0, lineIndex, Constants.MAX_SAFE_SMALL_INTEGER), line.line)]];
					}
					editsEmitted = true;
				} else if (cellInfo.insertEdit) {
					const eolForNewCell = this.getEOLForNewCell(notebookOrUri, cellInfo.insertEdit.newCells[0].kind);
					cellInfo.insertEdit.newCells[0].value = cellInfo.lines.join(eolForNewCell);
				} else {
					// Insert the new cell.
					const cellData = new NotebookCellData(cellInfo.language === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code, line.line, cellInfo.language);
					cellInfo.insertEdit = NotebookEdit.insertCells(cellInfo.index, [cellData]);
				}
			}
		}

		if (isEmptyNotebook || !isNotebookAvailable) {
			return;
		}

		// If we have content in the original notebook and no edits were emitted,
		// But we have some content,
		// This this can mean only one thing = invalid format.
		// If the format is correct, then we should have emitted some edits.
		// If we don't exit here we end up deleting all the cells in the notebook.
		if (!editsEmitted && allLines.length) {
			this.logger.warn(`No edits generated for notebook ${notebookOrUri.uri.toString()}. This is likely due to an invalid format. Expected format: ${format}. Provided content as follows:\n\n${allLines.join('\n')}`);
			return;
		}

		const modified = expectedCells.map(cell => cell.cell ? getCellId(cell.cell) : getCellIdOfNewCell(cell));

		// Delete the missing cells.
		for (const missingCell of original.filter(cell => cell.uri && !modified.includes(cell.id)).reverse()) {
			const cell = cellIdMap.get(missingCell.id);
			if (cell) {
				const index = original.indexOf(missingCell);
				yield NotebookEdit.deleteCells(new NotebookRange(index, index + 1));
				original.splice(index, 1);
			}
		}

		const result = await this.diffService.computeDiff(original.map(c => c.id).join(EOL), modified.join(EOL), { computeMoves: false, ignoreTrimWhitespace: true, maxComputationTimeMs: 5_000 });
		const diffResult = computeDiff(original.map(i => i.id), modified, result.changes);

		if (diffResult.every(d => d.type === 'unchanged')) {
			return;
		}

		// Delete items
		for (const change of diffResult.filter(d => d.type === 'delete').reverse()) {
			yield NotebookEdit.deleteCells(new NotebookRange(change.originalCellIndex, change.originalCellIndex + 1));
		}

		// insert items
		for (const change of diffResult.filter(d => d.type === 'insert')) {
			const expectedCell = expectedCells[change.modifiedCellIndex];
			const kind = expectedCell.language === 'markdown' ? NotebookCellKind.Markup : NotebookCellKind.Code;
			const eolForNewCell = this.getEOLForNewCell(notebookOrUri, kind);
			const source = expectedCell.lines.join(eolForNewCell);
			const cellData = new NotebookCellData(kind, source, expectedCell.language);
			yield NotebookEdit.insertCells(expectedCell.index, [cellData]);
		}
	}

}

export function textToAsyncIterableLines(text: string): AsyncIterable<LineOfText> {
	const source = new AsyncIterableSource<string>();
	source.emitOne(text);
	source.resolve();
	return streamLines(source.asyncIterable);
}


/**
 * Split an incoming stream of text to a stream of lines.
 */
function streamLines(source: AsyncIterable<string>): AsyncIterableObject<LineOfText> {
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


function readFirstNonEmptyLineAndKeepStreaming(source: AsyncIterable<LineOfText>, firstNonEmptyLine: DeferredPromise<LineOfText>): AsyncIterable<LineOfText> {
	return new AsyncIterableObject<LineOfText>(async (emitter) => {
		for await (const line of source) {
			if (!firstNonEmptyLine.isSettled && line.value.trim().length) {
				firstNonEmptyLine.complete(line);
			}
			emitter.emitOne(line);
		}
		if (!firstNonEmptyLine.isSettled) {
			firstNonEmptyLine.complete(new LineOfText(''));
		}
	});
}

function collectWhileStreaming(source: AsyncIterable<LineOfText>, lines: string[]): AsyncIterable<LineOfText> {
	return new AsyncIterableObject<LineOfText>(async (emitter) => {
		for await (const line of source) {
			lines.push(line.value);
			emitter.emitOne(line);
		}
	});
}