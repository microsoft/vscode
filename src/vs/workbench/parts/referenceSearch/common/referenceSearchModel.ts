/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import * as errors from 'vs/base/common/errors';
import { RunOnceScheduler, createCancelablePromise } from 'vs/base/common/async';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { values, ResourceMap } from 'vs/base/common/map';
import { Event, Emitter, fromPromise, stopwatch, anyEvent } from 'vs/base/common/event';
import { IReferenceSearchProgressItem, IReferenceSearchComplete, IReferenceSearchQueryInfo, IFileMatch, ILineMatch } from 'vs/workbench/parts/referenceSearch/common/referenceSearch';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { overviewRulerFindMatchForeground } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { getBaseLabel } from 'vs/base/common/labels';
import { provideReferences } from 'vs/editor/contrib/referenceSearch/referenceSearch';
import { groupBy } from 'vs/base/common/arrays';

export class Match {

	private _lineText: string;
	private _id: string;
	private _range: Range;

	constructor(private _parent: FileMatch, text: string, lineNumber: number, offset: number, length: number) {
		this._lineText = text;
		this._range = new Range(1 + lineNumber, 1 + offset, 1 + lineNumber, 1 + offset + length);
		this._id = this._parent.id() + '>' + lineNumber + '>' + offset + this.getMatchString();
	}

	public id(): string {
		return this._id;
	}

	public parent(): FileMatch {
		return this._parent;
	}

	public text(): string {
		return this._lineText;
	}

	public range(): Range {
		return this._range;
	}

	public preview(): { before: string; inside: string; after: string; } {
		let before = this._lineText.substring(0, this._range.startColumn - 1),
			inside = this.getMatchString(),
			after = this._lineText.substring(this._range.endColumn - 1, Math.min(this._range.endColumn + 150, this._lineText.length));

		before = strings.lcut(before, 26);

		return {
			before,
			inside,
			after,
		};
	}

	public getMatchString(): string {
		return this._lineText.substring(this._range.startColumn - 1, this._range.endColumn - 1);
	}
}

export class FileMatch extends Disposable {

	private static readonly _CURRENT_FIND_MATCH = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		zIndex: 13,
		className: 'currentFindMatch',
		overviewRuler: {
			color: themeColorFromId(overviewRulerFindMatchForeground),
			darkColor: themeColorFromId(overviewRulerFindMatchForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static readonly _FIND_MATCH = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch',
		overviewRuler: {
			color: themeColorFromId(overviewRulerFindMatchForeground),
			darkColor: themeColorFromId(overviewRulerFindMatchForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static getDecorationOption(selected: boolean): ModelDecorationOptions {
		return (selected ? FileMatch._CURRENT_FIND_MATCH : FileMatch._FIND_MATCH);
	}

	private _onChange = this._register(new Emitter<boolean>());
	public readonly onChange: Event<boolean> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	public readonly onDispose: Event<void> = this._onDispose.event;

	private _resource: URI;
	private _model: ITextModel;
	private _modelListener: IDisposable;
	private _matches: Map<string, Match>;
	private _removedMatches: Set<string>;
	private _selectedMatch: Match;

	private _updateScheduler: RunOnceScheduler;
	private _modelDecorations: string[] = [];

	constructor(private _parent: FolderMatch, private rawMatch: IFileMatch,
		@IModelService private modelService: IModelService) {
		super();
		this._resource = this.rawMatch.resource;
		this._matches = new Map<string, Match>();
		this._removedMatches = new Set<string>();
		this._updateScheduler = new RunOnceScheduler(this.updateMatchesForModel.bind(this), 250);

		this.createMatches();
		this.registerListeners();
	}

	private createMatches(): void {
		this.rawMatch.lineMatches.forEach((rawLineMatch) => {
			rawLineMatch.offsetAndLengths.forEach(offsetAndLength => {
				let match = new Match(this, rawLineMatch.preview, rawLineMatch.lineNumber, offsetAndLength[0], offsetAndLength[1]);
				this.add(match);
			});
		});
	}

	private registerListeners(): void {
		this._register(this.modelService.onModelAdded((model: ITextModel) => {
			if (model.uri.toString() === this._resource.toString()) {
				this.bindModel(model);
			}
		}));
	}

	private bindModel(model: ITextModel): void {
		this._model = model;
		this._modelListener = this._model.onDidChangeContent(() => {
			this._updateScheduler.schedule();
		});
		this._model.onWillDispose(() => this.onModelWillDispose());
		this.updateHighlights();
	}

	private onModelWillDispose(): void {
		// Update matches because model might have some dirty changes
		this.updateMatchesForModel();
		this.unbindModel();
	}

	private unbindModel(): void {
		if (this._model) {
			this._updateScheduler.cancel();
			this._model.deltaDecorations(this._modelDecorations, []);
			this._model = null;
			this._modelListener.dispose();
		}
	}

	private updateMatchesForModel(): void {
		// TODO (acasey): can we be resilient to model changes?
	}

	public updateHighlights(): void {
		if (!this._model) {
			return;
		}

		if (this.parent().showHighlights) {
			this._modelDecorations = this._model.deltaDecorations(this._modelDecorations, this.matches().map(match => <IModelDeltaDecoration>{
				range: match.range(),
				options: FileMatch.getDecorationOption(this.isMatchSelected(match))
			}));
		} else {
			this._modelDecorations = this._model.deltaDecorations(this._modelDecorations, []);
		}
	}

	public id(): string {
		return this.resource().toString();
	}

	public parent(): FolderMatch {
		return this._parent;
	}

	public matches(): Match[] {
		return values(this._matches);
	}

	public remove(match: Match): void {
		this.removeMatch(match);
		this._removedMatches.add(match.id());
		this._onChange.fire(false);
	}

	public setSelectedMatch(match: Match) {
		if (match) {
			if (!this._matches.has(match.id())) {
				return;
			}
			if (this.isMatchSelected(match)) {
				return;
			}
		}
		this._selectedMatch = match;
		this.updateHighlights();
	}

	public getSelectedMatch(): Match {
		return this._selectedMatch;
	}

	public isMatchSelected(match: Match): boolean {
		return this._selectedMatch && this._selectedMatch.id() === match.id();
	}

	public count(): number {
		return this.matches().length;
	}

	public resource(): URI {
		return this._resource;
	}

	public name(): string {
		return getBaseLabel(this.resource());
	}

	public add(match: Match, trigger?: boolean) {
		this._matches.set(match.id(), match);
		if (trigger) {
			this._onChange.fire(true);
		}
	}

	private removeMatch(match: Match) {
		this._matches.delete(match.id());
		if (this.isMatchSelected(match)) {
			this.setSelectedMatch(null);
		} else {
			this.updateHighlights();
		}
	}

	public dispose(): void {
		this.setSelectedMatch(null);
		this.unbindModel();
		this._onDispose.fire();
		super.dispose();
	}
}

export interface IChangeEvent {
	elements: FileMatch[];
	added?: boolean;
	removed?: boolean;
}

export class FolderMatch extends Disposable {

	private _onChange = this._register(new Emitter<IChangeEvent>());
	public readonly onChange: Event<IChangeEvent> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	public readonly onDispose: Event<void> = this._onDispose.event;

	private _fileMatches: ResourceMap<FileMatch>;
	private _unDisposedFileMatches: ResourceMap<FileMatch>;
	private _replacingAll: boolean = false;

	constructor(private _resource: URI, private _id: string, private _index: number, private _parent: ReferenceSearchResult, private _referenceSearchModel: ReferenceSearchModel,
		@IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._fileMatches = new ResourceMap<FileMatch>();
		this._unDisposedFileMatches = new ResourceMap<FileMatch>();
	}

	public get referenceSearchModel(): ReferenceSearchModel {
		return this._referenceSearchModel;
	}

	public get showHighlights(): boolean {
		return this._parent.showHighlights;
	}

	public set replacingAll(b: boolean) {
		this._replacingAll = b;
	}

	public id(): string {
		return this._id;
	}

	public resource(): URI {
		return this._resource;
	}

	public index(): number {
		return this._index;
	}

	public name(): string {
		return getBaseLabel(this.resource());
	}

	public parent(): ReferenceSearchResult {
		return this._parent;
	}

	public hasRoot(): boolean {
		return this._resource.fsPath !== '';
	}

	public add(raw: IFileMatch[], silent: boolean): void {
		let changed: FileMatch[] = [];
		raw.forEach((rawFileMatch) => {
			if (this._fileMatches.has(rawFileMatch.resource)) {
				this._fileMatches.get(rawFileMatch.resource).dispose();
			}

			let fileMatch = this.instantiationService.createInstance(FileMatch, this, rawFileMatch);
			this.doAdd(fileMatch);
			changed.push(fileMatch);
			let disposable = fileMatch.onChange(() => this.onFileChange(fileMatch));
			fileMatch.onDispose(() => disposable.dispose());
		});
		if (!silent && changed.length) {
			this._onChange.fire({ elements: changed, added: true });
		}
	}

	public clear(): void {
		let changed: FileMatch[] = this.matches();
		this.disposeMatches();
		this._onChange.fire({ elements: changed, removed: true });
	}

	public remove(match: FileMatch): void {
		this.doRemove(match);
	}

	public matches(): FileMatch[] {
		return this._fileMatches.values();
	}

	public isEmpty(): boolean {
		return this.fileCount() === 0;
	}

	public fileCount(): number {
		return this._fileMatches.size;
	}

	public count(): number {
		return this.matches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	private onFileChange(fileMatch: FileMatch): void {
		let added: boolean = false;
		let removed: boolean = false;
		if (!this._fileMatches.has(fileMatch.resource())) {
			this.doAdd(fileMatch);
			added = true;
		}
		if (fileMatch.count() === 0) {
			this.doRemove(fileMatch, false, false);
			added = false;
			removed = true;
		}
		if (!this._replacingAll) {
			this._onChange.fire({ elements: [fileMatch], added: added, removed: removed });
		}
	}

	private doAdd(fileMatch: FileMatch): void {
		this._fileMatches.set(fileMatch.resource(), fileMatch);
		if (this._unDisposedFileMatches.has(fileMatch.resource())) {
			this._unDisposedFileMatches.delete(fileMatch.resource());
		}
	}

	private doRemove(fileMatch: FileMatch, dispose: boolean = true, trigger: boolean = true): void {
		this._fileMatches.delete(fileMatch.resource());
		if (dispose) {
			fileMatch.dispose();
		} else {
			this._unDisposedFileMatches.set(fileMatch.resource(), fileMatch);
		}

		if (trigger) {
			this._onChange.fire({ elements: [fileMatch], removed: true });
		}
	}

	private disposeMatches(): void {
		this._fileMatches.values().forEach((fileMatch: FileMatch) => fileMatch.dispose());
		this._unDisposedFileMatches.values().forEach((fileMatch: FileMatch) => fileMatch.dispose());
		this._fileMatches.clear();
		this._unDisposedFileMatches.clear();
	}

	public dispose(): void {
		this.disposeMatches();
		this._onDispose.fire();
		super.dispose();
	}
}

/**
 * Compares instances of the same match type. Different match types should not be siblings
 * and their sort order is undefined.
 */
export function referenceSearchMatchComparer(elementA: RenderableMatch, elementB: RenderableMatch): number {
	if (elementA instanceof FolderMatch && elementB instanceof FolderMatch) {
		return elementA.index() - elementB.index();
	}

	if (elementA instanceof FileMatch && elementB instanceof FileMatch) {
		return elementA.resource().fsPath.localeCompare(elementB.resource().fsPath) || elementA.name().localeCompare(elementB.name());
	}

	if (elementA instanceof Match && elementB instanceof Match) {
		return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
	}

	return undefined;
}

export class ReferenceSearchResult extends Disposable {

	private _onChange = this._register(new Emitter<IChangeEvent>());
	public readonly onChange: Event<IChangeEvent> = this._onChange.event;

	private _folderMatch: FolderMatch;
	private _showHighlights: boolean;

	private _rangeHighlightDecorations: RangeHighlightDecorations;

	constructor(private _referenceSearchModel: ReferenceSearchModel,
		@IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);
	}

	public set query(queryInfo: IReferenceSearchQueryInfo) {
		// When updating the query we could change the roots, so ensure we clean up the old roots first.
		this.clear();
		const otherFiles = URI.parse('');
		this._folderMatch = [otherFiles].map((resource, index) => {
			const id = resource.toString() || 'otherFiles';
			const folderMatch = this.instantiationService.createInstance(FolderMatch, resource, id, index, this, this._referenceSearchModel);
			const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
			folderMatch.onDispose(() => disposable.dispose());
			return folderMatch;
		})[0]; // TODO (acasey): clean up
	}

	public add(allRaw: IFileMatch[], silent: boolean = false): void {
		this._folderMatch.add(allRaw, silent);
	}

	public clear(): void {
		if (this._folderMatch) {
			this._folderMatch.clear();
		}
		this.disposeMatches();
	}

	public remove(match: FileMatch | FolderMatch): void {
		if (match instanceof FileMatch) {
			this._folderMatch.remove(match);
		} else {
			match.clear();
		}
	}

	public folderMatches(): FolderMatch[] {
		return this._folderMatch ? [this._folderMatch] : [];
	}

	public matches(): FileMatch[] {
		return this._folderMatch ? [...this._folderMatch.matches()] : [];
	}

	public isEmpty(): boolean {
		return !this._folderMatch || this._folderMatch.isEmpty();
	}

	public fileCount(): number {
		return this._folderMatch ? this._folderMatch.fileCount() : 0;
	}

	public count(): number {
		return this.matches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	public get showHighlights(): boolean {
		return this._showHighlights;
	}

	public toggleHighlights(value: boolean): void {
		if (this._showHighlights === value) {
			return;
		}
		this._showHighlights = value;
		let selectedMatch: Match = null;
		this.matches().forEach((fileMatch: FileMatch) => {
			fileMatch.updateHighlights();
			if (!selectedMatch) {
				selectedMatch = fileMatch.getSelectedMatch();
			}
		});
		if (this._showHighlights && selectedMatch) {
			this._rangeHighlightDecorations.highlightRange(
				selectedMatch.parent().resource(),
				selectedMatch.range()
			);
		} else {
			this._rangeHighlightDecorations.removeHighlightRange();
		}
	}

	public get rangeHighlightDecorations(): RangeHighlightDecorations {
		return this._rangeHighlightDecorations;
	}

	private disposeMatches(): void {
		if (this._folderMatch) {
			this._folderMatch.dispose();
			this._folderMatch = undefined;
		}
		this._rangeHighlightDecorations.removeHighlightRange();
	}

	public dispose(): void {
		this.disposeMatches();
		this._rangeHighlightDecorations.dispose();
		super.dispose();
	}
}

export class ReferenceSearchModel extends Disposable {

	private _referenceSearchResult: ReferenceSearchResult;
	private _referenceSearchQuery: IReferenceSearchQueryInfo = null;

	private currentRequest: TPromise<IReferenceSearchComplete>;

	constructor(@IModelService private modelService: IModelService, @ITelemetryService private telemetryService: ITelemetryService, @IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._referenceSearchResult = this.instantiationService.createInstance(ReferenceSearchResult, this);
	}

	public get referenceSearchResult(): ReferenceSearchResult {
		return this._referenceSearchResult;
	}

	public referenceSearch(queryInfo: IReferenceSearchQueryInfo, onProgress?: (result: IReferenceSearchProgressItem) => void): TPromise<IReferenceSearchComplete> {
		this.cancelReferenceSearch();

		this._referenceSearchQuery = queryInfo;
		this.referenceSearchResult.clear();
		this._referenceSearchResult.query = this._referenceSearchQuery;

		const progressEmitter = new Emitter<void>();

		this.currentRequest = this.referenceSearchWorker(this._referenceSearchQuery, p => {
			progressEmitter.fire();
			this.onReferenceSearchProgress(p);

			if (onProgress) {
				onProgress(p);
			}
		});

		const onDone = fromPromise(this.currentRequest);
		const onFirstRender = anyEvent<any>(onDone, progressEmitter.event);
		const onFirstRenderStopwatch = stopwatch(onFirstRender);
		/* __GDPR__
			"referenceSearchResultsFirstRender" : {
				"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		onFirstRenderStopwatch(duration => this.telemetryService.publicLog('referenceSearchResultsFirstRender', { duration }));

		const onDoneStopwatch = stopwatch(onDone);
		const start = Date.now();

		/* __GDPR__
			"referenceSearchResultsFinished" : {
				"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		onDoneStopwatch(duration => this.telemetryService.publicLog('referenceSearchResultsFinished', { duration }));

		const currentRequest = this.currentRequest;
		this.currentRequest.then(
			value => this.onReferenceSearchCompleted(value, Date.now() - start),
			e => this.onReferenceSearchError(e, Date.now() - start));

		// this.currentRequest may be completed (and nulled) immediately
		return currentRequest;
	}

	private referenceSearchWorker(queryInfo: IReferenceSearchQueryInfo, onProgress?: (item: IReferenceSearchProgressItem) => void): TPromise<IReferenceSearchComplete> {
		const model = this.modelService.getModel(queryInfo.uri);
		const cancelablePromise = createCancelablePromise(token => provideReferences(model, queryInfo.position, token).then(locations => {
			const locationsByFile = groupBy(locations, (a, b) => strings.compare(a.uri.toString(), b.uri.toString()));
			const fileMatches = locationsByFile.map(locationsInFile => {
				const locationsByLine = groupBy(locationsInFile, (a, b) => a.range.startLineNumber - b.range.startLineNumber);
				const lineMatches = locationsByLine.map(locationsInLine => {
					const lineNumber = locationsInLine[0].range.startLineNumber;
					const lineMatch: ILineMatch = {
						preview: model.getLineContent(lineNumber),
						lineNumber,
						offsetAndLengths: locationsInLine.map(location => [location.range.startColumn - 1, location.range.endColumn - location.range.startColumn]), // TODO (acasey): why -1?
					};
					return lineMatch;
				});

				const fileMatch: IFileMatch = {
					resource: locationsInFile[0].uri,
					lineMatches
				};

				if (onProgress) {
					onProgress(fileMatch);
				}

				return fileMatch;
			});
			return fileMatches;
		}).then(fileMatches => {
			const result: IReferenceSearchComplete = {
				limitHit: false,
				results: fileMatches,
				stats: undefined
			};
			return result;
		}));

		return new TPromise<IReferenceSearchComplete>(
			(onComplete, onError) => cancelablePromise.then(onComplete, onError),
			() => cancelablePromise.cancel());
	}

	private onReferenceSearchCompleted(completed: IReferenceSearchComplete, duration: number): IReferenceSearchComplete {
		this.currentRequest = null;

		/* __GDPR__
			"referenceSearchResultsShown" : {
				"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"fileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('referenceSearchResultsShown', {
			count: this._referenceSearchResult.count(),
			fileCount: this._referenceSearchResult.fileCount(),
			duration,
		});
		return completed;
	}

	private onReferenceSearchError(e: any, duration: number): void {
		if (errors.isPromiseCanceledError(e)) {
			this.onReferenceSearchCompleted(null, duration);
		}
	}

	private onReferenceSearchProgress(p: IReferenceSearchProgressItem): void {
		if (p.resource) {
			this._referenceSearchResult.add([p], true);
		}
	}

	public cancelReferenceSearch(): boolean {
		if (this.currentRequest) {
			this.currentRequest.cancel();
			this.currentRequest = null;
			return true;
		}
		return false;
	}

	public dispose(): void {
		this.cancelReferenceSearch();
		this.referenceSearchResult.dispose();
		super.dispose();
	}
}

export type FileMatchOrMatch = FileMatch | Match;

export type RenderableMatch = FolderMatch | FileMatch | Match;

export class ReferenceSearchWorkbenchService implements IReferenceSearchWorkbenchService {

	_serviceBrand: any;
	private _referenceSearchModel: ReferenceSearchModel;

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
	}

	get referenceSearchModel(): ReferenceSearchModel {
		if (!this._referenceSearchModel) {
			this._referenceSearchModel = this.instantiationService.createInstance(ReferenceSearchModel);
		}
		return this._referenceSearchModel;
	}
}

export const IReferenceSearchWorkbenchService = createDecorator<IReferenceSearchWorkbenchService>('referenceSearchWorkbenchService');

export interface IReferenceSearchWorkbenchService {
	_serviceBrand: any;

	readonly referenceSearchModel: ReferenceSearchModel;
}

/**
 * Can add a range highlight decoration to a model.
 * It will automatically remove it when the model has its decorations changed.
 */
export class RangeHighlightDecorations implements IDisposable {

	private _decorationId: string = null;
	private _model: ITextModel = null;
	private _modelDisposables: IDisposable[] = [];

	constructor(
		@IModelService private readonly _modelService: IModelService
	) {
	}

	public removeHighlightRange() {
		if (this._model && this._decorationId) {
			this._model.deltaDecorations([this._decorationId], []);
		}
		this._decorationId = null;
	}

	public highlightRange(resource: URI | ITextModel, range: Range, ownerId: number = 0): void {
		let model: ITextModel;
		if (URI.isUri(resource)) {
			model = this._modelService.getModel(resource);
		} else {
			model = resource;
		}

		if (model) {
			this.doHighlightRange(model, range);
		}
	}

	private doHighlightRange(model: ITextModel, range: Range) {
		this.removeHighlightRange();
		this._decorationId = model.deltaDecorations([], [{ range: range, options: RangeHighlightDecorations._RANGE_HIGHLIGHT_DECORATION }])[0];
		this.setModel(model);
	}

	private setModel(model: ITextModel) {
		if (this._model !== model) {
			this.disposeModelListeners();
			this._model = model;
			this._modelDisposables.push(this._model.onDidChangeDecorations((e) => {
				this.disposeModelListeners();
				this.removeHighlightRange();
				this._model = null;
			}));
			this._modelDisposables.push(this._model.onWillDispose(() => {
				this.disposeModelListeners();
				this.removeHighlightRange();
				this._model = null;
			}));
		}
	}

	private disposeModelListeners() {
		this._modelDisposables.forEach(disposable => disposable.dispose());
		this._modelDisposables = [];
	}

	public dispose() {
		if (this._model) {
			this.removeHighlightRange();
			this.disposeModelListeners();
			this._model = null;
		}
	}

	private static readonly _RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight',
		isWholeLine: true
	});
}
