/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { GCSignal } from 'gc-signals';
import { IHeapService, ObjectIdentifier } from 'vs/workbench/services/heap/common/heap';

export class HeapService implements IHeapService {

	_serviceBrand: any;

	private readonly _onGarbageCollection: Emitter<number[]> = new Emitter<number[]>();
	public readonly onGarbageCollection: Event<number[]> = this._onGarbageCollection.event;

	private _activeSignals = new WeakMap<any, object>();
	private _activeIds = new Set<number>();

	private _consumeHandle: any;
	private _ctor: { new(id: number): GCSignal };
	private _ctorInit: Promise<void>;

	constructor() {
		//
	}

	dispose() {
		clearInterval(this._consumeHandle);
	}

	trackObject(obj: ObjectIdentifier | undefined | null): void {
		if (!obj) {
			return;
		}

		const ident = obj.$ident;
		if (typeof ident !== 'number') {
			return;
		}

		if (this._activeIds.has(ident)) {
			return;
		}

		if (this._ctor) {
			// track and leave
			this._activeIds.add(ident);
			this._activeSignals.set(obj, new this._ctor(ident));

		} else {
			// make sure to load gc-signals, then track and leave
			if (!this._ctorInit) {
				this._ctorInit = import('gc-signals').then(({ GCSignal, consumeSignals }) => {
					this._ctor = GCSignal;
					this._consumeHandle = setInterval(() => {
						const ids = consumeSignals();

						if (ids.length > 0) {
							// local book-keeping
							for (const id of ids) {
								this._activeIds.delete(id);
							}
							// fire event
							this._onGarbageCollection.fire(ids);
						}
					}, 15 * 1000);
				});
			}

			this._ctorInit.then(() => {
				this._activeIds.add(ident);
				this._activeSignals.set(obj, new this._ctor(ident));
			});
		}
	}
}

registerSingleton(IHeapService, HeapService, true);
