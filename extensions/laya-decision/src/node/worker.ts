/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Entry point of the model worker process. It owns the ONNX session so that the model's memory
 * and CPU-bound inference never run on the extension host.
 */

import { Laya } from '@receptron/laya';
import type { HostToWorkerMessage, WorkerToHostMessage } from '../common/protocol';

let laya: Laya | undefined;

function send(message: WorkerToHostMessage): void {
	process.send?.(message);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function handle(message: HostToWorkerMessage): Promise<void> {
	switch (message.type) {
		case 'load': {
			const start = performance.now();
			try {
				await laya?.close();
				laya = undefined;
				laya = await Laya.load({
					modelDir: message.options.modelDir,
					executionProviders: ['cpu'],
					sessionOptions: { intraOpNumThreads: message.options.intraOpNumThreads, interOpNumThreads: 1 },
				});
				send({ type: 'loaded', id: message.id, loadTimeMs: performance.now() - start });
			} catch (error) {
				send({ type: 'error', id: message.id, message: toErrorMessage(error) });
			}
			break;
		}
		case 'decide': {
			if (!laya) {
				send({ type: 'error', id: message.id, message: 'Model is not loaded.' });
				return;
			}
			const start = performance.now();
			try {
				// IPC delivers a fresh copy, so the readonly shapes of the public API can be passed on as-is.
				const questions = message.questions as Parameters<Laya['systemOne']>[1];
				const result = await laya.systemOne(message.state, questions);
				send({ type: 'result', id: message.id, result, inferenceTimeMs: performance.now() - start });
			} catch (error) {
				send({ type: 'error', id: message.id, message: toErrorMessage(error) });
			}
			break;
		}
	}
}

// Requests are processed one at a time: the ONNX session is already multi-threaded, and
// serializing keeps peak memory bounded.
let queue = Promise.resolve();
process.on('message', (message: HostToWorkerMessage) => {
	queue = queue.then(() => handle(message));
});

// Exit when the extension host goes away.
process.on('disconnect', () => {
	process.exit(0);
});
