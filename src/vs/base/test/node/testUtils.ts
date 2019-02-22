/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { generateUuid } from 'vs/base/common/uuid';

export function getRandomTestPath(tmpdir: string, ...segments: string[]): string {
	return join(tmpdir, ...segments, generateUuid());
}
