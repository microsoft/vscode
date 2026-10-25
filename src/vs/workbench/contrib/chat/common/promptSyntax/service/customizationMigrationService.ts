/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { getComparisonKey } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import { PromptsStorage } from './promptsService.js';

export const ICustomizationMigrationService = createDecorator<ICustomizationMigrationService>('customizationMigrationService');

export enum CustomizationMigrationType {
	UserData = 'userData',
	PromptFiles = 'promptFiles',
	ConfiguredLocations = 'configuredLocations',
	McpServers = 'mcpServers',
	PluginMarketplaces = 'pluginMarketplaces',
	ChatParticipants = 'chatParticipants',
	ToolSets = 'toolSets',
}

export type GuidanceCustomizationMigrationType = CustomizationMigrationType.ChatParticipants | CustomizationMigrationType.ToolSets;

export interface ICustomizationMigrationGuidanceItem {
	readonly id: string;
	readonly name: string;
	readonly sourceLabel: string;
	readonly sourceUri?: URI;
	readonly storage: PromptsStorage.user | PromptsStorage.extension;
	readonly extensionId?: string;
}

export interface GuidanceCustomizationMigration {
	readonly type: GuidanceCustomizationMigrationType;
	readonly items: readonly ICustomizationMigrationGuidanceItem[];
}

export interface MigratableConfiguration {
	readonly uri: URI;
	readonly type: PromptsType;
	readonly storage: PromptsStorage;
	readonly name?: string;
	readonly description?: string;
	readonly source?: PromptFileSource;
	readonly workspaceGroupId?: string;
}

export function getCustomizationMigrationTargetType(customization: MigratableConfiguration): PromptsType {
	return customization.type === PromptsType.prompt ? PromptsType.skill : customization.type;
}

export function isPromptFileMigrationCandidate(customization: MigratableConfiguration): boolean {
	return customization.type === PromptsType.prompt
		&& (customization.storage === PromptsStorage.local || customization.storage === PromptsStorage.user);
}

export function isUserDataMigrationCandidate(customization: MigratableConfiguration): boolean {
	return customization.source === PromptFileSource.UserData
		&& (customization.type === PromptsType.agent || customization.type === PromptsType.instructions);
}

export function isConfiguredLocationMigrationCandidate(customization: MigratableConfiguration): boolean {
	return (customization.source === PromptFileSource.ConfigWorkspace || customization.source === PromptFileSource.ConfigPersonal)
		&& (customization.type === PromptsType.agent || customization.type === PromptsType.instructions || customization.type === PromptsType.skill);
}

export type FileCustomizationMigrationType = CustomizationMigrationType.UserData | CustomizationMigrationType.PromptFiles | CustomizationMigrationType.ConfiguredLocations;

export interface FileCustomizationMigration {
	readonly type: FileCustomizationMigrationType;
	readonly files: readonly URI[];
	readonly candidates: readonly MigratableConfiguration[];
}

export interface IMcpServerCustomizationMigrationItem {
	readonly id: string;
	readonly name: string;
	/** Whether Agent Host delivery fully supports this server's configuration. */
	readonly supported: boolean;
}

export const mcpServerCustomizationMigrationRemovableProperties = ['gallery', 'version', 'dev', 'sandboxEnabled'] as const;

/**
 * The parts of an `inputs` declaration that determine how an `${input:id}` reference
 * is migrated to an environment variable.
 */
export interface IMcpServerCustomizationMigrationInputDeclaration {
	readonly type: 'promptString' | 'pickString';
	readonly default?: string;
	/** The values of a `pickString` input's options. */
	readonly options?: readonly string[];
}

/** An input that a migrated server reads from an environment variable instead. */
export interface IMcpServerCustomizationMigrationVariable {
	/** The input id. */
	readonly id: string;
	/** The environment variable that replaces it. */
	readonly name: string;
	/** Its declaration, retained to revalidate it before writing. */
	readonly declaration: IMcpServerCustomizationMigrationInputDeclaration;
}

/** A setting that a migrated server reads from an environment variable set to the setting's value when migrating. */
export interface IMcpServerCustomizationMigrationSettingVariable {
	/** The setting key, as referenced by `${config:key}`. */
	readonly key: string;
	/** The environment variable that replaces it. */
	readonly name: string;
	/**
	 * The setting's value as text, retained to revalidate it before writing. Empty if the setting is unset,
	 * not a string or number, or its value contains a variable, or for a workspace server, if the value is
	 * not from the workspace or folder settings.
	 */
	readonly value: string;
}

export interface IMcpServerCustomizationMigrationCandidate {
	readonly type: CustomizationMigrationType.McpServers;
	readonly storage: PromptsStorage.local | PromptsStorage.user;
	readonly id: string;
	readonly name: string;
	readonly sourceUri: URI;
	readonly targetUri: URI;
	readonly projectedConfiguration: IMcpServerConfiguration;
	/**
	 * Configuration written to the destination when it differs from {@link projectedConfiguration},
	 * because `${env:NAME}` references are rewritten to `${NAME}` instead of their current values, and
	 * `${input:}` and `${config:}` references to environment variables.
	 */
	readonly migratedConfiguration?: IMcpServerConfiguration;
	/**
	 * The inputs that the server reads from environment variables once migrated, in order of first
	 * appearance. Retained to revalidate them before writing, since a change such as to an input's type
	 * can leave {@link migratedConfiguration} unchanged.
	 */
	readonly environmentVariables?: readonly IMcpServerCustomizationMigrationVariable[];
	/**
	 * The settings that the server reads from environment variables once migrated, in order of first
	 * appearance. Retained to revalidate their values before writing.
	 */
	readonly settingVariables?: readonly IMcpServerCustomizationMigrationSettingVariable[];
	/** Raw values of properties removed with a warning, retained to revalidate the user's confirmation. */
	readonly removedProperties?: Readonly<Partial<Record<typeof mcpServerCustomizationMigrationRemovableProperties[number], unknown>>>;
	/** The OAuth client of a remote server, which the projected configuration does not include. */
	readonly oauth?: IMcpServerCustomizationMigrationOAuthClient;
}

export interface IMcpServerCustomizationMigrationOAuthClient {
	readonly clientId: string;
}

export function getMcpServerCustomizationMigrationCandidateKey(candidate: IMcpServerCustomizationMigrationCandidate): string {
	return JSON.stringify([
		candidate.id,
		candidate.name,
		getComparisonKey(candidate.sourceUri),
		getComparisonKey(candidate.targetUri),
	]);
}

export interface IAgentHostMcpServerSupportCoverage {
	/** Some installed servers may be absent or disabled because MCP access is restricted. */
	readonly restrictedByMcpAccess: boolean;
	/** Customization policy may prevent otherwise supported servers from reaching the Agent Host. */
	readonly restrictedByCustomizationPolicy: boolean;
}

export interface McpServerCustomizationMigration {
	readonly type: CustomizationMigrationType.McpServers;
	readonly servers: readonly IMcpServerCustomizationMigrationItem[];
	readonly candidates: readonly IMcpServerCustomizationMigrationCandidate[];
	readonly exclusions: readonly IMcpServerCustomizationMigrationExclusion[];
	/** Whether all lazy MCP collections known to the client have loaded; when false, servers may be missing. */
	readonly discoveryComplete: boolean;
	/** Snapshot-wide restrictions that may limit inventory or delivery, independent of per-server support. */
	readonly coverage: IAgentHostMcpServerSupportCoverage;
}

export const enum McpServerCustomizationMigrationFailureReason {
	/** The server or execution context no longer satisfies the migration requirements. */
	NoLongerEligible = 'noLongerEligible',
	/** A source configuration file is missing or could not be read. */
	SourceUnavailable = 'sourceUnavailable',
	/** The source JSON, servers map, or selected server definition is invalid. */
	InvalidSource = 'invalidSource',
	/** The configuration has unsupported properties, unresolved variables, or projection differences beyond the confirmed removals. */
	UnrepresentableConfiguration = 'unrepresentableConfiguration',
	/** An `${env:}`, `${input:}` or `${config:}` reference is used in an environment variable or header name, which the destination never expands. */
	EnvironmentVariableInName = 'environmentVariableInName',
	/** An `${env:}` reference does not name a variable matching `[A-Za-z_][A-Za-z0-9_]*`, so it cannot be written as `${NAME}`. */
	InvalidEnvironmentVariableName = 'invalidEnvironmentVariableName',
	/** A value with an `${env:}` reference would be too long for the destination to expand it. */
	EnvironmentVariableValueTooLong = 'environmentVariableValueTooLong',
	/** An `${env:}` reference is in a URL position that the destination rejects, such as the port or the whole URL. */
	UnsupportedEnvironmentVariableInUrl = 'unsupportedEnvironmentVariableInUrl',
	/** An `${input:}` reference is to a password or command input, or to an input that is not declared in the same file. */
	UnsupportedInputType = 'unsupportedInputType',
	/** An `${input:}` id does not convert to an environment variable name, such as an empty id. */
	InvalidInputName = 'invalidInputName',
	/** An input or setting converts to the same environment variable as a different input, setting or `${env:}` reference in the same file, or as an `env` entry of the server. */
	VariableNameCollision = 'variableNameCollision',
	/** The configuration uses a variable that cannot be migrated, such as `${command:}`, or a workspace variable in a user server. */
	UnsupportedVariable = 'unsupportedVariable',
	/** An input's default cannot be written to the destination, or a `pickString` default is not one of its options. */
	UnsupportedInputDefault = 'unsupportedInputDefault',
	/** The server uses enterprise-managed OAuth, which relies on a VS Code setting that the destination does not have. */
	EnterpriseManagedOAuth = 'enterpriseManagedOAuth',
	/** VS Code stores a client secret for the server's OAuth client, which the destination cannot use. */
	OAuthClientSecret = 'oauthClientSecret',
	/** The source entry or file no longer matches what was validated for migration. */
	SourceChanged = 'sourceChanged',
	/** An existing destination cannot be read or parsed as a supported MCP configuration document. */
	InvalidTarget = 'invalidTarget',
	/** The destination already defines the same server name with a non-equivalent configuration. */
	TargetConflict = 'targetConflict',
	/** The server takes precedence over a same-named server in another workspace folder that was not migrated with it. */
	ShadowedServerNotMigrated = 'shadowedServerNotMigrated',
	/** The destination changed before writing, or final source/target verification failed. */
	TargetChanged = 'targetChanged',
	/** A migration file operation failed without a more specific failure reason. */
	WriteFailed = 'writeFailed',
	/** Original file contents could not be safely restored; a newly created destination may be retained. */
	RollbackFailed = 'rollbackFailed',
	/** The source and destination do not match a supported workspace or user migration. */
	InconsistentTarget = 'inconsistentTarget',
}

export interface IMcpServerCustomizationMigrationFailure {
	readonly storage: PromptsStorage.local | PromptsStorage.user;
	readonly id: string;
	readonly name: string;
	readonly sourceUri: URI;
	readonly targetUri: URI;
	readonly reason: McpServerCustomizationMigrationFailureReason;
	readonly error?: Error;
}

export interface IMcpServerCustomizationMigrationExclusion extends IMcpServerCustomizationMigrationFailure {
	readonly details: readonly string[];
}

export interface IMcpServerCustomizationMigrationResult {
	readonly migratedCount: number;
	readonly failures: readonly IMcpServerCustomizationMigrationFailure[];
}

/** A legacy VS Code plugin marketplace that can move to provider-owned settings. */
export interface IPluginMarketplaceCustomizationMigrationCandidate {
	readonly type: CustomizationMigrationType.PluginMarketplaces;
	readonly storage: PromptsStorage.user;
	readonly name: string;
	readonly source: string;
	readonly canonicalId: string;
}

/** The plugin marketplaces currently eligible for migration. */
export interface PluginMarketplaceCustomizationMigration {
	readonly type: CustomizationMigrationType.PluginMarketplaces;
	readonly candidates: readonly IPluginMarketplaceCustomizationMigrationCandidate[];
	readonly discoveryError?: Error;
}

/** Bounded reasons a plugin marketplace migration can fail. */
export const enum PluginMarketplaceCustomizationMigrationFailureReason {
	ProviderUnavailable = 'providerUnavailable',
	NoLongerConfigured = 'noLongerConfigured',
	AddFailed = 'addFailed',
}

/** A plugin marketplace that could not complete migration. */
export interface IPluginMarketplaceCustomizationMigrationFailure {
	readonly name: string;
	readonly source: string;
	readonly canonicalId: string;
	readonly reason: PluginMarketplaceCustomizationMigrationFailureReason;
	readonly error?: Error;
}

/** Aggregate result of a plugin marketplace migration request. */
export interface IPluginMarketplaceCustomizationMigrationResult {
	readonly migratedCount: number;
	readonly failures: readonly IPluginMarketplaceCustomizationMigrationFailure[];
}

export const enum FileCustomizationMigrationFailureReason {
	/** The source customization file could not be read. */
	SourceReadFailed = 'sourceReadFailed',
	/** A destination folder could not be resolved. */
	TargetResolutionFailed = 'targetResolutionFailed',
	/** A customization already exists at the migration destination. */
	TargetAlreadyExists = 'targetAlreadyExists',
	/** A prompt file could not be converted to a skill. */
	ConversionFailed = 'conversionFailed',
	/** The migrated customization could not be written to its destination. */
	TargetWriteFailed = 'targetWriteFailed',
	/** The original customization could not be deleted after writing its replacement. */
	SourceDeleteFailed = 'sourceDeleteFailed',
	/** One or more partially written migration targets could not be removed. */
	RollbackFailed = 'rollbackFailed',
}

export type CustomizationMigrationFailureReason = FileCustomizationMigrationFailureReason | McpServerCustomizationMigrationFailureReason | PluginMarketplaceCustomizationMigrationFailureReason;

export type CustomizationMigrationCandidate = MigratableConfiguration | IMcpServerCustomizationMigrationCandidate | IPluginMarketplaceCustomizationMigrationCandidate;

export function isMcpServerCustomizationMigrationCandidate(candidate: CustomizationMigrationCandidate): candidate is IMcpServerCustomizationMigrationCandidate {
	return candidate.type === CustomizationMigrationType.McpServers;
}

export function isPluginMarketplaceCustomizationMigrationCandidate(candidate: CustomizationMigrationCandidate): candidate is IPluginMarketplaceCustomizationMigrationCandidate {
	return candidate.type === CustomizationMigrationType.PluginMarketplaces;
}

export function isFileCustomizationMigrationCandidate(candidate: CustomizationMigrationCandidate): candidate is MigratableConfiguration {
	return !isMcpServerCustomizationMigrationCandidate(candidate) && !isPluginMarketplaceCustomizationMigrationCandidate(candidate);
}

export type CustomizationMigration = FileCustomizationMigration | McpServerCustomizationMigration | PluginMarketplaceCustomizationMigration | GuidanceCustomizationMigration;

export interface ICustomizationMigrationHint {
	readonly migrationFlowId: string;
	readonly message: string;
	readonly counts: readonly ICustomizationMigrationCount[];
}

export interface ICustomizationMigrationCount {
	readonly type: CustomizationMigrationType;
	readonly count: number;
}

export interface ICustomizationMigrationIgnoredGroup {
	readonly type: CustomizationMigrationType;
	readonly storage: PromptsStorage;
}

export interface ICustomizationMigrationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeCustomizations: Event<void>;
	readonly onDidChangePluginMarketplaces: Event<void>;

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType, token?: CancellationToken): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers, token?: CancellationToken): Promise<McpServerCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.PluginMarketplaces, token?: CancellationToken): Promise<PluginMarketplaceCustomizationMigration>;
	computeMigration(sessionResource: URI, type: GuidanceCustomizationMigrationType, token?: CancellationToken): Promise<GuidanceCustomizationMigration>;
	migrateMcpServers(sessionResource: URI, candidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<IMcpServerCustomizationMigrationResult>;
	migratePluginMarketplaces(sessionResource: URI, candidates: readonly IPluginMarketplaceCustomizationMigrationCandidate[]): Promise<IPluginMarketplaceCustomizationMigrationResult>;
	computeMigrations(sessionResource: URI, token?: CancellationToken): Promise<CustomizationMigration[]>;
	computeMigrationHint(sessionResource: URI, token?: CancellationToken, ignoredGroups?: readonly ICustomizationMigrationIgnoredGroup[]): Promise<ICustomizationMigrationHint | undefined>;
}
