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
import { IArrayValue, IHeaderAttribute, ParsedPromptFile } from './newPromptsParser.js';
import { PromptsConfig } from '../config/config.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptsService } from './promptsService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';

const MARKERS_OWNER_ID = 'prompts-diagnostics-provider';

export class PromptValidator {
	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService
	) { }

	public async validate(promptAST: ParsedPromptFile, promptType: PromptsType, report: (markers: IMarkerData) => void): Promise<void> {
		promptAST.header?.errors.forEach(error => report(toMarker(error.message, error.range, MarkerSeverity.Error)));
		this.validateHeader(promptAST, promptType, report);
		await this.validateBody(promptAST, report);
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

		// Validate variable references (tool or toolset names)
		if (body.variableReferences.length) {
			const available = this.getAvailableToolAndToolSetNames();
			for (const variable of body.variableReferences) {
				if (!available.has(variable.name)) {
					report(toMarker(localize('promptValidator.unknownVariableReference', "Unknown tool or toolset '{0}'.", variable.name), variable.range, MarkerSeverity.Warning));
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
		const validAttributeNames = getValidAttributeNames(promptType);
		const attributes = header.attributes;
		for (const attribute of attributes) {
			if (!validAttributeNames.includes(attribute.key)) {
				switch (promptType) {
					case PromptsType.prompt:
						report(toMarker(localize('promptValidator.unknownAttribute.prompt', "Attribute '{0}' is not supported in prompt files. Supported: {1}.", attribute.key, validAttributeNames.join(', ')), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.mode:
						report(toMarker(localize('promptValidator.unknownAttribute.mode', "Attribute '{0}' is not supported in mode files. Supported: {1}.", attribute.key, validAttributeNames.join(', ')), attribute.range, MarkerSeverity.Warning));
						break;
					case PromptsType.instructions:
						report(toMarker(localize('promptValidator.unknownAttribute.instructions', "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, validAttributeNames.join(', ')), attribute.range, MarkerSeverity.Warning));
						break;
				}
			}
		}
		this.validateDescription(attributes, report);
		switch (promptType) {
			case PromptsType.prompt: {
				const mode = this.validateMode(attributes, report);
				this.validateTools(attributes, mode?.kind ?? ChatModeKind.Agent, report);
				this.validateModel(attributes, mode?.kind ?? ChatModeKind.Agent, report);
				break;
			}
			case PromptsType.instructions:
				this.validateApplyTo(attributes, report);
				break;

			case PromptsType.mode:
				this.validateTools(attributes, ChatModeKind.Agent, report);
				this.validateModel(attributes, ChatModeKind.Agent, report);
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


	private validateModel(attributes: IHeaderAttribute[], modeKind: ChatModeKind, report: (markers: IMarkerData) => void): void {
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

		} else if (modeKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
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

	private validateMode(attributes: IHeaderAttribute[], report: (markers: IMarkerData) => void): IChatMode | undefined {
		const attribute = attributes.find(attr => attr.key === 'mode');
		if (!attribute) {
			return undefined; // default mode for prompts is Agent
		}
		if (attribute.value.type !== 'string') {
			report(toMarker(localize('promptValidator.modeMustBeString', "The 'mode' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
			return undefined;
		}
		const modeValue = attribute.value.value;
		if (modeValue.trim().length === 0) {
			report(toMarker(localize('promptValidator.modeMustBeNonEmpty', "The 'mode' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
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
		report(toMarker(errorMessage, attribute.value.range, MarkerSeverity.Warning));
		return undefined;
	}

	private validateTools(attributes: IHeaderAttribute[], modeKind: ChatModeKind, report: (markers: IMarkerData) => void): undefined {
		const attribute = attributes.find(attr => attr.key === 'tools');
		if (!attribute) {
			return;
		}
		if (modeKind !== ChatModeKind.Agent) {
			report(toMarker(localize('promptValidator.toolsOnlyInAgent', "The 'tools' attribute is only supported in agent mode. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));
		}

		switch (attribute.value.type) {
			case 'array':
				this.validateToolsArray(attribute.value, report);
				break;
			case 'object':
				//this.validateToolsObject(attribute.value, report);
				break;
			default:
				report(toMarker(localize('promptValidator.toolsMustBeArrayOrMap', "The 'tools' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
		}
	}

	private validateToolsArray(valueItem: IArrayValue, report: (markers: IMarkerData) => void) {
		if (valueItem.items.length > 0) {
			const available = this.getAvailableToolAndToolSetNames();
			for (const item of valueItem.items) {
				if (item.type !== 'string') {
					report(toMarker(localize('promptValidator.eachToolMustBeString', "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
				} else if (item.value && !available.has(item.value)) {
					report(toMarker(localize('promptValidator.toolNotFound', "Unknown tool '{0}'.", item.value), item.range, MarkerSeverity.Warning));
				}
			}
		}
	}

	private getAvailableToolAndToolSetNames(): Set<string> {
		const available = new Set<string>();
		for (const tool of this.languageModelToolsService.getTools()) {
			if (tool.canBeReferencedInPrompt) {
				available.add(tool.toolReferenceName ?? tool.displayName);
			}
		}
		for (const toolSet of this.languageModelToolsService.toolSets.get()) {
			available.add(toolSet.referenceName);
			for (const tool of toolSet.getTools()) {
				available.add(tool.toolReferenceName ?? tool.displayName);
			}
		}
		return available;
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
}

export function getValidAttributeNames(promptType: PromptsType): string[] {
	switch (promptType) {
		case PromptsType.prompt:
			return ['description', 'model', 'tools', 'mode'];
		case PromptsType.instructions:
			return ['description', 'applyTo'];
		case PromptsType.mode:
			return ['description', 'model', 'tools', 'advancedOptions'];
	}
}

export function isExperimentalAttribute(attributeName: string): boolean {
	return attributeName === 'advancedOptions';
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
		}));

		const validateAllDelayer = this._register(new Delayer<void>(200));
		const validateAll = (): void => {
			validateAllDelayer.trigger(async () => {
				this.modelService.getModels().forEach(model => {
					const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
					if (promptType) {
						trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
					}
				});
			});
		};
		this.localDisposables.add(this.modelService.onModelAdded((model) => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType) {
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
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
				trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
			}
		}));
		this.localDisposables.add(this.languageModelToolsService.onDidChangeTools(() => validateAll()));
		this.localDisposables.add(this.chatModeService.onDidChangeChatModes(() => validateAll()));
		this.localDisposables.add(this.languageModelsService.onDidChangeLanguageModels(() => validateAll()));
		validateAll();
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

	private validate(): void {
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
