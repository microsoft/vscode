/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEncryptionService } from 'vs/workbench/services/encryption/common/encryptionService';

export class EncryptionService {

	declare readonly _serviceBrand: undefined;

	encrypt(value: string): Promise<string> {
		return Promise.resolve(value);
	}

	decrypt(value: string): Promise<string> {
		return Promise.resolve(value);
	}
}

registerSingleton(IEncryptionService, EncryptionService, true);
