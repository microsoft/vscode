/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { URI } from '../../../../../../base/common/uri.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import * as nls from '../../../../../../nls.js';
import { FileOperationError, IFileService } from '../../../../../../platform/files/common/files.js';
import { getPromptFileLocationsConfigKey, isTildePath, PromptsConfig } from '../config/config.js';
import { basename, dirname, isEqual, isEqualOrParent, joinPath, extname } from '../../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AGENTS_SOURCE_FOLDER, getPromptFileExtension, getPromptFileType, LEGACY_MODE_FILE_EXTENSION, getCleanPromptName, AGENT_FILE_EXTENSION, getPromptFileDefaultLocations, SKILL_FILENAME } from '../config/promptFileLocations.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { getExcludes, ISearchService } from '../../../../../services/search/common/search.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { AgentInstructionFileType, PromptsStorage } from '../service/promptsService.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { equalsIgnoreCase } from '../../../../../../base/common/strings.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
/**
 * Maximum recursion depth when traversing subdirectories for instruction files.
 */
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;
/**
 * Utility class to locate prompt files.
 */
let PromptFilesLocator = class PromptFilesLocator {
    constructor(fileService, configService, workspaceService, environmentService, searchService, userDataService, logService, pathService, workspaceTrustManagementService) {
        this.fileService = fileService;
        this.configService = configService;
        this.workspaceService = workspaceService;
        this.environmentService = environmentService;
        this.searchService = searchService;
        this.userDataService = userDataService;
        this.logService = logService;
        this.pathService = pathService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        const userDataPromptsHome = this.userDataService.currentProfile.promptsHome;
        this.userDataFolder = {
            uri: userDataPromptsHome,
            parent: userDataPromptsHome,
            filePattern: undefined,
            source: PromptFileSource.CopilotPersonal,
            storage: PromptsStorage.user,
            displayPath: nls.localize('promptsUserDataFolder', "User Data"),
            isDefault: true
        };
    }
    getWorkspaceFolders() {
        return this.workspaceService.getWorkspace().folders;
    }
    getWorkspaceFolder(resource) {
        return this.workspaceService.getWorkspaceFolder(resource) ?? undefined;
    }
    onDidChangeWorkspaceFolders() {
        return Event.map(this.workspaceService.onDidChangeWorkspaceFolders, () => undefined);
    }
    async getWorkspaceFolderRoots(includeParents, logger) {
        const workspaceFolders = this.getWorkspaceFolders();
        if (includeParents) {
            const roots = new ResourceSet();
            const userHome = await this.pathService.userHome();
            for (const workspaceFolder of workspaceFolders) {
                roots.add(workspaceFolder.uri);
                // Walk up from the workspace folder to find the repository root
                // (.git folder). Only include parent folders if a repo root is
                // actually found; otherwise keep only the workspace folder.
                const parents = await this.findParentRepoFolders(workspaceFolder.uri, userHome, roots, logger);
                for (const parent of parents) {
                    roots.add(parent);
                }
            }
            return [...roots];
        }
        return workspaceFolders.map(f => f.uri);
    }
    /**
     * Walks up from {@link folderUri} collecting parent folders until a
     * repository root (a folder containing `.git`) is found.  Returns the
     * intermediate parent folders only when a repo root is found; returns
     * an empty array when the walk reaches the filesystem root, the user
     * home directory, or a folder already present in {@link seen}.
     */
    async findParentRepoFolders(folderUri, userHome, seen, logger) {
        const candidates = [];
        let current = folderUri;
        while (true) {
            try {
                const isRepoRoot = await this.fileService.exists(joinPath(current, '.git'));
                if (isRepoRoot) {
                    if ((await this.workspaceTrustManagementService.getUriTrustInfo(current)).trusted) {
                        candidates.push(current);
                        return candidates;
                    }
                    logger?.logInfo(`Repository root found at ${current.toString()}, but it is not trusted. Skipping parent folder inclusion for this workspace folder.`);
                    return []; // if the repo root isn't trusted, don't include it or any parents
                }
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                logger?.logInfo(`No repository root found for folder ${folderUri.toString()}. Error accessing ${joinPath(current, '.git')}: ${msg}.`);
                return []; // if we can't access the folder, return an empty list to avoid treating it as a non-repository when we might just have a permission issue
            }
            candidates.push(current);
            const parent = dirname(current);
            // Stop walking up when we reach a filesystem root (fixed-point
            // of dirname, e.g. '/' or a Windows drive root like 'D:\'),
            // the user home directory, or an already-seen folder.
            if (isEqual(current, parent) || current.path === '/' || isEqual(userHome, parent) || seen.has(parent)) {
                break;
            }
            current = parent;
        }
        // no repo found
        logger?.logInfo(`No repository root found for folder ${folderUri.toString()}.`);
        return [];
    }
    /**
     * List all prompt files from the filesystem.
     *
     * @returns List of prompt files found in the workspace.
     */
    async listFiles(type, storage, token) {
        if (storage !== PromptsStorage.user && storage !== PromptsStorage.local) {
            throw new Error(`Unsupported prompt file storage: ${storage}`);
        }
        const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
        const absoluteLocations = await this.toAbsoluteLocations(type, configuredLocations.filter(loc => loc.storage === storage));
        if (storage === PromptsStorage.user && (type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt)) {
            absoluteLocations.push(this.userDataFolder);
        }
        const paths = new ResourceSet();
        for (const { parent, filePattern } of absoluteLocations) {
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
    createFilesUpdatedEvent(type) {
        const disposables = new DisposableStore();
        const eventEmitter = disposables.add(new Emitter());
        const token = disposables.add(new CancellationTokenSource()).token; // track the disposal of the event listeners so we can cancel any in-flight async operations when the event is disposed
        const externalFolderWatchers = disposables.add(new DisposableStore());
        const key = getPromptFileLocationsConfigKey(type);
        const userDataFolder = this.userDataService.currentProfile.promptsHome;
        let parentFolders = [];
        const updateExternalFolderWatchers = () => {
            externalFolderWatchers.clear();
            for (const folder of parentFolders) {
                if (!this.getWorkspaceFolder(folder.parent)) {
                    // if the folder is not part of the workspace, we need to watch it
                    const recursive = folder.filePattern !== undefined || type === PromptsType.instructions; // instructions can be in subfolders, so watch recursively
                    externalFolderWatchers.add(this.fileService.watch(folder.parent, { recursive, excludes: [] }));
                }
            }
        };
        const update = async () => {
            try {
                const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
                parentFolders = await this.toAbsoluteLocations(type, configuredLocations, undefined);
                if (token.isCancellationRequested) {
                    return;
                }
                updateExternalFolderWatchers();
            }
            catch (err) {
                this.logService.error(`Error updating prompt file watchers after config change:`, err);
            }
        };
        disposables.add(this.configService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(key) || e.affectsConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS)) {
                void update();
                eventEmitter.fire();
            }
        }));
        disposables.add(this.onDidChangeWorkspaceFolders()(() => {
            void update();
            eventEmitter.fire();
        }));
        disposables.add(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
            void update();
            eventEmitter.fire();
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
        }));
        disposables.add(this.fileService.watch(userDataFolder));
        void update();
        return { event: eventEmitter.event, dispose: () => disposables.dispose() };
    }
    /**
     * Gets the hook source folders for creating new hooks.
     * Returns folders from config, excluding user storage and Claude paths (which are read-only).
     */
    async getHookSourceFolders() {
        const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, PromptsType.hook);
        // Ignore claude folders since they aren't first-class supported, so we don't want to create invalid formats
        // Check for .claude as an actual path segment (starts with ".claude/" or contains "/.claude/")
        const allowedHookFolders = configuredLocations.filter(loc => !loc.path.startsWith('.claude/') && !loc.path.includes('/.claude/'));
        // Convert to absolute URIs
        const result = new ResourceSet();
        const absoluteLocations = await this.toAbsoluteLocations(PromptsType.hook, allowedHookFolders);
        for (const location of absoluteLocations) {
            // For hook configs, entries are directories unless the path ends with .json (specific file)
            // Default entries have filePattern, user entries don't but are still directories
            // location.parent points to the directory in both cases, so we can just use that
            result.add(location.parent);
        }
        return [...result];
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
    async getConfigBasedSourceFolders(type) {
        const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
        const absoluteLocations = await this.toAbsoluteLocations(type, configuredLocations);
        // For anything that doesn't support glob patterns, we can return
        if (type !== PromptsType.prompt && type !== PromptsType.instructions) {
            return absoluteLocations.map(l => l.uri);
        }
        // locations in the settings can contain glob patterns so we need
        // to process them to get "clean" paths; the goal here is to have
        // a list of unambiguous folder paths where prompt files are stored
        const result = new ResourceSet();
        for (const absoluteLocation of absoluteLocations) {
            let location = absoluteLocation.uri;
            const baseName = basename(location);
            // if a path ends with a well-known "any file" pattern, remove
            // it so we can get the dirname path of that setting value
            const filePatterns = ['*.md', `*${getPromptFileExtension(type)}`];
            for (const filePattern of filePatterns) {
                if (baseName === filePattern) {
                    location = dirname(location);
                    continue;
                }
            }
            // likewise, if the pattern ends with single `*` (any file name)
            // remove it to get the dirname path of the setting value
            if (baseName === '*') {
                location = dirname(location);
            }
            // if after replacing the "file name" glob pattern, the path
            // still contains a glob pattern, then ignore the path
            if (isValidGlob(location.path) === true) {
                continue;
            }
            result.add(location);
        }
        return [...result];
    }
    /**
     * Gets all resolved source folders for the given prompt type with metadata.
     * This method merges configured locations with default locations and resolves them
     * to absolute paths, including displayPath and isDefault information.
     *
     * The returned order prefers workspace (local) folders first, then user folders.
     * This is used for UX like the "Create Prompt" command where workspace is preferred.
     *
     * @param type The type of prompt files.
     * @returns List of resolved source folders with metadata.
     */
    async getResolvedSourceFolders(type) {
        const absoluteLocations = await this.getLocalStorageFolders(type);
        const localFolders = absoluteLocations.filter(loc => loc.storage === PromptsStorage.local);
        const userFolders = absoluteLocations.filter(loc => loc.storage === PromptsStorage.user);
        return this.dedupeSourceFolders([...localFolders, ...userFolders]);
    }
    /**
     * Gets all resolved source folders in the same order that file discovery
     * searches them (user folders first, then local/workspace folders).
     * This matches the order used by {@link listFiles} and should be used
     * for debug/diagnostic output so the displayed order is accurate.
     */
    async getSourceFoldersInDiscoveryOrder(type) {
        const absoluteLocations = await this.getLocalStorageFolders(type);
        const userFolders = absoluteLocations.filter(loc => loc.storage === PromptsStorage.user);
        const localFolders = absoluteLocations.filter(loc => loc.storage === PromptsStorage.local);
        return this.dedupeSourceFolders([...userFolders, ...localFolders]);
    }
    /**
     * Gets all local (workspace) storage folders for the given prompt type.
     * This merges default folders with configured locations.
     */
    async getLocalStorageFolders(type) {
        const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
        const defaultFolders = getPromptFileDefaultLocations(type);
        // Merge default folders with configured locations, avoiding duplicates
        const allFolders = [
            ...defaultFolders,
            ...configuredLocations.filter(loc => !defaultFolders.some(df => df.path === loc.path))
        ];
        const absoluteLocations = await this.toAbsoluteLocations(type, allFolders, defaultFolders);
        if (type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt) {
            absoluteLocations.push(this.userDataFolder);
        }
        return absoluteLocations;
    }
    /**
     * Deduplicates source folders by URI.
     */
    dedupeSourceFolders(folders) {
        const seen = new ResourceSet();
        const result = [];
        for (const folder of folders) {
            if (!seen.has(folder.uri)) {
                seen.add(folder.uri);
                result.push(folder);
            }
        }
        return result;
    }
    /**
     * Converts locations defined in `settings` to absolute filesystem path URIs with metadata.
     * This conversion is needed because locations in settings can be relative,
     * hence we need to resolve them based on the current workspace folders.
     * If userHome is provided, paths starting with `~` will be expanded. Otherwise these paths are ignored.
     * Preserves the type and location properties from the source folder definitions.
     */
    async toAbsoluteLocations(type, configuredLocations, defaultLocations) {
        const result = [];
        const seen = new ResourceSet();
        const userHome = await this.pathService.userHome();
        const rootFolders = await this.getWorkspaceFolderRoots(this.configService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true);
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
                    }
                    else if (type === PromptsType.instructions) {
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
                    const uri = joinPath(userHome, configuredLocation.substring(2));
                    if (!seen.has(uri)) {
                        seen.add(uri);
                        const { parent, filePattern } = getParentFolder(type, uri);
                        result.push({ uri, parent, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
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
                        const { parent, filePattern } = getParentFolder(type, uri);
                        result.push({ uri, parent, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
                    }
                }
                else {
                    for (const folder of rootFolders) {
                        const absolutePath = joinPath(folder, configuredLocation);
                        if (!seen.has(absolutePath)) {
                            seen.add(absolutePath);
                            const { parent, filePattern } = getParentFolder(type, absolutePath);
                            result.push({ uri: absolutePath, parent, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
                        }
                    }
                }
            }
            catch (error) {
                this.logService.error(`Failed to resolve prompt file location: ${configuredLocation}`, error);
            }
        }
        return result;
    }
    /**
     * Uses the file service to resolve the provided location and return either the file at the location of files in the directory.
     * For instruction folders, this searches recursively (up to {@link MAX_INSTRUCTIONS_RECURSION_DEPTH} levels deep) provided
     * the location is not a workspace folder root and does not contain wildcards, to support subdirectories while avoiding
     * accidentally broad traversal.
     */
    async resolveFilesAtLocation(location, type, token, depth = 0) {
        if (type === PromptsType.skill) {
            return this.findAgentSkillsInFolder(location, token);
        }
        // Recurse into subdirectories for instruction folders, but only if:
        // - the location is not a workspace folder root (to avoid full workspace traversal)
        // - the path does not contain wildcards (already filtered upstream, but guard here too)
        // - the recursion depth hasn't exceeded the limit
        const isWorkspaceRoot = depth === 0 && this.getWorkspaceFolders().some(f => isEqual(f.uri, location));
        const recursive = type === PromptsType.instructions
            && !isWorkspaceRoot
            && !hasGlobPattern(location.path)
            && depth < MAX_INSTRUCTIONS_RECURSION_DEPTH;
        try {
            const info = await this.fileService.resolve(location);
            if (token.isCancellationRequested) {
                return [];
            }
            if (info.isFile) {
                return [info.resource];
            }
            else if (info.isDirectory && info.children) {
                const result = [];
                for (const child of info.children) {
                    if (child.isFile) {
                        result.push(child.resource);
                    }
                    else if (recursive && child.isDirectory) {
                        // Recursively search subdirectories for instructions
                        const subFiles = await this.resolveFilesAtLocation(child.resource, type, token, depth + 1);
                        result.push(...subFiles);
                    }
                }
                return result;
            }
        }
        catch (e) {
            if (e instanceof FileOperationError && e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                // ignore
            }
            else {
                this.logService.error(`Failed to resolve files at location: ${location.toString()}`, e);
            }
        }
        return [];
    }
    /**
     * Uses the search service to find all files at the provided location.
     * Requires a FileSearchProvider to be available for the folder's scheme.
     */
    async searchFilesInLocation(folder, filePattern, token) {
        // Check if a FileSearchProvider is available for this scheme
        if (!this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
            this.logService.warn(`[PromptFilesLocator] No FileSearchProvider available for scheme '${folder.scheme}'. Cannot search for pattern '${filePattern}' in ${folder.toString()}`);
            return [];
        }
        const disregardIgnoreFiles = this.configService.getValue('explorer.excludeGitIgnore');
        const workspaceRoot = this.getWorkspaceFolder(folder);
        const getExcludePattern = (folder) => getExcludes(this.configService.getValue({ resource: folder })) || {};
        const searchOptions = {
            folderQueries: [{ folder, disregardIgnoreFiles }],
            type: 1 /* QueryType.File */,
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
        }
        catch (e) {
            if (!isCancellationError(e)) {
                throw e;
            }
        }
        return [];
    }
    /**
     * Gets list of `AGENTS.md` files anywhere in the workspace.
     */
    async findAgentMDsInWorkspace(token) {
        const result = await Promise.all(this.getWorkspaceFolders().map(folder => this.findAgentMDsInFolder(folder.uri, token)));
        return result.flat(1);
    }
    async findAgentMDsInFolder(folder, token) {
        // Check if a FileSearchProvider is available for this scheme
        if (this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
            // Use the search service if a FileSearchProvider is available
            const disregardIgnoreFiles = this.configService.getValue('explorer.excludeGitIgnore');
            const getExcludePattern = (folder) => getExcludes(this.configService.getValue({ resource: folder })) || {};
            const searchOptions = {
                folderQueries: [{ folder, disregardIgnoreFiles }],
                type: 1 /* QueryType.File */,
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
                // Resolve real paths for duplicate detection
                const results = [];
                for (const r of searchResult.results) {
                    const realPath = undefined; // We can skip realpath resolution here for performance; duplicates can be handled later if needed
                    results.push({ uri: r.resource, realPath, type: AgentInstructionFileType.agentsMd });
                }
                return results;
            }
            catch (e) {
                if (!isCancellationError(e)) {
                    throw e;
                }
            }
            return [];
        }
        else {
            // Fallback to recursive traversal using file service
            return this.findAgentMDsUsingFileService(folder, token);
        }
    }
    /**
     * Recursively traverses a folder using the file service to find AGENTS.md files.
     * This is used as a fallback when no FileSearchProvider is available for the scheme.
     */
    async findAgentMDsUsingFileService(folder, token) {
        const result = [];
        const agentsMdFileName = 'agents.md';
        const traverse = async (uri) => {
            if (token.isCancellationRequested) {
                return;
            }
            try {
                const stat = await this.fileService.resolve(uri);
                if (stat.isFile && stat.name.toLowerCase() === agentsMdFileName) {
                    const realPath = stat.isSymbolicLink ? await this.fileService.realpath(stat.resource) : undefined;
                    result.push({ uri: stat.resource, realPath, type: AgentInstructionFileType.agentsMd });
                }
                else if (stat.isDirectory && stat.children) {
                    // Recursively traverse subdirectories
                    for (const child of stat.children) {
                        await traverse(child.resource);
                    }
                }
            }
            catch (error) {
                // Ignore errors for individual files/folders (e.g., permission denied)
                this.logService.trace(`[PromptFilesLocator] Error traversing ${uri.toString()}: ${error}`);
            }
        };
        await traverse(folder);
        return result;
    }
    async findFilesInRoots(roots, folder, paths, token, result = []) {
        const toResolve = roots.map(root => ({ resource: folder !== undefined ? joinPath(root, folder) : root }));
        const resolvedRoots = await this.fileService.resolveAll(toResolve);
        if (token.isCancellationRequested) {
            return result;
        }
        for (const root of resolvedRoots) {
            if (root.success && root.stat?.children) {
                for (const child of root.stat.children) {
                    if (child.isFile) {
                        const matchingPath = paths.find(p => equalsIgnoreCase(p.fileName, child.name));
                        if (matchingPath) {
                            const realPath = child.isSymbolicLink ? await this.fileService.realpath(child.resource) : undefined;
                            result.push({ uri: child.resource, realPath, type: matchingPath.type });
                        }
                    }
                }
            }
        }
        return result;
    }
    getAgentFileURIFromModeFile(oldURI) {
        if (oldURI.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
            let newLocation;
            const workspaceFolder = this.getWorkspaceFolder(oldURI);
            if (workspaceFolder) {
                newLocation = joinPath(workspaceFolder.uri, AGENTS_SOURCE_FOLDER, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
            }
            else if (isEqualOrParent(oldURI, this.userDataService.currentProfile.promptsHome)) {
                newLocation = joinPath(this.userDataService.currentProfile.promptsHome, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
            }
            return newLocation;
        }
        return undefined;
    }
    async findAgentSkillsInFolder(uri, token) {
        try {
            const result = [];
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
                    }
                    catch (error) {
                        // Ignore errors for individual files/folders (e.g., permission denied)
                    }
                }
            }
            return result;
        }
        catch (e) {
            if (!isCancellationError(e)) {
                this.logService.trace(`[PromptFilesLocator] Error searching for skills in ${uri.toString()}: ${e}`);
            }
            return [];
        }
    }
    /**
     * Searches for skills in all configured locations.
     */
    async findAgentSkills(token) {
        const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, PromptsType.skill);
        const absoluteLocations = await this.toAbsoluteLocations(PromptsType.skill, configuredLocations);
        const allResults = [];
        for (const { uri, source, storage } of absoluteLocations) {
            if (token.isCancellationRequested) {
                return [];
            }
            const results = await this.findAgentSkillsInFolder(uri, token);
            for (const skillUri of results) {
                allResults.push({ uri: skillUri, source, storage, type: PromptsType.skill });
            }
        }
        return allResults;
    }
};
PromptFilesLocator = __decorate([
    __param(0, IFileService),
    __param(1, IConfigurationService),
    __param(2, IWorkspaceContextService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, ISearchService),
    __param(5, IUserDataProfileService),
    __param(6, ILogService),
    __param(7, IPathService),
    __param(8, IWorkspaceTrustManagementService)
], PromptFilesLocator);
export { PromptFilesLocator };
/**
 * Checks if the provided path contains a glob pattern (* or **).
 * Used to detect deprecated glob usage in prompt file locations.
 *
 * @param path - path to check
 * @returns `true` if the path contains `*` or `**`, `false` otherwise
 */
export function hasGlobPattern(path) {
    return path.includes('*');
}
/**
 * Checks if the provided `pattern` could be a valid glob pattern.
 */
export function isValidGlob(pattern) {
    let squareBrackets = false;
    let squareBracketsCount = 0;
    let curlyBrackets = false;
    let curlyBracketsCount = 0;
    let previousCharacter;
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
 *     getParentFolder(PromptsType.prompt, URI.file('/home/user/{folder1,folder2}/file.md')),
 *     { parent: URI.file('/home/user'), filePattern: '{folder1,folder2}/file.md' },
 *     'Must find correct non-glob parent dirname.',
 * );
 * ```
 */
function getParentFolder(type, location) {
    if (type === PromptsType.hook && extname(location) === '.json') {
        location = dirname(location);
    }
    if (type !== PromptsType.instructions && type !== PromptsType.prompt) {
        // only instructions and prompts support glob patterns, so we can return the location as is
        return { parent: location };
    }
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
export function isValidPromptFolderPath(path) {
    return VALID_PROMPT_FOLDER_REGEX.test(path);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZXNMb2NhdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdEZpbGVzTG9jYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEtBQUssR0FBRyxNQUFNLDBCQUEwQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDekgsT0FBTyxFQUFFLCtCQUErQixFQUFFLFdBQVcsRUFBRSxhQUFhLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1SCxPQUFPLEVBQUUsd0JBQXdCLEVBQW9CLE1BQU0sMERBQTBELENBQUM7QUFDdEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHNCQUFzQixFQUFFLGlCQUFpQixFQUFFLDBCQUEwQixFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLDZCQUE2QixFQUFFLGNBQWMsRUFBb0QsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxUixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbEUsT0FBTyxF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