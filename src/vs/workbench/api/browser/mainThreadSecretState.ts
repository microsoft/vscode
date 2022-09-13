/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { IEncryptionService } from 'vs/workbench/services/encryption/common/encryptionService';
import { ExtHostContext, ExtHostSecretStateShape, MainContext, MainThreadSecretStateShape } from '../common/extHost.protocol';
import { ILogService } from 'vs/platform/log/common/log';

@extHostNamedCustomer(MainContext.MainThreadSecretState)
export class MainThreadSecretState extends Disposable implements MainThreadSecretStateShape {
	private readonly _proxy: ExtHostSecretStateShape;

	private secretStoragePrefix = this.credentialsService.getSecretStoragePrefix();

	constructor(
		extHostContext: IExtHostContext,
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IEncryptionService private readonly encryptionService: IEncryptionService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSecretState);

		this._register(this.credentialsService.onDidChangePassword(async e => {
			const extensionId = e.service.substring((await this.secretStoragePrefix).length);
			this._proxy.$onDidChangePassword({ extensionId, key: e.account });
		}));
	}

	private async getFullKey(extensionId: string): Promise<string> {
		return `${await this.secretStoragePrefix}${extensionId}`;
	}

	async $getPassword(extensionId: string, key: string): Promise<string | undefined> {
		this.logService.trace(`Getting password for ${extensionId} extension:`, key);
		const fullKey = await this.getFullKey(extensionId);
		const password = await this.credentialsService.getPassword(fullKey, key);
		if (!password) {
			this.logService.trace('No password found for:', key);
			return undefined;
		}

		let decrypted: string | null;
		try {
			decrypted = await this.encryptionService.decrypt(password);
		} catch (e) {
			this.logService.error(e);

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
					this.logService.trace('Password found for:', key);
					return value.content;
				}
			} catch (parseError) {
				this.logService.error(parseError);

				// If we can't parse the decrypted value, then it's not a valid secret so we should try to delete it
				try {
					await this.credentialsService.deletePassword(fullKey, key);
				} catch (e) {
					this.logService.error(e);
				}

				throw new Error('Unable to parse decrypted password');
			}
		}

		this.logService.trace('No password found for:', key);
		return undefined;
	}

	async $setPassword(extensionId: string, key: string, value: string): Promise<void> {
		const fullKey = await this.getFullKey(extensionId);
		const toEncrypt = JSON.stringify({
			extensionId,
			content: value
		});
		const encrypted = await this.encryptionService.encrypt(toEncrypt);
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
