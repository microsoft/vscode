/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';

export function computeShortSha(content: string): string {
	const hash = crypto.createHash('sha256');
	hash.update(content, 'utf8');
	const result = hash.digest('base64');
	// 24 base64 chars => 144 bits
	// Accepted collision probability: 2^(-50)
	// Then we should not get more than  ((2^(  144  +1)/2) * (  2^(-50)  )^2) = 10^13
	return result.substring(0, 24);
}
