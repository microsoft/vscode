/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommonEncryptionService } from 'vs/platform/encryption/common/encryptionService';
import { ILogService } from 'vs/platform/log/common/log';

export interface Encryption {
	encrypt(salt: string, value: string): Promise<string>;
	decrypt(salt: string, value: string): Promise<string>;
}
export class EncryptionMainService implements ICommonEncryptionService {
	declare readonly _serviceBrand: undefined;
	constructor(
		private machineId: string,
		@ILogService private readonly logService: ILogService
	) { }

	private encryption(): Promise<Encryption> {
		return new Promise((resolve, reject) => require(['vscode-encrypt'], resolve, reject));
	}

	async encrypt(value: string): Promise<string> {
		let encryption: Encryption;
		try {
			encryption = await this.encryption();
		} catch (e) {
			return value;
		}

		try {
			return encryption.encrypt(this.machineId, value);
		} catch (e) {
			this.logService.error(e);
			return value;
		}
	}

	async decrypt(value: string): Promise<string> {
		let encryption: Encryption;
		try {
			encryption = await this.encryption();
		} catch (e) {
			return value;
		}

		try {
			return encryption.decrypt(this.machineId, value);
		} catch (e) {
			this.logService.error(e);
			return value;
		}
	}

	async isEncryptionAvailable(): Promise<boolean> {
		try {
			await this.encryption();
			return true;
		} catch (e) {
			return false;
		}
	}
}
