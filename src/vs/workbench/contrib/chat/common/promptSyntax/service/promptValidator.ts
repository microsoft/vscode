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
import { IHeaderAttribute, NewPromptsParser, ParsedPromptFile } from './newPromptsParser.js';
import { PromptsConfig } from '../config/config.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../../base/common/map.js';

const MARKERS_OWNER_ID = 'prompts-diagnostics-provider';

export class PromptValidator {
	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) { }

	public validate(promptAST: ParsedPromptFile, promptType: PromptsType): IMarkerData[] {
		const markers: IMarkerData[] = [];
		promptAST.header?.errors.forEach(error => {
			markers.push(toMarker(error.message, error.range, MarkerSeverity.Error));
		});
		this.validateHeader(promptAST, promptType, markers);
		return markers;
	}

	private validateHeader(promptAST: ParsedPromptFile, promptType: PromptsType, result: IMarkerData[]): void {
		const header = promptAST.header;
		if (!header) {
			return;
		}
		const validAttributeNames = getValidAttributeNames(promptType);
		const attributes = header.attributes;
		for (const attribute of attributes) {
			if (!validAttributeNames.includes(attribute.key)) {
				switch (promptType) {
					case PromptsType.prompt:
						result.push(toMarker(localize('promptValidator.unknownAttribute.prompt', "Attribute '{0}' is not supported in prompt files. Supported: {1}", attribute.key, validAttributeNames.join(', ')), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.mode:
						result.push(toMarker(localize('promptValidator.unknownAttribute.mode', "Attribute '{0}' is not supported in mode files. Supported: {1}", attribute.key, validAttributeNames.join(', ')), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.instructions:
						result.push(toMarker(localize('promptValidator.unknownAttribute.instructions', "Attribute '{0}' is not supported in instructions files. Supported: {1}", attribute.key, validAttributeNames.join(', ')), attribute.range, MarkerSeverity.Warning));
						break;
				}
			}
		}
		this.validateDescription(attributes, result);
		switch (promptType) {
			case PromptsType.prompt: {
				const mode = this.validateMode(attributes, result);
				this.validateTools(attributes, mode?.kind ?? ChatModeKind.Agent, result);
				this.validateModel(attributes, mode?.kind ?? ChatModeKind.Agent, result);
				break;
			}
			case PromptsType.instructions:
				this.validateApplyTo(attributes, result);
				break;

			case PromptsType.mode:
				this.validateTools(attributes, ChatModeKind.Agent, result);
				this.validateModel(attributes, ChatModeKind.Agent, result);
				break;

		}
	}

	private validateDescription(attributes: IHeaderAttribute[], markers: IMarkerData[]): void {
		const descriptionAttribute = attributes.find(attr => attr.key === 'description');
		if (!descriptionAttribute) {
			return;
		}
		if (descriptionAttribute.value.type !== 'string') {
			markers.push(toMarker(localize('promptValidator.descriptionMustBeString', "The 'description' attribute must be a string."), descriptionAttribute.range, MarkerSeverity.Error));
			return;
		}
		if (descriptionAttribute.value.value.trim().length === 0) {
			markers.push(toMarker(localize('promptValidator.descriptionShouldNotBeEmpty', "The 'description' attribute should not be empty."), descriptionAttribute.value.range, MarkerSeverity.Error));
			return;
		}
	}


	private validateModel(attributes: IHeaderAttribute[], modeKind: ChatModeKind, markers: IMarkerData[]): void {
		const attribute = attributes.find(attr => attr.key === 'model');
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'string') {
			markers.push(toMarker(localize('promptValidator.modelMustBeString', "The 'model' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
		const modelName = attribute.value.value.trim();
		if (modelName.length === 0) {
			markers.push(toMarker(localize('promptValidator.modelMustBeNonEmpty', "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}

		const languageModes = this.languageModelsService.getLanguageModelIds();
		if (languageModes.length === 0) {
			// likely the service is not initialized yet
			return;
		}
		const modelMetadata = this.findModelByName(languageModes, modelName);
		if (!modelMetadata) {
			markers.push(toMarker(localize('promptValidator.modelNotFound', "Unknown model '{0}'.", modelName), attribute.value.range, MarkerSeverity.Warning));

		} else if (modeKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
			markers.push(toMarker(localize('promptValidator.modelNotSuited', "Model '{0}' is not suited for agent mode.", modelName), attribute.value.range, MarkerSeverity.Warning));
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

	private validateMode(attributes: IHeaderAttribute[], markers: IMarkerData[]): IChatMode | undefined {
		const attribute = attributes.find(attr => attr.key === 'mode');
		if (!attribute) {
			return undefined; // default mode for prompts is Agent
		}
		if (attribute.value.type !== 'string') {
			markers.push(toMarker(localize('promptValidator.modeMustBeString', "The 'mode' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
			return undefined;
		}
		const modeValue = attribute.value.value;
		if (modeValue.trim().length === 0) {
			markers.push(toMarker(localize('promptValidator.modeMustBeNonEmpty', "The 'mode' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
			return undefined;
		}

		const modes = this.chatModeService.getModes();
		const availableModes = [];

		// Check if mode exists in builtin or custom modes
		for (const mode of Iterable.concat(modes.builtin, modes.custom)) {
			if (mode.name === modeValue) {
				return mode;
			}
			availableModes.push(mode.name); // collect all available mode names
		}

		const errorMessage = localize('promptValidator.modeNotFound', "Unknown mode '{0}'. Available modes: {1}.", modeValue, availableModes.join(', '));
		markers.push(toMarker(errorMessage, attribute.value.range, MarkerSeverity.Warning));
		return undefined;
	}

	private validateTools(attributes: IHeaderAttribute[], modeKind: ChatModeKind, markers: IMarkerData[]): undefined {
		const attribute = attributes.find(attr => attr.key === 'tools');
		if (!attribute) {
			return;
		}
		if (modeKind !== ChatModeKind.Agent) {
			markers.push(toMarker(localize('promptValidator.toolsOnlyInAgent', "The 'tools' attribute is only supported in agent mode. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));

		}
		if (attribute.value.type !== 'array') {
			markers.push(toMarker(localize('promptValidator.toolsMustBeArray', "The 'tools' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
			return;
		}

		const toolNames = new Map<string, Range>();
		for (const item of attribute.value.items) {
			if (item.type !== 'string') {
				markers.push(toMarker(localize('promptValidator.eachToolMustBeString', "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
			} else {
				toolNames.set(item.value, item.range);
			}
		}
		if (toolNames.size === 0) {
			return;
		}
		for (const tool of this.languageModelToolsService.getTools()) {
			toolNames.delete(tool.toolReferenceName ?? tool.displayName);
		}
		for (const toolSet of this.languageModelToolsService.toolSets.get()) {
			toolNames.delete(toolSet.referenceName);
		}

		for (const [toolName, range] of toolNames) {
			markers.push(toMarker(localize('promptValidator.toolNotFound', "Unknown tool '{0}'.", toolName), range, MarkerSeverity.Warning));
		}
	}

	private validateApplyTo(attributes: IHeaderAttribute[], markers: IMarkerData[]): undefined {
		const attribute = attributes.find(attr => attr.key === 'applyTo');
		if (!attribute) {
			return;
		}
		if (attribute.value.type !== 'string') {
			markers.push(toMarker(localize('promptValidator.applyToMustBeString', "The 'applyTo' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
			return;
		}
		const pattern = attribute.value.value;
		try {
			const patterns = splitGlobAware(pattern, ',');
			if (patterns.length === 0) {
				markers.push(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
				return;
			}
			for (const pattern of patterns) {
				const globPattern = parse(pattern);
				if (isEmptyPattern(globPattern)) {
					markers.push(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
					return;
				}
			}
		} catch (_error) {
			markers.push(toMarker(localize('promptValidator.applyToMustBeValidGlob', "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
		}
	}
}

function getValidAttributeNames(promptType: PromptsType): string[] {
	switch (promptType) {
		case PromptsType.prompt:
			return ['description', 'model', 'tools', 'mode'];
		case PromptsType.instructions:
			return ['description', 'applyTo'];
		case PromptsType.mode:
			return ['description', 'model', 'tools'];
	}
}

function toMarker(message: string, range: Range, severity = MarkerSeverity.Error): IMarkerData {
	return { severity, message, ...range };
}

export class PromptValidatorContribution extends Disposable {

	private readonly validator: PromptValidator;
	private readonly promptParser: NewPromptsParser;
	private readonly localDisposables = this._register(new DisposableStore());

	constructor(
		@IModelService private modelService: IModelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private configService: IConfigurationService,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super();
		this.validator = instantiationService.createInstance(PromptValidator);
		this.promptParser = instantiationService.createInstance(NewPromptsParser);

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
		}));
		this.modelService.getModels().forEach(model => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptParser, this.markerService));
			}
		});
		this.localDisposables.add(this.modelService.onModelAdded((model) => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptParser, this.markerService));
			}
		}));
		this.localDisposables.add(this.modelService.onModelRemoved((model) => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				const tracker = trackers.get(model.uri);
				if (tracker) {
					tracker.dispose();
					trackers.delete(model.uri);
				}
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
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptParser, this.markerService));
			}
		}));
	}
}

class ModelTracker extends Disposable {

	private readonly delayer: Delayer<void>;

	constructor(
		private readonly textModel: ITextModel,
		private readonly promptType: PromptsType,
		private readonly validator: PromptValidator,
		private readonly promptParser: NewPromptsParser,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super();
		this.delayer = this._register(new Delayer<void>(200));
		this._register(textModel.onDidChangeContent(() => this.validate()));
		this.validate();
	}

	private validate(): void {
		this.delayer.trigger(() => {
			const ast = this.promptParser.parse(this.textModel.uri, this.textModel.getValue());
			const markers = this.validator.validate(ast, this.promptType);
			this.markerService.changeOne(MARKERS_OWNER_ID, this.textModel.uri, markers);
		});
	}

	public override dispose() {
		this.markerService.remove(MARKERS_OWNER_ID, [this.textModel.uri]);
		super.dispose();
	}
}
