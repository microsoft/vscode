/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path.js';
import { IFileService } from '../../files/common/files.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IEncryptionMainService } from '../../encryption/common/encryptionService.js';
import { STORAGE_FILENAME } from '../common/authConstants.js';
import { ILogService } from '../../log/common/log.js';

export interface IStoredSessionData {
	readonly refreshToken: string;
	readonly userId?: string;
	readonly email?: string;
	readonly displayName?: string;
}

export class AuthStorageService {
	private readonly storageUri: URI;

	constructor(
		userDataPath: string,
		private readonly fileService: IFileService,
		private readonly encryptionService: IEncryptionMainService,
		private readonly logService: ILogService
	) {
		this.storageUri = URI.file(join(userDataPath, STORAGE_FILENAME));
	}

	public async isAvailable(): Promise<boolean> {
		return this.encryptionService.isEncryptionAvailable();
	}

	public async save(data: IStoredSessionData): Promise<void> {
		try {
			const jsonString = JSON.stringify(data);
			const encrypted = await this.encryptionService.encrypt(jsonString);
			const wrapper = { encrypted };
			await this.fileService.writeFile(this.storageUri, VSBuffer.fromString(JSON.stringify(wrapper)));
			this.logService.trace('AuthStorageService#save: Saved session data');
		} catch (e) {
			this.logService.error('AuthStorageService#save: Failed to save session data', e);
		}
	}

	public async load(): Promise<IStoredSessionData | undefined> {
		try {
			const exists = await this.fileService.exists(this.storageUri);
			if (!exists) {
				return undefined;
			}

			const fileContent = await this.fileService.readFile(this.storageUri);
			const wrapper = JSON.parse(fileContent.value.toString());

			if (!wrapper || !wrapper.encrypted) {
				return undefined;
			}

			const decrypted = await this.encryptionService.decrypt(wrapper.encrypted);
			return JSON.parse(decrypted) as IStoredSessionData;
		} catch (e) {
			this.logService.error('AuthStorageService#load: Failed to load or decrypt session data', e);
			return undefined;
		}
	}

	public async clear(): Promise<void> {
		try {
			const exists = await this.fileService.exists(this.storageUri);
			if (exists) {
				await this.fileService.del(this.storageUri);
				this.logService.trace('AuthStorageService#clear: Cleared session data');
			}
		} catch (e) {
			this.logService.error('AuthStorageService#clear: Failed to clear session data', e);
		}
	}
}
