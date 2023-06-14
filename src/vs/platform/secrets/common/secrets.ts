/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from 'vs/base/common/async';
import { IEncryptionService } from 'vs/platform/encryption/common/encryptionService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';

export const ISecretStorageService = createDecorator<ISecretStorageService>('secretStorageService');

export interface ISecretStorageProvider {
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface ISecretStorageService extends ISecretStorageProvider {
	readonly _serviceBrand: undefined;
	onDidChangeSecret: Event<string>;
}

export class SecretStorageService implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;

	private _storagePrefix = 'secret://';

	private readonly _onDidChangeSecret = new Emitter<string>();
	onDidChangeSecret: Event<string> = this._onDidChangeSecret.event;

	private readonly _sequencer = new SequencerByKey<string>();
	private initialized = this.init();

	private _basicStorageService: IBasicStorageService;

	constructor(
		@IStorageService storageService: IStorageService,
		@IEncryptionService private _encryptionService: IEncryptionService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._basicStorageService = storageService;
		this._basicStorageService.onDidChangeValue(e => this.onDidChangeValue(e.key));
	}

	private onDidChangeValue(key: string): void {
		if (!key.startsWith(this._storagePrefix)) {
			return;
		}

		const secretKey = key.slice(this._storagePrefix.length);

		this._logService.trace(`[SecretStorageService] Notifying change in value for secret: ${secretKey}`);
		this._onDidChangeSecret.fire(secretKey);
	}

	get(key: string): Promise<string | undefined> {
		return this._sequencer.queue(key, async () => {
			await this.initialized;

			const fullKey = this.getKey(key);
			const encrypted = this._basicStorageService.get(fullKey, StorageScope.APPLICATION);
			if (!encrypted) {
				return undefined;
			}

			try {
				return await this._encryptionService.decrypt(encrypted);
			} catch (e) {
				this._logService.error(e);
				this.delete(key);
				return undefined;
			}
		});
	}

	set(key: string, value: string): Promise<void> {
		return this._sequencer.queue(key, async () => {
			await this.initialized;

			const encrypted = await this._encryptionService.encrypt(value);
			const fullKey = this.getKey(key);
			this._basicStorageService.store(fullKey, encrypted, StorageScope.APPLICATION, StorageTarget.MACHINE);
		});
	}

	delete(key: string): Promise<void> {
		return this._sequencer.queue(key, async () => {
			await this.initialized;

			const fullKey = this.getKey(key);
			this._basicStorageService.remove(fullKey, StorageScope.APPLICATION);
		});
	}

	private async init(): Promise<void> {
		if (await this._encryptionService.isEncryptionAvailable()) {
			return;
		}

		this._logService.trace('[SecretStorageService] Encryption is not available, falling back to in-memory storage');

		this._basicStorageService = new InMemoryStorageService();
	}

	private getKey(key: string): string {
		return `${this._storagePrefix}${key}`;
	}
}

interface IBasicStorageService {
	readonly onDidChangeValue: Event<IStorageValueChangeEvent>;
	get(key: string, scope: StorageScope): string | undefined;
	store(key: string, value: any, scope: StorageScope, target: StorageTarget): void;
	remove(key: string, scope: StorageScope): void;
}

class InMemoryStorageService implements IBasicStorageService {
	onDidChangeValue: Event<IStorageValueChangeEvent> = Event.None;

	private readonly _store = new Map<string, string>();

	get(key: string, _scope: StorageScope): string | undefined {
		return this._store.get(key);
	}

	store(key: string, value: string, _scope: StorageScope): void {
		this._store.set(key, value);
	}

	remove(key: string, _scope: StorageScope): void {
		this._store.delete(key);
	}
}
