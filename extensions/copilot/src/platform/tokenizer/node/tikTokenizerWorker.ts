/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parentPort } from 'worker_threads';
import { TikTokenImpl } from './tikTokenizerImpl';

function main() {
	const port = parentPort;
	if (!port) {
		throw new Error(`This module should only be used in a worker thread.`);
	}
	port.on('message', async (message: { id: number; fn: string; args: any[] }) => {
		try {
			const res = await (<any>TikTokenImpl.instance)[message.fn](...message.args);
			port.postMessage({ id: message.id, res });
		} catch (err) {
			port.postMessage({ id: message.id, err });
		}
	});
}

main();
