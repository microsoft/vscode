/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable, IReference } from 'vs/base/common/lifecycle';

export class ObjectPool<T extends IDisposable> {
	private readonly _unused = new Set<T>();
	private readonly _used = new Set<T>();

	constructor(
		private readonly _create: () => T
	) { }

	public getUnusedObj(): IReference<T> {
		let obj: T;
		if (this._unused.size === 0) {
			obj = this._create();
		} else {
			obj = this._unused.values().next().value;
			this._unused.delete(obj);
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
}
