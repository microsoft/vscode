/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FromWebviewMessage, WebviewWindowDragEvent } from '../../browser/webviewMessages.js';

suite('Webview window drag relay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createRelay() {
		const response = await fetch(FileAccess.asFileUri('vs/workbench/contrib/webview/browser/pre/index.html').toString(true));
		const html = await response.text();
		const start = html.indexOf('// #region Window drag forwarding');
		const end = html.indexOf('// #endregion Window drag forwarding', start);
		assert.ok(start !== -1 && end > start);
		let receive: ((_event: undefined, data: WebviewWindowDragEvent) => void) | undefined;
		const feedback: FromWebviewMessage['did-window-drag'][] = [];
		const first = document.createElement('div');
		const second = document.createElement('div');
		let target: Element | null = first;
		const contentDocument = upcastPartial<Document>({ elementFromPoint: () => target });
		new Function('hostMessaging', 'getActiveFrame', html.slice(start, end))({
			onMessage: (_channel: string, handler: typeof receive) => { receive = handler; },
			postMessage: (_channel: string, data: FromWebviewMessage['did-window-drag']) => feedback.push(data),
		}, () => ({ contentDocument }));
		assert.ok(receive);
		const send = (type: WebviewWindowDragEvent['type'], data: WebviewWindowDragEvent['data'] = [['resourceurls', '']], id = 1) => receive!(undefined, {
			id, type, clientX: 10, clientY: 20,
			shiftKey: true, altKey: false, ctrlKey: false, metaKey: false,
			data, effectAllowed: 'copyMove', dropEffect: 'copy',
		});
		return { first, second, feedback, send, setTarget: (element: Element | null) => { target = element; } };
	}

	test('preserves transfer metadata and reports the target drop effect', async () => {
		const { first, feedback, send } = await createRelay();
		const observations: { type: string; value: string; allowed: string; effect: string; shift: boolean }[] = [];
		for (const type of ['dragenter', 'dragover', 'drop']) {
			store.add(addDisposableListener(first, type, (event: DragEvent) => {
				observations.push({ type, value: event.dataTransfer!.getData('resourceurls'), allowed: event.dataTransfer!.effectAllowed, effect: event.dataTransfer!.dropEffect, shift: event.shiftKey });
				event.preventDefault();
				event.dataTransfer!.dropEffect = 'copy';
			}));
		}
		send('dragover');
		send('drop', [['resourceurls', '["file:///project/file.txt"]']]);
		assert.deepStrictEqual({ observations, feedback }, {
			observations: [
				{ type: 'dragenter', value: '', allowed: 'copyMove', effect: 'copy', shift: true },
				{ type: 'dragover', value: '', allowed: 'copyMove', effect: 'copy', shift: true },
				{ type: 'drop', value: '["file:///project/file.txt"]', allowed: 'copyMove', effect: 'copy', shift: true },
			],
			feedback: [{ id: 1, dropEffect: 'copy' }, { id: 1, dropEffect: 'copy' }],
		});
	});

	test('re-evaluates the target drop effect after rejection', async () => {
		const { first, second, feedback, send, setTarget } = await createRelay();
		store.add(addDisposableListener(first, 'dragover', (event: DragEvent) => {
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'none';
		}));
		store.add(addDisposableListener(second, 'dragover', event => event.preventDefault()));
		send('dragover');
		setTarget(second);
		send('dragover');
		setTarget(first);
		send('dragover');
		assert.deepStrictEqual(feedback, [
			{ id: 1, dropEffect: 'none' }, { id: 1, dropEffect: 'copy' }, { id: 1, dropEffect: 'none' },
		]);
	});

	test('suppresses a queued drop after the target rejects its hover', async () => {
		const { first, feedback, send } = await createRelay();
		const drops: string[] = [];
		store.add(addDisposableListener(first, 'dragover', (event: DragEvent) => {
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'none';
		}));
		store.add(addDisposableListener(first, 'drop', () => drops.push('drop')));
		send('dragover');
		// The host may queue the drop before receiving the rejection feedback.
		send('drop', [['resourceurls', '["file:///project/file.txt"]']]);
		assert.deepStrictEqual({ drops, feedback }, {
			drops: [], feedback: [{ id: 1, dropEffect: 'none' }, { id: 1, dropEffect: 'none' }],
		});
	});

	for (const change of ['target', 'drag', 'leave', 'drop'] as const) {
		test(`does not reuse acceptance after a ${change} change`, async () => {
			const { first, second, send, setTarget } = await createRelay();
			const drops: string[] = [];
			const exposedOnLeave: string[] = [];
			for (const element of [first, second]) {
				store.add(addDisposableListener(element, 'dragover', event => event.preventDefault()));
				store.add(addDisposableListener(element, 'drop', () => drops.push('drop')));
				store.add(addDisposableListener(element, 'dragleave', (event: DragEvent) => exposedOnLeave.push(event.dataTransfer!.getData('resourceurls'))));
			}
			send('dragover');
			if (change === 'target') {
				setTarget(second);
			} else if (change === 'leave') {
				send('dragleave');
			} else if (change === 'drop') {
				send('drop');
				drops.length = 0;
			}
			send('drop', [['resourceurls', '["file:///project/file.txt"]']], change === 'drag' ? 2 : 1);
			assert.deepStrictEqual({ drops, exposedOnLeave }, {
				drops: [], exposedOnLeave: change === 'drop' ? [] : [''],
			});
		});
	}

	test('balances enter and leave events and resets after drops and cancellation', async () => {
		const { first, second, setTarget, send } = await createRelay();
		const events: string[] = [];
		for (const [name, element] of [['first', first], ['second', second]] as const) {
			for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
				store.add(addDisposableListener(element, type, event => { event.preventDefault(); events.push(`${name}:${type}`); }));
			}
		}
		send('dragover');
		setTarget(second);
		send('dragover');
		send('drop');
		send('dragover');
		send('dragleave');
		send('dragover');
		assert.deepStrictEqual(events, [
			'first:dragenter', 'first:dragover', 'second:dragenter', 'first:dragleave', 'second:dragover', 'second:drop',
			'second:dragenter', 'second:dragover', 'second:dragleave', 'second:dragenter', 'second:dragover',
		]);
	});
});
