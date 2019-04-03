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


registerSingleton(ICodeLensCache, class implements ICodeLensCache {

	_serviceBrand: any;

	private readonly _cache = new LRUCache<string, ICodeLensData[]>(15, 0.75);

	private readonly _fakeProvider = new class implements CodeLensProvider {
		provideCodeLenses(): ICodeLensSymbol[] {
			throw new Error('not supported');
		}
	};

	put(model: ITextModel, data: ICodeLensData[]): void {
		this._cache.set(this._makeKey(model), data.map(item => {
			return {
				symbol: item.symbol,
				provider: this._fakeProvider
			};
		}));
	}

	get(model: ITextModel) {
		return this._cache.get(this._makeKey(model));
	}

	private _makeKey(model: ITextModel): string {
		return model.id + model.getVersionId;
	}
}, true);
