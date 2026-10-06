/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { _electron } from 'playwright';
import { shouldDownloadElectron } from '../../build/lib/electronVersion.ts';
import { collectSnapshot } from '../../build/next/build-fast.ts';

interface Result {
	readonly expected: string[];
	readonly activated: string[];
	readonly failures: { id: string; error: string }[];
	readonly services: Record<string, number>;
}

const root = path.resolve(import.meta.dirname, '../..');
const evidence = path.join(root, '.build', 'logs', 'cold-build');
const mode = process.argv[2];
await fs.mkdir(evidence, { recursive: true });

if (mode === 'build') {
	const absent = ['out/main.js', '.build/build-fast/state.json', 'extensions/configuration-editing/out/configurationEditingMain.js', 'extensions/copilot/dist/extension.js'];
	for (const file of absent) {
		await assert.rejects(fs.stat(path.join(root, file)), { code: 'ENOENT' }, `Cold build must not inherit ${file}`);
	}
	const environment = { ...process.env };
	delete environment.BUILD_SOURCEVERSION;
	const postinstall = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', 'extensions/copilot', 'run', 'postinstall'], {
		cwd: root, env: environment, stdio: 'inherit', shell: process.platform === 'win32',
	});
	assert.ifError(postinstall.error);
	assert.equal(postinstall.status, 0, 'Restore install-time Copilot assets omitted by the dependency-only CI cache');
	const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build-fast'], {
		cwd: root, env: environment, stdio: 'inherit', shell: process.platform === 'win32',
	});
	assert.ifError(result.error);
	assert.equal(result.status, 0, 'Cold build-fast must succeed');
	await fs.writeFile(path.join(evidence, 'build.json'), JSON.stringify({ platform: process.platform, absentBeforeBuild: absent, snapshot: await collectSnapshot(root) }, null, 2));
} else if (mode === 'launch') {
	assert.equal(shouldDownloadElectron(root, {}), false, 'CI must prepare the expected Electron before launch');
	const require = createRequire(path.join(root, 'build', 'package.json'));
	const esbuild: typeof import('esbuild') = require('esbuild');
	const profile = path.join(evidence, 'profile');
	const probe = path.join(evidence, 'probe');
	const fixture = path.join(evidence, 'fixture');
	await fs.mkdir(path.join(profile, 'User'), { recursive: true });
	await fs.mkdir(probe, { recursive: true });
	await fs.mkdir(fixture, { recursive: true });
	await fs.writeFile(path.join(probe, 'package.json'), JSON.stringify({
		name: 'cold-build-validation', publisher: 'local-validation', version: '0.0.1',
		engines: { vscode: '^1.100.0' }, main: './extension.cjs', activationEvents: ['onStartupFinished'],
	}));
	await esbuild.build({
		entryPoints: [path.join(import.meta.dirname, 'extension.ts')], outfile: path.join(probe, 'extension.cjs'),
		bundle: true, format: 'cjs', platform: 'node', external: ['vscode'],
	});
	await fs.writeFile(path.join(profile, 'User', 'settings.json'), JSON.stringify({
		'workbench.startupEditor': 'none', 'window.title': 'Cold build validation', 'files.simpleDialog.enable': true,
		'git.autoRepositoryDetection': false, 'git.openRepositoryInParentFolders': 'never',
		'npm.autoDetect': 'off', 'extensions.autoUpdate': false,
	}));
	for (const [file, contents] of [
		['sample.ts', 'export function coldBuildExample(value: number): number { return value + 1; }\n'],
		['sample.html', '<'], ['sample.css', ''], ['package.json', '{ }'],
		['sample.md', '# Cold Build Validation\n\nCheck **formatted text**.\n'],
	]) {
		await fs.writeFile(path.join(fixture, file), contents);
	}
	const product: { applicationName: string; nameShort: string; nameLong: string } = JSON.parse(await fs.readFile(path.join(root, 'product.json'), 'utf8'));
	const executablePath = process.platform === 'win32'
		? path.join(root, '.build', 'electron', `${product.nameShort}.exe`)
		: process.platform === 'darwin'
			? path.join(root, '.build', 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', product.nameShort)
			: path.join(root, '.build', 'electron', product.applicationName);
	const resultFile = path.join(evidence, 'activation.json');
	const environment: NodeJS.ProcessEnv = { ...process.env, VSCODE_DEV: '1', VSCODE_CLI: '1', COLD_BUILD_REPOSITORY: root, COLD_BUILD_RESULT: resultFile };
	delete environment.ELECTRON_RUN_AS_NODE;
	delete environment.GIT_CONFIG_COUNT;
	delete environment.GIT_CONFIG_PARAMETERS;
	const app = await _electron.launch({
		executablePath,
		args: [root, fixture, `--user-data-dir=${profile}`, `--shared-data-dir=${path.join(evidence, 'shared')}`,
			`--extensions-dir=${path.join(evidence, 'extensions')}`, `--extensionDevelopmentPath=${probe}`,
			`--logsPath=${path.join(evidence, 'app-logs')}`, '--disable-workspace-trust', '--use-inmemory-secretstorage',
			'--disable-extension=vscode.vscode-api-tests', '--disable-updates', '--disable-telemetry', '--disable-experiments',
			'--skip-welcome', '--skip-release-notes', '--no-cached-data', '--log=info'],
		env: Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
		timeout: 60000,
	});
	try {
		const page = await app.firstWindow();
		await page.waitForSelector('.monaco-workbench', { timeout: 60000 });
		let result: Result | undefined;
		for (let attempt = 0; attempt < 240; attempt++) {
			try {
				result = JSON.parse(await fs.readFile(resultFile, 'utf8'));
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
					throw error;
				}
			}
			await page.waitForTimeout(500);
		}
		assert(result, 'Activation must publish its result');
		assert.deepEqual(result.failures, []);
		assert(result.expected.length >= 30, 'Must test the shipping built-ins');
		assert.deepEqual(result.activated.slice().sort(), result.expected.slice().sort());
		for (const [name, count] of Object.entries(result.services)) {
			assert(count > 0, `${name} must return language service results`);
		}
		let preview = false;
		for (let attempt = 0; attempt < 60 && !preview; attempt++) {
			for (const frame of page.frames()) {
				if (await frame.getByRole('heading', { name: 'Cold Build Validation' }).isVisible()) {
					assert(await frame.locator('strong').filter({ hasText: 'formatted text' }).isVisible());
					preview = true;
				}
			}
			if (!preview) {
				await page.waitForTimeout(500);
			}
		}
		assert(preview, 'Markdown preview must render cold-built media');
		await page.screenshot({ path: path.join(evidence, 'workbench.png') });
		console.log(`PASS ${process.platform}: ${result.activated.length} built-ins activated; language services and Markdown preview verified.`);
	} finally {
		await app.close();
	}
} else {
	throw new Error('Expected build or launch mode');
}
