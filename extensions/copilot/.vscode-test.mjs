/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from '@vscode/test-cli';
import { resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';
import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
const usePackagedSanityExtension = useInstalledVsix || usePackagedExtension;
const sanityDriverExtensionPath = resolve(__dirname, '.build', 'sanity-test-driver');
const packagedSanityLogsPath = resolve(__dirname, '.build', 'sanity-logs');
const installedVsixExtensionsPath = resolve(__dirname, '.build', 'sanity-installed-vsix-extensions');
const installedVsixUserDataPath = resolve(__dirname, '.build', 'sanity-installed-vsix-user-data');
let installedVsixExtensionPath;
if (usePackagedSanityExtension) {
	rmSync(packagedSanityLogsPath, { recursive: true, force: true });
	mkdirSync(packagedSanityLogsPath, { recursive: true });
}
if (useInstalledVsix) {
	ensureSanityTestDriverExtension(sanityDriverExtensionPath);
	installedVsixExtensionPath = installVsixExtension(resolve(process.env.COPILOT_TEST_VSIX_PATH), installedVsixExtensionsPath, installedVsixUserDataPath);
}
const extensionDevelopmentPath = useInstalledVsix
	? sanityDriverExtensionPath
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

if (usePackagedSanityExtension && !process.argv.includes('--grep')) {
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
		COPILOT_TEST_INSTALLED_VSIX_EXTENSION_PATH: installedVsixExtensionPath,
		VSCODE_LOGS: usePackagedSanityExtension ? packagedSanityLogsPath : process.env.VSCODE_LOGS,
		IS_SCENARIO_AUTOMATION: usePackagedSanityExtension ? '1' : process.env.IS_SCENARIO_AUTOMATION,
		VSCODE_SKIP_BUILTIN_EXTENSIONS: usePackagedSanityExtension ? skipBuiltinCopilotChat(process.env.VSCODE_SKIP_BUILTIN_EXTENSIONS) : process.env.VSCODE_SKIP_BUILTIN_EXTENSIONS,
	},
	launchArgs: useInstalledVsix ? [
		'--logsPath',
		packagedSanityLogsPath,
		'--extensions-dir',
		installedVsixExtensionsPath,
		'--disable-extension',
		'vscode.github-authentication'
	] : [
		...(usePackagedSanityExtension ? ['--logsPath', packagedSanityLogsPath] : []),
		'--disable-extensions',
		'--profile-temp'
	],
	mocha
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

function ensureSanityTestDriverExtension(extensionPath) {
	mkdirSync(extensionPath, { recursive: true });
	writeFileSync(resolve(extensionPath, 'package.json'), JSON.stringify({
		name: 'copilot-chat-sanity-driver',
		publisher: 'github',
		displayName: 'Copilot Chat Sanity Driver',
		version: '0.0.0',
		engines: { vscode: '^1.80.0' },
		main: './extension.js',
		activationEvents: ['*', 'onAuthenticationRequest:github'],
		contributes: {
			authentication: [{ id: 'github', label: 'GitHub (Mock)' }]
		}
	}, null, '\t'));
	writeFileSync(resolve(extensionPath, 'extension.js'), String.raw`
const vscode = require('vscode');

function activate(context) {
	const token = process.env.GITHUB_PAT || process.env.GITHUB_OAUTH_TOKEN;
	if (!token) {
		console.log('[Copilot CLI Sanity Driver] GITHUB_PAT/GITHUB_OAUTH_TOKEN is not set; skipping GitHub auth provider registration.');
		return;
	}

	const emitter = new vscode.EventEmitter();
	const createSession = scopes => ({
		id: 'copilot-cli-sanity-github-session',
		accessToken: token,
		account: { id: 'user', label: 'User' },
		scopes: [...(scopes || ['read:user', 'user:email'])]
	});
	const provider = {
		onDidChangeSessions: emitter.event,
		getSessions: async scopes => [createSession(scopes)],
		createSession: async scopes => {
			const session = createSession(scopes);
			emitter.fire({ added: [session], removed: [], changed: [] });
			return session;
		},
		removeSession: async () => { }
	};

	context.subscriptions.push(emitter);
	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('github', 'GitHub', provider, { supportsMultipleAccounts: false }));
	console.log('[Copilot CLI Sanity Driver] Registered mock GitHub auth provider.');
}

function deactivate() { }

module.exports = { activate, deactivate };
`.trimStart());
}

function installVsixExtension(vsixPath, extensionsPath, userDataPath) {
	if (!process.env.VSCODE_UNDER_TEST) {
		throw new Error('COPILOT_TEST_VSIX_PATH requires VSCODE_UNDER_TEST so the sanity harness can install the VSIX with the same VS Code binary it is about to test.');
	}

	rmSync(extensionsPath, { recursive: true, force: true });
	rmSync(userDataPath, { recursive: true, force: true });
	mkdirSync(extensionsPath, { recursive: true });
	mkdirSync(userDataPath, { recursive: true });

	const cliPath = resolveCliPathFromVSCodeExecutablePath(process.env.VSCODE_UNDER_TEST);
	const args = [
		'--install-extension', vsixPath,
		'--force',
		'--pre-release',
		'--user-data-dir', userDataPath,
		'--extensions-dir', extensionsPath
	];
	const result = spawnSync(cliPath, args, {
		encoding: 'utf8',
		env: {
			...process.env,
			VSCODE_SKIP_BUILTIN_EXTENSIONS: skipBuiltinCopilotChat(process.env.VSCODE_SKIP_BUILTIN_EXTENSIONS)
		},
		shell: process.platform === 'win32'
	});
	if (result.status !== 0) {
		throw new Error(`Failed to install Copilot Chat VSIX with ${cliPath} ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
	}

	const installedPath = findInstalledCopilotChatExtension(extensionsPath);
	if (!installedPath) {
		throw new Error(`Copilot Chat VSIX install completed, but github.copilot-chat was not found under ${extensionsPath}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
	}

	console.log(`Installed Copilot Chat sanity VSIX at ${installedPath}`);
	return installedPath;
}

function findInstalledCopilotChatExtension(extensionsPath) {
	const entries = readdirSync(extensionsPath, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory() || !entry.name.toLowerCase().startsWith('github.copilot-chat-')) {
			continue;
		}

		const extensionPath = resolve(extensionsPath, entry.name);
		const packageJson = JSON.parse(readFileSync(resolve(extensionPath, 'package.json'), 'utf8'));
		if (`${packageJson.publisher}.${packageJson.name}`.toLowerCase() === 'github.copilot-chat') {
			return extensionPath;
		}
	}
	return undefined;
}

function skipBuiltinCopilotChat(existingValue) {
	const entries = (existingValue ?? '').split(',').map(id => id.trim()).filter(id => id);
	if (!entries.some(id => id.toLowerCase() === 'github.copilot-chat')) {
		entries.push('github.copilot-chat');
	}
	return entries.join(',');
}
