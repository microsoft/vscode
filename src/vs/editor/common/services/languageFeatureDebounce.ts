/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { doHash } from 'vs/base/common/hash';
import { LRUCache } from 'vs/base/common/map';
import { clamp, MovingAverage, SlidingWindowAverage } from 'vs/base/common/numbers';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { matchesScheme } from 'vs/base/common/network';


export const ILanguageFeatureDebounceService = createDecorator<ILanguageFeatureDebounceService>('ILanguageFeatureDebounceService');

export interface ILanguageFeatureDebounceService {

	readonly _serviceBrand: undefined;

	for(feature: LanguageFeatureRegistry<object>, debugName: string, config?: { min?: number; max?: number; salt?: string }): IFeatureDebounceInformation;
}

export interface IFeatureDebounceInformation {
	get(model: ITextModel): number;
	update(model: ITextModel, value: number): number;
	default(): number;
}

namespace IdentityHash {
	const _hashes = new WeakMap<object, number>();
	let pool = 0;
	export function of(obj: object): number {
		let value = _hashes.get(obj);
		if (value === undefined) {
			value = ++pool;
			_hashes.set(obj, value);
		}
		return value;
	}
}

class NullDebounceInformation implements IFeatureDebounceInformation {

	constructor(private readonly _default: number) { }

	get(_model: ITextModel): number {
		return this._default;
	}
	update(_model: ITextModel, _value: number): number {
		return this._default;
	}
	default(): number {
		return this._default;
	}
}

class FeatureDebounceInformation implements IFeatureDebounceInformation {

	private readonly _cache = new LRUCache<string, SlidingWindowAverage>(50, 0.7);

	constructor(
		private readonly _logService: ILogService,
		private readonly _name: string,
		private readonly _registry: LanguageFeatureRegistry<object>,
		private readonly _default: number,
		private readonly _min: number,
		private readonly _max: number,
	) { }

	private _key(model: ITextModel): string {
		return model.id + this._registry.all(model).reduce((hashVal, obj) => doHash(IdentityHash.of(obj), hashVal), 0);
	}

	get(model: ITextModel): number {
		const key = this._key(model);
		const avg = this._cache.get(key);
		return avg
			? clamp(avg.value, this._min, this._max)
			: this.default();
	}

	update(model: ITextModel, value: number): number {
		const key = this._key(model);
		let avg = this._cache.get(key);
		if (!avg) {
			avg = new SlidingWindowAverage(6);
			this._cache.set(key, avg);
		}
		const newValue = clamp(avg.update(value), this._min, this._max);
		if (!matchesScheme(model.uri, 'output')) {
			this._logService.trace(`[DEBOUNCE: ${this._name}] for ${model.uri.toString()} is ${newValue}ms`);
		}
		return newValue;
	}

	private _overall(): number {
		const result = new MovingAverage();
		for (const [, avg] of this._cache) {
			result.update(avg.value);
		}
		return result.value;
	}

	default() {
		const value = (this._overall() | 0) || this._default;
		return clamp(value, this._min, this._max);
	}
}


export class LanguageFeatureDebounceService implements ILanguageFeatureDebounceService {

	declare _serviceBrand: undefined;

	private readonly _data = new Map<string, IFeatureDebounceInformation>();
	private readonly _isDev: boolean;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IEnvironmentService envService: IEnvironmentService,
	) {

		this._isDev = envService.isExtensionDevelopment || !envService.isBuilt;
	}

	for(feature: LanguageFeatureRegistry<object>, name: string, config?: { min?: number; max?: number; key?: string }): IFeatureDebounceInformation {
		const min = config?.min ?? 50;
		const max = config?.max ?? min ** 2;
		const extra = config?.key ?? undefined;
		const key = `${IdentityHash.of(feature)},${min}${extra ? ',' + extra : ''}`;
		let info = this._data.get(key);
		if (!info) {
			if (this._isDev) {
				this._logService.debug(`[DEBOUNCE: ${name}] is disabled in developed mode`);
				info = new NullDebounceInformation(min * 1.5);
			} else {
				info = new FeatureDebounceInformation(
					this._logService,
					name,
					feature,
					(this._overallAverage() | 0) || (min * 1.5), // default is overall default or derived from min-value
					min,
					max
				);
			}
			this._data.set(key, info);
		}
		return info;
	}

	private _overallAverage(): number {
		// Average of all language features. Not a great value but an approximation
		const result = new MovingAverage();
		for (const info of this._data.values()) {
			result.update(info.default());
		}
		return result.value;
	}
}

registerSingleton(ILanguageFeatureDebounceService, LanguageFeatureDebounceService, InstantiationType.Delayed);
