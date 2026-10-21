/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dirs, isNativeDir } from '../../npm/dirs.ts';

const ROOT = path.join(import.meta.dirname, '../../../');

/**
 * Stored inside the JS-only node_modules cache, so a restore can prove it matches the
 * lockfiles of this checkout instead of failing later with a confusing error.
 */
export const MANIFEST = 'extensions/node_modules/.vscode-js-cache-manifest.json';

export type Manifest = Record<string, string>;

export function computeManifest(readFile: (relativePath: string) => Buffer = file => fs.readFileSync(path.join(ROOT, file)), directories: readonly string[] = dirs): Manifest {
	const manifest: Manifest = {};
	for (const dir of directories.filter(dir => !isNativeDir(dir))) {
		manifest[dir] = crypto.createHash('sha256').update(readFile(path.posix.join(dir, 'package-lock.json'))).digest('hex');
	}
	return manifest;
}

/** The directories whose lockfile differs from the one the cached node_modules was installed from. */
export function staleDirs(cached: Manifest, current: Manifest): string[] {
	return [...new Set([...Object.keys(cached), ...Object.keys(current)])].filter(dir => cached[dir] !== current[dir]).sort();
}

function main(command: string | undefined): void {
	const manifestPath = path.join(ROOT, MANIFEST);
	if (command === 'write') {
		fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
		fs.writeFileSync(manifestPath, JSON.stringify(computeManifest(), null, '\t'));
		return;
	}
	if (command === 'verify') {
		if (!fs.existsSync(manifestPath)) {
			throw new Error(`The restored JS node_modules cache has no ${MANIFEST}`);
		}
		const stale = staleDirs(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), computeManifest());
		if (stale.length) {
			throw new Error(`The restored JS node_modules cache doesn't match the lockfiles of: ${stale.join(', ')}. Bump build/.cachesalt to discard it.`);
		}
		console.log('The restored JS node_modules cache matches every lockfile.');
		return;
	}
	throw new Error('Usage: node nodeModulesCacheManifest.ts write|verify');
}

if (import.meta.main) {
	main(process.argv[2]);
}
