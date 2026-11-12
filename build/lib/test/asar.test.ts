/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';
import es from 'event-stream';
import VinylFile from 'vinyl';
import { createAsar } from '../asar.ts';

function makeVinylFile(root: string, relativePath: string, contents: string): VinylFile {
	const buf = Buffer.from(contents);
	const stat = {
		mode: 0o100644,
		size: buf.length,
		isDirectory: () => false,
		isFile: () => true,
	} as fs.Stats;
	return new VinylFile({
		cwd: root,
		base: root,
		path: path.join(root, relativePath),
		stat,
		contents: buf,
	});
}

suite('createAsar', () => {
	test('unpacks, skips, and duplicates dot-prefixed files matching globs', async () => {
		const root = process.cwd();
		const files = [
			makeVinylFile(root, 'node_modules/@github/copilot-sdk-win32-x64/plugins/browser-use/channel.json', 'CHANNEL_JSON_PAYLOAD'),
			makeVinylFile(root, 'node_modules/@github/copilot-sdk-win32-x64/plugins/browser-use/.plugin/plugin.json', 'PLUGIN_JSON_PAYLOAD'),
			makeVinylFile(root, 'node_modules/@github/copilot-sdk-win32-x64/plugins/browser-use/.mcp.json', 'MCP_JSON_PAYLOAD'),
			makeVinylFile(root, 'node_modules/@github/copilot-sdk-win32-x64/plugins/browser-use/.release-target', 'RELEASE_TARGET_PAYLOAD'),
			makeVinylFile(root, 'node_modules/regular-pkg/index.js', 'REGULAR_PKG_PAYLOAD'),
			makeVinylFile(root, 'node_modules/regular-pkg/.hidden/Makefile.mk', 'SKIPPED_MK_PAYLOAD'),
			makeVinylFile(root, 'node_modules/@vscode/sandbox-runtime/.config/settings.json', 'DUPLICATED_DOTFILE_PAYLOAD'),
		];

		const output = await new Promise<VinylFile[]>((resolve, reject) => {
			es.readArray(files)
				.pipe(createAsar(
					path.join(root, 'node_modules'),
					['**/@github/copilot-sdk-{darwin,linux,linuxmusl,win32}-*/**'],
					['**/*.mk'],
					['node_modules/@vscode/sandbox-runtime/**'],
					'node_modules.asar'
				))
				.pipe(es.writeArray((err: Error | undefined, result: VinylFile[]) => err ? reject(err) : resolve(result)));
		});

		const outputByPath = new Map(output.map(f => [f.relative.replace(/\\/g, '/'), f.contents as Buffer]));
		const asarBuffer = outputByPath.get('node_modules.asar');
		assert(asarBuffer, 'expected node_modules.asar in output');

		assert.deepStrictEqual(
			[...outputByPath.keys()].sort(),
			[
				'node_modules.asar',
				'node_modules.asar.unpacked/@github/copilot-sdk-win32-x64/plugins/browser-use/.mcp.json',
				'node_modules.asar.unpacked/@github/copilot-sdk-win32-x64/plugins/browser-use/.plugin/plugin.json',
				'node_modules.asar.unpacked/@github/copilot-sdk-win32-x64/plugins/browser-use/.release-target',
				'node_modules.asar.unpacked/@github/copilot-sdk-win32-x64/plugins/browser-use/channel.json',
				'node_modules/@vscode/sandbox-runtime/.config/settings.json',
				'node_modules/regular-pkg/.hidden/Makefile.mk',
			]
		);

		assert.deepStrictEqual({
			pluginJsonPacked: asarBuffer.includes('PLUGIN_JSON_PAYLOAD'),
			mcpJsonPacked: asarBuffer.includes('MCP_JSON_PAYLOAD'),
			releaseTargetPacked: asarBuffer.includes('RELEASE_TARGET_PAYLOAD'),
			channelJsonPacked: asarBuffer.includes('CHANNEL_JSON_PAYLOAD'),
			regularPkgPacked: asarBuffer.includes('REGULAR_PKG_PAYLOAD'),
			skippedMkPacked: asarBuffer.includes('SKIPPED_MK_PAYLOAD'),
			duplicatedDotfilePacked: asarBuffer.includes('DUPLICATED_DOTFILE_PAYLOAD'),
		}, {
			pluginJsonPacked: false,
			mcpJsonPacked: false,
			releaseTargetPacked: false,
			channelJsonPacked: false,
			regularPkgPacked: true,
			skippedMkPacked: false,
			duplicatedDotfilePacked: true,
		});
	});
});
