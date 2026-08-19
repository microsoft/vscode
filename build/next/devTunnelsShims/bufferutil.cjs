/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

exports.mask = function mask(source, mask, output, offset, length) {
	for (let i = 0; i < length; i++) {
		output[offset + i] = source[i] ^ mask[i & 3];
	}
};

exports.unmask = function unmask(buffer, mask) {
	for (let i = 0; i < buffer.length; i++) {
		buffer[i] ^= mask[i & 3];
	}
};
