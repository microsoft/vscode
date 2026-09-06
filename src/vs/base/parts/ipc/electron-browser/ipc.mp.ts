/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../browser/window.js';
import { Event } from '../../../common/event.js';
import { generateUuid } from '../../../common/uuid.js';
import { ipcMessagePort, ipcRenderer } from '../../sandbox/electron-browser/globals.js';

interface IMessageChannelErrorResponse {
	nonce: string;
	error?: string;
	fatal?: boolean;
}

interface IMessageChannelResult {
	response: unknown;
	port: MessagePort | undefined;
	source: unknown;
}

/** Error returned when the main process cannot provide a requested MessagePort. */
export class MessagePortAcquisitionError extends Error {
	constructor(message: string, readonly fatal: boolean) {
		super(message);
	}
}

function isMessageChannelErrorResponse(response: unknown): response is IMessageChannelErrorResponse {
	return typeof response === 'object'
		&& response !== null
		&& 'nonce' in response
		&& typeof response.nonce === 'string';
}

export async function acquirePort(
	requestChannel: string | undefined,
	responseChannel: string,
	nonce = generateUuid(),
	acquire = (channel: string, requestNonce: string) => ipcMessagePort.acquire(channel, requestNonce),
): Promise<MessagePort> {

	// Get ready to acquire the message port from the
	// provided `responseChannel` via preload helper.
	acquire(responseChannel, nonce);

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
		const responseNonce = typeof e.response === 'string'
			? e.response
			: isMessageChannelErrorResponse(e.response) ? e.response.nonce : undefined;
		return responseNonce === nonce && e.source === mainWindow;
	})));
	if (isMessageChannelErrorResponse(result.response) && result.response.error) {
		throw new MessagePortAcquisitionError(result.response.error, result.response.fatal === true);
	}
	if (!result.port) {
		throw new Error(`MessagePort response '${responseChannel}' did not include a port.`);
	}

	return result.port;
}
