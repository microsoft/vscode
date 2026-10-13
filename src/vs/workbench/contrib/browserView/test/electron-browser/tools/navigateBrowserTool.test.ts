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
import { Tunnel, TunnelModel } from '../../../../../services/remote/common/tunnelModel.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { NavigateBrowserTool } from '../../../electron-browser/tools/navigateBrowserTool.js';
import { IToolInvocation, ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { URI } from '../../../../../../base/common/uri.js';

function createRemoteExplorerService(localUri: string): IRemoteExplorerService {
	return upcastPartial<IRemoteExplorerService>({
		tunnelModel: upcastPartial<TunnelModel>({
			forwarded: new Map([
				['localhost:3000', upcastPartial<Tunnel>({ localUri: URI.parse(localUri) })],
			]),
			detected: new Map(),
		}),
	});
}

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

	test('normalizes reported parser-differential URLs before filtering and navigating', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['evil.example']);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const navigationUrls: (string | undefined)[] = [];
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			getKnownBrowserViews: () => new Map(),
			willUseRemoteProxy: () => true,
		});
		const tool = new NavigateBrowserTool(
			upcastPartial<IPlaywrightService>({
				invokeFunction: async (_sessionId, _pageId, _fnDef, args) => {
					navigationUrls.push(typeof args?.[0] === 'string' ? args[0] : undefined);
					return { summary: '' };
				},
			}),
			networkFilterService,
			browserViewService,
			upcastPartial<IRemoteExplorerService>({}),
		);
		const urls = [
			String.raw`http:\\\\evil.example/x`,
			String.raw`http:/\\/\\evil.example/x`,
			String.raw`http:\\/evil.example/x`,
			String.raw`http:\\evil.example/x`,
			String.raw`https:\\evil.example/x`,
		];
		const expectedUrls = [
			'http://evil.example/x',
			'http://evil.example/x',
			'http://evil.example/x',
			'http://evil.example/x',
			'https://evil.example/x',
		];
		const parameters = urls.map(url => ({ pageId: 'test-page', type: 'url', url }));

		for (const parameter of parameters) {
			await tool.prepareToolInvocation({
				parameters: parameter,
				toolCallId: 'test-tool-call',
				chatSessionResource: undefined,
			}, CancellationToken.None);
			await tool.invoke(
				upcastPartial<IToolInvocation>({ parameters: parameter }),
				async () => 0,
				upcastPartial<ToolProgress>({ report: () => { } }),
				CancellationToken.None,
			);
		}

		assert.deepStrictEqual({
			preparedUrls: parameters.map(parameter => parameter.url),
			navigationUrls,
		}, {
			preparedUrls: expectedUrls,
			navigationUrls: expectedUrls,
		});
	});

	test('blocks an external forwarded destination before invoking Playwright', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['localhost']);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		let invocationCount = 0;
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			getKnownBrowserViews: () => new Map(),
			willUseRemoteProxy: () => false,
		});
		const tool = new NavigateBrowserTool(
			upcastPartial<IPlaywrightService>({
				invokeFunction: async () => {
					invocationCount++;
					return { summary: '' };
				},
			}),
			networkFilterService,
			browserViewService,
			createRemoteExplorerService('https://blocked-tunnel.example'),
		);
		const parameters = { pageId: 'test-page', type: 'url', url: 'http://localhost:3000/private' };

		await tool.prepareToolInvocation({
			parameters,
			toolCallId: 'test-tool-call',
			chatSessionResource: undefined,
		}, CancellationToken.None);
		const result = await tool.invoke(
			upcastPartial<IToolInvocation>({ parameters }),
			async () => 0,
			upcastPartial<ToolProgress>({ report: () => { } }),
			CancellationToken.None,
		);

		assert.deepStrictEqual({
			invocationCount,
			error: result.toolResultError,
		}, {
			invocationCount: 0,
			error: networkFilterService.formatError(URI.parse('https://blocked-tunnel.example/private')),
		});
	});

	test('allows a loopback forwarded destination as tunnel transport', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['localhost']);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const navigationUrls: (string | undefined)[] = [];
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			getKnownBrowserViews: () => new Map(),
			willUseRemoteProxy: () => false,
		});
		const tool = new NavigateBrowserTool(
			upcastPartial<IPlaywrightService>({
				invokeFunction: async (_sessionId, _pageId, _fnDef, args) => {
					navigationUrls.push(typeof args?.[0] === 'string' ? args[0] : undefined);
					return { summary: '' };
				},
			}),
			networkFilterService,
			browserViewService,
			createRemoteExplorerService('http://127.0.0.1:4000'),
		);
		const parameters = { pageId: 'test-page', type: 'url', url: 'http://localhost:3000/private' };

		await tool.prepareToolInvocation({
			parameters,
			toolCallId: 'test-tool-call',
			chatSessionResource: undefined,
		}, CancellationToken.None);
		await tool.invoke(
			upcastPartial<IToolInvocation>({ parameters }),
			async () => 0,
			upcastPartial<ToolProgress>({ report: () => { } }),
			CancellationToken.None,
		);

		assert.deepStrictEqual(navigationUrls, ['http://127.0.0.1:4000/private']);
	});

	test('rechecks network policy immediately before navigation', async () => {
		let allowed = true;
		let invocationCount = 0;
		const networkFilterService = upcastPartial<AgentNetworkFilterService>({
			isUriAllowed: () => allowed,
			formatError: uri => `Blocked ${uri.authority}`,
		});
		const tool = new NavigateBrowserTool(
			upcastPartial<IPlaywrightService>({
				invokeFunction: async () => {
					invocationCount++;
					return { summary: '' };
				},
			}),
			networkFilterService,
			upcastPartial<IBrowserViewWorkbenchService>({
				getKnownBrowserViews: () => new Map(),
				willUseRemoteProxy: () => true,
			}),
			upcastPartial<IRemoteExplorerService>({}),
		);
		const parameters = { pageId: 'test-page', type: 'url', url: 'https://example.com/private' };

		await tool.prepareToolInvocation({
			parameters,
			toolCallId: 'test-tool-call',
			chatSessionResource: undefined,
		}, CancellationToken.None);
		allowed = false;
		const result = await tool.invoke(
			upcastPartial<IToolInvocation>({ parameters }),
			async () => 0,
			upcastPartial<ToolProgress>({ report: () => { } }),
			CancellationToken.None,
		);

		assert.deepStrictEqual({
			invocationCount,
			error: result.toolResultError,
		}, {
			invocationCount: 0,
			error: 'Blocked example.com',
		});
	});
});
