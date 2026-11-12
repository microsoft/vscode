/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createRequire } from 'module';
import { suite, test } from 'node:test';
import { DARWIN_UNIVERSAL_SINGLE_ARCH_FILES, shouldSkipDarwinUniversalFileComparison } from '../../darwin/create-universal-app.ts';

const bundlerRequire = createRequire(createRequire(import.meta.url).resolve('vscode-universal-bundler'));
const { minimatch: bundlerMinimatch } = bundlerRequire('minimatch') as {
	minimatch: (p: string, pattern: string, options?: { matchBase?: boolean; platform?: NodeJS.Platform }) => boolean;
};

suite('darwin universal packaging rules', () => {
	test('allows single-arch copilot-sdk plugin dotfiles in mergeASARs without dot:true', () => {
		const checkSingleArch = (asarEntry: string) =>
			bundlerMinimatch(asarEntry, DARWIN_UNIVERSAL_SINGLE_ARCH_FILES, { matchBase: true, platform: 'darwin' });

		for (const arch of ['x64', 'arm64']) {
			assert.deepStrictEqual({
				packageRoot: checkSingleArch(`@github/copilot-sdk-darwin-${arch}`),
				channelJson: checkSingleArch(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/channel.json`),
				mcpJson: checkSingleArch(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.mcp.json`),
				releaseTarget: checkSingleArch(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.release-target`),
				pluginDir: checkSingleArch(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.plugin`),
				pluginJson: checkSingleArch(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/.plugin/plugin.json`),
				nestedSubdirDotfile: checkSingleArch(`@github/copilot-sdk-darwin-${arch}/plugins/browser-use/hooks/.hookrc`),
			}, {
				packageRoot: true,
				channelJson: true,
				mcpJson: true,
				releaseTarget: true,
				pluginDir: true,
				pluginJson: true,
				nestedSubdirDotfile: true,
			}, `darwin-${arch}`);
		}

		assert.strictEqual(checkSingleArch('regular-pkg/index.js'), false);
		assert.strictEqual(checkSingleArch('@github/copilot-sdk-darwin-x64/.DS_Store'), false);
	});

	test('skips SHA comparison for unpacked copilot-sdk darwin plugin dotfiles', () => {
		assert.deepStrictEqual({
			x64ReleaseTarget: shouldSkipDarwinUniversalFileComparison('Contents/Resources/app/node_modules.asar.unpacked/@github/copilot-sdk-darwin-x64/plugins/browser-use/.release-target'),
			arm64PluginJson: shouldSkipDarwinUniversalFileComparison('Contents/Resources/app/node_modules.asar.unpacked/@github/copilot-sdk-darwin-arm64/plugins/browser-use/.plugin/plugin.json'),
			arm64McpJson: shouldSkipDarwinUniversalFileComparison('Contents/Resources/app/node_modules.asar.unpacked/@github/copilot-sdk-darwin-arm64/plugins/browser-use/.mcp.json'),
			sharedFile: shouldSkipDarwinUniversalFileComparison('Contents/Resources/app/out/main.js'),
		}, {
			x64ReleaseTarget: true,
			arm64PluginJson: true,
			arm64McpJson: true,
			sharedFile: false,
		});
	});
});
