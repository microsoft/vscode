/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readdir } from 'fs/promises';
import { dirname, join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';

/** Grants application resources and runtime files without granting sibling portable-data directories. */
export async function getApplicationSandboxReadRoots(appRoot: string, appBundleRoot: string, platform: NodeJS.Platform = process.platform): Promise<URI[]> {
	if (platform === 'darwin' || appRoot === appBundleRoot) {
		return [URI.file(appBundleRoot)];
	}

	const runtimeDirectories = [...new Set([appBundleRoot, dirname(dirname(appRoot))])];
	const runtimeFiles = await Promise.all(runtimeDirectories.map(async directory =>
		(await readdir(directory, { withFileTypes: true }))
			.filter(entry => entry.isFile())
			.map(entry => entry.name)
			.sort()
			.map(name => URI.file(join(directory, name))),
	));
	return [
		URI.file(appRoot),
		...runtimeFiles.flat(),
	];
}
