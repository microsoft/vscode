/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonEncryptionService } from 'vs/platform/encryption/common/encryptionService';

export const IEncryptionMainService = createDecorator<IEncryptionMainService>('encryptionMainService');

export interface IEncryptionMainService extends ICommonEncryptionService { }

export interface Encryption {
	encrypt(salt: string, value: string): Promise<string>;
	decrypt(salt: string, value: string): Promise<string>;
}
export class EncryptionMainService implements ICommonEncryptionService {
	declare readonly _serviceBrand: undefined;
	constructor(
		private machineId: string) {

	}

	private encryption(): Promise<Encryption> {
		return new Promise((resolve, reject) => require(['vscode-encrypt'], resolve, reject));
	}

	async encrypt(value: string): Promise<string> {
		try {
			const encryption = await this.encryption();
			return encryption.encrypt(this.machineId, value);
		} catch (e) {
			return value;
		}
	}

	async decrypt(value: string): Promise<string> {
		try {
			const encryption = await this.encryption();
			return encryption.decrypt(this.machineId, value);
		} catch (e) {
			return value;
		}
	}
}
