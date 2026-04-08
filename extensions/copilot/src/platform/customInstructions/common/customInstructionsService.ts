/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter } from '../../../util/vs/base/common/event';
import { match } from '../../../util/vs/base/common/glob';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { IObservable, observableFromEvent } from '../../../util/vs/base/common/observableInternal';
import { dirname, isAbsolute } from '../../../util/vs/base/common/path';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { isObject } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { FileType, Uri } from '../../../vscodeTypes';
import { IRunCommandExecutionService } from '../../commands/common/runCommandExecutionService';
import { CodeGenerationImportInstruction, CodeGenerationTextInstruction, Config, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { INativeEnvService } from '../../env/common/envService';
import { IExtensionsService } from '../../extensions/common/extensionsService';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { ILogService } from '../../log/common/logService';
import { IPromptPathRepresentationService } from '../../prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { COPILOT_INSTRUCTIONS_PATH, INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_LOCATION_KEY, PERSONAL_SKILL_FOLDERS, PromptsType, SKILLS_LOCATION_KEY, USE_AGENT_SKILLS_SETTING, WORKSPACE_SKILL_FOLDERS } from './promptTypes';

declare const TextDecoder: {
	decode(input: Uint8Array): string;
	new(): TextDecoder;
};

export interface ICustomInstructions {
	readonly kind: CustomInstructionsKind;
	readonly content: IInstruction[];
	readonly reference: vscode.Uri;
}

export enum CustomInstructionsKind {
	File,
	Setting,
}

export interface IInstruction {
	readonly languageId?: string;
	readonly instruction: string;
}

export const ICustomInstructionsService = createServiceIdentifier<ICustomInstructionsService>('ICustomInstructionsService');

export interface IExtensionPromptFile {
	uri: URI;
	type: PromptsType;
	extensionId?: string;
}

export const enum SkillStorage {
	Extension = 'extension',
	Internal = 'internal',
	Personal = 'personal',
	Workspace = 'workspace',
}

export interface ISkillInfo {
	readonly skillName: string;
	readonly skillFolderUri: URI;
	readonly storage: SkillStorage;
}

export interface ICustomInstructionsService {
	readonly _serviceBrand: undefined;
	fetchInstructionsFromSetting(configKey: Config<CodeGenerationInstruction[]>): Promise<ICustomInstructions[]>;
	fetchInstructionsFromFile(fileUri: Uri): Promise<ICustomInstructions | undefined>;

	getAgentInstructions(): Promise<URI[]>;

	parseInstructionIndexFile(promptFileIndexText: string): IInstructionIndexFile;

	isExternalInstructionsFile(uri: URI): Promise<boolean>;
	isExternalInstructionsFolder(uri: URI): boolean;
	isSkillFile(uri: URI): boolean;
	isSkillMdFile(uri: URI): boolean;
	getSkillInfo(uri: URI): ISkillInfo | undefined;

	/**
	 * Refreshes the cached extension prompt files by querying VS Code's extension prompt file provider.
	 * The cache is normally initialized lazily on first use in {@link isExternalInstructionsFile}, so
	 * callers only need to invoke this explicitly when they require the latest extension state before
	 * that first lookup or want to force a manual refresh of the cached prompt file list.
	 */
	refreshExtensionPromptFiles(): Promise<void>;
	/** Gets skill info for extension-contributed skill files */
	getExtensionSkillInfo(uri: URI): (ISkillInfo & { extensionId?: string }) | undefined;
}

export interface IInstructionIndexFile {
	readonly instructions: ResourceSet;
	readonly skills: ResourceSet;
	readonly skillFolders: ResourceSet;
	readonly agents: Set<string>;
}

export type CodeGenerationInstruction = { languagee?: string; text: string } | { languagee?: string; file: string };

function isCodeGenerationImportInstruction(instruction: any): instruction is CodeGenerationImportInstruction {
	if (typeof instruction === 'object' && instruction !== null) {
		return typeof instruction.file === 'string' && (instruction.language === undefined || typeof instruction.language === 'string');
	}
	return false;
}

function isCodeGenerationTextInstruction(instruction: any): instruction is CodeGenerationTextInstruction {
	if (typeof instruction === 'object' && instruction !== null) {
		return typeof instruction.text === 'string' && (instruction.language === undefined || typeof instruction.language === 'string');
	}
	return false;
}

export class CustomInstructionsService extends Disposable implements ICustomInstructionsService {

	readonly _serviceBrand: undefined;

	readonly _matchInstructionLocationsFromConfig: IObservable<(uri: URI) => boolean>;
	readonly _matchInstructionLocationsFromExtensions: IObservable<(uri: URI) => boolean>;
	readonly _matchInstructionLocationsFromSkills: IObservable<(uri: URI) => ISkillInfo | undefined>;

	private _extensionPromptFilesCache: IExtensionPromptFile[] | undefined;
	private readonly _onDidChangeExtensionPromptFilesCache = this._register(new Emitter<void>());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@ILogService private readonly logService: ILogService,
		@IExtensionsService private readonly extensionService: IExtensionsService,
		@IRunCommandExecutionService private readonly runCommandExecutionService: IRunCommandExecutionService,
	) {
		super();

		this._matchInstructionLocationsFromConfig = observableFromEvent(
			(handleChange) => this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(INSTRUCTIONS_LOCATION_KEY)) {
					handleChange(e);
				}
			})),
			() => {
				const sanitizedLocations: string[] = [];
				const locations = this.configurationService.getNonExtensionConfig<Record<string, boolean>>(INSTRUCTIONS_LOCATION_KEY);
				if (isObject(locations)) {
					for (const key in locations) {
						const location = key.trim();
						const value = locations[key];
						if (value === true) {
							if (location.startsWith('~/')) {
								sanitizedLocations.push(this.promptPathRepresentationService.getFilePath(extUriBiasedIgnorePathCase.joinPath(this.envService.userHome, location.substring(2))));
							} else if (isAbsolute(location)) {
								sanitizedLocations.push(location);
							}
						}
					}
				}
				return ((uri: URI) => {
					if (uri.scheme !== Schemas.file || !uri.path.endsWith(INSTRUCTION_FILE_EXTENSION) || sanitizedLocations.length === 0) {
						return false;
					}
					const instructionFilePath = this.promptPathRepresentationService.getFilePath(uri);
					const instructionFolderPath = dirname(instructionFilePath);
					for (const location of sanitizedLocations) {
						if (match(location, instructionFolderPath) || match(location, instructionFilePath)) {
							return true;
						}
					}
					return false;
				});
			}
		);

		this._matchInstructionLocationsFromExtensions = observableFromEvent(
			(handleChange) => this._register(this.extensionService.onDidChange(handleChange)),
			() => {
				const locations = new ResourceSet();
				for (const extension of this.extensionService.all) {

					const chatInstructions = extension.packageJSON['contributes']?.['chatInstructions'];
					if (Array.isArray(chatInstructions)) {
						for (const contribution of chatInstructions) {
							if (contribution.path) {
								const folderUri = extUriBiasedIgnorePathCase.dirname(Uri.joinPath(extension.extensionUri, contribution.path));
								locations.add(folderUri);
							}
						}
					}
				}
				return ((uri: URI) => {
					for (const location of locations) {
						if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, location)) {
							return true;
						}
					}
					return false;
				});
			}
		);

		this._matchInstructionLocationsFromSkills = observableFromEvent(
			(handleChange) => {
				const configurationDisposable = configurationService.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(USE_AGENT_SKILLS_SETTING) || e.affectsConfiguration(SKILLS_LOCATION_KEY)) {
						handleChange(e);
					}
				});
				const workspaceDisposable = workspaceService.onDidChangeWorkspaceFolders(handleChange);
				const cacheDisposable = this._onDidChangeExtensionPromptFilesCache.event(handleChange);
				return {
					dispose: () => {
						configurationDisposable.dispose();
						workspaceDisposable.dispose();
						cacheDisposable.dispose();
					}
				};
			},
			() => {
				if (this.configurationService.getNonExtensionConfig<boolean>(USE_AGENT_SKILLS_SETTING)) {
					const personalSkillFolderUris = PERSONAL_SKILL_FOLDERS.map(folder => extUriBiasedIgnorePathCase.joinPath(this.envService.userHome, folder));
					const workspaceSkillFolderUris = this.workspaceService.getWorkspaceFolders().flatMap(workspaceFolder =>
						WORKSPACE_SKILL_FOLDERS.map(folder => extUriBiasedIgnorePathCase.joinPath(workspaceFolder, folder))
					);
					// Tagged list preserving the storage provenance for each folder
					const taggedSkillFolderUris: { uri: URI; storage: SkillStorage }[] = [
						...personalSkillFolderUris.map(uri => ({ uri, storage: SkillStorage.Personal as const })),
						...workspaceSkillFolderUris.map(uri => ({ uri, storage: SkillStorage.Workspace as const })),
					];

					// Get additional skill locations from config
					const configSkillLocationUris: URI[] = [];
					const locations = this.configurationService.getNonExtensionConfig<Record<string, boolean>>(SKILLS_LOCATION_KEY);
					const userHome = this.envService.userHome;
					const workspaceFolders = this.workspaceService.getWorkspaceFolders();
					if (isObject(locations)) {
						for (const key in locations) {
							const location = key.trim();
							const value = locations[key];
							if (value !== true) {
								continue;
							}
							// Expand ~/ to user home directory
							if (location.startsWith('~/')) {
								configSkillLocationUris.push(Uri.joinPath(userHome, location.substring(2)));
							} else if (isAbsolute(location)) {
								configSkillLocationUris.push(URI.file(location));
							} else {
								// Relative path - join to each workspace folder
								for (const workspaceFolder of workspaceFolders) {
									configSkillLocationUris.push(Uri.joinPath(workspaceFolder, location));
								}
							}
						}
					}

					return ((uri: URI) => {
						// Check workspace and personal skill folders
						for (const { uri: topLevelSkillFolderUri, storage } of taggedSkillFolderUris) {
							if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, topLevelSkillFolderUri)) {
								// Get the path segments relative to the skill folder
								const relativePath = extUriBiasedIgnorePathCase.relativePath(topLevelSkillFolderUri, uri);
								if (relativePath) {
									// The skill directory is the first path segment under the skill folder
									const skillName = relativePath.split('/')[0];
									const skillFolderUri = extUriBiasedIgnorePathCase.joinPath(topLevelSkillFolderUri, skillName);
									return { skillName, skillFolderUri, storage };
								}
							}
						}

						// Check config-based skill locations
						if (configSkillLocationUris.length > 0) {
							for (const locationUri of configSkillLocationUris) {
								if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, locationUri)) {
									// Get the path segments relative to the skill folder
									const relativePath = extUriBiasedIgnorePathCase.relativePath(locationUri, uri);
									if (relativePath) {
										// The skill directory is the first path segment under the skill folder
										const skillName = relativePath.split('/')[0];
										const skillFolderUri = extUriBiasedIgnorePathCase.joinPath(locationUri, skillName);
										return { skillName, skillFolderUri, storage: SkillStorage.Workspace };
									}
								}
							}
						}

						// Check extension-contributed skills
						return this.getExtensionSkillInfo(uri);
					});
				}
				return (() => undefined);
			}
		);
	}

	public async fetchInstructionsFromFile(fileUri: Uri): Promise<ICustomInstructions | undefined> {
		return await this.readInstructionsFromFile(fileUri);
	}

	public async getAgentInstructions(): Promise<URI[]> {
		const result = [];
		if (this.configurationService.getConfig(ConfigKey.UseInstructionFiles)) {
			for (const folder of this.workspaceService.getWorkspaceFolders()) {
				try {
					const uri = extUriBiasedIgnorePathCase.joinPath(folder, COPILOT_INSTRUCTIONS_PATH);
					if ((await this.fileSystemService.stat(uri)).type === FileType.File) {
						result.push(uri);
					}
				} catch (e) {
					// ignore non-existing instruction files
				}
			}
		}
		return result;
	}

	public async fetchInstructionsFromSetting(configKey: Config<CodeGenerationInstruction[]>): Promise<ICustomInstructions[]> {
		const result: ICustomInstructions[] = [];

		const instructions: IInstruction[] = [];
		const seenFiles: Set<string> = new Set();

		const inspect = this.configurationService.inspectConfig(configKey);
		if (inspect) {
			await this.collectInstructionsFromSettings([inspect.workspaceFolderValue, inspect.workspaceValue, inspect.globalValue], seenFiles, instructions, result);
		}

		const reference = Uri.from({ scheme: this.envService.uriScheme, authority: 'settings', path: `/${configKey.fullyQualifiedId}` });
		if (instructions.length > 0) {
			result.push({
				kind: CustomInstructionsKind.Setting,
				content: instructions,
				reference,
			});
		}
		return result;
	}

	private async collectInstructionsFromSettings(instructionsArrays: (CodeGenerationInstruction[] | undefined)[], seenFiles: Set<string>, instructions: IInstruction[], result: ICustomInstructions[]): Promise<void> {
		const seenInstructions: Set<string> = new Set();
		for (const instructionsArray of instructionsArrays) {
			if (Array.isArray(instructionsArray)) {
				for (const entry of instructionsArray) {
					if (isCodeGenerationImportInstruction(entry) && !seenFiles.has(entry.file)) {
						seenFiles.add(entry.file);
						await this._collectInstructionsFromFile(entry.file, entry.language, result);
					}
					if (isCodeGenerationTextInstruction(entry) && !seenInstructions.has(entry.text)) {
						seenInstructions.add(entry.text);
						instructions.push({ instruction: entry.text, languageId: entry.language });
					}
				}
			}
		}
	}

	private async _collectInstructionsFromFile(customInstructionsFile: string, language: string | undefined, result: ICustomInstructions[]): Promise<void> {
		this.logService.debug(`Collect instructions from file: ${customInstructionsFile}`);
		const promises = this.workspaceService.getWorkspaceFolders().map(async folderUri => {
			const fileUri = Uri.joinPath(folderUri, customInstructionsFile);
			const instruction = await this.readInstructionsFromFile(fileUri, language);
			if (instruction) {
				result.push(instruction);
			}
		});
		await Promise.all(promises);
	}

	private async readInstructionsFromFile(fileUri: Uri, languageId?: string): Promise<ICustomInstructions | undefined> {
		try {
			const fileContents = await this.fileSystemService.readFile(fileUri);
			const content = new TextDecoder().decode(fileContents);
			const instruction = content.trim();
			if (!instruction) {
				this.logService.debug(`Instructions file is empty: ${fileUri.toString()}`);
				return;
			}
			return {
				kind: CustomInstructionsKind.File,
				content: [{ instruction, languageId }],
				reference: fileUri
			};
		} catch (e) {
			this.logService.debug(`Instructions file not found: ${fileUri.toString()}`);
			return undefined;
		}
	}

	public async refreshExtensionPromptFiles(): Promise<void> {
		try {
			const extensionPromptFiles = await this.runCommandExecutionService.executeCommand('vscode.extensionPromptFileProvider') as IExtensionPromptFile[] | undefined;
			this._extensionPromptFilesCache = extensionPromptFiles ?? [];
		} catch (e) {
			this.logService.warn(`Error fetching extension prompt files: ${e}`);
			this._extensionPromptFilesCache = [];
		}
		this._onDidChangeExtensionPromptFilesCache.fire();
	}

	private isExtensionPromptFile(uri: URI): boolean {
		if (!this._extensionPromptFilesCache) {
			return false;
		}
		return this._extensionPromptFilesCache.some(file => {
			if (file.type === 'skill') {
				// For skills, the URI points to SKILL.md - allow everything under the parent folder
				const skillFolderUri = extUriBiasedIgnorePathCase.dirname(file.uri);
				return extUriBiasedIgnorePathCase.isEqualOrParent(uri, skillFolderUri);
			}
			return extUriBiasedIgnorePathCase.isEqual(file.uri, uri);
		});
	}

	public getExtensionSkillInfo(uri: URI): (ISkillInfo & { extensionId?: string }) | undefined {
		if (!this._extensionPromptFilesCache) {
			return undefined;
		}
		for (const file of this._extensionPromptFilesCache) {
			if (file.type === 'skill') {
				const skillFolderUri = extUriBiasedIgnorePathCase.dirname(file.uri);
				if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, skillFolderUri)) {
					const skillName = extUriBiasedIgnorePathCase.basename(skillFolderUri);
					return { skillName, skillFolderUri, storage: SkillStorage.Extension, extensionId: file.extensionId };
				}
			}
		}
		return undefined;
	}

	public parseInstructionIndexFile(content: string): InstructionIndexFile {
		return new InstructionIndexFile(content, this.promptPathRepresentationService);
	}

	public async isExternalInstructionsFile(uri: URI): Promise<boolean> {
		if (uri.scheme === Schemas.vscodeUserData && uri.path.endsWith(INSTRUCTION_FILE_EXTENSION)) {
			return true;
		}
		if (this._matchInstructionLocationsFromConfig.get()(uri)
			|| this._matchInstructionLocationsFromExtensions.get()(uri)
			|| this._matchInstructionLocationsFromSkills.get()(uri)) {
			return true;
		}

		// Check cached extension-contributed prompt files
		if (this._extensionPromptFilesCache === undefined) {
			// Cache not initialized yet, fetch it now
			await this.refreshExtensionPromptFiles();
		}
		return this.isExtensionPromptFile(uri);
	}

	public isExternalInstructionsFolder(uri: URI): boolean {
		return this._matchInstructionLocationsFromExtensions.get()(uri)
			|| this._matchInstructionLocationsFromSkills.get()(uri) !== undefined;
	}

	public isSkillFile(uri: URI): boolean {
		return this._matchInstructionLocationsFromSkills.get()(uri) !== undefined;
	}

	public isSkillMdFile(uri: URI): boolean {
		return this.isSkillFile(uri) && extUriBiasedIgnorePathCase.basename(uri).toLowerCase() === 'skill.md';
	}

	public getSkillDirectory(uri: URI): URI | undefined {
		const skillInfo = this._matchInstructionLocationsFromSkills.get()(uri);
		if (!skillInfo) {
			return undefined;
		}
		return skillInfo.skillFolderUri;
	}

	public getSkillName(uri: URI): string | undefined {
		const skillInfo = this._matchInstructionLocationsFromSkills.get()(uri);
		if (!skillInfo) {
			return undefined;
		}
		return skillInfo.skillName;
	}

	public getSkillInfo(uri: URI): ISkillInfo | undefined {
		return this._matchInstructionLocationsFromSkills.get()(uri);
	}
}

class InstructionIndexFile implements IInstructionIndexFile {

	private instructionUris: ResourceSet | undefined;
	private skillUris: ResourceSet | undefined;
	private skillFolderUris: ResourceSet | undefined;
	private agentNames: Set<string> | undefined;

	constructor(
		public readonly content: string,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService) {
	}

	/**
	 * Finds file paths or names in the index file. The index file has XML format: <listElementName><elementName><propertyName>value</propertyName></elementName></listElementName>
	 */
	private getValuesInIndexFile(listElementName: string, elementName: string, propertyName: string): string[] {
		const result: string[] = [];
		const lists = xmlContents(this.content, listElementName);
		for (const list of lists) {
			const instructions = xmlContents(list, elementName);
			for (const instruction of instructions) {
				const filePath = xmlContents(instruction, propertyName);
				if (filePath.length > 0) {
					result.push(filePath[0]);
				}
			}
		}
		return result;
	}

	private getURIsFromFilePaths(filePaths: string[]): ResourceSet {
		const result = new ResourceSet();
		for (const filePath of filePaths) {
			const uri = this.promptPathRepresentationService.resolveFilePath(filePath);
			if (uri) {
				result.add(uri);
				if (uri.scheme === Schemas.vscodeUserData) {
					result.add(URI.from({ scheme: Schemas.file, path: uri.path }));
				}
			}
		}
		return result;
	}

	get instructions(): ResourceSet {
		if (this.instructionUris === undefined) {
			this.instructionUris = this.getURIsFromFilePaths(this.getValuesInIndexFile('instructions', 'instruction', 'file'));
		}
		return this.instructionUris;
	}

	get skills(): ResourceSet {
		if (this.skillUris === undefined) {
			this.skillUris = this.getURIsFromFilePaths(this.getValuesInIndexFile('skills', 'skill', 'file'));
		}
		return this.skillUris;
	}

	get skillFolders(): ResourceSet {
		if (this.skillFolderUris === undefined) {
			this.skillFolderUris = new ResourceSet();
			for (const skillUri of this.skills) {
				const skillFolderUri = extUriBiasedIgnorePathCase.dirname(skillUri);
				this.skillFolderUris.add(skillFolderUri);
			}
		}
		return this.skillFolderUris;
	}

	get agents(): Set<string> {
		if (this.agentNames === undefined) {
			this.agentNames = new Set(this.getValuesInIndexFile('agents', 'agent', 'file'));
		}
		return this.agentNames;
	}
}

function xmlContents(text: string, tag: string): string[] {
	const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
	const matches = [];
	let match;
	while ((match = regex.exec(text)) !== null) {
		matches.push(match[1].trim());
	}
	return matches;
}
