/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InMemoryCredentialsProvider } from 'vs/platform/credentials/common/credentials';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';
import { BaseCredentialsMainService, KeytarModule } from 'vs/platform/credentials/common/credentialsMainService';

export class CredentialsWebMainService extends BaseCredentialsMainService {
	// Since we fallback to the in-memory credentials provider, we do not need to surface any Keytar load errors
	// to the user.
	protected surfaceKeytarLoadError?: (err: any) => void;

	constructor(
		@ILogService logService: ILogService,
		@INativeEnvironmentService private readonly environmentMainService: INativeEnvironmentService,
		@IProductService private readonly productService: IProductService,
	) {
		super(logService);
	}

	// If the credentials service is running on the server, we add a suffix -server to differentiate from the location that the
	// client would store the credentials.
	public override async getSecretStoragePrefix() { return Promise.resolve(`${this.productService.urlProtocol}-server`); }

	protected async withKeytar(): Promise<KeytarModule> {
		if (this._keytarCache) {
			return this._keytarCache;
		}

		if (this.environmentMainService.disableKeytar) {
			this.logService.info('Keytar is disabled. Using in-memory credential store instead.');
			this._keytarCache = new InMemoryCredentialsProvider();
			return this._keytarCache;
		}

		try {
			this._keytarCache = await import('keytar');
			// Try using keytar to see if it throws or not.
			await this._keytarCache.findCredentials('test-keytar-loads');
		} catch (e) {
			this.logService.warn(
				`Using the in-memory credential store as the operating system's credential store could not be accessed. Please see https://aka.ms/vscode-server-keyring on how to set this up. Details: ${e.message ?? e}`);
			this._keytarCache = new InMemoryCredentialsProvider();
		}
		return this._keytarCache;
	}
}
