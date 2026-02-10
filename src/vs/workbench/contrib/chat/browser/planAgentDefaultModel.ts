/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../common/widget/input/modelPickerWidget.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

export class PlanAgentDefaultModel extends Disposable {
	static readonly ID = 'workbench.contrib.planAgentDefaultModel';
	static readonly configName = ChatConfiguration.PlanAgentDefaultModel;

	static modelIds: string[] = [''];
	static modelLabels: string[] = [localize('defaultModel', 'Auto (Vendor Default)')];
	static modelDescriptions: string[] = [localize('defaultModelDescription', "Use the vendor's default model")];

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(languageModelsService.onDidChangeLanguageModels(() => this._updateModelValues()));
		this._updateModelValues();
	}

	private _updateModelValues(): void {
		try {
			// Clear arrays
			PlanAgentDefaultModel.modelIds.length = 0;
			PlanAgentDefaultModel.modelLabels.length = 0;
			PlanAgentDefaultModel.modelDescriptions.length = 0;

			// Add default/empty option
			PlanAgentDefaultModel.modelIds.push('');
			PlanAgentDefaultModel.modelLabels.push(localize('defaultModel', 'Auto (Vendor Default)'));
			PlanAgentDefaultModel.modelDescriptions.push(localize('defaultModelDescription', "Use the vendor's default model"));

			const models: { identifier: string; metadata: ILanguageModelChatMetadata }[] = [];
			const modelIds = this.languageModelsService.getLanguageModelIds();

			for (const modelId of modelIds) {
				try {
					const metadata = this.languageModelsService.lookupLanguageModel(modelId);
					if (metadata) {
						models.push({ identifier: modelId, metadata });
					} else {
						this.logService.warn(`[PlanAgentDefaultModel] No metadata found for model ID: ${modelId}`);
					}
				} catch (e) {
					this.logService.error(`[PlanAgentDefaultModel] Error looking up model ${modelId}:`, e);
				}
			}

			const supportedModels = models.filter(model => {
				if (!model.metadata?.isUserSelectable) {
					return false;
				}
				if (!model.metadata.capabilities?.toolCalling) {
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
					const qualifiedName = `${model.metadata.name} (${model.metadata.vendor})`;
					PlanAgentDefaultModel.modelIds.push(qualifiedName);
					PlanAgentDefaultModel.modelLabels.push(model.metadata.name);
					PlanAgentDefaultModel.modelDescriptions.push(model.metadata.tooltip ?? model.metadata.detail ?? '');
				} catch (e) {
					this.logService.error(`[PlanAgentDefaultModel] Error adding model ${model.metadata.name}:`, e);
				}
			}

			configurationRegistry.notifyConfigurationSchemaUpdated({
				id: 'chatSidebar',
				properties: {
					[ChatConfiguration.PlanAgentDefaultModel]: {}
				}
			});
		} catch (e) {
			this.logService.error('[PlanAgentDefaultModel] Error updating model values:', e);
		}
	}
}

registerWorkbenchContribution2(PlanAgentDefaultModel.ID, PlanAgentDefaultModel, WorkbenchPhase.BlockRestore);
