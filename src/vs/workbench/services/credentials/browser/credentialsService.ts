/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsService, ICredentialsProvider, ICredentialsChangeEvent, InMemoryCredentialsProvider } from 'vs/platform/credentials/common/credentials';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class BrowserCredentialsService extends Disposable implements ICredentialsService {

	declare readonly _serviceBrand: undefined;

	private _onDidChangePassword = this._register(new Emitter<ICredentialsChangeEvent>());
	readonly onDidChangePassword = this._onDidChangePassword.event;

	private credentialsProvider: ICredentialsProvider;

	private _secretStoragePrefix: Promise<string>;
	public async getSecretStoragePrefix() { return this._secretStoragePrefix; }

	constructor(
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IProductService private readonly productService: IProductService
	) {
		super();

		if (
			environmentService.remoteAuthority
			&& !environmentService.options?.credentialsProvider
			&& !environmentService.options?.secretStorageProvider
		) {
			// If we have a remote authority but the embedder didn't provide a credentialsProvider,
			// we can use the CredentialsService on the remote side
			const remoteCredentialsService = ProxyChannel.toService<ICredentialsService>(remoteAgentService.getConnection()!.getChannel('credentials'));
			this.credentialsProvider = remoteCredentialsService;
			this._secretStoragePrefix = remoteCredentialsService.getSecretStoragePrefix();
		} else {
			// fall back to InMemoryCredentialsProvider if none was given to us.
			this.credentialsProvider = environmentService.options?.credentialsProvider ?? new InMemoryCredentialsProvider();
			this._secretStoragePrefix = Promise.resolve(this.productService.urlProtocol);
		}
	}

	getPassword(service: string, account: string): Promise<string | null> {
		return this.credentialsProvider.getPassword(service, account);
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		await this.credentialsProvider.setPassword(service, account, password);

		this._onDidChangePassword.fire({ service, account });
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		const didDelete = await this.credentialsProvider.deletePassword(service, account);
		if (didDelete) {
			this._onDidChangePassword.fire({ service, account });
		}

		return didDelete;
	}

	findPassword(service: string): Promise<string | null> {
		return this.credentialsProvider.findPassword(service);
	}

	findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
		return this.credentialsProvider.findCredentials(service);
	}

	async clear(): Promise<void> {
		if (this.credentialsProvider.clear) {
			return this.credentialsProvider.clear();
		}
	}
}
