/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { parse, ParseError } from '../../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../../base/common/jsonFormatter.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { basename, dirname, getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { normalizeMcpServerConfiguration } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { hasConfigurationVariable } from '../../../../../platform/configuration/common/configurationVariables.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { hasEnvVarReferences, MAX_ENV_VAR_RESOLVE_LENGTH } from '../../../../../platform/mcp/common/envVarResolution.js';
import { toCopilotMcpServerConfiguration } from '../../../../../platform/mcp/common/mcpCopilotConfiguration.js';
import { parseCopilotGlobalMcpConfiguration } from '../../../../../platform/mcp/common/mcpCopilotGlobalConfiguration.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IWorkspaceFolderData } from '../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { mcpOAuthClientSecretStorageKey } from '../../../mcp/common/mcpTypes.js';
import { ConfigurationResolverExpression, Replacement } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { CustomizationMigrationType, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationFailure, IMcpServerCustomizationMigrationOAuthClient, IMcpServerCustomizationMigrationResult, IMcpServerCustomizationMigrationSettingVariable, IMcpServerCustomizationMigrationVariable, McpServerCustomizationMigrationFailureReason, mcpServerCustomizationMigrationRemovableProperties } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerSourceKind, AgentHostMcpSupportReason, IAgentHostMcpServerSupport, IAgentHostMcpServerSupportSnapshot } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';
import { environmentVariableNamePattern, getConfigurationVariables, getMcpSourceFile, getMigratedSettingNames, getMigratedVariables, IMcpSourceFile, isDefaultReferenceIntact, isJsonObject, parseJsonContent, removeUnreferencedInputs, replaceConfigurationVariables } from './mcpServerEnvironmentVariables.js';

const LOG_PREFIX = '[MCP Customization Migration]';

export interface IMcpServerCustomizationMigrationPlan {
	readonly candidates: readonly IMcpServerCustomizationMigrationCandidate[];
	readonly exclusions: readonly IMcpServerCustomizationMigrationFailure[];
}

interface IMcpServerMigrationGroup {
	readonly storage: PromptsStorage.local | PromptsStorage.user;
	readonly sourceUri: URI;
	readonly targetUri: URI;
	readonly candidates: IMcpServerCustomizationMigrationCandidate[];
}

interface IJsonDocument {
	readonly content: string;
	readonly value: Record<string, unknown>;
	readonly exists: boolean;
}

interface IMcpTargetDocument extends IJsonDocument {
	readonly wrapped: boolean;
}

interface IMcpServerCustomizationMigrationExecutionOptions {
	readonly isContextCurrent?: (candidates: readonly IMcpServerCustomizationMigrationCandidate[]) => boolean | Promise<boolean>;
	readonly userTarget?: URI;
}

/**
 * Whether the migration planner can assess this server's projected configuration. Besides servers the
 * client forwards, this includes `.vscode/mcp.json` servers shadowed by a same-named server in another
 * workspace folder, since each moves into its own folder's `.mcp.json`.
 *
 * Servers whose only problem is their variables are also assessed, with their projected configuration
 * unresolved: user servers, which are forwarded as written, and `.vscode/mcp.json` servers, which are not
 * delivered because they use `${input:}` (the client stops before resolving anything). Since that also
 * covers `${command:}` and other variables, the planner then migrates only `${env:}`, declared
 * `${input:}` and `${config:}` references and rejects any other variable.
 */
export function isMcpServerMigrationDeliverable(server: IAgentHostMcpServerSupport): server is IAgentHostMcpServerSupport & { readonly projectedConfiguration: IMcpServerConfiguration } {
	if (server.applicability !== AgentHostMcpServerApplicability.Applicable || server.projectedConfiguration === undefined) {
		return false;
	}
	const isSupported = server.compatibility.kind === 'supported' || server.compatibility.kind === 'partiallySupported';
	const onlyHasUnresolvedVariables = server.compatibility.kind === 'unsupported'
		&& server.compatibility.reasons.length > 0
		&& server.compatibility.reasons.every(reason => reason === AgentHostMcpSupportReason.UnresolvedConfiguration || reason === AgentHostMcpSupportReason.RequiresUserInteraction);
	switch (server.delivery) {
		case AgentHostMcpServerDelivery.ClientForwarded:
			return isSupported
				|| (onlyHasUnresolvedVariables && (server.source.kind === AgentHostMcpServerSourceKind.UserProfile || server.source.kind === AgentHostMcpServerSourceKind.RemoteUser));
		case AgentHostMcpServerDelivery.NotDelivered:
			return server.source.kind === AgentHostMcpServerSourceKind.VscodeWorkspaceFolder
				&& ((isSupported && server.shadowedBy !== undefined) || onlyHasUnresolvedVariables);
		default:
			return false;
	}
}

/**
 * Plans eligible MCP server moves and executes guarded source-to-target transactions.
 */
export class McpServerCustomizationMigrator {
	private readonly services: IMcpServerVariableServices;

	constructor(
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
		configurationResolverService: IConfigurationResolverService,
		configurationService: IConfigurationService,
		private readonly secretStorageService: ISecretStorageService,
	) {
		this.services = { configurationResolverService, configurationService };
	}

	async createPlan(snapshot: IAgentHostMcpServerSupportSnapshot, roots: readonly URI[], token = CancellationToken.None, userTarget?: URI): Promise<IMcpServerCustomizationMigrationPlan> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const candidates: IMcpServerCustomizationMigrationCandidate[] = [];
		const exclusions: IMcpServerCustomizationMigrationFailure[] = [];
		const sourceFiles = new ResourceMap<Promise<IMcpSourceFile | undefined>>();
		this.logService.trace(`${LOG_PREFIX} Planning: servers=${snapshot.servers.length}, roots=${roots.length}, discoveryComplete=${snapshot.discoveryComplete}`);

		for (const server of snapshot.servers) {
			const sourceUri = server.source.collectionUri;
			const isUser = server.source.kind === AgentHostMcpServerSourceKind.UserProfile || server.source.kind === AgentHostMcpServerSourceKind.RemoteUser;
			const root = !isUser && sourceUri ? roots.find(candidate => isEqual(sourceUri, URI.joinPath(candidate, '.vscode', 'mcp.json'))) : undefined;
			const targetUri = isUser
				? userTarget && server.source.remoteAuthority === (userTarget.scheme === Schemas.vscodeRemote ? userTarget.authority : null) ? userTarget : undefined
				: server.source.kind === AgentHostMcpServerSourceKind.VscodeWorkspaceFolder && root ? URI.joinPath(root, '.mcp.json') : undefined;
			if (!sourceUri || !targetUri || (isUser && !isUserSourceTargetPair(sourceUri, targetUri))) {
				continue;
			}

			const storage = isUser ? PromptsStorage.user : PromptsStorage.local;
			const excluded = (reason: McpServerCustomizationMigrationFailureReason, error?: Error): void => {
				this.logService.trace(`${LOG_PREFIX} Excluded '${server.name}' from ${sourceUri.toString()}: reason=${reason}`);
				exclusions.push({
					storage,
					id: server.id,
					name: server.name,
					sourceUri,
					targetUri,
					reason,
					error,
				});
			};
			if (!isMcpServerMigrationDeliverable(server)) {
				excluded(McpServerCustomizationMigrationFailureReason.NoLongerEligible);
				continue;
			}

			let sourceFilePromise = sourceFiles.get(sourceUri);
			if (!sourceFilePromise) {
				sourceFilePromise = this.readMcpSourceFile(sourceUri, token);
				sourceFiles.set(sourceUri, sourceFilePromise);
			}

			let sourceFile: IMcpSourceFile | undefined;
			try {
				sourceFile = await sourceFilePromise;
			} catch (error) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				const migrationError = error instanceof McpServerMigrationError ? error : undefined;
				excluded(migrationError?.reason ?? McpServerCustomizationMigrationFailureReason.SourceUnavailable, migrationError ?? toError(error));
				continue;
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (!sourceFile) {
				excluded(McpServerCustomizationMigrationFailureReason.SourceUnavailable);
				continue;
			}
			if (!Object.hasOwn(sourceFile.servers, server.name)) {
				excluded(McpServerCustomizationMigrationFailureReason.NoLongerEligible);
				continue;
			}
			const rawConfiguration = sourceFile.servers[server.name];
			const analysis = await analyzeSourceConfiguration(rawConfiguration, sourceFile, root, storage, this.services);
			if (typeof analysis === 'string') {
				excluded(analysis);
				continue;
			}
			if (!isConfigurationRepresentable(server.projectedConfiguration)
				|| !isConfigurationRepresentable(analysis.migration)
				|| Iterable.some(ConfigurationResolverExpression.parse(server.projectedConfiguration).unresolved(), replacement => !isForwardedUnresolved(replacement, storage, !!analysis.projectedAsWritten) && !analysis.settingValueVariables?.has(replacement.id))
				|| !equals(analysis.projection, canonicalizeConfiguration(server.projectedConfiguration))) {
				excluded(McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration);
				continue;
			}
			const oauth = analysis.oauthClientId !== undefined ? { clientId: analysis.oauthClientId } : undefined;
			if (oauth) {
				let hasSecret: boolean;
				try {
					hasSecret = await hasOAuthClientSecret(oauth, rawConfiguration, this.secretStorageService);
				} catch (error) {
					excluded(McpServerCustomizationMigrationFailureReason.SourceUnavailable, toError(error));
					continue;
				}
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (hasSecret) {
					excluded(McpServerCustomizationMigrationFailureReason.OAuthClientSecret);
					continue;
				}
			}
			const removedProperties = getRemovedProperties(rawConfiguration);
			candidates.push({
				type: CustomizationMigrationType.McpServers,
				storage,
				id: server.id,
				name: server.name,
				sourceUri,
				targetUri,
				projectedConfiguration: server.projectedConfiguration,
				...(analysis.migration !== analysis.projection ? { migratedConfiguration: analysis.migration } : {}),
				...(analysis.environmentVariables ? { environmentVariables: analysis.environmentVariables } : {}),
				...(analysis.settingVariables ? { settingVariables: analysis.settingVariables } : {}),
				...(removedProperties ? { removedProperties } : {}),
				...(oauth ? { oauth } : {}),
			});
		}

		this.logService.trace(`${LOG_PREFIX} Planned: candidates=${candidates.length}, exclusions=${exclusions.length}`);
		return { candidates, exclusions };
	}

	migrate(
		candidates: readonly IMcpServerCustomizationMigrationCandidate[],
		options: IMcpServerCustomizationMigrationExecutionOptions = {},
	): Promise<IMcpServerCustomizationMigrationResult> {
		return executeMigration(candidates, this.fileService, this.logService, this.services, this.secretStorageService, options);
	}

	private async readMcpSourceFile(resource: URI, token: CancellationToken): Promise<IMcpSourceFile | undefined> {
		let content: string;
		try {
			content = (await this.fileService.readFile(resource, undefined, token)).value.toString();
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
			throw error;
		}
		const errors: ParseError[] = [];
		const value = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
		const sourceFile = errors.length === 0 && isJsonObject(value) ? getMcpSourceFile(value) : undefined;
		if (!sourceFile) {
			throw new McpServerMigrationError(
				McpServerCustomizationMigrationFailureReason.InvalidSource,
				new Error(`MCP configuration ${resource.toString()} does not contain a valid servers object.`),
			);
		}
		return sourceFile;
	}
}

async function executeMigration(
	candidates: readonly IMcpServerCustomizationMigrationCandidate[],
	fileService: IFileService,
	logService: ILogService,
	services: IMcpServerVariableServices,
	secretStorageService: ISecretStorageService,
	options: IMcpServerCustomizationMigrationExecutionOptions,
): Promise<IMcpServerCustomizationMigrationResult> {
	const groups = new Map<string, IMcpServerMigrationGroup>();
	const failures: IMcpServerCustomizationMigrationFailure[] = [];
	for (const candidate of candidates) {
		const validPair = candidate.storage === PromptsStorage.user
			? options.userTarget && isEqual(candidate.targetUri, options.userTarget) && isUserSourceTargetPair(candidate.sourceUri, candidate.targetUri)
			: isStrictSourceTargetPair(candidate.sourceUri, candidate.targetUri);
		if (!validPair || isEqual(candidate.sourceUri, candidate.targetUri)) {
			logService.trace(`${LOG_PREFIX} Rejected '${candidate.name}': ${candidate.sourceUri.toString()} to ${candidate.targetUri.toString()} is not a supported migration pair.`);
			failures.push(createFailure(candidate, McpServerCustomizationMigrationFailureReason.InconsistentTarget));
			continue;
		}
		const key = JSON.stringify([getComparisonKey(candidate.sourceUri), getComparisonKey(candidate.targetUri)]);
		const group = groups.get(key) ?? {
			storage: candidate.storage,
			sourceUri: candidate.sourceUri,
			targetUri: candidate.targetUri,
			candidates: [],
		};
		group.candidates.push(candidate);
		groups.set(key, group);
	}
	logService.trace(`${LOG_PREFIX} Executing: candidates=${candidates.length}, groups=${groups.size}, rejected=${failures.length}`);

	// Each workspace root migrates into its own `.mcp.json`, so the same server name in another root is not a conflict.
	let migratedCount = 0;
	for (const group of groups.values()) {
		if (await options.isContextCurrent?.(group.candidates) === false) {
			logService.trace(`${LOG_PREFIX} Skipping ${group.sourceUri.toString()}: execution context changed before the group started.`);
			failures.push(...group.candidates.map(candidate => createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible)));
			continue;
		}
		try {
			const result = await migrateGroup(group, fileService, logService, services, secretStorageService, options);
			migratedCount += result.migratedCount;
			failures.push(...result.failures);
		} catch (error) {
			const migrationError = toMigrationError(error);
			logService.trace(`${LOG_PREFIX} Group ${group.sourceUri.toString()} failed: reason=${migrationError.reason}`);
			failures.push(...group.candidates.map(candidate => createFailure(candidate, migrationError.reason, migrationError)));
		}
	}

	return { migratedCount, failures };
}

async function migrateGroup(
	group: IMcpServerMigrationGroup,
	fileService: IFileService,
	logService: ILogService,
	services: IMcpServerVariableServices,
	secretStorageService: ISecretStorageService,
	options: IMcpServerCustomizationMigrationExecutionOptions,
): Promise<IMcpServerCustomizationMigrationResult> {
	logService.trace(`${LOG_PREFIX} Migrating ${group.candidates.length} server(s) from ${group.sourceUri.toString()} to ${group.targetUri.toString()}.`);
	let source: IJsonDocument;
	try {
		source = await readSourceDocument(group.sourceUri, fileService);
	} catch (error) {
		if (error instanceof McpServerMigrationError) {
			throw error;
		}
		throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.SourceUnavailable, toError(error));
	}
	// Servers and inputs come from the same read, and the source is only written if it is still unchanged.
	const sourceFile = getMcpSourceFile(source.value);
	if (!sourceFile) {
		throw new McpServerMigrationError(
			McpServerCustomizationMigrationFailureReason.InvalidSource,
			new Error(`MCP configuration ${group.sourceUri.toString()} does not contain a servers object.`),
		);
	}
	const sourceServers = sourceFile.servers;

	let target: IMcpTargetDocument;
	try {
		target = await readTargetDocument(group.targetUri, fileService, group.storage === PromptsStorage.user);
	} catch (error) {
		throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.InvalidTarget, toError(error));
	}
	const targetServers = getTargetServers(target);
	logService.trace(`${LOG_PREFIX} Target ${group.targetUri.toString()}: exists=${target.exists}, wrapped=${target.wrapped}`);
	const candidatesToMigrate: IMcpServerCustomizationMigrationCandidate[] = [];
	const failures: IMcpServerCustomizationMigrationFailure[] = [];
	const reject = (candidate: IMcpServerCustomizationMigrationCandidate, reason: McpServerCustomizationMigrationFailureReason): void => {
		logService.trace(`${LOG_PREFIX} Rejected '${candidate.name}' before writing: reason=${reason}`);
		failures.push(createFailure(candidate, reason));
	};

	for (const candidate of group.candidates) {
		if (!isConfigurationRepresentable(candidate.projectedConfiguration) || !isConfigurationRepresentable(getMigratedConfiguration(candidate))) {
			reject(candidate, McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration);
			continue;
		}
		if (!Object.hasOwn(sourceServers, candidate.name)) {
			reject(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible);
			continue;
		}
		const root = group.storage === PromptsStorage.local ? dirname(group.targetUri) : undefined;
		const analysis = await analyzeSourceConfiguration(sourceServers[candidate.name], sourceFile, root, group.storage, services);
		if (typeof analysis === 'string') {
			reject(candidate, analysis);
			continue;
		}
		if (!isAnalysisOfCandidate(analysis, candidate)
			|| !equals(getRemovedProperties(sourceServers[candidate.name]), candidate.removedProperties)) {
			reject(candidate, McpServerCustomizationMigrationFailureReason.SourceChanged);
			continue;
		}
		if (candidate.oauth) {
			let hasSecret: boolean;
			try {
				hasSecret = await hasOAuthClientSecret(candidate.oauth, sourceServers[candidate.name], secretStorageService);
			} catch {
				reject(candidate, McpServerCustomizationMigrationFailureReason.SourceUnavailable);
				continue;
			}
			if (hasSecret) {
				reject(candidate, McpServerCustomizationMigrationFailureReason.OAuthClientSecret);
				continue;
			}
		}
		if (Object.hasOwn(targetServers, candidate.name) && !isEquivalentTargetConfiguration(targetServers[candidate.name], candidate)) {
			reject(candidate, McpServerCustomizationMigrationFailureReason.TargetConflict);
			continue;
		}
		candidatesToMigrate.push(candidate);
	}

	if (candidatesToMigrate.length === 0) {
		logService.trace(`${LOG_PREFIX} Nothing left to migrate from ${group.sourceUri.toString()}.`);
		return { migratedCount: 0, failures };
	}
	if (await options.isContextCurrent?.(candidatesToMigrate) === false) {
		logService.trace(`${LOG_PREFIX} Aborting ${group.sourceUri.toString()} before any write: execution context changed.`);
		return {
			migratedCount: 0,
			failures: [...failures, ...candidatesToMigrate.map(candidate => createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible))],
		};
	}

	let targetContent = target.content;
	let targetChanged = false;
	for (const candidate of candidatesToMigrate) {
		if (!Object.hasOwn(targetServers, candidate.name)) {
			targetContent = setJsonValue(
				targetContent,
				target.wrapped ? ['mcpServers', candidate.name] : [candidate.name],
				getTargetConfiguration(candidate),
			);
			targetChanged = true;
		}
	}
	let sourceContent = source.content;
	for (const candidate of candidatesToMigrate) {
		sourceContent = setJsonValue(sourceContent, ['servers', candidate.name], undefined);
	}
	sourceContent = removeUnreferencedInputs(sourceContent, new Set(candidatesToMigrate.flatMap(candidate => (candidate.environmentVariables ?? []).map(variable => variable.id))));
	const expectedSource = parseJsonContent(sourceContent);

	let writtenTarget: IFileStatWithMetadata | undefined;
	const migrationGroup = { ...group, candidates: candidatesToMigrate };
	const beforeWrite = async () => {
		if (await options.isContextCurrent?.(candidatesToMigrate) === false) {
			throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.NoLongerEligible, new Error('MCP migration context changed before writing.'));
		}
	};
	if (targetChanged) {
		logService.trace(`${LOG_PREFIX} Writing target ${group.targetUri.toString()}.`);
		try {
			writtenTarget = await writeDocument(group.targetUri, targetContent, target, fileService, beforeWrite);
		} catch (error) {
			if (error instanceof McpServerMigrationError) {
				throw error;
			}
			throw new McpServerMigrationError(
				error instanceof McpServerDocumentChangedError
					? McpServerCustomizationMigrationFailureReason.TargetChanged
					: McpServerCustomizationMigrationFailureReason.WriteFailed,
				toError(error),
			);
		}
	} else {
		logService.trace(`${LOG_PREFIX} Target ${group.targetUri.toString()} already contains every selected entry.`);
	}

	if (await options.isContextCurrent?.(candidatesToMigrate) === false) {
		logService.trace(`${LOG_PREFIX} Aborting ${group.sourceUri.toString()} after the target write: execution context changed.`);
		if (writtenTarget) {
			await rollbackTarget(migrationGroup, target, writtenTarget, targetContent, fileService, logService, services);
		}
		return {
			migratedCount: 0,
			failures: [...failures, ...candidatesToMigrate.map(candidate => createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible))],
		};
	}

	let writtenSource: IFileStatWithMetadata;
	logService.trace(`${LOG_PREFIX} Removing ${candidatesToMigrate.length} migrated entr${candidatesToMigrate.length === 1 ? 'y' : 'ies'} from ${group.sourceUri.toString()}.`);
	try {
		writtenSource = await writeDocument(group.sourceUri, sourceContent, source, fileService, beforeWrite);
	} catch (error) {
		const sourceChangedBeforeWrite = error instanceof McpServerDocumentChangedError;
		if (sourceChangedBeforeWrite && await isConcurrentMigrationComplete(migrationGroup, expectedSource, fileService)) {
			logService.info(`${LOG_PREFIX} Concurrent migration already completed for ${group.sourceUri.toString()}; retaining ${group.targetUri.toString()}.`);
			return { migratedCount: candidatesToMigrate.length, failures };
		}
		const contextChangedBeforeWrite = error instanceof McpServerMigrationError && error.reason === McpServerCustomizationMigrationFailureReason.NoLongerEligible;
		if (!sourceChangedBeforeWrite && !contextChangedBeforeWrite) {
			logService.trace(`${LOG_PREFIX} Source write failed; restoring ${group.sourceUri.toString()}.`);
			try {
				await restoreSourceAfterFailedWrite(group.sourceUri, source, sourceContent, fileService);
			} catch (restoreError) {
				throw rollbackErrorWith(error, restoreError, group.sourceUri);
			}
		}
		if (writtenTarget) {
			logService.trace(`${LOG_PREFIX} Rolling back target ${group.targetUri.toString()}.`);
			try {
				await rollbackTarget(migrationGroup, target, writtenTarget, targetContent, fileService, logService, services);
			} catch (rollbackError) {
				throw rollbackErrorWith(error, rollbackError, group.sourceUri);
			}
		}
		if (contextChangedBeforeWrite) {
			throw error;
		}
		throw new McpServerMigrationError(
			sourceChangedBeforeWrite
				? McpServerCustomizationMigrationFailureReason.SourceChanged
				: McpServerCustomizationMigrationFailureReason.WriteFailed,
			toError(error),
		);
	}

	try {
		await verifyMigration(group, candidatesToMigrate, expectedSource, fileService);
	} catch (verificationError) {
		logService.trace(`${LOG_PREFIX} Verification failed for ${group.sourceUri.toString()}; rolling both files back.`);
		const rollbackErrors: Error[] = [];
		let sourceRestored = false;
		try {
			await restoreExistingDocument(group.sourceUri, source, writtenSource, sourceContent, fileService);
			sourceRestored = true;
		} catch (error) {
			rollbackErrors.push(toError(error));
		}
		if (sourceRestored && writtenTarget) {
			try {
				await rollbackTarget(migrationGroup, target, writtenTarget, targetContent, fileService, logService, services);
			} catch (error) {
				rollbackErrors.push(toError(error));
			}
		}
		if (rollbackErrors.length > 0) {
			throw new McpServerMigrationError(
				McpServerCustomizationMigrationFailureReason.RollbackFailed,
				new AggregateError([toError(verificationError), ...rollbackErrors], `Failed to verify and roll back MCP servers from ${group.sourceUri.toString()}.`),
			);
		}
		if (verificationError instanceof McpServerMigrationError) {
			throw verificationError;
		}
		throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.TargetChanged, toError(verificationError));
	}

	logService.trace(`${LOG_PREFIX} Verified ${candidatesToMigrate.length} migrated server(s) from ${group.sourceUri.toString()}.`);
	return { migratedCount: candidatesToMigrate.length, failures };
}

/**
 * Whether another migration of the same servers completed first: the source is the document this
 * migration would have written, including the servers, inputs and other root properties.
 */
async function isConcurrentMigrationComplete(
	group: IMcpServerMigrationGroup,
	expectedSource: unknown,
	fileService: IFileService,
): Promise<boolean> {
	try {
		const source = await readSourceDocument(group.sourceUri, fileService);
		const targetServers = getTargetServers(await readTargetDocument(group.targetUri, fileService, group.storage === PromptsStorage.user));
		return equals(source.value, expectedSource)
			&& group.candidates.every(candidate => Object.hasOwn(targetServers, candidate.name) && isEquivalentTargetConfiguration(targetServers[candidate.name], candidate));
	} catch {
		return false;
	}
}

async function restoreSourceAfterFailedWrite(resource: URI, original: IJsonDocument, attemptedContent: string, fileService: IFileService): Promise<void> {
	const current = await fileService.readFile(resource);
	const currentContent = current.value.toString();
	if (currentContent === original.content) {
		return;
	}
	if (currentContent !== attemptedContent) {
		throw new Error(`Cannot safely restore ${resource.toString()} because it changed during migration.`);
	}
	try {
		await writeExistingDocument(resource, original.content, attemptedContent, fileService);
	} catch (error) {
		const afterFailedRestore = await fileService.readFile(resource);
		if (afterFailedRestore.value.toString() === original.content) {
			return;
		}
		throw error;
	}
	const restored = await fileService.readFile(resource);
	if (restored.value.toString() !== original.content) {
		throw new Error(`Could not verify restored MCP configuration ${resource.toString()}.`);
	}
}

async function verifyMigration(
	group: IMcpServerMigrationGroup,
	candidates: readonly IMcpServerCustomizationMigrationCandidate[],
	expectedSource: unknown,
	fileService: IFileService,
): Promise<void> {
	// The expected source no longer contains the migrated servers.
	const source = await readSourceDocument(group.sourceUri, fileService);
	if (!equals(source.value, expectedSource)) {
		throw new Error(`MCP configuration ${group.sourceUri.toString()} changed during migration.`);
	}
	const targetServers = getTargetServers(await readTargetDocument(group.targetUri, fileService, group.storage === PromptsStorage.user));
	for (const candidate of candidates) {
		if (!isEquivalentTargetConfiguration(targetServers[candidate.name], candidate)) {
			throw new Error(`MCP server '${candidate.name}' changed during migration.`);
		}
	}
}

async function readSourceDocument(resource: URI, fileService: IFileService): Promise<IJsonDocument> {
	const file = await fileService.readFile(resource);
	const content = file.value.toString();
	const errors: ParseError[] = [];
	const value = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
	if (errors.length > 0 || !isJsonObject(value)) {
		throw new McpServerMigrationError(
			McpServerCustomizationMigrationFailureReason.InvalidSource,
			new Error(`MCP configuration ${resource.toString()} contains invalid JSON.`),
		);
	}
	return { content, value, exists: true };
}

async function readTargetDocument(resource: URI, fileService: IFileService, copilotGlobal = false): Promise<IMcpTargetDocument> {
	try {
		const file = await fileService.readFile(resource);
		const content = file.value.toString();
		if (copilotGlobal) {
			parseCopilotGlobalMcpConfiguration(content);
		}
		const errors: ParseError[] = [];
		const value = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
		if (errors.length > 0 || !isJsonObject(value)) {
			throw new Error(`MCP configuration ${resource.toString()} contains invalid JSON.`);
		}
		const wrapped = copilotGlobal || Object.hasOwn(value, 'mcpServers');
		if (Object.hasOwn(value, 'mcpServers') && !getObjectProperty(value, 'mcpServers')) {
			throw new Error(`MCP configuration ${resource.toString()} does not contain a valid mcpServers object.`);
		}
		return { content, value, exists: true, wrapped };
	} catch (error) {
		if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
			throw error;
		}
		const value = { mcpServers: {} };
		return {
			content: `${JSON.stringify(value, undefined, '\t')}\n`,
			value,
			exists: false,
			wrapped: true,
		};
	}
}

function getTargetServers(target: IMcpTargetDocument): Record<string, unknown> {
	return target.wrapped ? getObjectProperty(target.value, 'mcpServers') ?? {} : target.value;
}

function getTargetConfiguration(candidate: IMcpServerCustomizationMigrationCandidate) {
	const migrated = getMigratedConfiguration(candidate);
	return toCopilotMcpServerConfiguration(candidate.oauth && migrated.type === McpServerType.REMOTE ? { ...migrated, oauth: { clientId: candidate.oauth.clientId } } : migrated);
}

/**
 * Whether VS Code stores a client secret for an OAuth client. The destination has no way to use the secret.
 * The *Set Client Secret* code lens keys the secret by the URL as written in the source, before any
 * variable in it is resolved, so the key is read from the source entry rather than from the projection.
 */
async function hasOAuthClientSecret(
	oauth: IMcpServerCustomizationMigrationOAuthClient,
	rawConfiguration: unknown,
	secretStorageService: ISecretStorageService,
): Promise<boolean> {
	const rawUrl = isJsonObject(rawConfiguration) ? rawConfiguration.url : undefined;
	if (typeof rawUrl !== 'string' || !rawUrl) {
		return false;
	}
	const serverUrl = URI.parse(rawUrl).toString(true);
	return !!await secretStorageService.get(mcpOAuthClientSecretStorageKey(serverUrl, oauth.clientId));
}

function getMigratedConfiguration(candidate: IMcpServerCustomizationMigrationCandidate): IMcpServerConfiguration {
	return candidate.migratedConfiguration ?? candidate.projectedConfiguration;
}

function isEquivalentTargetConfiguration(raw: unknown, candidate: IMcpServerCustomizationMigrationCandidate): boolean {
	if (!isJsonObject(raw)) {
		return false;
	}
	return equals({
		...(candidate.projectedConfiguration.type === McpServerType.LOCAL ? { args: [] } : {}),
		tools: ['*'],
		...raw,
		// Earlier migrations wrote the legacy `local` alias for stdio servers.
		...(raw.type === 'local' ? { type: McpServerType.LOCAL } : {}),
	}, getTargetConfiguration(candidate));
}

async function writeDocument(resource: URI, content: string, document: IJsonDocument, fileService: IFileService, beforeWrite?: () => Promise<void>): Promise<IFileStatWithMetadata> {
	if (document.exists) {
		return writeExistingDocument(resource, content, document.content, fileService, beforeWrite);
	}
	await beforeWrite?.();
	return fileService.createFile(resource, VSBuffer.fromString(content), { overwrite: false });
}

async function writeExistingDocument(resource: URI, content: string, expectedContent: string, fileService: IFileService, beforeWrite?: () => Promise<void>): Promise<IFileStatWithMetadata> {
	await ensureFileExists(resource, fileService);
	const current = await fileService.readFile(resource);
	if (current.value.toString() !== expectedContent) {
		throw new McpServerDocumentChangedError(resource);
	}
	await beforeWrite?.();
	return fileService.writeFile(resource, VSBuffer.fromString(content), {
		etag: current.etag,
		mtime: current.mtime,
	});
}

async function restoreExistingDocument(
	resource: URI,
	original: IJsonDocument,
	written: IFileStatWithMetadata,
	writtenContent: string,
	fileService: IFileService,
): Promise<void> {
	const current = await fileService.readFile(resource);
	if (current.etag !== written.etag || current.mtime !== written.mtime || current.value.toString() !== writtenContent) {
		throw new Error(`Cannot safely restore ${resource.toString()} because it changed after migration.`);
	}
	await writeExistingDocument(resource, original.content, writtenContent, fileService);
}

async function rollbackTarget(
	group: IMcpServerMigrationGroup,
	original: IMcpTargetDocument,
	written: IFileStatWithMetadata,
	writtenContent: string,
	fileService: IFileService,
	logService: ILogService,
	services: IMcpServerVariableServices,
): Promise<void> {
	const resource = group.targetUri;
	const current = await fileService.readFile(resource);
	if (current.etag !== written.etag || current.mtime !== written.mtime || current.value.toString() !== writtenContent) {
		throw new McpServerMigrationError(
			McpServerCustomizationMigrationFailureReason.RollbackFailed,
			new Error(`Cannot safely restore ${resource.toString()} because it changed after migration.`),
		);
	}
	if (original.exists) {
		const originalServers = getTargetServers(original);
		const addedCandidates = group.candidates.filter(candidate => !Object.hasOwn(originalServers, candidate.name));
		await writeExistingDocument(resource, original.content, writtenContent, fileService, async () => {
			try {
				const sourceFile = getMcpSourceFile((await readSourceDocument(group.sourceUri, fileService)).value);
				if (!sourceFile) {
					throw new Error(`Source ${group.sourceUri.toString()} no longer contains all entries added to ${resource.toString()}.`);
				}
				const sourceServers = sourceFile.servers;
				for (const candidate of addedCandidates) {
					if (!Object.hasOwn(sourceServers, candidate.name)) {
						throw new Error(`Source ${group.sourceUri.toString()} no longer contains all entries added to ${resource.toString()}.`);
					}
					const analysis = await analyzeSourceConfiguration(sourceServers[candidate.name], sourceFile, group.storage === PromptsStorage.local ? dirname(group.targetUri) : undefined, group.storage, services);
					if (typeof analysis === 'string' || !isAnalysisOfCandidate(analysis, candidate)) {
						throw new Error(`Source ${group.sourceUri.toString()} no longer contains all entries added to ${resource.toString()}.`);
					}
				}
			} catch (error) {
				logService.warn(`${LOG_PREFIX} Retaining ${resource.toString()}: cannot verify surviving source entries in ${group.sourceUri.toString()}.`);
				throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.RollbackFailed, toError(error));
			}
		});
	} else {
		throw new McpServerMigrationError(
			McpServerCustomizationMigrationFailureReason.RollbackFailed,
			new Error(`Cannot safely remove newly created ${resource.toString()} during rollback.`),
		);
	}
}

async function ensureFileExists(resource: URI, fileService: IFileService): Promise<void> {
	try {
		await fileService.resolve(resource);
	} catch (error) {
		if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			throw new FileOperationError(`File was deleted during MCP migration: ${resource.toString()}`, FileOperationResult.FILE_NOT_FOUND);
		}
		throw error;
	}
}

function isStrictSourceTargetPair(sourceUri: URI, targetUri: URI): boolean {
	return basename(sourceUri) === 'mcp.json'
		&& basename(dirname(sourceUri)) === '.vscode'
		&& isEqual(targetUri, URI.joinPath(dirname(dirname(sourceUri)), '.mcp.json'));
}

function isUserSourceTargetPair(sourceUri: URI, targetUri: URI): boolean {
	return basename(sourceUri) === 'mcp.json'
		&& basename(targetUri) === 'mcp-config.json'
		&& sourceUri.authority === targetUri.authority
		&& (targetUri.scheme === Schemas.vscodeRemote
			? sourceUri.scheme === Schemas.vscodeRemote
			: targetUri.scheme === Schemas.file && (sourceUri.scheme === Schemas.file || sourceUri.scheme === Schemas.vscodeUserData));
}

function getObjectProperty(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const property = value[key];
	return isJsonObject(property) ? property : undefined;
}

function canonicalizeConfiguration(configuration: IMcpServerConfiguration): IMcpServerConfiguration {
	if (configuration.type === McpServerType.LOCAL) {
		return {
			type: configuration.type,
			command: configuration.command,
			...(configuration.args?.length ? { args: [...configuration.args] } : {}),
			...(configuration.env && Object.keys(configuration.env).length > 0 ? { env: { ...configuration.env } } : {}),
			...(configuration.cwd !== undefined ? { cwd: configuration.cwd } : {}),
		};
	}
	return {
		type: configuration.type,
		...(configuration.transport === 'sse' ? { transport: 'sse' } : {}),
		url: configuration.url,
		...(configuration.headers && Object.keys(configuration.headers).length > 0 ? { headers: { ...configuration.headers } } : {}),
	};
}

function isConfigurationRepresentable(configuration: IMcpServerConfiguration): boolean {
	if (configuration.version !== undefined || configuration.gallery !== undefined || configuration.dev !== undefined) {
		return false;
	}
	if (configuration.type === McpServerType.LOCAL) {
		return configuration.envFile === undefined
			&& configuration.cwd === undefined
			&& configuration.sandboxEnabled !== true
			&& (!configuration.env || Object.values(configuration.env).every(value => value !== null));
	}
	return configuration.transport !== 'sse';
}

function canonicalizeSourceConfiguration(rawConfiguration: unknown): IMcpServerConfiguration | undefined {
	if (!isJsonObject(rawConfiguration)) {
		return undefined;
	}
	const configuration = normalizeMcpServerConfiguration(rawConfiguration);
	if (!configuration || !hasOnlyRepresentableProperties(rawConfiguration, configuration.type)) {
		return undefined;
	}
	if (configuration.type === McpServerType.LOCAL) {
		if ((rawConfiguration.args !== undefined && (!Array.isArray(rawConfiguration.args) || rawConfiguration.args.some(value => typeof value !== 'string')))
			|| (rawConfiguration.env !== undefined && (!isJsonObject(rawConfiguration.env) || Object.values(rawConfiguration.env).some(value => typeof value !== 'string' && typeof value !== 'number' && value !== null)))) {
			return undefined;
		}
	} else if (rawConfiguration.headers !== undefined
		&& (!isJsonObject(rawConfiguration.headers) || Object.values(rawConfiguration.headers).some(value => typeof value !== 'string'))) {
		return undefined;
	}
	return canonicalizeConfiguration(configuration);
}

/** The services that the variables of a source server are resolved with. */
interface IMcpServerVariableServices {
	readonly configurationResolverService: IConfigurationResolverService;
	readonly configurationService: IConfigurationService;
}

interface IMcpServerSourceAnalysis {
	/** The source server as the client forwards it, to compare with its projected configuration. */
	readonly projection: IMcpServerConfiguration;
	/** The source server as written to the destination. Identical to {@link projection} unless it uses `${env:}`, `${input:}` or `${config:}`. */
	readonly migration: IMcpServerConfiguration;
	/** The inputs the server reads from environment variables once migrated, if it references any. */
	readonly environmentVariables?: readonly IMcpServerCustomizationMigrationVariable[];
	/** The settings the server reads from environment variables once migrated, if it references any. */
	readonly settingVariables?: readonly IMcpServerCustomizationMigrationSettingVariable[];
	/** Whether the client projects the server as written, with none of its variables resolved. */
	readonly projectedAsWritten?: boolean;
	/**
	 * Variables in the values of the server's settings that the client keeps as text when it resolves them,
	 * such as `${input:}`, so they remain in its projection.
	 */
	readonly settingValueVariables?: ReadonlySet<string>;
	/** The OAuth client ID of a remote server, which neither configuration includes, since the client does not forward it. */
	readonly oauthClientId?: string;
}

/**
 * Analyzes a source server deterministically, so planning, the checks before writing and rollback
 * agree on what is migrated. Portable variables are resolved to literals. `${env:NAME}` is rewritten
 * to `${NAME}`, never to its current value, so the destination reads the variable at server start.
 * `${input:id}` and `${config:key}` are rewritten to an environment variable named after the input or
 * setting. A local server declares it in its `env`, set to the input's default, or empty, or to the
 * setting's current value, or empty if it has none; a remote server, which has no `env`, writes that value
 * in the reference instead.
 */
async function analyzeSourceConfiguration(
	rawConfiguration: unknown,
	sourceFile: IMcpSourceFile,
	root: URI | undefined,
	storage: PromptsStorage.local | PromptsStorage.user,
	services: IMcpServerVariableServices,
): Promise<IMcpServerSourceAnalysis | McpServerCustomizationMigrationFailureReason> {
	const configuration = canonicalizeSourceConfiguration(rawConfiguration);
	if (!configuration || !isJsonObject(rawConfiguration)) {
		return normalizeMcpServerConfiguration(rawConfiguration)
			? McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration
			: McpServerCustomizationMigrationFailureReason.InvalidSource;
	}
	const oauth = getSourceOAuthClient(rawConfiguration);
	if (typeof oauth === 'string') {
		return oauth;
	}
	const analysis = await analyzeSourceConnection(configuration, sourceFile, root, storage, services);
	return typeof analysis === 'string' || oauth.clientId === undefined ? analysis : { ...analysis, oauthClientId: oauth.clientId };
}

/**
 * Reads the `oauth` of a source server. Only its client ID is migrated, since the client secret is kept in
 * VS Code's secret storage. Enterprise-managed sign-in relies on a VS Code setting, so it cannot be migrated.
 */
function getSourceOAuthClient(rawConfiguration: Record<string, unknown>): { readonly clientId?: string } | McpServerCustomizationMigrationFailureReason {
	const oauth = rawConfiguration.oauth;
	if (oauth === undefined) {
		return {};
	}
	if (!isJsonObject(oauth)
		|| Object.keys(oauth).some(key => key !== 'clientId' && key !== 'enterpriseManaged')
		|| (oauth.clientId !== undefined && typeof oauth.clientId !== 'string')
		|| (oauth.enterpriseManaged !== undefined && typeof oauth.enterpriseManaged !== 'boolean')) {
		return McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
	}
	if (oauth.enterpriseManaged === true) {
		return McpServerCustomizationMigrationFailureReason.EnterpriseManagedOAuth;
	}
	if (typeof oauth.clientId === 'string' && hasConfigurationVariable(oauth.clientId)) {
		return McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
	}
	return oauth.clientId ? { clientId: oauth.clientId } : {};
}

async function analyzeSourceConnection(
	configuration: IMcpServerConfiguration,
	sourceFile: IMcpSourceFile,
	root: URI | undefined,
	storage: PromptsStorage.local | PromptsStorage.user,
	services: IMcpServerVariableServices,
): Promise<IMcpServerSourceAnalysis | McpServerCustomizationMigrationFailureReason> {
	const { configurationResolverService } = services;
	const isPortable = (replacement: Replacement) => isPortableMigrationVariable(replacement.name, replacement.arg)
		&& (!!root || replacement.name === 'pathSeparator' || replacement.name === '/');
	let hasEnvironmentVariables = false;
	const inputIds = new Set<string>();
	const settingKeys = new Set<string>();
	for (const replacement of ConfigurationResolverExpression.parse(configuration).unresolved()) {
		if (replacement.name === 'env') {
			hasEnvironmentVariables = true;
		} else if (replacement.name === 'input') {
			inputIds.add(replacement.arg ?? '');
		} else if (replacement.name === 'config') {
			settingKeys.add(replacement.arg ?? '');
		} else if (!isPortable(replacement)) {
			return McpServerCustomizationMigrationFailureReason.UnsupportedVariable;
		}
	}

	const folder: IWorkspaceFolderData | undefined = root ? { uri: root, name: basename(root), index: 0 } : undefined;
	if (!hasEnvironmentVariables && inputIds.size === 0 && settingKeys.size === 0) {
		const resolved = await resolveVariables(configuration, folder, configurationResolverService);
		return resolved ? { projection: resolved, migration: resolved } : McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
	}

	const variables = getMigratedVariables(inputIds, sourceFile);
	if (typeof variables === 'string') {
		return variables;
	}
	const settings = await getSettingVariables(settingKeys, sourceFile, folder, storage, services);
	if (typeof settings === 'string') {
		return settings;
	}
	const withEnvironmentVariables = await resolvePortableVariables(configuration, folder, isPortable, configurationResolverService);
	if (!withEnvironmentVariables) {
		return McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
	}
	const migration = rewriteEnvironmentVariables(withEnvironmentVariables, variables, settings.variables);
	if (typeof migration === 'string') {
		return migration;
	}
	if (hasEnvironmentVariables && await hasVariablesInEnvironmentValues(configuration, folder, configurationResolverService)) {
		return McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
	}
	const settingVariables = {
		...(settings.variables.length > 0 ? { settingVariables: settings.variables } : {}),
		...(settings.valueVariables.size > 0 ? { settingValueVariables: settings.valueVariables } : {}),
	};
	// The client never resolves user servers, so a setting it can't resolve only matters for `.vscode/mcp.json` servers.
	if (variables.length > 0 || (!settings.resolvable && storage === PromptsStorage.local)) {
		// The client stops at the first input, or fails on a setting it can't resolve, and projects the server as written.
		return { projection: configuration, migration, ...(variables.length > 0 ? { environmentVariables: variables } : {}), ...settingVariables, projectedAsWritten: true };
	}
	// The client resolves the variables of `.vscode/mcp.json` servers before forwarding them, including
	// settings, but forwards user servers as written.
	const projection = storage === PromptsStorage.user
		? withEnvironmentVariables
		: await resolveVariables(configuration, folder, configurationResolverService);
	return projection ? { projection, migration, ...settingVariables } : McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
}

/**
 * Reads the current value of each setting that a server references, in the scope of the folder that
 * VS Code resolves the server's variables in, so it is the value VS Code substitutes today. Only a
 * string or a number is carried over. Any other setting, whether unset, unnamed, structured or a boolean,
 * becomes an empty variable, as does a value containing a variable, which VS Code resolves while the
 * destination would not. A workspace server only keeps a value that is already in the workspace's own
 * settings, since its destination is usually committed: a value from the user's settings, a policy or
 * memory would otherwise be written into the repository. `resolvable` is whether VS Code can resolve
 * every setting, which it can't when one is unset, unnamed or structured. `valueVariables` are the
 * variables that resolving the values leaves as text, such as an `${input:}` in a value.
 */
async function getSettingVariables(
	settingKeys: ReadonlySet<string>,
	sourceFile: IMcpSourceFile,
	folder: IWorkspaceFolderData | undefined,
	storage: PromptsStorage.local | PromptsStorage.user,
	services: IMcpServerVariableServices,
): Promise<{ readonly variables: IMcpServerCustomizationMigrationSettingVariable[]; readonly resolvable: boolean; readonly valueVariables: ReadonlySet<string> } | McpServerCustomizationMigrationFailureReason> {
	const names = getMigratedSettingNames(settingKeys, sourceFile);
	if (typeof names === 'string') {
		return names;
	}
	const variables: IMcpServerCustomizationMigrationSettingVariable[] = [];
	const valueVariables = new Set<string>();
	let resolvable = true;
	for (const { key, name } of names) {
		// Like the client, which fails on a variable it leaves unresolved. A variable it can't resolve without
		// interaction, such as an `${input:}` in the value, is replaced with its own text instead.
		const expression = ConfigurationResolverExpression.parse(`\${config:${key}}`);
		try {
			await services.configurationResolverService.resolveAsync(folder, expression);
			resolvable &&= Iterable.isEmpty(expression.unresolved());
			for (const variable of getConfigurationVariables(expression.toObject())) {
				valueVariables.add(variable.id);
			}
		} catch {
			resolvable = false;
		}
		// Without a key, `inspect` would describe every setting.
		const inspected = key ? services.configurationService.inspect<unknown>(key, folder ? { resource: folder.uri } : {}) : undefined;
		const rawValue = inspected && (storage === PromptsStorage.user || isWorkspaceSettingValue(inspected)) ? inspected.value : undefined;
		const value = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue) : '';
		variables.push({ key, name, value: hasConfigurationVariable(value) || hasEnvVarReferences(value) ? '' : value });
	}
	return { variables, resolvable, valueVariables };
}

/**
 * Whether a setting's current value comes from the workspace or folder settings. A policy or memory value
 * takes precedence over them.
 */
function isWorkspaceSettingValue(inspected: IConfigurationValue<unknown>): boolean {
	return inspected.policyValue === undefined
		&& inspected.memoryValue === undefined
		&& (inspected.workspaceFolderValue !== undefined || inspected.workspaceValue !== undefined);
}

function isAnalysisOfCandidate(analysis: IMcpServerSourceAnalysis, candidate: IMcpServerCustomizationMigrationCandidate): boolean {
	return equals(analysis.projection, canonicalizeConfiguration(candidate.projectedConfiguration))
		&& equals(analysis.migration, canonicalizeConfiguration(getMigratedConfiguration(candidate)))
		&& equals(analysis.environmentVariables, candidate.environmentVariables)
		&& equals(analysis.settingVariables, candidate.settingVariables)
		&& analysis.oauthClientId === candidate.oauth?.clientId;
}

/**
 * Whether a variable may remain in a projected configuration. A server with `${input:}`, or with a setting
 * the client can't resolve, is projected as written, so its `${input:}`, `${env:}`, `${config:}` and
 * portable variables remain. Otherwise, only user servers are forwarded unresolved, and only their
 * `${env:}` and `${config:}` are migrated.
 */
function isForwardedUnresolved(replacement: Replacement, storage: PromptsStorage.local | PromptsStorage.user, projectedAsWritten: boolean): boolean {
	if (projectedAsWritten) {
		return replacement.name === 'input' || replacement.name === 'env' || replacement.name === 'config' || isPortableMigrationVariable(replacement.name, replacement.arg);
	}
	return storage === PromptsStorage.user && (replacement.name === 'env' || replacement.name === 'config');
}

async function resolveVariables(
	configuration: IMcpServerConfiguration,
	folder: IWorkspaceFolderData | undefined,
	configurationResolverService: IConfigurationResolverService,
): Promise<IMcpServerConfiguration | undefined> {
	const expression = ConfigurationResolverExpression.parse(configuration);
	try {
		await configurationResolverService.resolveAsync(folder, expression);
	} catch {
		return undefined;
	}
	return Iterable.isEmpty(expression.unresolved()) ? expression.toObject() : undefined;
}

/**
 * Whether the value of a referenced environment variable contains a variable. VS Code resolves those
 * nested variables, while the destination substitutes `${NAME}` once and keeps its value verbatim.
 */
async function hasVariablesInEnvironmentValues(
	configuration: IMcpServerConfiguration,
	folder: IWorkspaceFolderData | undefined,
	configurationResolverService: IConfigurationResolverService,
): Promise<boolean> {
	const expression = ConfigurationResolverExpression.parse(configuration);
	// Settings are migrated separately, and one that VS Code can't resolve must not hide the environment variables.
	for (const replacement of expression.unresolved()) {
		if (replacement.name === 'config') {
			expression.resolve(replacement, '');
		}
	}
	try {
		await configurationResolverService.resolveAsync(folder, expression);
	} catch {
		return true;
	}
	return Iterable.some(expression.resolved(), ([replacement, resolved]) => replacement.name === 'env'
		&& resolved.value !== undefined
		&& hasConfigurationVariable(resolved.value));
}

/**
 * Resolves every variable except `${env:}`, `${input:}` and `${config:}`, which stay verbatim. Resolving
 * `${env:NAME}` to `${NAME}` inside the expression is not possible, since it parses resolved values for
 * further variables.
 */
async function resolvePortableVariables(
	configuration: IMcpServerConfiguration,
	folder: IWorkspaceFolderData | undefined,
	isPortable: (replacement: Replacement) => boolean,
	configurationResolverService: IConfigurationResolverService,
): Promise<IMcpServerConfiguration | undefined> {
	const expression = ConfigurationResolverExpression.parse(configuration);
	for (const replacement of expression.unresolved()) {
		if (replacement.name === 'env' || replacement.name === 'input' || replacement.name === 'config') {
			continue;
		}
		if (!isPortable(replacement)) {
			return undefined;
		}
		let value: string;
		try {
			value = await configurationResolverService.resolveAsync(folder, replacement.id);
		} catch {
			return undefined;
		}
		if (value === replacement.id) {
			return undefined;
		}
		expression.resolve(replacement, value);
	}
	return expression.toObject();
}

/**
 * Rewrites `${env:NAME}` to `${NAME}`, and `${input:id}` and `${config:key}` to `${NAME}`, or
 * `${NAME:-value}` for a remote server, in the fields that both the Copilot runtime and the local harness
 * expand: stdio `command`, `args` and `env` values, and the remote URL and header values. In a stdio
 * server's `env` values, a setting is replaced with its value instead, since those are expanded from the
 * host's environment rather than from the other `env` entries. Every other variable must already be
 * resolved.
 */
function rewriteEnvironmentVariables(
	configuration: IMcpServerConfiguration,
	variables: readonly IMcpServerCustomizationMigrationVariable[],
	settingVariables: readonly IMcpServerCustomizationMigrationSettingVariable[],
): IMcpServerConfiguration | McpServerCustomizationMigrationFailureReason {
	const names = Object.keys((configuration.type === McpServerType.LOCAL ? configuration.env : configuration.headers) ?? {});
	if (names.some(hasMigratedVariableReference)) {
		return McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName;
	}

	// A stdio server declares each variable in its `env`, with the input's default or the setting's value. A remote
	// server has no `env`, so its references carry that value instead.
	const declaresVariables = configuration.type === McpServerType.LOCAL;
	const inputs = new Map(variables.map(variable => [variable.id, variable]));
	const settings = new Map(settingVariables.map(setting => [setting.key, setting]));
	const failures: McpServerCustomizationMigrationFailureReason[] = [];
	const referencedSettings = new Set<string>();
	const rewrite = (value: string, isEnvironmentValue = false): string => {
		let rewritten = false;
		const defaults: { readonly offset: number; readonly reference: string; readonly name: string; readonly defaultValue: string; readonly failure: McpServerCustomizationMigrationFailureReason }[] = [];
		const withDefault = (offset: number, name: string, defaultValue: string, failure: McpServerCustomizationMigrationFailureReason) => {
			const reference = `\${${name}:-${defaultValue}}`;
			defaults.push({ offset, reference, name, defaultValue, failure });
			return reference;
		};
		const result = replaceConfigurationVariables(value, (variable, offset) => {
			if (variable.name === 'input') {
				const input = variable.arg !== undefined ? inputs.get(variable.arg) : undefined;
				if (!input) {
					failures.push(McpServerCustomizationMigrationFailureReason.UnsupportedInputType);
					return variable.id;
				}
				rewritten = true;
				const defaultValue = input.declaration.default;
				return defaultValue === undefined || declaresVariables
					? `\${${input.name}}`
					: withDefault(offset, input.name, defaultValue, McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault);
			}
			if (variable.name === 'config') {
				const setting = settings.get(variable.arg ?? '');
				if (!setting) {
					failures.push(McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration);
					return variable.id;
				}
				rewritten = true;
				if (isEnvironmentValue) {
					return setting.value;
				}
				referencedSettings.add(setting.key);
				// Unlike an input's default, a setting's value is written as is: a value that doesn't read back
				// exactly, such as one with a `}`, is rare enough not to keep the server from migrating.
				return declaresVariables || setting.value === ''
					? `\${${setting.name}}`
					: `\${${setting.name}:-${setting.value}}`;
			}
			if (variable.name !== 'env') {
				failures.push(McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration);
			} else if (variable.arg === undefined || !environmentVariableNamePattern.test(variable.arg)) {
				failures.push(McpServerCustomizationMigrationFailureReason.InvalidEnvironmentVariableName);
			} else {
				rewritten = true;
				return `\${${variable.arg}}`;
			}
			return variable.id;
		});
		if (rewritten && result.length > MAX_ENV_VAR_RESOLVE_LENGTH) {
			failures.push(McpServerCustomizationMigrationFailureReason.EnvironmentVariableValueTooLong);
		} else {
			const broken = defaults.find(({ offset, reference, name, defaultValue }) => !isDefaultReferenceIntact(result, offset, reference, name, defaultValue));
			if (broken) {
				failures.push(broken.failure);
			}
		}
		return result;
	};

	let migration: IMcpServerConfiguration;
	if (configuration.type === McpServerType.LOCAL) {
		if (configuration.cwd !== undefined && hasMigratedVariableReference(configuration.cwd)) {
			return McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration;
		}
		const command = rewrite(configuration.command);
		const args = configuration.args?.map(arg => rewrite(arg));
		const env = configuration.env ? Object.fromEntries(Object.entries(configuration.env).map(([name, value]) => [name, typeof value === 'string' ? rewrite(value, true) : value])) : {};
		// Only settings that `command` or `args` read from the environment are declared.
		const declared = declareEnvironmentVariables(env, [
			...variables.map(input => ({ name: input.name, value: input.declaration.default ?? '', invalidValue: McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault })),
			...settingVariables.filter(setting => referencedSettings.has(setting.key)).map(setting => ({ name: setting.name, value: setting.value, invalidValue: McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration })),
		]);
		if (typeof declared === 'string') {
			failures.push(declared);
		}
		migration = {
			...configuration,
			command,
			...(args ? { args } : {}),
			...(typeof declared !== 'string' && Object.keys(declared).length > 0 ? { env: declared } : {}),
		};
	} else {
		const url = rewrite(configuration.url);
		// The Copilot runtime validates the URL before expanding it, so a reference in the port, the scheme or the whole URL is rejected.
		if (url !== configuration.url && failures.length === 0 && !URL.canParse(url)) {
			failures.push(McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl);
		}
		migration = {
			...configuration,
			url,
			...(configuration.headers ? { headers: Object.fromEntries(Object.entries(configuration.headers).map(([name, value]) => [name, rewrite(value)])) } : {}),
		};
	}
	return failures[0] ?? migration;
}

/**
 * Adds each migrated input or setting to a stdio server's `env`, set to the input's default, or empty if it
 * has none, or to the setting's value, so that it can be filled in there. An entry that only referred to the
 * input or setting, or already holds the setting's value, is replaced. Since `env` values are expanded too,
 * a value that contains a variable reference can't be written literally.
 */
function declareEnvironmentVariables(
	env: Record<string, string | number | null>,
	declarations: readonly { readonly name: string; readonly value: string; readonly invalidValue: McpServerCustomizationMigrationFailureReason }[],
): Record<string, string | number | null> | McpServerCustomizationMigrationFailureReason {
	const result = { ...env };
	for (const { name, value, invalidValue } of declarations) {
		if (hasEnvVarReferences(value)) {
			return invalidValue;
		}
		// Windows names are case-insensitive.
		const existing = Object.keys(result).find(key => key.toUpperCase() === name.toUpperCase());
		if (existing !== undefined && (existing !== name || (result[existing] !== `\${${name}}` && result[existing] !== value))) {
			return McpServerCustomizationMigrationFailureReason.VariableNameCollision;
		}
		result[name] = value;
	}
	return result;
}

/** Whether `value` contains an `${env:}`, `${input:}` or `${config:}` reference, which are migrated to environment variables. */
function hasMigratedVariableReference(value: string): boolean {
	return Iterable.some(getConfigurationVariables(value), variable => variable.name === 'env' || variable.name === 'input' || variable.name === 'config');
}

function isPortableMigrationVariable(name: string, argument: string | undefined): boolean {
	if (name === 'pathSeparator' || name === '/') {
		return argument === undefined;
	}
	return name === 'workspaceFolder'
		|| name === 'workspaceRoot'
		|| name === 'workspaceFolderBasename'
		|| name === 'workspaceRootFolderName'
		|| name === 'cwd';
}

function hasOnlyRepresentableProperties(rawConfiguration: Record<string, unknown>, type: McpServerType): boolean {
	const allowed = type === McpServerType.LOCAL
		? new Set(['type', 'command', 'args', 'env', 'cwd', ...mcpServerCustomizationMigrationRemovableProperties])
		: new Set(['type', 'transport', 'url', 'headers', 'oauth', ...mcpServerCustomizationMigrationRemovableProperties.filter(property => property !== 'sandboxEnabled')]);
	return Object.keys(rawConfiguration).every(key => allowed.has(key));
}

function getRemovedProperties(rawConfiguration: unknown): IMcpServerCustomizationMigrationCandidate['removedProperties'] {
	if (!isJsonObject(rawConfiguration)) {
		return undefined;
	}
	const entries = mcpServerCustomizationMigrationRemovableProperties
		.filter(property => Object.hasOwn(rawConfiguration, property))
		.map(property => [property, rawConfiguration[property]] as const);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function setJsonValue(content: string, path: readonly string[], value: unknown): string {
	return applyEdits(content, setProperty(content, [...path], value, getFormattingOptions(content)));
}

function getFormattingOptions(content: string): FormattingOptions {
	const indentation = /^([ \t]+)"/m.exec(content)?.[1];
	const insertSpaces = indentation !== undefined && !indentation.includes('\t');
	return {
		insertSpaces,
		tabSize: insertSpaces ? indentation.length : 1,
		eol: content.includes('\r\n') ? '\r\n' : '\n',
	};
}

function rollbackErrorWith(error: unknown, rollbackError: unknown, sourceUri: URI): McpServerMigrationError {
	return new McpServerMigrationError(
		McpServerCustomizationMigrationFailureReason.RollbackFailed,
		new AggregateError([toError(error), toError(rollbackError)], `Failed to migrate and roll back MCP servers from ${sourceUri.toString()}.`),
	);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

class McpServerMigrationError extends Error {
	constructor(
		readonly reason: McpServerCustomizationMigrationFailureReason,
		readonly underlyingError: Error,
	) {
		super(underlyingError.message);
	}
}

class McpServerDocumentChangedError extends Error {
	constructor(resource: URI) {
		super(`MCP configuration ${resource.toString()} changed during migration.`);
	}
}

function toMigrationError(error: unknown): McpServerMigrationError {
	return error instanceof McpServerMigrationError
		? error
		: new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.WriteFailed, toError(error));
}

function createFailure(
	candidate: IMcpServerCustomizationMigrationCandidate,
	reason: McpServerCustomizationMigrationFailureReason,
	error?: Error,
): IMcpServerCustomizationMigrationFailure {
	return {
		storage: candidate.storage,
		id: candidate.id,
		name: candidate.name,
		sourceUri: candidate.sourceUri,
		targetUri: candidate.targetUri,
		reason,
		error,
	};
}
