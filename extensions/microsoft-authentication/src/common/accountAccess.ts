/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, LogOutputChannel, SecretStorage } from 'vscode';
import { AccountInfo } from '@azure/msal-node';

export interface IAccountAccess {
	initialize(): Promise<void>;
	onDidAccountAccessChange: Event<void>;
	isAllowedAccess(account: AccountInfo): boolean;
	setAllowedAccess(account: AccountInfo, allowed: boolean): Promise<void>;
}

export class ScopedAccountAccess implements IAccountAccess {
	private readonly _onDidAccountAccessChangeEmitter = new EventEmitter<void>();
	readonly onDidAccountAccessChange = this._onDidAccountAccessChangeEmitter.event;

	private readonly _accountAccessSecretStorage: AccountAccessSecretStorage;

	private value = new Array<string>();

	constructor(
		secretStorage: SecretStorage,
		cloudName: string,
		logger: LogOutputChannel,
		migrations?: { clientId: string; authority: string }[],
	) {
		this._accountAccessSecretStorage = new AccountAccessSecretStorage(secretStorage, cloudName, logger, migrations);
		this._accountAccessSecretStorage.onDidChange(() => this.update());
	}

	async initialize() {
		await this._accountAccessSecretStorage.initialize();
		await this.update();
	}

	isAllowedAccess(account: AccountInfo): boolean {
		return this.value.includes(account.homeAccountId);
	}

	async setAllowedAccess(account: AccountInfo, allowed: boolean): Promise<void> {
		if (allowed) {
			if (this.value.includes(account.homeAccountId)) {
				return;
			}
			await this._accountAccessSecretStorage.store([...this.value, account.homeAccountId]);
			return;
		}
		await this._accountAccessSecretStorage.store(this.value.filter(id => id !== account.homeAccountId));
	}

	private async update() {
		const current = new Set(this.value);
		const value = await this._accountAccessSecretStorage.get();

		this.value = value ?? [];
		if (current.size !== this.value.length || !this.value.every(id => current.has(id))) {
			this._onDidAccountAccessChangeEmitter.fire();
		}
	}
}

export class AccountAccessSecretStorage {
	private _disposable: Disposable;

	private readonly _onDidChangeEmitter = new EventEmitter<void>;
	readonly onDidChange: Event<void> = this._onDidChangeEmitter.event;

	private readonly _key = `accounts-${this._cloudName}`;

	constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _cloudName: string,
		private readonly _logger: LogOutputChannel,
		private readonly _migrations?: { clientId: string; authority: string }[],
	) {
		this._disposable = Disposable.from(
			this._onDidChangeEmitter,
			this._secretStorage.onDidChange(e => {
				if (e.key === this._key) {
					this._onDidChangeEmitter.fire();
				}
			})
		);
	}

	/**
	 * TODO: Remove this method after a release with the migration
	 */
	async initialize(): Promise<void> {
		if (!this._migrations) {
			return;
		}
		const current = await this.get();
		// If the secret storage already has the new key, we have already run the migration
		if (current) {
			return;
		}
		try {
			const allValues = new Set<string>();
			for (const { clientId, authority } of this._migrations) {
				const oldKey = `accounts-${this._cloudName}-${clientId}-${authority}`;
				const value = await this._secretStorage.get(oldKey);
				if (value) {
					const parsed = JSON.parse(value) as string[];
					parsed.forEach(v => allValues.add(v));
				}
			}
			if (allValues.size > 0) {
				await this.store(Array.from(allValues));
			}
		} catch (e) {
			// Migration is best effort
			this._logger.error(`Failed to migrate account access secret storage: ${e}`);
		}
	}

	async get(): Promise<string[] | undefined> {
		const value = await this._secretStorage.get(this._key);
		if (!value) {
			return undefined;
		}
		return JSON.parse(value);
	}

	store(value: string[]): Thenable<void> {
		return this._secretStorage.store(this._key, JSON.stringify(value));
	}

	delete(): Thenable<void> {
		return this._secretStorage.delete(this._key);
	}

	dispose() {
		this._disposable.dispose();
	}
}
