/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { ExtHostContext, ExtHostSecretStateShape, MainContext, MainThreadSecretStateShape } from '../common/extHost.protocol';
import { ILogService } from 'vs/platform/log/common/log';
import { SequencerByKey } from 'vs/base/common/async';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IEncryptionService } from 'vs/platform/encryption/common/encryptionService';

class OldMainThreadSecretState extends Disposable implements MainThreadSecretStateShape {

	private secretStoragePrefix = this.credentialsService.getSecretStoragePrefix();

	constructor(
		private readonly _proxy: ExtHostSecretStateShape,
		private readonly credentialsService: ICredentialsService,
		private readonly encryptionService: IEncryptionService,
		private readonly logService: ILogService,
	) {
		super();
		this._register(this.credentialsService.onDidChangePassword(async e => {
			const extensionId = e.service?.substring((await this.secretStoragePrefix).length);
			if (extensionId) {
				this._proxy.$onDidChangePassword({ extensionId, key: e.account });
			}
		}));
	}

	private async getFullKey(extensionId: string): Promise<string> {
		return `${await this.secretStoragePrefix}${extensionId}`;
	}

	async $getPassword(extensionId: string, key: string): Promise<string | undefined> {
		this.logService.trace(`MainThreadSecretState#getPassword: Getting password for ${extensionId} extension: `, key);
		const fullKey = await this.getFullKey(extensionId);
		const password = await this.credentialsService.getPassword(fullKey, key);
		if (!password) {
			this.logService.trace('MainThreadSecretState#getPassword: No password found for: ', key);
			return undefined;
		}

		let decrypted: string | null;
		try {
			this.logService.trace('MainThreadSecretState#getPassword: Decrypting password for: ', key);
			decrypted = await this.encryptionService.decrypt(password);
		} catch (e) {
			this.logService.error(e);
			this.logService.trace('MainThreadSecretState#getPassword: Trying migration for: ', key);

			// If we are on a platform that newly started encrypting secrets before storing them,
			// then passwords previously stored were stored un-encrypted (NOTE: but still being stored in a secure keyring).
			// When we try to decrypt a password that wasn't encrypted previously, the encryption service will throw.
			// To recover gracefully, we first try to encrypt & store the password (essentially migrating the secret to the new format)
			// and then we try to read it and decrypt again.
			const encryptedForSet = await this.encryptionService.encrypt(password);
			await this.credentialsService.setPassword(fullKey, key, encryptedForSet);
			const passwordEncrypted = await this.credentialsService.getPassword(fullKey, key);
			decrypted = passwordEncrypted && await this.encryptionService.decrypt(passwordEncrypted);
		}

		if (decrypted) {
			try {
				const value = JSON.parse(decrypted);
				if (value.extensionId === extensionId) {
					this.logService.trace('MainThreadSecretState#getPassword: Password found for: ', key);
					return value.content;
				}
			} catch (parseError) {
				// We may not be able to parse it, but we keep the secret in the keychain anyway just in case
				// it decrypts correctly in the future.
				this.logService.error(parseError);
				throw new Error('Unable to parse decrypted password');
			}
		}

		this.logService.trace('MainThreadSecretState#getPassword: No password found for: ', key);
		return undefined;
	}

	async $setPassword(extensionId: string, key: string, value: string): Promise<void> {
		this.logService.trace(`MainThreadSecretState#setPassword: Setting password for ${extensionId} extension: `, key);
		const fullKey = await this.getFullKey(extensionId);
		const toEncrypt = JSON.stringify({
			extensionId,
			content: value
		});
		this.logService.trace('MainThreadSecretState#setPassword: Encrypting password for: ', key);
		const encrypted = await this.encryptionService.encrypt(toEncrypt);
		this.logService.trace('MainThreadSecretState#setPassword: Storing password for: ', key);
		return await this.credentialsService.setPassword(fullKey, key, encrypted);
	}

	async $deletePassword(extensionId: string, key: string): Promise<void> {
		try {
			const fullKey = await this.getFullKey(extensionId);
			await this.credentialsService.deletePassword(fullKey, key);
		} catch (_) {
			throw new Error('Cannot delete password');
		}
	}
}

@extHostNamedCustomer(MainContext.MainThreadSecretState)
export class MainThreadSecretState extends Disposable implements MainThreadSecretStateShape {
	private readonly _proxy: ExtHostSecretStateShape;

	private readonly _oldMainThreadSecretState: OldMainThreadSecretState | undefined;

	private readonly _sequencer = new SequencerByKey<string>();

	// TODO: Remove this when we remove the old API
	private secretStoragePrefix = this.credentialsService.getSecretStoragePrefix();

	constructor(
		extHostContext: IExtHostContext,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService,
		// TODO: Remove this when we remove the old API
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		// TODO: Remove this when we remove the old API
		@IEncryptionService private readonly encryptionService: IEncryptionService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSecretState);

		if (environmentService.options?.credentialsProvider) {
			this._oldMainThreadSecretState = this._register(new OldMainThreadSecretState(
				this._proxy,
				credentialsService,
				encryptionService,
				logService
			));
		}

		this._register(this.secretStorageService.onDidChangeSecret((e: string) => {
			try {
				const { extensionId, key } = this.parseKey(e);
				if (extensionId && key) {
					this._proxy.$onDidChangePassword({ extensionId, key });
				}
			} catch (e) {
				// Core can use non-JSON values as keys, so we may not be able to parse them.
			}
		}));
	}

	$getPassword(extensionId: string, key: string): Promise<string | undefined> {
		this.logService.trace(`[mainThreadSecretState] Getting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doGetPassword(extensionId, key));
	}

	private async doGetPassword(extensionId: string, key: string): Promise<string | undefined> {
		// TODO: Remove this when we remove the old API
		if (this._oldMainThreadSecretState) {
			return await this._oldMainThreadSecretState.$getPassword(extensionId, key);
		}

		const fullKey = this.getKey(extensionId, key);

		const password = await this.secretStorageService.get(fullKey);
		if (!password) {
			this.logService.trace('[mainThreadSecretState] No password found for: ', extensionId, key);

			// TODO: Remove this when we remove the old API
			const password = await this.getAndDeleteOldPassword(extensionId, key);
			return password;
		}

		this.logService.trace('[mainThreadSecretState] Password found for: ', extensionId, key);
		return password;
	}

	$setPassword(extensionId: string, key: string, value: string): Promise<void> {
		this.logService.trace(`[mainThreadSecretState] Setting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doSetPassword(extensionId, key, value));
	}

	private async doSetPassword(extensionId: string, key: string, value: string): Promise<void> {
		// TODO: Remove this when we remove the old API
		if (this._oldMainThreadSecretState) {
			return await this._oldMainThreadSecretState.$setPassword(extensionId, key, value);
		}

		const fullKey = this.getKey(extensionId, key);
		await this.secretStorageService.set(fullKey, value);
		this.logService.trace('[mainThreadSecretState] Password set for: ', extensionId, key);
	}

	$deletePassword(extensionId: string, key: string): Promise<void> {
		this.logService.trace(`[mainThreadSecretState] Deleting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doDeletePassword(extensionId, key));
	}

	private async doDeletePassword(extensionId: string, key: string): Promise<void> {
		// TODO: Remove this when we remove the old API
		if (this._oldMainThreadSecretState) {
			return await this._oldMainThreadSecretState.$deletePassword(extensionId, key);
		}

		const fullKey = this.getKey(extensionId, key);
		await this.secretStorageService.delete(fullKey);
		this.logService.trace('[mainThreadSecretState] Password deleted for: ', extensionId, key);
	}

	private getKey(extensionId: string, key: string): string {
		return JSON.stringify({ extensionId, key });
	}

	private parseKey(key: string): { extensionId: string; key: string } {
		return JSON.parse(key);
	}

	//#region Old API

	// Delete this all when we remove the old API

	private async getAndDeleteOldPassword(extensionId: string, key: string): Promise<string | undefined> {
		const password = await this.getOldPassword(extensionId, key);
		if (password) {
			const fullKey = this.getKey(extensionId, key);
			this.logService.trace('[mainThreadSecretState] Setting old password to new location for: ', extensionId, key);
			await this.secretStorageService.set(fullKey, password);
			this.logService.trace('[mainThreadSecretState] Old Password set to new location for: ', extensionId, key);
			if (this.secretStorageService.type === 'persisted') {
				this.logService.trace('[mainThreadSecretState] Deleting old password for since it was persisted in the new location: ', extensionId, key);
				await this.deleteOldPassword(extensionId, key);
			}
		}
		return password;
	}

	private async getOldPassword(extensionId: string, key: string): Promise<string | undefined> {
		this.logService.trace(`[mainThreadSecretState] Getting old password for ${extensionId} extension: `, key);
		const fullKey = `${await this.secretStoragePrefix}${extensionId}`;
		const password = await this.credentialsService.getPassword(fullKey, key);
		if (!password) {
			this.logService.trace('[mainThreadSecretState] No old password found for: ', extensionId, key);
			return undefined;
		}

		let decrypted: string | null;
		try {
			this.logService.trace('[mainThreadSecretState] Decrypting old password for: ', extensionId, key);
			decrypted = await this.encryptionService.decrypt(password);
		} catch (e) {
			this.logService.error(e);
			this.logService.trace('[mainThreadSecretState] Trying old migration for: ', extensionId, key);

			// If we are on a platform that newly started encrypting secrets before storing them,
			// then passwords previously stored were stored un-encrypted (NOTE: but still being stored in a secure keyring).
			// When we try to decrypt a password that wasn't encrypted previously, the encryption service will throw.
			// To recover gracefully, we first try to encrypt & store the password (essentially migrating the secret to the new format)
			// and then we try to read it and decrypt again.
			const encryptedForSet = await this.encryptionService.encrypt(password);
			await this.credentialsService.setPassword(fullKey, key, encryptedForSet);
			const passwordEncrypted = await this.credentialsService.getPassword(fullKey, key);
			decrypted = passwordEncrypted && await this.encryptionService.decrypt(passwordEncrypted);
		}

		if (decrypted) {
			try {
				const value = JSON.parse(decrypted);
				if (value.extensionId === extensionId) {
					this.logService.trace('[mainThreadSecretState] Old password found for: ', extensionId, key);
					return value.content;
				}
			} catch (parseError) {
				// We may not be able to parse it, but we keep the secret in the keychain anyway just in case
				// it decrypts correctly in the future.
				this.logService.error(parseError);
				return undefined;
			}
		}

		this.logService.trace('[mainThreadSecretState] No old password found for: ', extensionId, key);
		return undefined;
	}

	private async deleteOldPassword(extensionId: string, key: string): Promise<void> {
		try {
			const fullKey = `${await this.secretStoragePrefix}${extensionId}`;
			this.logService.trace(`[mainThreadSecretState] Deleting old password for ${extensionId} extension: `, key);
			await this.credentialsService.deletePassword(fullKey, key);
			this.logService.trace('[mainThreadSecretState] Old password deleted for: ', extensionId, key);
		} catch (_) {
			throw new Error('Cannot delete password');
		}
	}

	//#endregion
}
