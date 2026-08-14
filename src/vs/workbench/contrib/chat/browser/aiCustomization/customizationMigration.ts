/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { basename, dirname, getComparisonKey } from '../../../../../base/common/resources.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { getCleanPromptName, getPromptFileExtension, SKILL_FILENAME, VALID_SKILL_NAME_REGEX } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IHeaderAttribute, ParsedPromptFile, PromptFileParser, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptPath, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
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
export function getCustomizationMigrationTargetType(customization: IPromptPath): PromptsType {
	return customization.type === PromptsType.prompt ? PromptsType.skill : customization.type;
}

export function migratePromptFileToSkill(promptFile: IPromptPath, content: string, skillNameOverride?: string): IMigratedPromptFile {
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
	customizations: readonly IPromptPath[],
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
	const customizationsBySource = new ResourceMap<IPromptPath[]>();

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
	customization: IPromptPath,
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
