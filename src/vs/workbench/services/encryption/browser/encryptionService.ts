/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IEncryptionService } from 'vs/workbench/services/encryption/common/encryptionService';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class EncryptionService implements IEncryptionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService logService: ILogService
	) {
		// This allows the remote side to handle any encryption requests
		if (environmentService.remoteAuthority && !environmentService.options?.credentialsProvider) {
			logService.trace('EncryptionService#constructor - Detected remote environment, registering proxy for encryption instead');
			return ProxyChannel.toService<IEncryptionService>(remoteAgentService.getConnection()!.getChannel('encryption'));
		}
	}

	encrypt(value: string): Promise<string> {
		return Promise.resolve(value);
	}

	decrypt(value: string): Promise<string> {
		return Promise.resolve(value);
	}
}

registerSingleton(IEncryptionService, EncryptionService, true);
