/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEncryptionService, KnownStorageProvider } from '../../../../platform/encryption/common/encryptionService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class EncryptionService implements IEncryptionService {

	declare readonly _serviceBrand: undefined;

	encrypt(value: string): Promise<string> {
		return Promise.resolve(value);
	}

	decrypt(value: string): Promise<string> {
		return Promise.resolve(value);
	}

	isEncryptionAvailable(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getKeyStorageProvider(): Promise<KnownStorageProvider> {
		return Promise.resolve(KnownStorageProvider.basicText);
	}

	setUsePlainTextEncryption(): Promise<void> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IEncryptionService, EncryptionService, InstantiationType.Delayed);
