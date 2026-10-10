/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

export function computeNLSMetadataHash(nlsMetadataPath: string, commit: string | undefined): string {
	return createHash('sha256')
		.update(commit ?? '')
		.update('\0')
		.update(readFileSync(join(nlsMetadataPath, 'nls.keys.json')))
		.update('\0')
		.update(readFileSync(join(nlsMetadataPath, 'nls.messages.json')))
		.digest('hex');
}
