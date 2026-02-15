/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../common/widget/input/modelPickerWidget.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

export interface DefaultModelArrays {
	readonly modelIds: string[];
	readonly modelLabels: string[];
	readonly modelDescriptions: string[];
}

export interface DefaultModelContributionOptions {
	/** Configuration key for the setting (used in schema notification). */
	readonly configKey: string;
	/** Configuration section id for `notifyConfigurationSchemaUpdated`, or `undefined` to skip notification. */
	readonly configSectionId: string | undefined;
	/** Log prefix, e.g. `'[PlanAgentDefaultModel]'`. */
	readonly logPrefix: string;
	/** Additional filter beyond `isUserSelectable`. Return `true` to include the model. */
	readonly filter?: (metadata: ILanguageModelChatMetadata) => boolean;
}

/**
 * Creates the initial static arrays used by configuration registration code.
 * The returned arrays are mutated in-place by {@link DefaultModelContribution}.
 */
export function createDefaultModelArrays(): DefaultModelArrays {
	return {
		modelIds: [''],
		modelLabels: [localize('defaultModel', 'Auto (Vendor Default)')],
		modelDescriptions: [localize('defaultModelDescription', "Use the vendor's default model")],
	};
}

/**
 * Shared base class for workbench contributions that populate a dynamic enum
 * of language models for a settings picker.
 */
export abstract class DefaultModelContribution extends Disposable {

	constructor(
		private readonly _arrays: DefaultModelArrays,
		private readonly _options: DefaultModelContributionOptions,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_languageModelsService.onDidChangeLanguageModels(() => this._updateModelValues()));
		this._updateModelValues();
	}

	private _updateModelValues(): void {
		const { modelIds, modelLabels, modelDescriptions } = this._arrays;
		const { configKey, configSectionId, logPrefix, filter } = this._options;

		try {
			// Clear arrays
			modelIds.length = 0;
			modelLabels.length = 0;
			modelDescriptions.length = 0;

			// Add default/empty option
			modelIds.push('');
			modelLabels.push(localize('defaultModel', 'Auto (Vendor Default)'));
			modelDescriptions.push(localize('defaultModelDescription', "Use the vendor's default model"));

			const models: { identifier: string; metadata: ILanguageModelChatMetadata }[] = [];
			const allModelIds = this._languageModelsService.getLanguageModelIds();

			for (const modelId of allModelIds) {
				try {
					const metadata = this._languageModelsService.lookupLanguageModel(modelId);
					if (metadata) {
						models.push({ identifier: modelId, metadata });
					} else {
						this._logService.warn(`${logPrefix} No metadata found for model ID: ${modelId}`);
					}
				} catch (e) {
					this._logService.error(`${logPrefix} Error looking up model ${modelId}:`, e);
				}
			}

			const supportedModels = models.filter(model => {
				if (!model.metadata?.isUserSelectable) {
					return false;
				}
				if (filter && !filter(model.metadata)) {
					return false;
				}
				return true;
			});

			supportedModels.sort((a, b) => {
				const aCategory = a.metadata.modelPickerCategory ?? DEFAULT_MODEL_PICKER_CATEGORY;
				const bCategory = b.metadata.modelPickerCategory ?? DEFAULT_MODEL_PICKER_CATEGORY;

				if (aCategory.order !== bCategory.order) {
					return aCategory.order - bCategory.order;
				}

				return a.metadata.name.localeCompare(b.metadata.name);
			});

			for (const model of supportedModels) {
				try {
					const qualifiedName = ILanguageModelChatMetadata.asQualifiedName(model.metadata);
					modelIds.push(qualifiedName);
					modelLabels.push(model.metadata.name);
					modelDescriptions.push(model.metadata.tooltip ?? model.metadata.detail ?? '');
				} catch (e) {
					this._logService.error(`${logPrefix} Error adding model ${model.metadata.name}:`, e);
				}
			}

			if (configSectionId) {
				configurationRegistry.notifyConfigurationSchemaUpdated({
					id: configSectionId,
					properties: {
						[configKey]: {}
					}
				});
			}
		} catch (e) {
			this._logService.error(`${logPrefix} Error updating model values:`, e);
		}
	}
}
