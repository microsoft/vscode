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
import { isEmptyPattern, parse, splitGlobAware } from '../../../../../../base/common/glob.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { ChatMode, IChatModeService } from '../../chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../../constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService, SpecedToolAliases } from '../../tools/languageModelToolsService.js';
import { PromptsType, Target } from '../promptTypes.js';
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../promptFileParser.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptsService } from '../service/promptsService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { AGENTS_SOURCE_FOLDER, CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder, LEGACY_MODE_FILE_EXTENSION, VALID_SKILL_NAME_REGEX } from '../config/promptFileLocations.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { dirname } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { HOOKS_BY_TARGET } from '../hookTypes.js';
import { PromptsConfig } from '../config/config.js';
import { GithubPromptHeaderAttributes } from './promptFileAttributes.js';
export const MARKERS_OWNER_ID = 'prompts-diagnostics-provider';
let PromptValidator = class PromptValidator {
    constructor(languageModelsService, languageModelToolsService, chatModeService, fileService, labelService, promptsService, configurationService) {
        this.languageModelsService = languageModelsService;
        this.languageModelToolsService = languageModelToolsService;
        this.chatModeService = chatModeService;
        this.fileService = fileService;
        this.labelService = labelService;
        this.promptsService = promptsService;
        this.configurationService = configurationService;
    }
    async validate(promptAST, promptType, report) {
        promptAST.header?.errors.forEach(error => report(toMarker(error.message, error.range, MarkerSeverity.Error)));
        const target = getTarget(promptType, promptAST.header ?? promptAST.uri);
        await this.validateHeader(promptAST, promptType, target, report);
        await this.validateBody(promptAST, target, report);
        await this.validateFileName(promptAST, promptType, report);
        await this.validateSkillAttributes(promptAST, promptType, report);
    }
    async validateFileName(promptAST, promptType, report) {
        if (promptType === PromptsType.agent && promptAST.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
            const location = this.promptsService.getAgentFileURIFromModeFile(promptAST.uri);
            if (location && await this.fileService.canCreateFile(location)) {
                report(toMarker(localize('promptValidator.chatModesRenamedToAgents', "Chat modes have been renamed to agents. Please move this file to {0}", location.toString()), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
            }
            else {
                report(toMarker(localize('promptValidator.chatModesRenamedToAgentsNoMove', "Chat modes have been renamed to agents. Please move the file to {0}", AGENTS_SOURCE_FOLDER), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
            }
        }
    }
    async validateSkillAttributes(promptAST, promptType, report) {
        if (promptType !== PromptsType.skill) {
            return;
        }
        const nameAttribute = promptAST.header?.attributes.find(attr => attr.key === PromptHeaderAttributes.name);
        if (!nameAttribute) {
            report(toMarker(localize('promptValidator.skillNameMissing', "Skill must provide a name."), new Range(1, 1, 1, 4), MarkerSeverity.Error));
            return;
        }
        const descriptionAttribute = promptAST.header?.attributes.find(attr => attr.key === PromptHeaderAttributes.description);
        if (!descriptionAttribute) {
            report(toMarker(localize('promptValidator.skillDescriptionMissing', "Skill must provide a description."), new Range(1, 1, 1, 4), MarkerSeverity.Error));
            return;
        }
        if (nameAttribute.value.type === 'scalar') {
            const skillName = nameAttribute.value.value.trim();
            if (skillName.length > 0) {
                if (!VALID_SKILL_NAME_REGEX.test(skillName)) {
                    report(toMarker(localize('promptValidator.skillNameInvalidChars', "Skill name may only contain lowercase letters, numbers, and hyphens."), nameAttribute.value.range, MarkerSeverity.Error));
                }
                // Extract folder name from path (e.g., .github/skills/my-skill/SKILL.md -> my-skill)
                const pathParts = promptAST.uri.path.split('/');
                const skillIndex = pathParts.findIndex(part => part === 'SKILL.md');
                if (skillIndex > 0) {
                    const folderName = pathParts[skillIndex - 1];
                    if (folderName && skillName !== folderName) {
                        report(toMarker(localize('promptValidator.skillNameFolderMismatch', "The skill name '{0}' should match the folder name '{1}'.", skillName, folderName), nameAttribute.value.range, MarkerSeverity.Warning));
                    }
                }
            }
        }
    }
    async validateBody(promptAST, target, report) {
        const body = promptAST.body;
        if (!body) {
            return;
        }
        // Validate file references
        const fileReferenceChecks = [];
        for (const ref of body.fileReferences) {
            const resolved = body.resolveFilePath(ref.content);
            if (!resolved) {
                report(toMarker(localize('promptValidator.invalidFileReference', "Invalid file reference '{0}'.", ref.content), ref.range, MarkerSeverity.Warning));
                continue;
            }
            if (promptAST.uri.scheme === resolved.scheme) {
                // only validate if the link is in the file system of the prompt file
                fileReferenceChecks.push((async () => {
                    try {
                        const exists = await this.fileService.exists(resolved);
                        if (exists) {
                            return;
                        }
                    }
                    catch {
                    }
                    const loc = this.labelService.getUriLabel(resolved);
                    report(toMarker(localize('promptValidator.fileNotFound', "File '{0}' not found at '{1}'.", ref.content, loc), ref.range, MarkerSeverity.Warning));
                })());
            }
        }
        // Validate variable references (tool or toolset names)
        if (body.variableReferences.length && isVSCodeOrDefaultTarget(target)) {
            const headerTools = promptAST.header?.tools;
            const headerToolsMap = headerTools ? this.languageModelToolsService.toToolAndToolSetEnablementMap(headerTools, undefined) : undefined;
            const available = new Set(this.languageModelToolsService.getFullReferenceNames());
            const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
            for (const variable of body.variableReferences) {
                if (!available.has(variable.name)) {
                    if (deprecatedNames.has(variable.name)) {
                        const currentNames = deprecatedNames.get(variable.name);
                        if (currentNames && currentNames.size > 0) {
                            if (currentNames.size === 1) {
                                const newName = Array.from(currentNames)[0];
                                report(toMarker(localize('promptValidator.deprecatedVariableReference', "Tool or toolset '{0}' has been renamed, use '{1}' instead.", variable.name, newName), variable.range, MarkerSeverity.Info));
                            }
                            else {
                                const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(', ');
                                report(toMarker(localize('promptValidator.deprecatedVariableReferenceMultipleNames', "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", variable.name, newNames), variable.range, MarkerSeverity.Info));
                            }
                        }
                    }
                    else {
                        report(toMarker(localize('promptValidator.unknownVariableReference', "Unknown tool or toolset '{0}'.", variable.name), variable.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                    }
                }
                else if (headerToolsMap) {
                    const tool = this.languageModelToolsService.getToolByFullReferenceName(variable.name);
                    if (tool && headerToolsMap.get(tool) === false) {
                        report(toMarker(localize('promptValidator.disabledTool', "Tool or toolset '{0}' also needs to be enabled in the header.", variable.name), variable.range, MarkerSeverity.Warning));
                    }
                }
            }
        }
        await Promise.all(fileReferenceChecks);
    }
    async validateHeader(promptAST, promptType, target, report) {
        const header = promptAST.header;
        if (!header) {
            return;
        }
        const attributes = header.attributes;
        this.checkForInvalidArguments(attributes, promptType, target, report);
        this.validateName(attributes, report);
        this.validateDescription(attributes, report);
        this.validateArgumentHint(attributes, report);
        switch (promptType) {
            case PromptsType.prompt: {
                const agent = this.validateAgent(attributes, report);
                this.validateTools(attributes, agent?.kind ?? ChatModeKind.Agent, target, report);
                this.validateModel(attributes, agent?.kind ?? ChatModeKind.Agent, report);
                break;
            }
            case PromptsType.instructions:
                if (target === Target.Claude) {
                    this.validatePaths(attributes, report);
                }
                else {
                    this.validateApplyTo(attributes, report);
                }
                this.validateExcludeAgent(attributes, report);
                break;
            case PromptsType.agent: {
                this.validateTarget(attributes, report);
                this.validateInfer(attributes, report);
                this.validateUserInvocable(attributes, report);
                this.validateDisableModelInvocation(attributes, report);
                this.validateTools(attributes, ChatModeKind.Agent, target, report);
                if (this.configurationService.getValue(PromptsConfig.USE_CUSTOM_AGENT_HOOKS)) {
                    this.validateHooks(attributes, target, report);
                }
                if (isVSCodeOrDefaultTarget(target)) {
                    this.validateModel(attributes, ChatModeKind.Agent, report);
                    this.validateHandoffs(attributes, report);
                    await this.validateAgentsAttribute(attributes, header, report);
                    this.validateGithubPermissions(attributes, report);
                }
                else if (target === Target.Claude) {
                    this.validateClaudeAttributes(attributes, report);
                }
                else if (target === Target.GitHubCopilot) {
                    this.validateGithubPermissions(attributes, report);
                }
                break;
            }
            case PromptsType.skill:
                this.validateUserInvocable(attributes, report);
                this.validateDisableModelInvocation(attributes, report);
                break;
        }
    }
    checkForInvalidArguments(attributes, promptType, target, report) {
        let validAttributeNames = getValidAttributeNames(promptType, true, target);
        if (!this.configurationService.getValue(PromptsConfig.USE_CUSTOM_AGENT_HOOKS)) {
            validAttributeNames = validAttributeNames.filter(name => name !== PromptHeaderAttributes.hooks);
        }
        const useCustomAgentHooks = this.configurationService.getValue(PromptsConfig.USE_CUSTOM_AGENT_HOOKS);
        const validGithubCopilotAttributeNames = new Lazy(() => new Set(getValidAttributeNames(promptType, false, Target.GitHubCopilot)));
        for (const attribute of attributes) {
            if (!validAttributeNames.includes(attribute.key)) {
                const supportedNames = new Lazy(() => {
                    let names = getValidAttributeNames(promptType, false, target);
                    if (!useCustomAgentHooks) {
                        names = names.filter(name => name !== PromptHeaderAttributes.hooks);
                    }
                    return names.sort().join(', ');
                });
                switch (promptType) {
                    case PromptsType.prompt:
                        report(toMarker(localize('promptValidator.unknownAttribute.prompt', "Attribute '{0}' is not supported in prompt files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                        break;
                    case PromptsType.agent:
                        if (target === Target.GitHubCopilot) {
                            report(toMarker(localize('promptValidator.unknownAttribute.github-agent', "Attribute '{0}' is not supported in custom GitHub Copilot agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                        }
                        else if (target === Target.Claude) {
                            // ignore for now as we don't have a full list of supported attributes for claude target
                        }
                        else {
                            if (validGithubCopilotAttributeNames.value.has(attribute.key)) {
                                report(toMarker(localize('promptValidator.ignoredAttribute.vscode-agent', "Attribute '{0}' is ignored when running locally in VS Code.", attribute.key), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                            }
                            else {
                                report(toMarker(localize('promptValidator.unknownAttribute.vscode-agent', "Attribute '{0}' is not supported in VS Code agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                            }
                        }
                        break;
                    case PromptsType.instructions:
                        if (target === Target.Claude) {
                            report(toMarker(localize('promptValidator.unknownAttribute.rules', "Attribute '{0}' is not supported in rules files by VS Code agents. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                        }
                        else {
                            report(toMarker(localize('promptValidator.unknownAttribute.instructions', "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                        }
                        break;
                    case PromptsType.skill:
                        report(toMarker(localize('promptValidator.unknownAttribute.skill', "Attribute '{0}' is not supported by VS Code agents. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                        break;
                }
            }
        }
    }
    validateName(attributes, report) {
        const nameAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.name);
        if (!nameAttribute) {
            return;
        }
        if (nameAttribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.nameMustBeString', "The 'name' attribute must be a string."), nameAttribute.range, MarkerSeverity.Error));
            return;
        }
        if (nameAttribute.value.value.trim().length === 0) {
            report(toMarker(localize('promptValidator.nameShouldNotBeEmpty', "The 'name' attribute must not be empty."), nameAttribute.value.range, MarkerSeverity.Error));
            return;
        }
    }
    validateDescription(attributes, report) {
        const descriptionAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.description);
        if (!descriptionAttribute) {
            return;
        }
        if (descriptionAttribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.descriptionMustBeString', "The 'description' attribute must be a string."), descriptionAttribute.range, MarkerSeverity.Error));
            return;
        }
        if (descriptionAttribute.value.value.trim().length === 0) {
            report(toMarker(localize('promptValidator.descriptionShouldNotBeEmpty', "The 'description' attribute should not be empty."), descriptionAttribute.value.range, MarkerSeverity.Error));
            return;
        }
    }
    validateArgumentHint(attributes, report) {
        const argumentHintAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.argumentHint);
        if (!argumentHintAttribute) {
            return;
        }
        if (argumentHintAttribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.argumentHintMustBeString', "The 'argument-hint' attribute must be a string."), argumentHintAttribute.range, MarkerSeverity.Error));
            return;
        }
        if (argumentHintAttribute.value.value.trim().length === 0) {
            report(toMarker(localize('promptValidator.argumentHintShouldNotBeEmpty', "The 'argument-hint' attribute should not be empty."), argumentHintAttribute.value.range, MarkerSeverity.Warning));
            return;
        }
    }
    validateModel(attributes, agentKind, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.model);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'scalar' && attribute.value.type !== 'sequence') {
            report(toMarker(localize('promptValidator.modelMustBeStringOrArray', "The 'model' attribute must be a string or an array of strings."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        const modelNames = [];
        if (attribute.value.type === 'scalar') {
            const modelName = attribute.value.value.trim();
            if (modelName.length === 0) {
                report(toMarker(localize('promptValidator.modelMustBeNonEmpty', "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
                return;
            }
            modelNames.push([modelName, attribute.value.range]);
        }
        else if (attribute.value.type === 'sequence') {
            if (attribute.value.items.length === 0) {
                report(toMarker(localize('promptValidator.modelArrayMustNotBeEmpty', "The 'model' array must not be empty."), attribute.value.range, MarkerSeverity.Error));
                return;
            }
            for (const item of attribute.value.items) {
                if (item.type !== 'scalar') {
                    report(toMarker(localize('promptValidator.modelArrayMustContainStrings', "The 'model' array must contain only strings."), item.range, MarkerSeverity.Error));
                    return;
                }
                const modelName = item.value.trim();
                if (modelName.length === 0) {
                    report(toMarker(localize('promptValidator.modelArrayItemMustBeNonEmpty', "Model names in the array must be non-empty strings."), item.range, MarkerSeverity.Error));
                    return;
                }
                modelNames.push([modelName, item.range]);
            }
        }
        const languageModels = this.languageModelsService.getLanguageModelIds();
        if (languageModels.length === 0) {
            // likely the service is not initialized yet
            return;
        }
        for (const [modelName, range] of modelNames) {
            const modelMetadata = this.findModelByName(modelName);
            if (!modelMetadata) {
                report(toMarker(localize('promptValidator.modelNotFound', "Unknown model '{0}' will be ignored.", modelName), range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
            }
            else if (agentKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
                report(toMarker(localize('promptValidator.modelNotSuited', "Model '{0}' is not suited for agent mode.", modelName), range, MarkerSeverity.Warning));
            }
        }
    }
    validateClaudeAttributes(attributes, report) {
        // vaidate all claude-specific attributes that have enum values
        for (const claudeAttributeName in claudeAgentAttributes) {
            const claudeAttribute = claudeAgentAttributes[claudeAttributeName];
            const enumValues = claudeAttribute.enums;
            if (enumValues) {
                const attribute = attributes.find(attr => attr.key === claudeAttributeName);
                if (!attribute) {
                    continue;
                }
                if (attribute.value.type !== 'scalar') {
                    report(toMarker(localize('promptValidator.claude.attributeMustBeString', "The '{0}' attribute must be a string.", claudeAttributeName), attribute.value.range, MarkerSeverity.Error));
                    continue;
                }
                else {
                    const modelName = attribute.value.value.trim();
                    if (enumValues.every(model => model.name !== modelName)) {
                        const validValues = enumValues.map(model => model.name).join(', ');
                        report(toMarker(localize('promptValidator.claude.attributeNotFound', "Unknown value '{0}', valid: {1}.", modelName, validValues), attribute.value.range, MarkerSeverity.Warning));
                    }
                }
            }
        }
    }
    findModelByName(modelName) {
        const metadataAndId = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
        if (metadataAndId && metadataAndId.metadata.isUserSelectable !== false) {
            return metadataAndId.metadata;
        }
        return undefined;
    }
    validateAgent(attributes, report) {
        const agentAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agent);
        const modeAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.mode);
        if (modeAttribute) {
            if (agentAttribute) {
                report(toMarker(localize('promptValidator.modeDeprecated', "The 'mode' attribute has been deprecated. The 'agent' attribute is used instead."), modeAttribute.range, MarkerSeverity.Warning, [2 /* MarkerTag.Deprecated */]));
            }
            else {
                report(toMarker(localize('promptValidator.modeDeprecated.useAgent', "The 'mode' attribute has been deprecated. Please rename it to 'agent'."), modeAttribute.range, MarkerSeverity.Warning, [2 /* MarkerTag.Deprecated */]));
            }
        }
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agent) ?? modeAttribute;
        if (!attribute) {
            return undefined; // default agent for prompts is Agent
        }
        if (attribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.attributeMustBeString', "The '{0}' attribute must be a string.", attribute.key), attribute.value.range, MarkerSeverity.Error));
            return undefined;
        }
        const agentValue = attribute.value.value;
        if (agentValue.trim().length === 0) {
            report(toMarker(localize('promptValidator.attributeMustBeNonEmpty', "The '{0}' attribute must be a non-empty string.", attribute.key), attribute.value.range, MarkerSeverity.Error));
            return undefined;
        }
        return this.validateAgentValue(attribute.value, report);
    }
    validateAgentValue(value, report) {
        const agents = this.chatModeService.getModes();
        const availableAgents = [];
        // Check if agent exists in builtin or custom agents
        for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
            if (agent.name.get() === value.value) {
                return agent;
            }
            availableAgents.push(agent.name.get()); // collect all available agent names
        }
        const errorMessage = localize('promptValidator.agentNotFound', "Unknown agent '{0}'. Available agents: {1}.", value.value, availableAgents.join(', '));
        report(toMarker(errorMessage, value.range, MarkerSeverity.Warning));
        return undefined;
    }
    validateTools(attributes, agentKind, target, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.tools);
        if (!attribute) {
            return;
        }
        if (agentKind !== ChatModeKind.Agent) {
            report(toMarker(localize('promptValidator.toolsOnlyInAgent', "The 'tools' attribute is only supported when using agents. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));
        }
        let value = attribute.value;
        if (value.type === 'scalar') {
            value = parseCommaSeparatedList(value);
        }
        if (value.type !== 'sequence') {
            report(toMarker(localize('promptValidator.toolsMustBeArrayOrMap', "The 'tools' attribute must be an array or a comma separated string."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        if (target === Target.GitHubCopilot || target === Target.Claude) {
            // no validation for github-copilot target and claude
        }
        else {
            this.validateVSCodeTools(value, report);
        }
    }
    validateVSCodeTools(valueItem, report) {
        if (valueItem.items.length > 0) {
            const available = new Set(this.languageModelToolsService.getFullReferenceNames());
            const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
            for (const item of valueItem.items) {
                if (item.type !== 'scalar') {
                    report(toMarker(localize('promptValidator.eachToolMustBeString', "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
                }
                else if (item.value) {
                    if (!available.has(item.value)) {
                        const currentNames = deprecatedNames.get(item.value);
                        if (currentNames) {
                            if (currentNames?.size === 1) {
                                const newName = Array.from(currentNames)[0];
                                report(toMarker(localize('promptValidator.toolDeprecated', "Tool or toolset '{0}' has been renamed, use '{1}' instead.", item.value, newName), item.range, MarkerSeverity.Info, [2 /* MarkerTag.Deprecated */]));
                            }
                            else {
                                const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(', ');
                                report(toMarker(localize('promptValidator.toolDeprecatedMultipleNames', "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", item.value, newNames), item.range, MarkerSeverity.Info, [2 /* MarkerTag.Deprecated */]));
                            }
                        }
                        else {
                            report(toMarker(localize('promptValidator.toolNotFound', "Unknown tool '{0}' will be ignored.", item.value), item.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                        }
                    }
                }
            }
        }
    }
    validateApplyTo(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.applyTo);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.applyToMustBeString', "The 'applyTo' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        const pattern = attribute.value.value;
        try {
            const patterns = splitGlobAware(pattern, ',');
            if (patterns.length === 0) {
                report(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
                return;
            }
            for (const pattern of patterns) {
                const globPattern = parse(pattern);
                if (isEmptyPattern(globPattern)) {
                    report(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
                    return;
                }
            }
        }
        catch (_error) {
            report(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
        }
    }
    validatePaths(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.paths);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'sequence') {
            report(toMarker(localize('promptValidator.pathsMustBeArray', "The 'paths' attribute must be an array of glob patterns."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        for (const item of attribute.value.items) {
            if (item.type !== 'scalar') {
                report(toMarker(localize('promptValidator.eachPathMustBeString', "Each entry in the 'paths' attribute must be a string."), item.range, MarkerSeverity.Error));
                continue;
            }
            const pattern = item.value.trim();
            if (pattern.length === 0) {
                report(toMarker(localize('promptValidator.pathMustBeNonEmpty', "Path entries must be non-empty glob patterns."), item.range, MarkerSeverity.Error));
                continue;
            }
            try {
                const globPattern = parse(pattern);
                if (isEmptyPattern(globPattern)) {
                    report(toMarker(localize('promptValidator.pathMustBeValidGlob', "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
                }
            }
            catch (_error) {
                report(toMarker(localize('promptValidator.pathMustBeValidGlob', "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
            }
        }
    }
    validateExcludeAgent(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.excludeAgent);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'sequence' && attribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.excludeAgentMustBeArray', "The 'excludeAgent' attribute must be an string or array."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
    }
    validateHooks(attributes, target, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.hooks);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'map') {
            report(toMarker(localize('promptValidator.hooksMustBeMap', "The 'hooks' attribute must be a map of hook event types to command arrays."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        const validHookNames = new Set(Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]));
        for (const prop of attribute.value.properties) {
            if (!validHookNames.has(prop.key.value)) {
                report(toMarker(localize('promptValidator.unknownHookType', "Unknown hook event type '{0}'. Supported: {1}.", prop.key.value, Array.from(validHookNames).join(', ')), prop.key.range, MarkerSeverity.Warning));
            }
            if (prop.value.type !== 'sequence') {
                report(toMarker(localize('promptValidator.hookValueMustBeArray', "Hook event '{0}' must have an array of command objects as its value.", prop.key.value), prop.value.range, MarkerSeverity.Error));
                continue;
            }
            for (const item of prop.value.items) {
                this.validateHookCommand(item, target, report);
            }
        }
    }
    validateHookCommand(item, target, report) {
        if (item.type !== 'map') {
            report(toMarker(localize('promptValidator.hookCommandMustBeObject', "Each hook command must be an object."), item.range, MarkerSeverity.Error));
            return;
        }
        // Detect nested matcher format: { matcher?: "...", hooks: [{ type: 'command', command: '...' }] }
        const hooksProperty = item.properties.find(p => p.key.value === 'hooks');
        if (hooksProperty) {
            // Validate that only known matcher properties are present
            for (const prop of item.properties) {
                if (prop.key.value !== 'hooks' && prop.key.value !== 'matcher') {
                    report(toMarker(localize('promptValidator.unknownMatcherProperty', "Unknown property '{0}' in hook matcher.", prop.key.value), prop.key.range, MarkerSeverity.Warning));
                }
            }
            if (hooksProperty.value.type !== 'sequence') {
                report(toMarker(localize('promptValidator.nestedHooksMustBeArray', "The 'hooks' property in a matcher must be an array of command objects."), hooksProperty.value.range, MarkerSeverity.Error));
                return;
            }
            for (const nestedItem of hooksProperty.value.items) {
                this.validateHookCommand(nestedItem, target, report);
            }
            return;
        }
        const isCopilotCli = target === Target.GitHubCopilot;
        // Determine valid and command-providing properties based on target
        const validCommandFields = isCopilotCli
            ? new Set(['bash', 'powershell'])
            : new Set(['command', 'windows', 'linux', 'osx', 'bash', 'powershell']);
        const validProperties = isCopilotCli
            ? new Set(['type', 'bash', 'powershell', 'cwd', 'env', 'timeoutSec'])
            : new Set(['type', 'command', 'windows', 'linux', 'osx', 'bash', 'powershell', 'cwd', 'env', 'timeout']);
        let hasType = false;
        let hasCommandField = false;
        for (const prop of item.properties) {
            const key = prop.key.value;
            if (!validProperties.has(key)) {
                report(toMarker(localize('promptValidator.unknownHookProperty', "Unknown property '{0}' in hook command.", key), prop.key.range, MarkerSeverity.Warning));
            }
            if (key === 'type') {
                hasType = true;
                if (prop.value.type !== 'scalar' || prop.value.value !== 'command') {
                    report(toMarker(localize('promptValidator.hookTypeMustBeCommand', "The 'type' property in a hook command must be 'command'."), prop.value.range, MarkerSeverity.Error));
                }
            }
            else if (validCommandFields.has(key)) {
                hasCommandField = true;
                if (prop.value.type !== 'scalar' || prop.value.value.trim().length === 0) {
                    report(toMarker(localize('promptValidator.hookCommandFieldMustBeNonEmptyString', "The '{0}' property in a hook command must be a non-empty string.", key), prop.value.range, MarkerSeverity.Error));
                }
            }
            else if (key === 'cwd') {
                if (prop.value.type !== 'scalar') {
                    report(toMarker(localize('promptValidator.hookCwdMustBeString', "The 'cwd' property in a hook command must be a string."), prop.value.range, MarkerSeverity.Error));
                }
            }
            else if (key === 'env') {
                if (prop.value.type !== 'map') {
                    report(toMarker(localize('promptValidator.hookEnvMustBeMap', "The 'env' property in a hook command must be a map of string values."), prop.value.range, MarkerSeverity.Error));
                }
                else {
                    for (const envProp of prop.value.properties) {
                        if (envProp.value.type !== 'scalar') {
                            report(toMarker(localize('promptValidator.hookEnvValueMustBeString', "Environment variable '{0}' must have a string value.", envProp.key.value), envProp.value.range, MarkerSeverity.Error));
                        }
                    }
                }
            }
            else if (key === 'timeout' || key === 'timeoutSec') {
                if (prop.value.type !== 'scalar' || isNaN(Number(prop.value.value))) {
                    report(toMarker(localize('promptValidator.hookTimeoutMustBeNumber', "The '{0}' property in a hook command must be a number.", key), prop.value.range, MarkerSeverity.Error));
                }
            }
        }
        if (!hasType) {
            report(toMarker(localize('promptValidator.hookMissingType', "Hook command is missing required property 'type'."), item.range, MarkerSeverity.Error));
        }
        if (!hasCommandField) {
            if (isCopilotCli) {
                report(toMarker(localize('promptValidator.hookMissingCopilotCommand', "Hook command must specify at least one of 'bash' or 'powershell'."), item.range, MarkerSeverity.Error));
            }
            else {
                report(toMarker(localize('promptValidator.hookMissingCommand', "Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'."), item.range, MarkerSeverity.Error));
            }
        }
    }
    validateHandoffs(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.handOffs);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'sequence') {
            report(toMarker(localize('promptValidator.handoffsMustBeArray', "The 'handoffs' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        const seenLabels = new Map();
        for (const item of attribute.value.items) {
            if (item.type !== 'map') {
                report(toMarker(localize('promptValidator.eachHandoffMustBeObject', "Each handoff in the 'handoffs' attribute must be an object with 'label', 'agent', 'prompt' and optional 'send'."), item.range, MarkerSeverity.Error));
                continue;
            }
            const required = new Set(['label', 'agent', 'prompt']);
            for (const prop of item.properties) {
                switch (prop.key.value) {
                    case 'label':
                        if (prop.value.type !== 'scalar' || prop.value.value.trim().length === 0) {
                            report(toMarker(localize('promptValidator.handoffLabelMustBeNonEmptyString', "The 'label' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
                        }
                        else if (!/[a-zA-Z0-9]/.test(prop.value.value)) {
                            report(toMarker(localize('promptValidator.handoffLabelMustContainAlphanumeric', "The 'label' property in a handoff must contain at least one alphanumeric character."), prop.value.range, MarkerSeverity.Error));
                        }
                        break;
                    case 'agent':
                        if (prop.value.type !== 'scalar' || prop.value.value.trim().length === 0) {
                            report(toMarker(localize('promptValidator.handoffAgentMustBeNonEmptyString', "The 'agent' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
                        }
                        else {
                            this.validateAgentValue(prop.value, report);
                        }
                        break;
                    case 'prompt':
                        if (prop.value.type !== 'scalar') {
                            report(toMarker(localize('promptValidator.handoffPromptMustBeString', "The 'prompt' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
                        }
                        break;
                    case 'send':
                        if (!isTrueOrFalse(prop.value)) {
                            report(toMarker(localize('promptValidator.handoffSendMustBeBoolean', "The 'send' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
                        }
                        break;
                    case 'showContinueOn':
                        if (!isTrueOrFalse(prop.value)) {
                            report(toMarker(localize('promptValidator.handoffShowContinueOnMustBeBoolean', "The 'showContinueOn' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
                        }
                        break;
                    case 'model':
                        if (prop.value.type !== 'scalar') {
                            report(toMarker(localize('promptValidator.handoffModelMustBeString', "The 'model' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
                        }
                        break;
                    default:
                        report(toMarker(localize('promptValidator.unknownHandoffProperty', "Unknown property '{0}' in handoff object. Supported properties are 'label', 'agent', 'prompt' and optional 'send', 'showContinueOn', 'model'.", prop.key.value), prop.value.range, MarkerSeverity.Warning));
                }
                required.delete(prop.key.value);
            }
            if (required.size > 0) {
                report(toMarker(localize('promptValidator.missingHandoffProperties', "Missing required properties {0} in handoff object.", Array.from(required).map(s => `'${s}'`).join(', ')), item.range, MarkerSeverity.Error));
            }
            // Detect duplicate labels (case-insensitive, consistent with ExecuteHandoffAction lookup)
            const labelProp = item.properties.find(p => p.key.value === 'label');
            if (labelProp?.value.type === 'scalar') {
                const normalizedLabel = labelProp.value.value.toLowerCase();
                if (normalizedLabel && seenLabels.has(normalizedLabel)) {
                    report(toMarker(localize('promptValidator.duplicateHandoffLabel', "Duplicate handoff label '{0}'. Each handoff must have a unique label.", labelProp.value.value), labelProp.value.range, MarkerSeverity.Error));
                }
                else if (normalizedLabel) {
                    seenLabels.set(normalizedLabel, labelProp.value.range);
                }
            }
        }
    }
    validateInfer(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.infer);
        if (!attribute) {
            return;
        }
        report(toMarker(localize('promptValidator.inferDeprecated', "The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'."), attribute.value.range, MarkerSeverity.Error));
    }
    validateTarget(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.target);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'scalar') {
            report(toMarker(localize('promptValidator.targetMustBeString', "The 'target' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        const targetValue = attribute.value.value.trim();
        if (targetValue.length === 0) {
            report(toMarker(localize('promptValidator.targetMustBeNonEmpty', "The 'target' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        const validTargets = ['github-copilot', 'vscode'];
        if (!validTargets.includes(targetValue)) {
            report(toMarker(localize('promptValidator.targetInvalidValue', "The 'target' attribute must be one of: {0}.", validTargets.join(', ')), attribute.value.range, MarkerSeverity.Error));
        }
    }
    validateUserInvocable(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.userInvocable);
        if (!attribute) {
            return;
        }
        if (!isTrueOrFalse(attribute.value)) {
            report(toMarker(localize('promptValidator.userInvocableMustBeBoolean', "The 'user-invocable' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
    }
    validateDisableModelInvocation(attributes, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.disableModelInvocation);
        if (!attribute) {
            return;
        }
        if (!isTrueOrFalse(attribute.value)) {
            report(toMarker(localize('promptValidator.disableModelInvocationMustBeBoolean', "The 'disable-model-invocation' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        if (attribute.value.type === 'scalar' && attribute.value.value === 'false') {
            if (!this.isCustomAgentInSubagentEnabled()) {
                report(toMarker(localize('promptValidator.inferRequiresConfig', "For agents to be used as subagent you also need to enable the 'chat.customAgentInSubagent.enabled' setting."), attribute.value.range, MarkerSeverity.Warning));
            }
        }
    }
    async validateAgentsAttribute(attributes, header, report) {
        const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agents);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'sequence') {
            report(toMarker(localize('promptValidator.agentsMustBeArray', "The 'agents' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        // Check if the configuration setting is enabled
        if (!this.isCustomAgentInSubagentEnabled()) {
            report(toMarker(localize('promptValidator.agentsRequiresConfig', "For agents to be used as subagent you also need to enable the 'chat.customAgentInSubagent.enabled' setting."), attribute.range, MarkerSeverity.Warning));
        }
        // Collect available agent names
        const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
        const availableAgentNames = new Set(agents.map(agent => agent.name));
        availableAgentNames.add(ChatMode.Agent.name.get()); // include default agent
        // Check each item is a string and agent exists
        const agentNames = [];
        for (const item of attribute.value.items) {
            if (item.type !== 'scalar') {
                report(toMarker(localize('promptValidator.eachAgentMustBeString', "Each agent name in the 'agents' attribute must be a string."), item.range, MarkerSeverity.Error));
            }
            else if (item.value) {
                agentNames.push(item.value);
                if (item.value !== '*' && !availableAgentNames.has(item.value)) {
                    report(toMarker(localize('promptValidator.agentInAgentsNotFound', "Unknown agent '{0}' will be ignored. Available agents: {1}.", item.value, Array.from(availableAgentNames).join(', ')), item.range, MarkerSeverity.Hint, [1 /* MarkerTag.Unnecessary */]));
                }
            }
        }
        // If not wildcard and not empty, check that 'agent' tool is available
        if (agentNames.length > 0) {
            const tools = header.tools;
            if (tools && !tools.includes(SpecedToolAliases.agent)) {
                report(toMarker(localize('promptValidator.agentsRequiresAgentTool', "When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute."), attribute.value.range, MarkerSeverity.Warning));
            }
        }
    }
    isCustomAgentInSubagentEnabled() {
        return !!this.configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents);
    }
    validateGithubPermissions(attributes, report) {
        const attribute = attributes.find(attr => attr.key === GithubPromptHeaderAttributes.github);
        if (!attribute) {
            return;
        }
        if (attribute.value.type !== 'map') {
            report(toMarker(localize('promptValidator.githubMustBeMap', "The 'github' attribute must be an object."), attribute.value.range, MarkerSeverity.Error));
            return;
        }
        for (const prop of attribute.value.properties) {
            if (prop.key.value !== 'permissions') {
                report(toMarker(localize('promptValidator.unknownGithubProperty', "Unknown property '{0}' in 'github' object. Supported: 'permissions'.", prop.key.value), prop.key.range, MarkerSeverity.Warning));
                continue;
            }
            if (prop.value.type !== 'map') {
                report(toMarker(localize('promptValidator.permissionsMustBeMap', "The 'permissions' property must be an object."), prop.value.range, MarkerSeverity.Error));
                continue;
            }
            for (const permProp of prop.value.properties) {
                const scope = permProp.key.value;
                const scopeInfo = githubPermissionScopes[scope];
                if (!scopeInfo) {
                    const validScopes = Object.keys(githubPermissionScopes).sort().join(', ');
                    report(toMarker(localize('promptValidator.unknownPermissionScope', "Unknown permission scope '{0}'. Valid scopes: {1}.", scope, validScopes), permProp.key.range, MarkerSeverity.Warning));
                    continue;
                }
                if (permProp.value.type !== 'scalar') {
                    report(toMarker(localize('promptValidator.permissionValueMustBeString', "The permission value for '{0}' must be a string.", scope), permProp.value.range, MarkerSeverity.Error));
                    continue;
                }
                const value = permProp.value.value;
                if (!scopeInfo.allowedValues.includes(value)) {
                    report(toMarker(localize('promptValidator.invalidPermissionValue', "Invalid permission value '{0}' for scope '{1}'. Allowed values: {2}.", value, scope, scopeInfo.allowedValues.join(', ')), permProp.value.range, MarkerSeverity.Error));
                }
            }
        }
    }
};
PromptValidator = __decorate([
    __param(0, ILanguageModelsService),
    __param(1, ILanguageModelToolsService),
    __param(2, IChatModeService),
    __param(3, IFileService),
    __param(4, ILabelService),
    __param(5, IPromptsService),
    __param(6, IConfigurationService)
], PromptValidator);
export { PromptValidator };
export const githubPermissionScopes = {
    'actions': { allowedValues: ['read', 'write', 'none'], description: localize('githubPermission.actions', "Access to GitHub Actions workflows and runs") },
    'checks': { allowedValues: ['read', 'none'], description: localize('githubPermission.checks', "Access to check runs and statuses") },
    'contents': { allowedValues: ['read', 'write', 'none'], description: localize('githubPermission.contents', "Access to repository contents (files, commits, branches)") },
    'discussions': { allowedValues: ['read', 'write', 'none'], description: localize('githubPermission.discussions', "Access to discussions") },
    'issues': { allowedValues: ['read', 'write', 'none'], description: localize('githubPermission.issues', "Access to issues (read, create, update, comment)") },
    'metadata': { allowedValues: ['read'], description: localize('githubPermission.metadata', "Repository metadata (always read-only)") },
    'pull-requests': { allowedValues: ['read', 'write', 'none'], description: localize('githubPermission.pullRequests', "Access to pull requests (read, create, update, review)") },
    'security-events': { allowedValues: ['read', 'none'], description: localize('githubPermission.securityEvents', "Access to security-related events") },
    'workflows': { allowedValues: ['write', 'none'], description: localize('githubPermission.workflows', "Access to modify workflow files") },
};
function isTrueOrFalse(value) {
    if (value.type === 'scalar') {
        return (value.value === 'true' || value.value === 'false') && value.format === 'none';
    }
    return false;
}
const allAttributeNames = {
    [PromptsType.prompt]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.mode, PromptHeaderAttributes.agent, PromptHeaderAttributes.argumentHint],
    [PromptsType.instructions]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.applyTo, PromptHeaderAttributes.excludeAgent],
    [PromptsType.agent]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.advancedOptions, PromptHeaderAttributes.handOffs, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.target, PromptHeaderAttributes.infer, PromptHeaderAttributes.agents, PromptHeaderAttributes.hooks, PromptHeaderAttributes.userInvocable, PromptHeaderAttributes.disableModelInvocation, GithubPromptHeaderAttributes.github],
    [PromptsType.skill]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.license, PromptHeaderAttributes.compatibility, PromptHeaderAttributes.metadata, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.userInvocable, PromptHeaderAttributes.disableModelInvocation],
    [PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};
const githubCopilotAgentAttributeNames = [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.tools, PromptHeaderAttributes.target, GithubPromptHeaderAttributes.mcpServers, GithubPromptHeaderAttributes.github, PromptHeaderAttributes.infer];
const recommendedAttributeNames = {
    [PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.agent]: allAttributeNames[PromptsType.agent].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.skill]: allAttributeNames[PromptsType.skill].filter(name => !isNonRecommendedAttribute(name)),
    [PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};
export function getValidAttributeNames(promptType, includeNonRecommended, target) {
    if (target === Target.Claude) {
        if (promptType === PromptsType.instructions) {
            return Object.keys(claudeRulesAttributes);
        }
        return Object.keys(claudeAgentAttributes);
    }
    else if (target === Target.GitHubCopilot) {
        if (promptType === PromptsType.agent) {
            return githubCopilotAgentAttributeNames;
        }
    }
    return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}
export function isNonRecommendedAttribute(attributeName) {
    return attributeName === PromptHeaderAttributes.advancedOptions || attributeName === PromptHeaderAttributes.excludeAgent || attributeName === PromptHeaderAttributes.mode || attributeName === PromptHeaderAttributes.infer;
}
export function getAttributeDescription(attributeName, promptType, target) {
    if (target === Target.Claude) {
        if (promptType === PromptsType.agent) {
            return claudeAgentAttributes[attributeName]?.description;
        }
        if (promptType === PromptsType.instructions) {
            return claudeRulesAttributes[attributeName]?.description;
        }
    }
    switch (promptType) {
        case PromptsType.instructions:
            switch (attributeName) {
                case PromptHeaderAttributes.name:
                    return localize('promptHeader.instructions.name', 'The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.');
                case PromptHeaderAttributes.description:
                    return localize('promptHeader.instructions.description', 'The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.');
                case PromptHeaderAttributes.applyTo:
                    return localize('promptHeader.instructions.applyToRange', 'One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`');
            }
            break;
        case PromptsType.skill:
            switch (attributeName) {
                case PromptHeaderAttributes.name:
                    return localize('promptHeader.skill.name', 'The name of the skill.');
                case PromptHeaderAttributes.description:
                    return localize('promptHeader.skill.description', 'The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.');
                case PromptHeaderAttributes.argumentHint:
                    return localize('promptHeader.skill.argumentHint', 'Hint shown during autocomplete to indicate expected arguments. Example: [issue-number] or [filename] [format]');
                case PromptHeaderAttributes.userInvocable:
                    return localize('promptHeader.skill.userInvocable', 'Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true.');
                case PromptHeaderAttributes.disableModelInvocation:
                    return localize('promptHeader.skill.disableModelInvocation', 'Set to true to prevent the agent from automatically loading this skill. Use for workflows you want to trigger manually with /name. Default: false.');
            }
            break;
        case PromptsType.agent:
            switch (attributeName) {
                case PromptHeaderAttributes.name:
                    return localize('promptHeader.agent.name', 'The name of the agent as shown in the UI.');
                case PromptHeaderAttributes.description:
                    return localize('promptHeader.agent.description', 'The description of the custom agent, what it does and when to use it.');
                case PromptHeaderAttributes.argumentHint:
                    return localize('promptHeader.agent.argumentHint', 'The argument-hint describes what inputs the custom agent expects or supports.');
                case PromptHeaderAttributes.model:
                    return localize('promptHeader.agent.model', 'Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.');
                case PromptHeaderAttributes.tools:
                    return localize('promptHeader.agent.tools', 'The set of tools that the custom agent has access to.');
                case PromptHeaderAttributes.handOffs:
                    return localize('promptHeader.agent.handoffs', 'Possible handoff actions when the agent has completed its task.');
                case PromptHeaderAttributes.target:
                    return localize('promptHeader.agent.target', 'The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.');
                case PromptHeaderAttributes.infer:
                    return localize('promptHeader.agent.infer', 'Controls visibility of the agent.');
                case PromptHeaderAttributes.agents:
                    return localize('promptHeader.agent.agents', 'One or more agents that this agent can use as subagents. Use \'*\' to specify all available agents.');
                case PromptHeaderAttributes.hooks:
                    return localize('promptHeader.agent.hooks', 'Lifecycle hooks scoped to this agent. Define hooks that run only while this agent is active.');
                case PromptHeaderAttributes.userInvocable:
                    return localize('promptHeader.agent.userInvocable', 'Whether the agent can be selected and invoked by users in the UI.');
                case PromptHeaderAttributes.disableModelInvocation:
                    return localize('promptHeader.agent.disableModelInvocation', 'If true, prevents the agent from being invoked as a subagent.');
                case GithubPromptHeaderAttributes.github:
                    return localize('promptHeader.agent.github', 'GitHub-specific configuration for the agent, such as token permissions.');
            }
            break;
        case PromptsType.prompt:
            switch (attributeName) {
                case PromptHeaderAttributes.name:
                    return localize('promptHeader.prompt.name', 'The name of the prompt. This is also the name of the slash command that will run this prompt.');
                case PromptHeaderAttributes.description:
                    return localize('promptHeader.prompt.description', 'The description of the reusable prompt, what it does and when to use it.');
                case PromptHeaderAttributes.argumentHint:
                    return localize('promptHeader.prompt.argumentHint', 'The argument-hint describes what inputs the prompt expects or supports.');
                case PromptHeaderAttributes.model:
                    return localize('promptHeader.prompt.model', 'The model to use in this prompt. Can also be a list of models. The first available model will be used.');
                case PromptHeaderAttributes.tools:
                    return localize('promptHeader.prompt.tools', 'The tools to use in this prompt.');
                case PromptHeaderAttributes.agent:
                case PromptHeaderAttributes.mode:
                    return localize('promptHeader.prompt.agent.description', 'The agent to use when running this prompt.');
            }
            break;
    }
    return undefined;
}
// The list of tools known to be used by GitHub Copilot custom agents
export const knownGithubCopilotTools = [
    { name: SpecedToolAliases.execute, description: localize('githubCopilot.execute', 'Execute commands') },
    { name: SpecedToolAliases.read, description: localize('githubCopilot.read', 'Read files') },
    { name: SpecedToolAliases.edit, description: localize('githubCopilot.edit', 'Edit files') },
    { name: SpecedToolAliases.search, description: localize('githubCopilot.search', 'Search files') },
    { name: SpecedToolAliases.agent, description: localize('githubCopilot.agent', 'Use subagents') },
];
export const knownClaudeTools = [
    { name: 'Bash', description: localize('claude.bash', 'Execute shell commands'), toolEquivalent: [SpecedToolAliases.execute] },
    { name: 'Edit', description: localize('claude.edit', 'Make targeted file edits'), toolEquivalent: ['edit/editNotebook', 'edit/editFiles'] },
    { name: 'Glob', description: localize('claude.glob', 'Find files by pattern'), toolEquivalent: ['search/fileSearch'] },
    { name: 'Grep', description: localize('claude.grep', 'Search file contents with regex'), toolEquivalent: ['search/textSearch'] },
    { name: 'Read', description: localize('claude.read', 'Read file contents'), toolEquivalent: ['read/readFile', 'read/getNotebookSummary'] },
    { name: 'Write', description: localize('claude.write', 'Create/overwrite files'), toolEquivalent: ['edit/createDirectory', 'edit/createFile', 'edit/createJupyterNotebook'] },
    { name: 'WebFetch', description: localize('claude.webFetch', 'Fetch URL content'), toolEquivalent: [SpecedToolAliases.web] },
    { name: 'WebSearch', description: localize('claude.webSearch', 'Perform web searches'), toolEquivalent: [SpecedToolAliases.web] },
    { name: 'Task', description: localize('claude.task', 'Run subagents for complex tasks'), toolEquivalent: [SpecedToolAliases.agent] },
    { name: 'Skill', description: localize('claude.skill', 'Execute skills'), toolEquivalent: [] },
    { name: 'LSP', description: localize('claude.lsp', 'Code intelligence (requires plugin)'), toolEquivalent: [] },
    { name: 'NotebookEdit', description: localize('claude.notebookEdit', 'Modify Jupyter notebooks'), toolEquivalent: ['edit/editNotebook'] },
    { name: 'AskUserQuestion', description: localize('claude.askUserQuestion', 'Ask multiple-choice questions'), toolEquivalent: ['vscode/askQuestions'] },
    { name: 'MCPSearch', description: localize('claude.mcpSearch', 'Searches for MCP tools when tool search is enabled'), toolEquivalent: [] }
];
export const knownClaudeModels = [
    { name: 'sonnet', description: localize('claude.sonnet', 'Latest Claude Sonnet'), modelEquivalent: 'Claude Sonnet 4.5 (copilot)' },
    { name: 'opus', description: localize('claude.opus', 'Latest Claude Opus'), modelEquivalent: 'Claude Opus 4.6 (copilot)' },
    { name: 'haiku', description: localize('claude.haiku', 'Latest Claude Haiku, fast for simple tasks'), modelEquivalent: 'Claude Haiku 4.5 (copilot)' },
    { name: 'inherit', description: localize('claude.inherit', 'Inherit model from parent agent or prompt'), modelEquivalent: undefined },
];
export function mapClaudeModels(claudeModelNames) {
    const result = [];
    for (const name of claudeModelNames) {
        const claudeModel = knownClaudeModels.find(model => model.name === name);
        if (claudeModel && claudeModel.modelEquivalent) {
            result.push(claudeModel.modelEquivalent);
        }
    }
    return result;
}
/**
 * Maps Claude tool names to their VS Code tool equivalents.
 */
export function mapClaudeTools(claudeToolNames) {
    const result = [];
    for (const name of claudeToolNames) {
        const claudeTool = knownClaudeTools.find(tool => tool.name === name);
        if (claudeTool) {
            result.push(...claudeTool.toolEquivalent);
        }
    }
    return result;
}
export const claudeAgentAttributes = {
    'name': {
        type: 'scalar',
        description: localize('attribute.name', "Unique identifier using lowercase letters and hyphens (required)"),
    },
    'description': {
        type: 'scalar',
        description: localize('attribute.description', "When to delegate to this subagent (required)"),
    },
    'tools': {
        type: 'sequence',
        description: localize('attribute.tools', "Array of tools the subagent can use. Inherits all tools if omitted"),
        defaults: ['Read, Edit, Bash'],
        items: knownClaudeTools
    },
    'disallowedTools': {
        type: 'sequence',
        description: localize('attribute.disallowedTools', "Tools to deny, removed from inherited or specified list"),
        defaults: ['Write, Edit, Bash'],
        items: knownClaudeTools
    },
    'model': {
        type: 'scalar',
        description: localize('attribute.model', "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit."),
        defaults: ['sonnet', 'opus', 'haiku', 'inherit'],
        enums: knownClaudeModels
    },
    'permissionMode': {
        type: 'scalar',
        description: localize('attribute.permissionMode', "Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan."),
        defaults: ['default', 'acceptEdits', 'dontAsk', 'bypassPermissions', 'plan'],
        enums: [
            { name: 'default', description: localize('claude.permissionMode.default', 'Standard behavior: prompts for permission on first use of each tool.') },
            { name: 'acceptEdits', description: localize('claude.permissionMode.acceptEdits', 'Automatically accepts file edit permissions for the session.') },
            { name: 'plan', description: localize('claude.permissionMode.plan', 'Plan Mode: Claude can analyze but not modify files or execute commands.') },
            { name: 'delegate', description: localize('claude.permissionMode.delegate', 'Coordination-only mode for agent team leads. Only available when an agent team is active.') },
            { name: 'dontAsk', description: localize('claude.permissionMode.dontAsk', 'Auto-denies tools unless pre-approved via /permissions or permissions.allow rules.') },
            { name: 'bypassPermissions', description: localize('claude.permissionMode.bypassPermissions', 'Skips all permission prompts (requires safe environment like containers).') }
        ]
    },
    'skills': {
        type: 'sequence',
        description: localize('attribute.skills', "Skills to load into the subagent's context at startup."),
    },
    'mcpServers': {
        type: 'sequence',
        description: localize('attribute.mcpServers', "MCP servers available to this subagent."),
    },
    'hooks': {
        type: 'object',
        description: localize('attribute.hooks', "Lifecycle hooks scoped to this subagent."),
    },
    'memory': {
        type: 'scalar',
        description: localize('attribute.memory', "Persistent memory scope: user, project, or local. Enables cross-session learning."),
        defaults: ['user', 'project', 'local'],
        enums: [
            { name: 'user', description: localize('claude.memory.user', "Remember learnings across all projects.") },
            { name: 'project', description: localize('claude.memory.project', "The subagent's knowledge is project-specific and shareable via version control.") },
            { name: 'local', description: localize('claude.memory.local', "The subagent's knowledge is project-specific but should not be checked into version control.") }
        ]
    }
};
/**
 * Attributes supported in Claude rules files (`.claude/rules/*.md`).
 * Claude rules use `paths` instead of `applyTo` for glob patterns.
 */
export const claudeRulesAttributes = {
    'description': {
        type: 'scalar',
        description: localize('attribute.rules.description', "A description of what this rule covers, used to provide context about when it applies."),
    },
    'paths': {
        type: 'sequence',
        description: localize('attribute.rules.paths', "Array of glob patterns that describe for which files the rule applies. Based on these patterns, the file is automatically included in the prompt when the context contains a file that matches.\nExample: `['src/**/*.ts', 'test/**']`"),
    },
};
export function isVSCodeOrDefaultTarget(target) {
    return target === Target.VSCode || target === Target.Undefined;
}
export function getTarget(promptType, header) {
    const uri = header instanceof URI ? header : header.uri;
    if (promptType === PromptsType.agent) {
        const parentDir = dirname(uri);
        if (parentDir.path.endsWith(`/${CLAUDE_AGENTS_SOURCE_FOLDER}`)) {
            return Target.Claude;
        }
        if (!(header instanceof URI)) {
            const target = header.target;
            if (target === Target.GitHubCopilot || target === Target.VSCode) {
                return target;
            }
        }
        return Target.Undefined;
    }
    else if (promptType === PromptsType.instructions) {
        if (isInClaudeRulesFolder(uri)) {
            return Target.Claude;
        }
    }
    return Target.Undefined;
}
function toMarker(message, range, severity = MarkerSeverity.Error, tags) {
    return { severity, message, ...(tags ? { tags } : {}), ...range };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VmFsaWRhdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdFZhbGlkYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDckUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQWUsY0FBYyxFQUFhLE1BQU0sc0RBQXNELENBQUM7QUFDOUcsT0FBTyxFQUFFLFFBQVEsRUFBYSxnQkFBZ0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzNFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNyRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3hELE9BQU8sRUFBa0QsdUJBQXVCLEVBQTBDLHNCQUFzQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDakwsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FB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