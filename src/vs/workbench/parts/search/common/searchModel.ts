/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import * as Set from 'vs/base/common/set';
import paths = require('vs/base/common/paths');
import lifecycle = require('vs/base/common/lifecycle');
import collections = require('vs/base/common/collections');
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IModel, ITextModel, IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness, IModelDecorationOptions} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {IModelService} from 'vs/editor/common/services/modelService';
import * as Search from 'vs/platform/search/common/search';

export class Match {

	private _parent: FileMatch;
	private _lineText: string;
	private _id: string;
	private _range: Range;

	constructor(parent: FileMatch, text: string, lineNumber: number, offset: number, length: number) {
		this._parent = parent;
		this._lineText = text;
		this._id = parent.id() + '>' + lineNumber + '>' + offset;
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

export class EmptyMatch extends Match {

	constructor(parent: FileMatch) {
		super(parent, null, Date.now(), Date.now(), Date.now());
	}
}

export class FileMatch extends EventEmitter implements lifecycle.IDisposable {

	private _parent: SearchResult;
	private _resource: URI;
	_removedMatches: Set.ArraySet<string>;
	_matches: { [key: string]: Match };

	constructor(parent: SearchResult, resource: URI) {
		super();
		this._resource = resource;
		this._parent = parent;
		this._matches = Object.create(null);
		this._removedMatches= new Set.ArraySet<string>();
	}

	public dispose(): void {
		this.emit('disposed', this);
	}

	public id(): string {
		return this.resource().toString();
	}

	public parent(): SearchResult {
		return this._parent;
	}

	public add(match: Match): void {
		this._matches[match.id()] = match;
	}

	public remove(match: Match): void {
		delete this._matches[match.id()];
		this._removedMatches.set(match.id());
		if (this.count() === 0) {
			this.add(new EmptyMatch(this));
		}
	}

	public matches(): Match[] {
		return collections.values(this._matches);
	}

	public count(): number {
		let result = 0;
		for (let key in this._matches) {
			if (!(this._matches[key] instanceof EmptyMatch)) {
				result += 1;
			}
		}
		return result;
	}

	public resource(): URI {
		return this._resource;
	}

	public name(): string {
		return paths.basename(this.resource().fsPath);
	}
}

export type FileMatchOrMatch = FileMatch | Match;

export class LiveFileMatch extends FileMatch implements lifecycle.IDisposable {

	private static DecorationOption: IModelDecorationOptions = {
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch',
		overviewRuler: {
			color: 'rgba(246, 185, 77, 0.7)',
			darkColor: 'rgba(246, 185, 77, 0.7)',
			position: OverviewRulerLane.Center
		}
	};

	private _model: IModel;
	private _query: Search.IPatternInfo;
	private _updateScheduler: RunOnceScheduler;
	private _modelDecorations: string[] = [];
	private _unbind: lifecycle.IDisposable[] = [];
	_diskFileMatch: FileMatch;

	constructor(parent: SearchResult, resource: URI, query: Search.IPatternInfo, model: IModel, fileMatch: FileMatch) {
		super(parent, resource);

		this._query = query;
		this._model = model;
		this._diskFileMatch = fileMatch;
		this._removedMatches= fileMatch._removedMatches;
		this._updateScheduler = new RunOnceScheduler(this._updateMatches.bind(this), 250);
		this._unbind.push(this._model.onDidChangeContent(_ => this._updateScheduler.schedule()));
		this._updateMatches();
	}

	public dispose(): void {
		this._unbind = lifecycle.dispose(this._unbind);
		if (!this._isTextModelDisposed()) {
			this._model.deltaDecorations(this._modelDecorations, []);
		}
		super.dispose();
	}

	private _updateMatches(): void {
		// this is called from a timeout and might fire
		// after the model has been disposed
		if (this._isTextModelDisposed()) {
			return;
		}
		this._matches = Object.create(null);
		let matches = this._model
			.findMatches(this._query.pattern, this._model.getFullModelRange(), this._query.isRegExp, this._query.isCaseSensitive, this._query.isWordMatch);

		matches.forEach(range => {
			let match= new Match(this, this._model.getLineContent(range.startLineNumber), range.startLineNumber - 1, range.startColumn - 1, range.endColumn - range.startColumn);
			if (!this._removedMatches.contains(match.id())) {
				this.add(match);
			}
		});

		if (this.count() === 0) {
			this.add(new EmptyMatch(this));
		}

		this.parent().emit('changed', this);
		this.updateHighlights();
	}

	updateHighlights(): void {

		if ((<ITextModel>this._model).isDisposed()) {
			return;
		}

		if (this.parent()._showHighlights) {
			this._modelDecorations = this._model.deltaDecorations(this._modelDecorations, this.matches().filter(match => !(match instanceof EmptyMatch)).map(match => <IModelDeltaDecoration>{
				range: match.range(),
				options: LiveFileMatch.DecorationOption
			}));
		} else {
			this._modelDecorations = this._model.deltaDecorations(this._modelDecorations, []);
		}
	}

	private _isTextModelDisposed(): boolean {
		return !this._model || (<ITextModel>this._model).isDisposed();
	}

}

export class SearchResult extends EventEmitter {

	private _modelService: IModelService;
	private _query: Search.IPatternInfo;
	private _replace: string= null;
	private _disposables: lifecycle.IDisposable[] = [];
	private _matches: { [key: string]: FileMatch; } = Object.create(null);

	_showHighlights: boolean;

	constructor(query: Search.IPatternInfo, @IModelService modelService: IModelService) {
		super();
		this._modelService = modelService;
		this._query = query;

		if (this._query) {
			this._modelService.onModelAdded(this._onModelAdded, this, this._disposables);
			this._modelService.onModelRemoved(this._onModelRemoved, this, this._disposables);
		}
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
		return this._replace;
	}

	public set replaceText(replace: string) {
		this._replace= replace;
	}

	private _onModelAdded(model: IModel): void {
		let resource = model.uri,
			fileMatch = this._matches[resource.toString()];

		if (fileMatch) {
			let liveMatch = new LiveFileMatch(this, resource, this._query, model, fileMatch);
			liveMatch.updateHighlights();
			this._matches[resource.toString()] = liveMatch;
			this.emit('changed', this);
		}
	}

	private _onModelRemoved(model: IModel): void {

		let resource = model.uri,
			fileMatch = this._matches[resource.toString()];

		if (fileMatch instanceof LiveFileMatch) {
			this.deferredEmit(() => {
				this.remove(fileMatch);
				this._matches[resource.toString()] = fileMatch._diskFileMatch;
			});
		}
	}

	public append(raw: Search.IFileMatch[]): void {
		raw.forEach((rawFileMatch) => {

			let fileMatch = this._getOrAdd(rawFileMatch);

			if (fileMatch instanceof LiveFileMatch) {
				fileMatch = (<LiveFileMatch>fileMatch)._diskFileMatch;
			}

			rawFileMatch.lineMatches.forEach((rawLineMatch) => {
				rawLineMatch.offsetAndLengths.forEach(offsetAndLength => {
					let match = new Match(fileMatch, rawLineMatch.preview, rawLineMatch.lineNumber, offsetAndLength[0], offsetAndLength[1]);
					fileMatch.add(match);
				});
			});
		});
	}

	private _getOrAdd(raw: Search.IFileMatch): FileMatch {
		return collections.lookupOrInsert(this._matches, raw.resource.toString(), () => {

			let model = this._modelService.getModel(raw.resource),
				fileMatch = new FileMatch(this, raw.resource);

			if (model && this._query) {
				fileMatch = new LiveFileMatch(this, raw.resource, this._query, model, fileMatch);
			}
			return fileMatch;
		});
	}

	public remove(match: FileMatch): void {
		delete this._matches[match.resource().toString()];
		match.dispose();
		this.emit('changed', this);
	}

	public matches(): FileMatch[] {
		return collections.values(this._matches);
	}

	public isEmpty(): boolean {
		return this.fileCount() === 0;
	}

	public fileCount(): number {
		return Object.keys(this._matches).length;
	}

	public count(): number {
		return this.matches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	public toggleHighlights(value: boolean): void {
		if (this._showHighlights === value) {
			return;
		}
		this._showHighlights = value;

		for (let resource in this._matches) {
			let match = this._matches[resource];
			if (match instanceof LiveFileMatch) {
				match.updateHighlights();
			}
		}
	}

	public dispose(): void {
		this._disposables = lifecycle.dispose(this._disposables);
		lifecycle.dispose(this.matches());
		super.dispose();
	}
}