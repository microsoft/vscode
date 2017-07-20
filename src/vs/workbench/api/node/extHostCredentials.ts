/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MainContext, MainThreadCredentialsShape, ExtHostCredentialsShape } from 'vs/workbench/api/node/extHost.protocol';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';


export class ExtHostCredentials extends ExtHostCredentialsShape {

	private _proxy: MainThreadCredentialsShape;

	constructor(threadService: IThreadService) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadCredentials);
	};

	readSecret(service: string, account: string): Thenable<string | undefined> {
		return this._proxy.$readSecret(service, account);
	}

	writeSecret(service: string, account: string, secret: string): Thenable<void> {
		return this._proxy.$writeSecret(service, account, secret);
	}

	deleteSecret(service: string, account: string): Thenable<boolean> {
		return this._proxy.$deleteSecret(service, account);
	}
}
