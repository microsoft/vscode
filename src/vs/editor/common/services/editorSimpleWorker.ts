/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stringDiff } from 'vs/base/common/diff/diff';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { EndOfLineSequence, ITextModel } from 'vs/editor/common/model';
import { IMirrorTextModel, IModelChangedEvent, MirrorTextModel as BaseMirrorModel } from 'vs/editor/common/model/mirrorTextModel';
import { ensureValidWordDefinition, getWordAtText, IWordAtPosition } from 'vs/editor/common/core/wordHelper';
import { IColorInformation, IInplaceReplaceSupportResult, ILink, TextEdit } from 'vs/editor/common/languages';
import { ILinkComputerTarget, computeLinks } from 'vs/editor/common/languages/linkComputer';
import { BasicInplaceReplace } from 'vs/editor/common/languages/supports/inplaceReplaceSupport';
import { DiffAlgorithmName, IDiffComputationResult, ILineChange, IUnicodeHighlightsResult } from 'vs/editor/common/services/editorWorker';
import { createMonacoBaseAPI } from 'vs/editor/common/services/editorBaseApi';
import { IEditorWorkerHost } from 'vs/editor/common/services/editorWorkerHost';
import { StopWatch } from 'vs/base/common/stopwatch';
import { UnicodeTextModelHighlighter, UnicodeHighlighterOptions } from 'vs/editor/common/services/unicodeTextModelHighlighter';
import { DiffComputer, IChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { linesDiffComputers } from 'vs/editor/common/diff/linesDiffComputers';
import { createProxyObject, getAllMethodNames } from 'vs/base/common/objects';
import { IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { BugIndicatingError } from 'vs/base/common/errors';
import { IDocumentColorComputerTarget, computeDefaultDocumentColors } from 'vs/editor/common/languages/defaultDocumentColorsComputer';

export interface IMirrorModel extends IMirrorTextModel {
	readonly uri: URI;
	readonly version: number;
	getValue(): string;
}

export interface IWorkerContext<H = undefined> {
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
 * @internal
 */
export interface IRawModelData {
	url: string;
	versionId: number;
	lines: string[];
	EOL: string;
}

/**
 * @internal
 */
export interface ICommonModel extends ILinkComputerTarget, IDocumentColorComputerTarget, IMirrorModel {
	uri: URI;
	version: number;
	eol: string;
	getValue(): string;

	getLinesContent(): string[];
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineWords(lineNumber: number, wordDefinition: RegExp): IWordAtPosition[];
	words(wordDefinition: RegExp): Iterable<string>;
	getWordUntilPosition(position: IPosition, wordDefinition: RegExp): IWordAtPosition;
	getValueInRange(range: IRange): string;
	getWordAtPosition(position: IPosition, wordDefinition: RegExp): Range | null;
	offsetAt(position: IPosition): number;
	positionAt(offset: number): IPosition;
	findMatches(regex: RegExp): RegExpMatchArray[];
}

/**
 * Range of a word inside a model.
 * @internal
 */
interface IWordRange {
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
class MirrorModel extends BaseMirrorModel implements ICommonModel {

	public get uri(): URI {
		return this._uri;
	}

	public get eol(): string {
		return this._eol;
	}

	public getValue(): string {
		return this.getText();
	}

	public findMatches(regex: RegExp): RegExpMatchArray[] {
		const matches = [];
		for (let i = 0; i < this._lines.length; i++) {
			const line = this._lines[i];
			const offsetToAdd = this.offsetAt(new Position(i + 1, 1));
			const iteratorOverMatches = line.matchAll(regex);
			for (const match of iteratorOverMatches) {
				if (match.index || match.index === 0) {
					match.index = match.index + offsetToAdd;
				}
				matches.push(match);
			}
		}
		return matches;
	}

	public getLinesContent(): string[] {
		return this._lines.slice(0);
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public getLineContent(lineNumber: number): string {
		return this._lines[lineNumber - 1];
	}

	public getWordAtPosition(position: IPosition, wordDefinition: RegExp): Range | null {

		const wordAtText = getWordAtText(
			position.column,
			ensureValidWordDefinition(wordDefinition),
			this._lines[position.lineNumber - 1],
			0
		);

		if (wordAtText) {
			return new Range(position.lineNumber, wordAtText.startColumn, position.lineNumber, wordAtText.endColumn);
		}

		return null;
	}

	public getWordUntilPosition(position: IPosition, wordDefinition: RegExp): IWordAtPosition {
		const wordAtPosition = this.getWordAtPosition(position, wordDefinition);
		if (!wordAtPosition) {
			return {
				word: '',
				startColumn: position.column,
				endColumn: position.column
			};
		}
		return {
			word: this._lines[position.lineNumber - 1].substring(wordAtPosition.startColumn - 1, position.column - 1),
			startColumn: wordAtPosition.startColumn,
			endColumn: position.column
		};
	}


	public words(wordDefinition: RegExp): Iterable<string> {

		const lines = this._lines;
		const wordenize = this._wordenize.bind(this);

		let lineNumber = 0;
		let lineText = '';
		let wordRangesIdx = 0;
		let wordRanges: IWordRange[] = [];

		return {
			*[Symbol.iterator]() {
				while (true) {
					if (wordRangesIdx < wordRanges.length) {
						const value = lineText.substring(wordRanges[wordRangesIdx].start, wordRanges[wordRangesIdx].end);
						wordRangesIdx += 1;
						yield value;
					} else {
						if (lineNumber < lines.length) {
							lineText = lines[lineNumber];
							wordRanges = wordenize(lineText, wordDefinition);
							wordRangesIdx = 0;
							lineNumber += 1;
						} else {
							break;
						}
					}
				}
			}
		};
	}

	public getLineWords(lineNumber: number, wordDefinition: RegExp): IWordAtPosition[] {
		const content = this._lines[lineNumber - 1];
		const ranges = this._wordenize(content, wordDefinition);
		const words: IWordAtPosition[] = [];
		for (const range of ranges) {
			words.push({
				word: content.substring(range.start, range.end),
				startColumn: range.start + 1,
				endColumn: range.end + 1
			});
		}
		return words;
	}

	private _wordenize(content: string, wordDefinition: RegExp): IWordRange[] {
		const result: IWordRange[] = [];
		let match: RegExpExecArray | null;

		wordDefinition.lastIndex = 0; // reset lastIndex just to be sure

		while (match = wordDefinition.exec(content)) {
			if (match[0].length === 0) {
				// it did match the empty string
				break;
			}
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
	}

	public getValueInRange(range: IRange): string {
		range = this._validateRange(range);

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		const lineEnding = this._eol;
		const startLineIndex = range.startLineNumber - 1;
		const endLineIndex = range.endLineNumber - 1;
		const resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (let i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public offsetAt(position: IPosition): number {
		position = this._validatePosition(position);
		this._ensureLineStarts();
		return this._lineStarts!.getPrefixSum(position.lineNumber - 2) + (position.column - 1);
	}

	public positionAt(offset: number): IPosition {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		const out = this._lineStarts!.getIndexOf(offset);
		const lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return {
			lineNumber: 1 + out.index,
			column: 1 + Math.min(out.remainder, lineLength)
		};
	}

	private _validateRange(range: IRange): IRange {

		const start = this._validatePosition({ lineNumber: range.startLineNumber, column: range.startColumn });
		const end = this._validatePosition({ lineNumber: range.endLineNumber, column: range.endColumn });

		if (start.lineNumber !== range.startLineNumber
			|| start.column !== range.startColumn
			|| end.lineNumber !== range.endLineNumber
			|| end.column !== range.endColumn) {

			return {
				startLineNumber: start.lineNumber,
				startColumn: start.column,
				endLineNumber: end.lineNumber,
				endColumn: end.column
			};
		}

		return range;
	}

	private _validatePosition(position: IPosition): IPosition {
		if (!Position.isIPosition(position)) {
			throw new Error('bad position');
		}
		let { lineNumber, column } = position;
		let hasChanged = false;

		if (lineNumber < 1) {
			lineNumber = 1;
			column = 1;
			hasChanged = true;

		} else if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
			column = this._lines[lineNumber - 1].length + 1;
			hasChanged = true;

		} else {
			const maxCharacter = this._lines[lineNumber - 1].length + 1;
			if (column < 1) {
				column = 1;
				hasChanged = true;
			}
			else if (column > maxCharacter) {
				column = maxCharacter;
				hasChanged = true;
			}
		}

		if (!hasChanged) {
			return position;
		} else {
			return { lineNumber, column };
		}
	}
}

/**
 * @internal
 */
export interface IForeignModuleFactory {
	(ctx: IWorkerContext, createData: any): any;
}

declare const require: any;

/**
 * @internal
 */
export class EditorSimpleWorker implements IRequestHandler, IDisposable {
	_requestHandlerBrand: any;

	protected readonly _host: IEditorWorkerHost;
	private _models: { [uri: string]: MirrorModel };
	private readonly _foreignModuleFactory: IForeignModuleFactory | null;
	private _foreignModule: any;

	constructor(host: IEditorWorkerHost, foreignModuleFactory: IForeignModuleFactory | null) {
		this._host = host;
		this._models = Object.create(null);
		this._foreignModuleFactory = foreignModuleFactory;
		this._foreignModule = null;
	}

	public dispose(): void {
		this._models = Object.create(null);
	}

	protected _getModel(uri: string): ICommonModel {
		return this._models[uri];
	}

	private _getModels(): ICommonModel[] {
		const all: MirrorModel[] = [];
		Object.keys(this._models).forEach((key) => all.push(this._models[key]));
		return all;
	}

	public acceptNewModel(data: IRawModelData): void {
		this._models[data.url] = new MirrorModel(URI.parse(data.url), data.lines, data.EOL, data.versionId);
	}

	public acceptModelChanged(strURL: string, e: IModelChangedEvent): void {
		if (!this._models[strURL]) {
			return;
		}
		const model = this._models[strURL];
		model.onEvents(e);
	}

	public acceptRemovedModel(strURL: string): void {
		if (!this._models[strURL]) {
			return;
		}
		delete this._models[strURL];
	}

	public async computeUnicodeHighlights(url: string, options: UnicodeHighlighterOptions, range?: IRange): Promise<IUnicodeHighlightsResult> {
		const model = this._getModel(url);
		if (!model) {
			return { ranges: [], hasMore: false, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 };
		}
		return UnicodeTextModelHighlighter.computeUnicodeHighlights(model, options, range);
	}

	// ---- BEGIN diff --------------------------------------------------------------------------

	public async computeDiff(originalUrl: string, modifiedUrl: string, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDiffComputationResult | null> {
		const original = this._getModel(originalUrl);
		const modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		return EditorSimpleWorker.computeDiff(original, modified, options, algorithm);
	}

	private static computeDiff(originalTextModel: ICommonModel | ITextModel, modifiedTextModel: ICommonModel | ITextModel, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): IDiffComputationResult {
		const diffAlgorithm: ILinesDiffComputer = algorithm === 'advanced' ? linesDiffComputers.getAdvanced() : linesDiffComputers.getLegacy();

		const originalLines = originalTextModel.getLinesContent();
		const modifiedLines = modifiedTextModel.getLinesContent();

		const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);

		const identical = (result.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel));

		function getLineChanges(changes: readonly LineRangeMapping[]): ILineChange[] {
			return changes.map(m => ([m.originalRange.startLineNumber, m.originalRange.endLineNumberExclusive, m.modifiedRange.startLineNumber, m.modifiedRange.endLineNumberExclusive, m.innerChanges?.map(m => [
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

	public async computeDirtyDiff(originalUrl: string, modifiedUrl: string, ignoreTrimWhitespace: boolean): Promise<IChange[] | null> {
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

	// ---- END diff --------------------------------------------------------------------------


	// ---- BEGIN minimal edits ---------------------------------------------------------------

	private static readonly _diffLimit = 100000;

	public async computeMoreMinimalEdits(modelUrl: string, edits: TextEdit[], pretty: boolean): Promise<TextEdit[]> {
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
			if (Math.max(text.length, original.length) > EditorSimpleWorker._diffLimit) {
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

	public async computeHumanReadableDiff(modelUrl: string, edits: TextEdit[], options: ILinesDiffComputerOptions): Promise<TextEdit[]> {
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
			if (Math.max(text.length, original.length) > EditorSimpleWorker._diffLimit) {
				result.push({ range, text });
				continue;
			}

			// compute diff between original and edit.text

			const originalLines = original.split(/\r\n|\n|\r/);
			const modifiedLines = text.split(/\r\n|\n|\r/);

			const diff = linesDiffComputers.getAdvanced().computeDiff(originalLines, modifiedLines, options);

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

	public async computeLinks(modelUrl: string): Promise<ILink[] | null> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}

		return computeLinks(model);
	}

	// --- BEGIN default document colors -----------------------------------------------------------

	public async computeDefaultDocumentColors(modelUrl: string): Promise<IColorInformation[] | null> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}
		return computeDefaultDocumentColors(model);
	}

	// ---- BEGIN suggest --------------------------------------------------------------------------

	private static readonly _suggestionsLimit = 10000;

	public async textualSuggest(modelUrls: string[], leadingWord: string | undefined, wordDef: string, wordDefFlags: string): Promise<{ words: string[]; duration: number } | null> {

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
				if (seen.size > EditorSimpleWorker._suggestionsLimit) {
					break outer;
				}
			}
		}

		return { words: Array.from(seen), duration: sw.elapsed() };
	}


	// ---- END suggest --------------------------------------------------------------------------

	//#region -- word ranges --

	public async computeWordRanges(modelUrl: string, range: IRange, wordDef: string, wordDefFlags: string): Promise<{ [word: string]: IRange[] }> {
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

	public async navigateValueSet(modelUrl: string, range: IRange, up: boolean, wordDef: string, wordDefFlags: string): Promise<IInplaceReplaceSupportResult | null> {
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

	public loadForeignModule(moduleId: string, createData: any, foreignHostMethods: string[]): Promise<string[]> {
		const proxyMethodRequest = (method: string, args: any[]): Promise<any> => {
			return this._host.fhr(method, args);
		};

		const foreignHost = createProxyObject(foreignHostMethods, proxyMethodRequest);

		const ctx: IWorkerContext<any> = {
			host: foreignHost,
			getMirrorModels: (): IMirrorModel[] => {
				return this._getModels();
			}
		};

		if (this._foreignModuleFactory) {
			this._foreignModule = this._foreignModuleFactory(ctx, createData);
			// static foreing module
			return Promise.resolve(getAllMethodNames(this._foreignModule));
		}
		// ESM-comment-begin
		return new Promise<any>((resolve, reject) => {
			require([moduleId], (foreignModule: { create: IForeignModuleFactory }) => {
				this._foreignModule = foreignModule.create(ctx, createData);

				resolve(getAllMethodNames(this._foreignModule));

			}, reject);
		});
		// ESM-comment-end

		// ESM-uncomment-begin
		// return Promise.reject(new Error(`Unexpected usage`));
		// ESM-uncomment-end
	}

	// foreign method request
	public fmr(method: string, args: any[]): Promise<any> {
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

/**
 * Called on the worker side
 * @internal
 */
export function create(host: IEditorWorkerHost): IRequestHandler {
	return new EditorSimpleWorker(host, null);
}

// This is only available in a Web Worker
declare function importScripts(...urls: string[]): void;

if (typeof importScripts === 'function') {
	// Running in a web worker
	globalThis.monaco = createMonacoBaseAPI();
}
