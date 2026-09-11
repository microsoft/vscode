/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyFile, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, parse } from 'node:path';
import { tmpdir } from 'node:os';

const fixture = new URL('../src/vs/platform/agentHost/test/node/providerIntegration/fixtures/localCanvas/', import.meta.url);

export interface ILocalCanvasPoc {
	readonly version: 1;
	readonly extensionId: 'user:local-canvas-demo';
	readonly root: string;
	readonly home: string;
	readonly copilotHome: string;
	readonly workspace: string;
}

export async function prepareLocalCanvasPoc(destination?: string) {
	if (destination && (!isAbsolute(destination) || destination === parse(destination).root)) {
		throw new Error('The demo directory must be absolute and must not be a filesystem root.');
	}

	if (destination) {
		await mkdir(destination, { mode: 0o700 });
	}
	const root = await realpath(destination ?? await mkdtemp(join(tmpdir(), 'vscode-canvas-poc-')));
	const home = join(root, 'home');
	const copilotHome = join(root, 'copilot-home');
	const workspace = join(root, 'workspace');
	const extension = join(copilotHome, 'extensions', 'local-canvas-demo');
	for (const directory of [home, join(home, '.config'), workspace, extension]) {
		await mkdir(directory, { recursive: true, mode: 0o700 });
	}
	for (const file of ['extension.mjs', 'index.html', 'client.js', 'style.css']) {
		await copyFile(new URL(file, fixture), join(extension, file));
	}
	await writeFile(join(workspace, 'AGENTS.md'), [
		'# Local canvas demo',
		'',
		'This workspace is an isolated demonstration of a reviewed custom Copilot canvas extension.',
		'Use the available canvas tools to open or change the counter rather than editing its backing files.',
		'The extension is user:local-canvas-demo, the canvas type is counter, and the suggested open input is {"documentId":"demo"}.',
		'The increment action takes {"amount":3}. Only invoke it when the user asks to change the counter.',
		'Browser clicks and declared canvas actions update the same persistent document through the extension.',
		'',
	].join('\n'), { flag: 'wx', mode: 0o600 });
	const instructions = [
		'# Local canvas PoC workspace',
		'',
		'Start a local Copilot session in this folder, not an isolated Git worktree or a remote host.',
		'Ask: Open the Local Counter canvas for document demo.',
		'Click Increment in the canvas. Then ask: Use the canvas increment action to add 3.',
		'The live value should change without a page reload, with separate counts for clicks and actions.',
		'',
		'The canvas menu can open/reveal a canvas, invoke a declared action, reload its provider, or close it.',
		'For generic JSON prompts, open input is {"documentId":"demo"} and increment input is {"amount":3}.',
		'Closing the browser tab hides the view; explicitly closing the canvas ends its logical instance.',
		'',
		'Only this reviewed fixture is installed. Node extensions are trusted executable code, not sandboxed by tool approvals.',
		'Do not add unreviewed extensions to this home. This opt-in is not a production trust or installation system.',
		'',
	].join('\n');
	await writeFile(join(workspace, 'README.md'), instructions, { flag: 'wx', mode: 0o600 });
	await writeFile(join(root, 'profile-settings.json'), JSON.stringify({
		'chat.automations.enabled': false,
		'github.copilot.chat.cloudAgent.enabled': false,
		'chat.agentHost.claudeAgent.enabled': false,
		'chat.agentHost.codexAgent.enabled': false,
		'telemetry.telemetryLevel': 'off',
		'window.restoreWindows': 'none',
	}, null, '\t') + '\n', { flag: 'wx', mode: 0o600 });
	const manifest: ILocalCanvasPoc = {
		version: 1,
		extensionId: 'user:local-canvas-demo',
		root,
		home,
		copilotHome,
		workspace,
	};
	await writeFile(join(root, 'poc.json'), JSON.stringify(manifest, null, '\t') + '\n', { flag: 'wx', mode: 0o600 });
	return manifest;
}

if (import.meta.main) {
	try {
		const [destination, ...extra] = process.argv.slice(2);
		if (extra.length) {
			throw new Error('Provide at most one new absolute directory.');
		}
		if (destination === '--help') {
			console.log('Usage: node scripts/prepare-local-canvas-poc.mts [new-absolute-directory]');
			console.log('Creates an isolated local canvas demo. Never installs into your personal Copilot home.');
		} else {
			console.log(JSON.stringify(await prepareLocalCanvasPoc(destination)));
		}
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
