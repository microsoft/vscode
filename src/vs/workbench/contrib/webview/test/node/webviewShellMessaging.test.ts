/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { FileAccess } from '../../../../../base/common/network.js';
import { join, resolve } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';

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

	test('restores the last editable before native commands, independent of context-menu dismissal', () => {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
		const commandHandler = html.match(/hostMessaging\.onMessage\('execCommand',[\s\S]*?\r?\n\t{3}\}\);/)?.[0];
		assert.ok(commandHandler);
		const lastFocusedElements = new WeakMap<Document, HTMLElement>();
		const body = upcastPartial<HTMLElement>({});
		let activeElement: Element = body;
		let targetAtCommand: Element | undefined;
		const calls: string[] = [];
		const contentDocument = upcastPartial<Document>({
			body,
			get activeElement() { return activeElement; },
			execCommand: command => {
				targetAtCommand = activeElement;
				calls.push(command);
				return true;
			},
		});
		const textarea = upcastPartial<HTMLElement>({
			isConnected: true,
			ownerDocument: contentDocument,
			focus: () => { activeElement = textarea; calls.push('focus'); },
		});
		lastFocusedElements.set(contentDocument, textarea);
		let execute: ((_event: undefined, command: string) => void) | undefined;
		new Function('hostMessaging', 'getActiveFrame', 'assertIsDefined', 'lastFocusedElements', commandHandler)(
			{ onMessage: (_channel: string, handler: typeof execute) => { execute = handler; } },
			() => ({ contentDocument }),
			<T>(value: T): T => value,
			lastFocusedElements,
		);
		assert.ok(execute);
		execute(undefined, 'paste');
		assert.deepStrictEqual({ calls, correctTarget: targetAtCommand === textarea }, { calls: ['focus', 'paste'], correctTarget: true });

		const input = upcastPartial<HTMLElement>({});
		activeElement = input;
		execute(undefined, 'copy');
		assert.strictEqual(targetAtCommand, input);

		activeElement = body;
		lastFocusedElements.set(contentDocument, upcastPartial<HTMLElement>({ isConnected: false }));
		execute(undefined, 'paste');
		assert.strictEqual(targetAtCommand, body);
	});

	test('matches the preload script CSP hash', () => {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
		const script = html.match(/<script async type="module">([\s\S]*?)<\/script>/)?.[1];
		assert.ok(script);
		const hash = createHash('sha256').update(script.replace(/\r\n/g, '\n')).digest('base64');
		assert.ok(html.includes(`'sha256-${hash}'`));
	});
});
