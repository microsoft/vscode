/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';

/**
 * Writes a minimal `pnpm-lock.yaml` whose root project depends (optionally) on the given packages.
 */
export function writePnpmLockfile(file: string, packages: Record<string, { readonly version: string; readonly integrity?: string }>): void {
	const entries = Object.entries(packages);
	const lines = ['lockfileVersion: \'9.0\'', 'importers:', '  .:', '    optionalDependencies:'];
	for (const [name, { version }] of entries) {
		lines.push(`      '${name}':`, `        specifier: ${version}`, `        version: ${version}`);
	}
	lines.push('packages:');
	for (const [name, { version, integrity }] of entries) {
		lines.push(`  '${name}@${version}':`, `    resolution: {${integrity ? `integrity: ${integrity}` : ''}}`);
	}
	lines.push('snapshots:');
	for (const [name, { version }] of entries) {
		lines.push(`  '${name}@${version}': {}`);
	}
	fs.writeFileSync(file, lines.join('\n') + '\n');
}
