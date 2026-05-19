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
const usePackagedExtension = isSanity && !!process.env.COPILOT_TEST_EXTENSION_PATH;
const extensionDevelopmentPath = usePackagedExtension
	? resolve(process.env.COPILOT_TEST_EXTENSION_PATH)
	: __dirname;
const sourcePackageJson = patchPackageJson(packageJsonPath, pkg => {
	pkg.engines.vscode = pkg.engines.vscode.split('-')[0];
});
const patchedPackageJsons = [sourcePackageJson.revert];
const pkg = sourcePackageJson.pkg;

if (usePackagedExtension) {
	patchedPackageJsons.push(patchPackageJson(resolve(extensionDevelopmentPath, 'package.json'), pkg => {
		pkg.activationEvents = pkg.activationEvents?.filter(event => event !== 'onStartupFinished');
	}).revert);
}

// and revert once done
process.on('exit', () => patchedPackageJsons.forEach(revert => revert()));

const isRecoveryBuild = !pkg.version.endsWith('.0');

const config = {
	files: __dirname + (isSanity ? '/dist/sanity-test-extension.js' : '/dist/test-extension.js'),
	extensionDevelopmentPath,
	env: {
		COPILOT_API_URL: process.env.COPILOT_API_URL ?? 'https://api.githubcopilot.com',
		IS_SCENARIO_AUTOMATION: usePackagedExtension ? '1' : process.env.IS_SCENARIO_AUTOMATION,
	},
	launchArgs: [
		'--disable-extensions',
		'--profile-temp'
	],
	mocha: {
		ui: 'tdd',
		color: true,
		forbidOnly: !!process.env.CI,
		timeout: 5000,
		retries: isSanity ? 1 : 0
	}
};

if (process.env.VSCODE_UNDER_TEST) {
	config.useInstallation = { fromPath: process.env.VSCODE_UNDER_TEST };
} else {
	config.version = isRecoveryBuild ? 'stable' : 'insiders-unreleased';
}

export default defineConfig(config);

function patchPackageJson(path, mutate) {
	const raw = readFileSync(path, 'utf8');
	const pkg = JSON.parse(raw);
	mutate(pkg);
	writeFileSync(path, JSON.stringify(pkg, null, '\t'));
	return { pkg, revert: () => writeFileSync(path, raw) };
}
