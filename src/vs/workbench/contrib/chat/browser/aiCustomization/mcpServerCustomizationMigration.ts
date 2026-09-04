/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { parse, ParseError } from '../../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../../base/common/jsonFormatter.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { equals } from '../../../../../base/common/objects.js';
import { basename, dirname, getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { normalizeMcpServerConfiguration } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ConfigurationResolverExpression } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { CustomizationMigrationType, IMcpServerCustomizationMigrationCandidate, IMcpServerCustomizationMigrationFailure, IMcpServerCustomizationMigrationResult, McpServerCustomizationMigrationFailureReason } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerSourceKind, IAgentHostMcpServerSupportSnapshot } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';

export interface IMcpServerCustomizationMigrationPlan {
	readonly candidates: readonly IMcpServerCustomizationMigrationCandidate[];
	readonly exclusions: readonly IMcpServerCustomizationMigrationFailure[];
}

interface IMcpServerMigrationGroup {
	readonly sourceUri: URI;
	readonly targetUri: URI;
	readonly candidates: IMcpServerCustomizationMigrationCandidate[];
}

interface IJsonDocument {
	readonly content: string;
	readonly value: Record<string, unknown>;
	readonly exists: boolean;
}

interface IMcpServerCustomizationMigrationExecutionOptions {
	readonly isContextCurrent?: () => boolean;
}

/**
 * Plans eligible MCP server moves and executes guarded source-to-target transactions.
 */
export class McpServerCustomizationMigrator {
	constructor(private readonly fileService: IFileService) { }

	async createPlan(snapshot: IAgentHostMcpServerSupportSnapshot, roots: readonly URI[]): Promise<IMcpServerCustomizationMigrationPlan> {
		const candidates: IMcpServerCustomizationMigrationCandidate[] = [];
		const exclusions: IMcpServerCustomizationMigrationFailure[] = [];
		const sourceServers = new ResourceMap<Promise<Record<string, unknown> | undefined>>();

		for (const server of snapshot.servers) {
			const sourceUri = server.source.collectionUri;
			const root = sourceUri ? roots.find(candidate => isEqual(sourceUri, URI.joinPath(candidate, '.vscode', 'mcp.json'))) : undefined;
			if (server.source.kind !== AgentHostMcpServerSourceKind.VscodeWorkspaceFolder || !sourceUri || !root) {
				continue;
			}

			const targetUri = URI.joinPath(root, '.mcp.json');
			const excluded = (reason: McpServerCustomizationMigrationFailureReason, error?: Error): void => {
				exclusions.push({
					id: server.id,
					name: server.name,
					sourceUri,
					targetUri,
					reason,
					error,
				});
			};
			if (!server.enablement.enabled
				|| server.applicability !== AgentHostMcpServerApplicability.Applicable
				|| server.delivery !== AgentHostMcpServerDelivery.ClientForwarded
				|| server.compatibility.kind !== 'supported'
				|| !server.projectedConfiguration) {
				excluded(McpServerCustomizationMigrationFailureReason.NoLongerEligible);
				continue;
			}

			let sourceServersPromise = sourceServers.get(sourceUri);
			if (!sourceServersPromise) {
				sourceServersPromise = this.readMcpServers(sourceUri);
				sourceServers.set(sourceUri, sourceServersPromise);
			}

			let servers: Record<string, unknown> | undefined;
			try {
				servers = await sourceServersPromise;
			} catch (error) {
				const migrationError = error instanceof McpServerMigrationError ? error : undefined;
				excluded(migrationError?.reason ?? McpServerCustomizationMigrationFailureReason.SourceUnavailable, migrationError ?? toError(error));
				continue;
			}
			if (!servers) {
				excluded(McpServerCustomizationMigrationFailureReason.SourceUnavailable);
				continue;
			}
			if (!Object.hasOwn(servers, server.name)) {
				excluded(McpServerCustomizationMigrationFailureReason.NoLongerEligible);
				continue;
			}
			const rawConfiguration = servers[server.name];
			const sourceConfiguration = canonicalizeSourceConfiguration(rawConfiguration);
			const projectedConfiguration = canonicalizeConfiguration(server.projectedConfiguration);
			if (!sourceConfiguration) {
				excluded(normalizeMcpServerConfiguration(rawConfiguration)
					? McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration
					: McpServerCustomizationMigrationFailureReason.InvalidSource);
				continue;
			}
			if (!isConfigurationRepresentable(server.projectedConfiguration)
				|| !Iterable.isEmpty(ConfigurationResolverExpression.parse(server.projectedConfiguration).unresolved())
				|| !equals(sourceConfiguration, projectedConfiguration)) {
				excluded(McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration);
				continue;
			}
			candidates.push({
				type: CustomizationMigrationType.McpServers,
				id: server.id,
				name: server.name,
				sourceUri,
				targetUri,
				projectedConfiguration: server.projectedConfiguration,
			});
		}

		return { candidates, exclusions };
	}

	migrate(
		candidates: readonly IMcpServerCustomizationMigrationCandidate[],
		options: IMcpServerCustomizationMigrationExecutionOptions = {},
	): Promise<IMcpServerCustomizationMigrationResult> {
		return executeMigration(candidates, this.fileService, options);
	}

	private async readMcpServers(resource: URI): Promise<Record<string, unknown> | undefined> {
		let content: string;
		try {
			content = (await this.fileService.readFile(resource)).value.toString();
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
			throw error;
		}
		const errors: ParseError[] = [];
		const value = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
		const servers = errors.length === 0 && isJsonObject(value) ? getObjectProperty(value, 'servers') : undefined;
		if (!servers) {
			throw new McpServerMigrationError(
				McpServerCustomizationMigrationFailureReason.InvalidSource,
				new Error(`MCP configuration ${resource.toString()} does not contain a valid servers object.`),
			);
		}
		return servers;
	}
}

async function executeMigration(
	candidates: readonly IMcpServerCustomizationMigrationCandidate[],
	fileService: IFileService,
	options: IMcpServerCustomizationMigrationExecutionOptions,
): Promise<IMcpServerCustomizationMigrationResult> {
	const groups = new Map<string, IMcpServerMigrationGroup>();
	const failures: IMcpServerCustomizationMigrationFailure[] = [];
	for (const candidate of candidates) {
		if (!isStrictSourceTargetPair(candidate.sourceUri, candidate.targetUri)) {
			failures.push(createFailure(candidate, McpServerCustomizationMigrationFailureReason.InconsistentTarget));
			continue;
		}
		const key = JSON.stringify([getComparisonKey(candidate.sourceUri), getComparisonKey(candidate.targetUri)]);
		const group = groups.get(key) ?? {
			sourceUri: candidate.sourceUri,
			targetUri: candidate.targetUri,
			candidates: [],
		};
		group.candidates.push(candidate);
		groups.set(key, group);
	}

	let migratedCount = 0;
	for (const group of groups.values()) {
		if (options.isContextCurrent?.() === false) {
			failures.push(...group.candidates.map(candidate => createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible)));
			continue;
		}
		try {
			const result = await migrateGroup(group, fileService, options);
			migratedCount += result.migratedCount;
			failures.push(...result.failures);
		} catch (error) {
			const migrationError = toMigrationError(error);
			failures.push(...group.candidates.map(candidate => createFailure(candidate, migrationError.reason, migrationError)));
		}
	}

	return { migratedCount, failures };
}

async function migrateGroup(
	group: IMcpServerMigrationGroup,
	fileService: IFileService,
	options: IMcpServerCustomizationMigrationExecutionOptions,
): Promise<IMcpServerCustomizationMigrationResult> {
	let source: IJsonDocument;
	try {
		source = await readSourceDocument(group.sourceUri, fileService);
	} catch (error) {
		if (error instanceof McpServerMigrationError) {
			throw error;
		}
		throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.SourceUnavailable, toError(error));
	}
	const sourceServers = getObjectProperty(source.value, 'servers');
	if (!sourceServers) {
		throw new McpServerMigrationError(
			McpServerCustomizationMigrationFailureReason.InvalidSource,
			new Error(`MCP configuration ${group.sourceUri.toString()} does not contain a servers object.`),
		);
	}

	let target: IJsonDocument;
	try {
		target = await readTargetDocument(group.targetUri, fileService);
	} catch (error) {
		throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.InvalidTarget, toError(error));
	}
	const targetServers = getObjectProperty(target.value, 'mcpServers')!;
	const candidatesToMigrate: IMcpServerCustomizationMigrationCandidate[] = [];
	const failures: IMcpServerCustomizationMigrationFailure[] = [];

	for (const candidate of group.candidates) {
		if (!isConfigurationRepresentable(candidate.projectedConfiguration)) {
			failures.push(createFailure(candidate, McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration));
			continue;
		}
		if (!Object.hasOwn(sourceServers, candidate.name)) {
			failures.push(createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible));
			continue;
		}
		const sourceConfiguration = canonicalizeSourceConfiguration(sourceServers[candidate.name]);
		const migrationConfiguration = canonicalizeConfiguration(candidate.projectedConfiguration);
		if (!sourceConfiguration) {
			failures.push(createFailure(candidate, normalizeMcpServerConfiguration(sourceServers[candidate.name])
				? McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration
				: McpServerCustomizationMigrationFailureReason.InvalidSource));
			continue;
		}
		if (!equals(sourceConfiguration, migrationConfiguration)) {
			failures.push(createFailure(candidate, McpServerCustomizationMigrationFailureReason.SourceChanged));
			continue;
		}
		const targetConfiguration = canonicalizeSourceConfiguration(targetServers[candidate.name]);
		if (Object.hasOwn(targetServers, candidate.name) && (!targetConfiguration || !equals(targetConfiguration, migrationConfiguration))) {
			failures.push(createFailure(candidate, McpServerCustomizationMigrationFailureReason.TargetConflict));
			continue;
		}
		candidatesToMigrate.push(candidate);
	}

	if (candidatesToMigrate.length === 0) {
		return { migratedCount: 0, failures };
	}
	if (options.isContextCurrent?.() === false) {
		return {
			migratedCount: 0,
			failures: [...failures, ...candidatesToMigrate.map(candidate => createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible))],
		};
	}

	let targetContent = target.content;
	let targetChanged = false;
	for (const candidate of candidatesToMigrate) {
		if (!Object.hasOwn(targetServers, candidate.name)) {
			targetContent = setJsonValue(targetContent, ['mcpServers', candidate.name], canonicalizeConfiguration(candidate.projectedConfiguration));
			targetChanged = true;
		}
	}
	let sourceContent = source.content;
	for (const candidate of candidatesToMigrate) {
		sourceContent = setJsonValue(sourceContent, ['servers', candidate.name], undefined);
	}

	let writtenTarget: IFileStatWithMetadata | undefined;
	if (targetChanged) {
		try {
			writtenTarget = await writeDocument(group.targetUri, targetContent, target, fileService);
		} catch (error) {
			throw new McpServerMigrationError(
				error instanceof McpServerDocumentChangedError
					? McpServerCustomizationMigrationFailureReason.TargetChanged
					: McpServerCustomizationMigrationFailureReason.WriteFailed,
				toError(error),
			);
		}
	}

	if (options.isContextCurrent?.() === false) {
		if (writtenTarget) {
			await rollbackTarget(group.targetUri, target, writtenTarget, targetContent, fileService);
		}
		return {
			migratedCount: 0,
			failures: [...failures, ...candidatesToMigrate.map(candidate => createFailure(candidate, McpServerCustomizationMigrationFailureReason.NoLongerEligible))],
		};
	}

	let writtenSource: IFileStatWithMetadata;
	try {
		writtenSource = await writeDocument(group.sourceUri, sourceContent, source, fileService);
	} catch (error) {
		const sourceChangedBeforeWrite = error instanceof McpServerDocumentChangedError;
		if (!sourceChangedBeforeWrite) {
			try {
				await restoreSourceAfterFailedWrite(group.sourceUri, source, sourceContent, fileService);
			} catch (restoreError) {
				throw rollbackErrorWith(error, restoreError, group.sourceUri);
			}
		}
		if (writtenTarget) {
			try {
				await rollbackTarget(group.targetUri, target, writtenTarget, targetContent, fileService);
			} catch (rollbackError) {
				throw rollbackErrorWith(error, rollbackError, group.sourceUri);
			}
		}
		throw new McpServerMigrationError(
			sourceChangedBeforeWrite
				? McpServerCustomizationMigrationFailureReason.SourceChanged
				: McpServerCustomizationMigrationFailureReason.WriteFailed,
			toError(error),
		);
	}

	try {
		await verifyMigration(group, candidatesToMigrate, fileService);
	} catch (verificationError) {
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
				await rollbackTarget(group.targetUri, target, writtenTarget, targetContent, fileService);
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
		throw new McpServerMigrationError(McpServerCustomizationMigrationFailureReason.TargetChanged, toError(verificationError));
	}

	return { migratedCount: candidatesToMigrate.length, failures };
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
	fileService: IFileService,
): Promise<void> {
	const source = await readSourceDocument(group.sourceUri, fileService);
	const sourceServers = getObjectProperty(source.value, 'servers');
	const target = await readTargetDocument(group.targetUri, fileService);
	const targetServers = getObjectProperty(target.value, 'mcpServers')!;
	for (const candidate of candidates) {
		if (sourceServers?.[candidate.name] !== undefined
			|| !equals(canonicalizeSourceConfiguration(targetServers[candidate.name]), canonicalizeConfiguration(candidate.projectedConfiguration))) {
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

async function readTargetDocument(resource: URI, fileService: IFileService): Promise<IJsonDocument> {
	try {
		const file = await fileService.readFile(resource);
		const content = file.value.toString();
		let value: unknown;
		try {
			value = JSON.parse(content);
		} catch {
			throw new Error(`MCP configuration ${resource.toString()} must contain strict JSON.`);
		}
		if (!isJsonObject(value) || !getObjectProperty(value, 'mcpServers')) {
			throw new Error(`MCP configuration ${resource.toString()} must contain an mcpServers object.`);
		}
		return { content, value, exists: true };
	} catch (error) {
		if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
			throw error;
		}
		const value = { mcpServers: {} };
		return {
			content: `${JSON.stringify(value, undefined, '\t')}\n`,
			value,
			exists: false,
		};
	}
}

async function writeDocument(resource: URI, content: string, document: IJsonDocument, fileService: IFileService): Promise<IFileStatWithMetadata> {
	if (document.exists) {
		return writeExistingDocument(resource, content, document.content, fileService);
	}
	return fileService.createFile(resource, VSBuffer.fromString(content), { overwrite: false });
}

async function writeExistingDocument(resource: URI, content: string, expectedContent: string, fileService: IFileService): Promise<IFileStatWithMetadata> {
	await ensureFileExists(resource, fileService);
	const current = await fileService.readFile(resource);
	if (current.value.toString() !== expectedContent) {
		throw new McpServerDocumentChangedError(resource);
	}
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
	resource: URI,
	original: IJsonDocument,
	written: IFileStatWithMetadata,
	writtenContent: string,
	fileService: IFileService,
): Promise<void> {
	const current = await fileService.readFile(resource);
	if (current.etag !== written.etag || current.mtime !== written.mtime || current.value.toString() !== writtenContent) {
		throw new McpServerMigrationError(
			McpServerCustomizationMigrationFailureReason.RollbackFailed,
			new Error(`Cannot safely restore ${resource.toString()} because it changed after migration.`),
		);
	}
	if (original.exists) {
		await writeExistingDocument(resource, original.content, writtenContent, fileService);
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

function getObjectProperty(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const property = value[key];
	return isJsonObject(property) ? property : undefined;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalizeMcpServerCustomizationMigrationConfiguration(configuration: IMcpServerConfiguration): Record<string, unknown> {
	return canonicalizeConfiguration(configuration);
}

function canonicalizeConfiguration(configuration: IMcpServerConfiguration): Record<string, unknown> {
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
		return configuration.envFile === undefined && configuration.cwd === undefined && configuration.sandboxEnabled !== true;
	}
	return configuration.oauth === undefined && configuration.transport !== 'sse';
}

function canonicalizeSourceConfiguration(rawConfiguration: unknown): Record<string, unknown> | undefined {
	if (!isJsonObject(rawConfiguration)) {
		return undefined;
	}
	const configuration = normalizeMcpServerConfiguration(rawConfiguration);
	if (!configuration || !hasOnlyRepresentableProperties(rawConfiguration, configuration.type)) {
		return undefined;
	}
	if (configuration.type === McpServerType.LOCAL) {
		if ((rawConfiguration['args'] !== undefined && (!Array.isArray(rawConfiguration['args']) || rawConfiguration['args'].some(value => typeof value !== 'string')))
			|| (rawConfiguration['env'] !== undefined && (!isJsonObject(rawConfiguration['env']) || Object.values(rawConfiguration['env']).some(value => typeof value !== 'string' && typeof value !== 'number' && value !== null)))) {
			return undefined;
		}
	} else if (rawConfiguration['headers'] !== undefined
		&& (!isJsonObject(rawConfiguration['headers']) || Object.values(rawConfiguration['headers']).some(value => typeof value !== 'string'))) {
		return undefined;
	}
	return canonicalizeConfiguration(configuration);
}

function hasOnlyRepresentableProperties(rawConfiguration: Record<string, unknown>, type: McpServerType): boolean {
	const allowed = type === McpServerType.LOCAL
		? new Set(['type', 'command', 'args', 'env', 'cwd'])
		: new Set(['type', 'transport', 'url', 'headers']);
	return Object.keys(rawConfiguration).every(key => allowed.has(key));
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
		id: candidate.id,
		name: candidate.name,
		sourceUri: candidate.sourceUri,
		targetUri: candidate.targetUri,
		reason,
		error,
	};
}
