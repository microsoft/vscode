/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { MarketplaceReferenceKind, MarketplaceType, PluginMarketplaceService, parseMarketplaceReference, parseMarketplaceReferences } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginMarketplaceService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses GitHub shorthand marketplace', () => {
		const parsed = parseMarketplaceReference('microsoft/vscode');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
		assert.strictEqual(parsed.cloneUrl, 'https://github.com/microsoft/vscode.git');
		assert.strictEqual(parsed.canonicalId, 'github:microsoft/vscode');
		assert.strictEqual(parsed.displayLabel, 'microsoft/vscode');
		assert.deepStrictEqual(parsed.cacheSegments, ['github.com', 'microsoft', 'vscode']);
	});

	test('parses direct HTTPS and SSH marketplaces ending in .git', () => {
		const https = parseMarketplaceReference('https://example.com/org/repo.git');
		assert.ok(https);
		if (!https) {
			return;
		}
		assert.strictEqual(https.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(https.displayLabel, 'https://example.com/org/repo.git');
		assert.deepStrictEqual(https.cacheSegments, ['example.com', 'org', 'repo']);

		const ssh = parseMarketplaceReference('ssh://git@example.com/org/repo.git');
		assert.ok(ssh);
		if (!ssh) {
			return;
		}
		assert.strictEqual(ssh.kind, MarketplaceReferenceKind.GitUri);
		assert.deepStrictEqual(ssh.cacheSegments, ['git@example.com', 'org', 'repo']);
	});

	test('parses scp-like git URI marketplaces', () => {
		const parsed = parseMarketplaceReference('git@example.com:org/repo.git');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(parsed.cloneUrl, 'git@example.com:org/repo.git');
		assert.strictEqual(parsed.canonicalId, 'git:example.com/org/repo.git');
		assert.deepStrictEqual(parsed.cacheSegments, ['example.com', 'org', 'repo']);
	});

	test('parses local file marketplace references', () => {
		const parsed = parseMarketplaceReference('file:///tmp/marketplace-repo');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.LocalFileUri);
		assert.strictEqual(parsed.localRepositoryUri?.scheme, 'file');
		assert.strictEqual(parsed.cloneUrl, 'file:///tmp/marketplace-repo');
		assert.deepStrictEqual(parsed.cacheSegments, []);
	});

	test('rejects non-shorthand marketplace entries without .git', () => {
		assert.strictEqual(parseMarketplaceReference('https://example.com/org/repo'), undefined);
		assert.strictEqual(parseMarketplaceReference('ssh://git@example.com/org/repo'), undefined);
		assert.strictEqual(parseMarketplaceReference('git@example.com:org/repo'), undefined);
	});

	test('parses HTTPS URI with trailing slash after .git', () => {
		const parsed = parseMarketplaceReference('https://example.com/org/repo.git/');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(parsed.canonicalId, 'git:example.com/org/repo.git');
		assert.deepStrictEqual(parsed.cacheSegments, ['example.com', 'org', 'repo']);
	});

	test('deduplicates equivalent Git URI forms but keeps shorthand distinct', () => {
		const parsed = parseMarketplaceReferences([
			'microsoft/vscode',
			'https://github.com/microsoft/vscode.git',
			'git@github.com:microsoft/vscode.git',
		]);

		assert.deepStrictEqual(parsed.map(r => r.canonicalId), [
			'github:microsoft/vscode',
			'git:github.com/microsoft/vscode.git',
		]);
	});

	test('parseMarketplaceReferences ignores non-string entries', () => {
		const parsed = parseMarketplaceReferences([null, 42, {}, 'microsoft/vscode']);
		assert.strictEqual(parsed.length, 1);
		assert.strictEqual(parsed[0].canonicalId, 'github:microsoft/vscode');
	});
});

suite('PluginMarketplaceService - getMarketplacePluginMetadata', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const repoDir = URI.file('/cache/agentPlugins/github.com/microsoft/plugins');
	const marketplaceRef = parseMarketplaceReference('microsoft/plugins')!;

	function createMarketplaceJson(plugins: object[], metadata?: object): string {
		return JSON.stringify({ metadata, plugins });
	}

	function createService(fileContents: Map<string, string>): PluginMarketplaceService {
		const instantiationService = store.add(new TestInstantiationService());

		const configService = new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: ['microsoft/plugins'],
			[ChatConfiguration.PluginsEnabled]: true,
		});

		const fileService = {
			readFile: async (uri: URI) => {
				const content = fileContents.get(uri.path);
				if (content !== undefined) {
					return { value: VSBuffer.fromString(content) };
				}
				throw new Error('File not found');
			},
		} as unknown as IFileService;

		const repositoryService = {
			getRepositoryUri: () => repoDir,
			getPluginInstallUri: (plugin: { source: string }) => joinPath(repoDir, plugin.source),
		} as unknown as IAgentPluginRepositoryService;

		instantiationService.stub(IConfigurationService, configService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IAgentPluginRepositoryService, repositoryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRequestService, {} as unknown as IRequestService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));

		return instantiationService.createInstance(PluginMarketplaceService);
	}

	test('returns metadata for a plugin that matches by source', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.github/plugin/marketplace.json').path,
			createMarketplaceJson([
				{ name: 'my-plugin', description: 'A test plugin', version: '2.0.0', source: 'plugins/my-plugin' },
			]),
		);

		const service = createService(files);
		const pluginUri = joinPath(repoDir, 'plugins/my-plugin');

		const result = await service.getMarketplacePluginMetadata(pluginUri);

		assert.deepStrictEqual(result && {
			name: result.name,
			description: result.description,
			version: result.version,
			source: result.source,
			marketplace: result.marketplace,
			marketplaceType: result.marketplaceType,
		}, {
			name: 'my-plugin',
			description: 'A test plugin',
			version: '2.0.0',
			source: 'plugins/my-plugin',
			marketplace: marketplaceRef.displayLabel,
			marketplaceType: MarketplaceType.Copilot,
		});
	});

	test('returns undefined for a URI outside all marketplace repos', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.github/plugin/marketplace.json').path,
			createMarketplaceJson([
				{ name: 'my-plugin', version: '1.0.0', source: 'plugins/my-plugin' },
			]),
		);

		const service = createService(files);
		const unrelatedUri = URI.file('/some/other/path');

		const result = await service.getMarketplacePluginMetadata(unrelatedUri);
		assert.strictEqual(result, undefined);
	});

	test('returns undefined when plugin URI is in repo but no source matches', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.github/plugin/marketplace.json').path,
			createMarketplaceJson([
				{ name: 'my-plugin', version: '1.0.0', source: 'plugins/my-plugin' },
			]),
		);

		const service = createService(files);
		const noMatchUri = joinPath(repoDir, 'plugins/other-plugin');

		const result = await service.getMarketplacePluginMetadata(noMatchUri);
		assert.strictEqual(result, undefined);
	});

	test('returns undefined when no marketplace.json files exist', async () => {
		const service = createService(new Map());
		const pluginUri = joinPath(repoDir, 'plugins/my-plugin');

		const result = await service.getMarketplacePluginMetadata(pluginUri);
		assert.strictEqual(result, undefined);
	});

	test('falls back to Claude marketplace.json when Copilot one is missing', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.claude-plugin/marketplace.json').path,
			createMarketplaceJson([
				{ name: 'claude-plugin', version: '3.0.0', source: 'src/claude-plugin' },
			]),
		);

		const service = createService(files);
		const pluginUri = joinPath(repoDir, 'src/claude-plugin');

		const result = await service.getMarketplacePluginMetadata(pluginUri);
		assert.ok(result);
		assert.strictEqual(result!.name, 'claude-plugin');
		assert.strictEqual(result!.marketplaceType, MarketplaceType.Claude);
	});

	test('resolves source relative to pluginRoot metadata', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.github/plugin/marketplace.json').path,
			createMarketplaceJson(
				[{ name: 'nested', version: '1.0.0', source: 'my-plugin' }],
				{ pluginRoot: 'packages' },
			),
		);

		const service = createService(files);
		const pluginUri = joinPath(repoDir, 'packages/my-plugin');

		const result = await service.getMarketplacePluginMetadata(pluginUri);
		assert.ok(result);
		assert.strictEqual(result!.name, 'nested');
		assert.strictEqual(result!.source, 'packages/my-plugin');
	});

	test('selects the correct plugin among multiple entries', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.github/plugin/marketplace.json').path,
			createMarketplaceJson([
				{ name: 'alpha', version: '1.0.0', source: 'plugins/alpha' },
				{ name: 'beta', version: '2.0.0', source: 'plugins/beta' },
				{ name: 'gamma', version: '3.0.0', source: 'plugins/gamma' },
			]),
		);

		const service = createService(files);
		const pluginUri = joinPath(repoDir, 'plugins/beta');

		const result = await service.getMarketplacePluginMetadata(pluginUri);
		assert.ok(result);
		assert.strictEqual(result!.name, 'beta');
		assert.strictEqual(result!.version, '2.0.0');
	});

	test('returns undefined when no marketplaces are configured', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.PluginsEnabled]: true,
		}));
		instantiationService.stub(IFileService, {} as unknown as IFileService);
		instantiationService.stub(IAgentPluginRepositoryService, {} as unknown as IAgentPluginRepositoryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRequestService, {} as unknown as IRequestService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));

		const service = instantiationService.createInstance(PluginMarketplaceService);
		const result = await service.getMarketplacePluginMetadata(URI.file('/any/path'));
		assert.strictEqual(result, undefined);
	});

	test('matches when pluginUri is a subdirectory inside a plugin source', async () => {
		const files = new Map<string, string>();
		files.set(
			joinPath(repoDir, '.github/plugin/marketplace.json').path,
			createMarketplaceJson([
				{ name: 'my-plugin', version: '1.0.0', source: 'plugins/my-plugin' },
			]),
		);

		const service = createService(files);
		const nestedUri = joinPath(repoDir, 'plugins/my-plugin/src/tool.ts');

		const result = await service.getMarketplacePluginMetadata(nestedUri);
		assert.ok(result);
		assert.strictEqual(result!.name, 'my-plugin');
	});
});
