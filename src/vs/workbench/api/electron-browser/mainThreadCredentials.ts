/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadCredentialsShape, ExtHostCredentialsShape } from '../node/extHost.protocol';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';

export class MainThreadCredentials extends MainThreadCredentialsShape {

	private _proxy: ExtHostCredentialsShape;

	constructor( @IThreadService threadService: IThreadService, @ICredentialsService private _credentialsService: ICredentialsService) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostCredentials);
	}

	$readSecret(service: string, account: string): Thenable<string | undefined> {
		return this._credentialsService.readSecret(service, account);
	}

	$writeSecret(service: string, account: string, secret: string): Thenable<void> {
		return this._credentialsService.writeSecret(service, account, secret);
	}
	$deleteSecret(service: string, account: string): Thenable<boolean> {
		return this._credentialsService.deleteSecret(service, account);
	}
}
