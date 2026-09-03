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
import { IBrowserViewWorkbenchCreateOptions, IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { OpenBrowserTool } from '../../../electron-browser/tools/openBrowserTool.js';
import { BrowserEditorInput } from '../../../common/browserEditorInput.js';
import { BrowserViewStorageScope, IBrowserViewEditorOpenOptions } from '../../../../../../platform/browserView/common/browserView.js';
import { IToolInvocation, ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

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
			upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }),
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

	test('creates agent-owned pages through the workbench before summarizing', async () => {
		let createOptions: IBrowserViewWorkbenchCreateOptions | undefined;
		let editorOpenOptions: IBrowserViewEditorOpenOptions | undefined;
		let summaryArguments: readonly [string, string, string, number] | undefined;
		const input = upcastPartial<BrowserEditorInput>({ id: 'page-id' });
		const tool = new OpenBrowserTool(
			upcastPartial<IPlaywrightService>({
				waitForPageAndGetSummary: async (...args) => {
					summaryArguments = args;
					return 'Page summary';
				}
			}),
			upcastPartial<IEditorService>({}),
			upcastPartial<IBrowserViewWorkbenchService>({
				willUseRemoteProxy: () => true,
				createBrowserView: async (options, openOptions) => {
					createOptions = options;
					editorOpenOptions = openOptions;
					return input;
				}
			}),
			upcastPartial<IRemoteExplorerService>({}),
			upcastPartial<AgentNetworkFilterService>({}),
			upcastPartial<IChatService>({}),
			new TestConfigurationService(),
			upcastPartial<ILogService>({}),
			upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }),
		);

		await tool.invoke(
			upcastPartial<IToolInvocation>({
				parameters: { url: 'https://example.com', forceNew: true },
				context: { sessionResource: URI.parse('chat:session') }
			}),
			async () => 0,
			upcastPartial<ToolProgress>({ report: () => { } }),
			CancellationToken.None
		);

		assert.deepStrictEqual({ createOptions, editorOpenOptions, summaryArguments }, {
			createOptions: {
				owner: { type: 'agent', sessionId: 'chat:session' },
				initialAudiences: [{ type: 'agent' }],
				session: {
					scope: BrowserViewStorageScope.Agent,
					affinity: 'chat:session'
				},
				initialUrl: 'https://example.com',
				openSource: 'cdpCreated'
			},
			editorOpenOptions: { preserveFocus: true },
			summaryArguments: ['chat:session', 'page-id', 'https://example.com', 5000]
		});
	});
});
