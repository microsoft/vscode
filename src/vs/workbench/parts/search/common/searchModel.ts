/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import paths = require('vs/base/common/paths');
import objects = require('vs/base/common/objects');
import strings = require('vs/base/common/strings');
import errors = require('vs/base/common/errors');
import { RunOnceScheduler } from 'vs/base/common/async';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { TPromise, PPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { LinkedMap } from 'vs/base/common/map';
import { ArraySet } from 'vs/base/common/set';
import Event, { Emitter, fromPromise, stopwatch, any } from 'vs/base/common/event';
import { ISearchService, ISearchProgressItem, ISearchComplete, ISearchQuery, IPatternInfo, IFileMatch } from 'vs/platform/search/common/search';
import { ReplacePattern } from 'vs/platform/search/common/replace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Range } from 'vs/editor/common/core/range';
import { IModel, IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness, IModelDecorationOptions, FindMatch } from 'vs/editor/common/editorCommon';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { IProgressRunner } from 'vs/platform/progress/common/progress';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';

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

	public get replaceString(): string {
		let searchModel = this.parent().parent().searchModel;
		let matchString = this.getMatchString();
		let replaceString = searchModel.replacePattern.getReplaceString(matchString);
		// If match string is not matching then regex pattern has a lookahead expression
		if (replaceString === null) {
			replaceString = searchModel.replacePattern.getReplaceString(matchString + this._lineText.substring(this._range.endColumn - 1));
		}
		return replaceString;
	}

	public getMatchString(): string {
		return this._lineText.substring(this._range.startColumn - 1, this._range.endColumn - 1);
	}
}

export class FileMatch extends Disposable {

	private static getDecorationOption(selected: boolean): IModelDecorationOptions {
		return {
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: selected ? 'currentFindMatch' : 'findMatch',
			overviewRuler: {
				color: 'rgba(246, 185, 77, 0.7)',
				darkColor: 'rgba(246, 185, 77, 0.7)',
				position: OverviewRulerLane.Center
			}
		};
	}

	private _onChange = this._register(new Emitter<boolean>());
	public onChange: Event<boolean> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	public onDispose: Event<void> = this._onDispose.event;

	private _resource: URI;
	private _model: IModel;
	private _modelListener: IDisposable;
	private _matches: LinkedMap<string, Match>;
	private _removedMatches: ArraySet<string>;
	private _selectedMatch: Match;

	private _updateScheduler: RunOnceScheduler;
	private _modelDecorations: string[] = [];

	constructor(private _query: IPatternInfo, private _parent: SearchResult, private rawMatch: IFileMatch,
		@IModelService private modelService: IModelService, @IReplaceService private replaceService: IReplaceService) {
		super();
		this._resource = this.rawMatch.resource;
		this._matches = new LinkedMap<string, Match>();
		this._removedMatches = new ArraySet<string>();
		this._updateScheduler = new RunOnceScheduler(this.updateMatchesForModel.bind(this), 250);

		this.createMatches();
		this.registerListeners();
	}

	private createMatches(): void {
		let model = this.modelService.getModel(this._resource);
		if (model) {
			this.bindModel(model);
			this.updateMatchesForModel();
		} else {
			this.rawMatch.lineMatches.forEach((rawLineMatch) => {
				rawLineMatch.offsetAndLengths.forEach(offsetAndLength => {
					let match = new Match(this, rawLineMatch.preview, rawLineMatch.lineNumber, offsetAndLength[0], offsetAndLength[1]);
					this.add(match);
				});
			});
		}
	}

	private registerListeners(): void {
		this._register(this.modelService.onModelAdded((model: IModel) => {
			if (model.uri.toString() === this._resource.toString()) {
				this.bindModel(model);
			}
		}));
	}

	private bindModel(model: IModel): void {
		this._model = model;
		this._modelListener = this._model.onDidChangeContent(_ => {
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
		// this is called from a timeout and might fire
		// after the model has been disposed
		if (!this._model) {
			return;
		}
		this._matches = new LinkedMap<string, Match>();
		let matches = this._model
			.findMatches(this._query.pattern, this._model.getFullModelRange(), this._query.isRegExp, this._query.isCaseSensitive, this._query.isWordMatch, false);

		this.updateMatches(matches);
	}

	private updatesMatchesForLine(lineNumber: number): void {
		const range = {
			startLineNumber: lineNumber,
			startColumn: this._model.getLineMinColumn(lineNumber),
			endLineNumber: lineNumber,
			endColumn: this._model.getLineMaxColumn(lineNumber)
		};
		const oldMatches = this._matches.values().filter(match => match.range().startLineNumber === lineNumber);
		oldMatches.forEach(match => this._matches.delete(match.id()));

		const matches = this._model.findMatches(this._query.pattern, range, this._query.isRegExp, this._query.isCaseSensitive, this._query.isWordMatch, false);
		this.updateMatches(matches);
	}

	private updateMatches(matches: FindMatch[]) {
		matches.forEach(m => {
			let match = new Match(this, this._model.getLineContent(m.range.startLineNumber), m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endColumn - m.range.startColumn);
			if (!this._removedMatches.contains(match.id())) {
				this.add(match);
				if (this.isMatchSelected(match)) {
					this._selectedMatch = match;
				}
			}
		});

		this._onChange.fire(true);
		this.updateHighlights();
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

	public parent(): SearchResult {
		return this._parent;
	}

	public matches(): Match[] {
		return this._matches.values();
	}

	public remove(match: Match): void {
		this.removeMatch(match);
		this._removedMatches.set(match.id());
		this._onChange.fire(false);
	}

	public replace(toReplace: Match): TPromise<void> {
		return this.replaceService.replace(toReplace)
			.then(() => this.updatesMatchesForLine(toReplace.range().startLineNumber));
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
		return paths.basename(this.resource().fsPath);
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

export class SearchResult extends Disposable {

	private _onChange = this._register(new Emitter<IChangeEvent>());
	public onChange: Event<IChangeEvent> = this._onChange.event;

	private _fileMatches: LinkedMap<URI, FileMatch>;
	private _unDisposedFileMatches: LinkedMap<URI, FileMatch>;
	private _query: IPatternInfo = null;
	private _showHighlights: boolean;
	private _replacingAll: boolean = false;

	private _rangeHighlightDecorations: RangeHighlightDecorations;

	constructor(private _searchModel: SearchModel, @IReplaceService private replaceService: IReplaceService, @ITelemetryService private telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._fileMatches = new LinkedMap<URI, FileMatch>();
		this._unDisposedFileMatches = new LinkedMap<URI, FileMatch>();
		this._rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);
	}

	public set query(query: IPatternInfo) {
		this._query = query;
	}

	public get searchModel(): SearchModel {
		return this._searchModel;
	}

	public add(raw: IFileMatch[], silent: boolean = false): void {
		let changed: FileMatch[] = [];
		raw.forEach((rawFileMatch) => {
			if (!this._fileMatches.has(rawFileMatch.resource)) {
				let fileMatch = this.instantiationService.createInstance(FileMatch, this._query, this, rawFileMatch);
				this.doAdd(fileMatch);
				changed.push(fileMatch);
				let disposable = fileMatch.onChange(() => this.onFileChange(fileMatch));
				fileMatch.onDispose(() => disposable.dispose());
			}
		});
		if (!silent) {
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

	public replace(match: FileMatch): TPromise<any> {
		return this.replaceService.replace([match]).then(() => {
			this.doRemove(match, false, true);
		});
	}

	public replaceAll(progressRunner: IProgressRunner): TPromise<any> {
		this._replacingAll = true;

		const promise = this.replaceService.replace(this.matches(), progressRunner);
		const onDone = stopwatch(fromPromise(promise));
		onDone(duration => this.telemetryService.publicLog('replaceAll.started', { duration }));

		return promise.then(() => {
			this._replacingAll = false;
			this.clear();
		}, () => {
			this._replacingAll = false;
		});
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
			this._rangeHighlightDecorations.highlightRange({
				resource: selectedMatch.parent().resource(),
				range: selectedMatch.range()
			});
		} else {
			this._rangeHighlightDecorations.removeHighlightRange();
		}
	}

	public get rangeHighlightDecorations(): RangeHighlightDecorations {
		return this._rangeHighlightDecorations;
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
		this._rangeHighlightDecorations.removeHighlightRange();
	}

	public dispose(): void {
		this.disposeMatches();
		this._rangeHighlightDecorations.dispose();
		super.dispose();
	}
}

export class SearchModel extends Disposable {

	private _searchResult: SearchResult;
	private _searchQuery: ISearchQuery = null;
	private _replaceActive: boolean = false;
	private _replaceString: string = null;
	private _replacePattern: ReplacePattern = null;

	private _onReplaceTermChanged: Emitter<void> = this._register(new Emitter<void>());
	public onReplaceTermChanged: Event<void> = this._onReplaceTermChanged.event;

	private currentRequest: PPromise<ISearchComplete, ISearchProgressItem>;

	constructor( @ISearchService private searchService: ISearchService, @ITelemetryService private telemetryService: ITelemetryService, @IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._searchResult = this.instantiationService.createInstance(SearchResult, this);
	}

	public isReplaceActive(): boolean {
		return this._replaceActive;
	}

	public set replaceActive(replaceActive: boolean) {
		this._replaceActive = replaceActive;
	}

	public get replacePattern(): ReplacePattern {
		return this._replacePattern;
	}

	public get replaceString(): string {
		return this._replaceString;
	}

	public set replaceString(replaceString: string) {
		this._replaceString = replaceString;
		if (this._searchQuery) {
			this._replacePattern = new ReplacePattern(replaceString, this._searchQuery.contentPattern);
		}
		this._onReplaceTermChanged.fire();
	}

	public get searchResult(): SearchResult {
		return this._searchResult;
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		this.cancelSearch();
		this.searchResult.clear();

		this._searchQuery = query;
		this._searchResult.query = this._searchQuery.contentPattern;
		this._replacePattern = new ReplacePattern(this._replaceString, this._searchQuery.contentPattern);

		this.currentRequest = this.searchService.search(this._searchQuery);

		const onDone = fromPromise(this.currentRequest);
		const onDoneStopwatch = stopwatch(onDone);
		const start = Date.now();

		onDoneStopwatch(duration => this.telemetryService.publicLog('searchResultsFinished', { duration }));

		const progressEmitter = new Emitter<void>();
		const onFirstRender = any(onDone, progressEmitter.event);
		const onFirstRenderStopwatch = stopwatch(onFirstRender);

		onFirstRenderStopwatch(duration => this.telemetryService.publicLog('searchResultsFirstRender', { duration }));

		this.currentRequest.then(
			value => this.onSearchCompleted(value, Date.now() - start),
			e => this.onSearchError(e, Date.now() - start),
			p => {
				progressEmitter.fire();
				this.onSearchProgress(p);
			}
		);

		return this.currentRequest;
	}

	private onSearchCompleted(completed: ISearchComplete, duration: number): ISearchComplete {
		if (completed) {
			this._searchResult.add(completed.results, false);
		}
		const options: IPatternInfo = objects.assign({}, this._searchQuery.contentPattern);
		delete options.pattern;
		this.telemetryService.publicLog('searchResultsShown', {
			count: this._searchResult.count(),
			fileCount: this._searchResult.fileCount(),
			options,
			duration
		});
		return completed;
	}

	private onSearchError(e: any, duration: number): void {
		if (errors.isPromiseCanceledError(e)) {
			this.onSearchCompleted(null, duration);
		}
	}

	private onSearchProgress(p: ISearchProgressItem): void {
		if (p.resource) {
			this._searchResult.add([p], true);
		}
	}

	public cancelSearch(): boolean {
		if (this.currentRequest) {
			this.currentRequest.cancel();
			this.currentRequest = null;
			return true;
		}
		return false;
	}

	public dispose(): void {
		this.cancelSearch();
		this.searchResult.dispose();
		super.dispose();
	}
}

export type FileMatchOrMatch = FileMatch | Match;

export class SearchWorkbenchService implements ISearchWorkbenchService {

	_serviceBrand: any;
	private _searchModel: SearchModel;

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
	}

	get searchModel(): SearchModel {
		if (!this._searchModel) {
			this._searchModel = this.instantiationService.createInstance(SearchModel);
		}
		return this._searchModel;
	}
}

export const ISearchWorkbenchService = createDecorator<ISearchWorkbenchService>('searchWorkbenchService');

export interface ISearchWorkbenchService {
	_serviceBrand: any;

	readonly searchModel: SearchModel;
}
