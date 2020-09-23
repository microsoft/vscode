/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonEncryptionService } from 'vs/platform/encryption/electron-main/common/encryptionService';

export const IEncryptionMainService = createDecorator<IEncryptionMainService>('encryptionMainService');

export interface IEncryptionMainService extends ICommonEncryptionService { }

export class EncryptionMainService implements ICommonEncryptionService {
	declare readonly _serviceBrand: undefined;
	constructor(
		private machineId: string) {

	}

	async encrypt(value: string): Promise<string> {
		try {
			const encryption = await require('vscode-encrypt');
			return encryption.encrypt(this.machineId, value);
		} catch (e) {
			console.log(e);
			return value;
		}
	}

	async decrypt(value: string): Promise<string> {
		try {
			const encryption = await require('vscode-encrypt');
			return encryption.decrypt(this.machineId, value);
		} catch (e) {
			console.log(e);
			return value;
		}
	}
}
