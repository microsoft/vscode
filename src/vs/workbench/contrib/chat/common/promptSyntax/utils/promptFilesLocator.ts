/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import * as nls from '../../../../../../nls.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { getPromptFileLocationsConfigKey, isTildePath, PromptsConfig } from '../config/config.js';
import { basename, dirname, isEqualOrParent, joinPath } from '../../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, AGENTS_SOURCE_FOLDER, getPromptFileExtension, getPromptFileType, LEGACY_MODE_FILE_EXTENSION, getCleanPromptName, AGENT_FILE_EXTENSION, getPromptFileDefaultLocations, SKILL_FILENAME, IPromptSourceFolder, DEFAULT_AGENT_SOURCE_FOLDERS, IResolvedPromptFile, IResolvedPromptSourceFolder, PromptFileSource } from '../config/promptFileLocations.js';
import { PromptsType } from '../promptTypes.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { getExcludes, IFileQuery, ISearchConfiguration, ISearchService, QueryType } from '../../../../../services/search/common/search.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { PromptsStorage } from '../service/promptsService.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';

/**
 * Utility class to locate prompt files.
 */
export class PromptFilesLocator {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ISearchService private readonly searchService: ISearchService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
		@ILogService private readonly logService: ILogService,
		@IPathService private readonly pathService: IPathService,
	) {
	}

	/**
	 * List all prompt files from the filesystem.
	 *
	 * @returns List of prompt files found in the workspace.
	 */
	public async listFiles(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly URI[]> {
		if (storage === PromptsStorage.local) {
			return await this.listFilesInLocal(type, token);
		} else if (storage === PromptsStorage.user) {
			return await this.listFilesInUserData(type, token);
		}
		throw new Error(`Unsupported prompt file storage: ${storage}`);
	}

	private async listFilesInUserData(type: PromptsType, token: CancellationToken): Promise<readonly URI[]> {
		const userStorageFolders = await this.getUserStorageFolders(type);
		const paths = new ResourceSet();

		for (const { uri } of userStorageFolders) {
			const files = await this.resolveFilesAtLocation(uri, type, token);
			for (const file of files) {
				if (getPromptFileType(file) === type) {
					paths.add(file);
				}
			}
			if (token.isCancellationRequested) {
				return [];
			}
		}

		return [...paths];
	}

	/**
	 * Gets all user storage folders for the given prompt type.
	 * This includes configured tilde paths and the VS Code user data prompts folder.
	 */
	private async getUserStorageFolders(type: PromptsType): Promise<readonly IResolvedPromptSourceFolder[]> {
		const userHome = await this.pathService.userHome();
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		const absoluteLocations = this.toAbsoluteLocations(type, configuredLocations, userHome);

		// Filter to only user storage locations
		const result = absoluteLocations.filter(loc => loc.storage === PromptsStorage.user);

		// Also include the VS Code user data prompts folder (for all types except skills)
		if (type !== PromptsType.skill) {
			const userDataPromptsHome = this.userDataService.currentProfile.promptsHome;
			return [
				...result,
				{
					uri: userDataPromptsHome,
					source: PromptFileSource.CopilotPersonal,
					storage: PromptsStorage.user,
					displayPath: nls.localize('promptsUserDataFolder', "User Data"),
					isDefault: true
				}
			];
		}

		return result;
	}

	/**
	 * Gets all source folder URIs for a prompt type (both workspace and user home).
	 * This is used for file watching to detect changes in all relevant locations.
	 */
	private getSourceFoldersSync(type: PromptsType, userHome: URI): readonly URI[] {
		const result: URI[] = [];
		const { folders } = this.workspaceService.getWorkspace();
		const defaultFolders = getPromptFileDefaultLocations(type);

		for (const sourceFolder of defaultFolders) {
			if (sourceFolder.storage === PromptsStorage.local) {
				for (const workspaceFolder of folders) {
					result.push(joinPath(workspaceFolder.uri, sourceFolder.path));
				}
			} else if (sourceFolder.storage === PromptsStorage.user) {
				result.push(joinPath(userHome, sourceFolder.path));
			}
		}

		return result;
	}

	public createFilesUpdatedEvent(type: PromptsType): { readonly event: Event<void>; dispose: () => void } {
		const disposables = new DisposableStore();
		const eventEmitter = disposables.add(new Emitter<void>());

		const userDataFolder = this.userDataService.currentProfile.promptsHome;

		const key = getPromptFileLocationsConfigKey(type);
		let parentFolders = this.getLocalParentFolders(type);
		let allSourceFolders: URI[] = [];

		const externalFolderWatchers = disposables.add(new DisposableStore());
		const updateExternalFolderWatchers = () => {
			externalFolderWatchers.clear();
			for (const folder of parentFolders) {
				if (!this.workspaceService.getWorkspaceFolder(folder.parent)) {
					// if the folder is not part of the workspace, we need to watch it
					const recursive = folder.filePattern !== undefined;
					externalFolderWatchers.add(this.fileService.watch(folder.parent, { recursive, excludes: [] }));
				}
			}
			// Watch all source folders (including user home if applicable)
			for (const folder of allSourceFolders) {
				if (!this.workspaceService.getWorkspaceFolder(folder)) {
					externalFolderWatchers.add(this.fileService.watch(folder, { recursive: true, excludes: [] }));
				}
			}
		};

		// Initialize source folders (async if type has userHome locations)
		this.pathService.userHome().then(userHome => {
			allSourceFolders = [...this.getSourceFoldersSync(type, userHome)];
			updateExternalFolderWatchers();
		});

		disposables.add(this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key)) {
				parentFolders = this.getLocalParentFolders(type);
				updateExternalFolderWatchers();
				eventEmitter.fire();
			}
		}));
		disposables.add(this.fileService.onDidFilesChange(e => {
			if (e.affects(userDataFolder)) {
				eventEmitter.fire();
				return;
			}
			if (parentFolders.some(folder => e.affects(folder.parent))) {
				eventEmitter.fire();
				return;
			}
			if (allSourceFolders.some(folder => e.affects(folder))) {
				eventEmitter.fire();
				return;
			}
		}));
		disposables.add(this.fileService.watch(userDataFolder));

		return { event: eventEmitter.event, dispose: () => disposables.dispose() };
	}

	public async getAgentSourceFolders(): Promise<readonly URI[]> {
		const userHome = await this.pathService.userHome();
		return this.toAbsoluteLocations(PromptsType.agent, DEFAULT_AGENT_SOURCE_FOLDERS, userHome).map(l => l.uri);
	}

	/**
	 * Get all possible unambiguous prompt file source folders based on
	 * the current workspace folder structure.
	 *
	 * This method is currently primarily used by the `> Create Prompt`
	 * command that providers users with the list of destination folders
	 * for a newly created prompt file. Because such a list cannot contain
	 * paths that include `glob pattern` in them, we need to process config
	 * values and try to create a list of clear and unambiguous locations.
	 *
	 * @returns List of possible unambiguous prompt file folders.
	 */
	public async getConfigBasedSourceFolders(type: PromptsType): Promise<readonly URI[]> {
		const userHome = await this.pathService.userHome();
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		const absoluteLocations = this.toAbsoluteLocations(type, configuredLocations, userHome).map(l => l.uri);

		// For anything that doesn't support glob patterns, we can return
		if (type !== PromptsType.prompt && type !== PromptsType.instructions) {
			return absoluteLocations;
		}

		// locations in the settings can contain glob patterns so we need
		// to process them to get "clean" paths; the goal here is to have
		// a list of unambiguous folder paths where prompt files are stored
		const result = new ResourceSet();
		for (let absoluteLocation of absoluteLocations) {
			const baseName = basename(absoluteLocation);

			// if a path ends with a well-known "any file" pattern, remove
			// it so we can get the dirname path of that setting value
			const filePatterns = ['*.md', `*${getPromptFileExtension(type)}`];
			for (const filePattern of filePatterns) {
				if (baseName === filePattern) {
					absoluteLocation = dirname(absoluteLocation);
					continue;
				}
			}

			// likewise, if the pattern ends with single `*` (any file name)
			// remove it to get the dirname path of the setting value
			if (baseName === '*') {
				absoluteLocation = dirname(absoluteLocation);
			}

			// if after replacing the "file name" glob pattern, the path
			// still contains a glob pattern, then ignore the path
			if (isValidGlob(absoluteLocation.path) === true) {
				continue;
			}

			result.add(absoluteLocation);
		}

		return [...result];
	}

	/**
	 * Gets all resolved source folders for the given prompt type with metadata.
	 * This method merges configured locations with default locations and resolves them
	 * to absolute paths, including displayPath and isDefault information.
	 *
	 * @param type The type of prompt files.
	 * @returns List of resolved source folders with metadata.
	 */
	public async getResolvedSourceFolders(type: PromptsType): Promise<readonly IResolvedPromptSourceFolder[]> {
		const localFolders = await this.getLocalStorageFolders(type);
		const userFolders = await this.getUserStorageFolders(type);
		return this.dedupeSourceFolders([...localFolders, ...userFolders]);
	}

	/**
	 * Gets all local (workspace) storage folders for the given prompt type.
	 * This merges default folders with configured locations.
	 */
	private async getLocalStorageFolders(type: PromptsType): Promise<readonly IResolvedPromptSourceFolder[]> {
		const userHome = await this.pathService.userHome();
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		const defaultFolders = getPromptFileDefaultLocations(type);

		// Merge default folders with configured locations, avoiding duplicates
		const allFolders = [
			...defaultFolders,
			...configuredLocations.filter(loc => !defaultFolders.some(df => df.path === loc.path))
		];

		return this.toAbsoluteLocations(type, allFolders, userHome, defaultFolders);
	}

	/**
	 * Deduplicates source folders by URI.
	 */
	private dedupeSourceFolders(folders: readonly IResolvedPromptSourceFolder[]): IResolvedPromptSourceFolder[] {
		const seen = new ResourceSet();
		const result: IResolvedPromptSourceFolder[] = [];
		for (const folder of folders) {
			if (!seen.has(folder.uri)) {
				seen.add(folder.uri);
				result.push(folder);
			}
		}
		return result;
	}

	/**
	 * Finds all existent prompt files in the configured local source folders.
	 *
	 * @returns List of prompt files found in the local source folders.
	 */
	private async listFilesInLocal(type: PromptsType, token: CancellationToken): Promise<readonly URI[]> {
		// find all prompt files in the provided locations, then match
		// the found file paths against (possible) glob patterns
		const paths = new ResourceSet();

		for (const { parent, filePattern } of this.getLocalParentFolders(type)) {
			const files = (filePattern === undefined)
				? await this.resolveFilesAtLocation(parent, type, token) // if the location does not contain a glob pattern, resolve the location directly
				: await this.searchFilesInLocation(parent, filePattern, token);
			for (const file of files) {
				if (getPromptFileType(file) === type) {
					paths.add(file);
				}
			}
			if (token.isCancellationRequested) {
				return [];
			}
		}

		return [...paths];
	}

	private getLocalParentFolders(type: PromptsType): readonly { parent: URI; filePattern?: string }[] {
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		if (type === PromptsType.agent) {
			configuredLocations.push(...DEFAULT_AGENT_SOURCE_FOLDERS);
		}

		const absoluteLocations = this.toAbsoluteLocations(type, configuredLocations, undefined);
		return absoluteLocations.map((location) => firstNonGlobParentAndPattern(location.uri));
	}

	/**
	 * Converts locations defined in `settings` to absolute filesystem path URIs with metadata.
	 * This conversion is needed because locations in settings can be relative,
	 * hence we need to resolve them based on the current workspace folders.
	 * If userHome is provided, paths starting with `~` will be expanded. Otherwise these paths are ignored.
	 * Preserves the type and location properties from the source folder definitions.
	 */
	private toAbsoluteLocations(type: PromptsType, configuredLocations: readonly IPromptSourceFolder[], userHome: URI | undefined, defaultLocations?: readonly IPromptSourceFolder[]): readonly IResolvedPromptSourceFolder[] {
		const result: IResolvedPromptSourceFolder[] = [];
		const seen = new ResourceSet();
		const { folders } = this.workspaceService.getWorkspace();

		// Create a set of default paths for quick lookup
		const defaultPaths = new Set(defaultLocations?.map(loc => loc.path));

		// Filter and validate skill paths before resolving
		const validLocations = configuredLocations.filter(sourceFolder => {
			// TODO: deprecate glob patterns for prompts and instructions in the future
			if (type === PromptsType.instructions || type === PromptsType.prompt) {
				const path = sourceFolder.path;
				if (hasGlobPattern(path)) {
					if (type === PromptsType.prompt) {
						this.logService.warn(`[Deprecated] Glob patterns (* and **) in prompt file locations are deprecated: "${path}". Consider using explicit paths instead.`);
					} else if (type === PromptsType.instructions) {
						this.logService.info(`Glob patterns (* and **) detected in instruction file location: "${path}". Consider using explicit paths for better performance.`);
					}
				}
				return true;
			}
			const configuredLocation = sourceFolder.path;
			if (!isValidPromptFolderPath(configuredLocation)) {
				this.logService.warn(`Skipping invalid path (glob patterns and absolute paths not supported): ${configuredLocation}`);
				return false;
			}
			return true;
		});

		for (const sourceFolder of validLocations) {
			const configuredLocation = sourceFolder.path;
			const isDefault = defaultPaths?.has(configuredLocation);
			try {
				// Handle tilde paths when userHome is provided
				if (isTildePath(configuredLocation)) {
					// If userHome is not provided, we cannot resolve tilde paths so we skip this entry
					if (userHome) {
						const uri = joinPath(userHome, configuredLocation.substring(2));
						if (!seen.has(uri)) {
							seen.add(uri);
							result.push({ uri, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
						}
					}
					continue;
				}

				if (isAbsolute(configuredLocation)) {
					let uri = URI.file(configuredLocation);
					const remoteAuthority = this.environmentService.remoteAuthority;
					if (remoteAuthority) {
						// if the location is absolute and we are in a remote environment,
						// we need to convert it to a file URI with the remote authority
						uri = uri.with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });
					}
					if (!seen.has(uri)) {
						seen.add(uri);
						result.push({ uri, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
					}
				} else {
					for (const workspaceFolder of folders) {
						const absolutePath = joinPath(workspaceFolder.uri, configuredLocation);
						if (!seen.has(absolutePath)) {
							seen.add(absolutePath);
							result.push({ uri: absolutePath, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
						}
					}
				}
			} catch (error) {
				this.logService.error(`Failed to resolve prompt file location: ${configuredLocation}`, error);
			}
		}

		return result;
	}

	/**
	 * Uses the file service to resolve the provided location and return either the file at the location of files in the directory.
	 */
	private async resolveFilesAtLocation(location: URI, type: PromptsType, token: CancellationToken): Promise<URI[]> {
		if (type === PromptsType.skill) {
			return this.findAgentSkillsInFolder(location, token);
		}
		try {
			const info = await this.fileService.resolve(location);
			if (info.isFile) {
				return [info.resource];
			} else if (info.isDirectory && info.children) {
				const result: URI[] = [];
				for (const child of info.children) {
					if (child.isFile) {
						result.push(child.resource);
					}
				}
				return result;
			}
		} catch (error) {
		}
		return [];
	}

	/**
	 * Uses the search service to find all files at the provided location.
	 * Requires a FileSearchProvider to be available for the folder's scheme.
	 */
	private async searchFilesInLocation(folder: URI, filePattern: string | undefined, token: CancellationToken): Promise<URI[]> {
		// Check if a FileSearchProvider is available for this scheme
		if (!this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
			this.logService.warn(`[PromptFilesLocator] No FileSearchProvider available for scheme '${folder.scheme}'. Cannot search for pattern '${filePattern}' in ${folder.toString()}`);
			return [];
		}

		const disregardIgnoreFiles = this.configService.getValue<boolean>('explorer.excludeGitIgnore');

		const workspaceRoot = this.workspaceService.getWorkspaceFolder(folder);

		const getExcludePattern = (folder: URI) => getExcludes(this.configService.getValue<ISearchConfiguration>({ resource: folder })) || {};
		const searchOptions: IFileQuery = {
			folderQueries: [{ folder, disregardIgnoreFiles }],
			type: QueryType.File,
			shouldGlobMatchFilePattern: true,
			excludePattern: workspaceRoot ? getExcludePattern(workspaceRoot.uri) : undefined,
			ignoreGlobCase: true,
			sortByScore: true,
			filePattern
		};

		try {
			const searchResult = await this.searchService.fileSearch(searchOptions, token);
			if (token.isCancellationRequested) {
				return [];
			}
			return searchResult.results.map(r => r.resource);
		} catch (e) {
			if (!isCancellationError(e)) {
				throw e;
			}
		}
		return [];
	}

	public async findCopilotInstructionsMDsInWorkspace(token: CancellationToken): Promise<URI[]> {
		const result: URI[] = [];
		const { folders } = this.workspaceService.getWorkspace();
		for (const folder of folders) {
			const file = joinPath(folder.uri, `.github/` + COPILOT_CUSTOM_INSTRUCTIONS_FILENAME);
			try {
				const stat = await this.fileService.stat(file);
				if (stat.isFile) {
					result.push(file);
				}
			} catch (error) {
				this.logService.trace(`[PromptFilesLocator] Skipping copilot-instructions.md at ${file.toString()}: ${error}`);
			}
		}
		return result;
	}

	/**
	 * Gets list of `AGENTS.md` files anywhere in the workspace.
	 */
	public async findAgentMDsInWorkspace(token: CancellationToken): Promise<URI[]> {
		const result = await Promise.all(this.workspaceService.getWorkspace().folders.map(folder => this.findAgentMDsInFolder(folder.uri, token)));
		return result.flat(1);
	}

	private async findAgentMDsInFolder(folder: URI, token: CancellationToken): Promise<URI[]> {
		// Check if a FileSearchProvider is available for this scheme
		if (this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
			// Use the search service if a FileSearchProvider is available
			const disregardIgnoreFiles = this.configService.getValue<boolean>('explorer.excludeGitIgnore');
			const getExcludePattern = (folder: URI) => getExcludes(this.configService.getValue<ISearchConfiguration>({ resource: folder })) || {};
			const searchOptions: IFileQuery = {
				folderQueries: [{ folder, disregardIgnoreFiles }],
				type: QueryType.File,
				shouldGlobMatchFilePattern: true,
				excludePattern: getExcludePattern(folder),
				filePattern: '**/AGENTS.md',
				ignoreGlobCase: true,
			};

			try {
				const searchResult = await this.searchService.fileSearch(searchOptions, token);
				if (token.isCancellationRequested) {
					return [];
				}
				return searchResult.results.map(r => r.resource);
			} catch (e) {
				if (!isCancellationError(e)) {
					throw e;
				}
			}
			return [];
		} else {
			// Fallback to recursive traversal using file service
			return this.findAgentMDsUsingFileService(folder, token);
		}
	}

	/**
	 * Recursively traverses a folder using the file service to find AGENTS.md files.
	 * This is used as a fallback when no FileSearchProvider is available for the scheme.
	 */
	private async findAgentMDsUsingFileService(folder: URI, token: CancellationToken): Promise<URI[]> {
		const result: URI[] = [];
		const agentsMdFileName = 'agents.md';

		const traverse = async (uri: URI): Promise<void> => {
			if (token.isCancellationRequested) {
				return;
			}

			try {
				const stat = await this.fileService.resolve(uri);
				if (stat.isFile && stat.name.toLowerCase() === agentsMdFileName) {
					result.push(stat.resource);
				} else if (stat.isDirectory && stat.children) {
					// Recursively traverse subdirectories
					for (const child of stat.children) {
						await traverse(child.resource);
					}
				}
			} catch (error) {
				// Ignore errors for individual files/folders (e.g., permission denied)
				this.logService.trace(`[PromptFilesLocator] Error traversing ${uri.toString()}: ${error}`);
			}
		};

		await traverse(folder);
		return result;
	}

	/**
	 * Gets list of `AGENTS.md` files only at the root workspace folder(s).
	 */
	public async findAgentMDsInWorkspaceRoots(token: CancellationToken): Promise<URI[]> {
		const result: URI[] = [];
		const { folders } = this.workspaceService.getWorkspace();
		const resolvedRoots = await this.fileService.resolveAll(folders.map(f => ({ resource: f.uri })));
		for (const root of resolvedRoots) {
			if (root.success && root.stat?.children) {
				const agentMd = root.stat.children.find(c => c.isFile && c.name.toLowerCase() === 'agents.md');
				if (agentMd) {
					result.push(agentMd.resource);
				}
			}
		}
		return result;
	}

	public getAgentFileURIFromModeFile(oldURI: URI): URI | undefined {
		if (oldURI.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
			let newLocation;
			const workspaceFolder = this.workspaceService.getWorkspaceFolder(oldURI);
			if (workspaceFolder) {
				newLocation = joinPath(workspaceFolder.uri, AGENTS_SOURCE_FOLDER, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
			} else if (isEqualOrParent(oldURI, this.userDataService.currentProfile.promptsHome)) {
				newLocation = joinPath(this.userDataService.currentProfile.promptsHome, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
			}
			return newLocation;
		}
		return undefined;
	}

	private async findAgentSkillsInFolder(uri: URI, token: CancellationToken): Promise<URI[]> {
		try {
			const result: URI[] = [];
			const stat = await this.fileService.resolve(uri);
			if (stat.isDirectory && stat.children) {
				// Recursively traverse subdirectories
				for (const child of stat.children) {
					try {
						if (token.isCancellationRequested) {
							return [];
						}
						if (child.isDirectory) {
							const skillFile = joinPath(child.resource, SKILL_FILENAME);
							const skillStat = await this.fileService.resolve(skillFile);
							if (skillStat.isFile) {
								result.push(skillStat.resource);
							}
						}
					} catch (error) {
						// Ignore errors for individual files/folders (e.g., permission denied)
					}
				}
			}
			return result;
		} catch (e) {
			if (!isCancellationError(e)) {
				this.logService.trace(`[PromptFilesLocator] Error searching for skills in ${uri.toString()}: ${e}`);
			}
			return [];
		}
	}

	/**
	 * Searches for skills in all configured locations.
	 */
	public async findAgentSkills(token: CancellationToken): Promise<IResolvedPromptFile[]> {
		const userHome = await this.pathService.userHome();
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, PromptsType.skill);
		const absoluteLocations = this.toAbsoluteLocations(PromptsType.skill, configuredLocations, userHome);
		const allResults: IResolvedPromptFile[] = [];

		for (const { uri, source, storage } of absoluteLocations) {
			if (token.isCancellationRequested) {
				return [];
			}
			const results = await this.findAgentSkillsInFolder(uri, token);
			allResults.push(...results.map(uri => ({ fileUri: uri, source, storage })));
		}

		return allResults;
	}
}


/**
 * Checks if the provided path contains a glob pattern (* or **).
 * Used to detect deprecated glob usage in prompt file locations.
 *
 * @param path - path to check
 * @returns `true` if the path contains `*` or `**`, `false` otherwise
 */
export function hasGlobPattern(path: string): boolean {
	return path.includes('*');
}


/**
 * Checks if the provided `pattern` could be a valid glob pattern.
 */
export function isValidGlob(pattern: string): boolean {
	let squareBrackets = false;
	let squareBracketsCount = 0;

	let curlyBrackets = false;
	let curlyBracketsCount = 0;

	let previousCharacter: string | undefined;
	for (const char of pattern) {
		// skip all escaped characters
		if (previousCharacter === '\\') {
			previousCharacter = char;
			continue;
		}

		if (char === '*') {
			return true;
		}

		if (char === '?') {
			return true;
		}

		if (char === '[') {
			squareBrackets = true;
			squareBracketsCount++;

			previousCharacter = char;
			continue;
		}

		if (char === ']') {
			squareBrackets = true;
			squareBracketsCount--;
			previousCharacter = char;
			continue;
		}

		if (char === '{') {
			curlyBrackets = true;
			curlyBracketsCount++;
			continue;
		}

		if (char === '}') {
			curlyBrackets = true;
			curlyBracketsCount--;
			previousCharacter = char;
			continue;
		}

		previousCharacter = char;
	}

	// if square brackets exist and are in pairs, this is a `valid glob`
	if (squareBrackets && (squareBracketsCount === 0)) {
		return true;
	}

	// if curly brackets exist and are in pairs, this is a `valid glob`
	if (curlyBrackets && (curlyBracketsCount === 0)) {
		return true;
	}

	return false;
}

/**
 * Finds the first parent of the provided location that does not contain a `glob pattern`.
 *
 * Asumes that the location that is provided has a valid path (is abstract)
 *
 * ## Examples
 *
 * ```typescript
 * assert.strictDeepEqual(
 *     firstNonGlobParentAndPattern(URI.file('/home/user/{folder1,folder2}/file.md')).path,
 *     { parent: URI.file('/home/user'), filePattern: '{folder1,folder2}/file.md' },
 *     'Must find correct non-glob parent dirname.',
 * );
 * ```
 */
function firstNonGlobParentAndPattern(location: URI): { parent: URI; filePattern?: string } {
	const segments = location.path.split('/');
	let i = 0;
	while (i < segments.length && isValidGlob(segments[i]) === false) {
		i++;
	}
	if (i === segments.length) {
		// the path does not contain a glob pattern, so we can
		// just find all prompt files in the provided location
		return { parent: location };
	}
	const parent = location.with({ path: segments.slice(0, i).join('/') });
	if (i === segments.length - 1 && segments[i] === '*' || segments[i] === ``) {
		return { parent };
	}

	// the path contains a glob pattern, so we search in last folder that does not contain a glob pattern
	return {
		parent,
		filePattern: segments.slice(i).join('/')
	};
}


/**
 * Regex pattern string for validating paths for all prompt files.
 * Paths only support:
 * - Relative paths: someFolder, ./someFolder
 * - User home paths: ~/folder (only forward slash, not backslash for cross-platform sharing)
 * - Parent relative paths for monorepos: ../folder
 *
 * NOT supported:
 * - Absolute paths (portability issue)
 * - Glob patterns with * or ** (performance issue)
 * - Backslashes (paths should be shareable in repos across platforms)
 * - Tilde without forward slash (e.g., ~abc, ~\folder)
 * - Empty or whitespace-only paths
 *
 * The regex validates:
 * - Not a Windows absolute path (e.g., C:\, C:/)
 * - Not starting with / (Unix absolute path)
 * - No backslashes anywhere (use forward slashes only)
 * - If starts with ~, must be followed by /
 * - No glob pattern characters: * ? [ ] { }
 * - At least one non-whitespace character
 */
export const VALID_PROMPT_FOLDER_PATTERN = '^(?![A-Za-z]:[\\\\/])(?!/)(?!~(?!/))(?!.*\\\\)(?!.*[*?\\[\\]{}]).*\\S.*$';
const VALID_PROMPT_FOLDER_REGEX = new RegExp(VALID_PROMPT_FOLDER_PATTERN);

/**
 * Validates if a path is allowed for simplified path configurations.
 * Only forward slashes are supported to ensure paths are shareable across platforms.
 */
export function isValidPromptFolderPath(path: string): boolean {
	return VALID_PROMPT_FOLDER_REGEX.test(path);
}
