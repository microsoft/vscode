/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from '@vscode/test-cli';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { loadEnvFile } from 'process';
import { fileURLToPath } from 'url';

const isSanity = process.argv.includes('--sanity');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (isSanity) {
	loadEnvFile(resolve(__dirname, '.env'));
}

const packageJsonPath = resolve(__dirname, 'package.json');
const raw = readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(raw);
pkg.engines.vscode = pkg.engines.vscode.split('-')[0];

// remove the date from the vscode engine version
writeFileSync(packageJsonPath, JSON.stringify(pkg, null, '\t'));

// and revert it once done
process.on('exit', () => writeFileSync(packageJsonPath, raw));

const isRecoveryBuild = !pkg.version.endsWith('.0');

const config = {
	files: __dirname + (isSanity ? '/dist/sanity-test-extension.js' : '/dist/test-extension.js'),
	launchArgs: [
		'--disable-extensions',
		'--profile-temp'
	],
	mocha: {
		ui: 'tdd',
		color: true,
		forbidOnly: !!process.env.CI,
		timeout: 5000
	}
};

if (process.env.VSCODE_UNDER_TEST) {
	config.useInstallation = { fromPath: process.env.VSCODE_UNDER_TEST };
} else {
	config.version = isRecoveryBuild ? 'stable' : 'insiders-unreleased';
}

export default defineConfig(config);
