/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsService, ICredentialsProvider } from 'vs/workbench/services/credentials/common/credentials';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export class BrowserCredentialsService extends Disposable implements ICredentialsService {

	declare readonly _serviceBrand: undefined;

	private _onDidChangePassword = this._register(new Emitter<void>());
	readonly onDidChangePassword = this._onDidChangePassword.event;

	private credentialsProvider: ICredentialsProvider;

	constructor(@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService) {
		super();

		if (environmentService.options && environmentService.options.credentialsProvider) {
			this.credentialsProvider = environmentService.options.credentialsProvider;
		} else {
			this.credentialsProvider = new InMemoryCredentialsProvider();
		}
	}

	getPassword(service: string, account: string): Promise<string | null> {
		return this.credentialsProvider.getPassword(service, account);
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		await this.credentialsProvider.setPassword(service, account, password);

		this._onDidChangePassword.fire();
	}

	deletePassword(service: string, account: string): Promise<boolean> {
		const didDelete = this.credentialsProvider.deletePassword(service, account);
		if (didDelete) {
			this._onDidChangePassword.fire();
		}

		return didDelete;
	}

	findPassword(service: string): Promise<string | null> {
		return this.credentialsProvider.findPassword(service);
	}

	findCredentials(service: string): Promise<Array<{ account: string, password: string; }>> {
		return this.credentialsProvider.findCredentials(service);
	}
}

interface ICredential {
	service: string;
	account: string;
	password: string;
}

class InMemoryCredentialsProvider implements ICredentialsProvider {

	private credentials: ICredential[] = [];

	async getPassword(service: string, account: string): Promise<string | null> {
		const credential = this.doFindPassword(service, account);

		return credential ? credential.password : null;
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		this.deletePassword(service, account);
		this.credentials.push({ service, account, password });
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		const credential = this.doFindPassword(service, account);
		if (credential) {
			this.credentials = this.credentials.splice(this.credentials.indexOf(credential), 1);
		}

		return !!credential;
	}

	async findPassword(service: string): Promise<string | null> {
		const credential = this.doFindPassword(service);

		return credential ? credential.password : null;
	}

	private doFindPassword(service: string, account?: string): ICredential | undefined {
		return this.credentials.find(credential =>
			credential.service === service && (typeof account !== 'string' || credential.account === account));
	}

	async findCredentials(service: string): Promise<Array<{ account: string, password: string; }>> {
		return this.credentials
			.filter(credential => credential.service === service)
			.map(({ account, password }) => ({ account, password }));
	}
}

registerSingleton(ICredentialsService, BrowserCredentialsService, true);
