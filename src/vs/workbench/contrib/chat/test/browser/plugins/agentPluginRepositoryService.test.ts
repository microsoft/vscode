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
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { AgentPluginRepositoryService } from '../../../browser/agentPluginRepositoryService.js';
import { IMarketplacePlugin, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { IPluginGitService } from '../../../common/plugins/pluginGitService.js';

suite('AgentPluginRepositoryService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function stubPluginGit(overrides?: Partial<IPluginGitService>): IPluginGitService {
		return {
			_serviceBrand: undefined,
			cloneRepository: async () => { },
			pull: async () => false,
			checkout: async () => { },
			revParse: async () => '',
			fetch: async () => { },
			fetchRepository: async () => { },
			revListCount: async () => 0,
			...overrides,
		} as IPluginGitService;
	}

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
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: source },
			marketplace: marketplaceReference.displayLabel,
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function createService(
		onExists?: (resource: URI) => Promise<boolean>,
		onExecuteCommand?: (id: string, ...args: unknown[]) => void,
		pluginGitStub?: Partial<IPluginGitService>,
	): AgentPluginRepositoryService {
		const instantiationService = store.add(new TestInstantiationService());

		const fileService = {
			exists: async (resource: URI) => onExists ? onExists(resource) : true,
		} as unknown as IFileService;

		const progressService = {
			withProgress: async (_options: unknown, callback: (...args: unknown[]) => Promise<unknown>) => callback(),
		} as unknown as IProgressService;

		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string, ...args: unknown[]) => {
				onExecuteCommand?.(id, ...args);
				return undefined;
			},
		} as unknown as ICommandService);
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
		instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file('/cache/agentPlugins') } } as unknown as IUserDataProfileService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { notify: () => undefined } as unknown as INotificationService);
		instantiationService.stub(IPluginGitService, stubPluginGit({
			...pluginGitStub,
		}));
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

	test('concurrent ensureRepository calls for the same marketplace clone only once', async () => {
		let cloneCount = 0;
		const instantiationService = store.add(new TestInstantiationService());

		// Track whether the repo exists (set to true after the first clone completes)
		let repoExists = false;
		const fileService = {
			exists: async (_resource: URI) => repoExists,
			createFolder: async () => undefined,
		} as unknown as IFileService;

		const progressService = {
			withProgress: async (_options: unknown, callback: (...args: unknown[]) => Promise<unknown>) => callback(),
		} as unknown as IProgressService;

		instantiationService.stub(ICommandService, {
			executeCommand: async () => undefined,
		} as unknown as ICommandService);
		instantiationService.stub(IPluginGitService, stubPluginGit({
			cloneRepository: async () => {
				cloneCount++;
				// Simulate async clone by yielding, then mark repo as existing
				await new Promise<void>(r => setTimeout(r, 0));
				repoExists = true;
			},
		}));
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
		instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file('/cache/agentPlugins') } } as unknown as IUserDataProfileService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { notify: () => undefined } as unknown as INotificationService);
		instantiationService.stub(IProgressService, progressService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));

		const service = instantiationService.createInstance(AgentPluginRepositoryService);
		const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');

		// Fire two concurrent ensureRepository calls for the same marketplace
		const [uri1, uri2] = await Promise.all([
			service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType }),
			service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType }),
		]);

		assert.strictEqual(cloneCount, 1);
		assert.strictEqual(uri1.path, '/cache/agentPlugins/github.com/microsoft/vscode');
		assert.strictEqual(uri2.path, '/cache/agentPlugins/github.com/microsoft/vscode');
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
		instantiationService.stub(IPluginGitService, stubPluginGit());
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
		instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file('/cache/agentPlugins') } } as unknown as IUserDataProfileService);
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

	test('builds revision-aware install URI for github plugin sources', () => {
		const service = createService();
		const uri = service.getPluginSourceInstallUri({
			kind: PluginSourceKind.GitHub,
			repo: 'owner/repo',
			ref: 'release/v1',
		});

		assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/owner/repo/ref_release_v1');
	});

	test('updates git plugin source by pulling and checking out requested revision', async () => {
		const calls: string[] = [];
		const service = createService(async () => true, undefined, {
			revParse: async () => { calls.push('revParse'); return ''; },
			fetch: async () => { calls.push('fetch'); },
			checkout: async () => { calls.push('checkout'); },
			pull: async () => { calls.push('pull'); return false; },
		});

		await service.updatePluginSource({
			name: 'my-plugin',
			description: '',
			version: '',
			source: '',
			sourceDescriptor: {
				kind: PluginSourceKind.GitHub,
				repo: 'owner/repo',
				sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
			},
			marketplace: 'owner/repo',
			marketplaceReference: parseMarketplaceReference('owner/repo')!,
			marketplaceType: MarketplaceType.Copilot,
		}, {
			pluginName: 'my-plugin',
			failureLabel: 'my-plugin',
			marketplaceType: MarketplaceType.Copilot,
		});

		assert.deepStrictEqual(calls, ['revParse', 'fetch', 'checkout', 'revParse']);
	});

	// =========================================================================
	// cleanupPluginSource — issue #297251 regression
	// =========================================================================

	suite('cleanupPluginSource', () => {

		function createServiceWithDel(
			onDel: (resource: URI) => void,
			options?: { resolve?: (resource: URI) => { children?: unknown[] } },
		) {
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ICommandService, { executeCommand: async () => undefined } as unknown as ICommandService);
			instantiationService.stub(IPluginGitService, stubPluginGit());
			instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
			instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file('/cache/agentPlugins') } } as unknown as IUserDataProfileService);
			instantiationService.stub(IFileService, {
				exists: async () => true,
				del: async (resource: URI) => { onDel(resource); },
				createFolder: async () => undefined,
				resolve: async (resource: URI) => options?.resolve?.(resource) ?? { children: [] },
			} as unknown as IFileService);
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(INotificationService, { notify: () => undefined } as unknown as INotificationService);
			instantiationService.stub(IProgressService, { withProgress: async (_o: unknown, cb: (...a: unknown[]) => Promise<unknown>) => cb() } as unknown as IProgressService);
			instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
			return instantiationService.createInstance(AgentPluginRepositoryService);
		}

		test('does not delete files for relative-path (marketplace) plugin', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource({
				name: 'marketplace-plugin',
				description: '',
				version: '',
				source: 'plugins/foo',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/foo' },
				marketplace: 'microsoft/vscode',
				marketplaceReference: parseMarketplaceReference('microsoft/vscode')!,
				marketplaceType: MarketplaceType.Copilot,
			});

			assert.strictEqual(deleted.length, 0);
		});

		test('deletes cache for github plugin source', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource({
				name: 'gh-plugin',
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
				marketplace: 'owner/marketplace',
				marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
				marketplaceType: MarketplaceType.Copilot,
			});

			assert.ok(deleted.length >= 1);
			assert.ok(deleted[0].includes('github.com/owner/repo'));
		});

		test('deletes parent cache dir for npm plugin source', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource({
				name: 'npm-plugin',
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: '@acme/plugin' },
				marketplace: 'owner/marketplace',
				marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
				marketplaceType: MarketplaceType.Copilot,
			});

			assert.ok(deleted.length >= 1);
			// First delete should be the npm/<sanitized-package> cache dir
			assert.ok(deleted[0].includes('/npm/'), `Expected npm path, got: ${deleted[0]}`);
		});

		test('deletes cache for pip plugin source', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource({
				name: 'pip-plugin',
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pip-pkg' },
				marketplace: 'owner/marketplace',
				marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
				marketplaceType: MarketplaceType.Copilot,
			});

			assert.ok(deleted.length >= 1);
			assert.ok(deleted[0].includes('pip/my-pip-pkg'));
		});

		test('does not throw when delete fails', async () => {
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ICommandService, { executeCommand: async () => undefined } as unknown as ICommandService);
			instantiationService.stub(IPluginGitService, stubPluginGit());
			instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as unknown as IEnvironmentService);
			instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file('/cache/agentPlugins') } } as unknown as IUserDataProfileService);
			instantiationService.stub(IFileService, {
				exists: async () => true,
				del: async () => { throw new Error('permission denied'); },
				createFolder: async () => undefined,
				resolve: async () => ({ children: [] }),
			} as unknown as IFileService);
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(INotificationService, { notify: () => undefined } as unknown as INotificationService);
			instantiationService.stub(IProgressService, { withProgress: async (_o: unknown, cb: (...a: unknown[]) => Promise<unknown>) => cb() } as unknown as IProgressService);
			instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
			const service = instantiationService.createInstance(AgentPluginRepositoryService);

			// Should not throw — cleanup is best-effort
			await service.cleanupPluginSource({
				name: 'gh-plugin',
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
				marketplace: 'owner/marketplace',
				marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
				marketplaceType: MarketplaceType.Copilot,
			});
		});

		test('prunes empty parent directories up to cache root', async () => {
			// After deleting github.com/owner/repo, the "owner" dir is empty
			// and should also be removed.
			const deleted: string[] = [];
			const service = createServiceWithDel(
				r => deleted.push(r.path),
				{ resolve: () => ({ children: [] }) },
			);

			await service.cleanupPluginSource({
				name: 'gh-plugin',
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
				marketplace: 'owner/marketplace',
				marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
				marketplaceType: MarketplaceType.Copilot,
			});

			// Should have deleted the repo dir + empty parents (owner, github.com)
			assert.ok(deleted.length >= 2, `Expected at least 2 deletions (repo + parent), got ${deleted.length}: ${deleted.join(', ')}`);
			assert.ok(deleted[0].includes('github.com/owner/repo'), 'First delete should be the repo dir');
			assert.ok(deleted.some(p => p.endsWith('/owner')), 'Should prune empty owner directory');
		});

		test('stops pruning at non-empty parent', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(
				r => deleted.push(r.path),
				{
					resolve: (resource: URI) => {
						// owner dir still has another repo
						if (resource.path.endsWith('/owner')) {
							return { children: [{ name: 'other-repo' }] };
						}
						return { children: [] };
					},
				},
			);

			await service.cleanupPluginSource({
				name: 'gh-plugin',
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
				marketplace: 'owner/marketplace',
				marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
				marketplaceType: MarketplaceType.Copilot,
			});

			// Should only delete the repo dir, stop at non-empty owner dir
			assert.strictEqual(deleted.length, 1);
			assert.ok(deleted[0].includes('github.com/owner/repo'));
		});

		test('skips deletion when another installed plugin shares the same cleanup target', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource(
				{
					name: 'plugin-a',
					description: '',
					version: '',
					source: '',
					sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', path: 'plugins/a' },
					marketplace: 'owner/marketplace',
					marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
					marketplaceType: MarketplaceType.Copilot,
				},
				// Another plugin from the same repo still installed
				[{ kind: PluginSourceKind.GitHub, repo: 'owner/repo', path: 'plugins/b' }],
			);

			assert.strictEqual(deleted.length, 0);
		});

		test('proceeds with deletion when no other plugin shares the cleanup target', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource(
				{
					name: 'plugin-a',
					description: '',
					version: '',
					source: '',
					sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', path: 'plugins/a' },
					marketplace: 'owner/marketplace',
					marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
					marketplaceType: MarketplaceType.Copilot,
				},
				// Only unrelated plugins remain
				[{ kind: PluginSourceKind.GitHub, repo: 'other-owner/other-repo' }],
			);

			assert.ok(deleted.length >= 1);
			assert.ok(deleted[0].includes('github.com/owner/repo'));
		});

		test('proceeds with deletion when otherInstalledDescriptors is empty', async () => {
			const deleted: string[] = [];
			const service = createServiceWithDel(r => deleted.push(r.path));

			await service.cleanupPluginSource(
				{
					name: 'plugin-a',
					description: '',
					version: '',
					source: '',
					sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
					marketplace: 'owner/marketplace',
					marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
					marketplaceType: MarketplaceType.Copilot,
				},
				[],
			);

			assert.ok(deleted.length >= 1);
			assert.ok(deleted[0].includes('github.com/owner/repo'));
		});
	});
});
