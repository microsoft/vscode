/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from 'vs/base/common/async';
import { IEncryptionService } from 'vs/platform/encryption/common/encryptionService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Event, PauseableEmitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IDisposable } from 'vs/base/common/lifecycle';

export const ISecretStorageService = createDecorator<ISecretStorageService>('secretStorageService');

export interface ISecretStorageProvider {
	type: 'in-memory' | 'persisted' | 'unknown';
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface ISecretStorageService extends ISecretStorageProvider {
	readonly _serviceBrand: undefined;
	onDidChangeSecret: Event<string>;
}

export abstract class BaseSecretStorageService implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;

	private _storagePrefix = 'secret://';

	private readonly _onDidChangeSecret = new PauseableEmitter<string>();
	onDidChangeSecret: Event<string> = this._onDidChangeSecret.event;

	protected readonly _sequencer = new SequencerByKey<string>();
	protected resolvedStorageService = this.initialize();

	private _type: 'in-memory' | 'persisted' | 'unknown' = 'unknown';

	private _onDidChangeValueDisposable: IDisposable | undefined;

	constructor(
		@IStorageService private _storageService: IStorageService,
		@IEncryptionService protected _encryptionService: IEncryptionService,
		@ILogService protected readonly _logService: ILogService
	) { }

	get type() {
		return this._type;
	}

	private onDidChangeValue(key: string): void {
		if (!key.startsWith(this._storagePrefix)) {
			return;
		}

		if (this._onDidChangeSecret.isPaused) {
			this._logService.trace(`[SecretStorageService] Skipping change event for secret: ${key} because it is paused`);
			return;
		}

		const secretKey = key.slice(this._storagePrefix.length);

		this._logService.trace(`[SecretStorageService] Notifying change in value for secret: ${secretKey}`);
		this._onDidChangeSecret.fire(secretKey);
	}

	get(key: string): Promise<string | undefined> {
		return this._sequencer.queue(key, async () => {
			const storageService = await this.resolvedStorageService;

			const fullKey = this.getKey(key);
			this._logService.trace('[secrets] getting secret for key:', fullKey);
			const encrypted = storageService.get(fullKey, StorageScope.APPLICATION);
			if (!encrypted) {
				this._logService.trace('[secrets] no secret found for key:', fullKey);
				return undefined;
			}

			try {
				this._logService.trace('[secrets] decrypting gotten secret for key:', fullKey);
				const result = await this._encryptionService.decrypt(encrypted);
				this._logService.trace('[secrets] decrypted secret for key:', fullKey);
				return result;
			} catch (e) {
				this._logService.error(e);
				this.delete(key);
				return undefined;
			}
		});
	}

	set(key: string, value: string): Promise<void> {
		return this._sequencer.queue(key, async () => {
			const storageService = await this.resolvedStorageService;

			this._logService.trace('[secrets] encrypting secret for key:', key);
			let encrypted;
			try {
				encrypted = await this._encryptionService.encrypt(value);
			} catch (e) {
				this._logService.error(e);
				throw e;
			}
			const fullKey = this.getKey(key);
			try {
				this._onDidChangeSecret.pause();
				this._logService.trace('[secrets] storing encrypted secret for key:', fullKey);
				storageService.store(fullKey, encrypted, StorageScope.APPLICATION, StorageTarget.MACHINE);
			} finally {
				this._onDidChangeSecret.resume();
			}
			this._logService.trace('[secrets] stored encrypted secret for key:', fullKey);
		});
	}

	delete(key: string): Promise<void> {
		return this._sequencer.queue(key, async () => {
			const storageService = await this.resolvedStorageService;

			const fullKey = this.getKey(key);
			try {
				this._onDidChangeSecret.pause();
				this._logService.trace('[secrets] deleting secret for key:', fullKey);
				storageService.remove(fullKey, StorageScope.APPLICATION);
			} finally {
				this._onDidChangeSecret.resume();
			}
			this._logService.trace('[secrets] deleted secret for key:', fullKey);
		});
	}

	private async initialize(): Promise<IStorageService> {
		let storageService;
		if (await this._encryptionService.isEncryptionAvailable()) {
			this._type = 'persisted';
			storageService = this._storageService;
		} else {
			this._logService.trace('[SecretStorageService] Encryption is not available, falling back to in-memory storage');
			this._type = 'in-memory';
			storageService = new InMemoryStorageService();
		}

		this._onDidChangeValueDisposable?.dispose();
		this._onDidChangeValueDisposable = storageService.onDidChangeValue(e => this.onDidChangeValue(e.key));
		return storageService;
	}

	protected reinitialize(): void {
		this.resolvedStorageService = this.initialize();
	}

	private getKey(key: string): string {
		return `${this._storagePrefix}${key}`;
	}
}
