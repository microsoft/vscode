/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { SKILL_FILENAME, VALID_SKILL_NAME_REGEX, getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IHeaderAttribute, ParsedPromptFile, PromptFileParser, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptPath, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';

export interface IPromptMigrationInfo {
	readonly totalPromptCount: number;
	readonly workspacePromptCount: number;
	readonly userPromptCount: number;
}

export interface IMigratedPromptFile {
	readonly skillName: string;
	readonly content: string;
	readonly unsupportedHeaderKeys: readonly string[];
}

export interface IMigratedPromptFilesResult {
	readonly convertedCount: number;
	readonly failedPromptFileNames: readonly string[];
	readonly unsupportedHeaderKeys: readonly string[];
	readonly convertedSkillFileUris: readonly URI[];
}

export type PromptMigrationSkillSourceFolders = ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>;

export interface IPromptMigrationOptions {
	readonly deleteOriginalPromptFiles?: boolean;
}

const retainedPromptHeaderKeys = new Set([
	PromptHeaderAttributes.name,
	PromptHeaderAttributes.description,
	PromptHeaderAttributes.argumentHint,
]);

export function getPromptMigrationInfo(promptFiles: readonly IPromptPath[]): IPromptMigrationInfo | undefined {
	const workspacePromptCount = promptFiles.filter(file => file.storage === PromptsStorage.local).length;
	const userPromptCount = promptFiles.filter(file => file.storage === PromptsStorage.user).length;
	const totalPromptCount = workspacePromptCount + userPromptCount;
	if (totalPromptCount === 0) {
		return undefined;
	}

	return {
		totalPromptCount,
		workspacePromptCount,
		userPromptCount,
	};
}

export function pickSkillSourceFolder(promptFile: IPromptPath, skillSourceFolders: readonly ICustomizationSourceFolder[]): ICustomizationSourceFolder | undefined {
	return skillSourceFolders.find(folder => folder.source === promptFile.storage);
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

export async function migratePromptFilesToSkills(
	promptFiles: readonly IPromptPath[],
	skillSourceFoldersByStorage: PromptMigrationSkillSourceFolders,
	fileService: IFileService,
	onMigrationError?: (error: Error) => void,
	options?: IPromptMigrationOptions,
): Promise<IMigratedPromptFilesResult> {
	const reservedSkillNames = new Map<string, Set<string>>();
	const unsupportedHeaderKeys = new Set<string>();
	const failedPromptFileNames: string[] = [];
	const convertedSkillFileUris: URI[] = [];
	let convertedCount = 0;
	const deleteOriginalPromptFiles = options?.deleteOriginalPromptFiles ?? true;

	for (const promptFile of promptFiles) {
		const skillSourceFolder = skillSourceFoldersByStorage.get(promptFile.storage);
		if (!skillSourceFolder) {
			continue;
		}

		try {
			const content = (await fileService.readFile(promptFile.uri)).value.toString();
			const migratedPrompt = migratePromptFileToSkill(promptFile, content);
			const reservedNamesForFolder = reservedSkillNames.get(skillSourceFolder.uri.toString()) ?? new Set<string>();
			reservedSkillNames.set(skillSourceFolder.uri.toString(), reservedNamesForFolder);
			const skillName = await getAvailableMigratedSkillName(skillSourceFolder.uri, migratedPrompt.skillName, reservedNamesForFolder, fileService);
			const migratedSkill = skillName === migratedPrompt.skillName ? migratedPrompt : migratePromptFileToSkill(promptFile, content, skillName);
			for (const key of migratedSkill.unsupportedHeaderKeys) {
				unsupportedHeaderKeys.add(key);
			}

			const skillFileUri = createSkillFileUri(skillSourceFolder.uri, skillName);
			await fileService.createFolder(skillSourceFolder.uri);
			await fileService.createFolder(dirname(skillFileUri));
			await fileService.writeFile(skillFileUri, VSBuffer.fromString(migratedSkill.content));
			if (deleteOriginalPromptFiles) {
				await fileService.del(promptFile.uri);
			}
			convertedSkillFileUris.push(skillFileUri);
			convertedCount++;
		} catch (error) {
			failedPromptFileNames.push(basename(promptFile.uri));
			onMigrationError?.(error instanceof Error ? error : new Error(String(error)));
		}
	}

	return {
		convertedCount,
		failedPromptFileNames,
		unsupportedHeaderKeys: Array.from(unsupportedHeaderKeys).sort(),
		convertedSkillFileUris,
	};
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
