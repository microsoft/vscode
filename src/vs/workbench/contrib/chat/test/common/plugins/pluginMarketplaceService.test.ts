/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { MarketplaceReferenceKind, MarketplaceType, PluginMarketplaceService, PluginSourceKind, getPluginSourceLabel, parseMarketplaceReference, parseMarketplaceReferences, parsePluginSource } from '../../../common/plugins/pluginMarketplaceService.js';
import { IWorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';

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
		assert.strictEqual(parsed.githubRepo, 'microsoft/vscode');
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
		assert.strictEqual(parsed.githubRepo, undefined);
	});

	test('populates githubRepo for GitHub HTTPS URLs', () => {
		const withGit = parseMarketplaceReference('https://github.com/owner/repo.git');
		assert.ok(withGit);
		assert.strictEqual(withGit?.githubRepo, 'owner/repo');

		const withoutGit = parseMarketplaceReference('https://github.com/owner/repo');
		assert.ok(withoutGit);
		assert.strictEqual(withoutGit?.githubRepo, 'owner/repo');
	});

	test('populates githubRepo for GitHub SCP-style URLs', () => {
		const parsed = parseMarketplaceReference('git@github.com:owner/repo.git');
		assert.ok(parsed);
		assert.strictEqual(parsed?.githubRepo, 'owner/repo');
	});

	test('does not populate githubRepo for non-GitHub URLs', () => {
		const https = parseMarketplaceReference('https://example.com/org/repo.git');
		assert.ok(https);
		assert.strictEqual(https?.githubRepo, undefined);

		const scp = parseMarketplaceReference('git@gitlab.com:org/repo.git');
		assert.ok(scp);
		assert.strictEqual(scp?.githubRepo, undefined);
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

	test('accepts HTTPS and SSH marketplace entries without .git suffix', () => {
		const https = parseMarketplaceReference('https://example.com/org/repo');
		assert.ok(https);
		assert.strictEqual(https?.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(https?.canonicalId, 'git:example.com/org/repo.git');
		assert.deepStrictEqual(https?.cacheSegments, ['example.com', 'org', 'repo']);

		const ssh = parseMarketplaceReference('ssh://git@example.com/org/repo');
		assert.ok(ssh);
		assert.strictEqual(ssh?.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(ssh?.canonicalId, 'git:git@example.com/org/repo.git');

		// SCP-style (git@host:path) still requires .git because the colon-path syntax is
		// unambiguous only for traditional git SSH URLs where .git is conventional.
		assert.strictEqual(parseMarketplaceReference('git@example.com:org/repo'), undefined);
	});

	test('parses Azure DevOps HTTPS clone URLs without .git suffix', () => {
		const parsed = parseMarketplaceReference('https://dev.azure.com/org/project/_git/repo');
		assert.ok(parsed);
		assert.strictEqual(parsed?.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(parsed?.cloneUrl, 'https://dev.azure.com/org/project/_git/repo');
		assert.strictEqual(parsed?.canonicalId, 'git:dev.azure.com/org/project/_git/repo.git');
		assert.deepStrictEqual(parsed?.cacheSegments, ['dev.azure.com', 'org', 'project', '_git', 'repo']);
	});

	test('deduplicates Azure DevOps URLs with and without .git suffix', () => {
		const parsed = parseMarketplaceReferences([
			'https://dev.azure.com/org/project/_git/repo',
			'https://dev.azure.com/org/project/_git/repo.git',
		]);
		assert.strictEqual(parsed.length, 1);
		assert.strictEqual(parsed[0].canonicalId, 'git:dev.azure.com/org/project/_git/repo.git');
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

	const marketplaceRef = parseMarketplaceReference('microsoft/plugins')!;

	function createService(): PluginMarketplaceService {
		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: ['microsoft/plugins'],
			[ChatConfiguration.PluginsEnabled]: true,
		}));
		instantiationService.stub(IFileService, {} as unknown as IFileService);
		instantiationService.stub(IAgentPluginRepositoryService, {} as unknown as IAgentPluginRepositoryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRequestService, {} as unknown as IRequestService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IWorkspacePluginSettingsService, {
			extraMarketplaces: observableValue('test.extraMarketplaces', []),
			enabledPlugins: observableValue('test.enabledPlugins', new Map()),
		} as Partial<IWorkspacePluginSettingsService> as IWorkspacePluginSettingsService);
		instantiationService.stub(IWorkspaceTrustManagementService, {
			isWorkspaceTrusted: () => true,
			onDidChangeTrust: Event.None,
		} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService);

		return store.add(instantiationService.createInstance(PluginMarketplaceService));
	}

	test('returns metadata for an installed plugin', () => {
		const service = createService();
		const pluginUri = URI.file('/cache/agentPlugins/my-plugin');
		const plugin = {
			name: 'my-plugin',
			description: 'A test plugin',
			version: '2.0.0',
			source: 'plugins/my-plugin',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/my-plugin' } as const,
			marketplace: marketplaceRef.displayLabel,
			marketplaceReference: marketplaceRef,
			marketplaceType: MarketplaceType.Copilot,
		};

		service.addInstalledPlugin(pluginUri, plugin);
		const result = service.getMarketplacePluginMetadata(pluginUri);

		assert.deepStrictEqual(result, plugin);
	});

	test('returns undefined for a URI that is not installed', () => {
		const service = createService();
		const result = service.getMarketplacePluginMetadata(URI.file('/some/other/path'));
		assert.strictEqual(result, undefined);
	});

	test('returns undefined when no plugins are installed', () => {
		const service = createService();
		const result = service.getMarketplacePluginMetadata(URI.file('/any/path'));
		assert.strictEqual(result, undefined);
	});
});

suite('parsePluginSource', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const logContext = {
		pluginName: 'test',
		logService: new NullLogService(),
		logPrefix: '[test]',
	};

	test('parses string source as RelativePath', () => {
		const result = parsePluginSource('./my-plugin', undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: 'my-plugin' });
	});

	test('parses string source with pluginRoot', () => {
		const result = parsePluginSource('sub', 'plugins', logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: 'plugins/sub' });
	});

	test('parses undefined source as RelativePath using pluginRoot', () => {
		const result = parsePluginSource(undefined, 'root', logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: 'root' });
	});

	test('parses empty string source as RelativePath using pluginRoot', () => {
		const result = parsePluginSource('', 'base', logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: 'base' });
	});

	test('returns base dir for empty source without pluginRoot', () => {
		assert.deepStrictEqual(parsePluginSource('', undefined, logContext), { kind: PluginSourceKind.RelativePath, path: '' });
	});

	test('returns base dir for undefined source without pluginRoot', () => {
		assert.deepStrictEqual(parsePluginSource(undefined, undefined, logContext), { kind: PluginSourceKind.RelativePath, path: '' });
	});

	test('parses github object source', () => {
		const result = parsePluginSource({ source: 'github', repo: 'owner/repo' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: undefined, sha: undefined, path: undefined });
	});

	test('parses github object source with ref and sha', () => {
		const result = parsePluginSource({ source: 'github', repo: 'owner/repo', ref: 'v2.0.0', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'v2.0.0', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', path: undefined });
	});

	test('parses github object source with path', () => {
		const result = parsePluginSource({ source: 'github', repo: 'owner/repo', path: 'plugins/my-plugin' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: undefined, sha: undefined, path: 'plugins/my-plugin' });
	});

	test('returns undefined for github source missing repo', () => {
		assert.strictEqual(parsePluginSource({ source: 'github' }, undefined, logContext), undefined);
	});

	test('returns undefined for github source with invalid repo format', () => {
		assert.strictEqual(parsePluginSource({ source: 'github', repo: 'owner' }, undefined, logContext), undefined);
	});

	test('returns undefined for github source with invalid sha', () => {
		assert.strictEqual(parsePluginSource({ source: 'github', repo: 'owner/repo', sha: 'abc123' }, undefined, logContext), undefined);
	});

	test('returns undefined for github source with non-string path', () => {
		assert.strictEqual(parsePluginSource({ source: 'github', repo: 'owner/repo', path: 42 } as never, undefined, logContext), undefined);
	});

	test('parses url object source', () => {
		const result = parsePluginSource({ source: 'url', url: 'https://gitlab.com/team/plugin.git' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: 'https://gitlab.com/team/plugin.git', ref: undefined, sha: undefined });
	});

	test('returns undefined for url source missing url field', () => {
		assert.strictEqual(parsePluginSource({ source: 'url' }, undefined, logContext), undefined);
	});

	test('returns undefined for url source not ending in .git', () => {
		assert.strictEqual(parsePluginSource({ source: 'url', url: 'https://gitlab.com/team/plugin' }, undefined, logContext), undefined);
	});

	test('parses npm object source', () => {
		const result = parsePluginSource({ source: 'npm', package: '@acme/claude-plugin' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.Npm, package: '@acme/claude-plugin', version: undefined, registry: undefined });
	});

	test('parses npm object source with version and registry', () => {
		const result = parsePluginSource({ source: 'npm', package: '@acme/claude-plugin', version: '2.1.0', registry: 'https://npm.example.com' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.Npm, package: '@acme/claude-plugin', version: '2.1.0', registry: 'https://npm.example.com' });
	});

	test('returns undefined for npm source missing package', () => {
		assert.strictEqual(parsePluginSource({ source: 'npm' }, undefined, logContext), undefined);
	});

	test('returns undefined for npm source with non-string version', () => {
		assert.strictEqual(parsePluginSource({ source: 'npm', package: '@acme/claude-plugin', version: 123 } as never, undefined, logContext), undefined);
	});

	test('parses pip object source', () => {
		const result = parsePluginSource({ source: 'pip', package: 'my-plugin' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.Pip, package: 'my-plugin', version: undefined, registry: undefined });
	});

	test('parses pip object source with version and registry', () => {
		const result = parsePluginSource({ source: 'pip', package: 'my-plugin', version: '1.0.0', registry: 'https://pypi.example.com' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.Pip, package: 'my-plugin', version: '1.0.0', registry: 'https://pypi.example.com' });
	});

	test('returns undefined for pip source missing package', () => {
		assert.strictEqual(parsePluginSource({ source: 'pip' }, undefined, logContext), undefined);
	});

	test('returns undefined for pip source with non-string registry', () => {
		assert.strictEqual(parsePluginSource({ source: 'pip', package: 'my-plugin', registry: 42 } as never, undefined, logContext), undefined);
	});

	test('returns undefined for unknown source kind', () => {
		assert.strictEqual(parsePluginSource({ source: 'unknown' }, undefined, logContext), undefined);
	});

	test('returns undefined for object source without source discriminant', () => {
		assert.strictEqual(parsePluginSource({ package: 'test' } as never, undefined, logContext), undefined);
	});
});

suite('getPluginSourceLabel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats relative path', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.RelativePath, path: 'plugins/foo' }), 'plugins/foo');
	});

	test('formats empty relative path', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.RelativePath, path: '' }), '.');
	});

	test('formats github source', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitHub, repo: 'owner/repo' }), 'owner/repo');
	});

	test('formats github source with path', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitHub, repo: 'owner/repo', path: 'plugins/foo' }), 'owner/repo/plugins/foo');
	});

	test('formats url source', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git' }), 'https://example.com/repo.git');
	});

	test('formats npm source without version', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Npm, package: '@acme/plugin' }), '@acme/plugin');
	});

	test('formats npm source with version', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Npm, package: '@acme/plugin', version: '1.0.0' }), '@acme/plugin@1.0.0');
	});

	test('formats pip source without version', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Pip, package: 'my-plugin' }), 'my-plugin');
	});

	test('formats pip source with version', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Pip, package: 'my-plugin', version: '2.0' }), 'my-plugin==2.0');
	});
});
