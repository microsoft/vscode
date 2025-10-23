/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { RunOnceScheduler } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { IPosition } from '../../../common/core/position.js';
import { ITextModel } from '../../../common/model.js';
import { CompletionItemKind, CompletionItemKinds } from '../../../common/languages.js';
import { CompletionItem } from './suggest.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';

export abstract class Memory {

	constructor(readonly name: MemMode) { }

	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {
		if (items.length === 0) {
			return 0;
		}
		const topScore = items[0].score[0];
		for (let i = 0; i < items.length; i++) {
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

	constructor() {
		super('first');
	}

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

	constructor() {
		super('recentlyUsed');
	}

	private _cache = new LRUCache<string, MemItem>(300, 0.66);
	private _seq = 0;

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		const key = `${model.getLanguageId()}/${item.textLabel}`;
		this._cache.set(key, {
			touch: this._seq++,
			type: item.completion.kind,
			insertText: item.completion.insertText
		});
	}

	override select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {

		if (items.length === 0) {
			return 0;
		}

		const lineSuffix = model.getLineContent(pos.lineNumber).substr(pos.column - 10, pos.column - 1);
		if (/\s$/.test(lineSuffix)) {
			return super.select(model, pos, items);
		}

		const topScore = items[0].score[0];
		let indexPreselect = -1;
		let indexRecency = -1;
		let seq = -1;
		for (let i = 0; i < items.length; i++) {
			if (items[i].score[0] !== topScore) {
				// consider only top items
				break;
			}
			const key = `${model.getLanguageId()}/${items[i].textLabel}`;
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
		return this._cache.toJSON();
	}

	fromJSON(data: [string, MemItem][]): void {
		this._cache.clear();
		const seq = 0;
		for (const [key, value] of data) {
			value.touch = seq;
			value.type = typeof value.type === 'number' ? value.type : CompletionItemKinds.fromString(value.type);
			this._cache.set(key, value);
		}
		this._seq = this._cache.size;
	}
}


export class PrefixMemory extends Memory {

	constructor() {
		super('recentlyUsedByPrefix');
	}

	private _trie = TernarySearchTree.forStrings<MemItem>();
	private _seq = 0;

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		const { word } = model.getWordUntilPosition(pos);
		const key = `${model.getLanguageId()}/${word}`;
		this._trie.set(key, {
			type: item.completion.kind,
			insertText: item.completion.insertText,
			touch: this._seq++
		});
	}

	override select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {
		const { word } = model.getWordUntilPosition(pos);
		if (!word) {
			return super.select(model, pos, items);
		}
		const key = `${model.getLanguageId()}/${word}`;
		let item = this._trie.get(key);
		if (!item) {
			item = this._trie.findSubstr(key);
		}
		if (item) {
			for (let i = 0; i < items.length; i++) {
				const { kind, insertText } = items[i].completion;
				if (kind === item.type && insertText === item.insertText) {
					return i;
				}
			}
		}
		return super.select(model, pos, items);
	}

	toJSON(): object {

		const entries: [string, MemItem][] = [];
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
				value.type = typeof value.type === 'number' ? value.type : CompletionItemKinds.fromString(value.type);
				this._trie.set(key, value);
			}
		}
	}
}

export type MemMode = 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';

export class SuggestMemoryService implements ISuggestMemoryService {

	private static readonly _strategyCtors = new Map<MemMode, { new(): Memory }>([
		['recentlyUsedByPrefix', PrefixMemory],
		['recentlyUsed', LRUMemory],
		['first', NoMemory]
	]);

	private static readonly _storagePrefix = 'suggest/memories';

	readonly _serviceBrand: undefined;


	private readonly _persistSoon: RunOnceScheduler;
	private readonly _disposables = new DisposableStore();

	private _strategy?: Memory;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		this._persistSoon = new RunOnceScheduler(() => this._saveState(), 500);
		this._disposables.add(_storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				this._saveState();
			}
		}));
	}

	dispose(): void {
		this._disposables.dispose();
		this._persistSoon.dispose();
	}

	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void {
		this._withStrategy(model, pos).memorize(model, pos, item);
		this._persistSoon.schedule();
	}

	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number {
		return this._withStrategy(model, pos).select(model, pos, items);
	}

	private _withStrategy(model: ITextModel, pos: IPosition): Memory {

		const mode = this._configService.getValue<MemMode>('editor.suggestSelection', {
			overrideIdentifier: model.getLanguageIdAtPosition(pos.lineNumber, pos.column),
			resource: model.uri
		});

		if (this._strategy?.name !== mode) {

			this._saveState();
			const ctor = SuggestMemoryService._strategyCtors.get(mode) || NoMemory;
			this._strategy = new ctor();

			try {
				const share = this._configService.getValue<boolean>('editor.suggest.shareSuggestSelections');
				const scope = share ? StorageScope.PROFILE : StorageScope.WORKSPACE;
				const raw = this._storageService.get(`${SuggestMemoryService._storagePrefix}/${mode}`, scope);
				if (raw) {
					this._strategy.fromJSON(JSON.parse(raw));
				}
			} catch (e) {
				// things can go wrong with JSON...
			}
		}

		return this._strategy;
	}

	private _saveState() {
		if (this._strategy) {
			const share = this._configService.getValue<boolean>('editor.suggest.shareSuggestSelections');
			const scope = share ? StorageScope.PROFILE : StorageScope.WORKSPACE;
			const raw = JSON.stringify(this._strategy);
			this._storageService.store(`${SuggestMemoryService._storagePrefix}/${this._strategy.name}`, raw, scope, StorageTarget.MACHINE);
		}
	}
}


export const ISuggestMemoryService = createDecorator<ISuggestMemoryService>('ISuggestMemories');

export interface ISuggestMemoryService {
	readonly _serviceBrand: undefined;
	memorize(model: ITextModel, pos: IPosition, item: CompletionItem): void;
	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number;
}

registerSingleton(ISuggestMemoryService, SuggestMemoryService, InstantiationType.Delayed);
