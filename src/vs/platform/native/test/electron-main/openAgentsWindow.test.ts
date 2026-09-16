/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentsWindowOpenSource, INativeWindowConfiguration } from '../../../window/common/window.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService, OpenContext } from '../../../windows/electron-main/windows.js';
import { IOpenAgentsWindowOptions } from '../../common/native.js';
import { openAgentsWindow } from '../../electron-main/openAgentsWindow.js';

class TestCodeWindow extends mock<ICodeWindow>() {
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
			await open({ tryoutId: 'test.agentsExample' });

			assert.deepStrictEqual({
				calls,
				requests: window.requests,
				focusCount: window.focusCount,
				configuration: window.config,
			}, {
				calls: [[{ context: OpenContext.API, contextWindowId: 42, cli: { _: [] } }, undefined, undefined, undefined, undefined]],
				requests: [{ channel: 'vscode:runOnboardingTryout', token: CancellationToken.None, args: ['test.agentsExample'] }],
				focusCount: 1,
				configuration: { isSessionsWindow: true },
			});
		});
	}

	test('preserves folder, session, source, and inferred-folder forwarding', async () => {
		const window = new TestCodeWindow();
		const { open, calls } = createOpener([window]);
		const folder = URI.file('/workspace');
		const session = URI.parse('test-session:/session');

		await open({
			folderUri: folder.toJSON(),
			sessionResource: session.toJSON(),
			source: AgentsWindowOpenSource.Link,
			folderUriIsDefault: true,
			tryoutId: 'test.agentsExample',
		});

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

			await assert.rejects(open({ tryoutId: 'test.agentsExample' }), /could not be sent to an Agents window/);
			assert.deepStrictEqual(windows.flatMap(window => window.requests), []);
		});
	}
});
