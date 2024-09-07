/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { LRUCache } from '../../../../base/common/map.js';
import { Range } from '../../../common/core/range.js';
import { ITextModel } from '../../../common/model.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../common/languages.js';
import { CodeLensModel } from './codelens.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { runWhenWindowIdle } from '../../../../base/browser/dom.js';

export const ICodeLensCache = createDecorator<ICodeLensCache>('ICodeLensCache');

export interface ICodeLensCache {
	readonly _serviceBrand: undefined;
	put(model: ITextModel, data: CodeLensModel): void;
	get(model: ITextModel): CodeLensModel | undefined;
	delete(model: ITextModel): void;
}

interface ISerializedCacheData {
	lineCount: number;
	lines: number[];
}

class CacheItem {

	constructor(
		readonly lineCount: number,
		readonly data: CodeLensModel
	) { }
}

export class CodeLensCache implements ICodeLensCache {

	declare readonly _serviceBrand: undefined;

	private readonly _fakeProvider = new class implements CodeLensProvider {
		provideCodeLenses(): CodeLensList {
			throw new Error('not supported');
		}
	};

	private readonly _cache = new LRUCache<string, CacheItem>(20, 0.75);

	constructor(@IStorageService storageService: IStorageService) {

		// remove old data
		const oldkey = 'codelens/cache';
		runWhenWindowIdle(mainWindow, () => storageService.remove(oldkey, StorageScope.WORKSPACE));

		// restore lens data on start
		const key = 'codelens/cache2';
		const raw = storageService.get(key, StorageScope.WORKSPACE, '{}');
		this._deserialize(raw);

		// store lens data on shutdown
		const onWillSaveStateBecauseOfShutdown = Event.filter(storageService.onWillSaveState, e => e.reason === WillSaveStateReason.SHUTDOWN);
		Event.once(onWillSaveStateBecauseOfShutdown)(e => {
			storageService.store(key, this._serialize(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		});
	}

	put(model: ITextModel, data: CodeLensModel): void {
		// create a copy of the model that is without command-ids
		// but with comand-labels
		const copyItems = data.lenses.map((item): CodeLens => {
			return {
				range: item.symbol.range,
				command: item.symbol.command && { id: '', title: item.symbol.command?.title },
			};
		});
		const copyModel = new CodeLensModel();
		copyModel.add({ lenses: copyItems, dispose: () => { } }, this._fakeProvider);

		const item = new CacheItem(model.getLineCount(), copyModel);
		this._cache.set(model.uri.toString(), item);
	}

	get(model: ITextModel) {
		const item = this._cache.get(model.uri.toString());
		return item && item.lineCount === model.getLineCount() ? item.data : undefined;
	}

	delete(model: ITextModel): void {
		this._cache.delete(model.uri.toString());
	}

	// --- persistence

	private _serialize(): string {
		const data: Record<string, ISerializedCacheData> = Object.create(null);
		for (const [key, value] of this._cache) {
			const lines = new Set<number>();
			for (const d of value.data.lenses) {
				lines.add(d.symbol.range.startLineNumber);
			}
			data[key] = {
				lineCount: value.lineCount,
				lines: [...lines.values()]
			};
		}
		return JSON.stringify(data);
	}

	private _deserialize(raw: string): void {
		try {
			const data: Record<string, ISerializedCacheData> = JSON.parse(raw);
			for (const key in data) {
				const element = data[key];
				const lenses: CodeLens[] = [];
				for (const line of element.lines) {
					lenses.push({ range: new Range(line, 1, line, 11) });
				}

				const model = new CodeLensModel();
				model.add({ lenses, dispose() { } }, this._fakeProvider);
				this._cache.set(key, new CacheItem(element.lineCount, model));
			}
		} catch {
			// ignore...
		}
	}
}

registerSingleton(ICodeLensCache, CodeLensCache, InstantiationType.Delayed);
