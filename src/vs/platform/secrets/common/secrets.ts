/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { IEncryptionService } from '../../encryption/common/encryptionService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IStorageService, IStorageValueChangeEvent, InMemoryStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Lazy } from '../../../base/common/lazy.js';
import { isWindows } from '../../../base/common/platform.js';

/**
 * The storage key prefix used for all secrets.
 */
export const SECRET_STORAGE_PREFIX = 'secret://';

/**
 * Builds the full storage key for a secret.
 */
export function secretStorageKey(key: string): string {
	return `${SECRET_STORAGE_PREFIX}${key}`;
}

/**
 * Reads an encrypted secret from storage and decrypts it.
 * @param key The secret key (without the `secret://` prefix).
 * @param storageGet A function that reads the encrypted value from storage given a full storage key.
 * @param decrypt A function that decrypts the encrypted value.
 * @param logService Optional logger for trace output.
 */
export async function readEncryptedSecret(
	key: string,
	storageGet: (fullKey: string) => string | undefined,
	decrypt: (value: string) => Promise<string>,
	logService?: ILogService,
): Promise<string | undefined> {
	const fullKey = secretStorageKey(key);
	logService?.trace('[secrets] getting secret for key:', fullKey);
	const encrypted = storageGet(fullKey);
	if (!encrypted) {
		logService?.trace('[secrets] no secret found for key:', fullKey);
		return undefined;
	}
	logService?.trace('[secrets] decrypting secret for key:', fullKey);
	const result = await decrypt(encrypted);
	logService?.trace('[secrets] decrypted secret for key:', fullKey);
	return result;
}

/**
 * Encrypts a secret value and writes it to storage.
 * @param key The secret key (without the `secret://` prefix).
 * @param value The plaintext secret value.
 * @param storageSet A function that writes the encrypted value to storage given a full storage key.
 * @param encrypt A function that encrypts the plaintext value.
 * @param logService Optional logger for trace output.
 */
export async function writeEncryptedSecret(
	key: string,
	value: string,
	storageSet: (fullKey: string, encrypted: string) => void,
	encrypt: (value: string) => Promise<string>,
	logService?: ILogService,
): Promise<void> {
	logService?.trace('[secrets] encrypting secret for key:', key);
	const encrypted = await encrypt(value);
	const fullKey = secretStorageKey(key);
	logService?.trace('[secrets] storing encrypted secret for key:', fullKey);
	storageSet(fullKey, encrypted);
	logService?.trace('[secrets] stored encrypted secret for key:', fullKey);
}

/**
 * Secret keys that should be shared between the VS Code app and the agents app.
 */
export const CROSS_APP_SHARED_SECRET_KEYS: readonly string[] = [
	'{"extensionId":"vscode.github-authentication","key":"github.auth"}',
];

export const ISecretStorageService = createDecorator<ISecretStorageService>('secretStorageService');

export interface ISecretStorageProvider {
	type: 'in-memory' | 'persisted' | 'unknown';
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	keys?(): Promise<string[]>;
}

export interface ISecretStorageService extends ISecretStorageProvider {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSecret: Event<string>;
}

export class BaseSecretStorageService extends Disposable implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;

	protected readonly onDidChangeSecretEmitter = this._register(new Emitter<string>());
	readonly onDidChangeSecret: Event<string> = this.onDidChangeSecretEmitter.event;

	protected readonly _sequencer = new SequencerByKey<string>();

	private _type: 'in-memory' | 'persisted' | 'unknown' = 'unknown';

	private readonly _onDidChangeValueDisposable = this._register(new DisposableStore());

	constructor(
		private readonly _useInMemoryStorage: boolean,
		@IStorageService private _storageService: IStorageService,
		@IEncryptionService protected _encryptionService: IEncryptionService,
		@ILogService protected readonly _logService: ILogService,
	) {
		super();
	}

	protected useSharedStorage(key: string): boolean {
		return isWindows && CROSS_APP_SHARED_SECRET_KEYS.includes(key);
	}

	/**
	 * @Note initialize must be called first so that this can be resolved properly
	 * otherwise it will return 'unknown'.
	 */
	get type() {
		return this._type;
	}

	private _lazyStorageService: Lazy<Promise<IStorageService>> = new Lazy(() => this.initialize());
	protected get resolvedStorageService() {
		return this._lazyStorageService.value;
	}

	get(key: string): Promise<string | undefined> {
		return this._sequencer.queue(key, () => this._doGet(key));
	}

	/**
	 * Read from the safeStorage+SQLite pipeline without going through the sequencer.
	 * Must only be called from within a sequencer-queued task for the same key.
	 */
	protected async _doGet(key: string): Promise<string | undefined> {
		const storageService = await this.resolvedStorageService;

		try {
			return await readEncryptedSecret(
				key,
				(fullKey) => this.getValueFromStorage(key, fullKey, storageService),
				// If the storage service is in-memory, we don't need to decrypt
				this._type === 'in-memory' ? (v) => Promise.resolve(v) : (v) => this._encryptionService.decrypt(v),
				this._logService,
			);
		} catch (e) {
			this._logService.error(e);
			this.delete(key);
			return undefined;
		}
	}

	set(key: string, value: string): Promise<void> {
		return this._sequencer.queue(key, () => this._doSet(key, value));
	}

	/**
	 * Write to the safeStorage+SQLite pipeline without going through the sequencer.
	 * Must only be called from within a sequencer-queued task for the same key.
	 */
	protected async _doSet(key: string, value: string): Promise<void> {
		const storageService = await this.resolvedStorageService;

		try {
			await writeEncryptedSecret(
				key,
				value,
				(fullKey, encrypted) => this.setValueInStorage(key, fullKey, encrypted, storageService),
				// If the storage service is in-memory, we don't need to encrypt
				this._type === 'in-memory' ? (v) => Promise.resolve(v) : (v) => this._encryptionService.encrypt(v),
				this._logService,
			);
		} catch (e) {
			this._logService.error(e);
			throw e;
		}
	}

	delete(key: string): Promise<void> {
		return this._sequencer.queue(key, () => this._doDelete(key));
	}

	/**
	 * Delete from the safeStorage+SQLite pipeline without going through the sequencer.
	 * Must only be called from within a sequencer-queued task for the same key.
	 */
	protected async _doDelete(key: string): Promise<void> {
		const storageService = await this.resolvedStorageService;

		const fullKey = secretStorageKey(key);
		this._logService.trace('[secrets] deleting secret for key:', fullKey);
		const scope = this.useSharedStorage(key) ? StorageScope.APPLICATION_SHARED : StorageScope.APPLICATION;
		storageService.remove(fullKey, scope);
		this._logService.trace('[secrets] deleted secret for key:', fullKey);
	}

	keys(): Promise<string[]> {
		return this._sequencer.queue('__keys__', () => this._doGetKeys());
	}

	/**
	 * List all secret keys from the safeStorage+SQLite pipeline without going through the sequencer.
	 * Must only be called from within a sequencer-queued task.
	 */
	protected async _doGetKeys(): Promise<string[]> {
		const storageService = await this.resolvedStorageService;
		this._logService.trace('[secrets] fetching keys of all secrets');
		const allKeys = storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._logService.trace('[secrets] fetched keys of all secrets');
		return allKeys.filter(key => key.startsWith(SECRET_STORAGE_PREFIX)).map(key => key.slice(SECRET_STORAGE_PREFIX.length));
	}

	private getValueFromStorage(key: string, fullKey: string, storageService: IStorageService): string | undefined {
		if (this.useSharedStorage(key)) {
			this._logService.trace(`[SecretStorageService] Fetching value for cross-app shared secret: ${fullKey}`);
			return storageService.get(fullKey, StorageScope.APPLICATION_SHARED);
		}
		return storageService.get(fullKey, StorageScope.APPLICATION);
	}

	private setValueInStorage(key: string, fullKey: string, value: string, storageService: IStorageService): void {
		if (this.useSharedStorage(key)) {
			this._logService.trace(`[SecretStorageService] Setting value for cross-app shared secret: ${fullKey}`);
			storageService.store(fullKey, value, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			return;
		}
		storageService.store(fullKey, value, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private async initialize(): Promise<IStorageService> {
		let storageService;
		if (!this._useInMemoryStorage && await this._encryptionService.isEncryptionAvailable()) {
			this._logService.trace(`[SecretStorageService] Encryption is available, using persisted storage`);
			this._type = 'persisted';
			storageService = this._storageService;
		} else {
			// If we already have an in-memory storage service, we don't need to recreate it
			if (this._type === 'in-memory') {
				return this._storageService;
			}
			this._logService.trace('[SecretStorageService] Encryption is not available, falling back to in-memory storage');
			this._type = 'in-memory';
			storageService = this._register(new InMemoryStorageService());
		}

		this._onDidChangeValueDisposable.clear();
		this._onDidChangeValueDisposable.add(Event.any<IStorageValueChangeEvent>(
			storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, this._onDidChangeValueDisposable),
			storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, undefined, this._onDidChangeValueDisposable),
		)(e => {
			this.onDidChangeValue(e.key);
		}));
		return storageService;
	}

	protected reinitialize(): void {
		this._lazyStorageService = new Lazy(() => this.initialize());
	}

	private onDidChangeValue(key: string): void {
		if (!key.startsWith(SECRET_STORAGE_PREFIX)) {
			return;
		}

		const secretKey = key.slice(SECRET_STORAGE_PREFIX.length);

		this._logService.trace(`[SecretStorageService] Notifying change in value for secret: ${secretKey}`);
		this.onDidChangeSecretEmitter.fire(secretKey);
	}
}
