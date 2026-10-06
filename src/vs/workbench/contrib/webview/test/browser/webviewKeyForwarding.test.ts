/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isAcceptedWebviewReady, shouldForwardWebviewKeyEvent } from '../../browser/webviewKeyForwarding.js';

suite('Webview key forwarding', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects key events that did not come from the current shell', () => {
		const shellId = 'shell-key-id';
		const event = {
			keyEventId: shellId,
			isTrusted: true,
		};
		assert.deepStrictEqual([
			shouldForwardWebviewKeyEvent(shellId, event, false),
			shouldForwardWebviewKeyEvent(shellId, { ...event, isTrusted: false }, false),
			shouldForwardWebviewKeyEvent(shellId, { ...event, isTrusted: false }, true),
			shouldForwardWebviewKeyEvent(shellId, { ...event, keyEventId: 'forged' }, false),
			shouldForwardWebviewKeyEvent(undefined, event, false),
			shouldForwardWebviewKeyEvent(shellId, { ...event, keyEventId: '' }, false),
		], [
			true,
			false,
			true,
			false,
			false,
			false,
		]);
	});

	test('rejects webview-ready from another document or mount', () => {
		const contentWindow = {} as Window;
		const accepted = {
			expectedReadyId: 'mount-1',
			readyId: 'mount-1',
			keyEventId: 'shell-key-id',
			source: contentWindow,
			contentWindow,
			hasMessagePort: true,
		};
		assert.deepStrictEqual([
			isAcceptedWebviewReady(accepted),
			isAcceptedWebviewReady({ ...accepted, readyId: 'mount-0' }),
			isAcceptedWebviewReady({ ...accepted, expectedReadyId: undefined }),
			isAcceptedWebviewReady({ ...accepted, keyEventId: '' }),
			isAcceptedWebviewReady({ ...accepted, source: {} as Window }),
			isAcceptedWebviewReady({ ...accepted, contentWindow: null }),
			isAcceptedWebviewReady({ ...accepted, hasMessagePort: false }),
		], [
			true,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});
});
