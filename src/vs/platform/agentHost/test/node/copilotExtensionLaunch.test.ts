/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotExtensionLaunch } from '../../node/copilot/copilotExtensionLaunch.js';

suite('Copilot extension launch adapter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const root = URI.file('/runtime').fsPath;

	test('older SDKs neither opt in nor require extension assets', async () => {
		const result = await getCopilotExtensionLaunch(join(root, 'index.js'), {}, '/node', async () => { throw new Error('must not resolve'); });
		assert.strictEqual(result, undefined);
	});

	test('uses the bundled bootstrap without interpreting the discovered entrypoint', async () => {
		const checked: string[] = [];
		const result = await getCopilotExtensionLaunch(join(root, 'index.js'), { supportsExtensionLaunchProvider: true }, '/node', async path => { checked.push(path); });
		assert.ok(result);
		const modulePath = join(root, 'extensions', 'space and $shell', 'extension.mjs');
		assert.deepStrictEqual({
			sdk: result.extensionSdkPath,
			checked,
			profile: result.onExtensionLaunch({ modulePath }),
			unsupported: result.onExtensionLaunch({ modulePath: 'relative.mjs' }),
			notJavaScript: result.onExtensionLaunch({ modulePath: join(root, 'extension.py') }),
		}, {
			sdk: join(root, 'copilot-sdk'),
			checked: [
				join(root, 'copilot-sdk', 'index.js'), join(root, 'copilot-sdk', 'extension.js'),
				join(root, 'preloads', 'extension_bootstrap.mjs'), join(root, 'preloads', 'extension_sdk_resolver.mjs'),
			],
			profile: { launch: { executable: '/node', args: [join(root, 'preloads', 'extension_bootstrap.mjs')], env: {
				EXTENSION_PATH: modulePath, ELECTRON_RUN_AS_NODE: '1', COPILOT_CLI_RUN_AS_NODE: '1',
			} } },
			unsupported: {},
			notJavaScript: {},
		});
	});

	test('missing runtime assets reject supported setup before extensions are enabled', async () => {
		await assert.rejects(getCopilotExtensionLaunch(join(root, 'index.js'), { supportsExtensionLaunchProvider: true }, '/node', async () => {
			throw new Error('missing assets');
		}), /missing assets/);
	});
});
