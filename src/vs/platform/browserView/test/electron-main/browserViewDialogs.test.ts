/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBrowserViewDialogResponse } from '../../common/browserView.js';
import { BrowserViewDialogs } from '../../electron-main/browserViewDialogs.js';

suite('BrowserViewDialogs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const dialog = { type: 'login' as const, origin: 'https://example.com' };

	test('concurrent challenges wait in FIFO order and stale answers do not settle twice', () => {
		const queue = store.add(new BrowserViewDialogs());
		const responses: IBrowserViewDialogResponse[] = [];
		const changes: (string | undefined)[] = [];
		store.add(queue.onDidChangeDialog(request => changes.push(request?.origin)));
		queue.request(dialog, response => responses.push(response));
		const first = queue.pendingDialog!.requestId;
		queue.request({ ...dialog, origin: 'https://second.example.com' }, response => responses.push(response));
		const beforeAnswer = [...changes];
		queue.respond(first, { accept: true, username: 'user', password: 'password' });
		const stale = queue.respond(first, { accept: false });
		queue.respond(queue.pendingDialog!.requestId, { accept: false });
		assert.deepStrictEqual({ beforeAnswer, changes, responses, stale, pending: queue.pendingDialog }, {
			beforeAnswer: ['https://example.com'],
			changes: ['https://example.com', 'https://second.example.com', undefined],
			responses: [{ accept: true, username: 'user', password: 'password' }, { accept: false }],
			stale: false, pending: undefined,
		});
	});

	test('navigation cleanup cancels all challenges and rejects reentrant challenges', () => {
		const queue = store.add(new BrowserViewDialogs());
		const responses: boolean[] = [];
		queue.request(dialog, response => {
			responses.push(response.accept);
			queue.request(dialog, response => responses.push(response.accept));
		});
		queue.request(dialog, response => responses.push(response.accept));
		queue.settleAll();
		queue.request(dialog, () => { });
		assert.deepStrictEqual({ responses, pending: queue.pendingDialog?.origin }, { responses: [false, false, false], pending: 'https://example.com' });
	});

	test('disposal cancels pending and subsequent challenges', () => {
		const queue = store.add(new BrowserViewDialogs());
		const responses: boolean[] = [];
		queue.request(dialog, response => responses.push(response.accept));
		queue.dispose();
		queue.request(dialog, response => responses.push(response.accept));
		assert.deepStrictEqual({ responses, pending: queue.pendingDialog }, { responses: [false, false], pending: undefined });
	});

	test('invalid credentials leave the challenge pending', () => {
		const queue = store.add(new BrowserViewDialogs());
		queue.request(dialog, () => { });
		const pending = queue.pendingDialog!;
		assert.throws(() => queue.respond(pending.requestId, { accept: true }), /Invalid browser authentication response/);
		assert.strictEqual(queue.pendingDialog, pending);
	});

	test('JavaScript dialogs share the FIFO with sign-in and preserve prompt text', () => {
		const queue = store.add(new BrowserViewDialogs());
		const responses: IBrowserViewDialogResponse[] = [];
		const types: (string | undefined)[] = [];
		store.add(queue.onDidChangeDialog(request => types.push(request?.type)));
		for (const type of ['alert', 'confirm', 'prompt', 'login'] as const) {
			queue.request({ type, origin: 'https://example.com', message: type, defaultPrompt: 'initial' }, response => responses.push(response));
		}
		queue.respond(queue.pendingDialog!.requestId, { accept: true });
		queue.respond(queue.pendingDialog!.requestId, { accept: false });
		queue.respond(queue.pendingDialog!.requestId, { accept: true, promptText: 'answer' });
		queue.respond(queue.pendingDialog!.requestId, { accept: false });
		assert.deepStrictEqual({ types, responses }, {
			types: ['alert', 'confirm', 'prompt', 'login', undefined],
			responses: [{ accept: true }, { accept: false }, { accept: true, promptText: 'answer' }, { accept: false }],
		});
	});

	for (const loginFirst of [true, false]) {
		test(`JavaScript dialog cancellation preserves ${loginFirst ? 'active' : 'queued'} sign-in`, () => {
			const queue = store.add(new BrowserViewDialogs());
			const responses: string[] = [];
			const changes: (string | undefined)[] = [];
			store.add(queue.onDidChangeDialog(request => changes.push(request?.type)));
			const types = loginFirst ? ['login', 'alert', 'prompt'] as const : ['alert', 'login', 'prompt'] as const;
			for (const type of types) {
				queue.request({ type, origin: 'https://example.com' }, () => responses.push(type));
			}
			queue.settleJavaScriptDialogs();
			assert.deepStrictEqual({ responses, changes, pending: queue.pendingDialog?.type }, {
				responses: ['alert', 'prompt'], changes: loginFirst ? ['login'] : ['alert', 'login'], pending: 'login',
			});
		});
	}

	test('detached frames are cancelled without presenting their queued prompts', () => {
		const queue = store.add(new BrowserViewDialogs());
		let attached = true;
		const responses: boolean[] = [];
		const types: (string | undefined)[] = [];
		store.add(queue.onDidChangeDialog(request => types.push(request?.type)));
		for (let i = 0; i < 2; i++) {
			queue.request({ type: 'prompt', origin: 'https://frame.example', message: 'Frame prompt' }, response => responses.push(response.accept), () => attached);
		}
		queue.request(dialog, () => { });
		attached = false;
		queue.cancelInvalid();
		assert.deepStrictEqual({ responses, types, pending: queue.pendingDialog?.type }, {
			responses: [false, false], types: ['prompt', 'login'], pending: 'login',
		});
	});
});
