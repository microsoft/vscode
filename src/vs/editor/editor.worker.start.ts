/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { initialize } from '../base/common/worker/webWorkerBootstrap.js';
import { EditorWorker, IWorkerContext } from './common/services/editorWebWorker.js';
import { EditorWorkerHost } from './common/services/editorWorkerHost.js';

/**
 * Used by `monaco-editor` to hook up web worker rpc.
 * @skipMangle
 * @internal
 */
export function start<THost extends object, TClient extends object>(createClient: (ctx: IWorkerContext<THost>) => TClient): TClient {
	let client: TClient | undefined;
	const webWorkerServer = initialize((workerServer) => {
		const editorWorkerHost = EditorWorkerHost.getChannel(workerServer);

		const host = new Proxy({}, {
			get(target, prop, receiver) {
				if (prop === 'then') {
					// Don't forward the call when the proxy is returned in an async function and the runtime tries to .then it.
					return undefined;
				}
				if (typeof prop !== 'string') {
					throw new Error(`Not supported`);
				}
				return (...args: unknown[]) => {
					return editorWorkerHost.$fhr(prop, args);
				};
			}
		});

		const ctx: IWorkerContext<THost> = {
			host: host as THost,
			getMirrorModels: () => {
				return webWorkerServer.requestHandler.getModels();
			}
		};

		client = createClient(ctx);

		return new EditorWorker(client);
	});

	return client!;
}
