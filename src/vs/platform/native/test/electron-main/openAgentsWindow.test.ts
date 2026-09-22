/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentsWindowOpenSource, INativeWindowConfiguration } from '../../../window/common/window.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService, OpenContext } from '../../../windows/electron-main/windows.js';
import { IOnboardingTryoutWindowRequest, IOpenAgentsWindowOptions } from '../../common/native.js';
import { cancelOnboardingTryout, completeOnboardingTryout, openAgentsWindow } from '../../electron-main/openAgentsWindow.js';

class TestCodeWindow extends mock<ICodeWindow>() {
	override readonly id = 7;
	override readonly config = upcastPartial<INativeWindowConfiguration>({ isSessionsWindow: true });
	override isReady = false;
	readonly requests: { readonly channel: string; readonly token: CancellationToken; readonly args: readonly unknown[] }[] = [];
	focusCount = 0;

	override focus(): void {
		this.focusCount++;
	}

	override sendWhenReady(channel: string, token: CancellationToken, ...args: unknown[]): void {
		this.requests.push({ channel, token, args });
	}
}

suite('openAgentsWindow - tryouts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const request: IOnboardingTryoutWindowRequest = {
		requestId: '01234567-89ab-4cde-8fab-0123456789ab',
		tryoutId: 'test.agentsExample',
	};

	function createOpener(windows: ICodeWindow[]) {
		const calls: Parameters<IWindowsMainService['openAgentsWindow']>[] = [];
		const service = upcastPartial<IWindowsMainService>({
			openAgentsWindow: async (...args) => {
				calls.push(args);
				return windows;
			},
		});
		return {
			open: (options?: IOpenAgentsWindowOptions) => openAgentsWindow(service, { context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }, options),
			calls,
		};
	}

	for (const isReady of [false, true]) {
		test(`forwards once to a ${isReady ? 'reused' : 'new'} Agents window without retaining the request`, async () => {
			const window = new TestCodeWindow();
			window.isReady = isReady;
			const { open, calls } = createOpener([window]);
			const pending = open({ tryoutRequest: request });
			await timeout(0);
			completeOnboardingTryout(window.id, request.requestId, 'accepted');
			const result = await pending;

			assert.deepStrictEqual({
				calls,
				requests: window.requests.map(({ channel, token, args }) => ({ channel, cancelled: token.isCancellationRequested, args })),
				focusCount: window.focusCount,
				configuration: window.config,
				result,
			}, {
				calls: [[{ context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }, undefined, undefined, undefined, undefined]],
				requests: [{ channel: 'vscode:runOnboardingTryout', cancelled: false, args: [request] }],
				focusCount: 1,
				configuration: { isSessionsWindow: true },
				result: 'accepted',
			});
		});
	}

	test('preserves folder, session, source, and inferred-folder forwarding', async () => {
		const window = new TestCodeWindow();
		const { open, calls } = createOpener([window]);
		const folder = URI.file('/workspace');
		const session = URI.parse('test-session:/session');

		const pending = open({
			folderUri: folder.toJSON(),
			sessionResource: session.toJSON(),
			source: AgentsWindowOpenSource.Link,
			folderUriIsDefault: true,
			tryoutRequest: request,
		});
		await timeout(0);
		completeOnboardingTryout(window.id, request.requestId, 'accepted');
		await pending;

		assert.deepStrictEqual(calls, [[
			{ context: OpenContext.API, contextWindowId: 42, cli: { _: [] } },
			folder, session, AgentsWindowOpenSource.Link, true,
		]]);
	});

	test('ordinary opens do not send a tryout request', async () => {
		const window = new TestCodeWindow();
		const { open } = createOpener([window]);

		await open();

		assert.deepStrictEqual({ requests: window.requests, focusCount: window.focusCount }, { requests: [], focusCount: 1 });
	});

	for (const windowCount of [0, 2]) {
		test(`does not report a routed request when ${windowCount} destination windows are returned`, async () => {
			const windows = Array.from({ length: windowCount }, () => new TestCodeWindow());
			const { open } = createOpener(windows);

			await assert.rejects(open({ tryoutRequest: request }), /could not be sent to an Agents window/);
			assert.deepStrictEqual(windows.flatMap(window => window.requests), []);
		});
	}

	test('cancellation while the destination is opening suppresses delivery', async () => {
		const window = new TestCodeWindow();
		const windows = new DeferredPromise<ICodeWindow[]>();
		const service = upcastPartial<IWindowsMainService>({
			openAgentsWindow: async () => windows.p,
		});
		const completion = DeferredPromise.fromPromise(openAgentsWindow(service, { context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }, { tryoutRequest: request }));

		cancelOnboardingTryout(42, request.requestId);
		await timeout(0);
		const settledBeforeWindowOpened = completion.isSettled;
		windows.complete([window]);

		assert.deepStrictEqual({
			settledBeforeWindowOpened,
			result: await completion.p,
			requests: window.requests,
		}, {
			settledBeforeWindowOpened: true,
			result: 'cancelled',
			requests: [],
		});
	});

	test('only the destination window can acknowledge a request', async () => {
		const window = new TestCodeWindow();
		const { open } = createOpener([window]);
		const completion = DeferredPromise.fromPromise(open({ tryoutRequest: request }));
		await timeout(0);

		completeOnboardingTryout(window.id + 1, request.requestId, 'accepted');
		await timeout(0);
		const settledAfterWrongWindow = completion.isSettled;
		completeOnboardingTryout(window.id, request.requestId, 'accepted');

		assert.deepStrictEqual({
			settledAfterWrongWindow,
			result: await completion.p,
		}, {
			settledAfterWrongWindow: false,
			result: 'accepted',
		});
	});

	test('a delayed older open from another source cannot supersede a newer accepted request', async () => {
		const window = new TestCodeWindow();
		const firstWindow = new DeferredPromise<ICodeWindow[]>();
		const service = upcastPartial<IWindowsMainService>({
			openAgentsWindow: async config => config.contextWindowId === 42 ? firstWindow.p : [window],
		});
		const newerRequest = { requestId: '11234567-89ab-4cde-8fab-0123456789ab', tryoutId: 'test.newerExample' };
		const older = openAgentsWindow(service, { context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }, { tryoutRequest: request });
		const newer = openAgentsWindow(service, { context: OpenContext.API, contextWindowId: 43, cli: { _: [] } }, { tryoutRequest: newerRequest });
		await timeout(0);
		completeOnboardingTryout(window.id, newerRequest.requestId, 'accepted');
		const newerResult = await newer;
		await firstWindow.complete([window]);

		assert.deepStrictEqual({
			newerResult,
			olderResult: await older,
			delivered: window.requests.map(({ args }) => args),
			focusCount: window.focusCount,
		}, {
			newerResult: 'accepted',
			olderResult: 'superseded',
			delivered: [[newerRequest]],
			focusCount: 1,
		});
	});

	test('a newer source request cancels delivery queued until the destination is ready', async () => {
		const window = new TestCodeWindow();
		const service = upcastPartial<IWindowsMainService>({
			openAgentsWindow: async () => [window],
		});
		const newerRequest = { requestId: '11234567-89ab-4cde-8fab-0123456789ab', tryoutId: 'test.newerExample' };
		const older = openAgentsWindow(service, { context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }, { tryoutRequest: request });
		await timeout(0);
		const newer = openAgentsWindow(service, { context: OpenContext.API, contextWindowId: 43, cli: { _: [] } }, { tryoutRequest: newerRequest });
		await timeout(0);
		completeOnboardingTryout(window.id, newerRequest.requestId, 'accepted');

		assert.deepStrictEqual({
			olderResult: await older,
			newerResult: await newer,
			requests: window.requests.map(({ channel, token, args }) => ({ channel, cancelled: token.isCancellationRequested, args })),
		}, {
			olderResult: 'superseded',
			newerResult: 'accepted',
			requests: [
				{ channel: 'vscode:runOnboardingTryout', cancelled: true, args: [request] },
				{ channel: 'vscode:cancelOnboardingTryout', cancelled: false, args: [request.requestId] },
				{ channel: 'vscode:runOnboardingTryout', cancelled: false, args: [newerRequest] },
			],
		});
	});
});
