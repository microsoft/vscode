/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const IHashService = createDecorator<IHashService>('hashService');

export interface IHashService {
	_serviceBrand: any;

	/**
	 * Produce a SHA1 hash of the provided content.
	 */
	createSHA1(content: string): Thenable<string>;
}

export class HashService implements IHashService {

	_serviceBrand: any;

	createSHA1(content: string): Thenable<string> {
		return crypto.subtle.digest('SHA-1', new TextEncoder().encode(content)).then(buffer => {
			const byteArray = new Uint8Array(buffer);

			// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#Converting_a_digest_to_a_hex_string
			return [...byteArray].map(value => (`00${value.toString(16)}`).slice(-2)).join('');
		});
	}
}

registerSingleton(IHashService, HashService, true);