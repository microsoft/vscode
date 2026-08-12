/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../browser/window.js';
import { Event } from '../../../common/event.js';
import { generateUuid } from '../../../common/uuid.js';
import { ipcMessagePort, ipcRenderer } from '../../sandbox/electron-browser/globals.js';

interface IMessageChannelResult {
	response: string | { nonce: string; error?: string; fatal?: boolean };
	port: MessagePort | undefined;
	source: unknown;
}

/** Error returned when the main process cannot provide a requested MessagePort. */
export class MessagePortAcquisitionError extends Error {
	constructor(message: string, readonly fatal: boolean) {
		super(message);
	}
}

export async function acquirePort(requestChannel: string | undefined, responseChannel: string, nonce = generateUuid()): Promise<MessagePort> {

	// Get ready to acquire the message port from the
	// provided `responseChannel` via preload helper.
	ipcMessagePort.acquire(responseChannel, nonce);

	// If a `requestChannel` is provided, we are in charge
	// to trigger acquisition of the message port from main
	if (typeof requestChannel === 'string') {
		ipcRenderer.send(requestChannel, nonce);
	}

	// Wait until the main side has returned the `MessagePort`
	// We need to filter by the `nonce` to ensure we listen
	// to the right response.
	const onMessageChannelResult = Event.fromDOMEventEmitter<IMessageChannelResult>(mainWindow, 'message', (e: MessageEvent) => ({ response: e.data, port: e.ports[0], source: e.source }));
	const result = await Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => {
		const responseNonce = typeof e.response === 'string' ? e.response : e.response.nonce;
		return responseNonce === nonce && e.source === mainWindow;
	})));
	if (typeof result.response !== 'string' && result.response.error) {
		throw new MessagePortAcquisitionError(result.response.error, result.response.fatal === true);
	}
	if (!result.port) {
		throw new Error(`MessagePort response '${responseChannel}' did not include a port.`);
	}

	return result.port;
}
