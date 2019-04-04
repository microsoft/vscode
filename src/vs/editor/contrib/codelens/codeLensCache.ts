/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICodeLensData } from 'vs/editor/contrib/codelens/codelens';
import { LRUCache } from 'vs/base/common/map';
import { ICodeLensSymbol, CodeLensProvider } from 'vs/editor/common/modes';

export const ICodeLensCache = createDecorator<ICodeLensCache>('ICodeLensCache');

export interface ICodeLensCache {
	_serviceBrand: any;
	put(model: ITextModel, data: ICodeLensData[]): void;
	get(model: ITextModel): ICodeLensData[] | undefined;
}

class CacheData {
	constructor(readonly version: number, readonly data: ICodeLensData[]) { }
}

registerSingleton(ICodeLensCache, class implements ICodeLensCache {

	_serviceBrand: any;

	private readonly _cache = new LRUCache<string, CacheData>(20, 0.75);

	private readonly _fakeProvider = new class implements CodeLensProvider {
		provideCodeLenses(): ICodeLensSymbol[] {
			throw new Error('not supported');
		}
	};

	put(model: ITextModel, data: ICodeLensData[]): void {
		const item = new CacheData(model.getVersionId(), data.map(item => {
			return {
				symbol: item.symbol,
				provider: this._fakeProvider
			};
		}));
		this._cache.set(model.id, item);
	}

	get(model: ITextModel) {
		const item = this._cache.get(model.id);
		return item && item.version === model.getVersionId() ? item.data : undefined;
	}

}, true);
