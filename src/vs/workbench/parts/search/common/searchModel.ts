/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as timer from 'vs/base/common/timer';
import paths = require('vs/base/common/paths');
import strings = require('vs/base/common/strings');
import errors = require('vs/base/common/errors');
import { RunOnceScheduler } from 'vs/base/common/async';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { TPromise, PPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { SimpleMap } from 'vs/base/common/map';
import { ArraySet } from 'vs/base/common/set';
import Event, { Emitter } from 'vs/base/common/event';
import * as Search from 'vs/platform/search/common/search';
import { ISearchProgressItem, ISearchComplete, ISearchQuery } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Range } from 'vs/editor/common/core/range';
import { IModel, IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ISearchService } from 'vs/platform/search/common/search';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { IProgressRunner } from 'vs/platform/progress/common/progress';

export class Match {

	private _lineText: string;
	private _id: string;
	private _range: Range;

	constructor(private _parent: FileMatch, text: string, lineNumber: number, offset: number, length: number) {
		this._lineText = text;
		this._id = this._parent.id() + '>' + lineNumber + '>' + offset;
		this._range = new Range(1 + lineNumber, 1 + offset, 1 + lineNumber, 1 + offset + length);
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
			inside = this._lineText.substring(this._range.startColumn - 1, this._range.endColumn - 1),
			after = this._lineText.substring(this._range.endColumn - 1, Math.min(this._range.endColumn + 150, this._lineText.length));

		before = strings.lcut(before, 26);

		return {
			before,
			inside,
			after,
		};
	}
}

export class FileMatch extends Disposable {

	private static DecorationOption: IModelDecorationOptions = {
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch',
		overviewRuler: {
			color: 'rgba(246, 185, 77, 0.7)',
			darkColor: 'rgba(246, 185, 77, 0.7)',
			position: OverviewRulerLane.Center
		}
	};

	private _onChange= this._register(new Emitter<boolean>());
	public onChange: Event<boolean> = this._onChange.event;

	private _onDispose= this._register(new Emitter<void>());
	public onDispose: Event<void> = this._onDispose.event;

	private _resource: URI;
	private _model: IModel;
	private _modelListener: IDisposable;
	private _matches: SimpleMap<string, Match>;
	private _removedMatches: ArraySet<string>;

	private _updateScheduler: RunOnceScheduler;
	private _modelDecorations: string[] = [];

	constructor(private _query: Search.IPatternInfo, private _parent: SearchResult, private rawMatch: Search.IFileMatch,
										@IModelService private modelService: IModelService, @IReplaceService private replaceService: IReplaceService) {
		super();
		this._resource = this.rawMatch.resource;
		this._matches = new SimpleMap<string, Match>();
		this._removedMatches= new ArraySet<string>();
		this._updateScheduler = new RunOnceScheduler(this.updateMatches.bind(this), 250);

		this.createMatches();
		this.registerListeners();
	}

	private createMatches(): void {
		let model = this.modelService ? this.modelService.getModel(this._resource) : null;
		if (model) {
			this.bindModel(model);
			this.updateMatches();
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
		if (this.modelService) {
			this._register(this.modelService.onModelAdded((model: IModel) => {
				if (model.uri.toString() === this._resource.toString()) {
					this.bindModel(model);
				}
			}));
		}
	}

	private bindModel(model: IModel): void {
		this._model= model;
		this._modelListener= this._model.onDidChangeContent(_ => {
			this._updateScheduler.schedule();
		});
		this._model.onWillDispose(() => this.onModelWillDispose());
		this.updateHighlights();
	}

	private onModelWillDispose(): void {
		// Update matches because model might have some dirty changes
		this.updateMatches();
		this.unbindModel();
	}

	private unbindModel(): void {
		if (this._model) {
			this._updateScheduler.cancel();
			this._model.deltaDecorations(this._modelDecorations, []);
			this._model= null;
			this._modelListener.dispose();
		}
	}

	private updateMatches(): void {
		// this is called from a timeout and might fire
		// after the model has been disposed
		if (!this._model) {
			return;
		}
		this._matches = new SimpleMap<string, Match>();
		let matches = this._model
			.findMatches(this._query.pattern, this._model.getFullModelRange(), this._query.isRegExp, this._query.isCaseSensitive, this._query.isWordMatch);

		matches.forEach(range => {
			let match= new Match(this, this._model.getLineContent(range.startLineNumber), range.startLineNumber - 1, range.startColumn - 1, range.endColumn - range.startColumn);
			if (!this._removedMatches.contains(match.id())) {
				this.add(match);
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
				options: FileMatch.DecorationOption
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
		this._matches.delete(match.id());
		this._removedMatches.set(match.id());
		this._onChange.fire(false);
	}

	public replace(match: Match, replaceText: string): TPromise<any> {
		return this.replaceService.replace(match, replaceText).then(() => {
			this._matches.delete(match.id());
			this._onChange.fire(false);
		});
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

	public dispose(): void {
		this.unbindModel();
		this._onDispose.fire();
		super.dispose();
	}

	public add(match: Match, trigger?: boolean) {
		this._matches.set(match.id(), match);
		if (trigger) {
			this._onChange.fire(true);
		}
	}
}

export interface IChangeEvent {
	elements: FileMatch[];
	added?: boolean;
	removed?: boolean;
}

export class SearchResult extends Disposable {

	private _onChange= this._register(new Emitter<IChangeEvent>());
	public onChange: Event<IChangeEvent> = this._onChange.event;

	private _fileMatches: SimpleMap<URI, FileMatch>;
	private _unDisposedFileMatches: SimpleMap<URI, FileMatch>;
	private _query: Search.IPatternInfo= null;
	private _showHighlights: boolean;
	private _replacingAll: boolean= false;

	constructor(private _searchModel: SearchModel, @IReplaceService private replaceService: IReplaceService, @ITelemetryService private telemetryService: ITelemetryService,
													@IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._fileMatches= new SimpleMap<URI, FileMatch>();
		this._unDisposedFileMatches= new SimpleMap<URI, FileMatch>();
	}

	public set query(query: Search.IPatternInfo) {
		this._query= query;
	}

	public get searchModel(): SearchModel {
		return this._searchModel;
	}

	public add(raw: Search.IFileMatch[], silent:boolean= false): void {
		let changed: FileMatch[] = [];
		raw.forEach((rawFileMatch) => {
			if (!this._fileMatches.has(rawFileMatch.resource)){
				let fileMatch= this.instantiationService.createInstance(FileMatch, this._query, this, rawFileMatch);
				this.doAdd(fileMatch);
				changed.push(fileMatch);
				let disposable= fileMatch.onChange(() => this.onFileChange(fileMatch));
				fileMatch.onDispose(() => disposable.dispose());
			}
		});
		if (!silent) {
			this._onChange.fire({elements: changed, added: true});
		}
	}

	public clear(): void {
		let changed: FileMatch[]= this.matches();
		this.disposeMatches();
		this._onChange.fire({elements: changed, removed: true});
	}

	public remove(match: FileMatch): void {
		this.doRemove(match);
		this._onChange.fire({elements: [match], removed: true});
	}

	public replace(match: FileMatch, replaceText: string): TPromise<any> {
		return this.replaceService.replace([match], replaceText).then(() => {
			this.doRemove(match, false);
		});
	}

	public replaceAll(replaceText: string, progressRunner: IProgressRunner): TPromise<any> {
		this._replacingAll= true;
		let replaceAllTimer = this.telemetryService.timedPublicLog('replaceAll.started');
		return this.replaceService.replace(this.matches(), replaceText, progressRunner).then(() => {
			replaceAllTimer.stop();
			this._replacingAll= false;
			this.clear();
		}, () => {
			this._replacingAll= false;
			replaceAllTimer.stop();
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
		this.matches().forEach((fileMatch: FileMatch) => {
			fileMatch.updateHighlights();
		});
	}

	private onFileChange(fileMatch: FileMatch): void {
		let added: boolean= false;
		let removed: boolean= false;
		if (!this._fileMatches.has(fileMatch.resource())) {
			this.doAdd(fileMatch);
			added= true;
		}
		if (fileMatch.count() === 0) {
			this.doRemove(fileMatch, false);
			added= false;
			removed= true;
		}
		if (!this._replacingAll) {
			this._onChange.fire({elements: [fileMatch], added: added, removed: removed});
		}
	}

	private doAdd(fileMatch: FileMatch): void {
		this._fileMatches.set(fileMatch.resource(), fileMatch);
		if (this._unDisposedFileMatches.has(fileMatch.resource())) {
			this._unDisposedFileMatches.delete(fileMatch.resource());
		}
	}

	private doRemove(fileMatch: FileMatch, dispose:boolean= true): void {
		this._fileMatches.delete(fileMatch.resource());
		if (dispose) {
			fileMatch.dispose();
		} else {
			this._unDisposedFileMatches.set(fileMatch.resource(), fileMatch);
		}
	}

	private disposeMatches(): void {
		this._fileMatches.values().forEach((fileMatch: FileMatch) => fileMatch.dispose());
		this._unDisposedFileMatches.values().forEach((fileMatch: FileMatch) => fileMatch.dispose());
		this._fileMatches.clear();
		this._unDisposedFileMatches.clear();
	}

	public dispose():void {
		this.disposeMatches();
		super.dispose();
	}
}

export class SearchModel extends Disposable {

	private _searchResult: SearchResult;
	private _searchQuery: ISearchQuery= null;
	private _replaceText: string= null;

	private currentRequest: PPromise<ISearchComplete, ISearchProgressItem>;
	private progressTimer: timer.ITimerEvent;
	private doneTimer: timer.ITimerEvent;
	private timerEvent: timer.ITimerEvent;

	constructor(@ISearchService private searchService, @ITelemetryService private telemetryService: ITelemetryService, @IInstantiationService private instantiationService: IInstantiationService) {
		super();
		this._searchResult= this.instantiationService.createInstance(SearchResult, this);
	}

	/**
	 * Return true if replace is enabled otherwise false
	 */
	public isReplaceActive():boolean {
		return this.replaceText !== null && this.replaceText !== void 0;
	}

	/**
	 * Returns the text to replace.
	 * Can be null if replace is not enabled. Use replace() before.
	 * Can be empty.
	 */
	public get replaceText(): string {
		return this._replaceText;
	}

	public set replaceText(replace: string) {
		this._replaceText= replace;
	}

	public get searchResult():SearchResult {
		return this._searchResult;
	}

	/**
	 * Return true if replace is enabled and replace text is not empty, otherwise false.
	 * This is necessary in cases handling empty replace text when replace is active.
	 */
	public hasReplaceText():boolean {
		return this.isReplaceActive() && !!this.replaceText;
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		this.cancelSearch();
		this.searchResult.clear();

		this._searchQuery= query;
		this._searchResult.query= this._searchQuery.contentPattern;
		this.progressTimer = this.telemetryService.timedPublicLog('searchResultsFirstRender');
		this.doneTimer = this.telemetryService.timedPublicLog('searchResultsFinished');
		this.timerEvent = timer.start(timer.Topic.WORKBENCH, 'Search');
		this.currentRequest = this.searchService.search(this._searchQuery);

		this.currentRequest.then(value => this.onSearchCompleted(value),
									e => this.onSearchError(e),
									p => this.onSearchProgress(p));

		return this.currentRequest;
	}

	private onSearchCompleted(completed: ISearchComplete): ISearchComplete {
		this.progressTimer.stop();
		this.timerEvent.stop();
		this.doneTimer.stop();
		if (completed) {
			this._searchResult.add(completed.results, false);
		}
		this.telemetryService.publicLog('searchResultsShown', { count: this._searchResult.count(), fileCount: this._searchResult.fileCount() });
		return completed;
	}

	private onSearchError(e: any): void {
		if (errors.isPromiseCanceledError(e)) {
			this.onSearchCompleted(null);
		} else {
			this.progressTimer.stop();
			this.doneTimer.stop();
			this.timerEvent.stop();
		}
	}

	private onSearchProgress(p: ISearchProgressItem): void {
		if (p.resource) {
			this._searchResult.add([p], true);
			this.progressTimer.stop();
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