/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { Disposable } from 'vs/base/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const SERVICE_NAME = 'VS Code';
const ACCOUNT = 'MyAccount';

export class AuthTokenService extends Disposable implements IAuthTokenService {
	_serviceBrand: undefined;

	private _status: AuthTokenStatus = AuthTokenStatus.Disabled;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	constructor(
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		if (productService.settingsSyncStoreUrl && configurationService.getValue('configurationSync.enableAuth')) {
			this._status = AuthTokenStatus.Inactive;
			this.getToken().then(token => {
				if (token) {
					this.setStatus(AuthTokenStatus.Active);
				}
			});
		}
	}

	getToken(): Promise<string | null> {
		if (this.status === AuthTokenStatus.Disabled) {
			throw new Error('Not enabled');
		}
		return this.credentialsService.getPassword(SERVICE_NAME, ACCOUNT);
	}

	async updateToken(token: string): Promise<void> {
		if (this.status === AuthTokenStatus.Disabled) {
			throw new Error('Not enabled');
		}
		await this.credentialsService.setPassword(SERVICE_NAME, ACCOUNT, token);
		this.setStatus(AuthTokenStatus.Active);
	}

	async refreshToken(): Promise<void> {
		if (this.status === AuthTokenStatus.Disabled) {
			throw new Error('Not enabled');
		}
		await this.deleteToken();
	}

	async deleteToken(): Promise<void> {
		if (this.status === AuthTokenStatus.Disabled) {
			throw new Error('Not enabled');
		}
		await this.credentialsService.deletePassword(SERVICE_NAME, ACCOUNT);
		this.setStatus(AuthTokenStatus.Inactive);
	}

	private setStatus(status: AuthTokenStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

}

