/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkerClient, IWorkerServer } from '../../../../base/common/worker/simpleWorker.js';
import { IPosition, Position } from '../../core/position.js';
import { IRange, Range } from '../../core/range.js';
import { ensureValidWordDefinition, getWordAtText, IWordAtPosition } from '../../core/wordHelper.js';
import { IDocumentColorComputerTarget } from '../../languages/defaultDocumentColorsComputer.js';
import { ILinkComputerTarget } from '../../languages/linkComputer.js';
import { MirrorTextModel as BaseMirrorModel, IModelChangedEvent } from '../../model/mirrorTextModel.js';
import { IMirrorModel, IWordRange } from '../editorSimpleWorker.js';
import { IModelService } from '../model.js';
import { IRawModelData, IWorkerTextModelSyncChannelServer } from './textModelSync.protocol.js';

/**
 * Stop syncing a model to the worker if it was not needed for 1 min.
 */
export const STOP_SYNC_MODEL_DELTA_TIME_MS = 60 * 1000;

export const WORKER_TEXT_MODEL_SYNC_CHANNEL = 'workerTextModelSync';

export class WorkerTextModelSyncClient extends Disposable {

	public static create(workerClient: IWorkerClient<any>, modelService: IModelService): WorkerTextModelSyncClient {
		return new WorkerTextModelSyncClient(
			workerClient.getChannel<IWorkerTextModelSyncChannelServer>(WORKER_TEXT_MODEL_SYNC_CHANNEL),
			modelService
		);
	}

	private readonly _proxy: IWorkerTextModelSyncChannelServer;
	private readonly _modelService: IModelService;
	private _syncedModels: { [modelUrl: string]: IDisposable } = Object.create(null);
	private _syncedModelsLastUsedTime: { [modelUrl: string]: number } = Object.create(null);

	constructor(proxy: IWorkerTextModelSyncChannelServer, modelService: IModelService, keepIdleModels: boolean = false) {
		super();
		this._proxy = proxy;
		this._modelService = modelService;

		if (!keepIdleModels) {
			const timer = new IntervalTimer();
			timer.cancelAndSet(() => this._checkStopModelSync(), Math.round(STOP_SYNC_MODEL_DELTA_TIME_MS / 2));
			this._register(timer);
		}
	}

	public override dispose(): void {
		for (const modelUrl in this._syncedModels) {
			dispose(this._syncedModels[modelUrl]);
		}
		this._syncedModels = Object.create(null);
		this._syncedModelsLastUsedTime = Object.create(null);
		super.dispose();
	}

	public ensureSyncedResources(resources: URI[], forceLargeModels: boolean = false): void {
		for (const resource of resources) {
			const resourceStr = resource.toString();

			if (!this._syncedModels[resourceStr]) {
				this._beginModelSync(resource, forceLargeModels);
			}
			if (this._syncedModels[resourceStr]) {
				this._syncedModelsLastUsedTime[resourceStr] = (new Date()).getTime();
			}
		}
	}

	private _checkStopModelSync(): void {
		const currentTime = (new Date()).getTime();

		const toRemove: string[] = [];
		for (const modelUrl in this._syncedModelsLastUsedTime) {
			const elapsedTime = currentTime - this._syncedModelsLastUsedTime[modelUrl];
			if (elapsedTime > STOP_SYNC_MODEL_DELTA_TIME_MS) {
				toRemove.push(modelUrl);
			}
		}

		for (const e of toRemove) {
			this._stopModelSync(e);
		}
	}

	private _beginModelSync(resource: URI, forceLargeModels: boolean): void {
		const model = this._modelService.getModel(resource);
		if (!model) {
			return;
		}
		if (!forceLargeModels && model.isTooLargeForSyncing()) {
			return;
		}

		const modelUrl = resource.toString();

		this._proxy.$acceptNewModel({
			url: model.uri.toString(),
			lines: model.getLinesContent(),
			EOL: model.getEOL(),
			versionId: model.getVersionId()
		});

		const toDispose = new DisposableStore();
		toDispose.add(model.onDidChangeContent((e) => {
			this._proxy.$acceptModelChanged(modelUrl.toString(), e);
		}));
		toDispose.add(model.onWillDispose(() => {
			this._stopModelSync(modelUrl);
		}));
		toDispose.add(toDisposable(() => {
			this._proxy.$acceptRemovedModel(modelUrl);
		}));

		this._syncedModels[modelUrl] = toDispose;
	}

	private _stopModelSync(modelUrl: string): void {
		const toDispose = this._syncedModels[modelUrl];
		delete this._syncedModels[modelUrl];
		delete this._syncedModelsLastUsedTime[modelUrl];
		dispose(toDispose);
	}
}

export class WorkerTextModelSyncServer implements IWorkerTextModelSyncChannelServer {

	private readonly _models: { [uri: string]: MirrorModel };

	constructor() {
		this._models = Object.create(null);
	}

	public bindToServer(workerServer: IWorkerServer): void {
		workerServer.setChannel(WORKER_TEXT_MODEL_SYNC_CHANNEL, this);
	}

	public getModel(uri: string): ICommonModel | undefined {
		return this._models[uri];
	}

	public getModels(): ICommonModel[] {
		const all: MirrorModel[] = [];
		Object.keys(this._models).forEach((key) => all.push(this._models[key]));
		return all;
	}

	$acceptNewModel(data: IRawModelData): void {
		this._models[data.url] = new MirrorModel(URI.parse(data.url), data.lines, data.EOL, data.versionId);
	}

	$acceptModelChanged(uri: string, e: IModelChangedEvent): void {
		if (!this._models[uri]) {
			return;
		}
		const model = this._models[uri];
		model.onEvents(e);
	}

	$acceptRemovedModel(uri: string): void {
		if (!this._models[uri]) {
			return;
		}
		delete this._models[uri];
	}
}

export class MirrorModel extends BaseMirrorModel implements ICommonModel {

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
