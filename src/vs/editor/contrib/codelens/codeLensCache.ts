/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICodeLensData } from 'vs/editor/contrib/codelens/codelens';
import { LRUCache, values } from 'vs/base/common/map';
import { ICodeLensSymbol, CodeLensProvider } from 'vs/editor/common/modes';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Range } from 'vs/editor/common/core/range';

export const ICodeLensCache = createDecorator<ICodeLensCache>('ICodeLensCache');

export interface ICodeLensCache {
	_serviceBrand: any;
	put(model: ITextModel, data: ICodeLensData[]): void;
	get(model: ITextModel): ICodeLensData[] | undefined;
	delete(model: ITextModel): void;
}

interface ISerializedCacheData {
	lineCount: number;
	lines: number[];
}

class CacheItem {

	constructor(
		readonly lineCount: number,
		readonly data: ICodeLensData[]
	) { }
}

export class CodeLensCache implements ICodeLensCache {

	_serviceBrand: any;

	private readonly _fakeProvider = new class implements CodeLensProvider {
		provideCodeLenses(): ICodeLensSymbol[] {
			throw new Error('not supported');
		}
	};

	private readonly _cache = new LRUCache<string, CacheItem>(20, 0.75);

	constructor(@IStorageService storageService: IStorageService) {

		const key = 'codelens/cache';

		// restore lens data on start
		const raw = storageService.get(key, StorageScope.WORKSPACE, '{}');
		this._deserialize(raw);

		// store lens data on shutdown
		const listener = storageService.onWillSaveState(() => {
			storageService.store(key, this._serialize(), StorageScope.WORKSPACE);
			listener.dispose();
		});
	}

	put(model: ITextModel, data: ICodeLensData[]): void {
		const item = new CacheItem(model.getLineCount(), data.map(item => {
			return {
				symbol: item.symbol,
				provider: this._fakeProvider
			};
		}));
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
		this._cache.forEach((value, key) => {
			const lines = new Set<number>();
			for (const d of value.data) {
				lines.add(d.symbol.range.startLineNumber);
			}
			data[key] = {
				lineCount: value.lineCount,
				lines: values(lines)
			};
		});
		return JSON.stringify(data);
	}

	private _deserialize(raw: string): void {
		try {
			const data: Record<string, ISerializedCacheData> = JSON.parse(raw);
			for (const key in data) {
				const element = data[key];
				const symbols: ICodeLensData[] = [];
				for (const line of element.lines) {
					symbols.push({
						provider: this._fakeProvider,
						symbol: { range: new Range(line, 1, line, 11) }
					});
				}
				this._cache.set(key, new CacheItem(element.lineCount, symbols));
			}
		} catch {
			// ignore...
		}
	}
}

registerSingleton(ICodeLensCache, CodeLensCache);
