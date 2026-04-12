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
import { match, splitGlobAware } from '../../../../../base/common/glob.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, isPromptFileVariableEntry, toPromptFileVariableEntry, toPromptTextVariableEntry, PromptFileVariableKind, toToolVariableEntry } from '../attachments/chatVariableEntries.js';
import { ILanguageModelToolsService, VSCodeToolReference } from '../tools/languageModelToolsService.js';
import { PromptsConfig } from './config/config.js';
import { isInClaudeAgentsFolder, isInClaudeRulesFolder, isPromptOrInstructionsFile } from './config/promptFileLocations.js';
import { AgentInstructionFileType, IPromptsService } from './service/promptsService.js';
import { AGENT_DEBUG_LOG_ENABLED_SETTING, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, TROUBLESHOOT_SKILL_PATH } from './promptTypes.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { ChatConfiguration, ChatModeKind, GeneralPurposeAgentName } from '../constants.js';
import { hash } from '../../../../../base/common/hash.js';
import { IAgentPluginService } from '../plugins/agentPluginService.js';
export function newInstructionsCollectionEvent() {
    return { applyingInstructionsCount: 0, referencedInstructionsCount: 0, agentInstructionsCount: 0, listedInstructionsCount: 0, totalInstructionsCount: 0, claudeRulesCount: 0, claudeMdCount: 0, claudeAgentsCount: 0 };
}
let ComputeAutomaticInstructions = class ComputeAutomaticInstructions {
    constructor(_modeKind, _enabledTools, _enabledSubagents, _promptsService, _logService, _labelService, _configurationService, _contextKeyService, _workspaceService, _fileService, _remoteAgentService, _telemetryService, _languageModelToolsService, _agentPluginService) {
        this._modeKind = _modeKind;
        this._enabledTools = _enabledTools;
        this._enabledSubagents = _enabledSubagents;
        this._promptsService = _promptsService;
        this._logService = _logService;
        this._labelService = _labelService;
        this._configurationService = _configurationService;
        this._contextKeyService = _contextKeyService;
        this._workspaceService = _workspaceService;
        this._fileService = _fileService;
        this._remoteAgentService = _remoteAgentService;
        this._telemetryService = _telemetryService;
        this._languageModelToolsService = _languageModelToolsService;
        this._agentPluginService = _agentPluginService;
        this._parseResults = new ResourceMap();
    }
    async _parseInstructionsFile(uri, token) {
        if (this._parseResults.has(uri)) {
            return this._parseResults.get(uri);
        }
        try {
            const result = await this._promptsService.parseNew(uri, token);
            this._parseResults.set(uri, result);
            return result;
        }
        catch (error) {
            this._logService.error(`[InstructionsContextComputer] Failed to parse instruction file: ${uri}`, error);
            return undefined;
        }
    }
    async collect(variables, token) {
        const instructionFiles = await this._promptsService.getInstructionFiles(token);
        this._logService.trace(`[InstructionsContextComputer] ${instructionFiles.length} instruction files available.`);
        const telemetryEvent = newInstructionsCollectionEvent();
        const context = this._getContext(variables);
        // find instructions where the `applyTo` matches the attached context
        await this.addApplyingInstructions(instructionFiles, context, variables, telemetryEvent, token);
        // add all instructions referenced by all instruction files that are in the context
        await this._addReferencedInstructions(variables, telemetryEvent, token);
        // get copilot instructions
        await this._addAgentInstructions(variables, telemetryEvent, token);
        const customizationsIndexVariable = await this._getCustomizationsIndex(instructionFiles, variables, telemetryEvent, token);
        if (customizationsIndexVariable) {
            variables.add(customizationsIndexVariable);
            telemetryEvent.listedInstructionsCount++;
        }
        this.sendTelemetry(telemetryEvent);
    }
    sendTelemetry(telemetryEvent) {
        // Emit telemetry
        telemetryEvent.totalInstructionsCount = telemetryEvent.agentInstructionsCount + telemetryEvent.referencedInstructionsCount + telemetryEvent.applyingInstructionsCount + telemetryEvent.listedInstructionsCount;
        this._telemetryService.publicLog2('instructionsCollected', telemetryEvent);
    }
    async _logSkillLoadedTelemetry(skills) {
        try {
            // Build map of plugin URI to plugin metadata for provenance
            const pluginByUri = new ResourceMap();
            const allPlugins = this._agentPluginService.plugins.get();
            for (const plugin of allPlugins) {
                pluginByUri.set(plugin.uri, plugin);
            }
            const hashOrEmpty = (value) => {
                return value !== undefined ? String(hash(value)) : '';
            };
            for (const skill of skills) {
                const skillPlugin = skill.pluginUri ? pluginByUri.get(skill.pluginUri) : undefined;
                this._telemetryService.publicLog2('skillLoadedIntoContext', {
                    skillNameHash: hashOrEmpty(skill.name),
                    skillStorage: skill.storage,
                    extensionIdHash: hashOrEmpty(skill.extension?.identifier.value),
                    extensionVersion: skill.extension?.version ?? '',
                    pluginNameHash: hashOrEmpty(skillPlugin?.label),
                    pluginVersion: skillPlugin?.fromMarketplace?.version ?? '',
                });
            }
        }
        catch (err) {
            this._logService.error('[InstructionsContextComputer] Failed to log skill telemetry', err);
        }
    }
    /** public for testing */
    async addApplyingInstructions(instructionFiles, context, variables, telemetryEvent, token) {
        const includeApplyingInstructions = this._configurationService.getValue(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS);
        if (!includeApplyingInstructions && this._modeKind !== ChatModeKind.Edit) {
            this._logService.trace(`[InstructionsContextComputer] includeApplyingInstructions is disabled and agent kind is not Edit. No applying instructions will be added.`);
            return;
        }
        for (const { uri, pattern } of instructionFiles) {
            if (token.isCancellationRequested) {
                return;
            }
            if (!pattern) {
                this._logService.trace(`[InstructionsContextComputer] No pattern (applyTo / paths) found: ${uri}`);
                continue;
            }
            const isClaudeRules = isInClaudeRulesFolder(uri);
            if (context.instructions.has(uri)) {
                // the instruction file is already part of the input or has already been processed
                this._logService.trace(`[InstructionsContextComputer] Skipping already processed instruction file: ${uri}`);
                continue;
            }
            const match = this._matches(context.files, pattern);
            if (match) {
                this._logService.trace(`[InstructionsContextComputer] Match for ${uri} with ${match.pattern}${match.file ? ` for file ${match.file}` : ''}`);
                const reason = !match.file ?
                    localize('instruction.file.reason.allFiles', 'Automatically attached as pattern is **') :
                    localize('instruction.file.reason.specificFile', 'Automatically attached as pattern {0} matches {1}', pattern, this._labelService.getUriLabel(match.file, { relative: true }));
                variables.add(toPromptFileVariableEntry(uri, PromptFileVariableKind.Instruction, reason, true));
                telemetryEvent.applyingInstructionsCount++;
                if (isClaudeRules) {
                    telemetryEvent.claudeRulesCount++;
                }
            }
            else {
                this._logService.trace(`[InstructionsContextComputer] No match for ${uri} with ${pattern}`);
            }
        }
    }
    _getContext(attachedContext) {
        const files = new ResourceSet();
        const instructions = new ResourceSet();
        for (const variable of attachedContext.asArray()) {
            if (isPromptFileVariableEntry(variable)) {
                instructions.add(variable.value);
            }
            else {
                const uri = IChatRequestVariableEntry.toUri(variable);
                if (uri) {
                    files.add(uri);
                }
            }
        }
        return { files, instructions };
    }
    async _addAgentInstructions(variables, telemetryEvent, token) {
        const logger = {
            logInfo: (message) => this._logService.trace(`[InstructionsContextComputer] ${message}`)
        };
        const allCandidates = await this._promptsService.listAgentInstructions(token, logger);
        const entries = new ChatRequestVariableSet();
        const copilotEntries = new ChatRequestVariableSet();
        for (const { uri, type } of allCandidates) {
            const varEntry = toPromptFileVariableEntry(uri, PromptFileVariableKind.Instruction, undefined, true);
            entries.add(varEntry);
            if (type === AgentInstructionFileType.copilotInstructionsMd) {
                copilotEntries.add(varEntry);
            }
            telemetryEvent.agentInstructionsCount++;
            if (type === AgentInstructionFileType.claudeMd) {
                telemetryEvent.claudeMdCount++;
            }
            logger.logInfo(`Agent instruction file added: ${uri.toString()}`);
        }
        // Process referenced instructions from copilot files (maintaining original behavior)
        if (copilotEntries.length > 0) {
            await this._addReferencedInstructions(copilotEntries, telemetryEvent, token);
            for (const entry of copilotEntries.asArray()) {
                variables.add(entry);
            }
        }
        for (const entry of entries.asArray()) {
            variables.add(entry);
        }
    }
    _matches(files, applyToPattern) {
        const patterns = splitGlobAware(applyToPattern, ',');
        const patterMatches = (pattern) => {
            pattern = pattern.trim();
            if (pattern.length === 0) {
                // if glob pattern is empty, skip it
                return undefined;
            }
            if (pattern === '**' || pattern === '**/*' || pattern === '*') {
                // if glob pattern is one of the special wildcard values,
                // add the instructions file event if no files are attached
                return { pattern };
            }
            if (!pattern.startsWith('/') && !pattern.startsWith('**/')) {
                // support relative glob patterns, e.g. `src/**/*.js`
                pattern = '**/' + pattern;
            }
            // match each attached file with each glob pattern and
            // add the instructions file if its rule matches the file
            for (const file of files) {
                // if the file is not a valid URI, skip it
                if (match(pattern, file.path, { ignoreCase: true })) {
                    return { pattern, file }; // return the matched pattern and file URI
                }
            }
            return undefined;
        };
        for (const pattern of patterns) {
            const matchResult = patterMatches(pattern);
            if (matchResult) {
                return matchResult; // return the first matched pattern and file URI
            }
        }
        return undefined;
    }
    _getTool(referenceName) {
        if (!this._enabledTools) {
            return undefined;
        }
        const tool = this._languageModelToolsService.getToolByName(referenceName);
        if (tool && this._enabledTools[tool.id]) {
            return { tool, variable: `#tool:${this._languageModelToolsService.getFullReferenceName(tool)}` };
        }
        return undefined;
    }
    async _getCustomizationsIndex(instructionFiles, _existingVariables, telemetryEvent, token) {
        const readTool = this._getTool('readFile');
        const runSubagentTool = this._getTool(VSCodeToolReference.runSubagent);
        const remoteEnv = await this._remoteAgentService.getEnvironment();
        const remoteOS = remoteEnv?.os;
        const filePath = (uri) => getFilePath(uri, remoteOS);
        const entries = [];
        if (readTool) {
            const searchNestedAgentMd = this._configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
            const agentsMdPromise = searchNestedAgentMd ? this._promptsService.listNestedAgentMDs(token) : Promise.resolve([]);
            entries.push('<instructions>');
            entries.push('Here is a list of instruction files that contain rules for working with this codebase.');
            entries.push('These files are important for understanding the codebase structure, conventions, and best practices.');
            entries.push('Please make sure to follow the rules specified in these files when working with the codebase.');
            entries.push(`If the file is not already available as attachment, use the ${readTool.variable} tool to acquire it.`);
            entries.push('Make sure to acquire the instructions before working with the codebase.');
            let hasContent = false;
            for (const { uri, description, pattern } of instructionFiles) {
                entries.push('<instruction>');
                if (description) {
                    entries.push(`<description>${description}</description>`);
                }
                entries.push(`<file>${filePath(uri)}</file>`);
                if (pattern) {
                    entries.push(`<applyTo>${pattern}</applyTo>`);
                }
                entries.push('</instruction>');
                hasContent = true;
            }
            const agentsMdFiles = await agentsMdPromise;
            for (const { uri } of agentsMdFiles) {
                const folderName = this._labelService.getUriLabel(dirname(uri), { relative: true });
                const description = folderName.trim().length === 0 ? localize('instruction.file.description.agentsmd.root', 'Instructions for the workspace') : localize('instruction.file.description.agentsmd.folder', 'Instructions for folder \'{0}\'', folderName);
                entries.push('<instruction>');
                entries.push(`<description>${description}</description>`);
                entries.push(`<file>${filePath(uri)}</file>`);
                entries.push('</instruction>');
                hasContent = true;
            }
            if (!hasContent) {
                entries.length = 0; // clear entries
            }
            else {
                entries.push('</instructions>', '', ''); // add trailing newline
            }
            const agentSkills = await this._promptsService.findAgentSkills(token);
            // Filter out skills with disableModelInvocation=true (they can only be triggered manually via /name)
            // Also filter by `when` clause using the scoped context key service
            // Also filter out the troubleshoot skill when the feature flags are disabled
            const isDebugLogEnabled = this._configurationService.getValue(AGENT_DEBUG_LOG_ENABLED_SETTING);
            const isFileLoggingEnabled = this._configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
            const modelInvocableSkills = agentSkills?.filter(skill => {
                if (skill.disableModelInvocation) {
                    return false;
                }
                if (skill.when && !this._contextKeyService.contextMatchesRules(skill.when)) {
                    return false;
                }
                if ((!isDebugLogEnabled || !isFileLoggingEnabled) && skill.uri.path.includes(TROUBLESHOOT_SKILL_PATH)) {
                    return false;
                }
                return true;
            });
            if (modelInvocableSkills && modelInvocableSkills.length > 0) {
                // Log per-skill telemetry for each skill loaded into context
                this._logSkillLoadedTelemetry(modelInvocableSkills);
                const useSkillAdherencePrompt = this._configurationService.getValue(PromptsConfig.USE_SKILL_ADHERENCE_PROMPT);
                entries.push('<skills>');
                if (useSkillAdherencePrompt) {
                    // Stronger skill adherence prompt for experimental feature
                    entries.push('Skills provide specialized capabilities, domain knowledge, and refined workflows for producing high-quality outputs. Each skill folder contains tested instructions for specific domains like testing strategies, API design, or performance optimization. Multiple skills can be combined when a task spans different domains.');
                    entries.push(`BLOCKING REQUIREMENT: When a skill applies to the user's request, you MUST load and read the SKILL.md file IMMEDIATELY as your first action, BEFORE generating any other response or taking action on the task. Use ${readTool.variable} to load the relevant skill(s).`);
                    entries.push('NEVER just mention or reference a skill in your response without actually reading it first. If a skill is relevant, load it before proceeding.');
                    entries.push('How to determine if a skill applies:');
                    entries.push('1. Review the available skills below and match their descriptions against the user\'s request');
                    entries.push('2. If any skill\'s domain overlaps with the task, load that skill immediately');
                    entries.push('3. When multiple skills apply (e.g., a flowchart in documentation), load all relevant skills');
                    entries.push('Examples:');
                    entries.push(`- "Help me write unit tests for this module" -> Load the testing skill via ${readTool.variable} FIRST, then proceed`);
                    entries.push(`- "Optimize this slow function" -> Load the performance-profiling skill via ${readTool.variable} FIRST, then proceed`);
                    entries.push(`- "Add a discount code field to checkout" -> Load both the checkout-flow and form-validation skills FIRST`);
                    entries.push('Available skills:');
                }
                else {
                    entries.push('Here is a list of skills that contain domain specific knowledge on a variety of topics.');
                    entries.push('Each skill comes with a description of the topic and a file path that contains the detailed instructions.');
                    entries.push(`When a user asks you to perform a task that falls within the domain of a skill, use the ${readTool.variable} tool to acquire the full instructions from the file URI.`);
                }
                for (const skill of modelInvocableSkills) {
                    entries.push('<skill>');
                    entries.push(`<name>${skill.name}</name>`);
                    if (skill.description) {
                        entries.push(`<description>${skill.description}</description>`);
                    }
                    entries.push(`<file>${filePath(skill.uri)}</file>`);
                    entries.push('</skill>');
                }
                entries.push('</skills>', '', ''); // add trailing newline
            }
        }
        if (runSubagentTool) {
            const generalPurposeAgentEnabled = !!this._configurationService.getValue(ChatConfiguration.GeneralPurposeAgentEnabled);
            const customAgentsEnabled = !!this._configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents);
            const canUseAgent = (() => {
                if (!this._enabledSubagents || this._enabledSubagents.includes('*')) {
                    return (agent) => agent.visibility.agentInvocable;
                }
                else {
                    const subagents = this._enabledSubagents;
                    return (agent) => subagents.includes(agent.name);
                }
            })();
            const agents = customAgentsEnabled ? await this._promptsService.getCustomAgents(token) : [];
            if (generalPurposeAgentEnabled || agents.length > 0) {
                entries.push('<agents>');
                entries.push('Here is a list of agents that can be used when running a subagent.');
                entries.push('Each agent has optionally a description with the agent\'s purpose and expertise. When asked to run a subagent, choose the most appropriate agent from this list.');
                entries.push(`Use the ${runSubagentTool.variable} tool with the agent name to run the subagent.`);
                if (generalPurposeAgentEnabled) {
                    // Built-in General Purpose agent, always available when experiment is on
                    entries.push('<agent>');
                    entries.push(`<name>${GeneralPurposeAgentName}</name>`);
                    entries.push(`<description>Full-capability agent for complex multi-step tasks requiring high-quality reasoning. Has access to the same tools and capabilities as the current agent and inherits the parent agent's model and system prompt. Use for tasks that don't fit a more specialized agent.</description>`);
                    entries.push('</agent>');
                }
                for (const agent of agents) {
                    if (canUseAgent(agent)) {
                        entries.push('<agent>');
                        entries.push(`<name>${agent.name}</name>`);
                        if (agent.description) {
                            entries.push(`<description>${agent.description}</description>`);
                        }
                        if (agent.argumentHint) {
                            entries.push(`<argumentHint>${agent.argumentHint}</argumentHint>`);
                        }
                        entries.push('</agent>');
                        if (isInClaudeAgentsFolder(agent.uri)) {
                            telemetryEvent.claudeAgentsCount++;
                        }
                    }
                }
                entries.push('</agents>', '', ''); // add trailing newline
            }
        }
        if (entries.length === 0) {
            return undefined;
        }
        const content = entries.join('\n');
        const toolReferences = [];
        const collectToolReference = (tool) => {
            if (tool) {
                let offset = content.indexOf(tool.variable);
                while (offset >= 0) {
                    toolReferences.push(toToolVariableEntry(tool.tool, new OffsetRange(offset, offset + tool.variable.length)));
                    offset = content.indexOf(tool.variable, offset + 1);
                }
            }
        };
        collectToolReference(readTool);
        collectToolReference(runSubagentTool);
        return toPromptTextVariableEntry(content, true, toolReferences);
    }
    async _addReferencedInstructions(attachedContext, telemetryEvent, token) {
        const includeReferencedInstructions = this._configurationService.getValue(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS);
        if (!includeReferencedInstructions && this._modeKind !== ChatModeKind.Edit) {
            this._logService.trace(`[InstructionsContextComputer] includeReferencedInstructions is disabled and agent kind is not Edit. No referenced instructions will be added.`);
            return;
        }
        const seen = new ResourceSet();
        const todo = [];
        for (const variable of attachedContext.asArray()) {
            if (isPromptFileVariableEntry(variable)) {
                if (!seen.has(variable.value)) {
                    todo.push(variable.value);
                    seen.add(variable.value);
                }
            }
        }
        let next = todo.pop();
        while (next) {
            const result = await this._parseInstructionsFile(next, token);
            if (result && result.body) {
                const refsToCheck = [];
                for (const ref of result.body.fileReferences) {
                    const url = result.body.resolveFilePath(ref.content);
                    if (url && !seen.has(url) && (isPromptOrInstructionsFile(url) || this._workspaceService.getWorkspaceFolder(url) !== undefined)) {
                        // only add references that are either prompt or instruction files or are part of the workspace
                        refsToCheck.push({ resource: url });
                        seen.add(url);
                    }
                }
                if (refsToCheck.length > 0) {
                    const stats = await this._fileService.resolveAll(refsToCheck);
                    for (let i = 0; i < stats.length; i++) {
                        const stat = stats[i];
                        const uri = refsToCheck[i].resource;
                        if (stat.success && stat.stat?.isFile) {
                            if (isPromptOrInstructionsFile(uri)) {
                                // only recursively parse instruction files
                                todo.push(uri);
                            }
                            const reason = localize('instruction.file.reason.referenced', 'Referenced by {0}', basename(next));
                            attachedContext.add(toPromptFileVariableEntry(uri, PromptFileVariableKind.InstructionReference, reason, true));
                            telemetryEvent.referencedInstructionsCount++;
                            this._logService.trace(`[InstructionsContextComputer] ${uri.toString()} added, referenced by ${next.toString()}`);
                        }
                    }
                }
            }
            next = todo.pop();
        }
    }
};
ComputeAutomaticInstructions = __decorate([
    __param(3, IPromptsService),
    __param(4, ILogService),
    __param(5, ILabelService),
    __param(6, IConfigurationService),
    __param(7, IContextKeyService),
    __param(8, IWorkspaceContextService),
    __param(9, IFileService),
    __param(10, IRemoteAgentService),
    __param(11, ITelemetryService),
    __param(12, ILanguageModelToolsService),
    __param(13, IAgentPluginService)
], ComputeAutomaticInstructions);
export { ComputeAutomaticInstructions };
export function getFilePath(uri, remoteOS) {
    if (uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote) {
        const fsPath = uri.fsPath;
        // uri.fsPath uses the local OS's path separators, but the path
        // may belong to a remote with a different OS. Normalize separators
        // to match the remote OS (idempotent when local and remote match).
        if (remoteOS !== undefined) {
            if (remoteOS === 1 /* OperatingSystem.Windows */) {
                return fsPath.replace(/\//g, '\\');
            }
            return fsPath.replace(/\\/g, '/');
        }
        return fsPath;
    }
    return uri.toString();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9jb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDakcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHlCQUF5QixFQUFFLHlCQUF5QixFQUFFLHlC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