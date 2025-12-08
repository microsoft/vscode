/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, encodeBase64 } from 'vs/base/common/buffer';

export const makeRawSocketHeaders = (path: string, query: string, deubgLabel: string) => {
	// https://tools.ietf.org/html/rfc6455#section-4
	const buffer = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		buffer[i] = Math.round(Math.random() * 256);
	}
	const nonce = encodeBase64(VSBuffer.wrap(buffer));

	const headers = [
		`GET ws://localhost${path}?${query}&skipWebSocketFrames=true HTTP/1.1`,
		`Connection: Upgrade`,
		`Upgrade: websocket`,
		`Sec-WebSocket-Key: ${nonce}`
	];

	return headers.join('\r\n') + '\r\n\r\n';
};

export const socketRawEndHeaderSequence = VSBuffer.fromString('\r\n\r\n');
