/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';

export class CredentialsService implements ICredentialsService {

	_serviceBrand: any;

	readSecret(service: string, account: string): TPromise<string | undefined> {
		return this.getKeytar()
			.then(keytar => TPromise.wrap(keytar.getPassword(service, account)))
			.then(result => result === null ? undefined : result);
	}

	writeSecret(service: string, account: string, secret: string): TPromise<void> {
		return this.getKeytar()
			.then(keytar => TPromise.wrap(keytar.setPassword(service, account, secret)));
	}

	deleteSecret(service: string, account: string): TPromise<boolean> {
		return this.getKeytar()
			.then(keytar => TPromise.wrap(keytar.deletePassword(service, account)));
	}

	private getKeytar() {
		// Avoids https://github.com/Microsoft/vscode/issues/33998
		return TPromise.wrap(import('keytar'));
	}
}
