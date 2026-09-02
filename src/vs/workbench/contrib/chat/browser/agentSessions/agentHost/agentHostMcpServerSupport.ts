/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../../../base/common/iterator.js';
import { isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Location } from '../../../../../../editor/common/languages.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IMcpSandboxConfiguration, IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IWorkspaceFolderData } from '../../../../../../platform/workspace/common/workspace.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IAgentHostMcpServerSupportCoverage } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { ExternalDiscoverySource } from '../../../../mcp/common/mcpConfiguration.js';
import { CURSOR_WORKSPACE_MCP_COLLECTION_ID_PREFIX, extensionMcpCollectionPrefix, extensionPrefixedIdentifier, getMcpCollectionProvenance, IMcpConfigPath, IMcpServer, LazyCollectionState, MCP_CONFIGURATION_COLLECTION_ID_PREFIX, MCP_PLUGIN_COLLECTION_ID_PREFIX, McpCollectionDefinition, McpCollectionProvenance, McpServerDefinition, McpServerEnablementState, McpServerLaunch, McpServerTransportType, WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { isCopilotCliSessionType } from './agentHostToolSetEnablementService.js';

const COPILOT_CHAT_EXTENSION_ID = 'github.copilot-chat';
const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = 'agent-host-';
const AGENT_HOST_PROVIDERS_WITH_GITHUB_MCP = new Set(['copilotcli', 'claude', 'codex']);

export const COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID = extensionPrefixedIdentifier(new ExtensionIdentifier(COPILOT_CHAT_EXTENSION_ID), 'github');

export const enum AgentHostMcpServerDelivery {
	ClientForwarded = 'clientForwarded',
	RuntimeDiscovered = 'runtimeDiscovered',
	AgentPlugin = 'agentPlugin',
	ProviderBuiltIn = 'providerBuiltIn',
	NotDelivered = 'notDelivered',
	Unknown = 'unknown',
}

export const enum AgentHostMcpServerApplicability {
	Applicable = 'applicable',
	OutsideCurrentScope = 'outsideCurrentScope',
	Unknown = 'unknown',
}

export const enum AgentHostMcpServerEnablementState {
	EnabledProfile = 'enabledProfile',
	EnabledWorkspace = 'enabledWorkspace',
	DisabledProfile = 'disabledProfile',
	DisabledWorkspace = 'disabledWorkspace',
	DisabledByAccess = 'disabledByAccess',
	DisabledNotRegistered = 'disabledNotRegistered',
}

export const enum AgentHostMcpServerSourceKind {
	UserProfile = 'userProfile',
	RemoteUser = 'remoteUser',
	VscodeWorkspaceFolder = 'vscodeWorkspaceFolder',
	WorkspaceConfiguration = 'workspaceConfiguration',
	WorkspaceDotMcp = 'workspaceDotMcp',
	ClaudeDesktop = 'claudeDesktop',
	Windsurf = 'windsurf',
	CursorUser = 'cursorUser',
	CursorWorkspace = 'cursorWorkspace',
	Extension = 'extension',
	AgentPlugin = 'agentPlugin',
	Unknown = 'unknown',
}

export const enum AgentHostMcpSupportReason {
	UnsupportedSourceLocation = 'unsupportedSourceLocation',
	RequiresUserInteraction = 'requiresUserInteraction',
	UnresolvedConfiguration = 'unresolvedConfiguration',
	LaunchNotRepresentable = 'launchNotRepresentable',
	EnvironmentFileIgnored = 'environmentFileIgnored',
	SandboxConfigurationIgnored = 'sandboxConfigurationIgnored',
	DevelopmentModeIgnored = 'developmentModeIgnored',
	OAuthClientConfigurationIgnored = 'oauthClientConfigurationIgnored',
	DefinitionNotLoaded = 'definitionNotLoaded',
	SourceUnknown = 'sourceUnknown',
}

export type AgentHostMcpServerCompatibility =
	| { readonly kind: 'supported' }
	| { readonly kind: 'partiallySupported'; readonly reasons: readonly AgentHostMcpSupportReason[] }
	| { readonly kind: 'unsupported'; readonly reasons: readonly AgentHostMcpSupportReason[] }
	| { readonly kind: 'unknown'; readonly reasons: readonly AgentHostMcpSupportReason[] };

/** Client-side enablement, reported independently of Agent Host compatibility. */
export interface IAgentHostMcpServerEnablement {
	readonly enabled: boolean;
	readonly state: AgentHostMcpServerEnablementState;
}

/** The configuration origin used to explain an MCP support result. */
export interface IAgentHostMcpServerSource {
	readonly group: AICustomizationSource | undefined;
	readonly kind: AgentHostMcpServerSourceKind;
	readonly label: string;
	readonly collectionUri: URI | undefined;
	readonly definitionLocation: Location | undefined;
	readonly remoteAuthority: string | null;
	readonly extensionId: string | undefined;
	readonly pluginUri: URI | undefined;
}

/** The independent support dimensions for one MCP server known to the client. */
export interface IAgentHostMcpServerSupport {
	readonly id: string;
	readonly name: string;
	readonly collectionId: string;
	readonly source: IAgentHostMcpServerSource;
	/** Whether the client currently enables the server. */
	readonly enablement: IAgentHostMcpServerEnablement;
	/** Whether the server belongs to the requested working-directory scope. */
	readonly applicability: AgentHostMcpServerApplicability;
	/** Which process is expected to provide the server to the Agent Host. */
	readonly delivery: AgentHostMcpServerDelivery;
	/** Whether that delivery preserves the configuration's behavior. */
	readonly compatibility: AgentHostMcpServerCompatibility;
}

export interface IAgentHostMcpServerSupportAssessment {
	readonly servers: readonly IAgentHostMcpServerSupport[];
	/** Whether all lazy MCP collections known to the client have loaded. */
	readonly discoveryComplete: boolean;
}

export interface IAgentHostMcpServerSupportSnapshot extends IAgentHostMcpServerSupportAssessment {
	readonly coverage: IAgentHostMcpServerSupportCoverage;
}

/** Internal delivery data shared by support reporting and the actual forwarding path. */
export interface IAgentHostMcpServerDeliveryResolution {
	readonly server: IMcpServer;
	readonly definition: McpServerDefinition | undefined;
	readonly applicability: AgentHostMcpServerApplicability;
	readonly delivery: AgentHostMcpServerDelivery;
	readonly compatibility: AgentHostMcpServerCompatibility;
	readonly source: IAgentHostMcpServerSource;
	readonly projectedConfiguration: IMcpServerConfiguration | undefined;
}

export interface IAgentHostInstalledMcpServer {
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly configuration: IMcpServerConfiguration;
	readonly configPath: IMcpConfigPath | undefined;
	readonly sandbox: IMcpSandboxConfiguration | undefined;
	readonly runtimeState: McpServerEnablementState | undefined;
}

export function agentHostProviderHasBuiltInGitHubMcpServer(provider: string): boolean {
	return AGENT_HOST_PROVIDERS_WITH_GITHUB_MCP.has(provider);
}

export async function assessMcpServersForCopilotAgentHost(
	servers: readonly IMcpServer[],
	configurationResolverService: IConfigurationResolverService,
	sessionType: string,
	workingDirectories: readonly URI[] | undefined,
	lazyCollectionState: LazyCollectionState,
): Promise<IAgentHostMcpServerSupportAssessment | undefined> {
	if (!isCopilotCliSessionType(sessionType)) {
		return undefined;
	}

	const resolved = await resolveMcpServersForAgentHostDelivery(servers, configurationResolverService, sessionType, workingDirectories);
	return {
		servers: resolved.map(({ server, source, applicability, delivery, compatibility }) => ({
			id: server.definition.id,
			name: server.definition.label,
			collectionId: server.collection.id,
			source,
			enablement: getMcpServerEnablement(server),
			applicability,
			delivery,
			compatibility,
		})),
		discoveryComplete: lazyCollectionState === LazyCollectionState.AllKnown,
	};
}

export async function mergeInstalledMcpServersIntoAgentHostSupportAssessment(
	assessment: IAgentHostMcpServerSupportAssessment,
	installedServers: readonly IAgentHostInstalledMcpServer[],
	configurationResolverService: IConfigurationResolverService,
	workingDirectories: readonly URI[] | undefined,
): Promise<IAgentHostMcpServerSupportAssessment> {
	const installedById = new Map(installedServers.map(server => [server.id, server]));
	const servers = assessment.servers.map(server => {
		const installed = installedById.get(server.id);
		const runtimeState = installed?.runtimeState;
		const enablement = getInstalledMcpServerEnablementOverride(runtimeState);
		return enablement ? {
			...server,
			enablement,
			delivery: runtimeState === McpServerEnablementState.DisabledByAccess
				? AgentHostMcpServerDelivery.NotDelivered
				: server.delivery,
		} : server;
	});
	const assessedIds = new Set(servers.map(server => server.id));
	const missingDisabledServers = await Promise.all(installedServers
		.filter(server => !assessedIds.has(server.id) && server.runtimeState !== McpServerEnablementState.Enabled)
		.map(server => assessDisabledInstalledMcpServer(server, configurationResolverService, workingDirectories)));
	return {
		...assessment,
		servers: [...servers, ...missingDisabledServers],
	};
}

export function resolveMcpServersForAgentHostDelivery(
	servers: readonly IMcpServer[],
	configurationResolverService: IConfigurationResolverService,
	sessionType: string,
	workingDirectories: readonly URI[] | undefined,
): Promise<readonly IAgentHostMcpServerDeliveryResolution[]> {
	return Promise.all(servers.map(server => resolveMcpServerForAgentHostDelivery(server, configurationResolverService, sessionType, workingDirectories)));
}

async function resolveMcpServerForAgentHostDelivery(
	server: IMcpServer,
	configurationResolverService: IConfigurationResolverService,
	sessionType: string,
	workingDirectories: readonly URI[] | undefined,
): Promise<IAgentHostMcpServerDeliveryResolution> {
	const definitions = server.readDefinitions().get();
	const definition = definitions.server;
	const collection = definitions.collection;
	const source = getMcpServerSource(server, collection, definition);
	const applicability = getMcpServerApplicability(collection, source.kind, workingDirectories);

	if (isPluginCollection(server, collection)) {
		return createResolution(server, definition, source, applicability, AgentHostMcpServerDelivery.AgentPlugin, supported());
	}

	if (isProviderBuiltInReplacement(server, collection, sessionType)) {
		return createResolution(server, definition, source, applicability, AgentHostMcpServerDelivery.ProviderBuiltIn, supported());
	}

	if (!definition?.launch) {
		return createResolution(server, definition, source, applicability, AgentHostMcpServerDelivery.Unknown, unknown([AgentHostMcpSupportReason.DefinitionNotLoaded]));
	}

	if (source.kind === AgentHostMcpServerSourceKind.WorkspaceDotMcp) {
		return createResolution(
			server,
			definition,
			source,
			applicability,
			applicability === AgentHostMcpServerApplicability.Applicable ? AgentHostMcpServerDelivery.RuntimeDiscovered : deliveryForInapplicable(applicability),
			supported(),
		);
	}

	if (collection && McpCollectionDefinition.isWorkspaceDiscovered(collection) && !McpCollectionDefinition.isVscodeMcpJson(collection)) {
		return createResolution(
			server,
			definition,
			source,
			applicability,
			AgentHostMcpServerDelivery.NotDelivered,
			unsupported([AgentHostMcpSupportReason.UnsupportedSourceLocation]),
		);
	}

	let projectedConfiguration = projectMcpServerConfiguration(definition.launch);
	if (!projectedConfiguration) {
		return createResolution(
			server,
			definition,
			source,
			applicability,
			AgentHostMcpServerDelivery.NotDelivered,
			unsupported([AgentHostMcpSupportReason.LaunchNotRepresentable]),
		);
	}

	const unsupportedReasons: AgentHostMcpSupportReason[] = [];
	if (collection && McpCollectionDefinition.isVscodeMcpJson(collection)) {
		const resolved = await resolveMcpConfigurationForSync(configurationResolverService, definition.variableReplacement?.folder, projectedConfiguration);
		if (resolved.kind === 'error') {
			unsupportedReasons.push(resolved.reason);
		} else {
			projectedConfiguration = resolved.configuration;
		}
	} else {
		const unresolvedReason = getUnresolvedConfigurationReason(projectedConfiguration);
		if (unresolvedReason) {
			unsupportedReasons.push(unresolvedReason);
		}
	}

	const partialReasons = getPartialSupportReasons(definition.launch, definition.sandboxEnabled, definition.devMode);
	const unknownReasons = source.kind === AgentHostMcpServerSourceKind.Unknown ? [AgentHostMcpSupportReason.SourceUnknown] : [];
	const delivery = applicability === AgentHostMcpServerApplicability.Applicable
		? AgentHostMcpServerDelivery.ClientForwarded
		: deliveryForInapplicable(applicability);

	return {
		server,
		definition,
		source,
		applicability,
		delivery: unsupportedReasons.length > 0 && collection && McpCollectionDefinition.isVscodeMcpJson(collection)
			? AgentHostMcpServerDelivery.NotDelivered
			: delivery,
		compatibility: getCompatibility(unsupportedReasons, partialReasons, unknownReasons),
		projectedConfiguration,
	};
}

function createResolution(
	server: IMcpServer,
	definition: McpServerDefinition | undefined,
	source: IAgentHostMcpServerSource,
	applicability: AgentHostMcpServerApplicability,
	delivery: AgentHostMcpServerDelivery,
	compatibility: AgentHostMcpServerCompatibility,
): IAgentHostMcpServerDeliveryResolution {
	return { server, definition, source, applicability, delivery, compatibility, projectedConfiguration: undefined };
}

function getMcpServerSource(server: IMcpServer, collection: McpCollectionDefinition | undefined, definition: McpServerDefinition | undefined): IAgentHostMcpServerSource {
	const kind = getMcpServerSourceKind(server, collection);
	return {
		group: getMcpServerSourceGroup(kind),
		kind,
		label: collection?.label ?? server.collection.label,
		collectionUri: collection?.presentation?.origin,
		definitionLocation: definition?.presentation?.origin,
		remoteAuthority: collection?.remoteAuthority ?? null,
		extensionId: collection?.source instanceof ExtensionIdentifier ? collection.source.value : undefined,
		pluginUri: getPluginUri(server, collection),
	};
}

function getMcpServerSourceKind(server: IMcpServer, collection: McpCollectionDefinition | undefined): AgentHostMcpServerSourceKind {
	const provenanceKind = getMcpCollectionSourceKind(collection?.provenance, collection?.discoverySource);
	if (provenanceKind !== undefined) {
		return provenanceKind;
	}

	const collectionId = collection?.id ?? server.collection.id;
	if (collectionId.startsWith(MCP_PLUGIN_COLLECTION_ID_PREFIX)) {
		return AgentHostMcpServerSourceKind.AgentPlugin;
	}
	if (collectionId.startsWith(WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX)) {
		return AgentHostMcpServerSourceKind.WorkspaceDotMcp;
	}
	if (collectionId.startsWith(CURSOR_WORKSPACE_MCP_COLLECTION_ID_PREFIX)) {
		return AgentHostMcpServerSourceKind.CursorWorkspace;
	}
	if (collectionId.startsWith(`${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}ws`)) {
		return AgentHostMcpServerSourceKind.VscodeWorkspaceFolder;
	}
	if (collectionId === `${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}workspace`) {
		return AgentHostMcpServerSourceKind.WorkspaceConfiguration;
	}
	if (collectionId === `${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}usrlocal`) {
		return AgentHostMcpServerSourceKind.UserProfile;
	}
	if (collectionId === `${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}usrremote`) {
		return AgentHostMcpServerSourceKind.RemoteUser;
	}
	if (collectionId.startsWith(extensionMcpCollectionPrefix) || collection?.source instanceof ExtensionIdentifier) {
		return AgentHostMcpServerSourceKind.Extension;
	}
	return AgentHostMcpServerSourceKind.Unknown;
}

function getMcpCollectionSourceKind(provenance: McpCollectionProvenance | undefined, discoverySource: ExternalDiscoverySource | undefined): AgentHostMcpServerSourceKind | undefined {
	switch (provenance) {
		case McpCollectionProvenance.UserProfile:
			return AgentHostMcpServerSourceKind.UserProfile;
		case McpCollectionProvenance.RemoteUser:
			return AgentHostMcpServerSourceKind.RemoteUser;
		case McpCollectionProvenance.WorkspaceConfiguration:
			return AgentHostMcpServerSourceKind.WorkspaceConfiguration;
		case McpCollectionProvenance.WorkspaceFolderConfiguration:
			return AgentHostMcpServerSourceKind.VscodeWorkspaceFolder;
		case McpCollectionProvenance.WorkspaceDotMcp:
			return AgentHostMcpServerSourceKind.WorkspaceDotMcp;
		case McpCollectionProvenance.ExternalConfiguration:
			return getExternalConfigurationSourceKind(discoverySource);
		case McpCollectionProvenance.Extension:
			return AgentHostMcpServerSourceKind.Extension;
		case McpCollectionProvenance.Plugin:
			return AgentHostMcpServerSourceKind.AgentPlugin;
		default:
			return undefined;
	}
}

function getExternalConfigurationSourceKind(discoverySource: ExternalDiscoverySource | undefined): AgentHostMcpServerSourceKind {
	switch (discoverySource) {
		case ExternalDiscoverySource.ClaudeDesktop:
			return AgentHostMcpServerSourceKind.ClaudeDesktop;
		case ExternalDiscoverySource.Windsurf:
			return AgentHostMcpServerSourceKind.Windsurf;
		case ExternalDiscoverySource.CursorGlobal:
			return AgentHostMcpServerSourceKind.CursorUser;
		case ExternalDiscoverySource.CursorWorkspace:
			return AgentHostMcpServerSourceKind.CursorWorkspace;
		default:
			return AgentHostMcpServerSourceKind.Unknown;
	}
}

function getMcpServerSourceGroup(kind: AgentHostMcpServerSourceKind): AICustomizationSource | undefined {
	switch (kind) {
		case AgentHostMcpServerSourceKind.UserProfile:
		case AgentHostMcpServerSourceKind.RemoteUser:
		case AgentHostMcpServerSourceKind.ClaudeDesktop:
		case AgentHostMcpServerSourceKind.Windsurf:
		case AgentHostMcpServerSourceKind.CursorUser:
			return AICustomizationSources.user;
		case AgentHostMcpServerSourceKind.VscodeWorkspaceFolder:
		case AgentHostMcpServerSourceKind.WorkspaceConfiguration:
		case AgentHostMcpServerSourceKind.WorkspaceDotMcp:
		case AgentHostMcpServerSourceKind.CursorWorkspace:
			return AICustomizationSources.local;
		case AgentHostMcpServerSourceKind.Extension:
			return AICustomizationSources.extension;
		case AgentHostMcpServerSourceKind.AgentPlugin:
			return AICustomizationSources.plugin;
		case AgentHostMcpServerSourceKind.Unknown:
			return undefined;
	}
}

function getMcpServerApplicability(
	collection: McpCollectionDefinition | undefined,
	sourceKind: AgentHostMcpServerSourceKind,
	workingDirectories: readonly URI[] | undefined,
): AgentHostMcpServerApplicability {
	return getMcpConfigurationApplicability(collection?.configTarget, collection?.presentation?.origin, sourceKind, workingDirectories);
}

function getMcpConfigurationApplicability(
	configTarget: ConfigurationTarget | undefined,
	origin: URI | undefined,
	sourceKind: AgentHostMcpServerSourceKind,
	workingDirectories: readonly URI[] | undefined,
): AgentHostMcpServerApplicability {
	if (configTarget !== ConfigurationTarget.WORKSPACE && configTarget !== ConfigurationTarget.WORKSPACE_FOLDER) {
		return AgentHostMcpServerApplicability.Applicable;
	}
	if (workingDirectories === undefined) {
		return AgentHostMcpServerApplicability.Unknown;
	}
	if (workingDirectories.length === 0) {
		return AgentHostMcpServerApplicability.OutsideCurrentScope;
	}
	if (sourceKind === AgentHostMcpServerSourceKind.WorkspaceConfiguration) {
		return AgentHostMcpServerApplicability.Applicable;
	}
	return origin && workingDirectories.some(workingDirectory => isEqualOrParent(origin, workingDirectory))
		? AgentHostMcpServerApplicability.Applicable
		: AgentHostMcpServerApplicability.OutsideCurrentScope;
}

function getMcpServerEnablement(server: IMcpServer): IAgentHostMcpServerEnablement {
	switch (server.enablement.get()) {
		case ContributionEnablementState.EnabledProfile:
			return { enabled: true, state: AgentHostMcpServerEnablementState.EnabledProfile };
		case ContributionEnablementState.EnabledWorkspace:
			return { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace };
		case ContributionEnablementState.DisabledProfile:
			return { enabled: false, state: AgentHostMcpServerEnablementState.DisabledProfile };
		case ContributionEnablementState.DisabledWorkspace:
			return { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace };
	}
}

function getInstalledMcpServerEnablementOverride(runtimeState: McpServerEnablementState | undefined): IAgentHostMcpServerEnablement | undefined {
	switch (runtimeState) {
		case McpServerEnablementState.Disabled:
			return { enabled: false, state: AgentHostMcpServerEnablementState.DisabledNotRegistered };
		case McpServerEnablementState.DisabledByAccess:
			return { enabled: false, state: AgentHostMcpServerEnablementState.DisabledByAccess };
		case McpServerEnablementState.DisabledProfile:
			return { enabled: false, state: AgentHostMcpServerEnablementState.DisabledProfile };
		case McpServerEnablementState.DisabledWorkspace:
			return { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace };
		case McpServerEnablementState.Enabled:
		case undefined:
			return undefined;
	}
}

async function assessDisabledInstalledMcpServer(
	server: IAgentHostInstalledMcpServer,
	configurationResolverService: IConfigurationResolverService,
	workingDirectories: readonly URI[] | undefined,
): Promise<IAgentHostMcpServerSupport> {
	const sourceKind = getMcpConfigurationSourceKind(server.configPath?.target);
	const compatibility = await getInstalledMcpServerCompatibility(server, sourceKind, configurationResolverService);
	const collectionId = server.configPath
		? `${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}${server.configPath.id}`
		: getCollectionIdFromInstalledServer(server);
	return {
		id: server.id,
		name: server.name,
		collectionId,
		source: {
			group: getMcpServerSourceGroup(sourceKind),
			kind: sourceKind,
			label: server.configPath?.label ?? server.label,
			collectionUri: server.configPath?.uri,
			definitionLocation: undefined,
			remoteAuthority: server.configPath?.remoteAuthority ?? null,
			extensionId: undefined,
			pluginUri: undefined,
		},
		enablement: getInstalledMcpServerEnablementOverride(server.runtimeState) ?? {
			enabled: false,
			state: AgentHostMcpServerEnablementState.DisabledNotRegistered,
		},
		applicability: getMcpConfigurationApplicability(server.configPath?.target, server.configPath?.uri, sourceKind, workingDirectories),
		delivery: AgentHostMcpServerDelivery.NotDelivered,
		compatibility,
	};
}

function getCollectionIdFromInstalledServer(server: IAgentHostInstalledMcpServer): string {
	const nameSuffix = `.${server.name}`;
	return server.id.endsWith(nameSuffix)
		? server.id.slice(0, -nameSuffix.length)
		: `${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}unknown`;
}

function getMcpConfigurationSourceKind(configTarget: ConfigurationTarget | undefined): AgentHostMcpServerSourceKind {
	return getMcpCollectionSourceKind(getMcpCollectionProvenance(configTarget), undefined)
		?? AgentHostMcpServerSourceKind.Unknown;
}

async function getInstalledMcpServerCompatibility(
	server: IAgentHostInstalledMcpServer,
	sourceKind: AgentHostMcpServerSourceKind,
	configurationResolverService: IConfigurationResolverService,
): Promise<AgentHostMcpServerCompatibility> {
	if (sourceKind === AgentHostMcpServerSourceKind.WorkspaceConfiguration) {
		return unsupported([AgentHostMcpSupportReason.UnsupportedSourceLocation]);
	}
	const launch = McpServerLaunch.fromServerConfiguration(server.configuration, server.sandbox);
	if (!launch) {
		return unsupported([AgentHostMcpSupportReason.LaunchNotRepresentable]);
	}
	const projectedConfiguration = projectMcpServerConfiguration(launch);
	if (!projectedConfiguration) {
		return unsupported([AgentHostMcpSupportReason.LaunchNotRepresentable]);
	}

	const unsupportedReasons: AgentHostMcpSupportReason[] = [];
	if (server.configPath?.target === ConfigurationTarget.WORKSPACE_FOLDER) {
		const resolved = await resolveMcpConfigurationForSync(configurationResolverService, server.configPath.workspaceFolder, projectedConfiguration);
		if (resolved.kind === 'error') {
			unsupportedReasons.push(resolved.reason);
		}
	} else {
		const unresolvedReason = getUnresolvedConfigurationReason(projectedConfiguration);
		if (unresolvedReason) {
			unsupportedReasons.push(unresolvedReason);
		}
	}

	const partialReasons = getPartialSupportReasons(
		launch,
		server.configuration.type === McpServerType.LOCAL ? server.configuration.sandboxEnabled : undefined,
		server.configuration.dev,
	);
	const unknownReasons = sourceKind === AgentHostMcpServerSourceKind.Unknown ? [AgentHostMcpSupportReason.SourceUnknown] : [];
	return getCompatibility(unsupportedReasons, partialReasons, unknownReasons);
}

function isPluginCollection(server: IMcpServer, collection: McpCollectionDefinition | undefined): boolean {
	return collection?.provenance === McpCollectionProvenance.Plugin
		|| server.collection.id.startsWith(MCP_PLUGIN_COLLECTION_ID_PREFIX);
}

function getPluginUri(server: IMcpServer, collection: McpCollectionDefinition | undefined): URI | undefined {
	if (!isPluginCollection(server, collection)) {
		return undefined;
	}
	const collectionId = collection?.id ?? server.collection.id;
	return collectionId.startsWith(MCP_PLUGIN_COLLECTION_ID_PREFIX)
		? URI.parse(collectionId.slice(MCP_PLUGIN_COLLECTION_ID_PREFIX.length))
		: undefined;
}

function isProviderBuiltInReplacement(server: IMcpServer, collection: McpCollectionDefinition | undefined, sessionType: string): boolean {
	return hasBuiltInGitHubMcpServer(sessionType)
		&& server.collection.id === COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID
		&& collection?.source instanceof ExtensionIdentifier
		&& ExtensionIdentifier.equals(collection.source, COPILOT_CHAT_EXTENSION_ID);
}

function hasBuiltInGitHubMcpServer(sessionType: string): boolean {
	const localProvider = sessionType.startsWith(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX)
		? sessionType.slice(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX.length)
		: undefined;
	return agentHostProviderHasBuiltInGitHubMcpServer(localProvider ?? '');
}

function deliveryForInapplicable(applicability: AgentHostMcpServerApplicability): AgentHostMcpServerDelivery {
	return applicability === AgentHostMcpServerApplicability.Unknown
		? AgentHostMcpServerDelivery.Unknown
		: AgentHostMcpServerDelivery.NotDelivered;
}

function projectMcpServerConfiguration(launch: McpServerLaunch): IMcpServerConfiguration | undefined {
	switch (launch.type) {
		case McpServerTransportType.Stdio:
			if (!launch.command) {
				return undefined;
			}
			return {
				type: McpServerType.LOCAL,
				command: launch.command,
				args: launch.args.length > 0 ? [...launch.args] : undefined,
				env: Object.keys(launch.env).length > 0 ? { ...launch.env } : undefined,
				envFile: launch.envFile,
				cwd: launch.cwd,
			};
		case McpServerTransportType.HTTP:
			return {
				type: McpServerType.REMOTE,
				transport: launch.transport === 'sse' ? 'sse' : 'http',
				url: launch.uri.toString(),
				headers: launch.headers.length > 0 ? Object.fromEntries(launch.headers) : undefined,
			};
	}
}

async function resolveMcpConfigurationForSync(
	configurationResolverService: IConfigurationResolverService,
	folder: IWorkspaceFolderData | undefined,
	configuration: IMcpServerConfiguration,
): Promise<{ readonly kind: 'success'; readonly configuration: IMcpServerConfiguration } | { readonly kind: 'error'; readonly reason: AgentHostMcpSupportReason }> {
	const expression = ConfigurationResolverExpression.parse(configuration);
	const unresolvedReason = getExpressionUnresolvedReason(expression);
	if (unresolvedReason === AgentHostMcpSupportReason.RequiresUserInteraction) {
		return { kind: 'error', reason: unresolvedReason };
	}

	try {
		await configurationResolverService.resolveAsync(folder, expression);
	} catch {
		return { kind: 'error', reason: AgentHostMcpSupportReason.UnresolvedConfiguration };
	}

	if (!Iterable.isEmpty(expression.unresolved())) {
		return { kind: 'error', reason: AgentHostMcpSupportReason.UnresolvedConfiguration };
	}
	return { kind: 'success', configuration: expression.toObject() };
}

function getUnresolvedConfigurationReason(configuration: IMcpServerConfiguration): AgentHostMcpSupportReason | undefined {
	return getExpressionUnresolvedReason(ConfigurationResolverExpression.parse(configuration));
}

function getExpressionUnresolvedReason(expression: ConfigurationResolverExpression<IMcpServerConfiguration>): AgentHostMcpSupportReason | undefined {
	let hasUnresolved = false;
	for (const replacement of expression.unresolved()) {
		if (replacement.name === 'input' || replacement.name === 'command') {
			return AgentHostMcpSupportReason.RequiresUserInteraction;
		}
		hasUnresolved = true;
	}
	return hasUnresolved ? AgentHostMcpSupportReason.UnresolvedConfiguration : undefined;
}

function getPartialSupportReasons(launch: McpServerLaunch, sandboxEnabled: boolean | undefined, devMode: McpServerDefinition['devMode']): AgentHostMcpSupportReason[] {
	const reasons: AgentHostMcpSupportReason[] = [];
	if (launch.type === McpServerTransportType.Stdio) {
		if (launch.envFile) {
			reasons.push(AgentHostMcpSupportReason.EnvironmentFileIgnored);
		}
		if (launch.sandbox || sandboxEnabled) {
			reasons.push(AgentHostMcpSupportReason.SandboxConfigurationIgnored);
		}
	} else if (launch.oauth) {
		reasons.push(AgentHostMcpSupportReason.OAuthClientConfigurationIgnored);
	}
	if (devMode) {
		reasons.push(AgentHostMcpSupportReason.DevelopmentModeIgnored);
	}
	return reasons;
}

function getCompatibility(
	unsupportedReasons: readonly AgentHostMcpSupportReason[],
	partialReasons: readonly AgentHostMcpSupportReason[],
	unknownReasons: readonly AgentHostMcpSupportReason[],
): AgentHostMcpServerCompatibility {
	if (unsupportedReasons.length > 0) {
		return unsupported(unsupportedReasons);
	}
	if (unknownReasons.length > 0) {
		return unknown(unknownReasons);
	}
	if (partialReasons.length > 0) {
		return { kind: 'partiallySupported', reasons: partialReasons };
	}
	return supported();
}

function supported(): AgentHostMcpServerCompatibility {
	return { kind: 'supported' };
}

function unsupported(reasons: readonly AgentHostMcpSupportReason[]): AgentHostMcpServerCompatibility {
	return { kind: 'unsupported', reasons };
}

function unknown(reasons: readonly AgentHostMcpSupportReason[]): AgentHostMcpServerCompatibility {
	return { kind: 'unknown', reasons };
}
