/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITextModel, shouldSynchronizeModel } from 'vs/editor/common/model';
import { LanguageFilter, LanguageSelector, score } from 'vs/editor/common/languageSelector';
import { URI } from 'vs/base/common/uri';

interface Entry<T> {
	selector: LanguageSelector;
	provider: T;
	_score: number;
	_time: number;
}

function isExclusive(selector: LanguageSelector): boolean {
	if (typeof selector === 'string') {
		return false;
	} else if (Array.isArray(selector)) {
		return selector.every(isExclusive);
	} else {
		return !!(selector as LanguageFilter).exclusive; // TODO: microsoft/TypeScript#42768
	}
}

export interface NotebookTypeResolver {
	(uri: URI): string | undefined;
}

export class LanguageFeatureRegistry<T> {

	private _clock: number = 0;
	private readonly _entries: Entry<T>[] = [];

	private readonly _onDidChange = new Emitter<number>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly _notebookTypeResolver?: NotebookTypeResolver) { }

	register(selector: LanguageSelector, provider: T): IDisposable {

		let entry: Entry<T> | undefined = {
			selector,
			provider,
			_score: -1,
			_time: this._clock++
		};

		this._entries.push(entry);
		this._lastCandidate = undefined;
		this._onDidChange.fire(this._entries.length);

		return toDisposable(() => {
			if (entry) {
				const idx = this._entries.indexOf(entry);
				if (idx >= 0) {
					this._entries.splice(idx, 1);
					this._lastCandidate = undefined;
					this._onDidChange.fire(this._entries.length);
					entry = undefined;
				}
			}
		});
	}

	has(model: ITextModel): boolean {
		return this.all(model).length > 0;
	}

	all(model: ITextModel): T[] {
		if (!model) {
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

	ordered(model: ITextModel): T[] {
		const result: T[] = [];
		this._orderedForEach(model, entry => result.push(entry.provider));
		return result;
	}

	orderedGroups(model: ITextModel): T[][] {
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

	private _orderedForEach(model: ITextModel, callback: (provider: Entry<T>) => any): void {

		this._updateScores(model);

		for (const entry of this._entries) {
			if (entry._score > 0) {
				callback(entry);
			}
		}
	}

	private _lastCandidate: { uri: string; language: string; notebookType?: string } | undefined;

	private _updateScores(model: ITextModel): void {

		const notebookType = this._notebookTypeResolver?.(model.uri);

		const candidate = {
			uri: model.uri.toString(),
			language: model.getLanguageId(),
			notebookType
		};

		if (this._lastCandidate
			&& this._lastCandidate.language === candidate.language
			&& this._lastCandidate.uri === candidate.uri
			&& this._lastCandidate.notebookType === candidate.notebookType
		) {

			// nothing has changed
			return;
		}

		this._lastCandidate = candidate;

		for (let entry of this._entries) {
			entry._score = score(entry.selector, model.uri, model.getLanguageId(), shouldSynchronizeModel(model), notebookType);

			if (isExclusive(entry.selector) && entry._score > 0) {
				// support for one exclusive selector that overwrites
				// any other selector
				for (let entry of this._entries) {
					entry._score = 0;
				}
				entry._score = 1000;
				break;
			}
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
