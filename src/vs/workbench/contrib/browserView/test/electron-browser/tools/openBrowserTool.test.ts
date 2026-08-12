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
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { AgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IRemoteExplorerService } from '../../../../../services/remote/common/remoteExplorerService.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { OpenBrowserTool } from '../../../electron-browser/tools/openBrowserTool.js';

suite('OpenBrowserTool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks IPv6 literals before opening a browser page', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const tool = new OpenBrowserTool(
			upcastPartial<IPlaywrightService>({}),
			upcastPartial<IEditorService>({}),
			upcastPartial<IBrowserViewWorkbenchService>({}),
			upcastPartial<IRemoteExplorerService>({}),
			networkFilterService,
			upcastPartial<IChatService>({}),
			configService,
			upcastPartial<ILogService>({}),
		);

		const urls = [
			'http://[::ffff:127.0.0.1]:3000/private',
			'https://[2001:db8::1]/private',
		];
		const blocked = await Promise.all(urls.map(async url => {
			try {
				await tool.prepareToolInvocation({
					parameters: { url },
					toolCallId: 'test-tool-call',
					chatSessionResource: undefined,
				}, CancellationToken.None);
				return false;
			} catch {
				return true;
			}
		}));

		assert.deepStrictEqual(blocked, [true, true]);
	});
});
