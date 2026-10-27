/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'mocha';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import { FileWatcherManager } from '../fileWatcherManager';
import { Logger } from '../logging';
import { PathMapper } from '../pathMapper';
import { createSys } from '../serverHost';

suite('Web TypeScript plugin loading', () => {
	let directory: string;
	let channel: MessageChannel;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'vscode-typescript-plugin-'));
		channel = new MessageChannel();
	});

	teardown(async () => {
		channel.port1.close();
		channel.port2.close();
		await rm(directory, { recursive: true, force: true });
	});

	async function createHost(fetch: typeof globalThis.fetch) {
		const extensionUri = URI.file(directory);
		const logger = new Logger(undefined);
		const pathMapper = new PathMapper(extensionUri);
		const watchManager = new FileWatcherManager(channel.port1, extensionUri, false, pathMapper, logger);
		const { sys } = await createSys(
			ts,
			['--executingFilePath', '/'],
			channel.port2,
			logger,
			watchManager,
			pathMapper,
			() => { },
			fetch,
		);
		return sys;
	}

	for (const moduleName of [
		'https://example.invalid/plugin',
		'HTTPS://example.invalid/plugin',
		'http://example.invalid/plugin',
		'file:///plugin',
		'data:text/javascript,export default {}',
		'blob:https://example.invalid/plugin',
		'custom:plugin',
	]) {
		test(`rejects ${moduleName} before fetching`, async () => {
			const requests: string[] = [];
			const host = await createHost(async input => {
				requests.push(String(input));
				throw new Error('Unexpected plugin request');
			});

			const result = await host.importPlugin('https://extensions.example.invalid/node_modules', moduleName);
			assert.deepStrictEqual({
				module: result.module,
				error: result.error?.message,
				requests,
			}, {
				module: undefined,
				error: 'Could not load plugin. URLs are not supported as plugin names.',
				requests: [],
			});
		});
	}

	for (const moduleName of ['test-plugin', '@scope/test-plugin']) {
		test(`loads ${moduleName}`, async () => {
			const pluginDirectory = join(directory, moduleName);
			await mkdir(pluginDirectory, { recursive: true });
			await writeFile(join(pluginDirectory, 'index.cjs'), 'module.exports = { name: "test-plugin" };\n');
			const requests: string[] = [];
			const host = await createHost(async input => {
				requests.push(String(input));
				return new Response(JSON.stringify({ browser: 'index.cjs' }));
			});

			const root = directory.replace(/\\/g, '/');
			const result = await host.importPlugin(root, moduleName);
			assert.deepStrictEqual({
				module: result.module,
				error: result.error,
				requests,
			}, {
				module: { name: 'test-plugin' },
				error: undefined,
				requests: [`${root}/${moduleName}/package.json`],
			});
		});

		test(`preserves an HTTPS search location for ${moduleName}`, async () => {
			const requests: string[] = [];
			const host = await createHost(async input => {
				requests.push(String(input));
				return new Response('{}');
			});

			const root = 'https://extensions.example.invalid/node_modules';
			const result = await host.importPlugin(root, moduleName);
			assert.deepStrictEqual({
				module: result.module,
				error: result.error?.message,
				requests,
			}, {
				module: undefined,
				error: 'Could not load plugin. No \'browser\' field found in package.json.',
				requests: [`${root}/${moduleName}/package.json`],
			});
		});
	}
});
