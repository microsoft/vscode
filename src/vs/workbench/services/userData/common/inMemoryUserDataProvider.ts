/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IUserDataProvider } from 'vs/workbench/services/userData/common/userData';

export class InMemoryUserDataProvider extends Disposable implements IUserDataProvider {
	_serviceBrand: any;

	private _onDidChange: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidChange: Event<string> = this._onDidChange.event;

	private readonly store: Map<string, string> = new Map<string, string>();

	constructor() {
		super();
		this._register(toDisposable(() => this.store.clear()));
	}

	async read(key: string): Promise<string> {
		return this.getValue(key);
	}

	async write(key: string, value: string): Promise<void> {
		if (value !== this.getValue(key)) {
			if (value) {
				this.store.set(key, value);
			} else {
				this.store.delete(key);
			}
			this._onDidChange.fire(key);
		}
	}

	private getValue(key: string): string {
		return this.store.get(key) || '';
	}
}