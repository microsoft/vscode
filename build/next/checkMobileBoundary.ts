/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'node:path';
import { checkMobileBoundary } from './mobile.ts';

// Fails when a change brings an unreviewed contribution or a forbidden module into the
// mobile web package, so the author sees it before merge instead of in a product build.
const root = path.dirname(path.dirname(import.meta.dirname));
const start = Date.now();
try {
	const contributions = await checkMobileBoundary(root);
	console.log(`[mobile] Dependency boundary passed: ${contributions.length} reviewed contributions (${Date.now() - start} ms)`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
