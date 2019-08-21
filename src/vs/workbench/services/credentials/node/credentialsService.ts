/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsService } from 'vs/workbench/services/credentials/common/credentials';
import { IdleValue } from 'vs/base/common/async';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

type KeytarModule = {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
};

export class KeytarCredentialsService implements ICredentialsService {

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly _keytar = new IdleValue<Promise<KeytarModule>>(() => import('keytar'));

	async getPassword(service: string, account: string): Promise<string | null> {
		const keytar = await this._keytar.getValue();
		return keytar.getPassword(service, account);
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		const keytar = await this._keytar.getValue();
		return keytar.setPassword(service, account, password);
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		const keytar = await this._keytar.getValue();
		return keytar.deletePassword(service, account);
	}

	async findPassword(service: string): Promise<string | null> {
		const keytar = await this._keytar.getValue();
		return keytar.findPassword(service);
	}
}

registerSingleton(ICredentialsService, KeytarCredentialsService, true);
