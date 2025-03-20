/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleWorkerServer } from '../base/common/worker/simpleWorker.js';
import { EditorSimpleWorker, IWorkerContext } from './common/services/editorSimpleWorker.js';
import { EditorWorkerHost } from './common/services/editorWorkerHost.js';

/**
 * Used by `monaco-editor` to hook up web worker rpc.
 * @skipMangle
 * @internal
 */
export function start<THost extends object, TClient extends object>(client: TClient): IWorkerContext<THost> {
	const simpleWorker = new SimpleWorkerServer((msg) => {
		globalThis.postMessage(msg);
	}, () => new EditorSimpleWorker(client));
	globalThis.onmessage = (e: MessageEvent) => {
		simpleWorker.onmessage(e.data);
	};

	const editorWorkerHost = EditorWorkerHost.getChannel(simpleWorker);
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
			return simpleWorker.requestHandler.getModels();
		}
	};
}
