/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as testUtils from 'vs/base/test/common/testUtils';

export function getRandomTestPath(tmpdir: string, ...segments: string[]): string {
	return join(tmpdir, ...segments, generateUuid());
}

export function getPathFromAmdModule(requirefn: typeof require, relativePath: string): string {
	return URI.parse(requirefn.toUrl(relativePath)).fsPath;
}

export import flakySuite = testUtils.flakySuite;
