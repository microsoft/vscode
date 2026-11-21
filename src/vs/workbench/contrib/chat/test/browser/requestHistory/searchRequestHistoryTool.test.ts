/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { MAX_SEARCH_RESULT_REQUEST_LENGTH, SearchRequestHistoryTool } from '../../../browser/requestHistory/searchRequestHistoryTool.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ChatRequestHistoryService } from '../../../common/requestHistory/chatRequestHistoryService.js';
import { IToolResult } from '../../../common/tools/languageModelToolsService.js';

suite('SearchRequestHistoryTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('returns matching requests newest first with links to their turns, and nothing while the history is off', async () => {
		const configuration = new TestConfigurationService();
		const history = store.add(new ChatRequestHistoryService(store.add(new InMemoryStorageService()), configuration));
		const link = (turn: string) => buildOpenSessionLinkUri(URI.parse('copilotcli:/session-1'), undefined, turn, 'devbox');
		history.record({ prompt: 'Profile the parser', timestamp: Date.UTC(2026, 0, 1), link: link('turn-1'), chatResource: 'remote-devbox-copilotcli:/session-1', title: 'Parser', host: 'Dev Box' });
		history.record({ prompt: `Parser ${'x'.repeat(MAX_SEARCH_RESULT_REQUEST_LENGTH)}`, timestamp: Date.UTC(2026, 0, 2), link: link('turn-2'), chatResource: 'remote-devbox-copilotcli:/session-1' });
		history.record({ prompt: 'Unrelated', timestamp: Date.UTC(2026, 0, 3), link: link('turn-3'), chatResource: 'remote-devbox-copilotcli:/session-1' });
		const tool = new SearchRequestHistoryTool(history);
		const invoke = async (parameters: object) => {
			const result: IToolResult = await tool.invoke({ callId: 'search', toolId: tool.getToolData().id, parameters, context: undefined }, async () => 0, { report: () => { } }, CancellationToken.None);
			const value = result.content[0];
			return result.toolResultError ?? (value.kind === 'text' ? JSON.parse(value.value) : undefined);
		};

		const found = await invoke({ query: 'parser', limit: 5 });
		const since = await invoke({ since: '2026-01-02T12:00:00Z' });
		const invalid = await invoke({ limit: 0 });
		await configuration.setUserConfiguration(ChatConfiguration.RequestHistoryEnabled, false);
		const off = await invoke({});

		assert.deepStrictEqual({ found, since, invalid, off }, {
			found: {
				results: [
					{ request: `Parser ${'x'.repeat(MAX_SEARCH_RESULT_REQUEST_LENGTH - 'Parser '.length)}`, truncated: true, sentAt: '2026-01-02T00:00:00.000Z', openLink: link('turn-2') },
					{ request: 'Profile the parser', sentAt: '2026-01-01T00:00:00.000Z', chat: 'Parser', host: 'Dev Box', openLink: link('turn-1') },
				],
			},
			since: { results: [{ request: 'Unrelated', sentAt: '2026-01-03T00:00:00.000Z', openLink: link('turn-3') }] },
			invalid: 'limit must be an integer from 1 to 50.',
			off: 'Request history is turned off.',
		});
	});
});
