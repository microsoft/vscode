/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostPluginMarketplaceProvider } from '../../../browser/agentSessions/agentHost/agentHostPluginMarketplaceProvider.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';

suite('AgentHostPluginMarketplaceProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('vscode-chat-session://local/session');
	const snapshot = {
		plugins: [{ name: 'plugin', marketplace: 'managed', source: 'plugin@managed', installed: false }],
		failures: [],
	};

	test('preserves undefined when no live session marketplace is available', async () => {
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override getPluginMarketplaceSnapshot(): Promise<undefined> {
				return Promise.resolve(undefined);
			}
		}();
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(service));

		assert.strictEqual(await provider.getSnapshot(session, CancellationToken.None), undefined);
	});

	test('fires after successful refresh and install', async () => {
		const service = new class extends mock<IAgentHostCustomizationService>() {
			override refreshPluginMarketplaces() {
				return Promise.resolve(snapshot);
			}
			override installPlugin() {
				return Promise.resolve({});
			}
		}();
		const provider = disposables.add(new AgentHostPluginMarketplaceProvider(service));
		let changes = 0;
		disposables.add(provider.onDidChange(() => changes++));

		const refreshResult = await provider.refresh(session, CancellationToken.None);
		const installResult = await provider.install(session, 'plugin@managed');

		assert.deepStrictEqual({ refreshResult, installResult, changes }, {
			refreshResult: snapshot,
			installResult: {},
			changes: 2,
		});
	});
});
