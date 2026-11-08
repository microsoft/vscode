/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAgentNetworkFilterService, AgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { BrowserEditorInput } from '../../../common/browserEditorInput.js';
import { errorResult, getBrowserPagesContext, formatBrowserEditorList, invokeFunctionResultToToolResult } from '../../../electron-browser/tools/browserToolHelpers.js';

suite('browserToolHelpers - failure reporting', () => {
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

	test('errorResult with an empty message still reports a failure', () => {
		// `throw ''` and `new Error()` both reach here as an empty string.
		const result = errorResult('');

		assert.ok(result.toolResultError, 'an empty error message is still a failure');
		assert.ok(result.content.some(part => part.kind === 'text' && part.value), 'the model needs a non-empty reason');
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

suite('BrowserToolHelpers', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('masks reported parser-differential authorities blocked by network policy', () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const urls = [
			'http://a@b@127.0.0.1:3000/private',
			'http://a%40b@127.0.0.1:3000/private',
			'http://[::1]:3000/private',
			'http://[::ffff:127.0.0.1]:3000/private',
			'https://evil.com%2fx/',
			'https://evil.com%5c/',
		];
		const editors = urls.map((url, index) => upcastPartial<BrowserEditorInput>({
			id: `page-${index}`,
			title: 'Private page',
			url,
		}));
		const editorService = upcastPartial<IEditorService>({
			activeEditor: undefined,
			visibleEditors: [],
		});

		assert.strictEqual(
			formatBrowserEditorList(editorService, editors, { agentNetworkFilterService: networkFilterService }),
			urls.map((_, index) => `- [page-${index}] Blocked by network domain policy (not visible)`).join('\n')
		);
	});
});
