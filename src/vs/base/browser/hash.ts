/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { StringSHA1, toHexString } from 'vs/base/common/hash';

export async function sha1Hex(str: string): Promise<string> {

	// Prefer to use browser's crypto module
	if (globalThis?.crypto?.subtle) {

		// Careful to use `dontUseNodeBuffer` when passing the
		// buffer to the browser `crypto` API. Users reported
		// native crashes in certain cases that we could trace
		// back to passing node.js `Buffer` around
		// (https://github.com/microsoft/vscode/issues/114227)
		const buffer = VSBuffer.fromString(str, { dontUseNodeBuffer: true }).buffer;
		const hash = await globalThis.crypto.subtle.digest({ name: 'sha-1' }, buffer);

		return toHexString(hash);
	}

	// Otherwise fallback to `StringSHA1`
	else {
		const computer = new StringSHA1();
		computer.update(str);

		return computer.digest();
	}
}
