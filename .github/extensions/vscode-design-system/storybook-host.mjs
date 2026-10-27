/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanel } from './server.mjs';
import { loadSystem } from './system.mjs';
import { pages, viewPath } from './storybook-model.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const generated = path.join(directory, 'stories-generated');
const copyright = '// Copyright (c) Microsoft Corporation. Licensed under the MIT License.\n';

function writeStories(system, catalog) {
	mkdirSync(generated, { recursive: true });
	const files = new Map();
	const docs = (title, props, of) => `import { Meta } from '@storybook/addon-docs/blocks';\nimport { Reference } from '../reference.jsx';\n${of ? `import * as Stories from './${of}.stories.js';\n` : ''}\n<Meta ${of ? 'of={Stories}' : `title=${JSON.stringify(title)}`} />\n<Reference {...${JSON.stringify(props)}} />\n`;
	for (const page of pages) {
		files.set(`${page.section}.mdx`, docs(page.title, { section: page.section }));
	}
	for (const control of system.controls) {
		const variants = catalog?.controls.find(item => item.id === control.id)?.variants ?? [];
		const props = { section: 'components', controlId: control.id };
		let source = `${copyright}import { renderReference } from '../reference.js';\nexport default { id: ${JSON.stringify(`components-${control.id}`)}, title: ${JSON.stringify(`Components/${control.name}`)}, parameters: { layout: 'fullscreen' } };\n`;
		if (!variants.length) {
			source += `export const Preview = { render: () => renderReference(${JSON.stringify(props)}) };\n`;
		}
		for (const variant of variants) {
			const key = createHash('sha256').update(variant.id).digest('hex');
			source += `export const Fixture_${key} = { name: ${JSON.stringify(variant.name)}, parameters: { fixtureId: ${JSON.stringify(variant.id)} }, render: () => renderReference(${JSON.stringify({ ...props, fixtureId: variant.id })}) };\n`;
		}
		files.set(`${control.id}.stories.js`, source);
		files.set(`${control.id}.mdx`, docs('', props, control.id));
	}
	for (const [file, text] of files) {
		const target = path.join(generated, file);
		let previous;
		try {
			previous = readFileSync(target, 'utf8');
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error;
			}
		}
		if (previous !== text) {
			writeFileSync(target, text);
		}
	}
	for (const file of readdirSync(generated)) {
		if (!files.has(file) && /\.(?:mdx|stories\.js)$/.test(file)) {
			unlinkSync(path.join(generated, file));
		}
	}
}

async function unusedPort() {
	const socket = net.createServer();
	socket.listen(0, '127.0.0.1');
	await once(socket, 'listening');
	const { port } = socket.address();
	await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
	return port;
}

export async function createStorybookPanel(root) {
	let latestCatalog;
	let system = loadSystem(root);
	const watchers = new Map();
	let child;
	let timer;
	let closed = false;
	const panel = createPanel(root, undefined, catalog => {
		latestCatalog = catalog;
		writeStories(system, catalog);
	});
	await panel.listen();
	const close = async () => {
		closed = true;
		clearTimeout(timer);
		for (const watcher of watchers.values()) {
			watcher.close();
		}
		if (child?.pid && child.exitCode === null && child.signalCode === null) {
			const exited = once(child, 'exit');
			child.kill('SIGTERM');
			const force = setTimeout(() => child.kill('SIGKILL'), 5000);
			try {
				await exited;
			} finally {
				clearTimeout(force);
			}
		}
		await panel.close();
	};
	try {
		writeStories(system);
		try {
			await panel.readCatalog();
		} catch (error) {
			// Docs remain usable without the optional renderer; the component page provides retry.
			console.error(`Component Explorer is unavailable: ${error.message}`);
		}
		const port = await unusedPort();
		const origin = `http://127.0.0.1:${port}`;
		panel.setPublicOrigin(origin);
		let fixturesChanged = false;
		const refresh = async () => {
			const refreshFixtures = fixturesChanged;
			fixturesChanged = false;
			try {
				system = loadSystem(root);
				trackSources();
				writeStories(system, latestCatalog);
				panel.sourcesChanged(refreshFixtures);
				if (refreshFixtures) {
					await panel.readCatalog();
				}
			} catch (error) {
				console.error(`Couldn't refresh design-system sources: ${error.message}`);
				panel.sourcesChanged();
			}
		};
		const trackSources = () => {
			const directories = new Set(system.sourceFiles.map(file => path.dirname(path.join(root, file))));
			directories.add(path.join(root, 'extensions'));
			for (const target of directories) {
				if (watchers.has(target)) {
					continue;
				}
				const watcher = watch(target, { recursive: target === path.join(root, 'extensions') }, (_event, file) => {
					if (!file || closed) {
						return;
					}
					const relative = path.relative(root, path.join(target, file)).split(path.sep).join('/');
					if (!system.sourceFiles.includes(relative) && !/^extensions\/theme-[^/]+\/.*(?:json|jsonc)$/.test(relative)) {
						return;
					}
					fixturesChanged ||= relative.endsWith('.fixture.ts');
					clearTimeout(timer);
					timer = setTimeout(() => { void refresh(); }, 150);
				});
				watchers.set(target, watcher);
				watcher.on('error', error => console.error(`Design-system source watcher failed for ${target}: ${error.message}`));
			}
		};
		trackSources();
		// Canvas providers may run in Electron, whose signed runtime cannot load Storybook's native dependencies.
		child = spawn(process.versions.electron ? 'node' : process.execPath, [
			path.join(directory, 'node_modules/storybook/dist/bin/dispatcher.js'), 'dev',
			'--config-dir', path.join(directory, '.storybook'), '--host', '127.0.0.1',
			'--port', String(port), '--exact-port', '--ci', '--no-open', '--no-version-updates', '--disable-telemetry',
		], {
			cwd: directory,
			env: { ...process.env, VSCODE_DESIGN_SYSTEM_API: panel.url },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		let failure;
		for (const stream of [child.stdout, child.stderr]) {
			stream.on('data', chunk => {
				output = `${output}${chunk}`.slice(-16000);
				process.stderr.write(chunk);
			});
		}
		child.on('error', error => { failure = error; });
		child.on('exit', (code, signal) => {
			if (!closed) {
				failure = new Error(`Storybook stopped (${signal ?? code}). ${output}`);
				console.error(failure.message);
			}
		});
		const deadline = Date.now() + 60000;
		while (Date.now() < deadline) {
			if (failure) {
				throw failure;
			}
			try {
				const response = await fetch(`${origin}/index.json`, { signal: AbortSignal.timeout(1000) });
				if (response.ok && Object.keys((await response.json()).entries).length > 0) {
					return { get url() { return `${origin}/?path=${viewPath(panel.view)}`; }, get view() { return panel.view; }, setView: patch => panel.setView(patch), close };
				}
			} catch (error) {
				if (error.name !== 'TimeoutError' && error.cause?.code !== 'ECONNREFUSED') {
					throw error;
				}
			}
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		throw new Error(`Storybook did not become ready within 60 seconds. ${output}`);
	} catch (error) {
		await close();
		throw error;
	}
}
