/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEmptyPattern, parse, splitGlobAware } from '../../../../../../base/common/glob.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { ChatMode, IChatMode, IChatModeService } from '../../chatModes.js';
import { ChatModeKind } from '../../constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService, SpecedToolAliases } from '../../tools/languageModelToolsService.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { GithubPromptHeaderAttributes, IArrayValue, IHeaderAttribute, IStringValue, parseCommaSeparatedList, ParsedPromptFile, PromptHeader, PromptHeaderAttributes } from '../promptFileParser.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptsService, Target } from '../service/promptsService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { AGENTS_SOURCE_FOLDER, CLAUDE_AGENTS_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { dirname } from '../../../../../../base/common/resources.js';

export const MARKERS_OWNER_ID = 'prompts-diagnostics-provider';

export class PromptValidator {
	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IPromptsService private readonly promptsService: IPromptsService
	) { }

	public async validate(promptAST: ParsedPromptFile, promptType: PromptsType, report: (markers: IMarkerData) => void): Promise<void> {
		promptAST.header?.errors.forEach(error => report(toMarker(error.message, error.range, MarkerSeverity.Error)));
		const target = getTarget(promptType, promptAST.header);
		await this.validateHeader(promptAST, promptType, target, report);
		await this.validateBody(promptAST, target, report);
		await this.validateFileName(promptAST, promptType, report);
		await this.validateSkillFolderName(promptAST, promptType, report);
	}

	private async validateFileName(promptAST: ParsedPromptFile, promptType: PromptsType, report: (markers: IMarkerData) => void): Promise<void> {
		if (promptType === PromptsType.agent && promptAST.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
			const location = this.promptsService.getAgentFileURIFromModeFile(promptAST.uri);
			if (location && await this.fileService.canCreateFile(location)) {
				report(toMarker(localize('promptValidator.chatModesRenamedToAgents', "Chat modes have been renamed to agents. Please move this file to {0}", location.toString()), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
			} else {
				report(toMarker(localize('promptValidator.chatModesRenamedToAgentsNoMove', "Chat modes have been renamed to agents. Please move the file to {0}", AGENTS_SOURCE_FOLDER), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
			}
		}
	}

	private async validateSkillFolderName(promptAST: ParsedPromptFile, promptType: PromptsType, report: (markers: IMarkerData) => void): Promise<void> {
		if (promptType !== PromptsType.skill) {
			return;
		}

		const nameAttribute = promptAST.header?.attributes.find(attr => attr.key === PromptHeaderAttributes.name);
		if (!nameAttribute || nameAttribute.value.type !== 'string') {
			return;
		}

		const skillName = nameAttribute.value.value.trim();
		if (!skillName) {
			return;
		}

		// Extract folder name from path (e.g., .github/skills/my-skill/SKILL.md -> my-skill)
		const pathParts = promptAST.uri.path.split('/');
		const skillIndex = pathParts.findIndex(part => part === 'SKILL.md');
		if (skillIndex > 0) {
			const folderName = pathParts[skillIndex - 1];
			if (folderName && skillName !== folderName) {
				report(toMarker(
					localize('promptValidator.skillNameFolderMismatch', "The skill name '{0}' should match the folder name '{1}'.", skillName, folderName),
					nameAttribute.value.range,
					MarkerSeverity.Warning
				));
			}
		}
	}

	private async validateBody(promptAST: ParsedPromptFile, target: Target, report: (markers: IMarkerData) => void): Promise<void> {
		const body = promptAST.body;
		if (!body) {
			return;
		}

		// Validate file references
		const fileReferenceChecks: Promise<void>[] = [];
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
					} catch {
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

			const available = new Set<string>(this.languageModelToolsService.getFullReferenceNames());
			const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
			for (const variable of body.variableReferences) {
				if (!available.has(variable.name)) {
					if (deprecatedNames.has(variable.name)) {
						const currentNames = deprecatedNames.get(variable.name);
						if (currentNames && currentNames.size > 0) {
							if (currentNames.size === 1) {
								const newName = Array.from(currentNames)[0];
								report(toMarker(localize('promptValidator.deprecatedVariableReference', "Tool or toolset '{0}' has been renamed, use '{1}' instead.", variable.name, newName), variable.range, MarkerSeverity.Info));
							} else {
								const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(', ');
								report(toMarker(localize('promptValidator.deprecatedVariableReferenceMultipleNames', "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", variable.name, newNames), variable.range, MarkerSeverity.Info));
							}
						}
					} else {
						report(toMarker(localize('promptValidator.unknownVariableReference', "Unknown tool or toolset '{0}'.", variable.name), variable.range, MarkerSeverity.Warning));
					}
				} else if (headerToolsMap) {
					const tool = this.languageModelToolsService.getToolByFullReferenceName(variable.name);
					if (tool && headerToolsMap.get(tool) === false) {
						report(toMarker(localize('promptValidator.disabledTool', "Tool or toolset '{0}' also needs to be enabled in the header.", variable.name), variable.range, MarkerSeverity.Warning));
					}
				}
			}
		}

		await Promise.all(fileReferenceChecks);
	}

	private async validateHeader(promptAST: ParsedPromptFile, promptType: PromptsType, target: Target, report: (markers: IMarkerData) => void): Promise<void> {
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
				this.validateApplyTo(attributes, report);
				this.validateExcludeAgent(attributes, report);
				break;

			case PromptsType.agent: {
				this.validateTarget(attributes, report);
				this.validateInfer(attributes, report);
				this.validateUserInvokable(attributes, report);
				this.validateDisableModelInvocation(attributes, report);
				this.validateTools(attributes, ChatModeKind.Agent, target, report);
				if (isVSCodeOrDefaultTarget(target)) {
					this.validateModel(attributes, ChatModeKind.Agent, report);
					this.validateHandoffs(attributes, report);
					await this.validateAgentsAttribute(attributes, header, report);
				} else if (target === Target.Claude) {
					this.validateClaudeAttributes(attributes, report);
				}
				break;
			}

			case PromptsType.skill:
				this.validateUserInvokable(attributes, report);
				this.validateDisableModelInvocation(attributes, report);
				break;
		}
	}

	private checkForInvalidArguments(attributes: IHeaderAttribute[], promptType: PromptsType, target: Target, report: (markers: IMarkerData) => void): void {
		const validAttributeNames = getValidAttributeNames(promptType, true, target);
		const validGithubCopilotAttributeNames = new Lazy(() => new Set(getValidAttributeNames(promptType, false, Target.GitHubCopilot)));
		for (const attribute of attributes) {
			if (!validAttributeNames.includes(attribute.key)) {
				const supportedNames = new Lazy(() => getValidAttributeNames(promptType, false, target).sort().join(', '));
				switch (promptType) {
					case PromptsType.prompt:
						report(toMarker(localize('promptValidator.unknownAttribute.prompt', "Attribute '{0}' is not supported in prompt files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.agent:
						if (target === Target.GitHubCopilot) {
							report(toMarker(localize('promptValidator.unknownAttribute.github-agent', "Attribute '{0}' is not supported in custom GitHub Copilot agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
						} else if (target === Target.Claude) {
							// ignore for now as we don't have a full list of supported attributes for claude target
						} else {
							if (validGithubCopilotAttributeNames.value.has(attribute.key)) {
								report(toMarker(localize('promptValidator.ignoredAttribute.vscode-agent', "Attribute '{0}' is ignored when running locally in VS Code.", attribute.key), attribute.range, MarkerSeverity.Info));
							} else {
								report(toMarker(localize('promptValidator.unknownAttribute.vscode-agent', "Attribute '{0}' is not supported in VS Code agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
							}
						}
						break;
					case PromptsType.instructions:
						report(toMarker(localize('promptValidator.unknownAttribute.instructions', "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.skill:
						report(toMarker(localize('promptValidator.unknownAttribute.skill', "Attribute '{0}' is not supported in skill files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
						break;
				}
			}
		}
	}



	private validateName(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): void {
		const nameAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.name);
		if (!nameAttribute) {
			return;
		}
		if (nameAttribute.value.type !== 'string') {
			report(toMarker(localize('promptValidator.nameMustBeString', "The 'name' attribute must be a string."), nameAttribute.range, MarkerSeverity.Error));
			return;
		}
		if (nameAttribute.value.value.trim().length === 0) {
			report(toMarker(localize('promptValidator.nameShouldNotBeEmpty', "The 'name' attribute must not be empty."), nameAttribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateDescription(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): void {
		const descriptionAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.description);
		if (!descriptionAttribute) {
			return;
		}
		if (descriptionAttribute.value.type !== 'string') {
			report(toMarker(localize('promptValidator.descriptionMustBeString', "The 'description' attribute must be a string."), descriptionAttribute.range, MarkerSeverity.Error));
			return;
		}
		if (descriptionAttribute.value.value.trim().length === 0) {
			report(toMarker(localize('promptValidator.descriptionShouldNotBeEmpty', "The 'description' attribute should not be empty."), descriptionAttribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateArgumentHint(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): void {
		const argumentHintAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.argumentHint);
		if (!argumentHintAttribute) {
			return;
		}
		if (argumentHintAttribute.value.type !== 'string') {
			report(toMarker(localize('promptValidator.argumentHintMustBeString', "The 'argument-hint' attribute must be a string."), argumentHintAttribute.range, MarkerSeverity.Error));
			return;
		}
		if (argumentHintAttribute.value.value.trim().length === 0) {
			report(toMarker(localize('promptValidator.argumentHintShouldNotBeEmpty', "The 'argument-hint' attribute should not be empty."), argumentHintAttribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateModel(attributes: IHeaderAttribute[], agentKind: ChatModeKind, report: (markers: IMarkerData) => void): void {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.model);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'string' && attribute.value.type !== 'array') {
			report(toMarker(localize('promptValidator.modelMustBeStringOrArray', "The 'model' attribute must be a string or an array of strings."), attribute.value.range, MarkerSeverity.Error));
			return;
		}

		const modelNames: [string, Range][] = [];
		if (attribute.value.type === 'string') {
			const modelName = attribute.value.value.trim();
			if (modelName.length === 0) {
				report(toMarker(localize('promptValidator.modelMustBeNonEmpty', "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
				return;
			}
			modelNames.push([modelName, attribute.value.range]);
		} else if (attribute.value.type === 'array') {
			if (attribute.value.items.length === 0) {
				report(toMarker(localize('promptValidator.modelArrayMustNotBeEmpty', "The 'model' array must not be empty."), attribute.value.range, MarkerSeverity.Error));
				return;
			}
			for (const item of attribute.value.items) {
				if (item.type !== 'string') {
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
				report(toMarker(localize('promptValidator.modelNotFound', "Unknown model '{0}'.", modelName), range, MarkerSeverity.Warning));
			} else if (agentKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
				report(toMarker(localize('promptValidator.modelNotSuited', "Model '{0}' is not suited for agent mode.", modelName), range, MarkerSeverity.Warning));
			}
		}
	}

	private validateClaudeAttributes(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): void {
		// vaidate all claude-specific attributes that have enum values
		for (const claudeAttributeName in claudeAgentAttributes) {
			const claudeAttribute = claudeAgentAttributes[claudeAttributeName];
			const enumValues = claudeAttribute.enums;
			if (enumValues) {
				const attribute = attributes.find(attr => attr.key === claudeAttributeName);
				if (!attribute) {
					continue;
				}
				if (attribute.value.type !== 'string') {
					report(toMarker(localize('promptValidator.claude.attributeMustBeString', "The '{0}' attribute must be a string.", claudeAttributeName), attribute.value.range, MarkerSeverity.Error));
					continue;
				} else {
					const modelName = attribute.value.value.trim();
					if (enumValues.every(model => model.name !== modelName)) {
						const validValues = enumValues.map(model => model.name).join(', ');
						report(toMarker(localize('promptValidator.claude.attributeNotFound', "Unknown value '{0}', valid: {1}.", modelName, validValues), attribute.value.range, MarkerSeverity.Warning));
					}
				}
			}
		}
	}

	private findModelByName(modelName: string): ILanguageModelChatMetadata | undefined {
		const metadataAndId = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
		if (metadataAndId && metadataAndId.metadata.isUserSelectable !== false) {
			return metadataAndId.metadata;
		}
		return undefined;
	}

	private validateAgent(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): IChatMode | undefined {
		const agentAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agent);
		const modeAttribute = attributes.find(attr => attr.key === PromptHeaderAttributes.mode);
		if (modeAttribute) {
			if (agentAttribute) {
				report(toMarker(localize('promptValidator.modeDeprecated', "The 'mode' attribute has been deprecated. The 'agent' attribute is used instead."), modeAttribute.range, MarkerSeverity.Warning));
			} else {
				report(toMarker(localize('promptValidator.modeDeprecated.useAgent', "The 'mode' attribute has been deprecated. Please rename it to 'agent'."), modeAttribute.range, MarkerSeverity.Error));
			}
		}

		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agent) ?? modeAttribute;
		if (!attribute) {
			return undefined; // default agent for prompts is Agent
		}
		if (attribute.value.type !== 'string') {
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

	private validateAgentValue(value: IStringValue, report: (markers: IMarkerData) => void): IChatMode | undefined {
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

	private validateTools(attributes: IHeaderAttribute[], agentKind: ChatModeKind, target: Target, report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.tools);
		if (!attribute) {
			return;
		}
		if (agentKind !== ChatModeKind.Agent) {
			report(toMarker(localize('promptValidator.toolsOnlyInAgent', "The 'tools' attribute is only supported when using agents. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));
		}
		let value = attribute.value;
		if (value.type === 'string') {
			value = parseCommaSeparatedList(value);
		}
		if (value.type !== 'array') {
			report(toMarker(localize('promptValidator.toolsMustBeArrayOrMap', "The 'tools' attribute must be an array or a comma separated string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
		if (target === Target.GitHubCopilot || target === Target.Claude) {
			// no validation for github-copilot target and claude
		} else {
			this.validateVSCodeTools(value, report);
		}
	}

	private validateVSCodeTools(valueItem: IArrayValue, report: (markers: IMarkerData) => void) {
		if (valueItem.items.length > 0) {
			const available = new Set<string>(this.languageModelToolsService.getFullReferenceNames());
			const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
			for (const item of valueItem.items) {
				if (item.type !== 'string') {
					report(toMarker(localize('promptValidator.eachToolMustBeString', "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
				} else if (item.value) {
					if (!available.has(item.value)) {
						const currentNames = deprecatedNames.get(item.value);
						if (currentNames) {
							if (currentNames?.size === 1) {
								const newName = Array.from(currentNames)[0];
								report(toMarker(localize('promptValidator.toolDeprecated', "Tool or toolset '{0}' has been renamed, use '{1}' instead.", item.value, newName), item.range, MarkerSeverity.Info));
							} else {
								const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(', ');
								report(toMarker(localize('promptValidator.toolDeprecatedMultipleNames', "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", item.value, newNames), item.range, MarkerSeverity.Info));
							}
						} else {
							report(toMarker(localize('promptValidator.toolNotFound', "Unknown tool '{0}'.", item.value), item.range, MarkerSeverity.Warning));
						}
					}
				}
			}
		}
	}

	private validateApplyTo(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.applyTo);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'string') {
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
		} catch (_error) {
			report(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
		}
	}

	private validateExcludeAgent(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.excludeAgent);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'array' && attribute.value.type !== 'string') {
			report(toMarker(localize('promptValidator.excludeAgentMustBeArray', "The 'excludeAgent' attribute must be an string or array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateHandoffs(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.handOffs);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'array') {
			report(toMarker(localize('promptValidator.handoffsMustBeArray', "The 'handoffs' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
		for (const item of attribute.value.items) {
			if (item.type !== 'object') {
				report(toMarker(localize('promptValidator.eachHandoffMustBeObject', "Each handoff in the 'handoffs' attribute must be an object with 'label', 'agent', 'prompt' and optional 'send'."), item.range, MarkerSeverity.Error));
				continue;
			}
			const required = new Set(['label', 'agent', 'prompt']);
			for (const prop of item.properties) {
				switch (prop.key.value) {
					case 'label':
						if (prop.value.type !== 'string' || prop.value.value.trim().length === 0) {
							report(toMarker(localize('promptValidator.handoffLabelMustBeNonEmptyString', "The 'label' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
						}
						break;
					case 'agent':
						if (prop.value.type !== 'string' || prop.value.value.trim().length === 0) {
							report(toMarker(localize('promptValidator.handoffAgentMustBeNonEmptyString', "The 'agent' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
						} else {
							this.validateAgentValue(prop.value, report);
						}
						break;
					case 'prompt':
						if (prop.value.type !== 'string') {
							report(toMarker(localize('promptValidator.handoffPromptMustBeString', "The 'prompt' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
						}
						break;
					case 'send':
						if (prop.value.type !== 'boolean') {
							report(toMarker(localize('promptValidator.handoffSendMustBeBoolean', "The 'send' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
						}
						break;
					case 'showContinueOn':
						if (prop.value.type !== 'boolean') {
							report(toMarker(localize('promptValidator.handoffShowContinueOnMustBeBoolean', "The 'showContinueOn' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
						}
						break;
					case 'model':
						if (prop.value.type !== 'string') {
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
		}
	}

	private validateInfer(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.infer);
		if (!attribute) {
			return;
		}
		report(toMarker(localize('promptValidator.inferDeprecated', "The 'infer' attribute is deprecated in favour of 'user-invokable' and 'disable-model-invocation'."), attribute.value.range, MarkerSeverity.Error));
	}

	private validateTarget(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.target);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'string') {
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

	private validateUserInvokable(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.userInvokable);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'boolean') {
			report(toMarker(localize('promptValidator.userInvokableMustBeBoolean', "The 'user-invokable' attribute must be a boolean."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateDisableModelInvocation(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.disableModelInvocation);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'boolean') {
			report(toMarker(localize('promptValidator.disableModelInvocationMustBeBoolean', "The 'disable-model-invocation' attribute must be a boolean."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private async validateAgentsAttribute(attributes: IHeaderAttribute[], header: PromptHeader, report: (markers: IMarkerData) => void): Promise<undefined> {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agents);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'array') {
			report(toMarker(localize('promptValidator.agentsMustBeArray', "The 'agents' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}

		// Collect available agent names
		const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
		const availableAgentNames = new Set<string>(agents.map(agent => agent.name));
		availableAgentNames.add(ChatMode.Agent.name.get()); // include default agent

		// Check each item is a string and agent exists
		const agentNames: string[] = [];
		for (const item of attribute.value.items) {
			if (item.type !== 'string') {
				report(toMarker(localize('promptValidator.eachAgentMustBeString', "Each agent name in the 'agents' attribute must be a string."), item.range, MarkerSeverity.Error));
			} else if (item.value) {
				agentNames.push(item.value);
				if (item.value !== '*' && !availableAgentNames.has(item.value)) {
					report(toMarker(localize('promptValidator.agentInAgentsNotFound', "Unknown agent '{0}'. Available agents: {1}.", item.value, Array.from(availableAgentNames).join(', ')), item.range, MarkerSeverity.Warning));
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
}

const allAttributeNames: Record<PromptsType, string[]> = {
	[PromptsType.prompt]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.mode, PromptHeaderAttributes.agent, PromptHeaderAttributes.argumentHint],
	[PromptsType.instructions]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.applyTo, PromptHeaderAttributes.excludeAgent],
	[PromptsType.agent]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.advancedOptions, PromptHeaderAttributes.handOffs, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.target, PromptHeaderAttributes.infer, PromptHeaderAttributes.agents, PromptHeaderAttributes.userInvokable, PromptHeaderAttributes.disableModelInvocation],
	[PromptsType.skill]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.license, PromptHeaderAttributes.compatibility, PromptHeaderAttributes.metadata, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.userInvokable, PromptHeaderAttributes.disableModelInvocation],
	[PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};
const githubCopilotAgentAttributeNames = [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.tools, PromptHeaderAttributes.target, GithubPromptHeaderAttributes.mcpServers, PromptHeaderAttributes.infer];
const recommendedAttributeNames: Record<PromptsType, string[]> = {
	[PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.agent]: allAttributeNames[PromptsType.agent].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.skill]: allAttributeNames[PromptsType.skill].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.hook]: [], // hooks are JSON files, not markdown with YAML frontmatter
};

export function getValidAttributeNames(promptType: PromptsType, includeNonRecommended: boolean, target: Target): string[] {
	if (target === Target.Claude) {
		return Object.keys(claudeAgentAttributes);
	} else if (target === Target.GitHubCopilot) {
		if (promptType === PromptsType.agent) {
			return githubCopilotAgentAttributeNames;
		}
	}
	return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}

export function isNonRecommendedAttribute(attributeName: string): boolean {
	return attributeName === PromptHeaderAttributes.advancedOptions || attributeName === PromptHeaderAttributes.excludeAgent || attributeName === PromptHeaderAttributes.mode || attributeName === PromptHeaderAttributes.infer;
}

export function getAttributeDescription(attributeName: string, promptType: PromptsType, target: Target): string | undefined {
	if (target === Target.Claude) {
		return claudeAgentAttributes[attributeName]?.description;
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
				case PromptHeaderAttributes.userInvokable:
					return localize('promptHeader.skill.userInvokable', 'Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true.');
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
				case PromptHeaderAttributes.userInvokable:
					return localize('promptHeader.agent.userInvokable', 'Whether the agent can be selected and invoked by users in the UI.');
				case PromptHeaderAttributes.disableModelInvocation:
					return localize('promptHeader.agent.disableModelInvocation', 'If true, prevents the agent from being invoked as a subagent.');
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

export interface IValueEntry {
	readonly name: string;
	readonly description?: string;
}

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

export function mapClaudeModels(claudeModelNames: readonly string[]): readonly string[] {
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
export function mapClaudeTools(claudeToolNames: readonly string[]): string[] {
	const result: string[] = [];
	for (const name of claudeToolNames) {
		const claudeTool = knownClaudeTools.find(tool => tool.name === name);
		if (claudeTool) {
			result.push(...claudeTool.toolEquivalent);
		}
	}
	return result;
}

export const claudeAgentAttributes: Record<string, { type: string; description: string; defaults?: string[]; items?: IValueEntry[]; enums?: IValueEntry[] }> = {
	'name': {
		type: 'string',
		description: localize('attribute.name', "Unique identifier using lowercase letters and hyphens (required)"),
	},
	'description': {
		type: 'string',
		description: localize('attribute.description', "When to delegate to this subagent (required)"),
	},
	'tools': {
		type: 'array',
		description: localize('attribute.tools', "Array of tools the subagent can use. Inherits all tools if omitted"),
		defaults: ['Read, Edit, Bash'],
		items: knownClaudeTools
	},
	'disallowedTools': {
		type: 'array',
		description: localize('attribute.disallowedTools', "Tools to deny, removed from inherited or specified list"),
		defaults: ['Write, Edit, Bash'],
		items: knownClaudeTools
	},
	'model': {
		type: 'string',
		description: localize('attribute.model', "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit."),
		defaults: ['sonnet', 'opus', 'haiku', 'inherit'],
		enums: knownClaudeModels
	},
	'permissionMode': {
		type: 'string',
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
		type: 'array',
		description: localize('attribute.skills', "Skills to load into the subagent's context at startup."),
	},
	'mcpServers': {
		type: 'array',
		description: localize('attribute.mcpServers', "MCP servers available to this subagent."),
	},
	'hooks': {
		type: 'object',
		description: localize('attribute.hooks', "Lifecycle hooks scoped to this subagent."),
	},
	'memory': {
		type: 'string',
		description: localize('attribute.memory', "Persistent memory scope: user, project, or local. Enables cross-session learning."),
		defaults: ['user', 'project', 'local'],
		enums: [
			{ name: 'user', description: localize('claude.memory.user', "Remember learnings across all projects.") },
			{ name: 'project', description: localize('claude.memory.project', "The subagent's knowledge is project-specific and shareable via version control.") },
			{ name: 'local', description: localize('claude.memory.local', "The subagent's knowledge is project-specific but should not be checked into version control.") }
		]
	}
};

export function isVSCodeOrDefaultTarget(target: Target): boolean {
	return target === Target.VSCode || target === Target.Undefined;
}

export function getTarget(promptType: PromptsType, header: PromptHeader | undefined): Target {
	if (header && promptType === PromptsType.agent) {
		const parentDir = dirname(header.uri);
		if (parentDir.path.endsWith(`/${CLAUDE_AGENTS_SOURCE_FOLDER}`)) {
			return Target.Claude;
		}
		const target = header.target;
		if (target === Target.GitHubCopilot || target === Target.VSCode) {
			return target;
		}
	}
	return Target.Undefined;
}

function toMarker(message: string, range: Range, severity = MarkerSeverity.Error): IMarkerData {
	return { severity, message, ...range };
}

export class PromptValidatorContribution extends Disposable {

	private readonly validator: PromptValidator;
	private readonly localDisposables = this._register(new DisposableStore());

	constructor(
		@IModelService private modelService: IModelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super();
		this.validator = instantiationService.createInstance(PromptValidator);

		this.updateRegistration();
	}

	updateRegistration(): void {
		this.localDisposables.clear();
		const trackers = new ResourceMap<ModelTracker>();
		this.localDisposables.add(toDisposable(() => {
			trackers.forEach(tracker => tracker.dispose());
			trackers.clear();
		}));
		this.modelService.getModels().forEach(model => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
			}
		});

		this.localDisposables.add(this.modelService.onModelAdded((model) => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType && !trackers.has(model.uri)) {
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
			}
		}));
		this.localDisposables.add(this.modelService.onModelRemoved((model) => {
			const tracker = trackers.get(model.uri);
			if (tracker) {
				tracker.dispose();
				trackers.delete(model.uri);
			}
		}));
		this.localDisposables.add(this.modelService.onModelLanguageChanged((event) => {
			const { model } = event;
			const tracker = trackers.get(model.uri);
			if (tracker) {
				tracker.dispose();
				trackers.delete(model.uri);
			}
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
			}
		}));

		const validateAll = (): void => trackers.forEach(tracker => tracker.validate());
		this.localDisposables.add(this.languageModelToolsService.onDidChangeTools(() => validateAll()));
		this.localDisposables.add(this.chatModeService.onDidChangeChatModes(() => validateAll()));
		this.localDisposables.add(this.languageModelsService.onDidChangeLanguageModels(() => validateAll()));
	}
}

class ModelTracker extends Disposable {

	private readonly delayer: Delayer<void>;

	constructor(
		private readonly textModel: ITextModel,
		private readonly promptType: PromptsType,
		private readonly validator: PromptValidator,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super();
		this.delayer = this._register(new Delayer<void>(200));
		this._register(textModel.onDidChangeContent(() => this.validate()));
		this.validate();
	}

	public validate(): void {
		this.delayer.trigger(async () => {
			const markers: IMarkerData[] = [];
			const ast = this.promptsService.getParsedPromptFile(this.textModel);
			await this.validator.validate(ast, this.promptType, m => markers.push(m));
			this.markerService.changeOne(MARKERS_OWNER_ID, this.textModel.uri, markers);
		});
	}

	public override dispose() {
		this.markerService.remove(MARKERS_OWNER_ID, [this.textModel.uri]);
		super.dispose();
	}
}
