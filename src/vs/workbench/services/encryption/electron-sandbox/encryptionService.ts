/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEncryptionService } from 'vs/workbench/services/encryption/common/encryptionService';

export class EncryptionService {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return ProxyChannel.toService<IEncryptionService>(mainProcessService.getChannel('encryption'));
	}
}

registerSingleton(IEncryptionService, EncryptionService, true);
