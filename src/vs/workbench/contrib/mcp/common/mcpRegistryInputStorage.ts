/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';

const MCP_ENCRYPTION_KEY_NAME = 'mcpEncryptionKey';
const MCP_ENCRYPTION_KEY_ALGORITHM = 'AES-GCM';
const MCP_ENCRYPTION_KEY_LEN = 256;
const MCP_ENCRYPTION_IV_LENGTH = 12; // 96 bits
const MCP_DATA_STORED_VERSION = 1;
const MCP_DATA_STORED_KEY = 'mcpInputs';

interface IStoredData {
	version: number;
	values: Record<string, IResolvedValue>;
	secrets?: { value: string; iv: string }; // base64, encrypted
}

interface IHydratedData extends IStoredData {
	unsealedSecrets?: Record<string, IResolvedValue>;
}

export class McpRegistryInputStorage extends Disposable {
	private static secretSequencer = new Sequencer();
	private readonly _secretsSealerSequencer = new Sequencer();

	private readonly _getEncryptionKey = new Lazy(() => {
		return McpRegistryInputStorage.secretSequencer.queue(async () => {
			const existing = await this._secretStorageService.get(MCP_ENCRYPTION_KEY_NAME);
			if (existing) {
				try {
					const parsed: JsonWebKey = JSON.parse(existing);
					return await crypto.subtle.importKey('jwk', parsed, MCP_ENCRYPTION_KEY_ALGORITHM, false, ['encrypt', 'decrypt']);
				} catch {
					// fall through
				}
			}

			const key = await crypto.subtle.generateKey(
				{ name: MCP_ENCRYPTION_KEY_ALGORITHM, length: MCP_ENCRYPTION_KEY_LEN },
				true,
				['encrypt', 'decrypt'],
			);

			const exported = await crypto.subtle.exportKey('jwk', key);
			await this._secretStorageService.set(MCP_ENCRYPTION_KEY_NAME, JSON.stringify(exported));
			return key;
		});
	});

	private _didChange = false;

	private _record = new Lazy<IHydratedData>(() => {
		const stored = this._storageService.getObject<IStoredData>(MCP_DATA_STORED_KEY, this._scope);
		return stored?.version === MCP_DATA_STORED_VERSION ? { ...stored } : { version: MCP_DATA_STORED_VERSION, values: {} };
	});


	constructor(
		private readonly _scope: StorageScope,
		_target: StorageTarget,
		@IStorageService private readonly _storageService: IStorageService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(_storageService.onWillSaveState(() => {
			if (this._didChange) {
				this._storageService.store(MCP_DATA_STORED_KEY, {
					version: MCP_DATA_STORED_VERSION,
					values: this._record.value.values,
					secrets: this._record.value.secrets,
				} satisfies IStoredData, this._scope, _target);
				this._didChange = false;
			}
		}));
	}

	/** Deletes all collection data from storage. */
	public clearAll() {
		this._record.value.values = {};
		this._record.value.secrets = undefined;
		this._record.value.unsealedSecrets = undefined;
		this._didChange = true;
	}

	/** Delete a single collection data from the storage. */
	public async clear(inputKey: string) {
		const secrets = await this._unsealSecrets();
		delete this._record.value.values[inputKey];
		this._didChange = true;

		if (secrets.hasOwnProperty(inputKey)) {
			delete secrets[inputKey];
			await this._sealSecrets();
		}
	}

	/** Gets a mapping of saved input data. */
	public async getMap() {
		const secrets = await this._unsealSecrets();
		return { ...this._record.value.values, ...secrets };
	}

	/** Updates the input data mapping. */
	public async setPlainText(values: Record<string, IResolvedValue>) {
		Object.assign(this._record.value.values, values);
		this._didChange = true;
	}

	/** Updates the input secrets mapping. */
	public async setSecrets(values: Record<string, IResolvedValue>) {
		const unsealed = await this._unsealSecrets();
		Object.assign(unsealed, values);
		await this._sealSecrets();
	}

	private async _sealSecrets() {
		const key = await this._getEncryptionKey.value;
		return this._secretsSealerSequencer.queue(async () => {
			if (!this._record.value.unsealedSecrets || isEmptyObject(this._record.value.unsealedSecrets)) {
				this._record.value.secrets = undefined;
				return;
			}

			const toSeal = JSON.stringify(this._record.value.unsealedSecrets);
			const iv = crypto.getRandomValues(new Uint8Array(MCP_ENCRYPTION_IV_LENGTH));
			const encrypted = await crypto.subtle.encrypt(
				{ name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer },
				key,
				new TextEncoder().encode(toSeal).buffer as ArrayBuffer,
			);

			const enc = encodeBase64(VSBuffer.wrap(new Uint8Array(encrypted)));
			this._record.value.secrets = { iv: encodeBase64(VSBuffer.wrap(iv)), value: enc };
			this._didChange = true;
		});
	}

	private async _unsealSecrets(): Promise<Record<string, IResolvedValue>> {
		if (!this._record.value.secrets) {
			return this._record.value.unsealedSecrets ??= {};
		}

		if (this._record.value.unsealedSecrets) {
			return this._record.value.unsealedSecrets;
		}

		try {
			const key = await this._getEncryptionKey.value;
			const iv = decodeBase64(this._record.value.secrets.iv);
			const encrypted = decodeBase64(this._record.value.secrets.value);

			const decrypted = await crypto.subtle.decrypt(
				{ name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer as Uint8Array<ArrayBuffer> },
				key,
				encrypted.buffer as Uint8Array<ArrayBuffer>,
			);

			const unsealedSecrets = JSON.parse(new TextDecoder().decode(decrypted));
			this._record.value.unsealedSecrets = unsealedSecrets;
			return unsealedSecrets;
		} catch (e) {
			this._logService.warn('Error unsealing MCP secrets', e);
			this._record.value.secrets = undefined;
		}

		return {};
	}
}
