/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { INativeWindowConfiguration } from '../../../window/common/window.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService, OpenContext } from '../../../windows/electron-main/windows.js';
import { IOnboardingTryoutWindowRequest } from '../../common/onboardingTryoutHandoff.js';
import { OnboardingTryoutHandoff } from '../../electron-main/onboardingTryoutHandoff.js';

class TestCodeWindow extends mock<ICodeWindow>() {
	override readonly id = 7;
	override readonly config = upcastPartial<INativeWindowConfiguration>({ isSessionsWindow: true });
	readonly requests: { readonly channel: string; readonly token: CancellationToken; readonly args: readonly unknown[] }[] = [];
	focusCount = 0;

	override focus(): void { this.focusCount++; }

	override sendWhenReady(channel: string, token: CancellationToken, ...args: unknown[]): void {
		this.requests.push({ channel, token, args });
	}
}

suite('OnboardingTryoutHandoff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request: IOnboardingTryoutWindowRequest = { requestId: '01234567-89ab-4cde-8fab-0123456789ab', tryoutId: 'test.agentsExample', source: 'releaseNotes' };
	const newerRequest: IOnboardingTryoutWindowRequest = { requestId: '11234567-89ab-4cde-8fab-0123456789ab', tryoutId: 'test.newerExample', source: 'externalLink' };

	function createHandoff(openAgentsWindow: IWindowsMainService['openAgentsWindow']) {
		return store.add(new OnboardingTryoutHandoff(
			upcastPartial<IWindowsMainService>({ openAgentsWindow }),
			upcastPartial<IEnvironmentMainService>({ args: { _: [] } }),
		));
	}

	test('opens through the existing window service and delivers only an ephemeral request', async () => {
		const window = new TestCodeWindow();
		const calls: Parameters<IWindowsMainService['openAgentsWindow']>[] = [];
		const handoff = createHandoff(async (...args) => { calls.push(args); return [window]; });
		const pending = handoff.open(42, request);
		await timeout(0);
		await handoff.complete(window.id, request.requestId, 'accepted');

		assert.deepStrictEqual({
			calls,
			requests: window.requests.map(({ channel, args }) => ({ channel, args })),
			focusCount: window.focusCount,
			configuration: window.config,
			result: await pending,
		}, {
			calls: [[{ context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }]],
			requests: [{ channel: 'vscode:runOnboardingTryout', args: [request] }],
			focusCount: 1,
			configuration: { isSessionsWindow: true },
			result: 'accepted',
		});
	});

	for (const windowCount of [0, 2]) {
		test(`rejects ${windowCount} destination windows without focusing or delivering`, async () => {
			const windows = Array.from({ length: windowCount }, () => new TestCodeWindow());
			const handoff = createHandoff(async () => windows);
			await assert.rejects(handoff.open(42, request), /could not be sent/);
			assert.deepStrictEqual(windows.map(window => ({ requests: window.requests, focus: window.focusCount })), windows.map(() => ({ requests: [], focus: 0 })));
		});
	}

	test('cancellation while opening suppresses late delivery', async () => {
		const window = new TestCodeWindow();
		const opening = new DeferredPromise<ICodeWindow[]>();
		const handoff = createHandoff(async () => opening.p);
		const pending = handoff.open(42, request);
		await handoff.cancel(42, request.requestId);
		const result = await pending;
		await opening.complete([window]);
		assert.deepStrictEqual({ result, requests: window.requests, focus: window.focusCount }, { result: 'cancelled', requests: [], focus: 0 });
	});

	test('only the source may cancel and only the destination may acknowledge', async () => {
		const window = new TestCodeWindow();
		const handoff = createHandoff(async () => [window]);
		const pending = DeferredPromise.fromPromise(handoff.open(42, request));
		await timeout(0);
		await handoff.cancel(43, request.requestId);
		await handoff.complete(window.id + 1, request.requestId, 'accepted');
		const settledByWrongWindow = pending.isSettled;
		await handoff.complete(window.id, request.requestId, 'rejected');
		assert.deepStrictEqual({ settledByWrongWindow, result: await pending.p }, { settledByWrongWindow: false, result: 'rejected' });
	});

	test('a delayed older open cannot supersede a newer accepted request', async () => {
		const window = new TestCodeWindow();
		const firstWindow = new DeferredPromise<ICodeWindow[]>();
		const handoff = createHandoff(async config => config.contextWindowId === 42 ? firstWindow.p : [window]);
		const older = handoff.open(42, request);
		const newer = handoff.open(43, newerRequest);
		await timeout(0);
		await handoff.complete(window.id, newerRequest.requestId, 'accepted');
		await firstWindow.complete([window]);
		assert.deepStrictEqual({
			results: [await older, await newer],
			delivered: window.requests.map(({ args }) => args),
			focusCount: window.focusCount,
		}, { results: ['superseded', 'accepted'], delivered: [[newerRequest]], focusCount: 1 });
	});

	test('supersession cancels queued delivery and disposal cancels the remaining request', async () => {
		const window = new TestCodeWindow();
		const handoff = createHandoff(async () => [window]);
		const older = handoff.open(42, request);
		await timeout(0);
		const newer = handoff.open(43, newerRequest);
		await timeout(0);
		handoff.dispose();
		assert.deepStrictEqual({
			results: [await older, await newer],
			requests: window.requests.map(({ channel, token, args }) => ({ channel, cancelled: token.isCancellationRequested, args })),
		}, {
			results: ['superseded', 'cancelled'],
			requests: [
				{ channel: 'vscode:runOnboardingTryout', cancelled: true, args: [request] },
				{ channel: 'vscode:cancelOnboardingTryout', cancelled: false, args: [request.requestId] },
				{ channel: 'vscode:runOnboardingTryout', cancelled: true, args: [newerRequest] },
				{ channel: 'vscode:cancelOnboardingTryout', cancelled: false, args: [newerRequest.requestId] },
			],
		});
	});

	test('invalid and disposed requests never open a window', async () => {
		let opened = 0;
		const handoff = createHandoff(async () => { opened++; return []; });
		await assert.rejects(handoff.open(42, { ...request, requestId: 'invalid' }), /invalid/);
		handoff.dispose();
		await assert.rejects(handoff.open(42, request), /invalid/);
		assert.strictEqual(opened, 0);
	});
});
