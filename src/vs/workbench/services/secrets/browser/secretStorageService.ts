/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEncryptionService } from 'vs/platform/encryption/common/encryptionService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ISecretStorageProvider, ISecretStorageService, BaseSecretStorageService } from 'vs/platform/secrets/common/secrets';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';

export class BrowserSecretStorageService extends BaseSecretStorageService {

	private readonly _secretStorageProvider: ISecretStorageProvider | undefined;

	constructor(
		@IStorageService storageService: IStorageService,
		@IEncryptionService encryptionService: IEncryptionService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService logService: ILogService
	) {
		super(storageService, encryptionService, logService);

		if (environmentService.options?.secretStorageProvider) {
			this._secretStorageProvider = environmentService.options.secretStorageProvider;
		}
	}

	override get(key: string): Promise<string | undefined> {
		if (this._secretStorageProvider) {
			return this._secretStorageProvider.get(key);
		}

		return super.get(key);
	}

	override set(key: string, value: string): Promise<void> {
		if (this._secretStorageProvider) {
			return this._secretStorageProvider.set(key, value);
		}

		return super.set(key, value);
	}

	override delete(key: string): Promise<void> {
		if (this._secretStorageProvider) {
			return this._secretStorageProvider.delete(key);
		}

		return super.delete(key);
	}

	override get type() {
		if (this._secretStorageProvider) {
			return this._secretStorageProvider.type;
		}

		return super.type;
	}
}

registerSingleton(ISecretStorageService, BrowserSecretStorageService, InstantiationType.Delayed);
