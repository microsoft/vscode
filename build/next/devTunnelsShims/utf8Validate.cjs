/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

module.exports = function isValidUTF8(buffer) {
	try {
		utf8Decoder.decode(buffer);
		return true;
	} catch {
		return false;
	}
};
