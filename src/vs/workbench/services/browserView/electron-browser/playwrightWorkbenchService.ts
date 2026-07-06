/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';

class PlaywrightChannelClient {
	constructor(
		channel: IChannel,
		@ILogService logService: ILogService
	) {
		/**
		 * send the current window's ID once via `__initialize`, so the server-side {@link PlaywrightChannel}
		 * can create a per-window {@link PlaywrightWindowInstance}. All subsequent calls and events are proxied directly.
		 */
		void channel.call('__initialize', mainWindow.vscodeWindowId).catch((e) => {
			logService.error(`Failed to initialize Playwright service`, e);
		});
		return ProxyChannel.toService<IPlaywrightService>(channel);
	}
}

registerSharedProcessRemoteService(IPlaywrightService, 'playwright', { channelClientCtor: PlaywrightChannelClient });
