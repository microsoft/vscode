/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isHotReloadEnabled } from '../../../base/common/hotReload.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { autorunWithStore, IObservable } from '../../../base/common/observable.js';
import { BrandedService, GetLeadingNonServiceArgs, IInstantiationService } from '../../instantiation/common/instantiation.js';

export function hotClassGetOriginalInstance<T>(value: T): T {
	if (value instanceof BaseClass) {
		return value._instance as any;
	}
	return value;
}

/**
 * Wrap a class in a reloadable wrapper.
 * When the wrapper is created, the original class is created.
 * When the original class changes, the instance is re-created.
*/
export function wrapInHotClass0<TArgs extends BrandedService[]>(clazz: IObservable<Result<TArgs>>): Result<GetLeadingNonServiceArgs<TArgs>> {
	return !isHotReloadEnabled() ? clazz.get() : createWrapper(clazz, BaseClass0);
}

type Result<TArgs extends any[]> = new (...args: TArgs) => IDisposable;

class BaseClass {
	public _instance: unknown;

	constructor(
		public readonly instantiationService: IInstantiationService,
	) { }

	public init(...params: any[]): void { }
}

function createWrapper<T extends any[]>(clazz: IObservable<any>, B: new (...args: T) => BaseClass) {
	return (class ReloadableWrapper extends B {
		private _autorun: IDisposable | undefined = undefined;

		override init(...params: any[]) {
			this._autorun = autorunWithStore((reader, store) => {
				const clazz_ = clazz.read(reader);
				this._instance = store.add(this.instantiationService.createInstance(clazz_, ...params) as IDisposable);
			});
		}

		dispose(): void {
			this._autorun?.dispose();
		}
	}) as any;
}

class BaseClass0 extends BaseClass {
	constructor(@IInstantiationService i: IInstantiationService) { super(i); this.init(); }
}

/**
 * Wrap a class in a reloadable wrapper.
 * When the wrapper is created, the original class is created.
 * When the original class changes, the instance is re-created.
*/
export function wrapInHotClass1<TArgs extends [any, ...BrandedService[]]>(clazz: IObservable<Result<TArgs>>): Result<GetLeadingNonServiceArgs<TArgs>> {
	return !isHotReloadEnabled() ? clazz.get() : createWrapper(clazz, BaseClass1);
}

class BaseClass1 extends BaseClass {
	constructor(param1: any, @IInstantiationService i: IInstantiationService,) { super(i); this.init(param1); }
}
