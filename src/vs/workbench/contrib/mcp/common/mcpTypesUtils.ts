/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IMcpServer, IMcpServerStartOpts, McpConnectionState, McpServerCacheState } from './mcpTypes.js';

/**
 * Starts a server (if needed) and waits for its tools to be live. Returns
 * true/false whether this happened successfully.
 */
export function startServerAndWaitForLiveTools(server: IMcpServer, opts?: IMcpServerStartOpts, token?: CancellationToken): Promise<boolean> {
	const store = new DisposableStore();
	return new Promise<boolean>(resolve => {
		server.start(opts).catch(() => undefined).then(r => {
			if (token?.isCancellationRequested || !r || r.state === McpConnectionState.Kind.Error || r.state === McpConnectionState.Kind.Stopped) {
				return resolve(false);
			}

			if (token) {
				store.add(token.onCancellationRequested(() => {
					resolve(false);
				}));
			}

			store.add(autorun(reader => {
				const connState = server.connectionState.read(reader).state;
				if (connState === McpConnectionState.Kind.Error || connState === McpConnectionState.Kind.Stopped) {
					resolve(false); // some error, don't block the request
				}

				const toolState = server.cacheState.read(reader);
				if (toolState === McpServerCacheState.Live) {
					resolve(true); // got tools, all done
				}
			}));
		});
	}).finally(() => store.dispose());
}
