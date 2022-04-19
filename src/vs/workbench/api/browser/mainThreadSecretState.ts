/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { IEncryptionService } from 'vs/workbench/services/encryption/common/encryptionService';
import { ExtHostContext, ExtHostSecretStateShape, MainContext, MainThreadSecretStateShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadSecretState)
export class MainThreadSecretState extends Disposable implements MainThreadSecretStateShape {
	private readonly _proxy: ExtHostSecretStateShape;

	private secretStoragePrefix = this.credentialsService.getSecretStoragePrefix();

	constructor(
		extHostContext: IExtHostContext,
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IEncryptionService private readonly encryptionService: IEncryptionService,
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
		const fullKey = await this.getFullKey(extensionId);
		const password = await this.credentialsService.getPassword(fullKey, key);
		const decrypted = password && await this.encryptionService.decrypt(password);

		if (decrypted) {
			try {
				const value = JSON.parse(decrypted);
				if (value.extensionId === extensionId) {
					return value.content;
				}
			} catch (_) {
				throw new Error('Cannot get password');
			}
		}

		return undefined;
	}

	async $setPassword(extensionId: string, key: string, value: string): Promise<void> {
		const fullKey = await this.getFullKey(extensionId);
		const toEncrypt = JSON.stringify({
			extensionId,
			content: value
		});
		const encrypted = await this.encryptionService.encrypt(toEncrypt);
		return this.credentialsService.setPassword(fullKey, key, encrypted);
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
