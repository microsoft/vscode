/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomPath } from '../../common/extpath.js';
import { join } from '../../common/path.js';
import * as testUtils from '../common/testUtils.js';

export function getRandomTestPath(tmpdir: string, ...segments: string[]): string {
	return randomPath(join(tmpdir, ...segments));
}

export import flakySuite = testUtils.flakySuite;
