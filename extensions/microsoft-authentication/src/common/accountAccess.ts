/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, LogOutputChannel, SecretStorage } from 'vscode';
import { AccountInfo } from '@azure/msal-node';

export interface IAccountAccess {
	onDidAccountAccessChange: Event<void>;
	isAllowedAccess(account: AccountInfo): boolean;
	setAllowedAccess(account: AccountInfo, allowed: boolean): Promise<void>;
}

export class ScopedAccountAccess implements IAccountAccess, Disposable {
	private readonly _onDidAccountAccessChangeEmitter = new EventEmitter<void>();
	readonly onDidAccountAccessChange = this._onDidAccountAccessChangeEmitter.event;

	private value = new Array<string>();

	private readonly _disposable: Disposable;

	private constructor(
		private readonly _accountAccessSecretStorage: IAccountAccessSecretStorage,
		disposables: Disposable[] = []
	) {
		this._disposable = Disposable.from(
			...disposables,
			this._onDidAccountAccessChangeEmitter,
			this._accountAccessSecretStorage.onDidChange(() => this.update())
		);
	}

	static async create(
		secretStorage: SecretStorage,
		cloudName: string,
		logger: LogOutputChannel,
		migrations: { clientId: string; authority: string }[] | undefined,
	): Promise<ScopedAccountAccess> {
		const storage = await AccountAccessSecretStorage.create(secretStorage, cloudName, logger, migrations);
		const access = new ScopedAccountAccess(storage, [storage]);
		await access.initialize();
		return access;
	}

	dispose() {
		this._disposable.dispose();
	}

	private async initialize(): Promise<void> {
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

interface IAccountAccessSecretStorage {
	get(): Promise<string[] | undefined>;
	store(value: string[]): Thenable<void>;
	delete(): Thenable<void>;
	onDidChange: Event<void>;
}

class AccountAccessSecretStorage implements IAccountAccessSecretStorage, Disposable {
	private _disposable: Disposable;

	private readonly _onDidChangeEmitter = new EventEmitter<void>();
	readonly onDidChange: Event<void> = this._onDidChangeEmitter.event;

	private readonly _key: string;

	private constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _cloudName: string,
		private readonly _logger: LogOutputChannel,
		private readonly _migrations?: { clientId: string; authority: string }[],
	) {
		this._key = `accounts-${this._cloudName}`;

		this._disposable = Disposable.from(
			this._onDidChangeEmitter,
			this._secretStorage.onDidChange(e => {
				if (e.key === this._key) {
					this._onDidChangeEmitter.fire();
				}
			})
		);
	}

	static async create(
		secretStorage: SecretStorage,
		cloudName: string,
		logger: LogOutputChannel,
		migrations?: { clientId: string; authority: string }[],
	): Promise<AccountAccessSecretStorage> {
		const storage = new AccountAccessSecretStorage(secretStorage, cloudName, logger, migrations);
		await storage.initialize();
		return storage;
	}

	/**
	 * TODO: Remove this method after a release with the migration
	 */
	private async initialize(): Promise<void> {
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
