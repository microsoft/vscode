/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionHostStarter, IPartialLogService } from 'vs/platform/extensions/node/extensionHostStarter';

export interface IExtensionHostStarterWorkerHost {
	logInfo(message: string): Promise<void>;
}

/**
 * The `create` function needs to be there by convention because
 * we are loaded via the `vs/base/common/worker/simpleWorker` utility.
 */
export function create(host: IExtensionHostStarterWorkerHost) {
	const partialLogService: IPartialLogService = {
		_serviceBrand: undefined,
		info: (message: string): void => {
			host.logInfo(message);
		}
	};
	return new ExtensionHostStarter(partialLogService);
}
