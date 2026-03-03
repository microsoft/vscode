/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';

registerSharedProcessRemoteService(IPlaywrightService, 'playwright', {
	channelClientCtor: class {
		constructor(channel: IChannel) {
			/**
			 * send the current window's ID once via `__initialize`, so the server-side {@link PlaywrightChannel}
			 * can create a per-window {@link PlaywrightWindowInstance}. All subsequent calls and events are proxied directly.
			 */
			channel.call('__initialize', mainWindow.vscodeWindowId);
			return ProxyChannel.toService<IPlaywrightService>(channel);
		}
	}
});
