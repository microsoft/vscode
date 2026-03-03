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
import { ISequenceValue, IHeaderAttribute, IScalarValue, parseCommaSeparatedList, ParsedPromptFile, PromptHeader, IValue, PromptHeaderAttributes } from '../promptFileParser.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptsService, Target } from '../service/promptsService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { AGENTS_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { claudeAgentAttributes, getTarget, getValidAttributeNames, GithubPromptHeaderAttributes, isVSCodeOrDefaultTarget } from './promptFileAttributes.js';


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
		const target = getTarget(promptType, promptAST.header ?? promptAST.uri);
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
		if (!nameAttribute || nameAttribute.value.type !== 'scalar') {
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
				if (target === Target.Claude) {
					this.validatePaths(attributes, report);
				} else {
					this.validateApplyTo(attributes, report);
				}
				this.validateExcludeAgent(attributes, report);
				break;

			case PromptsType.agent: {
				this.validateTarget(attributes, report);
				this.validateInfer(attributes, report);
				this.validateUserInvocable(attributes, report);
				this.validateUserInvokable(attributes, report);
				this.validateDisableModelInvocation(attributes, report);
				this.validateTools(attributes, ChatModeKind.Agent, target, report);
				if (isVSCodeOrDefaultTarget(target)) {
					this.validateModel(attributes, ChatModeKind.Agent, report);
					this.validateHandoffs(attributes, report);
					await this.validateAgentsAttribute(attributes, header, report);
					this.validateGithubPermissions(attributes, report);
				} else if (target === Target.Claude) {
					this.validateClaudeAttributes(attributes, report);
				} else if (target === Target.GitHubCopilot) {
					this.validateGithubPermissions(attributes, report);
				}
				break;
			}

			case PromptsType.skill:
				this.validateUserInvocable(attributes, report);
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
						if (target === Target.Claude) {
							report(toMarker(localize('promptValidator.unknownAttribute.rules', "Attribute '{0}' is not supported in rules files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
						} else {
							report(toMarker(localize('promptValidator.unknownAttribute.instructions', "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Warning));
						}
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
		if (nameAttribute.value.type !== 'scalar') {
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
		if (descriptionAttribute.value.type !== 'scalar') {
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
		if (argumentHintAttribute.value.type !== 'scalar') {
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
		if (attribute.value.type !== 'scalar' && attribute.value.type !== 'sequence') {
			report(toMarker(localize('promptValidator.modelMustBeStringOrArray', "The 'model' attribute must be a string or an array of strings."), attribute.value.range, MarkerSeverity.Error));
			return;
		}

		const modelNames: [string, Range][] = [];
		if (attribute.value.type === 'scalar') {
			const modelName = attribute.value.value.trim();
			if (modelName.length === 0) {
				report(toMarker(localize('promptValidator.modelMustBeNonEmpty', "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
				return;
			}
			modelNames.push([modelName, attribute.value.range]);
		} else if (attribute.value.type === 'sequence') {
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
				if (attribute.value.type !== 'scalar') {
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

	private validateAgentValue(value: IScalarValue, report: (markers: IMarkerData) => void): IChatMode | undefined {
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
		if (value.type === 'scalar') {
			value = parseCommaSeparatedList(value);
		}
		if (value.type !== 'sequence') {
			report(toMarker(localize('promptValidator.toolsMustBeArrayOrMap', "The 'tools' attribute must be an array or a comma separated string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
		if (target === Target.GitHubCopilot || target === Target.Claude) {
			// no validation for github-copilot target and claude
		} else {
			this.validateVSCodeTools(value, report);
		}
	}

	private validateVSCodeTools(valueItem: ISequenceValue, report: (markers: IMarkerData) => void) {
		if (valueItem.items.length > 0) {
			const available = new Set<string>(this.languageModelToolsService.getFullReferenceNames());
			const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
			for (const item of valueItem.items) {
				if (item.type !== 'scalar') {
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
		} catch (_error) {
			report(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
		}
	}

	private validatePaths(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
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
			} catch (_error) {
				report(toMarker(localize('promptValidator.pathMustBeValidGlob', "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
			}
		}
	}

	private validateExcludeAgent(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.excludeAgent);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'sequence' && attribute.value.type !== 'scalar') {
			report(toMarker(localize('promptValidator.excludeAgentMustBeArray', "The 'excludeAgent' attribute must be an string or array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateHandoffs(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.handOffs);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'sequence') {
			report(toMarker(localize('promptValidator.handoffsMustBeArray', "The 'handoffs' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
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
						break;
					case 'agent':
						if (prop.value.type !== 'scalar' || prop.value.value.trim().length === 0) {
							report(toMarker(localize('promptValidator.handoffAgentMustBeNonEmptyString', "The 'agent' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
						} else {
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
		}
	}

	private validateInfer(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.infer);
		if (!attribute) {
			return;
		}
		report(toMarker(localize('promptValidator.inferDeprecated', "The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'."), attribute.value.range, MarkerSeverity.Error));
	}

	private validateTarget(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
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

	private validateUserInvocable(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.userInvocable);
		if (!attribute) {
			return;
		}
		if (!isTrueOrFalse(attribute.value)) {
			report(toMarker(localize('promptValidator.userInvocableMustBeBoolean', "The 'user-invocable' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateUserInvokable(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.userInvokable);
		if (!attribute) {
			return;
		}
		report(toMarker(localize('promptValidator.userInvokableDeprecated', "The 'user-invokable' attribute is deprecated. Use 'user-invocable' instead."), attribute.range, MarkerSeverity.Warning));
	}

	private validateDisableModelInvocation(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.disableModelInvocation);
		if (!attribute) {
			return;
		}
		if (!isTrueOrFalse(attribute.value)) {
			report(toMarker(localize('promptValidator.disableModelInvocationMustBeBoolean', "The 'disable-model-invocation' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private async validateAgentsAttribute(attributes: IHeaderAttribute[], header: PromptHeader, report: (markers: IMarkerData) => void): Promise<undefined> {
		const attribute = attributes.find(attr => attr.key === PromptHeaderAttributes.agents);
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'sequence') {
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
			if (item.type !== 'scalar') {
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

	private validateGithubPermissions(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): void {
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
}

export const githubPermissionScopes: Record<string, { allowedValues: string[]; description: string }> = {
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

function isTrueOrFalse(value: IValue): boolean {
	if (value.type === 'scalar') {
		return (value.value === 'true' || value.value === 'false') && value.format === 'none';
	}
	return false;
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
