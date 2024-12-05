/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable, IReference } from '../../../../base/common/lifecycle.js';

export class ObjectPool<TData extends IObjectData, T extends IPooledObject<TData>> implements IDisposable {
	private readonly _unused = new Set<T>();
	private readonly _used = new Set<T>();
	private readonly _itemData = new Map<T, TData>();

	constructor(
		private readonly _create: (data: TData) => T,
	) { }

	public getUnusedObj(data: TData): IReference<T> {
		let obj: T;

		if (this._unused.size === 0) {
			obj = this._create(data);
			this._itemData.set(obj, data);
		} else {
			const values = [...this._unused.values()];
			obj = values.find(obj => this._itemData.get(obj)!.getId() === data.getId()) ?? values[0];
			this._unused.delete(obj);
			this._itemData.set(obj, data);
			obj.setData(data);
		}
		this._used.add(obj);
		return {
			object: obj,
			dispose: () => {
				this._used.delete(obj);
				if (this._unused.size > 5) {
					obj.dispose();
				} else {
					this._unused.add(obj);
				}
			}
		};
	}

	dispose(): void {
		for (const obj of this._used) {
			obj.dispose();
		}
		for (const obj of this._unused) {
			obj.dispose();
		}
		this._used.clear();
		this._unused.clear();
	}
}

export interface IObjectData {
	getId(): unknown;
}

export interface IPooledObject<TData> extends IDisposable {
	setData(data: TData): void;
}
