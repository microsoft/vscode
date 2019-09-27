/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { Disposable } from 'vs/base/common/lifecycle';

const SERVICE_NAME = 'settingsSync';
const ACCOUNT = 'Test';

export class AuthTokenService extends Disposable implements IAuthTokenService {
	_serviceBrand: undefined;

	private _status: AuthTokenStatus = AuthTokenStatus.Unavailable;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	constructor(
		@ICredentialsService private readonly credentialsService: ICredentialsService,
	) {
		super();
	}

	getToken(): Promise<string | null> {
		return this.credentialsService.getPassword(SERVICE_NAME, ACCOUNT);
	}

	async updateToken(token: string): Promise<void> {
		await this.credentialsService.setPassword(SERVICE_NAME, ACCOUNT, token);
		this.setStatus(AuthTokenStatus.Available);
	}

	async refreshToken(): Promise<void> {
		await this.deleteToken();
	}

	async deleteToken(): Promise<void> {
		await this.credentialsService.deletePassword(SERVICE_NAME, ACCOUNT);
		this.setStatus(AuthTokenStatus.Unavailable);
	}

	private setStatus(status: AuthTokenStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

}

