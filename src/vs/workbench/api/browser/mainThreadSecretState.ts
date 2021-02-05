/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ICredentialsService } from 'vs/workbench/services/credentials/common/credentials';
import { IEncryptionService } from 'vs/workbench/services/encryption/common/encryptionService';
import { ExtHostContext, ExtHostSecretStateShape, IExtHostContext, MainContext, MainThreadSecretStateShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadSecretState)
export class MainThreadSecretState extends Disposable implements MainThreadSecretStateShape {
	private readonly _proxy: ExtHostSecretStateShape;

	constructor(
		extHostContext: IExtHostContext,
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IEncryptionService private readonly encryptionService: IEncryptionService,
		@IProductService private readonly productService: IProductService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSecretState);

		this._register(this.credentialsService.onDidChangePassword(e => {
			const extensionId = e.service.substring(this.productService.urlProtocol.length);
			this._proxy.$onDidChangePassword({ extensionId, key: e.account });
		}));
	}

	private getFullKey(extensionId: string): string {
		return `${this.productService.urlProtocol}${extensionId}`;
	}

	async $getPassword(extensionId: string, key: string): Promise<string | undefined> {
		const fullKey = this.getFullKey(extensionId);
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
		const fullKey = this.getFullKey(extensionId);
		const toEncrypt = JSON.stringify({
			extensionId,
			content: value
		});
		const encrypted = await this.encryptionService.encrypt(toEncrypt);
		return this.credentialsService.setPassword(fullKey, key, encrypted);
	}

	async $deletePassword(extensionId: string, key: string): Promise<void> {
		try {
			const fullKey = this.getFullKey(extensionId);
			await this.credentialsService.deletePassword(fullKey, key);
		} catch (_) {
			throw new Error('Cannot delete password');
		}
	}
}
