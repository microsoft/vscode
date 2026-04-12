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
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { PluginMarketplaceService, getPluginSourceLabel, parseMarketplaceReference, parseMarketplaceReferences, parsePluginSource } from '../../../common/plugins/pluginMarketplaceService.js';
import { IWorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';
suite('PluginMarketplaceService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parses GitHub shorthand marketplace', () => {
        const parsed = parseMarketplaceReference('microsoft/vscode');
        assert.ok(parsed);
        if (!parsed) {
            return;
        }
        assert.strictEqual(parsed.kind, "githubShorthand" /* MarketplaceReferenceKind.GitHubShorthand */);
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
        assert.strictEqual(https.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
        assert.strictEqual(https.displayLabel, 'https://example.com/org/repo.git');
        assert.deepStrictEqual(https.cacheSegments, ['example.com', 'org', 'repo']);
        const ssh = parseMarketplaceReference('ssh://git@example.com/org/repo.git');
        assert.ok(ssh);
        if (!ssh) {
            return;
        }
        assert.strictEqual(ssh.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
        assert.deepStrictEqual(ssh.cacheSegments, ['git@example.com', 'org', 'repo']);
    });
    test('parses scp-like git URI marketplaces', () => {
        const parsed = parseMarketplaceReference('git@example.com:org/repo.git');
        assert.ok(parsed);
        if (!parsed) {
            return;
        }
        assert.strictEqual(parsed.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
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
        assert.strictEqual(parsed.kind, "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */);
        assert.strictEqual(parsed.localRepositoryUri?.scheme, 'file');
        assert.strictEqual(parsed.cloneUrl, 'file:///tmp/marketplace-repo');
        assert.deepStrictEqual(parsed.cacheSegments, []);
    });
    test('accepts HTTPS and SSH marketplace entries without .git suffix', () => {
        const https = parseMarketplaceReference('https://example.com/org/repo');
        assert.ok(https);
        assert.strictEqual(https?.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
        assert.strictEqual(https?.canonicalId, 'git:example.com/org/repo.git');
        assert.deepStrictEqual(https?.cacheSegments, ['example.com', 'org', 'repo']);
        const ssh = parseMarketplaceReference('ssh://git@example.com/org/repo');
        assert.ok(ssh);
        assert.strictEqual(ssh?.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
        assert.strictEqual(ssh?.canonicalId, 'git:git@example.com/org/repo.git');
        // SCP-style (git@host:path) still requires .git because the colon-path syntax is
        // unambiguous only for traditional git SSH URLs where .git is conventional.
        assert.strictEqual(parseMarketplaceReference('git@example.com:org/repo'), undefined);
    });
    test('parses Azure DevOps HTTPS clone URLs without .git suffix', () => {
        const parsed = parseMarketplaceReference('https://dev.azure.com/org/project/_git/repo');
        assert.ok(parsed);
        assert.strictEqual(parsed?.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
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
        assert.strictEqual(parsed.kind, "gitUri" /* MarketplaceReferenceKind.GitUri */);
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
    const marketplaceRef = parseMarketplaceReference('microsoft/plugins');
    function createService() {
        const instantiationService = store.add(new TestInstantiationService());
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            [ChatConfiguration.PluginMarketplaces]: ['microsoft/plugins'],
            [ChatConfiguration.PluginsEnabled]: true,
        }));
        instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') });
        instantiationService.stub(IFileService, {});
        instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file('/agent-plugins') });
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IRequestService, {});
        instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
        instantiationService.stub(IWorkspacePluginSettingsService, {
            extraMarketplaces: observableValue('test.extraMarketplaces', []),
            enabledPlugins: observableValue('test.enabledPlugins', new Map()),
        });
        instantiationService.stub(IWorkspaceTrustManagementService, {
            isWorkspaceTrusted: () => true,
            onDidChangeTrust: Event.None,
        });
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
            sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/my-plugin' },
            marketplace: marketplaceRef.displayLabel,
            marketplaceReference: marketplaceRef,
            marketplaceType: "copilot" /* MarketplaceType.Copilot */,
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
suite('PluginMarketplaceService - installed plugins lifecycle', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const marketplaceRef = parseMarketplaceReference('microsoft/plugins');
    function makePlugin(name, source) {
        return {
            name,
            description: `${name} description`,
            version: '1.0.0',
            source,
            sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: source },
            marketplace: marketplaceRef.displayLabel,
            marketplaceReference: marketplaceRef,
            marketplaceType: "copilot" /* MarketplaceType.Copilot */,
        };
    }
    function createService() {
        const instantiationService = store.add(new TestInstantiationService());
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            [ChatConfiguration.PluginMarketplaces]: ['microsoft/plugins'],
            [ChatConfiguration.PluginsEnabled]: true,
        }));
        instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') });
        instantiationService.stub(IFileService, {});
        instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file('/agent-plugins') });
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IRequestService, {});
        instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
        instantiationService.stub(IWorkspacePluginSettingsService, {
            extraMarketplaces: observableValue('test.extraMarketplaces', []),
            enabledPlugins: observableValue('test.enabledPlugins', new Map()),
        });
        instantiationService.stub(IWorkspaceTrustManagementService, {
            isWorkspaceTrusted: () => true,
            onDidChangeTrust: Event.None,
        });
        return store.add(instantiationService.createInstance(PluginMarketplaceService));
    }
    test('installedPlugins observable is empty with no plugins', () => {
        const service = createService();
        assert.deepStrictEqual(service.installedPlugins.get(), []);
    });
    test('addInstalledPlugin makes plugin appear in installedPlugins', () => {
        const service = createService();
        const uri = URI.file('/agent-plugins/github.com/microsoft/plugins/my-plugin');
        const plugin = makePlugin('my-plugin', 'my-plugin');
        service.addInstalledPlugin(uri, plugin);
        const installed = service.installedPlugins.get();
        assert.strictEqual(installed.length, 1);
        assert.strictEqual(installed[0].plugin.name, 'my-plugin');
    });
    test('removeInstalledPlugin removes plugin from installedPlugins and metadata', () => {
        const service = createService();
        const uri = URI.file('/agent-plugins/github.com/microsoft/plugins/my-plugin');
        const plugin = makePlugin('my-plugin', 'my-plugin');
        service.addInstalledPlugin(uri, plugin);
        assert.strictEqual(service.installedPlugins.get().length, 1);
        service.removeInstalledPlugin(uri);
        assert.strictEqual(service.installedPlugins.get().length, 0);
        assert.strictEqual(service.getMarketplacePluginMetadata(uri), undefined);
    });
    test('addInstalledPlugin updates metadata for existing entry', () => {
        const service = createService();
        const uri = URI.file('/agent-plugins/github.com/microsoft/plugins/my-plugin');
        const v1 = makePlugin('my-plugin', 'my-plugin');
        const v2 = { ...v1, version: '2.0.0', description: 'updated' };
        service.addInstalledPlugin(uri, v1);
        service.addInstalledPlugin(uri, v2);
        const installed = service.installedPlugins.get();
        assert.strictEqual(installed.length, 1);
        assert.strictEqual(installed[0].plugin.version, '2.0.0');
        assert.strictEqual(installed[0].plugin.description, 'updated');
    });
    test('getMarketplacePluginMetadata finds metadata for child URI', () => {
        const service = createService();
        const uri = URI.file('/agent-plugins/github.com/microsoft/plugins');
        const plugin = makePlugin('my-plugin', 'my-plugin');
        service.addInstalledPlugin(uri, plugin);
        const childUri = URI.file('/agent-plugins/github.com/microsoft/plugins/subdir/file.ts');
        const result = service.getMarketplacePluginMetadata(childUri);
        assert.strictEqual(result?.name, 'my-plugin');
    });
    test('multiple plugins can be installed independently', () => {
        const service = createService();
        const uri1 = URI.file('/agent-plugins/github.com/microsoft/plugins/plugin-a');
        const uri2 = URI.file('/agent-plugins/github.com/microsoft/plugins/plugin-b');
        const pluginA = makePlugin('plugin-a', 'plugin-a');
        const pluginB = makePlugin('plugin-b', 'plugin-b');
        service.addInstalledPlugin(uri1, pluginA);
        service.addInstalledPlugin(uri2, pluginB);
        assert.strictEqual(service.installedPlugins.get().length, 2);
        service.removeInstalledPlugin(uri1);
        const remaining = service.installedPlugins.get();
        assert.strictEqual(remaining.length, 1);
        assert.strictEqual(remaining[0].plugin.name, 'plugin-b');
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
        assert.deepStrictEqual(result, { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'my-plugin' });
    });
    test('parses string source with pluginRoot', () => {
        const result = parsePluginSource('sub', 'plugins', logContext);
        assert.deepStrictEqual(result, { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/sub' });
    });
    test('parses undefined source as RelativePath using pluginRoot', () => {
        const result = parsePluginSource(undefined, 'root', logContext);
        assert.deepStrictEqual(result, { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'root' });
    });
    test('parses empty string source as RelativePath using pluginRoot', () => {
        const result = parsePluginSource('', 'base', logContext);
        assert.deepStrictEqual(result, { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'base' });
    });
    test('returns base dir for empty source without pluginRoot', () => {
        assert.deepStrictEqual(parsePluginSource('', undefined, logContext), { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: '' });
    });
    test('returns base dir for undefined source without pluginRoot', () => {
        assert.deepStrictEqual(parsePluginSource(undefined, undefined, logContext), { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: '' });
    });
    test('parses github object source', () => {
        const result = parsePluginSource({ source: 'github', repo: 'owner/repo' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', ref: undefined, sha: undefined, path: undefined });
    });
    test('parses github object source with ref and sha', () => {
        const result = parsePluginSource({ source: 'github', repo: 'owner/repo', ref: 'v2.0.0', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', ref: 'v2.0.0', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', path: undefined });
    });
    test('parses github object source with path', () => {
        const result = parsePluginSource({ source: 'github', repo: 'owner/repo', path: 'plugins/my-plugin' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', ref: undefined, sha: undefined, path: 'plugins/my-plugin' });
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
        assert.strictEqual(parsePluginSource({ source: 'github', repo: 'owner/repo', path: 42 }, undefined, logContext), undefined);
    });
    test('parses url object source', () => {
        const result = parsePluginSource({ source: 'url', url: 'https://gitlab.com/team/plugin.git' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "url" /* PluginSourceKind.GitUrl */, url: 'https://gitlab.com/team/plugin.git', ref: undefined, sha: undefined });
    });
    test('returns undefined for url source missing url field', () => {
        assert.strictEqual(parsePluginSource({ source: 'url' }, undefined, logContext), undefined);
    });
    test('returns undefined for url source not ending in .git', () => {
        assert.strictEqual(parsePluginSource({ source: 'url', url: 'https://gitlab.com/team/plugin' }, undefined, logContext), undefined);
    });
    test('parses npm object source', () => {
        const result = parsePluginSource({ source: 'npm', package: '@acme/claude-plugin' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "npm" /* PluginSourceKind.Npm */, package: '@acme/claude-plugin', version: undefined, registry: undefined });
    });
    test('parses npm object source with version and registry', () => {
        const result = parsePluginSource({ source: 'npm', package: '@acme/claude-plugin', version: '2.1.0', registry: 'https://npm.example.com' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "npm" /* PluginSourceKind.Npm */, package: '@acme/claude-plugin', version: '2.1.0', registry: 'https://npm.example.com' });
    });
    test('returns undefined for npm source missing package', () => {
        assert.strictEqual(parsePluginSource({ source: 'npm' }, undefined, logContext), undefined);
    });
    test('returns undefined for npm source with non-string version', () => {
        assert.strictEqual(parsePluginSource({ source: 'npm', package: '@acme/claude-plugin', version: 123 }, undefined, logContext), undefined);
    });
    test('parses pip object source', () => {
        const result = parsePluginSource({ source: 'pip', package: 'my-plugin' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-plugin', version: undefined, registry: undefined });
    });
    test('parses pip object source with version and registry', () => {
        const result = parsePluginSource({ source: 'pip', package: 'my-plugin', version: '1.0.0', registry: 'https://pypi.example.com' }, undefined, logContext);
        assert.deepStrictEqual(result, { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-plugin', version: '1.0.0', registry: 'https://pypi.example.com' });
    });
    test('returns undefined for pip source missing package', () => {
        assert.strictEqual(parsePluginSource({ source: 'pip' }, undefined, logContext), undefined);
    });
    test('returns undefined for pip source with non-string registry', () => {
        assert.strictEqual(parsePluginSource({ source: 'pip', package: 'my-plugin', registry: 42 }, undefined, logContext), undefined);
    });
    test('returns undefined for unknown source kind', () => {
        assert.strictEqual(parsePluginSource({ source: 'unknown' }, undefined, logContext), undefined);
    });
    test('returns undefined for object source without source discriminant', () => {
        assert.strictEqual(parsePluginSource({ package: 'test' }, undefined, logContext), undefined);
    });
});
suite('getPluginSourceLabel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('formats relative path', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/foo' }), 'plugins/foo');
    });
    test('formats empty relative path', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "relativePath" /* PluginSourceKind.RelativePath */, path: '' }), '.');
    });
    test('formats github source', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' }), 'owner/repo');
    });
    test('formats github source with path', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', path: 'plugins/foo' }), 'owner/repo/plugins/foo');
    });
    test('formats url source', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "url" /* PluginSourceKind.GitUrl */, url: 'https://example.com/repo.git' }), 'https://example.com/repo.git');
    });
    test('formats npm source without version', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "npm" /* PluginSourceKind.Npm */, package: '@acme/plugin' }), '@acme/plugin');
    });
    test('formats npm source with version', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "npm" /* PluginSourceKind.Npm */, package: '@acme/plugin', version: '1.0.0' }), '@acme/plugin@1.0.0');
    });
    test('formats pip source without version', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "pip" /* PluginSourceKind.Pip */, package: 'my-plugin' }), 'my-plugin');
    });
    test('formats pip source with version', () => {
        assert.strictEqual(getPluginSourceLabel({ kind: "pip" /* PluginSourceKind.Pip */, package: 'my-plugin', version: '2.0' }), 'my-plugin==2.0');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDL0csT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDakgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJB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