/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/promptsService.js';
import { ProviderInstanceBase } from './providerInstanceBase.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { assertNever } from '../../../../../../base/common/assert.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ProviderInstanceManagerBase, TProviderClass } from './providerInstanceManagerBase.js';
import { TDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../parsers/promptHeader/diagnostics.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { PromptHeader } from '../parsers/promptHeader/promptHeader.js';
import { PromptToolsMetadata } from '../parsers/promptHeader/metadata/tools.js';
import { PromptModelMetadata } from '../parsers/promptHeader/metadata/model.js';
import { ModeHeader } from '../parsers/promptHeader/modeHeader.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { localize } from '../../../../../../nls.js';
import { ChatModeKind } from '../../constants.js';
import { IChatMode, IChatModeService } from '../../chatModes.js';
import { PromptModeMetadata } from '../parsers/promptHeader/metadata/mode.js';
import { Iterable } from '../../../../../../base/common/iterator.js';

/**
 * Unique ID of the markers provider class.
 */
const MARKERS_OWNER_ID = 'prompts-header-diagnostics-provider';

/**
 * Prompt header diagnostics provider for an individual text model
 * of a prompt file.
 */
class PromptHeaderDiagnosticsProvider extends ProviderInstanceBase {
	constructor(
		model: ITextModel,
		@IPromptsService promptsService: IPromptsService,
		@IMarkerService private readonly markerService: IMarkerService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) {
		super(model, promptsService);
		this._register(languageModelsService.onDidChangeLanguageModels(() => {
			this.onPromptSettled(undefined, CancellationToken.None);
		}));
		this._register(languageModelToolsService.onDidChangeTools(() => {
			this.onPromptSettled(undefined, CancellationToken.None);
		}));
		this._register(chatModeService.onDidChangeChatModes(() => {
			this.onPromptSettled(undefined, CancellationToken.None);
		}));
	}

	/**
	 * Update diagnostic markers for the current editor.
	 */
	protected override async onPromptSettled(
		_error: Error | undefined,
		token: CancellationToken,
	): Promise<void> {

		const { header } = this.parser;
		if (header === undefined) {
			this.markerService.remove(MARKERS_OWNER_ID, [this.model.uri]);
			return;
		}

		// header parsing process is separate from the prompt parsing one, hence
		// apply markers only after the header is settled and so has diagnostics
		const completed = await header.settled;
		if (!completed || token.isCancellationRequested) {
			return;
		}

		const markers: IMarkerData[] = [];
		for (const diagnostic of header.diagnostics) {
			markers.push(toMarker(diagnostic));
		}

		if (header instanceof PromptHeader) {
			const mode = this.validateMode(header.metadataUtility.mode, markers);
			this.validateTools(header.metadataUtility.tools, mode?.kind, markers);
			this.validateModel(header.metadataUtility.model, mode?.kind, markers);
		} else if (header instanceof ModeHeader) {
			this.validateTools(header.metadataUtility.tools, ChatModeKind.Agent, markers);
			this.validateModel(header.metadataUtility.model, ChatModeKind.Agent, markers);

		}

		if (markers.length === 0) {
			this.markerService.remove(MARKERS_OWNER_ID, [this.model.uri]);
			return;
		}

		this.markerService.changeOne(
			MARKERS_OWNER_ID,
			this.model.uri,
			markers,
		);
		return;
	}
	validateModel(modelNode: PromptModelMetadata | undefined, modeKind: string | ChatModeKind | undefined, markers: IMarkerData[]) {
		if (!modelNode || modelNode.value === undefined) {
			return;
		}
		const languageModes = this.languageModelsService.getLanguageModelIds();
		if (languageModes.length === 0) {
			// likely the service is not initialized yet
			return;
		}
		const modelMetadata = this.findModelByName(languageModes, modelNode.value);
		if (!modelMetadata) {
			markers.push({
				message: localize('promptHeaderDiagnosticsProvider.modelNotFound', "Unknown model '{0}'", modelNode.value),
				severity: MarkerSeverity.Warning,
				...modelNode.range,
			});
		} else if (modeKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
			markers.push({
				message: localize('promptHeaderDiagnosticsProvider.modelNotSuited', "Model '{0}' is not suited for agent mode", modelNode.value),
				severity: MarkerSeverity.Warning,
				...modelNode.range,
			});
		}

	}
	findModelByName(languageModes: string[], modelName: string): ILanguageModelChatMetadata | undefined {
		for (const model of languageModes) {
			const metadata = this.languageModelsService.lookupLanguageModel(model);
			if (metadata && metadata.isUserSelectable !== false && ILanguageModelChatMetadata.asQualifiedName(metadata) === modelName) {
				return metadata;
			}
		}
		return undefined;
	}

	validateTools(tools: PromptToolsMetadata | undefined, modeKind: string | ChatModeKind | undefined, markers: IMarkerData[]) {
		if (!tools || tools.value === undefined || modeKind === ChatModeKind.Ask || modeKind === ChatModeKind.Edit) {
			return;
		}
		const toolNames = new Set(tools.value);
		if (toolNames.size === 0) {
			return;
		}
		for (const tool of this.languageModelToolsService.getTools()) {
			toolNames.delete(tool.toolReferenceName ?? tool.displayName);
		}
		for (const toolSet of this.languageModelToolsService.toolSets.get()) {
			toolNames.delete(toolSet.referenceName);
		}

		for (const toolName of toolNames) {
			const range = tools.getToolRange(toolName);
			if (range) {
				markers.push({
					message: localize('promptHeaderDiagnosticsProvider.toolNotFound', "Unknown tool '{0}'", toolName),
					severity: MarkerSeverity.Warning,
					...range,
				});
			}
		}
	}

	validateMode(modeNode: PromptModeMetadata | undefined, markers: IMarkerData[]): IChatMode | undefined {
		if (!modeNode || modeNode.value === undefined) {
			return;
		}

		const modeValue = modeNode.value;
		const modes = this.chatModeService.getModes();
		const availableModes = [];

		// Check if mode exists in builtin or custom modes
		for (const mode of Iterable.concat(modes.builtin, modes.custom)) {
			if (mode.name === modeValue) {
				return mode;
			}
			availableModes.push(mode.name); // collect all available mode names
		}

		markers.push({
			message: localize('promptHeaderDiagnosticsProvider.modeNotFound', "Unknown mode '{0}'. Available modes: {1}", modeValue, availableModes.join(', ')),
			severity: MarkerSeverity.Warning,
			...modeNode.range,
		});
		return undefined;

	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `prompt-header-diagnostics:${this.model.uri.path}`;
	}
}

/**
 * Convert a provided diagnostic object into a marker data object.
 */
function toMarker(diagnostic: TDiagnostic): IMarkerData {
	if (diagnostic instanceof PromptMetadataWarning) {
		return {
			message: diagnostic.message,
			severity: MarkerSeverity.Warning,
			...diagnostic.range,
		};
	}

	if (diagnostic instanceof PromptMetadataError) {
		return {
			message: diagnostic.message,
			severity: MarkerSeverity.Error,
			...diagnostic.range,
		};
	}

	assertNever(
		diagnostic,
		`Unknown prompt metadata diagnostic type '${diagnostic}'.`,
	);
}

/**
 * The class that manages creation and disposal of {@link PromptHeaderDiagnosticsProvider}
 * classes for each specific editor text model.
 */
export class PromptHeaderDiagnosticsInstanceManager extends ProviderInstanceManagerBase<PromptHeaderDiagnosticsProvider> {
	protected override get InstanceClass(): TProviderClass<PromptHeaderDiagnosticsProvider> {
		return PromptHeaderDiagnosticsProvider;
	}
}
