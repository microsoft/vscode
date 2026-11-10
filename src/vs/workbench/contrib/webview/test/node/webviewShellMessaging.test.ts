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
import { WebviewMouseActivity } from '../../common/webview.js';

suite('Webview shell messaging', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createWheelHandler(messages: Pick<WheelEvent, 'deltaX' | 'deltaY'>[], platform = 'MacIntel'): (event: WheelEvent, contain?: boolean) => void {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
		const startMarker = '// #region Wheel forwarding';
		const start = html.indexOf(startMarker);
		const end = html.indexOf('// #endregion Wheel forwarding', start);
		assert.ok(start !== -1 && end > start);
		return new Function('hostMessaging', 'navigator', `${html.slice(start + startMarker.length, end)}\nreturn handleWheel;`)({
			postMessage: (_channel: string, data: Pick<WheelEvent, 'deltaX' | 'deltaY'>) => messages.push({ deltaX: data.deltaX, deltaY: data.deltaY }),
		}, { platform });
	}

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
		let selection: Selection | null = null;
		let targetAtCommand: Element | undefined;
		const calls: string[] = [];
		const contentDocument = upcastPartial<Document>({
			body,
			get activeElement() { return activeElement; },
			getSelection: () => selection,
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

		activeElement = body;
		selection = upcastPartial<Selection>({ rangeCount: 1, isCollapsed: true });
		calls.length = 0;
		execute(undefined, 'copy');
		assert.deepStrictEqual({ calls, correctTarget: targetAtCommand === textarea }, { calls: ['focus', 'copy'], correctTarget: true });

		const input = upcastPartial<HTMLElement>({});
		activeElement = input;
		execute(undefined, 'copy');
		assert.strictEqual(targetAtCommand, input);

		activeElement = body;
		lastFocusedElements.set(contentDocument, upcastPartial<HTMLElement>({ isConnected: false }));
		execute(undefined, 'paste');
		assert.strictEqual(targetAtCommand, body);
	});

	test('coalesces trusted mouse movement and captures events in both shell and content windows', () => {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
		const startMarker = '// #region Mouse activity forwarding';
		const endMarker = '// #endregion Mouse activity forwarding';
		const start = html.indexOf(startMarker);
		const end = html.indexOf(endMarker, start + startMarker.length);
		assert.ok(start !== -1 && end > start, 'Mouse activity forwarding markers must delimit the preload handler');
		const handler = html.slice(start + startMarker.length, end);
		const frames: FrameRequestCallback[] = [];
		const messages: { channel: string; data: WebviewMouseActivity }[] = [];
		const handleMouseMove: (event: MouseEvent) => void = new Function('window', 'hostMessaging', `${handler}\nreturn handleMouseMove;`)(
			{ requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) },
			{ postMessage: (channel: string, data: WebviewMouseActivity) => messages.push({ channel, data }) },
		);
		const event = (screenX: number, isTrusted = true) => upcastPartial<MouseEvent>({
			isTrusted, screenX, screenY: 50, clientX: screenX - 10, clientY: 40,
			button: 0, buttons: 1, altKey: false, ctrlKey: true, metaKey: false, shiftKey: true
		});
		handleMouseMove(event(100));
		handleMouseMove(event(101));
		assert.strictEqual(frames.length, 1);
		frames.shift()!(0);
		handleMouseMove(event(101));
		handleMouseMove(event(200, false));
		const ignoredFrames = frames.length;
		handleMouseMove(event(102));
		assert.strictEqual(frames.length, 1);
		frames.shift()!(0);
		assert.deepStrictEqual({
			ignoredFrames,
			messages,
			shellCapture: html.includes('window.addEventListener(\'mousemove\', handleMouseMove, true);'),
			contentCapture: html.includes('contentWindow.addEventListener(\'mousemove\', handleMouseMove, true);'),
		}, {
			ignoredFrames: 0,
			messages: [101, 102].map(screenX => ({
				channel: 'did-mouse-move',
				data: { screenX, screenY: 50 }
			})),
			shellCapture: true,
			contentCapture: true,
		});
	});

	test('contains scrolling documents and nested panes without trapping short previews or changing other webviews', () => {
		const messages: { deltaX: number; deltaY: number }[] = [];
		const handleWheel = createWheelHandler(messages);
		const styles = new Map<Element, Pick<CSSStyleDeclaration, 'overflowX' | 'overflowY'>>();
		const view = upcastPartial<NonNullable<Document['defaultView']>>({
			getComputedStyle: element => upcastPartial<CSSStyleDeclaration>(styles.get(element)!),
		});
		let scrollingElement: Element;
		const document: Document = upcastPartial<Document>({
			defaultView: view,
			get scrollingElement() { return scrollingElement; },
			get body(): HTMLElement { return body; },
		});
		const element = (width = 100, height = 100, overflowX = 'visible', overflowY = 'visible'): HTMLElement => {
			const node = upcastPartial<HTMLElement>({
				nodeType: 1, ownerDocument: document,
				clientWidth: 100, clientHeight: 100, scrollWidth: width, scrollHeight: height, scrollTop: 0,
			});
			styles.set(node, { overflowX, overflowY });
			return node;
		};
		scrollingElement = element();
		const body = element();
		const forwards = (target: Element, deltaX: number, deltaY: number, contain = true, defaultPrevented = false) => {
			const before = messages.length;
			handleWheel(upcastPartial<WheelEvent>({
				deltaX, deltaY, deltaMode: 0, deltaZ: 0, detail: 0, type: 'wheel', defaultPrevented,
				composedPath: () => [target, body, scrollingElement, document, view],
				preventDefault: () => { },
			}), contain);
			return messages.length > before;
		};

		const shortPreview = forwards(body, 0, 40);
		scrollingElement = element(100, 500);
		const documentAtEdges = [0, 200, 400].map(scrollTop => {
			scrollingElement.scrollTop = scrollTop;
			return [forwards(body, 0, -40), forwards(body, 0, 40)];
		});
		const ordinaryWebview = forwards(body, 0, 40, false);
		scrollingElement = element();
		const verticalPane = element(100, 500, 'hidden', 'auto');
		const horizontalPane = element(500, 100, 'auto', 'hidden');
		const nestedVertical = forwards(verticalPane, 0, 40);
		verticalPane.scrollTop = 400;
		const nestedAtBoundary = forwards(verticalPane, 0, 40);
		const nestedHorizontal = forwards(horizontalPane, 40, 0);
		const orthogonalGesture = forwards(horizontalPane, 0, 40);
		const hiddenOverflow = forwards(element(500, 500, 'hidden', 'clip'), 40, 40);
		const alreadyHandled = forwards(body, 0, 40, true, true);
		scrollingElement = element(100, 500);
		styles.set(body, { overflowX: 'visible', overflowY: 'hidden' });
		const rootWithHiddenBody = forwards(body, 0, 40);

		assert.deepStrictEqual({
			shortPreview, documentAtEdges, ordinaryWebview, nestedVertical, nestedAtBoundary,
			nestedHorizontal, orthogonalGesture, hiddenOverflow, alreadyHandled, rootWithHiddenBody,
		}, {
			shortPreview: true, documentAtEdges: [[false, false], [false, false], [false, false]], ordinaryWebview: true,
			nestedVertical: false, nestedAtBoundary: false, nestedHorizontal: false, orthogonalGesture: true,
			hiddenOverflow: true, alreadyHandled: false, rootWithHiddenBody: true,
		});
	});

	test('normalizes contained wheel axes and cancels native drift only when delegating', () => {
		const cases = [
			{ platform: 'MacIntel', deltaX: 1, deltaY: 40, shiftKey: false, contain: true },
			{ platform: 'MacIntel', deltaX: -1, deltaY: -40, shiftKey: false, contain: true },
			{ platform: 'MacIntel', deltaX: 40, deltaY: 1, shiftKey: false, contain: true },
			{ platform: 'Win32', deltaX: 0, deltaY: 40, shiftKey: true, contain: true },
			{ platform: 'Linux x86_64', deltaX: 0, deltaY: -40, shiftKey: true, contain: true },
			{ platform: 'MacIntel', deltaX: 0, deltaY: 40, shiftKey: true, contain: true },
			{ platform: 'Win32', deltaX: 1, deltaY: 40, shiftKey: true, contain: true },
			{ platform: 'MacIntel', deltaX: 1, deltaY: 40, shiftKey: false, contain: false },
		];
		const results = cases.map(testCase => {
			const messages: Pick<WheelEvent, 'deltaX' | 'deltaY'>[] = [];
			let prevented = false;
			const document = upcastPartial<Document>({
				defaultView: upcastPartial<NonNullable<Document['defaultView']>>({
					getComputedStyle: () => upcastPartial<CSSStyleDeclaration>({ overflowX: 'auto', overflowY: 'auto' }),
				}),
			});
			const pane = upcastPartial<HTMLElement>({
				nodeType: 1, ownerDocument: document,
				clientWidth: 100, scrollWidth: 500, clientHeight: 100, scrollHeight: 100,
			});
			createWheelHandler(messages, testCase.platform)(upcastPartial<WheelEvent>({
				...testCase,
				composedPath: () => [pane, document],
				preventDefault: () => { prevented = true; },
			}), testCase.contain);
			return { messages, prevented };
		});
		assert.deepStrictEqual(results, [
			{ messages: [{ deltaX: 0, deltaY: 40 }], prevented: true },
			{ messages: [{ deltaX: 0, deltaY: -40 }], prevented: true },
			{ messages: [], prevented: false },
			{ messages: [], prevented: false },
			{ messages: [], prevented: false },
			{ messages: [{ deltaX: 0, deltaY: 40 }], prevented: true },
			{ messages: [{ deltaX: 0, deltaY: 40 }], prevented: true },
			{ messages: [{ deltaX: 1, deltaY: 40 }], prevented: false },
		]);
	});

	test('reports horizontal scrollbar height separately from intrinsic content height', () => {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
		const reporter = html.match(/const postSize = \(\) => \{[\s\S]*?\r?\n\t+\};/)?.[0];
		assert.ok(reporter);
		const sizes: { width: number; height: number; horizontalScrollbarHeight?: number }[] = [];
		for (const clientHeight of [124, 140]) {
			new Function('docEl', 'contentWindow', 'hostMessaging', `${reporter}\npostSize();`)(
				{ offsetWidth: 440, offsetHeight: 140, clientHeight },
				{ innerHeight: 140 },
				{ postMessage: (_channel: string, data: typeof sizes[number]) => sizes.push(data) },
			);
		}
		assert.deepStrictEqual(sizes, [
			{ width: 440, height: 140, horizontalScrollbarHeight: 16 },
			{ width: 440, height: 140, horizontalScrollbarHeight: 0 },
		]);
	});

	for (const command of ['copy', 'cut', 'paste']) {
		for (const activeRoot of ['body', 'documentElement'] as const) {
			test(`preserves the document selection for ${command} with ${activeRoot} focused`, () => {
				const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
				const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
				const html = readFileSync(join(sourceDir, '../../browser/pre/index.html'), 'utf8');
				const commandHandler = html.match(/hostMessaging\.onMessage\('execCommand',[\s\S]*?\r?\n\t{3}\}\);/)?.[0];
				assert.ok(commandHandler);
				const lastFocusedElements = new WeakMap<Document, HTMLElement>();
				const body = upcastPartial<HTMLElement>({});
				const documentElement = upcastPartial<HTMLElement>({});
				let activeElement: Element = activeRoot === 'body' ? body : documentElement;
				let selectedText = 'Selected webview response';
				const calls: { command: string; selectedText: string }[] = [];
				const contentDocument = upcastPartial<Document>({
					body,
					documentElement,
					get activeElement() { return activeElement; },
					getSelection: () => upcastPartial<Selection>({
						rangeCount: 1,
						isCollapsed: !selectedText,
					}),
					execCommand: command => {
						calls.push({ command, selectedText });
						return true;
					},
				});
				const textarea = upcastPartial<HTMLElement>({
					isConnected: true,
					ownerDocument: contentDocument,
					focus: () => {
						activeElement = textarea;
						selectedText = '';
					},
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
				execute(undefined, command);

				assert.deepStrictEqual(calls, [{ command, selectedText: 'Selected webview response' }]);
			});
		}
	}

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
