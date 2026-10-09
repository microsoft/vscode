/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { join, resolve } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Webview shell messaging', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sends host messages through startup-captured primitives', () => {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
		const portSend = html.match(/postMessage\(channel, data, transfer\) \{\r?\n\t+(.+)/)?.[1];
		const readySend = html.match(/invoke\(sendToParent, window\.parent, (\{.+\}), parentOrigin/)?.[1];

		assert.deepStrictEqual({
			capturesInvokeBeforePort: html.indexOf('const invoke = Function.prototype.bind.call(nativeCall, nativeCall);') < html.indexOf('class HostMessaging'),
			portSend,
			readySend,
			portPropertyCall: html.includes('.postMessage.call('),
			readyPropertyPostMessage: html.includes('window.parent.postMessage('),
		}, {
			capturesInvokeBeforePort: true,
			portSend: 'invoke(nativePortPostMessage, this.channel.port1, { channel, data }, transfer);',
			readySend: '{ target: ID, channel: \'webview-ready\', data: { keyEventToken, mountId: searchParams.get(\'mountId\') } }',
			portPropertyCall: false,
			readyPropertyPostMessage: false,
		});
	});
});
