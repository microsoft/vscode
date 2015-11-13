/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {binarySearch} from 'vs/base/common/arrays';
import {IPosition, IModel} from 'vs/editor/common/editorCommon';
import {IDeclarationSupport, ILineContext, IReference} from 'vs/editor/common/modes';
import {LanguageSelector, ModelLike, score} from 'vs/editor/common/modes/languageSelector';

interface Entry<T> {
	selector: LanguageSelector;
	provider: T;
	_score: number;
	_time: number;
}

export default class LanguageFeatureRegistry<T> {

	private _entries: Entry<T>[] = [];
	private _onDidChange = new Emitter<number>();
	private _supportName: string;

	constructor(supportName?: string) {
		this._supportName = supportName;
	}

	get onDidChange():Event<number> {
		return this._onDidChange.event;
	}

	register(selector: LanguageSelector, provider: T): IDisposable {

		let entry: Entry<T> = {
			selector,
			provider,
			_score: -1,
			_time: Date.now()
		};

		this._entries.push(entry);
		this._candidate = undefined;
		this._onDidChange.fire(this._entries.length);

		return {
			dispose: () => {
				if (entry) {
					let idx = this._entries.indexOf(entry);
					if (idx >= 0) {
						this._entries.splice(idx, 1);
						this._candidate = undefined;
						this._onDidChange.fire(this._entries.length);
						entry = undefined;
					}
				}
			}
		}
	}

	has(model: IModel): boolean {
		return this.all(model).length > 0;
	}

	all(model: IModel | ModelLike): T[]{
		let result: T[] = [];
		if (model) {
			this._updateScores(model);
			// from registry
			for (let entry of this._entries) {
				if (entry._score > 0) {
					result.push(entry.provider);
				}
			}
			// from mode
			if (isModel(model)) {
				if (model.getMode() && model.getMode()[this._supportName]) {
					result.push(model.getMode()[this._supportName]);
				}
			}
		}
		return result;
	}

	ordered(model: IModel|ModelLike): T[] {
		let entries = this._orderedEntries(model);
		return entries.map(item => item.provider);
	}

	orderedGroups(model: IModel | ModelLike): T[][] {
		let entries = this._orderedEntries(model);
		let result: T[][] = [];
		let lastBucket: T[];
		let lastBucketScore: number;

		for (let entry of entries) {
			if (lastBucket && lastBucketScore === entry._score) {
				lastBucket.push(entry.provider);
			} else {
				lastBucketScore = entry._score;
				lastBucket = [entry.provider];
				result.push(lastBucket);
			}
		}

		return result;
	}

	private _orderedEntries(model: IModel | ModelLike): Entry<T>[] {
		let result: Entry<T>[] = [];
		if (model) {
			if (this._updateScores(model)) {
				this._sortByScore();
			}

			// from registry
			for (let entry of this._entries) {
				if (entry._score > 0) {
					result.push(entry);
				}
			}

			// from mode
			if (isModel(model)) {
				if (model.getMode() && model.getMode()[this._supportName]) {

					let entry: Entry<T> = {
						selector: undefined,
						provider: model.getMode()[this._supportName],
						_score: .5,
						_time: 0
					};

					let idx = binarySearch(result, entry, LanguageFeatureRegistry._compareByScoreAndTime);
					result.splice(idx < 0 ? ~idx : idx, 0, entry);
				}
			}
		}
		return result;
	}

	private _candidate: ModelLike;

	private _updateScores(model: IModel|ModelLike): boolean {

		let candidate: ModelLike;
		if (isModel(model)) {
			candidate = {
				uri: model.getAssociatedResource(),
				language: model.getModeId()
			};
		} else {
			candidate = model;
		}

		if (this._candidate
			&& this._candidate.language === candidate.language
			&& this._candidate.uri.toString() === candidate.uri.toString()) {

			// nothing has changed
			return;
		}

		this._candidate = candidate;

		for (let entry of this._entries) {
			entry._score = score(entry.selector, this._candidate);
		}
		return true;
	}

	private _sortByScore(): void {
		this._entries.sort(LanguageFeatureRegistry._compareByScoreAndTime);
	}

	private static _compareByScoreAndTime(a: Entry<any>, b: Entry<any>): number {
		if (a._score < b._score) {
			return 1;
		} else if (a._score > b._score) {
			return -1;
		} else if(a._time < b._time){
			return 1;
		} else if (a._time > b._time) {
			return -1;
		} else {
			return 0;
		}
	}
}

function isModel(thing: any): thing is IModel {
	return typeof thing['getMode'] === 'function';
}