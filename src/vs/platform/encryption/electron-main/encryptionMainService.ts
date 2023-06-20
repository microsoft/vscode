/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeStorage } from 'electron';
import { IEncryptionMainService } from 'vs/platform/encryption/common/encryptionService';
import { ILogService } from 'vs/platform/log/common/log';

export class EncryptionMainService implements IEncryptionMainService {
	_serviceBrand: undefined;

	constructor(
		private readonly machineId: string,
		@ILogService private readonly logService: ILogService
	) { }

	async encrypt(value: string): Promise<string> {
		return JSON.stringify(safeStorage.encryptString(value));
	}

	async decrypt(value: string): Promise<string> {
		let parsedValue: { data: string };
		try {
			parsedValue = JSON.parse(value);
			if (!parsedValue.data) {
				this.logService.trace('[EncryptionMainService] Unable to parse encrypted value. Attempting old decryption.');
				return this.oldDecrypt(value);
			}
		} catch (e) {
			this.logService.trace('[EncryptionMainService] Unable to parse encrypted value. Attempting old decryption.', e);
			return this.oldDecrypt(value);
		}
		const bufferToDecrypt = Buffer.from(parsedValue.data);

		this.logService.trace('[EncryptionMainService] Decrypting value.');
		return safeStorage.decryptString(bufferToDecrypt);
	}

	isEncryptionAvailable(): Promise<boolean> {
		return Promise.resolve(safeStorage.isEncryptionAvailable());
	}

	// TODO: Remove this after a few releases
	private async oldDecrypt(value: string): Promise<string> {
		let encryption: { decrypt(salt: string, value: string): Promise<string> };
		try {
			encryption = await new Promise((resolve, reject) => require(['vscode-encrypt'], resolve, reject));
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
}
