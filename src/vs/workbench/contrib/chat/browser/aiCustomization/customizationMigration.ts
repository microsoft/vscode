/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { basename, dirname, getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { getCleanPromptName, getPromptFileExtension, SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IHeaderAttribute, ParsedPromptFile, PromptFileParser, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { CustomizationMigrationType, getCustomizationMigrationTargetType, IMcpServerCustomizationMigrationCandidate, IMcpServerMigrationFailure, IMcpServerMigrationResult, McpServerMigrationFailureReason, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { parse, ParseError } from '../../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../../base/common/jsonFormatter.js';
import { equals } from '../../../../../base/common/objects.js';
import { normalizeMcpServerConfiguration } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ConfigurationResolverExpression } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerSourceKind, IAgentHostMcpServerSupportSnapshot } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';

export interface IMigratedPromptFile {
	readonly skillName: string;
	readonly content: string;
	readonly unsupportedHeaderKeys: readonly string[];
}

export interface IMigratedCustomization {
	readonly uri: URI;
	readonly type: PromptsType;
}

export interface IMigratedCustomizationsResult {
	readonly migratedCount: number;
	readonly failedCustomizationFileNames: readonly string[];
	readonly unsupportedHeaderKeys: readonly string[];
	readonly migratedCustomizations: readonly IMigratedCustomization[];
}

export type CustomizationMigrationTargetFolders = ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>>;

export interface ICustomizationMigrationOptions {
	readonly deleteOriginalFiles?: boolean;
}

const retainedPromptHeaderKeys = new Set([
	PromptHeaderAttributes.name,
	PromptHeaderAttributes.description,
	PromptHeaderAttributes.argumentHint,
]);

/**
 * Prompt files become skills because agent-host harnesses have no prompt-file concept;
 * every other customization keeps its type and only changes location.
 */
export function migratePromptFileToSkill(promptFile: MigratableConfiguration, content: string, skillNameOverride?: string): IMigratedPromptFile {
	const parser = new PromptFileParser();
	const parsed = parser.parse(promptFile.uri, content);
	const friendlyName = promptFile.name?.trim() || parsed.header?.name?.trim() || getCleanPromptName(promptFile.uri);
	const skillName = skillNameOverride ?? sanitizeSkillName(friendlyName);
	const description = promptFile.description?.trim() || parsed.header?.description?.trim() || friendlyName;
	const argumentHint = parsed.header?.argumentHint?.trim();
	const argumentHintAttribute = parsed.header?.getAttribute(PromptHeaderAttributes.argumentHint);
	const body = getPromptBody(parsed, content);
	const unsupportedHeaderKeys = parsed.header?.attributes
		.filter(attribute => !retainedPromptHeaderKeys.has(attribute.key))
		.map(attribute => attribute.key) ?? [];

	const headerLines = [
		'---',
		`name: ${skillName}`,
		`description: ${description}`,
		'disable-model-invocation: true',
	];

	if (argumentHint) {
		headerLines.push(`argument-hint: ${formatMigratedHeaderValue(argumentHint, argumentHintAttribute)}`);
	}

	headerLines.push('---', '');

	return {
		skillName,
		content: `${headerLines.join('\n')}${body}`,
		unsupportedHeaderKeys,
	};
}

function formatMigratedHeaderValue(value: string, sourceAttribute: IHeaderAttribute | undefined): string {
	if (sourceAttribute?.value.type === 'scalar') {
		switch (sourceAttribute.value.format) {
			case 'single':
				return `'${value.replace(/'/g, `''`)}'`;
			case 'double':
				return JSON.stringify(value);
			case 'none':
				return value;
		}
	}

	return value;
}

export async function migrateCustomizations(
	customizations: readonly MigratableConfiguration[],
	targetFolders: CustomizationMigrationTargetFolders,
	fileService: IFileService,
	onMigrationError?: (error: Error) => void,
	options?: ICustomizationMigrationOptions,
): Promise<IMigratedCustomizationsResult> {
	const reservedSkillNames = new Map<string, Set<string>>();
	const reservedFileNames = new Map<string, Set<string>>();
	const unsupportedHeaderKeys = new Set<string>();
	const failedCustomizationFileNames: string[] = [];
	const migratedCustomizations: IMigratedCustomization[] = [];
	let migratedCount = 0;
	const deleteOriginalFiles = options?.deleteOriginalFiles ?? true;
	const customizationsBySource = new ResourceMap<MigratableConfiguration[]>();

	for (const customization of customizations) {
		const sourceCustomizations = customizationsBySource.get(customization.uri) ?? [];
		sourceCustomizations.push(customization);
		customizationsBySource.set(customization.uri, sourceCustomizations);
	}

	for (const sourceCustomizations of customizationsBySource.values()) {
		const sourceCustomization = sourceCustomizations[0];
		const writtenTargetUris: URI[] = [];
		const migratedSourceCustomizations: IMigratedCustomization[] = [];
		const sourceUnsupportedHeaderKeys = new Set<string>();

		try {
			const content = (await fileService.readFile(sourceCustomization.uri)).value.toString();
			for (const customization of sourceCustomizations) {
				const targetType = getCustomizationMigrationTargetType(customization);
				const targetFolder = targetFolders.get(targetType)?.get(customization.storage);
				if (!targetFolder) {
					throw new Error(`No ${targetType} target folder is configured for ${customization.storage} customizations.`);
				}

				let targetUri: URI;
				let migratedContent = content;
				if (customization.type === PromptsType.prompt) {
					const migratedPrompt = migratePromptFileToSkill(customization, content);
					const reservedNamesForFolder = getOrCreateReservedNames(targetFolder.uri, reservedSkillNames);
					const skillName = await getAvailableMigratedSkillName(targetFolder.uri, migratedPrompt.skillName, reservedNamesForFolder, fileService);
					const migratedSkill = skillName === migratedPrompt.skillName ? migratedPrompt : migratePromptFileToSkill(customization, content, skillName);
					for (const key of migratedSkill.unsupportedHeaderKeys) {
						sourceUnsupportedHeaderKeys.add(key);
					}
					targetUri = createSkillFileUri(targetFolder.uri, skillName);
					migratedContent = migratedSkill.content;
				} else {
					const reservedNamesForFolder = getOrCreateReservedNames(targetFolder.uri, reservedFileNames);
					targetUri = await getAvailableMigratedFileUri(targetFolder.uri, customization, reservedNamesForFolder, fileService);
				}

				await fileService.createFolder(targetFolder.uri);
				await fileService.createFolder(dirname(targetUri));
				await fileService.createFile(targetUri, VSBuffer.fromString(migratedContent), { overwrite: false });
				writtenTargetUris.push(targetUri);
				migratedSourceCustomizations.push({ uri: targetUri, type: targetType });
			}

			if (deleteOriginalFiles) {
				await fileService.del(sourceCustomization.uri);
			}
			for (const key of sourceUnsupportedHeaderKeys) {
				unsupportedHeaderKeys.add(key);
			}
			migratedCustomizations.push(...migratedSourceCustomizations);
			migratedCount += migratedSourceCustomizations.length;
		} catch (error) {
			const migrationError = error instanceof Error ? error : new Error(String(error));
			const rollbackErrors = await rollbackMigrationTargets(writtenTargetUris, fileService);
			failedCustomizationFileNames.push(basename(sourceCustomization.uri));
			onMigrationError?.(rollbackErrors.length > 0
				? new AggregateError([migrationError, ...rollbackErrors], `Failed to migrate and roll back ${basename(sourceCustomization.uri)}`)
				: migrationError);
		}
	}

	return {
		migratedCount,
		failedCustomizationFileNames,
		unsupportedHeaderKeys: Array.from(unsupportedHeaderKeys).sort(),
		migratedCustomizations,
	};
}

async function rollbackMigrationTargets(targetUris: readonly URI[], fileService: IFileService): Promise<Error[]> {
	const errors: Error[] = [];
	for (let index = targetUris.length - 1; index >= 0; index--) {
		const targetUri = targetUris[index];
		try {
			if (await fileService.exists(targetUri)) {
				await fileService.del(targetUri);
			}
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
	}
	return errors;
}

function getOrCreateReservedNames(folder: URI, reservedNames: Map<string, Set<string>>): Set<string> {
	const key = getComparisonKey(folder);
	const names = reservedNames.get(key) ?? new Set<string>();
	reservedNames.set(key, names);
	return names;
}

async function getAvailableMigratedFileUri(
	targetFolder: URI,
	customization: MigratableConfiguration,
	reservedNames: Set<string>,
	fileService: IFileService,
): Promise<URI> {
	const extension = getPromptFileExtension(customization.type);
	const baseName = getCleanPromptName(customization.uri);
	let fileName = `${baseName}${extension}`;
	let counter = 2;
	while (reservedNames.has(fileName) || await fileService.exists(URI.joinPath(targetFolder, fileName))) {
		fileName = `${baseName}-${counter++}${extension}`;
	}
	reservedNames.add(fileName);
	return URI.joinPath(targetFolder, fileName);
}

function getPromptBody(parsed: ParsedPromptFile, content: string): string {
	const linesWithEol = splitLinesIncludeSeparators(content);
	if (!parsed.body) {
		return '';
	}

	return linesWithEol.slice(parsed.body.range.startLineNumber - 1).join('').replace(/^\r?\n/, '');
}

export function createSkillFileUri(skillSourceFolder: URI, skillName: string): URI {
	return URI.joinPath(skillSourceFolder, skillName, SKILL_FILENAME);
}

function sanitizeSkillName(name: string): string {
	const strippedName = name
		.replace(/<[^>]+>/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-+/g, '-');

	const trimmedName = trimSkillName(strippedName, 0);
	if (trimmedName && VALID_SKILL_NAME_REGEX.test(trimmedName)) {
		return trimmedName;
	}

	return 'migrated-skill';
}

export function trimSkillName(skillName: string, suffixLength: number): string {
	const maxBaseLength = Math.max(1, 64 - suffixLength);
	return skillName.slice(0, maxBaseLength).replace(/-+$/g, '');
}

async function getAvailableMigratedSkillName(
	skillSourceFolder: URI,
	baseSkillName: string,
	reservedNames: Set<string>,
	fileService: IFileService,
): Promise<string> {
	let candidate = baseSkillName;
	let counter = 2;
	while (reservedNames.has(candidate) || await fileService.exists(createSkillFileUri(skillSourceFolder, candidate))) {
		const suffix = `-${counter++}`;
		const trimmedBaseName = trimSkillName(baseSkillName, suffix.length);
		candidate = `${trimmedBaseName}${suffix}`;
	}

	reservedNames.add(candidate);
	return candidate;
}

export interface IMcpServerMigrationPlan {
	readonly candidates: readonly IMcpServerCustomizationMigrationCandidate[];
	readonly exclusions: readonly IMcpServerMigrationFailure[];
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
	readonly mtime?: number;
	readonly etag?: string;
}

/**
 * Owns MCP migration eligibility and guarded source-to-target execution.
 */
export class McpServerMigration {
	constructor(private readonly fileService: IFileService) { }

	async createPlan(snapshot: IAgentHostMcpServerSupportSnapshot): Promise<IMcpServerMigrationPlan> {
		const candidates: IMcpServerCustomizationMigrationCandidate[] = [];
		const exclusions: IMcpServerMigrationFailure[] = [];
		const sourceServers = new ResourceMap<Promise<Record<string, unknown> | undefined>>();

		for (const server of snapshot.servers) {
			const sourceUri = server.source.collectionUri;
			if (server.source.kind !== AgentHostMcpServerSourceKind.VscodeWorkspaceFolder || !sourceUri) {
				continue;
			}
			const targetUri = URI.joinPath(dirname(dirname(sourceUri)), '.mcp.json');
			const excluded = (reason: McpServerMigrationFailureReason, error?: Error): void => {
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
				|| server.compatibility.kind !== 'supported') {
				excluded(McpServerMigrationFailureReason.NoLongerEligible);
				continue;
			}

			let sourceServersPromise = sourceServers.get(sourceUri);
			if (!sourceServersPromise) {
				sourceServersPromise = this.readMcpServers(sourceUri);
				sourceServers.set(sourceUri, sourceServersPromise);
			}
			let rawConfiguration: unknown;
			try {
				rawConfiguration = (await sourceServersPromise)?.[server.name];
			} catch (error) {
				excluded(McpServerMigrationFailureReason.SourceUnavailable, toError(error));
				continue;
			}
			const configuration = normalizeMcpServerConfiguration(rawConfiguration);
			const sourceConfiguration = canonicalizeMcpServerMigrationSourceConfiguration(rawConfiguration);
			if (!configuration || !sourceConfiguration) {
				excluded(McpServerMigrationFailureReason.InvalidSource);
				continue;
			}
			if (!isMcpServerMigrationConfigurationRepresentable(configuration)
				|| !Iterable.isEmpty(ConfigurationResolverExpression.parse(configuration).unresolved())
				|| !equals(sourceConfiguration, canonicalizeMcpServerMigrationConfiguration(configuration))) {
				excluded(McpServerMigrationFailureReason.UnrepresentableConfiguration);
				continue;
			}
			candidates.push({
				type: CustomizationMigrationType.McpServers,
				id: server.id,
				name: server.name,
				sourceUri,
				targetUri,
				configuration,
			});
		}

		return { candidates, exclusions };
	}

	migrate(candidates: readonly IMcpServerCustomizationMigrationCandidate[]): Promise<IMcpServerMigrationResult> {
		return executeMcpServerMigration(candidates, this.fileService);
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
		if (errors.length > 0 || !isJsonObject(value)) {
			return undefined;
		}
		return getObjectProperty(value, 'servers');
	}
}

async function executeMcpServerMigration(
	candidates: readonly IMcpServerCustomizationMigrationCandidate[],
	fileService: IFileService,
): Promise<IMcpServerMigrationResult> {
	// Batch by source so multiple selected servers share one guarded source/target transaction.
	const groups = new ResourceMap<IMcpServerMigrationGroup>();
	const failures: IMcpServerMigrationFailure[] = [];
	for (const candidate of candidates) {
		const group = groups.get(candidate.sourceUri) ?? {
			sourceUri: candidate.sourceUri,
			targetUri: candidate.targetUri,
			candidates: [],
		};
		if (!isEqual(group.targetUri, candidate.targetUri)) {
			failures.push(createMcpServerMigrationFailure(candidate, McpServerMigrationFailureReason.InconsistentTarget));
			continue;
		}
		group.candidates.push(candidate);
		groups.set(candidate.sourceUri, group);
	}

	let migratedCount = 0;
	for (const group of groups.values()) {
		try {
			const result = await migrateMcpServerGroup(group, fileService);
			migratedCount += result.migratedCount;
			failures.push(...result.failures);
		} catch (error) {
			const migrationError = toMcpServerMigrationError(error);
			failures.push(...group.candidates.map(candidate => createMcpServerMigrationFailure(candidate, migrationError.reason, migrationError)));
		}
	}

	return { migratedCount, failures };
}

async function migrateMcpServerGroup(
	group: IMcpServerMigrationGroup,
	fileService: IFileService,
): Promise<IMcpServerMigrationResult> {
	let source: IJsonDocument;
	try {
		source = await readSourceJsonDocument(group.sourceUri, fileService);
	} catch (error) {
		throw new McpServerMigrationError(McpServerMigrationFailureReason.SourceUnavailable, toError(error));
	}
	const sourceServers = getObjectProperty(source.value, 'servers');
	if (!sourceServers) {
		throw new McpServerMigrationError(
			McpServerMigrationFailureReason.InvalidSource,
			new Error(`MCP configuration ${group.sourceUri.toString()} does not contain a servers object.`),
		);
	}

	let target: IJsonDocument;
	try {
		target = await readTargetJsonDocument(group.targetUri, fileService);
	} catch (error) {
		throw new McpServerMigrationError(McpServerMigrationFailureReason.InvalidTarget, toError(error));
	}
	const targetServers = getObjectProperty(target.value, 'mcpServers')!;
	const candidatesToMigrate: IMcpServerCustomizationMigrationCandidate[] = [];
	const failures: IMcpServerMigrationFailure[] = [];

	for (const candidate of group.candidates) {
		if (!isMcpServerMigrationConfigurationRepresentable(candidate.configuration)) {
			failures.push(createMcpServerMigrationFailure(candidate, McpServerMigrationFailureReason.UnrepresentableConfiguration));
			continue;
		}
		if (!Object.hasOwn(sourceServers, candidate.name)) {
			failures.push(createMcpServerMigrationFailure(candidate, McpServerMigrationFailureReason.NoLongerEligible));
			continue;
		}

		const sourceConfiguration = canonicalizeMcpServerMigrationSourceConfiguration(sourceServers[candidate.name]);
		if (!sourceConfiguration) {
			failures.push(createMcpServerMigrationFailure(candidate, McpServerMigrationFailureReason.InvalidSource));
			continue;
		}
		const migrationConfiguration = canonicalizeMcpServerMigrationConfiguration(candidate.configuration);
		if (!equals(sourceConfiguration, migrationConfiguration)) {
			failures.push(createMcpServerMigrationFailure(candidate, McpServerMigrationFailureReason.SourceChanged));
			continue;
		}

		const targetConfiguration = canonicalizeMcpServerMigrationSourceConfiguration(targetServers[candidate.name]);
		if (Object.hasOwn(targetServers, candidate.name) && (!targetConfiguration || !equals(targetConfiguration, migrationConfiguration))) {
			failures.push(createMcpServerMigrationFailure(candidate, McpServerMigrationFailureReason.TargetConflict));
			continue;
		}

		candidatesToMigrate.push(candidate);
	}

	if (candidatesToMigrate.length === 0) {
		return { migratedCount: 0, failures };
	}

	let targetContent = target.content;
	let targetChanged = false;
	for (const candidate of candidatesToMigrate) {
		if (Object.hasOwn(targetServers, candidate.name)) {
			continue;
		}
		targetContent = setJsonValue(targetContent, ['mcpServers', candidate.name], canonicalizeMcpServerMigrationConfiguration(candidate.configuration));
		targetChanged = true;
	}

	let sourceContent = source.content;
	for (const candidate of candidatesToMigrate) {
		sourceContent = setJsonValue(sourceContent, ['servers', candidate.name], undefined);
	}

	// The destination must exist before source entries are removed, so a failed target write cannot lose a server.
	let writtenTarget: IFileStatWithMetadata | undefined;
	if (targetChanged) {
		try {
			writtenTarget = await writeJsonDocument(group.targetUri, targetContent, target, fileService);
		} catch (error) {
			throw new McpServerMigrationError(McpServerMigrationFailureReason.WriteFailed, toError(error));
		}
	}

	let writtenSource: IFileStatWithMetadata;
	try {
		writtenSource = await writeJsonDocument(group.sourceUri, sourceContent, source, fileService);
	} catch (error) {
		if (writtenTarget) {
			try {
				if (target.exists) {
					await ensureFileExists(group.targetUri, fileService);
					await fileService.writeFile(group.targetUri, VSBuffer.fromString(target.content), {
						etag: writtenTarget.etag,
						mtime: writtenTarget.mtime,
					});
				} else {
					throw new Error(`Cannot safely remove newly created ${group.targetUri.toString()} after the source update failed.`);
				}
			} catch (rollbackError) {
				throw new McpServerMigrationError(
					McpServerMigrationFailureReason.RollbackFailed,
					new AggregateError([toError(error), toError(rollbackError)], `Failed to migrate and roll back MCP servers from ${group.sourceUri.toString()}.`),
				);
			}
		}
		throw new McpServerMigrationError(McpServerMigrationFailureReason.WriteFailed, toError(error));
	}

	try {
		await verifyMigratedMcpServers(group.targetUri, candidatesToMigrate, fileService);
	} catch (verificationError) {
		// Two files cannot be updated atomically; restore the guarded source if another writer changed the target.
		try {
			await ensureFileExists(group.sourceUri, fileService);
			await fileService.writeFile(group.sourceUri, VSBuffer.fromString(source.content), {
				etag: writtenSource.etag,
				mtime: writtenSource.mtime,
			});
		} catch (sourceRollbackError) {
			throw new McpServerMigrationError(
				McpServerMigrationFailureReason.RollbackFailed,
				new AggregateError([toError(verificationError), toError(sourceRollbackError)], `Failed to verify and restore MCP servers from ${group.sourceUri.toString()}.`),
			);
		}
		throw new McpServerMigrationError(McpServerMigrationFailureReason.TargetChanged, toError(verificationError));
	}

	return { migratedCount: candidatesToMigrate.length, failures };
}

async function verifyMigratedMcpServers(
	targetUri: URI,
	candidates: readonly IMcpServerCustomizationMigrationCandidate[],
	fileService: IFileService,
): Promise<void> {
	const target = await readTargetJsonDocument(targetUri, fileService);
	const targetServers = getObjectProperty(target.value, 'mcpServers')!;
	for (const candidate of candidates) {
		if (!equals(
			canonicalizeMcpServerMigrationSourceConfiguration(targetServers[candidate.name]),
			canonicalizeMcpServerMigrationConfiguration(candidate.configuration),
		)) {
			throw new Error(`MCP server '${candidate.name}' changed in ${targetUri.toString()} during migration.`);
		}
	}
}

async function readSourceJsonDocument(resource: URI, fileService: IFileService): Promise<IJsonDocument> {
	const file = await fileService.readFile(resource);
	const content = file.value.toString();
	const errors: ParseError[] = [];
	const value = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
	if (errors.length > 0 || !isJsonObject(value)) {
		throw new Error(`MCP configuration ${resource.toString()} contains invalid JSON.`);
	}
	return { content, value, exists: true, mtime: file.mtime, etag: file.etag };
}

async function readTargetJsonDocument(resource: URI, fileService: IFileService): Promise<IJsonDocument> {
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
		return { content, value, exists: true, mtime: file.mtime, etag: file.etag };
	} catch (error) {
		if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
			throw error;
		}
		const value = { mcpServers: {} };
		return {
			content: `${JSON.stringify(value, null, '\t')}\n`,
			value,
			exists: false,
		};
	}
}

async function writeJsonDocument(resource: URI, content: string, document: IJsonDocument, fileService: IFileService): Promise<IFileStatWithMetadata> {
	if (document.exists) {
		await ensureFileExists(resource, fileService);
		return fileService.writeFile(resource, VSBuffer.fromString(content), {
			etag: document.etag,
			mtime: document.mtime,
		});
	}
	return fileService.createFile(resource, VSBuffer.fromString(content), { overwrite: false });
}

async function ensureFileExists(resource: URI, fileService: IFileService): Promise<void> {
	if (!await fileService.exists(resource)) {
		throw new FileOperationError(`File was deleted during MCP migration: ${resource.toString()}`, FileOperationResult.FILE_NOT_FOUND);
	}
}

function getObjectProperty(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const property = value[key];
	return isJsonObject(property) ? property : undefined;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalizeMcpServerMigrationConfiguration(configuration: IMcpServerConfiguration): Record<string, unknown> {
	if (configuration.type === McpServerType.LOCAL) {
		return {
			type: configuration.type,
			command: configuration.command,
			...(configuration.args?.length ? { args: [...configuration.args] } : {}),
			...(configuration.env && Object.keys(configuration.env).length > 0 ? { env: { ...configuration.env } } : {}),
			...(configuration.envFile !== undefined ? { envFile: configuration.envFile } : {}),
			...(configuration.cwd !== undefined ? { cwd: configuration.cwd } : {}),
			...(configuration.sandboxEnabled === true ? { sandboxEnabled: true } : {}),
			...(configuration.dev !== undefined ? { dev: configuration.dev } : {}),
		};
	}

	return {
		type: configuration.type,
		...(configuration.transport !== undefined ? { transport: configuration.transport } : {}),
		url: configuration.url,
		...(configuration.headers && Object.keys(configuration.headers).length > 0 ? { headers: { ...configuration.headers } } : {}),
		...(configuration.oauth?.clientId !== undefined ? { oauth: { clientId: configuration.oauth.clientId } } : {}),
		...(configuration.dev !== undefined ? { dev: configuration.dev } : {}),
	};
}

function isMcpServerMigrationConfigurationRepresentable(configuration: IMcpServerConfiguration): boolean {
	if (configuration.version !== undefined || configuration.gallery !== undefined || configuration.dev !== undefined) {
		return false;
	}
	if (configuration.type === McpServerType.LOCAL) {
		return configuration.envFile === undefined
			&& configuration.cwd === undefined
			&& configuration.sandboxEnabled !== true;
	}
	return configuration.transport === undefined && configuration.oauth === undefined;
}

/**
 * Canonicalizes the original JSON while retaining fields that root `.mcp.json` discovery cannot preserve.
 */
export function canonicalizeMcpServerMigrationSourceConfiguration(rawConfiguration: unknown): Record<string, unknown> | undefined {
	const configuration = normalizeMcpServerConfiguration(rawConfiguration);
	if (!configuration || !isJsonObject(rawConfiguration)) {
		return undefined;
	}
	if (configuration.type === McpServerType.LOCAL) {
		const sandboxEnabled = typeof rawConfiguration['sandboxEnabled'] === 'boolean'
			? rawConfiguration['sandboxEnabled']
			: undefined;
		return withMcpSourceMetadata(canonicalizeMcpServerMigrationConfiguration({
			...configuration,
			...(sandboxEnabled !== undefined ? { sandboxEnabled } : {}),
		}), rawConfiguration);
	}
	const rawOAuth = rawConfiguration['oauth'];
	return withMcpSourceMetadata({
		...canonicalizeMcpServerMigrationConfiguration(configuration),
		...(isJsonObject(rawOAuth) ? { oauth: rawOAuth } : {}),
	}, rawConfiguration);
}

function withMcpSourceMetadata(configuration: Record<string, unknown>, rawConfiguration: Record<string, unknown>): Record<string, unknown> {
	const version = typeof rawConfiguration['version'] === 'string' ? rawConfiguration['version'] : undefined;
	const gallery = typeof rawConfiguration['gallery'] === 'boolean' || typeof rawConfiguration['gallery'] === 'string'
		? rawConfiguration['gallery']
		: undefined;
	return {
		...configuration,
		...(version !== undefined ? { version } : {}),
		...(gallery !== undefined ? { gallery } : {}),
	};
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

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

class McpServerMigrationError extends Error {
	constructor(
		readonly reason: McpServerMigrationFailureReason,
		readonly underlyingError: Error,
	) {
		super(underlyingError.message);
	}
}

function toMcpServerMigrationError(error: unknown): McpServerMigrationError {
	return error instanceof McpServerMigrationError
		? error
		: new McpServerMigrationError(McpServerMigrationFailureReason.WriteFailed, toError(error));
}

function createMcpServerMigrationFailure(
	candidate: IMcpServerCustomizationMigrationCandidate,
	reason: McpServerMigrationFailureReason,
	error?: Error,
): IMcpServerMigrationFailure {
	return {
		id: candidate.id,
		name: candidate.name,
		sourceUri: candidate.sourceUri,
		targetUri: candidate.targetUri,
		reason,
		error,
	};
}
