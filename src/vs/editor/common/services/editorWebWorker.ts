/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stringDiff } from '../../../base/common/diff/diff.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IWebWorkerServerRequestHandler } from '../../../base/common/worker/webWorker.js';
import { Position } from '../core/position.js';
import { IRange, Range } from '../core/range.js';
import { EndOfLineSequence, ITextModel } from '../model.js';
import { IMirrorTextModel, IModelChangedEvent } from '../model/mirrorTextModel.js';
import { IColorInformation, IInplaceReplaceSupportResult, ILink, TextEdit } from '../languages.js';
import { computeLinks } from '../languages/linkComputer.js';
import { BasicInplaceReplace } from '../languages/supports/inplaceReplaceSupport.js';
import { DiffAlgorithmName, IDiffComputationResult, ILineChange, IUnicodeHighlightsResult } from './editorWorker.js';
import { createMonacoBaseAPI } from './editorBaseApi.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { UnicodeTextModelHighlighter, UnicodeHighlighterOptions } from './unicodeTextModelHighlighter.js';
import { DiffComputer, IChange } from '../diff/legacyLinesDiffComputer.js';
import { ILinesDiffComputer, ILinesDiffComputerOptions } from '../diff/linesDiffComputer.js';
import { DetailedLineRangeMapping } from '../diff/rangeMapping.js';
import { linesDiffComputers } from '../diff/linesDiffComputers.js';
import { IDocumentDiffProviderOptions } from '../diff/documentDiffProvider.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { computeDefaultDocumentColors } from '../languages/defaultDocumentColorsComputer.js';
import { FindSectionHeaderOptions, SectionHeader, findSectionHeaders } from './findSectionHeaders.js';
import { IRawModelData, IWorkerTextModelSyncChannelServer } from './textModelSync/textModelSync.protocol.js';
import { ICommonModel, WorkerTextModelSyncServer } from './textModelSync/textModelSync.impl.js';
import { ISerializedStringEdit, StringEdit } from '../core/edits/stringEdit.js';
import { StringText } from '../core/text/abstractText.js';
import { ensureDependenciesAreSet } from '../core/text/positionToOffset.js';

export interface IMirrorModel extends IMirrorTextModel {
	readonly uri: URI;
	readonly version: number;
	getValue(): string;
}

export interface IWorkerContext<H = {}> {
	/**
	 * A proxy to the main thread host object.
	 */
	host: H;
	/**
	 * Get all available mirror models in this worker.
	 */
	getMirrorModels(): IMirrorModel[];
}

/**
 * Range of a word inside a model.
 * @internal
 */
export interface IWordRange {
	/**
	 * The index where the word starts.
	 */
	readonly start: number;
	/**
	 * The index where the word ends.
	 */
	readonly end: number;
}

/**
 * @internal
 */
export class EditorWorker implements IDisposable, IWorkerTextModelSyncChannelServer, IWebWorkerServerRequestHandler {
	_requestHandlerBrand: any;

	private readonly _workerTextModelSyncServer = new WorkerTextModelSyncServer();

	constructor(
		private readonly _foreignModule: any | null = null
	) { }

	dispose(): void {
	}

	public async $ping() {
		return 'pong';
	}

	protected _getModel(uri: string): ICommonModel | undefined {
		return this._workerTextModelSyncServer.getModel(uri);
	}

	public getModels(): ICommonModel[] {
		return this._workerTextModelSyncServer.getModels();
	}

	public $acceptNewModel(data: IRawModelData): void {
		this._workerTextModelSyncServer.$acceptNewModel(data);
	}

	public $acceptModelChanged(uri: string, e: IModelChangedEvent): void {
		this._workerTextModelSyncServer.$acceptModelChanged(uri, e);
	}

	public $acceptRemovedModel(uri: string): void {
		this._workerTextModelSyncServer.$acceptRemovedModel(uri);
	}

	public async $computeUnicodeHighlights(url: string, options: UnicodeHighlighterOptions, range?: IRange): Promise<IUnicodeHighlightsResult> {
		const model = this._getModel(url);
		if (!model) {
			return { ranges: [], hasMore: false, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 };
		}
		return UnicodeTextModelHighlighter.computeUnicodeHighlights(model, options, range);
	}

	public async $findSectionHeaders(url: string, options: FindSectionHeaderOptions): Promise<SectionHeader[]> {
		const model = this._getModel(url);
		if (!model) {
			return [];
		}
		return findSectionHeaders(model, options);
	}

	// ---- BEGIN diff --------------------------------------------------------------------------

	public async $computeDiff(originalUrl: string, modifiedUrl: string, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDiffComputationResult | null> {
		const original = this._getModel(originalUrl);
		const modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		const result = EditorWorker.computeDiff(original, modified, options, algorithm);
		return result;
	}

	private static computeDiff(originalTextModel: ICommonModel | ITextModel, modifiedTextModel: ICommonModel | ITextModel, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): IDiffComputationResult {
		const diffAlgorithm: ILinesDiffComputer = algorithm === 'advanced' ? linesDiffComputers.getDefault() : linesDiffComputers.getLegacy();

		const originalLines = originalTextModel.getLinesContent();
		const modifiedLines = modifiedTextModel.getLinesContent();

		const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);

		const identical = (result.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel));

		function getLineChanges(changes: readonly DetailedLineRangeMapping[]): ILineChange[] {
			return changes.map(m => ([m.original.startLineNumber, m.original.endLineNumberExclusive, m.modified.startLineNumber, m.modified.endLineNumberExclusive, m.innerChanges?.map(m => [
				m.originalRange.startLineNumber,
				m.originalRange.startColumn,
				m.originalRange.endLineNumber,
				m.originalRange.endColumn,
				m.modifiedRange.startLineNumber,
				m.modifiedRange.startColumn,
				m.modifiedRange.endLineNumber,
				m.modifiedRange.endColumn,
			])]));
		}

		return {
			identical,
			quitEarly: result.hitTimeout,
			changes: getLineChanges(result.changes),
			moves: result.moves.map(m => ([
				m.lineRangeMapping.original.startLineNumber,
				m.lineRangeMapping.original.endLineNumberExclusive,
				m.lineRangeMapping.modified.startLineNumber,
				m.lineRangeMapping.modified.endLineNumberExclusive,
				getLineChanges(m.changes)
			])),
		};
	}

	private static _modelsAreIdentical(original: ICommonModel | ITextModel, modified: ICommonModel | ITextModel): boolean {
		const originalLineCount = original.getLineCount();
		const modifiedLineCount = modified.getLineCount();
		if (originalLineCount !== modifiedLineCount) {
			return false;
		}
		for (let line = 1; line <= originalLineCount; line++) {
			const originalLine = original.getLineContent(line);
			const modifiedLine = modified.getLineContent(line);
			if (originalLine !== modifiedLine) {
				return false;
			}
		}
		return true;
	}

	public async $computeDirtyDiff(originalUrl: string, modifiedUrl: string, ignoreTrimWhitespace: boolean): Promise<IChange[] | null> {
		const original = this._getModel(originalUrl);
		const modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		const originalLines = original.getLinesContent();
		const modifiedLines = modified.getLinesContent();
		const diffComputer = new DiffComputer(originalLines, modifiedLines, {
			shouldComputeCharChanges: false,
			shouldPostProcessCharChanges: false,
			shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
			shouldMakePrettyDiff: true,
			maxComputationTime: 1000
		});
		return diffComputer.computeDiff().changes;
	}

	public $computeStringDiff(original: string, modified: string, options: { maxComputationTimeMs: number }, algorithm: DiffAlgorithmName): ISerializedStringEdit {
		return computeStringDiff(original, modified, options, algorithm).toJson();
	}

	// ---- END diff --------------------------------------------------------------------------


	// ---- BEGIN minimal edits ---------------------------------------------------------------

	private static readonly _diffLimit = 100000;

	public async $computeMoreMinimalEdits(modelUrl: string, edits: TextEdit[], pretty: boolean): Promise<TextEdit[]> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return edits;
		}

		const result: TextEdit[] = [];
		let lastEol: EndOfLineSequence | undefined = undefined;

		edits = edits.slice(0).sort((a, b) => {
			if (a.range && b.range) {
				return Range.compareRangesUsingStarts(a.range, b.range);
			}
			// eol only changes should go to the end
			const aRng = a.range ? 0 : 1;
			const bRng = b.range ? 0 : 1;
			return aRng - bRng;
		});

		// merge adjacent edits
		let writeIndex = 0;
		for (let readIndex = 1; readIndex < edits.length; readIndex++) {
			if (Range.getEndPosition(edits[writeIndex].range).equals(Range.getStartPosition(edits[readIndex].range))) {
				edits[writeIndex].range = Range.fromPositions(Range.getStartPosition(edits[writeIndex].range), Range.getEndPosition(edits[readIndex].range));
				edits[writeIndex].text += edits[readIndex].text;
			} else {
				writeIndex++;
				edits[writeIndex] = edits[readIndex];
			}
		}
		edits.length = writeIndex + 1;

		for (let { range, text, eol } of edits) {

			if (typeof eol === 'number') {
				lastEol = eol;
			}

			if (Range.isEmpty(range) && !text) {
				// empty change
				continue;
			}

			const original = model.getValueInRange(range);
			text = text.replace(/\r\n|\n|\r/g, model.eol);

			if (original === text) {
				// noop
				continue;
			}

			// make sure diff won't take too long
			if (Math.max(text.length, original.length) > EditorWorker._diffLimit) {
				result.push({ range, text });
				continue;
			}

			// compute diff between original and edit.text
			const changes = stringDiff(original, text, pretty);
			const editOffset = model.offsetAt(Range.lift(range).getStartPosition());

			for (const change of changes) {
				const start = model.positionAt(editOffset + change.originalStart);
				const end = model.positionAt(editOffset + change.originalStart + change.originalLength);
				const newEdit: TextEdit = {
					text: text.substr(change.modifiedStart, change.modifiedLength),
					range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }
				};

				if (model.getValueInRange(newEdit.range) !== newEdit.text) {
					result.push(newEdit);
				}
			}
		}

		if (typeof lastEol === 'number') {
			result.push({ eol: lastEol, text: '', range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
		}

		return result;
	}

	public $computeHumanReadableDiff(modelUrl: string, edits: TextEdit[], options: ILinesDiffComputerOptions): TextEdit[] {
		const model = this._getModel(modelUrl);
		if (!model) {
			return edits;
		}

		const result: TextEdit[] = [];
		let lastEol: EndOfLineSequence | undefined = undefined;

		edits = edits.slice(0).sort((a, b) => {
			if (a.range && b.range) {
				return Range.compareRangesUsingStarts(a.range, b.range);
			}
			// eol only changes should go to the end
			const aRng = a.range ? 0 : 1;
			const bRng = b.range ? 0 : 1;
			return aRng - bRng;
		});

		for (let { range, text, eol } of edits) {

			if (typeof eol === 'number') {
				lastEol = eol;
			}

			if (Range.isEmpty(range) && !text) {
				// empty change
				continue;
			}

			const original = model.getValueInRange(range);
			text = text.replace(/\r\n|\n|\r/g, model.eol);

			if (original === text) {
				// noop
				continue;
			}

			// make sure diff won't take too long
			if (Math.max(text.length, original.length) > EditorWorker._diffLimit) {
				result.push({ range, text });
				continue;
			}

			// compute diff between original and edit.text

			const originalLines = original.split(/\r\n|\n|\r/);
			const modifiedLines = text.split(/\r\n|\n|\r/);

			const diff = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, options);

			const start = Range.lift(range).getStartPosition();

			function addPositions(pos1: Position, pos2: Position): Position {
				return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
			}

			function getText(lines: string[], range: Range): string[] {
				const result: string[] = [];
				for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
					const line = lines[i - 1];
					if (i === range.startLineNumber && i === range.endLineNumber) {
						result.push(line.substring(range.startColumn - 1, range.endColumn - 1));
					} else if (i === range.startLineNumber) {
						result.push(line.substring(range.startColumn - 1));
					} else if (i === range.endLineNumber) {
						result.push(line.substring(0, range.endColumn - 1));
					} else {
						result.push(line);
					}
				}
				return result;
			}

			for (const c of diff.changes) {
				if (c.innerChanges) {
					for (const x of c.innerChanges) {
						result.push({
							range: Range.fromPositions(
								addPositions(start, x.originalRange.getStartPosition()),
								addPositions(start, x.originalRange.getEndPosition())
							),
							text: getText(modifiedLines, x.modifiedRange).join(model.eol)
						});
					}
				} else {
					throw new BugIndicatingError('The experimental diff algorithm always produces inner changes');
				}
			}
		}

		if (typeof lastEol === 'number') {
			result.push({ eol: lastEol, text: '', range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
		}

		return result;
	}

	// ---- END minimal edits ---------------------------------------------------------------

	public async $computeLinks(modelUrl: string): Promise<ILink[] | null> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}

		return computeLinks(model);
	}

	// --- BEGIN default document colors -----------------------------------------------------------

	public async $computeDefaultDocumentColors(modelUrl: string): Promise<IColorInformation[] | null> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}
		return computeDefaultDocumentColors(model);
	}

	// ---- BEGIN suggest --------------------------------------------------------------------------

	private static readonly _suggestionsLimit = 10000;

	public async $textualSuggest(modelUrls: string[], leadingWord: string | undefined, wordDef: string, wordDefFlags: string): Promise<{ words: string[]; duration: number } | null> {

		const sw = new StopWatch();
		const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
		const seen = new Set<string>();

		outer: for (const url of modelUrls) {
			const model = this._getModel(url);
			if (!model) {
				continue;
			}

			for (const word of model.words(wordDefRegExp)) {
				if (word === leadingWord || !isNaN(Number(word))) {
					continue;
				}
				seen.add(word);
				if (seen.size > EditorWorker._suggestionsLimit) {
					break outer;
				}
			}
		}

		return { words: Array.from(seen), duration: sw.elapsed() };
	}


	// ---- END suggest --------------------------------------------------------------------------

	//#region -- word ranges --

	public async $computeWordRanges(modelUrl: string, range: IRange, wordDef: string, wordDefFlags: string): Promise<{ [word: string]: IRange[] }> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return Object.create(null);
		}
		const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
		const result: { [word: string]: IRange[] } = Object.create(null);
		for (let line = range.startLineNumber; line < range.endLineNumber; line++) {
			const words = model.getLineWords(line, wordDefRegExp);
			for (const word of words) {
				if (!isNaN(Number(word.word))) {
					continue;
				}
				let array = result[word.word];
				if (!array) {
					array = [];
					result[word.word] = array;
				}
				array.push({
					startLineNumber: line,
					startColumn: word.startColumn,
					endLineNumber: line,
					endColumn: word.endColumn
				});
			}
		}
		return result;
	}

	//#endregion

	public async $navigateValueSet(modelUrl: string, range: IRange, up: boolean, wordDef: string, wordDefFlags: string): Promise<IInplaceReplaceSupportResult | null> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}

		const wordDefRegExp = new RegExp(wordDef, wordDefFlags);

		if (range.startColumn === range.endColumn) {
			range = {
				startLineNumber: range.startLineNumber,
				startColumn: range.startColumn,
				endLineNumber: range.endLineNumber,
				endColumn: range.endColumn + 1
			};
		}

		const selectionText = model.getValueInRange(range);

		const wordRange = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn }, wordDefRegExp);
		if (!wordRange) {
			return null;
		}
		const word = model.getValueInRange(wordRange);
		const result = BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
		return result;
	}

	// ---- BEGIN foreign module support --------------------------------------------------------------------------

	// foreign method request
	public $fmr(method: string, args: any[]): Promise<any> {
		if (!this._foreignModule || typeof this._foreignModule[method] !== 'function') {
			return Promise.reject(new Error('Missing requestHandler or method: ' + method));
		}

		try {
			return Promise.resolve(this._foreignModule[method].apply(this._foreignModule, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	// ---- END foreign module support --------------------------------------------------------------------------
}

// This is only available in a Web Worker
declare function importScripts(...urls: string[]): void;

if (typeof importScripts === 'function') {
	// Running in a web worker
	globalThis.monaco = createMonacoBaseAPI();
}

/**
 * @internal
*/
export function computeStringDiff(original: string, modified: string, options: { maxComputationTimeMs: number }, algorithm: DiffAlgorithmName): StringEdit {
	const diffAlgorithm: ILinesDiffComputer = algorithm === 'advanced' ? linesDiffComputers.getDefault() : linesDiffComputers.getLegacy();

	ensureDependenciesAreSet();

	const originalText = new StringText(original);
	const originalLines = originalText.getLines();
	const modifiedText = new StringText(modified);
	const modifiedLines = modifiedText.getLines();

	const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, { ignoreTrimWhitespace: false, maxComputationTimeMs: options.maxComputationTimeMs, computeMoves: false, extendToSubwords: false });

	const textEdit = DetailedLineRangeMapping.toTextEdit(result.changes, modifiedText);
	const strEdit = originalText.getTransformer().getStringEdit(textEdit);

	return strEdit;
}
