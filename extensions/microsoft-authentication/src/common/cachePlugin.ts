/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import { Disposable, EventEmitter, SecretStorage } from 'vscode';

export class SecretStorageCachePlugin implements ICachePlugin, Disposable {
	private readonly _onDidChange: EventEmitter<void> = new EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private _disposable: Disposable;

	private _value: string | undefined;

	constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _key: string
	) {
		this._disposable = Disposable.from(
			this._onDidChange,
			this._registerChangeHandler()
		);
	}

	private _registerChangeHandler() {
		return this._secretStorage.onDidChange(e => {
			if (e.key === this._key) {
				this._onDidChange.fire();
			}
		});
	}

	async beforeCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void> {
		const data = await this._secretStorage.get(this._key);
		this._value = data;
		if (data) {
			tokenCacheContext.tokenCache.deserialize(data);
		}
	}

	async afterCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void> {
		if (tokenCacheContext.cacheHasChanged) {
			const value = tokenCacheContext.tokenCache.serialize();
			if (value !== this._value) {
				await this._secretStorage.store(this._key, value);
			}
		}
	}

	dispose() {
		this._disposable.dispose();
	}
}
