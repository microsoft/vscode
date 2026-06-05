/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import cp from 'child_process';
const root = fs.realpathSync(path.dirname(path.dirname(import.meta.dirname)));

function getPnpmProductionDependencies(folder: string): string[] {
	let raw: string;

	try {
		// pnpm prints one absolute path per dependency (the root project path is
		// included and filtered out below). `--prod` excludes devDependencies,
		// `--depth Infinity` walks the whole production tree and `--parseable`
		// yields plain paths. Standalone (non-workspace) projects such as
		// `remote` must not attach to the root workspace.
		raw = cp.execSync('pnpm list --prod --depth Infinity --parseable --ignore-workspace', { cwd: folder, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, null] });
	} catch (err) {
		if (!err.stdout) {
			throw err;
		}
		raw = err.stdout;
	}

	return raw.split(/\r?\n/).filter(line => {
		return !!line.trim() && path.relative(root, line) !== path.relative(root, folder);
	});
}

export function getProductionDependencies(folderPath: string): string[] {
	const result = getPnpmProductionDependencies(folderPath);
	// Account for distro npm dependencies
	const realFolderPath = fs.realpathSync(folderPath);
	const relativeFolderPath = path.relative(root, realFolderPath);
	const distroFolderPath = `${root}/.build/distro/npm/${relativeFolderPath}`;

	if (fs.existsSync(distroFolderPath)) {
		result.push(...getPnpmProductionDependencies(distroFolderPath));
	}

	return [...new Set(result)];
}

if (import.meta.main) {
	console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
