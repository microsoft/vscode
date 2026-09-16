/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IPlaywrightService, IPlaywrightServiceInitializeOptions } from '../../../../platform/browserView/common/playwrightService.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';

class PlaywrightChannelClient {
	constructor(
		channel: IChannel,
		@ILogService logService: ILogService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		// Initialize the per-window shared-process service before forwarding calls.
		const options: IPlaywrightServiceInitializeOptions = {
			windowId: mainWindow.vscodeWindowId,
			useSessionStorageAffinity: environmentService.isSessionsWindow,
		};
		void channel.call('__initialize', options).catch((e) => {
			logService.error(`Failed to initialize Playwright service`, e);
		});
		return ProxyChannel.toService<IPlaywrightService>(channel);
	}
}

registerSharedProcessRemoteService(IPlaywrightService, 'playwright', { channelClientCtor: PlaywrightChannelClient });
