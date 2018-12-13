/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'vs/base/node/pfs';

export function createWaitMarkerFile(verbose?: boolean): Promise<string> {
	const randomWaitMarkerPath = join(tmpdir(), Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10));

	return writeFile(randomWaitMarkerPath, '').then(() => {
		if (verbose) {
			console.log(`Marker file for --wait created: ${randomWaitMarkerPath}`);
		}

		return randomWaitMarkerPath;
	}, error => {
		if (verbose) {
			console.error(`Failed to create marker file for --wait: ${error}`);
		}

		return Promise.resolve();
	});
}