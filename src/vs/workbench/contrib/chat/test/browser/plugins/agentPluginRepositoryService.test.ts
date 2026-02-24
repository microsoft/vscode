/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AgentPluginRepositoryService } from '../../../browser/agentPluginRepositoryService.js';
import { IMarketplacePlugin, MarketplaceType, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';

suite('AgentPluginRepositoryService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPlugin(marketplace: string, source: string): IMarketplacePlugin {
		const marketplaceReference = parseMarketplaceReference(marketplace);
		assert.ok(marketplaceReference);
		if (!marketplaceReference) {
			throw new Error('Expected marketplace reference to parse.');
		}

		return {
			name: 'test-plugin',
			description: '',
			version: '',
			source,
			marketplace: marketplaceReference.displayLabel,
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function createService(
		onExists?: (resource: URI) => Promise<boolean>,
		onExecuteCommand?: (id: string) => void,
	): AgentPluginRepositoryService {
		const instantiationService = store.add(new TestInstantiationService());

		const fileService = {
			exists: async (resource: URI) => onExists ? onExists(resource) : true,
		} as unknown as IFileService;

		const progressService = {
			withProgress: async (_options: unknown, callback: (...args: unknown[]) => Promise<unknown>) => callback(),
		} as unknown as IProgressService;

		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string) => {
				onExecuteCommand?.(id);
				return undefined;
			},
		} as unknown as ICommandService);
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { notify: () => undefined } as unknown as INotificationService);
		instantiationService.stub(IProgressService, progressService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));

		return instantiationService.createInstance(AgentPluginRepositoryService);
	}

	test('uses cacheSegments path for GitHub shorthand plugin references', () => {
		const service = createService();
		const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
		const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);

		assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
	});

	test('uses marketplaces cache path for direct git URI plugin references', () => {
		const service = createService();
		const plugin = createPlugin('https://example.com/org/repo.git', 'plugins/myPlugin');
		const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);

		assert.strictEqual(uri.path, '/cache/agentPlugins/example.com/org/repo');
	});

	test('uses same cache path for equivalent GitHub shorthand and URI references', () => {
		const service = createService();
		const shorthandPlugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
		const uriPlugin = createPlugin('https://github.com/microsoft/vscode.git', 'plugins/myPlugin');

		const shorthandUri = service.getRepositoryUri(shorthandPlugin.marketplaceReference, shorthandPlugin.marketplaceType);
		const uriRefUri = service.getRepositoryUri(uriPlugin.marketplaceReference, uriPlugin.marketplaceType);

		assert.strictEqual(shorthandUri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
		assert.strictEqual(uriRefUri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
	});

	test('ensures plugin repositories via cacheSegments path', async () => {
		let checkedPath: string | undefined;
		const service = createService(async resource => {
			checkedPath = resource.path;
			return true;
		});
		const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
		const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });

		assert.strictEqual(checkedPath, '/cache/agentPlugins/github.com/microsoft/vscode');
		assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
	});

	test('builds install URI from source inside repository root', () => {
		const service = createService();
		const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
		const uri = service.getPluginInstallUri(plugin);

		assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin');
	});

	test('uses indexed repository URI when available', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('chat.plugins.marketplaces.index.v1', JSON.stringify({
			'github:microsoft/vscode': {
				repositoryUri: URI.file('/cache/agentPlugins/indexed/microsoft/vscode'),
				marketplaceType: MarketplaceType.Copilot,
			},
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICommandService, { executeCommand: async () => undefined } as unknown as ICommandService);
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
		instantiationService.stub(IFileService, { exists: async () => true } as unknown as IFileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { notify: () => undefined } as unknown as INotificationService);
		instantiationService.stub(IProgressService, { withProgress: async (_options: unknown, callback: (...args: unknown[]) => Promise<unknown>) => callback() } as unknown as IProgressService);
		instantiationService.stub(IStorageService, storage);

		const service = instantiationService.createInstance(AgentPluginRepositoryService);
		const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
		const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);

		assert.strictEqual(uri.path, '/cache/agentPlugins/indexed/microsoft/vscode');
	});

	test('rejects plugin source paths that escape repository root', () => {
		const service = createService();
		const plugin = createPlugin('microsoft/vscode', '../outside');

		assert.throws(() => service.getPluginInstallUri(plugin));
	});

	test('uses local repository URI for file marketplace references', () => {
		const service = createService();
		const plugin = createPlugin('file:///tmp/marketplace-repo', 'plugins/myPlugin');
		const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);

		assert.strictEqual(uri.scheme, 'file');
		assert.strictEqual(uri.path, '/tmp/marketplace-repo');
	});

	test('does not invoke clone command when ensuring existing local file repository', async () => {
		let commandInvocationCount = 0;
		const service = createService(async () => true, () => {
			commandInvocationCount++;
		});
		const plugin = createPlugin('file:///tmp/marketplace-repo', 'plugins/myPlugin');

		const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });

		assert.strictEqual(uri.path, '/tmp/marketplace-repo');
		assert.strictEqual(commandInvocationCount, 0);
	});
});
