/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomPath } from 'vs/base/common/extpath';
import { join } from 'vs/base/common/path';
import * as testUtils from 'vs/base/test/common/testUtils';

export function getRandomTestPath(tmpdir: string, ...segments: string[]): string {
	return randomPath(join(tmpdir, ...segments));
}

export import flakySuite = testUtils.flakySuite;
