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
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../../base/common/json.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { basename, dirname, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { FileOperationError, IFileService } from '../../../../../../platform/files/common/files.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { PromptsConfig } from '../config/config.js';
import { AGENT_MD_FILENAME, CLAUDE_CONFIG_FOLDER, CLAUDE_LOCAL_MD_FILENAME, CLAUDE_MD_FILENAME, COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, getCleanPromptName, getSkillFolderName, GITHUB_CONFIG_FOLDER, isInClaudeRulesFolder } from '../config/promptFileLocations.js';
import { PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { evaluateApplyToPattern, PromptFileParser, PromptHeaderAttributes } from '../promptFileParser.js';
import { PromptsStorage, CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT, INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT, PROMPT_FILE_PROVIDER_ACTIVATION_EVENT, SKILL_PROVIDER_ACTIVATION_EVENT, AgentInstructionFileType } from './promptsService.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { parseSubagentHooksFromYaml } from '../hookSchema.js';
import { HookSourceFormat, parseHooksFromFile } from '../hookCompatibility.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { getTarget, mapClaudeModels, mapClaudeTools } from '../languageProviders/promptFileAttributes.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { getCanonicalPluginCommandId, IAgentPluginService } from '../../plugins/agentPluginService.js';
import { isContributionEnabled } from '../../enablement.js';
import { assertNever } from '../../../../../../base/common/assert.js';
/**
 * Error thrown when a skill file is missing the required name attribute.
 */
export class SkillMissingNameError extends Error {
    constructor(uri) {
        super('Skill file must have a name attribute');
        this.uri = uri;
    }
}
/**
 * Error thrown when a skill file is missing the required description attribute.
 */
export class SkillMissingDescriptionError extends Error {
    constructor(uri) {
        super('Skill file must have a description attribute');
        this.uri = uri;
    }
}
/**
 * Error thrown when a skill's name does not match its parent folder name.
 */
export class SkillNameMismatchError extends Error {
    constructor(uri, skillName, folderName) {
        super(`Skill name must match folder name: expected "${folderName}" but got "${skillName}"`);
        this.uri = uri;
        this.skillName = skillName;
        this.folderName = folderName;
    }
}
/**
 * Provides prompt services.
 */
let PromptsService = class PromptsService extends Disposable {
    constructor(logger, labelService, modelService, instantiationService, userDataService, configurationService, fileService, filesConfigService, storageService, extensionService, telemetryService, workspaceService, pathService, contextKeyService, agentPluginService, workspaceTrustService) {
        super();
        this.logger = logger;
        this.labelService = labelService;
        this.modelService = modelService;
        this.instantiationService = instantiationService;
        this.userDataService = userDataService;
        this.configurationService = configurationService;
        this.fileService = fileService;
        this.filesConfigService = filesConfigService;
        this.storageService = storageService;
        this.extensionService = extensionService;
        this.telemetryService = telemetryService;
        this.workspaceService = workspaceService;
        this.pathService = pathService;
        this.contextKeyService = contextKeyService;
        this.agentPluginService = agentPluginService;
        this.workspaceTrustService = workspaceTrustService;
        /**
         * Cache for parsed prompt files keyed by URI.
         * The number in the returned tuple is textModel.getVersionId(), which is an internal VS Code counter that increments every time the text model's content changes.
         */
        this.cachedParsedPromptFromModels = new ResourceMap();
        /**
         * Cached file locations commands. Caching only happens if the corresponding `fileLocatorEvents` event is used.
         */
        this.cachedFileLocations = {};
        /**
         * Lazily created events that notify listeners when the file locations for a given prompt type change.
         * An event is created on demand for each prompt type and can be used by consumers to react to updates
         * in the set of prompt files (e.g., when prompt files are added, removed, or modified).
         */
        this.fileLocatorEvents = {};
        /**
         * Contributed files from extensions keyed by prompt type then name.
         */
        this.contributedFiles = {
            [PromptsType.prompt]: new ResourceMap(),
            [PromptsType.instructions]: new ResourceMap(),
            [PromptsType.agent]: new ResourceMap(),
            [PromptsType.skill]: new ResourceMap(),
            [PromptsType.hook]: new ResourceMap(),
        };
        /**
         * Context keys referenced by contributed file `when` clauses.
         */
        this._contributedWhenKeys = new Set();
        this._contributedWhenClauses = new Map();
        this._onDidContributedWhenChange = this._register(new Emitter());
        this._onDidChangeInstructions = this._register(new Emitter());
        this._onDidPluginPromptFilesChange = this._register(new Emitter());
        this._onDidPluginHooksChange = this._register(new Emitter());
        this._pluginPromptFilesByType = new Map();
        /**
         * Registry of prompt file provider instances (custom agents, instructions, prompt files).
         * Extensions can register providers via the proposed API.
         */
        this.promptFileProviders = [];
        // --- Enabled Prompt Files -----------------------------------------------------------
        this.disabledPromptsStorageKeyPrefix = 'chat.disabledPromptFiles.';
        this.fileLocator = this.createPromptFilesLocator();
        this._register(this.modelService.onModelRemoved((model) => {
            this.cachedParsedPromptFromModels.delete(model.uri);
        }));
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(this._contributedWhenKeys)) {
                for (const type of Object.keys(this.cachedFileLocations)) {
                    this.cachedFileLocations[type] = undefined;
                }
                this._onDidContributedWhenChange.fire();
            }
        }));
        const modelChangeEvent = this._register(new ModelChangeTracker(this.modelService)).onDidPromptChange;
        this.cachedCustomAgents = this._register(new CachedPromise((token) => this.computeAgentDiscoveryInfo(token), () => Event.any(this.getFileLocatorEvent(PromptsType.agent), Event.filter(modelChangeEvent, e => e.promptType === PromptsType.agent), this._onDidContributedWhenChange.event, Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(PromptsConfig.USE_CUSTOM_AGENT_HOOKS)), this._onDidPluginPromptFilesChange.event)));
        this.cachedSlashCommands = this._register(new CachedPromise((token) => this.computeSlashCommandDiscoveryInfo(token), () => Event.any(this.getFileLocatorEvent(PromptsType.prompt), this.getFileLocatorEvent(PromptsType.skill), Event.filter(modelChangeEvent, e => e.promptType === PromptsType.prompt), Event.filter(modelChangeEvent, e => e.promptType === PromptsType.skill), this._onDidContributedWhenChange.event, this._onDidPluginPromptFilesChange.event)));
        this.cachedSkills = this._register(new CachedPromise((token) => this.computeSkillDiscovery(token), () => Event.any(this.getFileLocatorEvent(PromptsType.skill), Event.filter(modelChangeEvent, e => e.promptType === PromptsType.skill), this._onDidContributedWhenChange.event, this._onDidPluginPromptFilesChange.event)));
        this.cachedHooks = this._register(new CachedPromise((token) => this.computeHooks(token), () => Event.any(this.getFileLocatorEvent(PromptsType.hook), Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_HOOKS)), this._onDidPluginHooksChange.event, this.workspaceTrustService.onDidChangeTrust)));
        this.cachedInstructions = this._register(new CachedPromise((token) => this.computeInstructionFiles(token), () => Event.any(this.getFileLocatorEvent(PromptsType.instructions), this._onDidContributedWhenChange.event, this._onDidChangeInstructions.event, this._onDidPluginPromptFilesChange.event)));
        this._register(this.watchPluginPromptFilesForType(PromptsType.prompt, (plugin, reader) => plugin.commands.read(reader)));
        this._register(this.watchPluginPromptFilesForType(PromptsType.skill, (plugin, reader) => plugin.skills.read(reader)));
        this._register(this.watchPluginPromptFilesForType(PromptsType.agent, (plugin, reader) => plugin.agents.read(reader)));
        this._register(this.watchPluginPromptFilesForType(PromptsType.instructions, (plugin, reader) => plugin.instructions.read(reader)));
        this._register(autorun(reader => {
            const plugins = this.agentPluginService.plugins.read(reader);
            const hookFiles = [];
            for (const plugin of plugins) {
                if (isContributionEnabled(plugin.enablement.read(reader))) {
                    for (const hook of plugin.hooks.read(reader)) {
                        hookFiles.push({
                            uri: hook.uri,
                            storage: PromptsStorage.plugin,
                            type: PromptsType.hook,
                            name: getCanonicalPluginCommandId(plugin, hook.originalId),
                            pluginUri: plugin.uri,
                            source: PromptFileSource.Plugin,
                        });
                    }
                }
            }
            this._pluginPromptFilesByType.set(PromptsType.hook, hookFiles);
            this.cachedFileLocations[PromptsType.hook] = undefined;
            this._onDidPluginHooksChange.fire();
        }));
    }
    watchPluginPromptFilesForType(type, getItems) {
        return autorun(reader => {
            const plugins = this.agentPluginService.plugins.read(reader);
            const nextFiles = [];
            for (const plugin of plugins) {
                if (!isContributionEnabled(plugin.enablement.read(reader))) {
                    continue;
                }
                for (const item of getItems(plugin, reader)) {
                    nextFiles.push({
                        uri: item.uri,
                        storage: PromptsStorage.plugin,
                        type,
                        name: getCanonicalPluginCommandId(plugin, item.name),
                        pluginUri: plugin.uri,
                        source: PromptFileSource.Plugin,
                    });
                }
            }
            nextFiles.sort((a, b) => `${a.name ?? ''}|${a.uri.toString()}`.localeCompare(`${b.name ?? ''}|${b.uri.toString()}`));
            this._pluginPromptFilesByType.set(type, nextFiles);
            this.cachedFileLocations[type] = undefined;
            this._onDidPluginPromptFilesChange.fire();
        });
    }
    createPromptFilesLocator() {
        return this.instantiationService.createInstance(PromptFilesLocator);
    }
    getFileLocatorEvent(type) {
        let event = this.fileLocatorEvents[type];
        if (!event) {
            event = this.fileLocatorEvents[type] = this._register(this.fileLocator.createFilesUpdatedEvent(type)).event;
            this._register(event(() => {
                this.cachedFileLocations[type] = undefined;
            }));
        }
        return event;
    }
    getParsedPromptFile(textModel) {
        const cached = this.cachedParsedPromptFromModels.get(textModel.uri);
        if (cached && cached[0] === textModel.getVersionId()) {
            return cached[1];
        }
        const ast = new PromptFileParser().parse(textModel.uri, textModel.getValue());
        if (!cached || cached[0] < textModel.getVersionId()) {
            this.cachedParsedPromptFromModels.set(textModel.uri, [textModel.getVersionId(), ast]);
        }
        return ast;
    }
    async listPromptFiles(type, token) {
        let listPromise = this.cachedFileLocations[type];
        if (!listPromise) {
            listPromise = this.computeListPromptFiles(type, token);
            if (!this.fileLocatorEvents[type]) {
                return listPromise;
            }
            this.cachedFileLocations[type] = listPromise;
            return listPromise;
        }
        return listPromise;
    }
    async computeListPromptFiles(type, token) {
        const prompts = await Promise.all([
            this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type }))),
            this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type }))),
            this.getExtensionPromptFiles(type, token),
            this._pluginPromptFilesByType.get(type) ?? [],
        ]);
        return prompts.flat();
    }
    /**
     * Collects diagnostic information about which source folders were searched for display in the debug panel.
     */
    async _collectSourceFolderDiagnostics(type) {
        const resolvedFolders = await this.fileLocator.getSourceFoldersInDiscoveryOrder(type);
        return resolvedFolders.map(folder => ({
            uri: folder.uri,
            storage: folder.storage,
        }));
    }
    /**
     * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
     * This will be called by the extension host bridge when
     * an extension registers a provider via vscode.chat.registerCustomAgentProvider(),
     * registerInstructionsProvider(), or registerPromptFileProvider().
     */
    registerPromptFileProvider(extension, type, provider) {
        const providerEntry = { extension, type, ...provider };
        this.promptFileProviders.push(providerEntry);
        const disposables = new DisposableStore();
        // Listen to provider change events to rerun computeListPromptFiles
        if (provider.onDidChangePromptFiles) {
            disposables.add(provider.onDidChangePromptFiles(() => {
                this.invalidatePromptFileCache(type);
            }));
        }
        // Invalidate cache when providers change
        this.invalidatePromptFileCache(type);
        disposables.add({
            dispose: () => {
                const index = this.promptFileProviders.findIndex((p) => p === providerEntry);
                if (index >= 0) {
                    this.promptFileProviders.splice(index, 1);
                    this.invalidatePromptFileCache(type);
                }
            }
        });
        return disposables;
    }
    invalidatePromptFileCache(type) {
        if (type === PromptsType.agent) {
            this.cachedFileLocations[PromptsType.agent] = undefined;
            this.cachedCustomAgents.refresh();
        }
        else if (type === PromptsType.instructions) {
            this.cachedFileLocations[PromptsType.instructions] = undefined;
            this._onDidChangeInstructions.fire();
        }
        else if (type === PromptsType.prompt) {
            this.cachedFileLocations[PromptsType.prompt] = undefined;
            this.cachedSlashCommands.refresh();
        }
        else if (type === PromptsType.skill) {
            this.cachedFileLocations[PromptsType.skill] = undefined;
            this.cachedSkills.refresh();
            this.cachedSlashCommands.refresh();
        }
    }
    /**
     * Shared helper to list prompt files from registered providers for a given type.
     */
    async listFromProviders(type, activationEvent, token) {
        const result = [];
        // Activate extensions that might provide files for this type
        await this.extensionService.activateByEvent(activationEvent);
        const providers = this.promptFileProviders.filter(p => p.type === type);
        if (providers.length === 0) {
            return result;
        }
        // Collect files from all providers
        for (const providerEntry of providers) {
            try {
                const files = await providerEntry.providePromptFiles({}, token);
                if (!files || token.isCancellationRequested) {
                    continue;
                }
                for (const file of files) {
                    try {
                        await this.filesConfigService.updateReadonly(file.uri, true);
                    }
                    catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        this.logger.error(`[listFromProviders] Failed to make file readonly: ${file.uri}`, msg);
                    }
                    result.push({
                        uri: file.uri,
                        storage: PromptsStorage.extension,
                        type,
                        extension: providerEntry.extension,
                        source: PromptFileSource.ExtensionAPI,
                        name: file.name,
                        description: file.description,
                    });
                }
            }
            catch (e) {
                this.logger.error(`[listFromProviders] Failed to get ${type} files from provider`, e instanceof Error ? e.message : String(e));
            }
        }
        return result;
    }
    async listPromptFilesForStorage(type, storage, token) {
        switch (storage) {
            case PromptsStorage.extension:
                return this.getExtensionPromptFiles(type, token);
            case PromptsStorage.local:
                return this.fileLocator.listFiles(type, PromptsStorage.local, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.local, type })));
            case PromptsStorage.user:
                return this.fileLocator.listFiles(type, PromptsStorage.user, token).then(uris => uris.map(uri => ({ uri, storage: PromptsStorage.user, type })));
            case PromptsStorage.plugin:
                return this._pluginPromptFilesByType.get(type) ?? [];
            default:
                throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
        }
    }
    async getExtensionPromptFiles(type, token) {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const settledResults = await Promise.allSettled(this.contributedFiles[type].values());
        const contributedFiles = settledResults
            .filter((result) => result.status === 'fulfilled')
            .map(result => result.value)
            .filter(file => {
            if (!file.when) {
                return true;
            }
            const expr = ContextKeyExpr.deserialize(file.when);
            if (!expr) {
                this.logger.warn(`[getExtensionPromptFiles] Ignoring contributed prompt file with invalid when clause: ${file.when}`);
                return false;
            }
            return this.contextKeyService.contextMatchesRules(expr);
        });
        const activationEvent = this.getProviderActivationEvent(type);
        if (!activationEvent) {
            // No provider activation event for this type (e.g., hooks)
            return contributedFiles;
        }
        const providerFiles = await this.listFromProviders(type, activationEvent, token);
        return [...contributedFiles, ...providerFiles];
    }
    getProviderActivationEvent(type) {
        switch (type) {
            case PromptsType.agent:
                return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
            case PromptsType.instructions:
                return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
            case PromptsType.prompt:
                return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
            case PromptsType.skill:
                return SKILL_PROVIDER_ACTIVATION_EVENT;
            case PromptsType.hook:
                return undefined; // hooks don't have extension providers
        }
    }
    async getSourceFolders(type) {
        const result = [];
        if (type === PromptsType.hook) {
            // For hooks, return the Copilot hooks folder for creating new hooks
            // (Claude paths are read-only and not included here)
            const hooksFolders = await this.fileLocator.getHookSourceFolders();
            for (const uri of hooksFolders) {
                result.push({ uri, storage: PromptsStorage.local, type });
            }
        }
        else {
            for (const uri of await this.fileLocator.getConfigBasedSourceFolders(type)) {
                result.push({ uri, storage: PromptsStorage.local, type });
            }
        }
        if (type !== PromptsType.skill && type !== PromptsType.hook) {
            // no user source folders for skills and hooks
            const userHome = this.userDataService.currentProfile.promptsHome;
            result.push({ uri: userHome, storage: PromptsStorage.user, type });
        }
        return result;
    }
    async getResolvedSourceFolders(type) {
        return this.fileLocator.getResolvedSourceFolders(type);
    }
    // slash prompt commands
    /**
     * Emitter for slash commands change events.
     */
    get onDidChangeSlashCommands() {
        return this.cachedSlashCommands.onDidChangePromise;
    }
    async getPromptSlashCommands(token) {
        const discoveryInfo = await this.cachedSlashCommands.get(token);
        const result = this.slashCommandsFromDiscoveryInfo(discoveryInfo);
        return result;
    }
    /**
     * Computes discovery info for slash commands, combining prompts and skills.
     */
    async computeSlashCommandDiscoveryInfo(token) {
        const stopWatch = StopWatch.create(true);
        const promptFiles = await this.listPromptFiles(PromptsType.prompt, token);
        const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
        const skills = useAgentSkills ? await this.listPromptFiles(PromptsType.skill, token) : [];
        const disabledSkills = this.getDisabledPromptFiles(PromptsType.skill);
        const slashCommandFiles = [
            ...promptFiles,
            ...skills.filter(s => !disabledSkills.has(s.uri)),
        ];
        const parseResults = await Promise.all(slashCommandFiles.map(async (promptPath) => {
            try {
                const parsedPromptFile = await this.parseNew(promptPath.uri, token);
                const rawName = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(promptPath.uri);
                // For plugin resources, ensure the canonical plugin prefix is always preserved even when the
                // file's frontmatter overrides the name.
                const name = promptPath.source === PromptFileSource.Plugin && promptPath.pluginUri
                    ? getCanonicalPluginCommandId({ uri: promptPath.pluginUri }, rawName)
                    : rawName;
                const description = parsedPromptFile?.header?.description ?? promptPath.description;
                const argumentHint = parsedPromptFile?.header?.argumentHint;
                const userInvocable = parsedPromptFile?.header?.userInvocable;
                return { status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, name, description), argumentHint, userInvocable };
            }
            catch (e) {
                this.logger.error(`[computeSlashCommandDiscoveryInfo] Failed to parse prompt file for slash command: ${promptPath.uri}`, e instanceof Error ? e.message : String(e));
                return { status: 'skipped', skipReason: 'parse-error', errorMessage: e instanceof Error ? e.message : String(e), promptPath };
            }
        }));
        const files = parseResults;
        const promptSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.prompt);
        const sourceFolders = [...promptSourceFolders];
        if (useAgentSkills) {
            const skillSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
            sourceFolders.push(...skillSourceFolders);
        }
        return { type: PromptsType.prompt, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
    }
    /**
     * Derives IChatPromptSlashCommand[] from cached discovery info.
     */
    slashCommandsFromDiscoveryInfo(discoveryInfo) {
        const result = [];
        const seen = new ResourceSet();
        for (const file of discoveryInfo.files) {
            if (file.status === 'loaded') {
                result.push(this.asChatPromptSlashCommand(file.argumentHint, file.userInvocable, file.promptPath));
                seen.add(file.promptPath.uri);
            }
        }
        // Include untitled prompt models not covered by discovery
        for (const model of this.modelService.getModels()) {
            if (model.getLanguageId() === PROMPT_LANGUAGE_ID && model.uri.scheme === Schemas.untitled && !seen.has(model.uri)) {
                const parsedPromptFile = this.getParsedPromptFile(model);
                const name = parsedPromptFile?.header?.name ?? getCleanPromptName(model.uri);
                const description = parsedPromptFile?.header?.description;
                result.push(this.asChatPromptSlashCommand(parsedPromptFile?.header?.argumentHint, parsedPromptFile?.header?.userInvocable, { uri: model.uri, storage: PromptsStorage.local, type: PromptsType.prompt, name, description }));
            }
        }
        return result;
    }
    isValidSlashCommandName(command) {
        return command.match(/^[\p{L}\d_\-\.:]+$/u) !== null;
    }
    async resolvePromptSlashCommand(name, token) {
        const commands = await this.getPromptSlashCommands(token);
        const command = commands.find(cmd => cmd.name === name);
        if (command) {
            return {
                ...command,
                parsedPromptFile: await this.parseNew(command.uri, token),
            };
        }
        return undefined;
    }
    asChatPromptSlashCommand(argumentHint, userInvocable, promptPath) {
        let name = promptPath.name ?? getCleanPromptName(promptPath.uri);
        name = name.replace(/[^\p{L}\d_\-\.:]+/gu, '-'); // replace spaces with dashes
        return {
            uri: promptPath.uri,
            name: name,
            source: promptPath.source,
            storage: promptPath.storage,
            type: promptPath.type,
            extension: promptPath.extension,
            pluginUri: promptPath.pluginUri,
            description: promptPath.description,
            argumentHint: argumentHint,
            userInvocable: userInvocable ?? true,
            when: undefined,
        };
    }
    async getPromptSlashCommandName(uri, token) {
        const slashCommands = await this.getPromptSlashCommands(token);
        const slashCommand = slashCommands.find(c => isEqual(c.uri, uri));
        if (!slashCommand) {
            return getCleanPromptName(uri);
        }
        return slashCommand.name;
    }
    // custom agents
    /**
     * Emitter for custom agents change events.
     */
    get onDidChangeCustomAgents() {
        return this.cachedCustomAgents.onDidChangePromise;
    }
    get onDidChangeInstructions() {
        return this.cachedInstructions.onDidChangePromise;
    }
    async getCustomAgents(token) {
        const discoveryInfo = await this.cachedCustomAgents.get(token);
        const result = this.agentsFromDiscoveryInfo(discoveryInfo);
        return result;
    }
    /**
     * Derives ICustomAgent[] from cached discovery info.
     */
    agentsFromDiscoveryInfo(discoveryInfo) {
        const result = [];
        for (const file of discoveryInfo.files) {
            if (file.status === 'loaded' && file.agent) {
                result.push(file.agent);
            }
        }
        return result;
    }
    async computeAgentDiscoveryInfo(token) {
        const stopWatch = StopWatch.create(true);
        const allAgentFiles = await this.listPromptFiles(PromptsType.agent, token);
        const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);
        // Get user home for tilde expansion in hook cwd paths
        const userHomeUri = await this.pathService.userHome();
        const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
        const defaultFolder = this.workspaceService.getWorkspace().folders[0];
        const files = await Promise.all(allAgentFiles.map(async (promptPath) => {
            const uri = promptPath.uri;
            if (disabledAgents.has(uri)) {
                return { status: 'skipped', skipReason: 'disabled', promptPath };
            }
            try {
                const ast = await this.parseNew(uri, token);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let metadata;
                if (ast.header) {
                    const advanced = ast.header.getAttribute(PromptHeaderAttributes.advancedOptions);
                    if (advanced && advanced.value.type === 'map') {
                        metadata = {};
                        for (const [key, value] of Object.entries(advanced.value)) {
                            if (value.type === 'scalar') {
                                metadata[key] = value;
                            }
                        }
                    }
                }
                const toolReferences = [];
                if (ast.body) {
                    const bodyOffset = ast.body.offset;
                    const bodyVarRefs = ast.body.variableReferences;
                    for (let i = bodyVarRefs.length - 1; i >= 0; i--) { // in reverse order
                        const { name, offset, fullLength } = bodyVarRefs[i];
                        const range = new OffsetRange(offset - bodyOffset, offset - bodyOffset + fullLength);
                        toolReferences.push({ name, range });
                    }
                }
                const agentInstructions = {
                    content: ast.body?.getContent() ?? '',
                    toolReferences,
                    metadata,
                };
                const name = ast.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
                const description = ast.header?.description ?? promptPath.description;
                const target = getTarget(PromptsType.agent, ast.header ?? uri);
                const source = IAgentSource.fromPromptPath(promptPath);
                if (!ast.header) {
                    const agent = { uri, name, agentInstructions, source, target, visibility: { userInvocable: true, agentInvocable: true } };
                    return { status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, name, description), agent };
                }
                const visibility = {
                    userInvocable: ast.header.userInvocable !== false,
                    agentInvocable: ast.header.infer !== undefined ? ast.header.infer === true : ast.header.disableModelInvocation !== true,
                };
                let model = ast.header.model;
                if (target === Target.Claude && model) {
                    model = mapClaudeModels(model);
                }
                let { tools, handOffs, argumentHint, agents } = ast.header;
                if (target === Target.Claude && tools) {
                    tools = mapClaudeTools(tools);
                }
                // Parse hooks from the frontmatter if present
                let hooks;
                const useCustomAgentHooks = this.configurationService.getValue(PromptsConfig.USE_CUSTOM_AGENT_HOOKS);
                const hooksRaw = ast.header.hooksRaw;
                if (useCustomAgentHooks && hooksRaw) {
                    const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(uri) ?? defaultFolder;
                    const workspaceRootUri = hookWorkspaceFolder?.uri;
                    hooks = parseSubagentHooksFromYaml(hooksRaw, workspaceRootUri, userHome, target);
                }
                const agent = { uri, name, description, model, tools, handOffs, argumentHint, target, visibility, agents, hooks, agentInstructions, source };
                return { status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, name, description), agent };
            }
            catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                if (error instanceof FileOperationError && error.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    this.logger.warn(`[computeAgentDiscoveryInfo] Skipping agent file that does not exist: ${uri}`, error.message);
                }
                else {
                    this.logger.error(`[computeAgentDiscoveryInfo] Failed to parse agent file: ${uri}`, error);
                }
                return {
                    status: 'skipped',
                    skipReason: 'parse-error',
                    errorMessage: error.message,
                    promptPath,
                };
            }
        }));
        const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.agent);
        return { type: PromptsType.agent, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
    }
    async parseNew(uri, token) {
        const model = this.modelService.getModel(uri);
        if (model) {
            return this.getParsedPromptFile(model);
        }
        const fileContent = await this.fileService.readFile(uri);
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }
        return new PromptFileParser().parse(uri, fileContent.value.toString());
    }
    registerContributedFile(type, uri, extension, name, description, when) {
        const bucket = this.contributedFiles[type];
        if (bucket.has(uri)) {
            // keep first registration per extension (handler filters duplicates per extension already)
            return Disposable.None;
        }
        const entryPromise = (async () => {
            // For skills, validate that the file follows the required structure
            if (type === PromptsType.skill) {
                try {
                    const validated = await this.validateAndSanitizeSkillFile(uri, CancellationToken.None);
                    name = validated.name;
                    description = validated.description;
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    this.logger.error(`[registerContributedFile] Extension '${extension.identifier.value}' failed to validate skill file: ${uri}`, msg);
                    throw e;
                }
            }
            try {
                await this.filesConfigService.updateReadonly(uri, true);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.logger.error(`[registerContributedFile] Failed to make prompt file readonly: ${uri}`, msg);
            }
            return { uri, name, description, when, storage: PromptsStorage.extension, type, extension, source: PromptFileSource.ExtensionContribution };
        })();
        bucket.set(uri, entryPromise);
        if (when) {
            this._contributedWhenClauses.set(`${type}/${uri.toString()}`, when);
        }
        const flushCachesIfRequired = () => {
            this._updateContributedWhenKeys();
            this.cachedFileLocations[type] = undefined;
            switch (type) {
                case PromptsType.agent:
                    this.cachedCustomAgents.refresh();
                    break;
                case PromptsType.prompt:
                    this.cachedSlashCommands.refresh();
                    break;
                case PromptsType.skill:
                    this.cachedSkills.refresh();
                    this.cachedSlashCommands.refresh();
                    break;
            }
        };
        flushCachesIfRequired();
        return {
            dispose: () => {
                bucket.delete(uri);
                this._contributedWhenClauses.delete(`${type}/${uri.toString()}`);
                flushCachesIfRequired();
            }
        };
    }
    _updateContributedWhenKeys() {
        this._contributedWhenKeys.clear();
        for (const whenClause of this._contributedWhenClauses.values()) {
            const expr = ContextKeyExpr.deserialize(whenClause);
            for (const key of expr?.keys() ?? []) {
                this._contributedWhenKeys.add(key);
            }
        }
    }
    getPromptLocationLabel(promptPath) {
        switch (promptPath.storage) {
            case PromptsStorage.local: return this.labelService.getUriLabel(dirname(promptPath.uri), { relative: true });
            case PromptsStorage.user: return localize('user-data-dir.capitalized', 'User Data');
            case PromptsStorage.extension: {
                return localize('extension.with.id', 'Extension: {0}', promptPath.extension.displayName ?? promptPath.extension.id);
            }
            case PromptsStorage.plugin: return localize('plugin.capitalized', 'Plugin');
            default: assertNever(promptPath, 'Unknown prompt storage type');
        }
    }
    async listNestedAgentMDs(token) {
        const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
        if (!useAgentMD) {
            return [];
        }
        const useNestedAgentMD = this.configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
        if (useNestedAgentMD) {
            return await this.fileLocator.findAgentMDsInWorkspace(token);
        }
        return [];
    }
    async listAgentInstructions(token, logger) {
        const resolvedAgentFiles = [];
        const promises = [];
        const includeParents = this.configurationService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
        const rootFolders = await this.fileLocator.getWorkspaceFolderRoots(includeParents, logger);
        const rootFiles = [];
        const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
        if (!useAgentMD) {
            logger?.logInfo('Agent MD files are disabled via configuration.');
        }
        else {
            rootFiles.push({ fileName: AGENT_MD_FILENAME, type: AgentInstructionFileType.agentsMd });
        }
        const useClaudeMD = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_MD);
        if (!useClaudeMD) {
            logger?.logInfo('Claude MD files are disabled via configuration.');
        }
        else {
            const claudeMdFile = { fileName: CLAUDE_MD_FILENAME, type: AgentInstructionFileType.claudeMd };
            rootFiles.push(claudeMdFile); // CLAUDE.md in workspace root
            rootFiles.push({ fileName: CLAUDE_LOCAL_MD_FILENAME, type: AgentInstructionFileType.claudeMd }); // CLAUDE.local.md in workspace root
            promises.push(this.fileLocator.findFilesInRoots(rootFolders, CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles)); // CLAUDE.md in .claude folder under workspace root
            promises.push(this.fileLocator.findFilesInRoots([await this.pathService.userHome()], CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles)); // CLAUDE.md in in ~/.claude folder
        }
        const useCopilotInstructionsFiles = this.configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
        if (!useCopilotInstructionsFiles) {
            logger?.logInfo('Copilot instructions files are disabled via configuration.');
        }
        else {
            const githubConfigFiles = [{ fileName: COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, type: AgentInstructionFileType.copilotInstructionsMd }];
            promises.push(this.fileLocator.findFilesInRoots(rootFolders, GITHUB_CONFIG_FOLDER, githubConfigFiles, token, resolvedAgentFiles));
        }
        promises.push(this.fileLocator.findFilesInRoots(rootFolders, undefined, rootFiles, token, resolvedAgentFiles));
        await Promise.all(promises);
        if (token.isCancellationRequested) {
            return [];
        }
        // first look at non-symlinked files, then add symlinks only if target not already included
        const seenFileURI = new ResourceSet();
        const symlinks = [];
        const result = [];
        const add = (file) => {
            if (file.realPath) {
                symlinks.push(file);
            }
            else {
                result.push(file);
                seenFileURI.add(file.uri);
            }
            return true;
        };
        resolvedAgentFiles.forEach(add);
        for (const symlink of symlinks) {
            if (seenFileURI.has(symlink.realPath)) {
                logger?.logInfo(`Skipping symlinked agent instructions file ${symlink.uri} as target already included: ${symlink.realPath}`);
            }
            else {
                result.push(symlink);
                seenFileURI.add(symlink.realPath);
            }
        }
        return result.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
    }
    getAgentFileURIFromModeFile(oldURI) {
        return this.fileLocator.getAgentFileURIFromModeFile(oldURI);
    }
    getDisabledPromptFiles(type) {
        // Migration: if disabled key absent but legacy enabled key present, convert once.
        const disabledKey = this.disabledPromptsStorageKeyPrefix + type;
        const value = this.storageService.get(disabledKey, 0 /* StorageScope.PROFILE */, '[]');
        const result = new ResourceSet();
        try {
            const arr = JSON.parse(value);
            if (Array.isArray(arr)) {
                for (const s of arr) {
                    try {
                        result.add(URI.revive(s));
                    }
                    catch {
                        // ignore
                    }
                }
            }
        }
        catch {
            // ignore invalid storage values
        }
        return result;
    }
    setDisabledPromptFiles(type, uris) {
        const disabled = Array.from(uris).map(uri => uri.toJSON());
        this.storageService.store(this.disabledPromptsStorageKeyPrefix + type, JSON.stringify(disabled), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        if (type === PromptsType.agent) {
            this.cachedCustomAgents.refresh();
        }
        else if (type === PromptsType.skill) {
            this.cachedSkills.refresh();
            this.cachedSlashCommands.refresh();
        }
    }
    // Agent skills
    sanitizeAgentSkillText(text) {
        // Remove XML tags
        return text.replace(/<[^>]+>/g, '');
    }
    /**
     * Validates and sanitizes a skill file. Throws an error if validation fails.
     * @returns The sanitized name and description
     */
    async validateAndSanitizeSkillFile(uri, token) {
        const parsedFile = await this.parseNew(uri, token);
        const name = parsedFile.header?.name;
        if (!name) {
            this.logger.error(`[validateAndSanitizeSkillFile] Agent skill file missing name attribute: ${uri}`);
            throw new SkillMissingNameError(uri);
        }
        const description = parsedFile.header?.description;
        if (!description) {
            this.logger.error(`[validateAndSanitizeSkillFile] Agent skill file missing description attribute: ${uri}`);
            throw new SkillMissingDescriptionError(uri);
        }
        // Sanitize the name first (remove XML tags and truncate)
        const sanitizedName = this.truncateAgentSkillName(name, uri);
        // Validate that the sanitized name matches the parent folder name (per agentskills.io specification)
        const folderName = getSkillFolderName(uri);
        if (sanitizedName !== folderName) {
            this.logger.error(`[validateAndSanitizeSkillFile] Agent skill name "${sanitizedName}" does not match folder name "${folderName}": ${uri}`);
            throw new SkillNameMismatchError(uri, sanitizedName, folderName);
        }
        const sanitizedDescription = this.truncateAgentSkillDescription(parsedFile.header?.description, uri);
        return { name: sanitizedName, description: sanitizedDescription };
    }
    truncateAgentSkillName(name, uri) {
        const MAX_NAME_LENGTH = 64;
        const sanitized = this.sanitizeAgentSkillText(name);
        if (sanitized !== name) {
            this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
        }
        if (sanitized.length > MAX_NAME_LENGTH) {
            this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
            return sanitized.substring(0, MAX_NAME_LENGTH);
        }
        return sanitized;
    }
    truncateAgentSkillDescription(description, uri) {
        if (!description) {
            return undefined;
        }
        const MAX_DESCRIPTION_LENGTH = 1024;
        const sanitized = this.sanitizeAgentSkillText(description);
        if (sanitized !== description) {
            this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
        }
        if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
            this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
            return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
        }
        return sanitized;
    }
    get onDidChangeSkills() {
        return this.cachedSkills.onDidChangePromise;
    }
    async findAgentSkills(token) {
        const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
        if (!useAgentSkills) {
            return undefined;
        }
        const discoveryInfo = await this.cachedSkills.get(token);
        const result = this.skillsFromDiscoveryInfo(discoveryInfo);
        return result;
    }
    /**
     * Derives IAgentSkill[] from cached discovery info.
     */
    skillsFromDiscoveryInfo(discoveryInfo) {
        const result = [];
        for (const file of discoveryInfo.files) {
            if (file.status === 'loaded' && file.promptPath.name) {
                const sanitizedDescription = this.truncateAgentSkillDescription(file.promptPath.description, file.promptPath.uri);
                result.push({
                    uri: file.promptPath.uri,
                    storage: file.promptPath.storage,
                    name: file.promptPath.name,
                    description: sanitizedDescription,
                    disableModelInvocation: file.disableModelInvocation ?? false,
                    userInvocable: file.userInvocable ?? true,
                    when: undefined,
                    pluginUri: file.promptPath.pluginUri,
                    extension: file.promptPath.extension,
                });
            }
        }
        return result;
    }
    /**
     * Computes the full skill discovery info, including source folders and telemetry.
     */
    async computeSkillDiscovery(token) {
        const stopWatch = StopWatch.create(true);
        const files = await this.computeSkillDiscoveryInfo(token);
        const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
        // Count by source for telemetry
        const skillsBySource = new Map();
        for (const file of files) {
            if (file.status === 'loaded' && file.promptPath.name) {
                const source = file.promptPath.source;
                if (source) {
                    skillsBySource.set(source, (skillsBySource.get(source) || 0) + 1);
                }
            }
        }
        // Count skip reasons for telemetry
        let skippedMissingName = 0;
        let skippedMissingDescription = 0;
        let skippedDuplicateName = 0;
        let skippedParseFailed = 0;
        let skippedNameMismatch = 0;
        for (const file of files) {
            if (file.status === 'skipped') {
                switch (file.skipReason) {
                    case 'missing-name':
                        skippedMissingName++;
                        break;
                    case 'missing-description':
                        skippedMissingDescription++;
                        break;
                    case 'duplicate-name':
                        skippedDuplicateName++;
                        break;
                    case 'name-mismatch':
                        skippedNameMismatch++;
                        break;
                    case 'parse-error':
                        skippedParseFailed++;
                        break;
                }
            }
        }
        const totalSkillsFound = files.filter(f => f.status === 'loaded' && f.promptPath.name).length;
        this.telemetryService.publicLog2('agentSkillsFound', {
            totalSkillsFound,
            claudePersonal: skillsBySource.get(PromptFileSource.ClaudePersonal) ?? 0,
            claudeWorkspace: skillsBySource.get(PromptFileSource.ClaudeWorkspace) ?? 0,
            copilotPersonal: skillsBySource.get(PromptFileSource.CopilotPersonal) ?? 0,
            githubWorkspace: skillsBySource.get(PromptFileSource.GitHubWorkspace) ?? 0,
            agentsPersonal: skillsBySource.get(PromptFileSource.AgentsPersonal) ?? 0,
            agentsWorkspace: skillsBySource.get(PromptFileSource.AgentsWorkspace) ?? 0,
            configWorkspace: skillsBySource.get(PromptFileSource.ConfigWorkspace) ?? 0,
            configPersonal: skillsBySource.get(PromptFileSource.ConfigPersonal) ?? 0,
            extensionContribution: skillsBySource.get(PromptFileSource.ExtensionContribution) ?? 0,
            extensionAPI: skillsBySource.get(PromptFileSource.ExtensionAPI) ?? 0,
            plugin: skillsBySource.get(PromptFileSource.Plugin) ?? 0,
            skippedDuplicateName,
            skippedMissingName,
            skippedMissingDescription,
            skippedNameMismatch,
            skippedParseFailed
        });
        return { type: PromptsType.skill, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
    }
    async getHooks(token) {
        const discoveryInfo = await this.cachedHooks.get(token);
        const result = discoveryInfo.hooksInfo;
        return result;
    }
    async getDiscoveryInfo(type, token) {
        switch (type) {
            case PromptsType.instructions:
                return this.cachedInstructions.get(token);
            case PromptsType.prompt:
                return this.cachedSlashCommands.get(token);
            case PromptsType.agent:
                return this.cachedCustomAgents.get(token);
            case PromptsType.skill:
                return this.cachedSkills.get(token);
            case PromptsType.hook:
                return this.cachedHooks.get(token);
        }
    }
    async getInstructionFiles(token) {
        const discoveryInfo = await this.cachedInstructions.get(token);
        const result = this.instructionsFromDiscoveryInfo(discoveryInfo);
        return result;
    }
    instructionsFromDiscoveryInfo(discoveryInfo) {
        const result = [];
        for (const file of discoveryInfo.files) {
            if (file.status === 'loaded' && file.promptPath.name) {
                result.push({
                    uri: file.promptPath.uri,
                    storage: file.promptPath.storage,
                    extension: file.promptPath.extension,
                    pluginUri: file.promptPath.pluginUri,
                    source: file.promptPath.source,
                    name: file.promptPath.name,
                    description: file.promptPath.description,
                    pattern: file.pattern,
                });
            }
        }
        return result;
    }
    withPromptPathMetadata(promptPath, name, description) {
        return { ...promptPath, name, description };
    }
    async computeInstructionFiles(token) {
        return await this.getInstructionsDiscoveryInfo(token);
    }
    async computeHooks(token) {
        const stopWatch = StopWatch.create(true);
        const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);
        if (!useChatHooks || !this.workspaceTrustService.isWorkspaceTrusted()) {
            const hookFiles = await this.listPromptFiles(PromptsType.hook, token);
            const skipReason = !useChatHooks ? 'disabled' : 'workspace-untrusted';
            const files = hookFiles.map(promptPath => ({
                status: 'skipped',
                skipReason,
                promptPath: this.withPromptPathMetadata(promptPath, basename(promptPath.uri), promptPath.description),
            }));
            const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.hook);
            return { type: PromptsType.hook, files, sourceFolders, hooksInfo: undefined, durationInMillis: stopWatch.elapsed() };
        }
        const useClaudeHooks = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_HOOKS);
        const hookFiles = await this.listPromptFiles(PromptsType.hook, token);
        this.logger.trace(`[PromptsService] Found ${hookFiles.length} hook file(s).`);
        // Get user home for tilde expansion
        const userHomeUri = await this.pathService.userHome();
        const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
        const defaultFolder = this.workspaceService.getWorkspace().folders[0];
        // Process each hook file in parallel
        const fileResults = await Promise.all(hookFiles.map(async (hookFile) => {
            const name = basename(hookFile.uri);
            // Plugins are handled separately down below because they do their own parsing+interpolation
            if (hookFile.storage === PromptsStorage.plugin) {
                return {
                    file: {
                        status: 'loaded',
                        promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
                    },
                };
            }
            try {
                const content = await this.fileService.readFile(hookFile.uri);
                const json = parseJSONC(content.value.toString());
                // Validate it's an object
                if (!json || typeof json !== 'object') {
                    return {
                        file: {
                            status: 'skipped',
                            skipReason: 'parse-error',
                            errorMessage: 'Invalid hooks file: must be a JSON object',
                            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
                        },
                    };
                }
                // Resolve the workspace folder that contains this hook file for cwd resolution,
                // falling back to the first workspace folder for user-level hooks outside the workspace
                const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(hookFile.uri) ?? defaultFolder;
                const workspaceRootUri = hookWorkspaceFolder?.uri;
                // Use format-aware parsing that handles Copilot and Claude formats
                const { format, hooks: parsedHooks, disabledAllHooks } = parseHooksFromFile(hookFile.uri, json, workspaceRootUri, userHome);
                // Skip files that have all hooks disabled
                if (disabledAllHooks) {
                    this.logger.trace(`[PromptsService] Skipping hook file with disableAllHooks: ${hookFile.uri}`);
                    return {
                        file: {
                            status: 'skipped',
                            skipReason: 'all-hooks-disabled',
                            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
                        },
                    };
                }
                // Skip Claude hooks when the setting is disabled (after parsing to check for commands)
                if (format === HookSourceFormat.Claude && useClaudeHooks === false) {
                    const hasAnyCommands = [...parsedHooks.values()].some(({ hooks: cmds }) => cmds.length > 0);
                    this.logger.trace(`[PromptsService] Skipping Claude hook file (disabled via setting): ${hookFile.uri}`);
                    return {
                        file: {
                            status: 'skipped',
                            skipReason: 'claude-hooks-disabled',
                            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
                        },
                        hasDisabledClaudeHooks: hasAnyCommands,
                    };
                }
                const hooks = new Map();
                for (const [hookType, { hooks: commands }] of parsedHooks) {
                    for (const command of commands) {
                        let bucket = hooks.get(hookType);
                        if (!bucket) {
                            bucket = [];
                            hooks.set(hookType, bucket);
                        }
                        bucket.push(command);
                        this.logger.trace(`[PromptsService] Collected ${hookType} hook from ${hookFile.uri} (format: ${format})`);
                    }
                }
                return {
                    file: { status: 'loaded', promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description) },
                    hooks,
                };
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                this.logger.warn(`[PromptsService] Failed to parse hook file: ${hookFile.uri}`, error);
                return {
                    file: {
                        status: 'skipped',
                        skipReason: 'parse-error',
                        errorMessage: msg,
                        promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description),
                    },
                };
            }
        }));
        // Merge results from parallel processing
        const files = [];
        let hasDisabledClaudeHooks = false;
        const collectedHooks = new Map();
        for (const { file, hooks, hasDisabledClaudeHooks: disabled } of fileResults) {
            if (file) {
                files.push(file);
            }
            if (disabled) {
                hasDisabledClaudeHooks = true;
            }
            if (hooks) {
                for (const [hookType, commands] of hooks) {
                    let bucket = collectedHooks.get(hookType);
                    if (!bucket) {
                        bucket = [];
                        collectedHooks.set(hookType, bucket);
                    }
                    bucket.push(...commands);
                }
            }
        }
        // Collect hooks from agent plugins
        const plugins = this.agentPluginService.plugins.get();
        for (const plugin of plugins) {
            if (!isContributionEnabled(plugin.enablement.get())) {
                continue;
            }
            for (const hook of plugin.hooks.get()) {
                let bucket = collectedHooks.get(hook.type);
                if (!bucket) {
                    bucket = [];
                    collectedHooks.set(hook.type, bucket);
                }
                bucket.push(...hook.hooks);
            }
        }
        const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.hook);
        // Check if any hooks were collected
        if (collectedHooks.size === 0) {
            this.logger.trace('[PromptsService] No valid hooks collected.');
            return { type: PromptsType.hook, files, sourceFolders, hooksInfo: undefined, durationInMillis: stopWatch.elapsed() };
        }
        // Build the result
        const result = Object.fromEntries(collectedHooks);
        this.logger.trace(`[PromptsService] Collected hooks: ${JSON.stringify(Object.keys(result))}`);
        return { type: PromptsType.hook, files, sourceFolders, hooksInfo: { hooks: result, hasDisabledClaudeHooks }, durationInMillis: stopWatch.elapsed() };
    }
    /**
     * Returns the discovery results for skill files.
     */
    async computeSkillDiscoveryInfo(token) {
        const files = [];
        const seenNames = new Set();
        const nameToUri = new Map();
        // Collect all skills with their metadata for sorting
        const allSkills = [];
        const discoveredSkills = await this.fileLocator.findAgentSkills(token);
        const extensionSkills = await this.getExtensionPromptFiles(PromptsType.skill, token);
        const pluginSkills = this._pluginPromptFilesByType.get(PromptsType.skill) ?? [];
        allSkills.push(...discoveredSkills, ...extensionSkills, ...pluginSkills);
        const getPriority = (skill) => {
            if (skill.storage === PromptsStorage.local) {
                return 0; // workspace
            }
            if (skill.storage === PromptsStorage.user) {
                return 1; // personal
            }
            if (skill.storage === PromptsStorage.plugin) {
                return 2; // plugin
            }
            if (skill.source === PromptFileSource.ExtensionAPI) {
                return 3;
            }
            if (skill.source === PromptFileSource.ExtensionContribution) {
                return 4;
            }
            return 5;
        };
        // Stable sort; we should keep order consistent to the order in the user's configuration object
        allSkills.sort((a, b) => getPriority(a) - getPriority(b));
        for (const skill of allSkills) {
            const uri = skill.uri;
            const promptPath = skill;
            try {
                const parsedFile = await this.parseNew(uri, token);
                const folderName = getSkillFolderName(uri);
                let name = parsedFile.header?.name;
                const description = parsedFile.header?.description;
                if (!name) {
                    this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
                    name = folderName;
                }
                let sanitizedName = this.truncateAgentSkillName(name, uri);
                if (sanitizedName !== folderName) {
                    this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
                    sanitizedName = folderName;
                }
                if (seenNames.has(sanitizedName)) {
                    this.logger.debug(`[computeSkillDiscoveryInfo] Skipping duplicate agent skill name: ${sanitizedName} at ${uri}`);
                    files.push({ status: 'skipped', skipReason: 'duplicate-name', duplicateOf: nameToUri.get(sanitizedName), promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description) });
                    continue;
                }
                seenNames.add(sanitizedName);
                nameToUri.set(sanitizedName, uri);
                const disableModelInvocation = parsedFile.header?.disableModelInvocation === true;
                const userInvocable = parsedFile.header?.userInvocable !== false;
                files.push({ status: 'loaded', promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description), disableModelInvocation, userInvocable });
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                this.logger.error(`[computeSkillDiscoveryInfo] Failed to validate Agent skill file: ${uri}`, msg);
                files.push({
                    status: 'skipped',
                    skipReason: 'parse-error',
                    errorMessage: msg,
                    promptPath,
                });
            }
        }
        return files;
    }
    async getInstructionsDiscoveryInfo(token) {
        const stopWatch = StopWatch.create(true);
        const files = [];
        const instructionsFiles = await this.listPromptFiles(PromptsType.instructions, token);
        for (const promptPath of instructionsFiles) {
            const uri = promptPath.uri;
            try {
                const parsedPromptFile = await this.parseNew(uri, token);
                const name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
                const description = parsedPromptFile?.header?.description ?? promptPath.description;
                const pattern = evaluateApplyToPattern(parsedPromptFile.header, isInClaudeRulesFolder(uri));
                files.push({
                    status: 'loaded',
                    pattern,
                    promptPath: this.withPromptPathMetadata(promptPath, name, description),
                });
            }
            catch (e) {
                files.push({
                    status: 'skipped',
                    skipReason: 'parse-error',
                    errorMessage: e instanceof Error ? e.message : String(e),
                    promptPath,
                });
            }
        }
        const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.instructions);
        return { type: PromptsType.instructions, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
    }
};
PromptsService = __decorate([
    __param(0, ILogService),
    __param(1, ILabelService),
    __param(2, IModelService),
    __param(3, IInstantiationService),
    __param(4, IUserDataProfileService),
    __param(5, IConfigurationService),
    __param(6, IFileService),
    __param(7, IFilesConfigurationService),
    __param(8, IStorageService),
    __param(9, IExtensionService),
    __param(10, ITelemetryService),
    __param(11, IWorkspaceContextService),
    __param(12, IPathService),
    __param(13, IContextKeyService),
    __param(14, IAgentPluginService),
    __param(15, IWorkspaceTrustManagementService)
], PromptsService);
export { PromptsService };
// helpers
class CachedPromise extends Disposable {
    constructor(computeFn, getEvent, delay = 0) {
        super();
        this.computeFn = computeFn;
        this.getEvent = getEvent;
        this.delay = delay;
        this.cachedPromise = undefined;
        this.onDidUpdatePromiseEmitter = this._register(new Emitter());
        const delayer = this._register(new Delayer(this.delay));
        this._register(this.getEvent()(() => {
            this.cachedPromise = undefined;
            delayer.trigger(() => this.onDidUpdatePromiseEmitter.fire());
        }));
    }
    get onDidChangePromise() {
        return this.onDidUpdatePromiseEmitter.event;
    }
    get(token) {
        if (this.cachedPromise !== undefined) {
            return this.cachedPromise;
        }
        const promise = this.computeFn(token).catch(err => {
            if (this.cachedPromise === promise) {
                this.cachedPromise = undefined;
            }
            throw err;
        });
        this.cachedPromise = promise;
        return promise;
    }
    refresh() {
        this.cachedPromise = undefined;
        this.onDidUpdatePromiseEmitter?.fire();
    }
}
class ModelChangeTracker extends Disposable {
    get onDidPromptChange() {
        return this.onDidPromptModelChange.event;
    }
    constructor(modelService) {
        super();
        this.listeners = new ResourceMap();
        this.onDidPromptModelChange = this._register(new Emitter());
        const onAdd = (model) => {
            const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
            if (promptType !== undefined) {
                this.listeners.set(model.uri, model.onDidChangeContent(() => this.onDidPromptModelChange.fire({ uri: model.uri, promptType })));
            }
            return promptType;
        };
        const onRemove = (languageId, uri) => {
            const promptType = getPromptsTypeForLanguageId(languageId);
            if (promptType !== undefined) {
                this.listeners.get(uri)?.dispose();
                this.listeners.delete(uri);
            }
            return promptType;
        };
        this._register(modelService.onModelAdded(model => onAdd(model)));
        this._register(modelService.onModelLanguageChanged(e => {
            const removedPromptType = onRemove(e.oldLanguageId, e.model.uri);
            const addedPromptType = onAdd(e.model);
            if (removedPromptType !== addedPromptType) {
                if (removedPromptType) {
                    this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: removedPromptType });
                }
                if (addedPromptType) {
                    this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: addedPromptType });
                }
            }
        }));
        this._register(modelService.onModelRemoved(model => onRemove(model.getLanguageId(), model.uri)));
    }
    dispose() {
        super.dispose();
        this.listeners.forEach(listener => listener.dispose());
        this.listeners.clear();
    }
}
var IAgentSource;
(function (IAgentSource) {
    function fromPromptPath(promptPath) {
        if (promptPath.storage === PromptsStorage.extension) {
            return {
                storage: PromptsStorage.extension,
                extensionId: promptPath.extension.identifier,
                type: promptPath.source
            };
        }
        else if (promptPath.storage === PromptsStorage.plugin) {
            return {
                storage: PromptsStorage.plugin,
                pluginUri: promptPath.pluginUri
            };
        }
        else {
            return {
                storage: promptPath.storage
            };
        }
    }
    IAgentSource.fromPromptPath = fromPromptPath;
})(IAgentSource || (IAgentSource = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1NlcnZpY2VJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFXLE1BQU0sNkNBQTZDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRXpGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENB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