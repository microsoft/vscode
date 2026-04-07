/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

export async function createSha256FromStream(stream: Readable): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of stream) {
		hash.update(chunk);
	}
	return hash.digest('hex');
}
