/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

try {
	await access(new URL('../patches/@microsoft+dev-tunnels-ssh+3.12.42.patch', import.meta.url), constants.R_OK);
} catch (error) {
	throw new Error('The required SDK compatibility patch is unavailable. Copy the complete project, including patches/ and scripts/, then run npm ci again.', { cause: error });
}
