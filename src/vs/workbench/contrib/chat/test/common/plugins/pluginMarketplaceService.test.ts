/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService, IFileSystemWatcher } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IMarketplacePlugin, IMarketplaceReference, IPluginSourceDescriptor, MarketplaceReferenceKind, MarketplaceType, PluginMarketplaceService, PluginSourceKind, extraKnownMarketplacesToConfigDict, getPluginSourceLabel, parseMarketplaceReference, parseMarketplaceReferences, parsePluginSource, readConfiguredMarketplaces } from '../../../common/plugins/pluginMarketplaceService.js';
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

	test('parses GitHub shorthand marketplace with ref suffix', () => {
		const parsed = parseMarketplaceReference('microsoft/vscode#marketplace');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
		assert.strictEqual(parsed.cloneUrl, 'https://github.com/microsoft/vscode.git');
		assert.strictEqual(parsed.canonicalId, 'github:microsoft/vscode#marketplace');
		assert.strictEqual(parsed.displayLabel, 'microsoft/vscode#marketplace');
		assert.deepStrictEqual(parsed.cacheSegments, ['github.com', 'microsoft', 'vscode', 'ref_marketplace']);
		assert.strictEqual(parsed.ref, 'marketplace');
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

	test('parses git URI marketplaces with ref suffix', () => {
		const https = parseMarketplaceReference('https://example.com/org/repo.git#marketplace');
		assert.ok(https);
		assert.strictEqual(https?.cloneUrl, 'https://example.com/org/repo.git');
		assert.strictEqual(https?.canonicalId, 'git:example.com/org/repo.git#marketplace');
		assert.deepStrictEqual(https?.cacheSegments, ['example.com', 'org', 'repo', 'ref_marketplace']);
		assert.strictEqual(https?.ref, 'marketplace');

		const scp = parseMarketplaceReference('git@example.com:org/repo.git#marketplace');
		assert.ok(scp);
		assert.strictEqual(scp?.cloneUrl, 'git@example.com:org/repo.git');
		assert.strictEqual(scp?.canonicalId, 'git:example.com/org/repo.git#marketplace');
		assert.deepStrictEqual(scp?.cacheSegments, ['example.com', 'org', 'repo', 'ref_marketplace']);
		assert.strictEqual(scp?.ref, 'marketplace');
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

	test('accepts host-only HTTPS marketplace endpoints (per ADR-002 git.url is any string)', () => {
		const parsed = parseMarketplaceReference('https://plugins.internal.example.com');
		assert.ok(parsed);
		assert.strictEqual(parsed?.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(parsed?.cloneUrl, 'https://plugins.internal.example.com/');
		assert.strictEqual(parsed?.canonicalId, 'git:plugins.internal.example.com/');
		assert.deepStrictEqual(parsed?.cacheSegments, ['plugins.internal.example.com']);
		assert.strictEqual(parsed?.githubRepo, undefined);

		// Trailing slash collapses to the host-only form.
		const withSlash = parseMarketplaceReference('https://plugins.internal.example.com/');
		assert.strictEqual(withSlash?.canonicalId, 'git:plugins.internal.example.com/');
	});

	test('readConfiguredMarketplaces converts policy dict to named marketplace entries', () => {
		const configService = new TestConfigurationService({
			[ChatConfiguration.ExtraMarketplaces]: {
				'acme-internal': 'https://plugins.internal.acme.com',
				'acme-public': 'https://copilot-plugins.acme.io',
				'vscode-team-kit': 'microsoft/vscode-team-kit',
			},
		});
		const { extraValues, effectiveValues } = readConfiguredMarketplaces(configService as unknown as IConfigurationService);
		const refs = parseMarketplaceReferences(extraValues);
		assert.strictEqual(refs.length, 3);
		assert.deepStrictEqual(refs.map(r => r.displayLabel), ['acme-internal', 'acme-public', 'vscode-team-kit']);
		assert.strictEqual(refs[0].kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(refs[2].kind, MarketplaceReferenceKind.GitHubShorthand);
		// Effective values union user + extra
		assert.strictEqual(effectiveValues.length, extraValues.length);
	});

	test('extraKnownMarketplacesToConfigDict: returns undefined for empty/missing input', () => {
		assert.strictEqual(extraKnownMarketplacesToConfigDict(undefined), undefined);
		assert.strictEqual(extraKnownMarketplacesToConfigDict([]), undefined);
	});

	test('extraKnownMarketplacesToConfigDict: github source becomes owner/repo shorthand', () => {
		const dict = extraKnownMarketplacesToConfigDict([
			{ name: 'vscode-team-kit', source: { source: 'github', repo: 'microsoft/vscode-team-kit' } },
		]);
		assert.deepStrictEqual(dict, { 'vscode-team-kit': 'microsoft/vscode-team-kit' });
	});

	test('extraKnownMarketplacesToConfigDict: github source with ref appends #ref', () => {
		const dict = extraKnownMarketplacesToConfigDict([
			{ name: 'team-kit-beta', source: { source: 'github', repo: 'microsoft/vscode-team-kit', ref: 'beta' } },
		]);
		assert.deepStrictEqual(dict, { 'team-kit-beta': 'microsoft/vscode-team-kit#beta' });
	});

	test('extraKnownMarketplacesToConfigDict: git source becomes raw URL (with optional #ref)', () => {
		const dict = extraKnownMarketplacesToConfigDict([
			{ name: 'acme-internal', source: { source: 'git', url: 'https://plugins.internal.acme.com' } },
			{ name: 'acme-tagged', source: { source: 'git', url: 'https://git.acme.com/plugins.git', ref: 'v1' } },
		]);
		assert.deepStrictEqual(dict, {
			'acme-internal': 'https://plugins.internal.acme.com',
			'acme-tagged': 'https://git.acme.com/plugins.git#v1',
		});
	});

	test('extraKnownMarketplacesToConfigDict: end-to-end policy → config dict → readConfiguredMarketplaces → parseMarketplaceReferences', () => {
		// Simulates the full ChatExtraMarketplaces policy delivery pipeline:
		//  1. managed_settings response is adapted into IExtraKnownMarketplaceEntry[]
		//  2. extraKnownMarketplacesToConfigDict converts to the dict shape the
		//     `chat.plugins.extraMarketplaces` setting stores
		//  3. The policy framework serializes/deserializes that as JSON
		//  4. readConfiguredMarketplaces reverses it back to nested entry shape
		//  5. parseMarketplaceReferences resolves marketplace references that
		//     preserve `displayLabel = name` (required for `plugin@<name>` keys)
		const policyEntries = [
			{ name: 'acme-internal', source: { source: 'git' as const, url: 'https://plugins.internal.acme.com' } },
			{ name: 'acme-public', source: { source: 'git' as const, url: 'https://copilot-plugins.acme.io' } },
			{ name: 'vscode-team-kit', source: { source: 'github' as const, repo: 'microsoft/vscode-team-kit' } },
		];

		const dict = extraKnownMarketplacesToConfigDict(policyEntries);
		assert.ok(dict);

		// JSON round-trip mirrors what AccountPolicyService / PolicyConfiguration do.
		const roundTripped = JSON.parse(JSON.stringify(dict));

		const configService = new TestConfigurationService({
			[ChatConfiguration.ExtraMarketplaces]: roundTripped,
		});
		const { extraValues } = readConfiguredMarketplaces(configService as unknown as IConfigurationService);
		const refs = parseMarketplaceReferences(extraValues);

		assert.strictEqual(refs.length, 3, 'all three policy entries are surfaced as marketplace references');
		assert.deepStrictEqual(
			refs.map(r => r.displayLabel),
			['acme-internal', 'acme-public', 'vscode-team-kit'],
			'displayLabel must equal the policy `name` so enabledPlugins["plugin@<name>"] keys resolve',
		);
		assert.strictEqual(refs[0].kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(refs[1].kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(refs[2].kind, MarketplaceReferenceKind.GitHubShorthand);
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

	test('github.com URI form and GitHub shorthand form share the same canonicalId (policy trust comparisons must match)', () => {
		// Regression: under strictMarketplaces, isMarketplaceTrusted compares
		// canonicalId. A plugin discovered from `https://github.com/microsoft/vscode-team-kit.git`
		// was being blocked even though `microsoft/vscode-team-kit` was in the
		// trusted list, because the URI parser produced a `git:` canonicalId
		// while the shorthand parser produced a `github:` one.
		const shorthand = parseMarketplaceReference('microsoft/vscode-team-kit');
		const httpsWithGit = parseMarketplaceReference('https://github.com/microsoft/vscode-team-kit.git');
		const httpsWithoutGit = parseMarketplaceReference('https://github.com/microsoft/vscode-team-kit');
		const scp = parseMarketplaceReference('git@github.com:microsoft/vscode-team-kit.git');
		assert.ok(shorthand);
		assert.ok(httpsWithGit);
		assert.ok(httpsWithoutGit);
		assert.ok(scp);
		assert.strictEqual(httpsWithGit!.canonicalId, shorthand!.canonicalId);
		assert.strictEqual(httpsWithoutGit!.canonicalId, shorthand!.canonicalId);
		assert.strictEqual(scp!.canonicalId, shorthand!.canonicalId);

		// All four forms should collapse to a single entry when deduplicated.
		const deduped = parseMarketplaceReferences([
			'microsoft/vscode-team-kit',
			'https://github.com/microsoft/vscode-team-kit.git',
			'https://github.com/microsoft/vscode-team-kit',
			'git@github.com:microsoft/vscode-team-kit.git',
		]);
		assert.strictEqual(deduped.length, 1);
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

	test('deduplicates github.com URI, SSH, and shorthand to the same canonical id', () => {
		// All three forms refer to the same marketplace, so policy trust
		// comparisons (which match by canonicalId) must collapse them.
		const parsed = parseMarketplaceReferences([
			'microsoft/vscode',
			'https://github.com/microsoft/vscode.git',
			'git@github.com:microsoft/vscode.git',
		]);

		assert.strictEqual(parsed.length, 1);
		assert.strictEqual(parsed[0].canonicalId, 'github:microsoft/vscode');
	});

	test('parseMarketplaceReferences ignores invalid entries (null, numbers, malformed objects)', () => {
		const parsed = parseMarketplaceReferences([null, 42, {}, 'microsoft/vscode']);
		assert.strictEqual(parsed.length, 1);
		assert.strictEqual(parsed[0].canonicalId, 'github:microsoft/vscode');
	});

	test('parseMarketplaceReferences accepts policy-shape objects and uses name as displayLabel', () => {
		const parsed = parseMarketplaceReferences([
			{ name: 'vscode-team-kit', source: { source: 'github', repo: 'microsoft/vscode-team-kit' } },
			{ name: 'acme-public', source: { source: 'git', url: 'https://copilot-plugins.acme.io', ref: 'main' } },
		]);
		assert.strictEqual(parsed.length, 2);
		assert.strictEqual(parsed[0].displayLabel, 'vscode-team-kit');
		assert.strictEqual(parsed[0].canonicalId, 'github:microsoft/vscode-team-kit');
		assert.strictEqual(parsed[1].displayLabel, 'acme-public');
		assert.strictEqual(parsed[1].ref, 'main');
	});

	test('treats different marketplace refs as distinct references', () => {
		const parsed = parseMarketplaceReferences([
			'microsoft/vscode#main',
			'microsoft/vscode#marketplace',
			'https://github.com/microsoft/vscode.git#marketplace',
		]);

		// `https://github.com/...#marketplace` collapses with the shorthand
		// (same canonical id), so we expect 2 distinct refs not 3.
		assert.deepStrictEqual(parsed.map(r => r.canonicalId), [
			'github:microsoft/vscode#main',
			'github:microsoft/vscode#marketplace',
		]);
	});
});

suite('PluginMarketplaceService - GitHub marketplace refs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('fetches GitHub marketplace definitions from the configured ref', async () => {
		const requestUrls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: ['microsoft/vscode#marketplace'],
			[ChatConfiguration.PluginsEnabled]: true,
		}));
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as Partial<IEnvironmentService> as IEnvironmentService);
		instantiationService.stub(IFileService, {} as unknown as IFileService);
		instantiationService.stub(IAgentPluginRepositoryService, {
			agentPluginsHome: URI.file('/agent-plugins'),
			ensureRepository: async () => {
				throw new Error('should not clone for 5xx responses');
			},
		} as Partial<IAgentPluginRepositoryService> as IAgentPluginRepositoryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRequestService, {
			request: async (options: { url: string }) => {
				requestUrls.push(options.url);
				return { res: { headers: {}, statusCode: 500 }, stream: bufferToStream(VSBuffer.fromString('')) };
			},
		} as Partial<IRequestService> as IRequestService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IWorkspacePluginSettingsService, {
			extraMarketplaces: observableValue('test.extraMarketplaces', []),
			enabledPlugins: observableValue('test.enabledPlugins', new Map()),
		} as Partial<IWorkspacePluginSettingsService> as IWorkspacePluginSettingsService);
		instantiationService.stub(IWorkspaceTrustManagementService, {
			isWorkspaceTrusted: () => true,
			onDidChangeTrust: Event.None,
		} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService);
		instantiationService.stub(IExtensionsWorkbenchService, {
			getAutoUpdateValue: () => 'on',
		} as Partial<IExtensionsWorkbenchService> as IExtensionsWorkbenchService);

		const service = store.add(instantiationService.createInstance(PluginMarketplaceService));
		await service.fetchMarketplacePlugins(CancellationToken.None);

		assert.ok(requestUrls.length > 0);
		assert.ok(requestUrls.every(url => url.includes('/marketplace/')));
		assert.ok(requestUrls.every(url => !url.includes('/main/')));
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
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as Partial<IEnvironmentService> as IEnvironmentService);
		instantiationService.stub(IFileService, {} as unknown as IFileService);
		instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file('/agent-plugins') } as unknown as IAgentPluginRepositoryService);
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
		instantiationService.stub(IExtensionsWorkbenchService, {
			getAutoUpdateValue: () => 'on',
		} as Partial<IExtensionsWorkbenchService> as IExtensionsWorkbenchService);

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

suite('PluginMarketplaceService - installed plugins lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const marketplaceRef = parseMarketplaceReference('microsoft/plugins')!;

	function makePlugin(name: string, source: string): IMarketplacePlugin {
		return {
			name,
			description: `${name} description`,
			version: '1.0.0',
			source,
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: source } as const,
			marketplace: marketplaceRef.displayLabel,
			marketplaceReference: marketplaceRef,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function createService(): PluginMarketplaceService {
		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: ['microsoft/plugins'],
			[ChatConfiguration.PluginsEnabled]: true,
		}));
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as Partial<IEnvironmentService> as IEnvironmentService);
		instantiationService.stub(IFileService, {} as unknown as IFileService);
		instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file('/agent-plugins') } as unknown as IAgentPluginRepositoryService);
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
		instantiationService.stub(IExtensionsWorkbenchService, {
			getAutoUpdateValue: () => 'on',
		} as Partial<IExtensionsWorkbenchService> as IExtensionsWorkbenchService);

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

suite('PluginMarketplaceService - hydration after restart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const CACHE_ROOT = URI.file('/agent-plugins');

	class TestFileService {
		readonly files = new Map<string, string>();
		readonly folders = new Set<string>();

		async exists(resource: URI): Promise<boolean> {
			const key = resource.toString();
			return this.files.has(key) || this.folders.has(key);
		}

		async readFile(resource: URI): Promise<{ value: VSBuffer }> {
			const key = resource.toString();
			const value = this.files.get(key);
			if (value === undefined) {
				throw new Error(`Missing file: ${key}`);
			}
			return { value: VSBuffer.fromString(value) };
		}

		async writeFile(resource: URI, content: VSBuffer): Promise<unknown> {
			this.files.set(resource.toString(), content.toString());
			return {};
		}

		async createFolder(resource: URI): Promise<unknown> {
			this.folders.add(resource.toString());
			return {};
		}

		createWatcher(): IFileSystemWatcher {
			return { onDidChange: Event.None, dispose: () => { } };
		}

		setFile(resource: URI, content: string): void {
			this.files.set(resource.toString(), content);
		}
	}

	function createPluginRepositoryStub(): IAgentPluginRepositoryService {
		const getRepositoryUri = (marketplace: IMarketplaceReference) => URI.joinPath(CACHE_ROOT, ...marketplace.cacheSegments);
		const getPluginSourceInstallUri = (descriptor: IPluginSourceDescriptor) => {
			if (descriptor.kind === PluginSourceKind.GitHub) {
				const [owner, repo] = descriptor.repo.split('/');
				const base = URI.joinPath(CACHE_ROOT, 'github.com', owner, repo);
				return descriptor.path ? URI.joinPath(base, descriptor.path) : base;
			}
			if (descriptor.kind === PluginSourceKind.RelativePath) {
				// Tests using this stub only exercise non-relative descriptors via this entry point.
				throw new Error('RelativePath should not reach getPluginSourceInstallUri in hydration tests');
			}
			throw new Error(`Unhandled source kind in test stub: ${descriptor.kind}`);
		};
		return {
			agentPluginsHome: CACHE_ROOT,
			getRepositoryUri,
			getPluginInstallUri: (plugin: IMarketplacePlugin) => {
				if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
					return getPluginSourceInstallUri(plugin.sourceDescriptor);
				}
				const repoDir = getRepositoryUri(plugin.marketplaceReference);
				return plugin.source ? URI.joinPath(repoDir, plugin.source) : repoDir;
			},
			getPluginSourceInstallUri,
		} as unknown as IAgentPluginRepositoryService;
	}

	function makeAzurePlugin(marketplaceReference: IMarketplaceReference): IMarketplacePlugin {
		return {
			name: 'azure',
			description: 'Microsoft Azure MCP Server and skills',
			version: '1.0.0',
			source: '',
			sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'microsoft/azure-skills', path: '.github/plugins/azure-skills' },
			marketplace: marketplaceReference.displayLabel,
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function storeMarketplaceCache(storageService: InMemoryStorageService, marketplaceReference: IMarketplaceReference, plugin: IMarketplacePlugin): void {
		storageService.store('chat.plugins.marketplaces.githubCache.v1', JSON.stringify({
			[marketplaceReference.canonicalId]: {
				plugins: [plugin],
				expiresAt: Date.now() + 60_000,
				referenceRawValue: marketplaceReference.rawValue,
			},
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	test('hydrates a github-sourced plugin from installed.json name and marketplace cache after restart', async () => {
		// Simulates: user installs the "azure" plugin from the
		// "github/awesome-copilot#marketplace" marketplace (fetched via HTTP, never
		// cloned). After restart, installed.json contains only the durable
		// identity for that plugin; the full descriptor is recovered from
		// marketplace data cached from the prior fetch.

		const storageService = store.add(new InMemoryStorageService());
		const fileService = new TestFileService();

		const awesomeCopilot = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const azurePlugin = makeAzurePlugin(awesomeCopilot);
		storeMarketplaceCache(storageService, awesomeCopilot, azurePlugin);
		const azurePluginUri = URI.joinPath(CACHE_ROOT, 'github.com', 'microsoft', 'azure-skills', '.github', 'plugins', 'azure-skills');

		const installedJson = URI.joinPath(CACHE_ROOT, 'installed.json');
		fileService.setFile(installedJson, JSON.stringify({
			version: 1,
			installed: [{
				pluginUri: azurePluginUri.toString(),
				marketplace: awesomeCopilot.rawValue,
				name: 'azure',
			}],
		}));

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.PluginsEnabled]: true,
		}));
		instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as Partial<IEnvironmentService> as IEnvironmentService);
		instantiationService.stub(IFileService, fileService as unknown as IFileService);
		instantiationService.stub(IAgentPluginRepositoryService, createPluginRepositoryStub());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRequestService, {} as unknown as IRequestService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IWorkspacePluginSettingsService, {
			extraMarketplaces: observableValue('test.extraMarketplaces', []),
			enabledPlugins: observableValue('test.enabledPlugins', new Map()),
		} as Partial<IWorkspacePluginSettingsService> as IWorkspacePluginSettingsService);
		instantiationService.stub(IWorkspaceTrustManagementService, {
			isWorkspaceTrusted: () => true,
			onDidChangeTrust: Event.None,
		} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService);
		instantiationService.stub(IExtensionsWorkbenchService, {
			getAutoUpdateValue: () => 'on',
		} as Partial<IExtensionsWorkbenchService> as IExtensionsWorkbenchService);

		const service = store.add(instantiationService.createInstance(PluginMarketplaceService));

		// FileBackedInstalledPluginsStore initialises asynchronously.
		for (let i = 0; i < 50; i++) {
			if (service.installedPlugins.get().length === 1) {
				break;
			}
			await timeout(10);
		}

		const installed = service.installedPlugins.get();
		assert.strictEqual(installed.length, 1, 'azure plugin should be hydrated from marketplace data');
		assert.strictEqual(installed[0].plugin.name, 'azure');
		assert.strictEqual(installed[0].plugin.sourceDescriptor.kind, PluginSourceKind.GitHub);
		assert.strictEqual(installed[0].plugin.marketplaceReference.canonicalId, awesomeCopilot.canonicalId);
	});

	test('persists plugin name when a plugin is added so it survives a restart', async () => {
		// First service writes installed.json, second service (sharing the
		// same file system + storage) reads it back and must reconstruct
		// the plugin from its stored name plus marketplace data.
		const storageService = store.add(new InMemoryStorageService());
		const fileService = new TestFileService();

		const awesomeCopilot = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const azurePluginUri = URI.joinPath(CACHE_ROOT, 'github.com', 'microsoft', 'azure-skills', '.github', 'plugins', 'azure-skills');
		const azurePlugin = makeAzurePlugin(awesomeCopilot);
		storeMarketplaceCache(storageService, awesomeCopilot, azurePlugin);

		function makeService(): PluginMarketplaceService {
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
				[ChatConfiguration.PluginsEnabled]: true,
			}));
			instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache') } as Partial<IEnvironmentService> as IEnvironmentService);
			instantiationService.stub(IFileService, fileService as unknown as IFileService);
			instantiationService.stub(IAgentPluginRepositoryService, createPluginRepositoryStub());
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IRequestService, {} as unknown as IRequestService);
			instantiationService.stub(IStorageService, storageService);
			instantiationService.stub(IWorkspacePluginSettingsService, {
				extraMarketplaces: observableValue('test.extraMarketplaces', []),
				enabledPlugins: observableValue('test.enabledPlugins', new Map()),
			} as Partial<IWorkspacePluginSettingsService> as IWorkspacePluginSettingsService);
			instantiationService.stub(IWorkspaceTrustManagementService, {
				isWorkspaceTrusted: () => true,
				onDidChangeTrust: Event.None,
			} as Partial<IWorkspaceTrustManagementService> as IWorkspaceTrustManagementService);
			instantiationService.stub(IExtensionsWorkbenchService, {
				getAutoUpdateValue: () => 'on',
			} as Partial<IExtensionsWorkbenchService> as IExtensionsWorkbenchService);
			return store.add(instantiationService.createInstance(PluginMarketplaceService));
		}

		// First session: install the plugin.
		const first = makeService();
		// Wait for FileBackedInstalledPluginsStore to finish initialisation
		// so that subsequent writes are flushed to the file service.
		await timeout(20);
		first.addInstalledPlugin(azurePluginUri, azurePlugin);
		// Wait for the throttled write to land.
		await timeout(200);

		const installedJson = URI.joinPath(CACHE_ROOT, 'installed.json');
		const persisted = JSON.parse(fileService.files.get(installedJson.toString())!);
		assert.strictEqual(persisted.installed.length, 1);
		assert.deepStrictEqual(persisted.installed[0], {
			pluginUri: azurePluginUri.toString(),
			marketplace: awesomeCopilot.rawValue,
			name: 'azure',
		});

		// Second session: restart with shared storage + file system. The
		// plugin must be reconstructed from installed.json + marketplace data.
		const second = makeService();
		for (let i = 0; i < 50; i++) {
			if (second.installedPlugins.get().length === 1) {
				break;
			}
			await timeout(10);
		}
		const installed = second.installedPlugins.get();
		assert.strictEqual(installed.length, 1);
		assert.strictEqual(installed[0].plugin.name, 'azure');
		assert.strictEqual(installed[0].plugin.sourceDescriptor.kind, PluginSourceKind.GitHub);
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
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: 'https://gitlab.com/team/plugin.git', ref: undefined, sha: undefined, path: undefined });
	});

	test('returns undefined for url source missing url field', () => {
		assert.strictEqual(parsePluginSource({ source: 'url' }, undefined, logContext), undefined);
	});

	test('returns undefined for url source not ending in .git', () => {
		assert.strictEqual(parsePluginSource({ source: 'url', url: 'https://gitlab.com/team/plugin' }, undefined, logContext), undefined);
	});

	test('parses git-subdir object source', () => {
		const result = parsePluginSource({ source: 'git-subdir', url: 'https://github.com/acme/monorepo.git', path: 'tools/claude-plugin' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: 'https://github.com/acme/monorepo.git', ref: undefined, sha: undefined, path: 'tools/claude-plugin' });
	});

	test('parses git-subdir object source with ref and sha', () => {
		const result = parsePluginSource({ source: 'git-subdir', url: 'https://example.com/repo.git', path: 'plugins/foo', ref: 'v2.0.0', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git', ref: 'v2.0.0', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', path: 'plugins/foo' });
	});

	test('parses git-subdir source without .git suffix', () => {
		// git-subdir does not require .git suffix (Azure DevOps / AWS CodeCommit compatibility)
		const result = parsePluginSource({ source: 'git-subdir', url: 'https://dev.azure.com/org/project/_git/repo', path: 'plugins/foo' }, undefined, logContext);
		assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: 'https://dev.azure.com/org/project/_git/repo', ref: undefined, sha: undefined, path: 'plugins/foo' });
	});

	test('returns undefined for git-subdir source missing url field', () => {
		assert.strictEqual(parsePluginSource({ source: 'git-subdir', path: 'plugins/foo' }, undefined, logContext), undefined);
	});

	test('returns undefined for git-subdir source missing path field', () => {
		assert.strictEqual(parsePluginSource({ source: 'git-subdir', url: 'https://example.com/repo.git' }, undefined, logContext), undefined);
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

	test('formats url source with path', () => {
		assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git', path: 'plugins/foo' }), 'https://example.com/repo.git/plugins/foo');
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
