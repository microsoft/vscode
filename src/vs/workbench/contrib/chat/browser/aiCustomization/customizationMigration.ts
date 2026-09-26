/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { basename, dirname, getComparisonKey } from '../../../../../base/common/resources.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { getCleanPromptName, getPromptFileExtension, SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IHeaderAttribute, ParsedPromptFile, PromptFileParser, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { FileCustomizationMigrationFailureReason, getCustomizationMigrationTargetType, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';

export interface IMigratedPromptFile {
	readonly skillName: string;
	readonly content: string;
	readonly unsupportedHeaderKeys: readonly string[];
}

export interface IMigratedCustomization {
	readonly uri: URI;
	readonly type: PromptsType;
}

export interface IMigratedCustomizationSource {
	readonly uri: URI;
	readonly storage: PromptsStorage;
}

export interface IMigratedCustomizationsResult {
	readonly migratedCount: number;
	readonly failedCustomizationFileNames: readonly string[];
	readonly unsupportedHeaderKeys: readonly string[];
	readonly migratedCustomizations: readonly IMigratedCustomization[];
	readonly migratedSources: readonly IMigratedCustomizationSource[];
}

export interface IMigratedCustomizationsWithFailureReasonsResult extends IMigratedCustomizationsResult {
	readonly failureReasons: readonly FileCustomizationMigrationFailureReason[];
}

export type CustomizationMigrationTargetFolders = ReadonlyMap<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>>;

export interface ICustomizationMigrationOptions {
	readonly deleteOriginalFiles?: boolean;
	/**
	 * Resolves the target folder for a single customization. Used to keep workspace
	 * customizations of a multi-root workspace inside their own workspace folder.
	 * Falls back to the target folder of the customization type and storage.
	 */
	readonly resolveTargetFolder?: (customization: MigratableConfiguration, targetType: PromptsType) => ICustomizationSourceFolder | undefined;
}

/**
 * Picks the target folder that is closest to the customization that is being migrated.
 * In a multi-root workspace every workspace folder contributes its own source folders,
 * so a workspace customization must not be moved into a different workspace folder.
 */
export function resolveClosestMigrationTargetFolder(
	customizationUri: URI,
	targetFolder: ICustomizationSourceFolder,
	availableFolders: readonly ICustomizationSourceFolder[],
): ICustomizationSourceFolder {
	const targetProximity = getSharedPathSegmentCount(customizationUri, targetFolder.uri);
	const closerFolders = availableFolders.filter(folder => getSharedPathSegmentCount(customizationUri, folder.uri) > targetProximity);
	if (closerFolders.length === 0) {
		return targetFolder;
	}

	// Prefer a folder that mirrors the selected destination (e.g. `.github/skills`)
	// so that the destination the user picked is preserved across workspace folders.
	return closerFolders.find(folder => hasSameFolderLayout(folder.uri, targetFolder.uri)) ?? closerFolders[0];
}

function hasSameFolderLayout(folder: URI, other: URI): boolean {
	return basename(folder) === basename(other) && basename(dirname(folder)) === basename(dirname(other));
}

function getSharedPathSegmentCount(one: URI, other: URI): number {
	if (one.scheme !== other.scheme || one.authority !== other.authority) {
		return 0;
	}
	const oneSegments = one.path.split('/');
	const otherSegments = other.path.split('/');
	let count = 0;
	while (count < oneSegments.length && count < otherSegments.length && oneSegments[count] === otherSegments[count]) {
		count++;
	}
	return count;
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
	onMigrationError?: (error: Error, reasons: readonly FileCustomizationMigrationFailureReason[]) => void,
	options?: ICustomizationMigrationOptions,
): Promise<IMigratedCustomizationsResult> {
	const reservedSkillNames = new Map<string, Set<string>>();
	const reservedFileNames = new Map<string, Set<string>>();
	const unsupportedHeaderKeys = new Set<string>();
	const failedCustomizationFileNames: string[] = [];
	const migratedCustomizations: IMigratedCustomization[] = [];
	const migratedSources: IMigratedCustomizationSource[] = [];
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
		let failureReason = FileCustomizationMigrationFailureReason.SourceReadFailed;

		try {
			const content = (await fileService.readFile(sourceCustomization.uri)).value.toString();
			for (const customization of sourceCustomizations) {
				failureReason = FileCustomizationMigrationFailureReason.TargetResolutionFailed;
				const targetType = getCustomizationMigrationTargetType(customization);
				const targetFolder = options?.resolveTargetFolder?.(customization, targetType) ?? targetFolders.get(targetType)?.get(customization.storage);
				if (!targetFolder) {
					throw new Error(`No ${targetType} target folder is configured for ${customization.storage} customizations.`);
				}

				let targetUri: URI;
				let migratedContent = content;
				if (customization.type === PromptsType.prompt) {
					failureReason = FileCustomizationMigrationFailureReason.ConversionFailed;
					const migratedPrompt = migratePromptFileToSkill(customization, content);
					failureReason = FileCustomizationMigrationFailureReason.TargetResolutionFailed;
					const reservedNamesForFolder = getOrCreateReservedNames(targetFolder.uri, reservedSkillNames);
					const skillName = await getAvailableMigratedSkillName(targetFolder.uri, migratedPrompt.skillName, reservedNamesForFolder, fileService);
					const migratedSkill = skillName === migratedPrompt.skillName ? migratedPrompt : migratePromptFileToSkill(customization, content, skillName);
					for (const key of migratedSkill.unsupportedHeaderKeys) {
						sourceUnsupportedHeaderKeys.add(key);
					}
					targetUri = createSkillFileUri(targetFolder.uri, skillName);
					migratedContent = migratedSkill.content;
				} else if (customization.type === PromptsType.skill) {
					const reservedNamesForFolder = getOrCreateReservedNames(targetFolder.uri, reservedSkillNames);
					const skillName = await getAvailableMigratedSkillName(targetFolder.uri, basename(dirname(customization.uri)), reservedNamesForFolder, fileService);
					targetUri = createSkillFileUri(targetFolder.uri, skillName);
				} else {
					const reservedNamesForFolder = getOrCreateReservedNames(targetFolder.uri, reservedFileNames);
					targetUri = await getAvailableMigratedFileUri(targetFolder.uri, customization, reservedNamesForFolder, fileService);
				}

				failureReason = FileCustomizationMigrationFailureReason.TargetWriteFailed;
				await fileService.createFolder(targetFolder.uri);
				if (customization.type === PromptsType.skill) {
					const sourceFolder = dirname(customization.uri);
					const targetSkillFolder = dirname(targetUri);
					const stagingFolder = URI.joinPath(targetFolder.uri, `.migration-${generateUuid()}`);
					writtenTargetUris.push(stagingFolder);
					await fileService.copy(sourceFolder, stagingFolder, false);
					await fileService.move(stagingFolder, targetSkillFolder, false);
					writtenTargetUris.push(targetSkillFolder);
				} else {
					await fileService.createFolder(dirname(targetUri));
					await fileService.createFile(targetUri, VSBuffer.fromString(migratedContent), { overwrite: false });
					writtenTargetUris.push(targetUri);
				}
				migratedSourceCustomizations.push({ uri: targetUri, type: targetType });
			}

			if (deleteOriginalFiles) {
				failureReason = FileCustomizationMigrationFailureReason.SourceDeleteFailed;
				const sourceToDelete = sourceCustomization.type === PromptsType.skill ? dirname(sourceCustomization.uri) : sourceCustomization.uri;
				await fileService.del(sourceToDelete, { recursive: sourceCustomization.type === PromptsType.skill });
			}
			for (const key of sourceUnsupportedHeaderKeys) {
				unsupportedHeaderKeys.add(key);
			}
			migratedCustomizations.push(...migratedSourceCustomizations);
			migratedSources.push(...sourceCustomizations.map(customization => ({
				uri: customization.uri,
				storage: customization.storage,
			})));
			migratedCount += migratedSourceCustomizations.length;
		} catch (error) {
			const migrationError = error instanceof Error ? error : new Error(String(error));
			const rollbackErrors = await rollbackMigrationTargets(writtenTargetUris, fileService);
			failedCustomizationFileNames.push(basename(sourceCustomization.uri));
			const failureReasons = rollbackErrors.length > 0
				? [failureReason, FileCustomizationMigrationFailureReason.RollbackFailed]
				: [failureReason];
			onMigrationError?.(
				rollbackErrors.length > 0
					? new AggregateError([migrationError, ...rollbackErrors], `Failed to migrate and roll back ${basename(sourceCustomization.uri)}`)
					: migrationError,
				failureReasons,
			);
		}
	}

	return {
		migratedCount,
		failedCustomizationFileNames,
		unsupportedHeaderKeys: Array.from(unsupportedHeaderKeys).sort(),
		migratedCustomizations,
		migratedSources,
	};
}

async function rollbackMigrationTargets(targetUris: readonly URI[], fileService: IFileService): Promise<Error[]> {
	const errors: Error[] = [];
	for (let index = targetUris.length - 1; index >= 0; index--) {
		const targetUri = targetUris[index];
		try {
			if (await fileService.exists(targetUri)) {
				await fileService.del(targetUri, { recursive: true });
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
	while (reservedNames.has(candidate) || await fileService.exists(URI.joinPath(skillSourceFolder, candidate))) {
		const suffix = `-${counter++}`;
		const trimmedBaseName = trimSkillName(baseSkillName, suffix.length);
		candidate = `${trimmedBaseName}${suffix}`;
	}

	reservedNames.add(candidate);
	return candidate;
}
