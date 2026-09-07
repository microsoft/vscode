/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { extractSchemaDefaults, filterConfigurationToSchema, resolveModelConfiguration } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelConfigurationLogic.js';
import { assertAutomationSessionTemplate, IAutomationSessionTemplate, isAutomationModelConfiguration } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { createModelConfigurationActions, ILanguageModelsService, type IModelConfigurationAccess } from '../../../../workbench/contrib/chat/common/languageModels.js';

/** Model preferences for one Automation draft, retaining unavailable values independently of effective configuration. */
export class AutomationModelConfiguration extends Disposable implements IModelConfigurationAccess {
	private readonly preferences = new Map<string, IStringDictionary<unknown>>();
	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly languageModelsService: ILanguageModelsService,
		template?: IAutomationSessionTemplate,
	) {
		assertAutomationSessionTemplate(template);
		super();
		if (template?.modelId && template.modelConfiguration !== undefined) {
			this.preferences.set(template.modelId, deepClone(template.modelConfiguration));
		}
	}

	getModelConfiguration(modelId: string): IStringDictionary<unknown> | undefined {
		const metadata = this.languageModelsService.lookupLanguageModel(modelId);
		const defaults = extractSchemaDefaults(metadata?.configurationSchema);
		let preferences = this.preferences.get(modelId);
		if (!preferences) {
			const globalConfiguration = this.languageModelsService.getModelConfiguration(modelId);
			preferences = resolveModelConfiguration(undefined, defaults, globalConfiguration);
			if (metadata?.configurationSchema || Object.keys(preferences).length > 0) {
				this.preferences.set(modelId, deepClone(preferences));
			}
		}
		const effective = metadata
			? resolveModelConfiguration(filterConfigurationToSchema(preferences, metadata.configurationSchema), defaults, undefined)
			: { ...preferences };
		return Object.keys(effective).length > 0 ? effective : undefined;
	}

	async setModelConfiguration(modelId: string, values: IStringDictionary<unknown>): Promise<void> {
		if (!isAutomationModelConfiguration(values)) {
			throw new Error('Automation model configuration must contain only JSON primitive values.');
		}
		this.getModelConfiguration(modelId);
		this.preferences.set(modelId, deepClone({ ...this.preferences.get(modelId), ...values }));
		this._onDidChange.fire(modelId);
		// Only an explicit picker change updates the defaults shared with ordinary New Session.
		await this.languageModelsService.setModelConfiguration(modelId, values);
	}

	getModelConfigurationActions(modelId: string): IAction[] {
		return createModelConfigurationActions(
			this.languageModelsService.lookupLanguageModel(modelId)?.configurationSchema,
			this.getModelConfiguration(modelId) ?? {},
			(key, value) => this.setModelConfiguration(modelId, { [key]: value }),
		);
	}

	captureModelConfiguration(modelId: string | undefined): IAutomationSessionTemplate['modelConfiguration'] {
		if (!modelId) {
			return undefined;
		}
		this.getModelConfiguration(modelId);
		const preferences = this.preferences.get(modelId);
		if (preferences !== undefined && !isAutomationModelConfiguration(preferences)) {
			throw new Error('Automation model configuration must contain only JSON primitive values.');
		}
		return preferences === undefined ? undefined : deepClone(preferences);
	}

	getModelConfigurationForRequest(modelId: string | undefined): IAutomationSessionTemplate['modelConfiguration'] {
		const effective = modelId && this.preferences.has(modelId)
			? this.getModelConfiguration(modelId) ?? {}
			: undefined;
		if (effective !== undefined && !isAutomationModelConfiguration(effective)) {
			throw new Error('Automation model configuration must contain only JSON primitive values.');
		}
		return effective;
	}

	/** Carries preferences when a provider resolves a native model identifier to its editor-qualified identity. */
	rebindModelConfiguration(previousModelId: string, modelId: string): void {
		const preferences = this.preferences.get(previousModelId);
		if (preferences && !this.preferences.has(modelId)) {
			this.preferences.set(modelId, deepClone(preferences));
		}
	}
}
