/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { LanguageSelector, score } from 'vs/editor/common/modes/languageSelector';

interface Entry<T> {
	selector: LanguageSelector;
	provider: T;
	_score: number;
	_time: number;
}

export default class LanguageFeatureRegistry<T> {

	private _clock: number = 0;
	private _entries: Entry<T>[] = [];
	private _onDidChange: Emitter<number> = new Emitter<number>();

	constructor() {
	}

	get onDidChange(): Event<number> {
		return this._onDidChange.event;
	}

	register(selector: LanguageSelector, provider: T): IDisposable {

		let entry: Entry<T> = {
			selector,
			provider,
			_score: -1,
			_time: this._clock++
		};

		this._entries.push(entry);
		this._lastCandidate = undefined;
		this._onDidChange.fire(this._entries.length);

		return {
			dispose: () => {
				if (entry) {
					let idx = this._entries.indexOf(entry);
					if (idx >= 0) {
						this._entries.splice(idx, 1);
						this._lastCandidate = undefined;
						this._onDidChange.fire(this._entries.length);
						entry = undefined;
					}
				}
			}
		};
	}

	has(model: IReadOnlyModel): boolean {
		return this.all(model).length > 0;
	}

	all(model: IReadOnlyModel): T[] {
		if (!model || model.isTooLargeForHavingARichMode()) {
			return [];
		}

		this._updateScores(model);
		const result: T[] = [];

		// from registry
		for (let entry of this._entries) {
			if (entry._score > 0) {
				result.push(entry.provider);
			}
		}

		return result;
	}

	ordered(model: IReadOnlyModel): T[] {
		const result: T[] = [];
		this._orderedForEach(model, entry => result.push(entry.provider));
		return result;
	}

	orderedGroups(model: IReadOnlyModel): T[][] {
		const result: T[][] = [];
		let lastBucket: T[];
		let lastBucketScore: number;

		this._orderedForEach(model, entry => {
			if (lastBucket && lastBucketScore === entry._score) {
				lastBucket.push(entry.provider);
			} else {
				lastBucketScore = entry._score;
				lastBucket = [entry.provider];
				result.push(lastBucket);
			}
		});

		return result;
	}

	private _orderedForEach(model: IReadOnlyModel, callback: (provider: Entry<T>) => any): void {

		if (!model || model.isTooLargeForHavingARichMode()) {
			return;
		}

		this._updateScores(model);

		for (let from = 0; from < this._entries.length; from++) {
			let entry = this._entries[from];
			if (entry._score > 0) {
				callback(entry);
			}
		}
	}

	private _lastCandidate: { uri: string; language: string; };

	private _updateScores(model: IReadOnlyModel): void {

		let candidate = {
			uri: model.uri.toString(),
			language: model.getLanguageIdentifier().language
		};

		if (this._lastCandidate
			&& this._lastCandidate.language === candidate.language
			&& this._lastCandidate.uri === candidate.uri) {

			// nothing has changed
			return;
		}

		this._lastCandidate = candidate;

		for (let entry of this._entries) {
			entry._score = score(entry.selector, model.uri, model.getLanguageIdentifier().language);
		}

		// needs sorting
		this._entries.sort(LanguageFeatureRegistry._compareByScoreAndTime);
	}

	private static _compareByScoreAndTime(a: Entry<any>, b: Entry<any>): number {
		if (a._score < b._score) {
			return 1;
		} else if (a._score > b._score) {
			return -1;
		} else if (a._time < b._time) {
			return 1;
		} else if (a._time > b._time) {
			return -1;
		} else {
			return 0;
		}
	}
}
