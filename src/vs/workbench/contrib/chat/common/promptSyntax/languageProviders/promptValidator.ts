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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { IChatMode, IChatModeService } from '../../chatModes.js';
import { ChatModeKind } from '../../constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IArrayValue, IHeaderAttribute, ParsedPromptFile } from '../promptFileParser.js';
import { PromptsConfig } from '../config/config.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptsService } from '../service/promptsService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { AGENTS_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION } from '../config/promptFileLocations.js';

const MARKERS_OWNER_ID = 'prompts-diagnostics-provider';

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
		this.validateHeader(promptAST, promptType, report);
		await this.validateBody(promptAST, report);
		await this.validateFileName(promptAST, promptType, report);
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

	private async validateBody(promptAST: ParsedPromptFile, report: (markers: IMarkerData) => void): Promise<void> {
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
		if (body.variableReferences.length) {
			const headerTools = promptAST.header?.tools;
			const headerToolsMap = headerTools ? this.languageModelToolsService.toToolAndToolSetEnablementMap(headerTools) : undefined;

			const available = new Set<string>(this.languageModelToolsService.getQualifiedToolNames());
			const deprecatedNames = this.languageModelToolsService.getDeprecatedQualifiedToolNames();
			for (const variable of body.variableReferences) {
				if (!available.has(variable.name)) {
					if (deprecatedNames.has(variable.name)) {
						const currentName = deprecatedNames.get(variable.name);
						report(toMarker(localize('promptValidator.deprecatedVariableReference', "Tool or toolset '{0}' has been renamed, use '{1}' instead.", variable.name, currentName), variable.range, MarkerSeverity.Info));
					} else {
						report(toMarker(localize('promptValidator.unknownVariableReference', "Unknown tool or toolset '{0}'.", variable.name), variable.range, MarkerSeverity.Warning));
					}
				} else if (headerToolsMap) {
					const tool = this.languageModelToolsService.getToolByQualifiedName(variable.name);
					if (tool && headerToolsMap.get(tool) === false) {
						report(toMarker(localize('promptValidator.disabledTool', "Tool or toolset '{0}' also needs to be enabled in the header.", variable.name), variable.range, MarkerSeverity.Warning));
					}
				}
			}
		}

		await Promise.all(fileReferenceChecks);
	}

	private validateHeader(promptAST: ParsedPromptFile, promptType: PromptsType, report: (markers: IMarkerData) => void): void {
		const header = promptAST.header;
		if (!header) {
			return;
		}
		const validAttributeNames = getValidAttributeNames(promptType, true);
		const attributes = header.attributes;
		for (const attribute of attributes) {
			if (!validAttributeNames.includes(attribute.key)) {
				const supportedNames = getValidAttributeNames(promptType, false).join(', ');
				switch (promptType) {
					case PromptsType.prompt:
						report(toMarker(localize('promptValidator.unknownAttribute.prompt', "Attribute '{0}' is not supported in prompt files. Supported: {1}.", attribute.key, supportedNames), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.agent:
						report(toMarker(localize('promptValidator.unknownAttribute.agent', "Attribute '{0}' is not supported in agent files. Supported: {1}.", attribute.key, supportedNames), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.instructions:
						report(toMarker(localize('promptValidator.unknownAttribute.instructions', "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, supportedNames), attribute.range, MarkerSeverity.Warning));
						break;
				}
			}
		}
		this.validateDescription(attributes, report);
		switch (promptType) {
			case PromptsType.prompt: {
				const agent = this.validateAgent(attributes, report);
				this.validateTools(attributes, agent?.kind ?? ChatModeKind.Agent, report);
				this.validateModel(attributes, agent?.kind ?? ChatModeKind.Agent, report);
				break;
			}
			case PromptsType.instructions:
				this.validateApplyTo(attributes, report);
				this.validateExcludeAgent(attributes, report);
				break;

			case PromptsType.agent:
				this.validateTools(attributes, ChatModeKind.Agent, report);
				this.validateModel(attributes, ChatModeKind.Agent, report);
				this.validateHandoffs(attributes, report);
				break;

		}
	}

	private validateDescription(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): void {
		const descriptionAttribute = attributes.find(attr => attr.key === 'description');
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


	private validateModel(attributes: IHeaderAttribute[], agentKind: ChatModeKind, report: (markers: IMarkerData) => void): void {
		const attribute = attributes.find(attr => attr.key === 'model');
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'string') {
			report(toMarker(localize('promptValidator.modelMustBeString', "The 'model' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
		const modelName = attribute.value.value.trim();
		if (modelName.length === 0) {
			report(toMarker(localize('promptValidator.modelMustBeNonEmpty', "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}

		const languageModes = this.languageModelsService.getLanguageModelIds();
		if (languageModes.length === 0) {
			// likely the service is not initialized yet
			return;
		}
		const modelMetadata = this.findModelByName(languageModes, modelName);
		if (!modelMetadata) {
			report(toMarker(localize('promptValidator.modelNotFound', "Unknown model '{0}'.", modelName), attribute.value.range, MarkerSeverity.Warning));

		} else if (agentKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
			report(toMarker(localize('promptValidator.modelNotSuited', "Model '{0}' is not suited for agent mode.", modelName), attribute.value.range, MarkerSeverity.Warning));
		}
	}

	private findModelByName(languageModes: string[], modelName: string): ILanguageModelChatMetadata | undefined {
		for (const model of languageModes) {
			const metadata = this.languageModelsService.lookupLanguageModel(model);
			if (metadata && metadata.isUserSelectable !== false && ILanguageModelChatMetadata.matchesQualifiedName(modelName, metadata)) {
				return metadata;
			}
		}
		return undefined;
	}

	private validateAgent(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): IChatMode | undefined {
		const agentAttribute = attributes.find(attr => attr.key === 'agent');
		const modeAttribute = attributes.find(attr => attr.key === 'mode');
		if (modeAttribute) {
			if (agentAttribute) {
				report(toMarker(localize('promptValidator.modeDeprecated', "The 'mode' attribute has been deprecated. The 'agent' attribute is used instead."), modeAttribute.range, MarkerSeverity.Warning));
			} else {
				report(toMarker(localize('promptValidator.modeDeprecated.useAgent', "The 'mode' attribute has been deprecated. Please rename it to 'agent'."), modeAttribute.range, MarkerSeverity.Error));
			}
		}

		const attribute = attributes.find(attr => attr.key === 'agent') ?? modeAttribute;
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

		const agents = this.chatModeService.getModes();
		const availableAgents = [];

		// Check if agent exists in builtin or custom agents
		for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
			if (agent.name === agentValue) {
				return agent;
			}
			availableAgents.push(agent.name); // collect all available agent names
		}

		const errorMessage = localize('promptValidator.agentNotFound', "Unknown agent '{0}'. Available agents: {1}.", agentValue, availableAgents.join(', '));
		report(toMarker(errorMessage, attribute.value.range, MarkerSeverity.Warning));
		return undefined;
	}

	private validateTools(attributes: IHeaderAttribute[], agentKind: ChatModeKind, report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === 'tools');
		if (!attribute) {
			return;
		}
		if (agentKind !== ChatModeKind.Agent) {
			report(toMarker(localize('promptValidator.toolsOnlyInAgent', "The 'tools' attribute is only supported in agent mode. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));
		}

		switch (attribute.value.type) {
			case 'array':
				this.validateToolsArray(attribute.value, report);
				break;
			default:
				report(toMarker(localize('promptValidator.toolsMustBeArrayOrMap', "The 'tools' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
		}
	}

	private validateToolsArray(valueItem: IArrayValue, report: (markers: IMarkerData) => void) {
		if (valueItem.items.length > 0) {
			const available = new Set<string>(this.languageModelToolsService.getQualifiedToolNames());
			const deprecatedNames = this.languageModelToolsService.getDeprecatedQualifiedToolNames();
			for (const item of valueItem.items) {
				if (item.type !== 'string') {
					report(toMarker(localize('promptValidator.eachToolMustBeString', "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
				} else if (item.value && !available.has(item.value)) {
					if (deprecatedNames.has(item.value)) {
						const currentName = deprecatedNames.get(item.value);
						report(toMarker(localize('promptValidator.toolDeprecated', "Tool or toolset '{0}' has been renamed, use '{1}' instead.", item.value, currentName), item.range, MarkerSeverity.Info));
					} else {
						report(toMarker(localize('promptValidator.toolNotFound', "Unknown tool '{0}'.", item.value), item.range, MarkerSeverity.Warning));
					}
				}
			}
		}
	}

	private validateApplyTo(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === 'applyTo');
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
		const attribute = attributes.find(attr => attr.key === 'excludeAgent');
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'array') {
			report(toMarker(localize('promptValidator.excludeAgentMustBeArray', "The 'excludeAgent' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
	}

	private validateHandoffs(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === 'handoffs');
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
					default:
						report(toMarker(localize('promptValidator.unknownHandoffProperty', "Unknown property '{0}' in handoff object. Supported properties are 'label', 'agent', 'prompt' and optional 'send'.", prop.key.value), prop.value.range, MarkerSeverity.Warning));
				}
				required.delete(prop.key.value);
			}
			if (required.size > 0) {
				report(toMarker(localize('promptValidator.missingHandoffProperties', "Missing required properties {0} in handoff object.", Array.from(required).map(s => `'${s}'`).join(', ')), item.range, MarkerSeverity.Error));
			}
		}
	}
}

const allAttributeNames = {
	[PromptsType.prompt]: ['description', 'model', 'tools', 'mode', 'agent'],
	[PromptsType.instructions]: ['description', 'applyTo', 'excludeAgent'],
	[PromptsType.agent]: ['description', 'model', 'tools', 'advancedOptions', 'handoffs']
};
const recommendedAttributeNames = {
	[PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter(name => !isNonRecommendedAttribute(name)),
	[PromptsType.agent]: allAttributeNames[PromptsType.agent].filter(name => !isNonRecommendedAttribute(name))
};

export function getValidAttributeNames(promptType: PromptsType, includeNonRecommended: boolean): string[] {
	return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}

export function isNonRecommendedAttribute(attributeName: string): boolean {
	return attributeName === 'advancedOptions' || attributeName === 'excludeAgent' || attributeName === 'mode';
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
		@IConfigurationService private configService: IConfigurationService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super();
		this.validator = instantiationService.createInstance(PromptValidator);

		this.updateRegistration();
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PromptsConfig.KEY)) {
				this.updateRegistration();
			}
		}));
	}

	updateRegistration(): void {
		this.localDisposables.clear();
		if (!PromptsConfig.enabled(this.configService)) {
			return;
		}
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
