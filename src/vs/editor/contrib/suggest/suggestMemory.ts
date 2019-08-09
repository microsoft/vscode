/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { LRUCache, TernarySearchTree } from 'vs/base/common/map';
import { IStorageService, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ITextModel } from 'vs/editor/common/model';
import { IPosition } from 'vs/editor/common/core/position';
import { CompletionItemKind, completionKindFromString } from 'vs/editor/common/modes';
import { Disposable } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { CompletionItem } from 'vs/editor/contrib/suggest/suggest';

export abstract class Memory {

	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {
		if (items.length === 0) {
			return 0;
		}
		let topScore = items[0].score[0];
		for (let i = 1; i < items.length; i++) {
			const { score, completion: suggestion } = items[i];
			if (score[0] !== topScore) {
				// stop when leaving the group of top matches
				break;
			}
			if (suggestion.preselect) {
				// stop when seeing an auto-select-item
				return i;
			}
		}
		return 0;
	}

	abstract memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void;

	abstract toJSON(): object | undefined;

	abstract fromJSON(data: object): void;
}

export class NoMemory extends Memory {

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		// no-op
	}

	toJSON() {
		return undefined;
	}

	fromJSON() {
		//
	}
}

export interface MemItem {
	type: string | CompletionItemKind;
	insertText: string;
	touch: number;
}

export class LRUMemory extends Memory {

	private _cache = new LRUCache<string, MemItem>(300, 0.66);
	private _seq = 0;

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		const { label } = item.completion;
		const key = `${model.getLanguageIdentifier().language}/${label}`;
		this._cache.set(key, {
			touch: this._seq++,
			type: item.completion.kind,
			insertText: item.completion.insertText
		});
	}

	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {

		if (items.length === 0) {
			return 0;
		}

		const lineSuffix = model.getLineContent(pos.lineNumber).substr(pos.column - 10, pos.column - 1);
		if (/\s$/.test(lineSuffix)) {
			return super.select(model, pos, items);
		}

		let topScore = items[0].score[0];
		let indexPreselect = -1;
		let indexRecency = -1;
		let seq = -1;
		for (let i = 0; i < items.length; i++) {
			if (items[i].score[0] !== topScore) {
				// consider only top items
				break;
			}
			const key = `${model.getLanguageIdentifier().language}/${items[i].completion.label}`;
			const item = this._cache.peek(key);
			if (item && item.touch > seq && item.type === items[i].completion.kind && item.insertText === items[i].completion.insertText) {
				seq = item.touch;
				indexRecency = i;
			}
			if (items[i].completion.preselect && indexPreselect === -1) {
				// stop when seeing an auto-select-item
				return indexPreselect = i;
			}
		}
		if (indexRecency !== -1) {
			return indexRecency;
		} else if (indexPreselect !== -1) {
			return indexPreselect;
		} else {
			return 0;
		}
	}

	toJSON(): object {
		let data: [string, MemItem][] = [];
		this._cache.forEach((value, key) => {
			data.push([key, value]);
		});
		return data;
	}

	fromJSON(data: [string, MemItem][]): void {
		this._cache.clear();
		let seq = 0;
		for (const [key, value] of data) {
			value.touch = seq;
			value.type = typeof value.type === 'number' ? value.type : completionKindFromString(value.type);
			this._cache.set(key, value);
		}
		this._seq = this._cache.size;
	}
}


export class PrefixMemory extends Memory {

	private _trie = TernarySearchTree.forStrings<MemItem>();
	private _seq = 0;

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		const { word } = model.getWordUntilPosition(pos);
		const key = `${model.getLanguageIdentifier().language}/${word}`;
		this._trie.set(key, {
			type: item.completion.kind,
			insertText: item.completion.insertText,
			touch: this._seq++
		});
	}

	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {
		let { word } = model.getWordUntilPosition(pos);
		if (!word) {
			return super.select(model, pos, items);
		}
		let key = `${model.getLanguageIdentifier().language}/${word}`;
		let item = this._trie.get(key);
		if (!item) {
			item = this._trie.findSubstr(key);
		}
		if (item) {
			for (let i = 0; i < items.length; i++) {
				let { kind, insertText } = items[i].completion;
				if (kind === item.type && insertText === item.insertText) {
					return i;
				}
			}
		}
		return super.select(model, pos, items);
	}

	toJSON(): object {

		let entries: [string, MemItem][] = [];
		this._trie.forEach((value, key) => entries.push([key, value]));

		// sort by last recently used (touch), then
		// take the top 200 item and normalize their
		// touch
		entries
			.sort((a, b) => -(a[1].touch - b[1].touch))
			.forEach((value, i) => value[1].touch = i);

		return entries.slice(0, 200);
	}

	fromJSON(data: [string, MemItem][]): void {
		this._trie.clear();
		if (data.length > 0) {
			this._seq = data[0][1].touch + 1;
			for (const [key, value] of data) {
				value.type = typeof value.type === 'number' ? value.type : completionKindFromString(value.type);
				this._trie.set(key, value);
			}
		}
	}
}

export type MemMode = 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';

export class SuggestMemoryService extends Disposable implements ISuggestMemoryService {

	readonly _serviceBrand: any;

	private readonly _storagePrefix = 'suggest/memories';

	private readonly _persistSoon: RunOnceScheduler;
	private _mode!: MemMode;
	private _shareMem!: boolean;
	private _strategy!: Memory;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		super();

		const update = () => {
			const mode = this._configService.getValue<MemMode>('editor.suggestSelection');
			const share = this._configService.getValue<boolean>('editor.suggest.shareSuggestSelections');
			this._update(mode, share, false);
		};

		this._persistSoon = this._register(new RunOnceScheduler(() => this._saveState(), 500));
		this._register(_storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				this._saveState();
			}
		}));

		this._register(this._configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.suggestSelection') || e.affectsConfiguration('editor.suggest.shareSuggestSelections')) {
				update();
			}
		}));
		this._register(this._storageService.onDidChangeStorage(e => {
			if (e.scope === StorageScope.GLOBAL && e.key.indexOf(this._storagePrefix) === 0) {
				if (!document.hasFocus()) {
					// windows that aren't focused have to drop their current
					// storage value and accept what's stored now
					this._update(this._mode, this._shareMem, true);
				}
			}
		}));
		update();
	}

	private _update(mode: MemMode, shareMem: boolean, force: boolean): void {
		if (!force && this._mode === mode && this._shareMem === shareMem) {
			return;
		}
		this._shareMem = shareMem;
		this._mode = mode;
		this._strategy = mode === 'recentlyUsedByPrefix' ? new PrefixMemory() : mode === 'recentlyUsed' ? new LRUMemory() : new NoMemory();

		try {
			const scope = shareMem ? StorageScope.GLOBAL : StorageScope.WORKSPACE;
			const raw = this._storageService.get(`${this._storagePrefix}/${this._mode}`, scope);
			if (raw) {
				this._strategy.fromJSON(JSON.parse(raw));
			}
		} catch (e) {
			// things can go wrong with JSON...
		}
	}

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		this._strategy.memorize(model, pos, item);
		this._persistSoon.schedule();
	}

	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {
		return this._strategy.select(model, pos, items);
	}

	private _saveState() {
		const raw = JSON.stringify(this._strategy);
		const scope = this._shareMem ? StorageScope.GLOBAL : StorageScope.WORKSPACE;
		this._storageService.store(`${this._storagePrefix}/${this._mode}`, raw, scope);
	}
}


export const ISuggestMemoryService = createDecorator<ISuggestMemoryService>('ISuggestMemories');

export interface ISuggestMemoryService {
	_serviceBrand: any;
	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void;
	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number;
}

registerSingleton(ISuggestMemoryService, SuggestMemoryService, true);
