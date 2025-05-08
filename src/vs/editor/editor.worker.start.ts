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
export function start<THost extends object, TClient extends object>(client: TClient): IWorkerContext<THost> {
	const webWorkerServer = initialize(() => new EditorWorker(client));
	const editorWorkerHost = EditorWorkerHost.getChannel(webWorkerServer);
	const host = new Proxy({}, {
		get(target, prop, receiver) {
			if (typeof prop !== 'string') {
				throw new Error(`Not supported`);
			}
			return (...args: any[]) => {
				return editorWorkerHost.$fhr(prop, args);
			};
		}
	});

	return {
		host: host as THost,
		getMirrorModels: () => {
			return webWorkerServer.requestHandler.getModels();
		}
	};
}
