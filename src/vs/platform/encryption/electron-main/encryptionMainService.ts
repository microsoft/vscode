/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeStorage as safeStorageElectron, app } from 'electron';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { KnownStorageProvider, IEncryptionMainService } from 'vs/platform/encryption/common/encryptionService';
import { ILogService } from 'vs/platform/log/common/log';

// These APIs are currently only supported in our custom build of electron so
// we need to guard against them not being available.
interface ISafeStorageAdditionalAPIs {
	setUsePlainTextEncryption(usePlainText: boolean): void;
	getSelectedStorageBackend(): string;
}

const safeStorage: typeof import('electron').safeStorage & Partial<ISafeStorageAdditionalAPIs> = safeStorageElectron;

export class EncryptionMainService implements IEncryptionMainService {
	_serviceBrand: undefined;

	constructor(
		private readonly machineId: string,
		@ILogService private readonly logService: ILogService
	) {
		// if this commandLine switch is set, the user has opted in to using basic text encryption
		if (app.commandLine.getSwitchValue('password-store') === 'basic_text') {
			safeStorage.setUsePlainTextEncryption?.(true);
		}
	}

	async encrypt(value: string): Promise<string> {
		this.logService.trace('[EncryptionMainService] Encrypting value.');
		try {
			const result = JSON.stringify(safeStorage.encryptString(value));
			this.logService.trace('[EncryptionMainService] Encrypted value.');
			return result;
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
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
		try {
			const result = safeStorage.decryptString(bufferToDecrypt);
			this.logService.trace('[EncryptionMainService] Decrypted value.');
			return result;
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	isEncryptionAvailable(): Promise<boolean> {
		return Promise.resolve(safeStorage.isEncryptionAvailable());
	}

	getKeyStorageProvider(): Promise<KnownStorageProvider> {
		if (isWindows) {
			return Promise.resolve(KnownStorageProvider.dplib);
		}
		if (isMacintosh) {
			return Promise.resolve(KnownStorageProvider.keychainAccess);
		}
		if (safeStorage.getSelectedStorageBackend) {
			try {
				const result = safeStorage.getSelectedStorageBackend() as KnownStorageProvider;
				return Promise.resolve(result);
			} catch (e) {
				this.logService.error(e);
			}
		}
		return Promise.resolve(KnownStorageProvider.unknown);
	}

	async setUsePlainTextEncryption(): Promise<void> {
		if (isWindows) {
			throw new Error('Setting plain text encryption is not supported on Windows.');
		}

		if (isMacintosh) {
			throw new Error('Setting plain text encryption is not supported on macOS.');
		}

		if (!safeStorage.setUsePlainTextEncryption) {
			throw new Error('Setting plain text encryption is not supported.');
		}

		safeStorage.setUsePlainTextEncryption(true);
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
