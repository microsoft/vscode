/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { ISettableObservable, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, AgentHostMcpSupportReason, assessMcpServersForCopilotAgentHost, COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID, mergeInstalledMcpServersIntoAgentHostSupportAssessment } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupport.js';
import { AgentHostMcpServerSupportScope } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupportScope.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ExternalDiscoverySource } from '../../../../mcp/common/mcpConfiguration.js';
import { IMcpConfigPath, IMcpServer, IMcpService, IMcpWorkbenchService, IWorkbenchMcpServer, LazyCollectionState, McpCollectionDefinition, McpCollectionProvenance, McpServerDefinition, McpServerEnablementState, McpServerLaunch, McpServerTransportStdio, McpServerTransportType, McpServerTrust } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IWorkbenchLocalMcpServer } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';

suite('agentHostMcpServerSupport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies supported delivery paths and source locations', async () => {
		const root = URI.file('/workspace');
		const servers = [
			makeMcpServer({
				id: 'mcp.config.usrlocal.user',
				collectionId: 'mcp.config.usrlocal',
				provenance: McpCollectionProvenance.UserProfile,
			}),
			makeMcpServer({
				id: 'workspace-dot-mcp.0.root',
				collectionId: 'workspace-dot-mcp.0',
				provenance: McpCollectionProvenance.WorkspaceDotMcp,
				configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
				collectionOrigin: URI.joinPath(root, '.mcp.json'),
			}),
			makeMcpServer({
				id: 'plugin.test/server',
				collectionId: 'plugin.file:///plugin',
				provenance: McpCollectionProvenance.Plugin,
				collectionOrigin: URI.file('/plugin/.mcp.json'),
			}),
			makeMcpServer({
				id: 'extension.server',
				collectionId: 'publisher.extension/provider',
				provenance: McpCollectionProvenance.Extension,
				collectionSource: new ExtensionIdentifier('publisher.extension'),
			}),
			makeMcpServer({
				id: 'github',
				collectionId: COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID,
				provenance: McpCollectionProvenance.Extension,
				collectionSource: new ExtensionIdentifier('github.copilot-chat'),
			}),
		];

		const result = await assess(servers, [root]);

		assert.deepStrictEqual(result.servers.map(server => ({
			name: server.name,
			source: server.source.kind,
			delivery: server.delivery,
			compatibility: server.compatibility.kind,
		})), [
			{ name: 'mcp.config.usrlocal.user', source: AgentHostMcpServerSourceKind.UserProfile, delivery: AgentHostMcpServerDelivery.ClientForwarded, compatibility: 'supported' },
			{ name: 'workspace-dot-mcp.0.root', source: AgentHostMcpServerSourceKind.WorkspaceDotMcp, delivery: AgentHostMcpServerDelivery.RuntimeDiscovered, compatibility: 'supported' },
			{ name: 'plugin.test/server', source: AgentHostMcpServerSourceKind.AgentPlugin, delivery: AgentHostMcpServerDelivery.AgentPlugin, compatibility: 'supported' },
			{ name: 'extension.server', source: AgentHostMcpServerSourceKind.Extension, delivery: AgentHostMcpServerDelivery.ClientForwarded, compatibility: 'supported' },
			{ name: 'github', source: AgentHostMcpServerSourceKind.Extension, delivery: AgentHostMcpServerDelivery.ProviderBuiltIn, compatibility: 'supported' },
		]);
	});

	test('reports unsupported configuration without changing existing direct forwarding', async () => {
		const root = URI.file('/workspace');
		const servers = [
			makeMcpServer({
				id: 'mcp.config.ws0.input',
				collectionId: 'mcp.config.ws0',
				provenance: McpCollectionProvenance.WorkspaceFolderConfiguration,
				configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
				collectionOrigin: URI.joinPath(root, '.vscode', 'mcp.json'),
				launch: stdioLaunch('${input:token}'),
			}),
			makeMcpServer({
				id: 'mcp.config.usrlocal.folder',
				collectionId: 'mcp.config.usrlocal',
				provenance: McpCollectionProvenance.UserProfile,
				launch: stdioLaunch('${workspaceFolder}'),
			}),
			makeMcpServer({
				id: 'mcp.config.workspace.workspace',
				collectionId: 'mcp.config.workspace',
				provenance: McpCollectionProvenance.WorkspaceConfiguration,
				configTarget: ConfigurationTarget.WORKSPACE,
				collectionOrigin: URI.file('/workspace.code-workspace'),
			}),
		];

		const result = await assess(servers, [root]);

		assert.deepStrictEqual(result.servers.map(server => ({
			name: server.name,
			delivery: server.delivery,
			compatibility: server.compatibility,
		})), [
			{
				name: 'mcp.config.ws0.input',
				delivery: AgentHostMcpServerDelivery.NotDelivered,
				compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.RequiresUserInteraction] },
			},
			{
				name: 'mcp.config.usrlocal.folder',
				delivery: AgentHostMcpServerDelivery.ClientForwarded,
				compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] },
			},
			{
				name: 'mcp.config.workspace.workspace',
				delivery: AgentHostMcpServerDelivery.NotDelivered,
				compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnsupportedSourceLocation] },
			},
		]);
	});

	test('uses discovery metadata to distinguish external user and workspace configurations', async () => {
		const root = URI.file('/workspace');
		const result = await assess([
			makeMcpServer({
				id: 'cursor-global',
				collectionId: 'cursor-global',
				provenance: McpCollectionProvenance.ExternalConfiguration,
				discoverySource: ExternalDiscoverySource.CursorGlobal,
			}),
			makeMcpServer({
				id: 'cursor-workspace.0',
				collectionId: 'cursor-workspace.0',
				provenance: McpCollectionProvenance.ExternalConfiguration,
				discoverySource: ExternalDiscoverySource.CursorWorkspace,
				configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
				collectionOrigin: URI.joinPath(root, '.cursor', 'mcp.json'),
			}),
		], [root]);

		assert.deepStrictEqual(result.servers.map(server => ({
			source: server.source.kind,
			applicability: server.applicability,
			delivery: server.delivery,
			compatibility: server.compatibility,
		})), [
			{
				source: AgentHostMcpServerSourceKind.CursorUser,
				applicability: AgentHostMcpServerApplicability.Applicable,
				delivery: AgentHostMcpServerDelivery.ClientForwarded,
				compatibility: { kind: 'supported' },
			},
			{
				source: AgentHostMcpServerSourceKind.CursorWorkspace,
				applicability: AgentHostMcpServerApplicability.Applicable,
				delivery: AgentHostMcpServerDelivery.NotDelivered,
				compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnsupportedSourceLocation] },
			},
		]);
	});

	test('keeps scope applicability separate from configuration compatibility', async () => {
		const server = makeMcpServer({
			id: 'mcp.config.ws0.server',
			collectionId: 'mcp.config.ws0',
			provenance: McpCollectionProvenance.WorkspaceFolderConfiguration,
			configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
			collectionOrigin: URI.file('/workspace-a/.vscode/mcp.json'),
		});

		const outside = await assess([server], [URI.file('/workspace-b')]);
		const unavailable = await assess([server], undefined);

		assert.deepStrictEqual({
			outside: {
				applicability: outside.servers[0].applicability,
				delivery: outside.servers[0].delivery,
				compatibility: outside.servers[0].compatibility,
			},
			unavailable: {
				applicability: unavailable.servers[0].applicability,
				delivery: unavailable.servers[0].delivery,
				compatibility: unavailable.servers[0].compatibility,
			},
		}, {
			outside: {
				applicability: AgentHostMcpServerApplicability.OutsideCurrentScope,
				delivery: AgentHostMcpServerDelivery.NotDelivered,
				compatibility: { kind: 'supported' },
			},
			unavailable: {
				applicability: AgentHostMcpServerApplicability.Unknown,
				delivery: AgentHostMcpServerDelivery.Unknown,
				compatibility: { kind: 'supported' },
			},
		});
	});

	test('reports configuration features dropped by the Copilot delivery chain', async () => {
		const server = makeMcpServer({
			id: 'mcp.config.usrlocal.partial',
			collectionId: 'mcp.config.usrlocal',
			provenance: McpCollectionProvenance.UserProfile,
			launch: {
				...stdioLaunch(),
				envFile: '/workspace/.env',
				sandbox: { network: { allowedDomains: ['example.com'] } },
			},
			sandboxEnabled: true,
			devMode: { watch: '**/*.ts' },
		});

		const result = await assess([server], []);

		assert.deepStrictEqual(result.servers[0].compatibility, {
			kind: 'partiallySupported',
			reasons: [
				AgentHostMcpSupportReason.EnvironmentFileIgnored,
				AgentHostMcpSupportReason.SandboxConfigurationIgnored,
				AgentHostMcpSupportReason.DevelopmentModeIgnored,
			],
		});
	});

	test('reports runtime server enablement separately from compatibility', async () => {
		const result = await assess([
			makeMcpServer({
				id: 'mcp.config.usrlocal.disabled',
				collectionId: 'mcp.config.usrlocal',
				provenance: McpCollectionProvenance.UserProfile,
				enablement: ContributionEnablementState.DisabledWorkspace,
			}),
		], []);

		assert.deepStrictEqual(result.servers[0], {
			id: 'mcp.config.usrlocal.disabled',
			name: 'mcp.config.usrlocal.disabled',
			collectionId: 'mcp.config.usrlocal',
			source: {
				group: 'user',
				kind: AgentHostMcpServerSourceKind.UserProfile,
				label: 'mcp.config.usrlocal',
				collectionUri: undefined,
				definitionLocation: undefined,
				remoteAuthority: null,
				extensionId: undefined,
				pluginUri: undefined,
			},
			enablement: {
				enabled: false,
				state: AgentHostMcpServerEnablementState.DisabledWorkspace,
			},
			applicability: AgentHostMcpServerApplicability.Applicable,
			delivery: AgentHostMcpServerDelivery.ClientForwarded,
			compatibility: { kind: 'supported' },
		});
	});

	test('includes access-disabled installed servers omitted from the runtime registry', async () => {
		const root = URI.file('/workspace');
		const initial = await assess([], [root]);
		const result = await mergeInstalledMcpServersIntoAgentHostSupportAssessment(
			initial,
			[{
				id: 'mcp.config.ws0.disabled',
				name: 'disabled',
				label: 'Disabled server',
				configuration: {
					type: McpServerType.LOCAL,
					command: 'server',
				},
				configPath: {
					id: 'ws0',
					key: 'workspaceFolderValue',
					label: 'Workspace Folder',
					scope: StorageScope.WORKSPACE,
					target: ConfigurationTarget.WORKSPACE_FOLDER,
					order: 0,
					uri: URI.joinPath(root, '.vscode', 'mcp.json'),
				},
				sandbox: undefined,
				runtimeState: McpServerEnablementState.DisabledByAccess,
			}],
			makeConfigurationResolverService(),
			[root],
		);

		assert.deepStrictEqual(result, {
			discoveryComplete: true,
			servers: [{
				id: 'mcp.config.ws0.disabled',
				name: 'disabled',
				collectionId: 'mcp.config.ws0',
				source: {
					group: 'local',
					kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
					label: 'Workspace Folder',
					collectionUri: URI.joinPath(root, '.vscode', 'mcp.json'),
					definitionLocation: undefined,
					remoteAuthority: null,
					extensionId: undefined,
					pluginUri: undefined,
				},
				enablement: {
					enabled: false,
					state: AgentHostMcpServerEnablementState.DisabledByAccess,
				},
				applicability: AgentHostMcpServerApplicability.Applicable,
				delivery: AgentHostMcpServerDelivery.NotDelivered,
				compatibility: { kind: 'supported' },
			}],
		});
	});

	test('uses the same compatibility assessment for registered and access-disabled installed servers', async () => {
		const initial = await assess([
			makeMcpServer({
				id: 'mcp.config.usrlocal.runtime',
				collectionId: 'mcp.config.usrlocal',
				provenance: McpCollectionProvenance.UserProfile,
				launch: {
					...stdioLaunch(),
					envFile: '/workspace/.env',
					sandbox: { network: { allowedDomains: ['example.com'] } },
				},
				sandboxEnabled: true,
				devMode: { watch: '**/*.ts' },
			}),
		], []);
		const result = await mergeInstalledMcpServersIntoAgentHostSupportAssessment(
			initial,
			[{
				id: 'mcp.config.usrlocal.installed',
				name: 'installed',
				label: 'Installed server',
				configuration: {
					type: McpServerType.LOCAL,
					command: 'server',
					envFile: '/workspace/.env',
					sandboxEnabled: true,
					dev: { watch: '**/*.ts' },
				},
				configPath: {
					id: 'usrlocal',
					key: 'userLocalValue',
					label: 'User',
					scope: StorageScope.PROFILE,
					target: ConfigurationTarget.USER,
					order: 0,
					uri: undefined,
				},
				sandbox: { network: { allowedDomains: ['example.com'] } },
				runtimeState: McpServerEnablementState.DisabledByAccess,
			}],
			makeConfigurationResolverService(),
			[],
		);

		assert.deepStrictEqual(result.servers.map(server => server.compatibility), [
			{
				kind: 'partiallySupported',
				reasons: [
					AgentHostMcpSupportReason.EnvironmentFileIgnored,
					AgentHostMcpSupportReason.SandboxConfigurationIgnored,
					AgentHostMcpSupportReason.DevelopmentModeIgnored,
				],
			},
			{
				kind: 'partiallySupported',
				reasons: [
					AgentHostMcpSupportReason.EnvironmentFileIgnored,
					AgentHostMcpSupportReason.SandboxConfigurationIgnored,
					AgentHostMcpSupportReason.DevelopmentModeIgnored,
				],
			},
		]);
	});

	test('reacts to runtime enablement changes', async () => {
		const enablement = observableValue('enablement', ContributionEnablementState.EnabledProfile);
		const server = makeMcpServer({
			id: 'mcp.config.usrlocal.reactive',
			collectionId: 'mcp.config.usrlocal',
			provenance: McpCollectionProvenance.UserProfile,
			enablementObservable: enablement,
		});
		const mcpService = {
			servers: observableValue<readonly IMcpServer[]>('mcpServers', [server]),
			lazyCollectionState: observableValue('lazyCollectionState', { state: LazyCollectionState.AllKnown, collections: [] }),
		} as Partial<IMcpService> as IMcpService;
		const mcpWorkbenchService = {
			local: [],
			onChange: Event.None,
			whenInitialLocalMcpServersLoaded: Promise.resolve(),
		} as Partial<IMcpWorkbenchService> as IMcpWorkbenchService;
		const configurationService = {
			getValue: (section: string) => section === mcpAccessConfig ? McpAccessValue.All : false,
			onDidChangeConfiguration: Event.None,
		} as Partial<IConfigurationService> as IConfigurationService;
		const owner = new AgentHostMcpServerSupportScope(
			'agent-host-copilotcli',
			[],
			() => { },
			mcpService,
			mcpWorkbenchService,
			makeConfigurationResolverService(),
			configurationService,
		);
		const scope = store.add(owner.acquire());
		await scope.whenResolved();

		const updated = waitForState(scope.support, snapshot => snapshot.servers[0]?.enablement.state === AgentHostMcpServerEnablementState.DisabledWorkspace);
		enablement.set(ContributionEnablementState.DisabledWorkspace, undefined);

		assert.deepStrictEqual((await updated).servers[0].enablement, {
			enabled: false,
			state: AgentHostMcpServerEnablementState.DisabledWorkspace,
		});
	});

	test('waits for the installed inventory before resolving the initial snapshot', async () => {
		const inventoryReady = new DeferredPromise<void>();
		const readinessRequested = new DeferredPromise<void>();
		let localServers: readonly IWorkbenchMcpServer[] = [];
		const mcpService = {
			servers: observableValue<readonly IMcpServer[]>('mcpServers', []),
			lazyCollectionState: observableValue('lazyCollectionState', { state: LazyCollectionState.AllKnown, collections: [] }),
		} as Partial<IMcpService> as IMcpService;
		const mcpWorkbenchService = {
			get local() { return localServers; },
			onChange: Event.None,
			getMcpConfigPath: getUndefinedMcpConfigPath,
			get whenInitialLocalMcpServersLoaded() {
				readinessRequested.complete();
				return inventoryReady.p;
			},
		} as Partial<IMcpWorkbenchService> as IMcpWorkbenchService;
		const configurationService = {
			getValue: (section: string) => section === mcpAccessConfig ? McpAccessValue.All : false,
			onDidChangeConfiguration: Event.None,
		} as Partial<IConfigurationService> as IConfigurationService;
		const owner = new AgentHostMcpServerSupportScope(
			'agent-host-copilotcli',
			[],
			() => { },
			mcpService,
			mcpWorkbenchService,
			makeConfigurationResolverService(),
			configurationService,
		);
		const scope = store.add(owner.acquire());
		await readinessRequested.p;
		const resolvedBeforeInventory = scope.isResolved.get();

		localServers = [{
			name: 'delayed',
			label: 'Delayed server',
			local: {
				id: 'mcp.config.usrlocal.delayed',
				config: {
					type: McpServerType.LOCAL,
					command: 'server',
				},
				rootSandbox: undefined,
			},
			runtimeStatus: { state: McpServerEnablementState.DisabledByAccess },
		} as Partial<IWorkbenchMcpServer> as IWorkbenchMcpServer];
		await inventoryReady.complete();
		await scope.whenResolved();

		assert.deepStrictEqual({
			resolvedBeforeInventory,
			resolvedAfterInventory: scope.isResolved.get(),
			serverIds: scope.support.get().servers.map(server => server.id),
		}, {
			resolvedBeforeInventory: false,
			resolvedAfterInventory: true,
			serverIds: ['mcp.config.usrlocal.delayed'],
		});
	});

	test('reports incomplete discovery without fabricating unknown servers', async () => {
		const result = await assessMcpServersForCopilotAgentHost(
			[],
			makeConfigurationResolverService(),
			'agent-host-copilotcli',
			[],
			LazyCollectionState.HasUnknown,
		);

		assert.deepStrictEqual(result, { servers: [], discoveryComplete: false });
	});

	test('does not expose the Copilot support assessment for another harness', async () => {
		const result = await assessMcpServersForCopilotAgentHost(
			[],
			makeConfigurationResolverService(),
			'agent-host-claude',
			[],
			LazyCollectionState.AllKnown,
		);

		assert.strictEqual(result, undefined);
	});
});

function makeMcpServer(options: {
	readonly id: string;
	readonly collectionId: string;
	readonly provenance?: McpCollectionProvenance;
	readonly discoverySource?: ExternalDiscoverySource;
	readonly configTarget?: ConfigurationTarget;
	readonly collectionOrigin?: URI;
	readonly collectionSource?: ExtensionIdentifier;
	readonly launch?: McpServerLaunch;
	readonly sandboxEnabled?: boolean;
	readonly devMode?: McpServerDefinition['devMode'];
	readonly enablement?: ContributionEnablementState;
	readonly enablementObservable?: ISettableObservable<ContributionEnablementState>;
}): IMcpServer {
	const {
		id,
		collectionId,
		provenance,
		discoverySource,
		configTarget = ConfigurationTarget.USER,
		collectionOrigin,
		collectionSource,
		launch = stdioLaunch(),
		sandboxEnabled,
		devMode,
		enablement = ContributionEnablementState.EnabledProfile,
		enablementObservable,
	} = options;
	const collection: McpCollectionDefinition = {
		id: collectionId,
		provenance,
		discoverySource,
		label: collectionId,
		remoteAuthority: null,
		serverDefinitions: observableValue('serverDefinitions', []),
		trustBehavior: McpServerTrust.Kind.Trusted,
		scope: StorageScope.PROFILE,
		configTarget,
		source: collectionSource,
		order: 0,
		presentation: collectionOrigin ? { origin: collectionOrigin } : undefined,
	};
	const definition: McpServerDefinition = {
		id,
		label: id,
		launch,
		cacheNonce: id,
		sandboxEnabled,
		devMode,
	};
	const definitions = observableValue('definitions', { server: definition, collection });
	return {
		collection: { id: collectionId, label: collectionId, order: 0 },
		definition: { id, label: id },
		enablement: enablementObservable ?? observableValue('enablement', enablement),
		readDefinitions: () => definitions,
	} as unknown as IMcpServer;
}

function stdioLaunch(argument?: string): McpServerTransportStdio {
	return {
		type: McpServerTransportType.Stdio,
		command: 'server',
		args: argument ? [argument] : [],
		env: {},
		envFile: undefined,
		cwd: undefined,
		sandbox: undefined,
	};
}

function makeConfigurationResolverService(resolutions: Record<string, string> = {}): IConfigurationResolverService {
	return {
		async resolveAsync(_folder: unknown, config: unknown) {
			const expression = ConfigurationResolverExpression.parse(config as object);
			for (const replacement of expression.unresolved()) {
				if (Object.prototype.hasOwnProperty.call(resolutions, replacement.id)) {
					expression.resolve(replacement, resolutions[replacement.id]);
				} else if (replacement.name === 'input' || replacement.name === 'command') {
					expression.resolve(replacement, replacement.id);
				}
			}
			return expression.toObject();
		},
	} as unknown as IConfigurationResolverService;
}

function getUndefinedMcpConfigPath(arg: IWorkbenchLocalMcpServer): IMcpConfigPath | undefined;
function getUndefinedMcpConfigPath(arg: URI): Promise<IMcpConfigPath | undefined>;
function getUndefinedMcpConfigPath(arg: IWorkbenchLocalMcpServer | URI): IMcpConfigPath | undefined | Promise<IMcpConfigPath | undefined> {
	return URI.isUri(arg) ? Promise.resolve(undefined) : undefined;
}

async function assess(servers: readonly IMcpServer[], roots: readonly URI[] | undefined) {
	const result = await assessMcpServersForCopilotAgentHost(
		servers,
		makeConfigurationResolverService(),
		'agent-host-copilotcli',
		roots,
		LazyCollectionState.AllKnown,
	);
	assert.ok(result);
	return result;
}
