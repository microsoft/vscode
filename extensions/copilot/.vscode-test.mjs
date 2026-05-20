/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from '@vscode/test-cli';
import extractZip from 'extract-zip';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { loadEnvFile } from 'process';
import { fileURLToPath } from 'url';

const isSanity = process.argv.includes('--sanity');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (isSanity) {
	loadEnvFile(resolve(__dirname, '.env'));
}

const packageJsonPath = resolve(__dirname, 'package.json');
const useInstalledVsix = isSanity && !!process.env.COPILOT_TEST_VSIX_PATH;
const usePackagedExtension = isSanity && !!process.env.COPILOT_TEST_EXTENSION_PATH && !useInstalledVsix;
const sanityDriverExtensionPath = resolve(__dirname, '.build', 'sanity-test-driver');
const extractedVsixRoot = resolve(__dirname, '.build', 'sanity-installed-vsix');
const extractedVsixExtensionPath = resolve(extractedVsixRoot, 'extension');
if (useInstalledVsix) {
	ensureSanityTestDriverExtension(sanityDriverExtensionPath);
	await extractVsixExtension(resolve(process.env.COPILOT_TEST_VSIX_PATH), extractedVsixRoot);
}
const extensionDevelopmentPath = useInstalledVsix
	? [sanityDriverExtensionPath, extractedVsixExtensionPath]
	: usePackagedExtension
	? resolve(process.env.COPILOT_TEST_EXTENSION_PATH)
	: __dirname;
const sourcePackageJson = patchPackageJson(packageJsonPath, pkg => {
	pkg.engines.vscode = pkg.engines.vscode.split('-')[0];
});
const patchedPackageJsons = [sourcePackageJson.revert];
const pkg = sourcePackageJson.pkg;

// and revert once done
process.on('exit', () => patchedPackageJsons.forEach(revert => revert()));

if (usePackagedExtension) {
	patchedPackageJsons.push(patchPackageJson(resolve(extensionDevelopmentPath, 'package.json'), pkg => {
		pkg.activationEvents = pkg.activationEvents?.filter(event => event !== 'onStartupFinished');
	}).revert);
}

const isRecoveryBuild = !pkg.version.endsWith('.0');
const mocha = {
	ui: 'tdd',
	color: true,
	forbidOnly: !!process.env.CI,
	timeout: 5000,
	retries: isSanity ? 1 : 0
};

if ((usePackagedExtension || useInstalledVsix) && !process.argv.includes('--grep')) {
	mocha.grep = 'Copilot CLI Chat Sanity Test';
}

const config = {
	files: __dirname + (isSanity ? '/dist/sanity-test-extension.js' : '/dist/test-extension.js'),
	extensionDevelopmentPath,
	env: {
		COPILOT_API_URL: process.env.COPILOT_API_URL ?? 'https://api.githubcopilot.com',
		COPILOT_TEST_SOURCE_EXTENSION_PATH: __dirname,
		COPILOT_TEST_VSIX_PATH: process.env.COPILOT_TEST_VSIX_PATH,
		COPILOT_TEST_VSIX_BASENAME: process.env.COPILOT_TEST_VSIX_PATH ? basename(process.env.COPILOT_TEST_VSIX_PATH, '.vsix') : undefined,
		COPILOT_TEST_VSIX_EXTENSION_PATH: useInstalledVsix ? extractedVsixExtensionPath : undefined,
		IS_SCENARIO_AUTOMATION: (usePackagedExtension || useInstalledVsix) ? '1' : process.env.IS_SCENARIO_AUTOMATION,
	},
	launchArgs: useInstalledVsix ? [
		'--disable-extension',
		'vscode.github-authentication'
	] : [
		'--disable-extensions',
		'--profile-temp'
	],
	mocha
};

if (useInstalledVsix) {
	config.skipExtensionDependencies = true;
}

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

function ensureSanityTestDriverExtension(extensionPath) {
	mkdirSync(extensionPath, { recursive: true });
	writeFileSync(resolve(extensionPath, 'package.json'), JSON.stringify({
		name: 'copilot-chat-sanity-driver',
		publisher: 'github',
		displayName: 'Copilot Chat Sanity Driver',
		version: '0.0.0',
		engines: { vscode: '^1.80.0' }
	}, null, '\t'));
}

async function extractVsixExtension(vsixPath, destinationRoot) {
	rmSync(destinationRoot, { recursive: true, force: true });
	mkdirSync(destinationRoot, { recursive: true });
	await extractZip(vsixPath, { dir: destinationRoot });
}
