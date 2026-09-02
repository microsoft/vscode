/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { errorResult, getBrowserPagesContext, invokeFunctionResultToToolResult } from '../../../electron-browser/tools/browserToolHelpers.js';

suite('browserToolHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a failed invocation reports the failure and names it in the completed state', () => {
		const result = invokeFunctionResultToToolResult({ error: 'No browser page found', summary: 'Screenshot failed' });

		assert.strictEqual(result.toolResultError, 'No browser page found');
		assert.ok(result.toolResultMessage, 'a failed call must not reuse the present-tense invocation message');
	});

	test('an empty error message still reports a failure', () => {
		// `throw ''` and `new Error()` both produce one, and a falsy check would
		// report the call as successful.
		const result = invokeFunctionResultToToolResult({ error: '', summary: 'Screenshot failed' });

		assert.ok(result.toolResultError, 'an empty error message is still a failure');
		assert.ok(result.toolResultMessage);
	});

	test('a successful invocation reports neither', () => {
		const result = invokeFunctionResultToToolResult({ result: 'ok', summary: 'Captured screenshot' });

		assert.strictEqual(result.toolResultError, undefined);
		assert.strictEqual(result.toolResultMessage, undefined);
	});

	test('errorResult reports the failure and names it', () => {
		const result = errorResult('No page ID provided.');

		assert.strictEqual(result.toolResultError, 'No page ID provided.');
		assert.ok(result.toolResultMessage);
	});

	test('browser context explains active network filtering', () => {
		const editorService = upcastPartial<IEditorService>({
			activeEditor: undefined,
			visibleEditors: [],
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			getContextualBrowserViews: () => new Map(),
		});

		const enabled = getBrowserPagesContext(editorService, browserViewService, upcastPartial<IAgentNetworkFilterService>({
			isEnabled: () => true,
		}));
		const disabled = getBrowserPagesContext(editorService, browserViewService, upcastPartial<IAgentNetworkFilterService>({
			isEnabled: () => false,
		}));

		assert.deepStrictEqual({
			enabled,
			disabled,
		}, {
			enabled: 'No browser pages are currently shared with you.\n\nNetwork domain policy is active. Blocked requests may fail with `net::ERR_BLOCKED_BY_CLIENT`.',
			disabled: undefined,
		});
	});
});
