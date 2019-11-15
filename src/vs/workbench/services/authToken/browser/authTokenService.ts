/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { UserAgentApplication } from 'Msal';

const SERVICE_NAME = 'VS Code';
const ACCOUNT = 'MyAccount';
const clientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';

export class AuthTokenService extends Disposable implements IAuthTokenService {
	_serviceBrand: undefined;

	private _status: AuthTokenStatus = AuthTokenStatus.Inactive;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	readonly _onDidGetCallback: Emitter<URI> = this._register(new Emitter<URI>());

	private _msalInstance: UserAgentApplication | undefined;
	private _loadMsal: Promise<void>;

	constructor(
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		this._loadMsal = (import('Msal')).then(msal => {
			this._msalInstance = new msal.UserAgentApplication({ auth: { clientId } });
		});

		this.getToken().then(token => {
			if (token) {
				this.setStatus(AuthTokenStatus.Active);
			} else {
				this.setStatus(AuthTokenStatus.Inactive);
			}
		});
	}

	async getToken(): Promise<string | undefined> {
		const token = await this.credentialsService.getPassword(SERVICE_NAME, ACCOUNT);
		if (token) {
			return token;
		} else {
			if (!this.environmentService.isBuilt) {
				return;
			}

			try {
				await this._loadMsal;
				const response = await this._msalInstance!.acquireTokenSilent({});
				return response.accessToken;
			} catch (e) {
				return;
			}
		}
	}

	async login(): Promise<void> {
		// Cannot redirect to localhost in the implicit grant flow, fall back to asking for token when running out of sources
		if (!this.environmentService.isBuilt) {
			const token = await this.quickInputService.input({ placeHolder: localize('enter token', "Please provide the auth bearer token"), ignoreFocusLost: true, });
			if (token) {
				await this.credentialsService.setPassword(SERVICE_NAME, ACCOUNT, token);
				this.setStatus(AuthTokenStatus.Active);
			}

			return;
		}

		try {
			await this._loadMsal;
			const response = await this._msalInstance!.loginPopup();
			await this.credentialsService.setPassword(SERVICE_NAME, ACCOUNT, response.accessToken);
			this.setStatus(AuthTokenStatus.Active);
		} catch (e) {
			this.notificationService.error(localize('loginFailed', "Login failed: {0}", e));
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
