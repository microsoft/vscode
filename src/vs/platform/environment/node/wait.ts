/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { randomPath } from '../../../base/common/extpath.js';

export function createWaitMarkerFileSync(verbose?: boolean): string | undefined {
	const randomWaitMarkerPath = randomPath(tmpdir());

	try {
		// eslint-disable-next-line local/code-no-sync-fs -- The CLI wait marker must exist before its path is returned.
		writeFileSync(randomWaitMarkerPath, ''); // use built-in fs to avoid dragging in more dependencies
		if (verbose) {
			console.log(`Marker file for --wait created: ${randomWaitMarkerPath}`);
		}
		return randomWaitMarkerPath;
	} catch (err) {
		if (verbose) {
			console.error(`Failed to create marker file for --wait: ${err}`);
		}
		return undefined;
	}
}
