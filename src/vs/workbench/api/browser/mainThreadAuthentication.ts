/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtHostAuthenticationShape, ExtHostContext, IExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';

export class MainThreadAuthenticationProvider {
	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly displayName: string
	) { }

	async getSessions(): Promise<ReadonlyArray<modes.AuthenticationSession>> {
		return (await this._proxy.$getSessions(this.id)).map(session => {
			return {
				id: session.id,
				accountName: session.accountName,
				accessToken: () => this._proxy.$getSessionAccessToken(this.id, session.id)
			};
		});
	}

	login(scopes: string[]): Promise<modes.AuthenticationSession> {
		return this._proxy.$login(this.id, scopes).then(session => {
			return {
				id: session.id,
				accountName: session.accountName,
				accessToken: () => this._proxy.$getSessionAccessToken(this.id, session.id)
			};
		});
	}

	logout(accountId: string): Promise<void> {
		return this._proxy.$logout(this.id, accountId);
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
	}

	$registerAuthenticationProvider(id: string, displayName: string): void {
		const provider = new MainThreadAuthenticationProvider(this._proxy, id, displayName);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$onDidChangeSessions(id: string): void {
		this.authenticationService.sessionsUpdate(id);
	}

	async $getSessionsPrompt(providerId: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const alwaysAllow = this.storageService.get(`${extensionId}-${providerId}`, StorageScope.GLOBAL);
		if (alwaysAllow) {
			return true;
		}

		const { choice } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmAuthenticationAccess', "The extension '{0}' is trying to access authentication information from {1}.", extensionName, providerName),
			[nls.localize('cancel', "Cancel"), nls.localize('allow', "Allow"), nls.localize('alwaysAllow', "Always Allow"),],
			{ cancelId: 0 }
		);

		switch (choice) {
			case 1/** Allow */:
				return true;
			case 2 /** Always Allow */:
				this.storageService.store(`${extensionId}-${providerId}`, 'true', StorageScope.GLOBAL);
				return true;
			default:
				return false;
		}
	}

	async $loginPrompt(providerId: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const alwaysAllow = this.storageService.get(`${extensionId}-${providerId}`, StorageScope.GLOBAL);
		if (alwaysAllow) {
			return true;
		}

		const { choice } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, providerName),
			[nls.localize('cancel', "Cancel"), nls.localize('continue', "Continue"), nls.localize('neverAgain', "Don't Show Again")],
			{ cancelId: 0 }
		);

		switch (choice) {
			case 1/** Allow */:
				return true;
			case 2 /** Always Allow */:
				this.storageService.store(`${extensionId}-${providerId}`, 'true', StorageScope.GLOBAL);
				return true;
			default:
				return false;
		}
	}
}
