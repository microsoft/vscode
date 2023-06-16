/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from 'vs/base/common/async';
import { IEncryptionService } from 'vs/platform/encryption/common/encryptionService';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Event, PauseableEmitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { isNative } from 'vs/base/common/platform';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { once } from 'vs/base/common/functional';

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

export class SecretStorageService implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;

	private _storagePrefix = 'secret://';

	private readonly _onDidChangeSecret = new PauseableEmitter<string>();
	onDidChangeSecret: Event<string> = this._onDidChangeSecret.event;

	private readonly _sequencer = new SequencerByKey<string>();
	private initialized = this.init();

	private _type: 'in-memory' | 'persisted' | 'unknown' = 'unknown';

	constructor(
		@IStorageService private _storageService: IStorageService,
		@IEncryptionService private _encryptionService: IEncryptionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService
	) {
		this._storageService.onDidChangeValue(e => this.onDidChangeValue(e.key));
	}

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
			await this.initialized;

			const fullKey = this.getKey(key);
			const encrypted = this._storageService.get(fullKey, StorageScope.APPLICATION);
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

			if (isNative && this.type !== 'persisted') {
				this.notifyNativeUserOnce();
			}

			const encrypted = await this._encryptionService.encrypt(value);
			const fullKey = this.getKey(key);
			try {
				this._onDidChangeSecret.pause();
				this._storageService.store(fullKey, encrypted, StorageScope.APPLICATION, StorageTarget.MACHINE);
			} finally {
				this._onDidChangeSecret.resume();
			}
		});
	}

	delete(key: string): Promise<void> {
		return this._sequencer.queue(key, async () => {
			await this.initialized;

			const fullKey = this.getKey(key);
			try {
				this._onDidChangeSecret.pause();
				this._storageService.remove(fullKey, StorageScope.APPLICATION);
			} finally {
				this._onDidChangeSecret.resume();
			}
		});
	}

	private async init(): Promise<void> {
		if (await this._encryptionService.isEncryptionAvailable()) {
			this._type = 'persisted';
			return;
		}

		this._logService.trace('[SecretStorageService] Encryption is not available, falling back to in-memory storage');

		this._type = 'in-memory';
		this._storageService = new InMemoryStorageService();
	}

	private getKey(key: string): string {
		return `${this._storagePrefix}${key}`;
	}

	private notifyNativeUserOnce = once(() => this.notifyNativeUser());
	private notifyNativeUser(): void {
		this._notificationService.prompt(
			Severity.Warning,
			localize('notEncrypted', 'Secrets are not being stored on disk because encryption is not available in this environment.'),
			[{
				label: localize('openTroubleshooting', "Open Troubleshooting"),
				run: () => this._instantiationService.invokeFunction(accessor => {
					const openerService = accessor.get(IOpenerService);
					// Open troubleshooting docs page
					return openerService.open('https://go.microsoft.com/fwlink/?linkid=2239490');
				})
			}]
		);
	}
}
