/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as cp from 'child_process';
import * as toml from '@iarna/toml';

function log(...args: any[]): void {
	console.log(`[${new Date().toLocaleTimeString('en', { hour12: false })}]`, '[distro]', ...args);
}

log(`Applying CLI patches...`);

const basePath = `.build/distro/cli-patches`;
const patchTomlSuffix = '.patch.toml';

function deepMerge(target: any, source: any): any {
	for (const [key, value] of Object.entries(source)) {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			if (!target.hasOwnProperty(key)) {
				target[key] = value;
			} else {
				deepMerge(target[key], value);
			}
		} else {
			target[key] = value;
		}
	}
	return target;
}

for (const patch of fs.readdirSync(basePath)) {
	if (patch.endsWith(patchTomlSuffix)) {
		// this does not support nested filepaths, but that's fine for now...
		const originalPath = `cli/${patch.slice(0, -patchTomlSuffix.length)}.toml`;
		const contents = toml.parse(fs.readFileSync(originalPath, 'utf8'));
		deepMerge(contents, toml.parse(fs.readFileSync(`${basePath}/${patch}`, 'utf8')));
		fs.writeFileSync(originalPath, toml.stringify(contents));
	} else {
		cp.execSync(`git apply --ignore-whitespace --ignore-space-change ${basePath}/${patch}`, { stdio: 'inherit' });
	}
	log('Applied CLI patch:', patch, '✔︎');
}
