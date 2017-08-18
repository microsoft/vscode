/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MainContext, MainThreadCredentialsShape, ExtHostCredentialsShape, IMainContext } from 'vs/workbench/api/node/extHost.protocol';


export class ExtHostCredentials implements ExtHostCredentialsShape {

	private _proxy: MainThreadCredentialsShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.get(MainContext.MainThreadCredentials);
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
