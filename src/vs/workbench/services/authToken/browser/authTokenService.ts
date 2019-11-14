/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { Disposable } from 'vs/base/common/lifecycle';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { URI } from 'vs/base/common/uri';

const SERVICE_NAME = 'VS Code';
const ACCOUNT = 'MyAccount';

export class AuthTokenService extends Disposable implements IAuthTokenService {
	_serviceBrand: undefined;

	private _status: AuthTokenStatus = AuthTokenStatus.Inactive;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	readonly _onDidGetCallback: Emitter<URI> = this._register(new Emitter<URI>());

	constructor(
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super();
		this._status = AuthTokenStatus.Inactive;
		this.getToken().then(token => {
			if (token) {
				this.setStatus(AuthTokenStatus.Active);
			}
		});
	}

	async getToken(): Promise<string | undefined> {
		const token = await this.credentialsService.getPassword(SERVICE_NAME, ACCOUNT);
		if (token) {
			return token;
		}

		return;
	}

	async login(): Promise<void> {
		const token = await this.quickInputService.input({ placeHolder: localize('enter token', "Please provide the auth bearer token"), ignoreFocusLost: true, });
		if (token) {
			await this.credentialsService.setPassword(SERVICE_NAME, ACCOUNT, token);
			this.setStatus(AuthTokenStatus.Active);
		}
	}

	async refreshToken(): Promise<void> {
		await this.logout();
	}

	async logout(): Promise<void> {
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
