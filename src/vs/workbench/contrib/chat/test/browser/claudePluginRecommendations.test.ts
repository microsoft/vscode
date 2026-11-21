/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, NoOpNotification, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { AgentPluginRecommendations } from '../../browser/claudePluginRecommendations.js';
import { IChatRequestSubmittedEvent, IChatService } from '../../common/chatService/chatService.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IMarketplaceInstalledPlugin, IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';

suite('AgentPluginRecommendations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const marketplaceReference = parseMarketplaceReference('owner/marketplace')!;
	const marketplacePlugin: IMarketplacePlugin = {
		name: 'test',
		description: '',
		version: '',
		source: './test',
		sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: './test' },
		marketplace: 'workspace-alias',
		marketplaceName: 'catalog',
		marketplaceReference,
		marketplaceType: MarketplaceType.Copilot,
	};

	function cliPlugin(name = 'test', marketplace = 'catalog'): IAgentPlugin {
		return new class extends mock<IAgentPlugin>() {
			override readonly copilotCliInstallation = { name, marketplace };
			override readonly enablement = observableValue('enablement', ContributionEnablementState.DisabledProfile);
		}();
	}

	async function recommendations(plugins: readonly IAgentPlugin[], installed: readonly IMarketplaceInstalledPlugin[] = [], cached = true): Promise<NotificationMessage[]> {
		const services = store.add(new TestInstantiationService());
		const submitted = store.add(new Emitter<IChatRequestSubmittedEvent>());
		const messages: NotificationMessage[] = [];
		services.stub(IChatService, { onDidSubmitRequest: submitted.event });
		services.stub(IAgentPluginService, { plugins: observableValue('plugins', plugins) });
		services.stub(IPluginMarketplaceService, {
			recommendedPlugins: observableValue('recommended', new Set(['test@workspace-alias', 'unknown@workspace-alias'])),
			installedPlugins: observableValue('installed', installed),
			lastFetchedPlugins: observableValue('fetched', cached ? [marketplacePlugin] : []),
			fetchMarketplacePlugins: async () => [marketplacePlugin],
		});
		services.stub(INotificationService, {
			prompt: (_severity, message) => {
				messages.push(message);
				return new NoOpNotification();
			},
		});
		services.stub(IExtensionsWorkbenchService, {});
		store.add(services.createInstance(AgentPluginRecommendations));
		submitted.fire({ chatSessionResource: URI.parse('test:session') });
		await Promise.resolve();
		submitted.fire({ chatSessionResource: URI.parse('test:session') });
		return messages;
	}

	test('does not recommend a CLI installation, including disabled plugins and marketplace aliases', async () => {
		assert.deepStrictEqual(await recommendations([cliPlugin()]), []);
	});

	test('recognizes CLI installations after fetching uncached marketplace metadata', async () => {
		assert.deepStrictEqual(await recommendations([cliPlugin()], [], false), []);
	});

	test('does not mistake another plugin or marketplace for an installation', async () => {
		assert.deepStrictEqual(await recommendations([cliPlugin('another'), cliPlugin('test', 'another')]), [
			'This workspace recommends 1 agent plugin.',
		]);
	});

	test('does not mistake a workspace alias for a different CLI marketplace identity', async () => {
		assert.deepStrictEqual(await recommendations([cliPlugin('test', 'workspace-alias')]), [
			'This workspace recommends 1 agent plugin.',
		]);
	});

	test('continues to recognize marketplace installs before discovery', async () => {
		assert.deepStrictEqual(await recommendations([], [{ plugin: marketplacePlugin, pluginUri: URI.file('/plugins/test') }]), []);
	});
});
