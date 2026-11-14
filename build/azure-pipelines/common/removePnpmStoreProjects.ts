/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Removes the links to projects (`<store>/<version>/projects`) from the pnpm store that
// restore-pnpm-store.yml restored (see there). `rmSync` removes links without following them.

const storeDir = process.env['PNPM_CONFIG_STORE_DIR'];

if (storeDir && fs.existsSync(storeDir)) {
	for (const entry of fs.readdirSync(storeDir, { withFileTypes: true })) {
		const projectsDir = path.join(storeDir, entry.name, 'projects');
		if (!entry.isDirectory() || !fs.existsSync(projectsDir)) {
			continue;
		}

		const links = fs.readdirSync(projectsDir);
		fs.rmSync(projectsDir, { recursive: true, force: true });
		console.log(`Removed ${links.length} project links from ${projectsDir}${links.length ? `: ${links.join(', ')}` : ''}`);
	}
}
