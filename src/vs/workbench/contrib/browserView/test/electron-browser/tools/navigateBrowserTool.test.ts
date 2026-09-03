/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPlaywrightService } from '../../../../../../platform/browserView/common/playwrightService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { IRemoteExplorerService } from '../../../../../services/remote/common/remoteExplorerService.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { NavigateBrowserTool } from '../../../electron-browser/tools/navigateBrowserTool.js';

suite('NavigateBrowserTool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks reported parser-differential authorities before navigating a browser page', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const tool = new NavigateBrowserTool(
			upcastPartial<IPlaywrightService>({}),
			networkFilterService,
			upcastPartial<IBrowserViewWorkbenchService>({}),
			upcastPartial<IRemoteExplorerService>({}),
		);
		const urls = [
			'http://a@b@127.0.0.1:3000/private',
			'http://a%40b@127.0.0.1:3000/private',
			'http://[::1]:3000/private',
			'http://[::ffff:127.0.0.1]:3000/private',
			'https://evil.com%2fx/',
			'https://evil.com%5c/',
		];
		const blocked = await Promise.all(urls.map(async url => {
			try {
				await tool.prepareToolInvocation({
					parameters: { pageId: 'test-page', type: 'url', url },
					toolCallId: 'test-tool-call',
					chatSessionResource: undefined,
				}, CancellationToken.None);
				return false;
			} catch {
				return true;
			}
		}));

		assert.deepStrictEqual(blocked, urls.map(() => true));
	});
});
