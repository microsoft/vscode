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
	/**
	 * How model identifiers are encoded in the stored setting value.
	 * - `'qualifiedName'` (default): `${name} (${vendor})` — matches
	 *   {@link ILanguageModelChatMetadata.asQualifiedName}. Kept for backward
	 *   compatibility with existing settings (plan/explore agent).
	 * - `'vendorAndId'`: `${vendor}/${id}` — stable composite of API-stable
	 *   fields, directly usable with `vscode.lm.selectChatModels`.
	 */
	readonly storageFormat?: 'qualifiedName' | 'vendorAndId';
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
		// New vendors (e.g. BYOK Anthropic) may register after this contribution
		// has already started. Re-trigger resolution so their models surface in
		// the picker too — `selectLanguageModels({})` only resolves vendors that
		// were registered at call time.
		this._register(_languageModelsService.onDidChangeLanguageModelVendors(() => this._resolveAllVendors()));
		this._updateModelValues();
		this._resolveAllVendors();
	}

	private _resolveAllVendors(): void {
		// Trigger resolution of every registered vendor so models from providers that
		// haven't yet been touched by another consumer (e.g. BYOK Anthropic / OpenAI)
		// also surface in the picker. Each vendor's resolution will fire
		// `onDidChangeLanguageModels`, which re-runs `_updateModelValues` above.
		// We additionally re-run `_updateModelValues` once everything resolves so that
		// providers which add no new models (and therefore don't fire the change event)
		// still get reflected in the picker.
		const vendors = this._languageModelsService.getVendors().map(v => v.vendor);
		this._logService.trace(`${this._options.logPrefix} Resolving all vendors: [${vendors.join(', ')}]`);
		this._languageModelsService.selectLanguageModels({}).then(
			() => this._updateModelValues(),
			e => this._logService.error(`${this._options.logPrefix} Error resolving language models:`, e),
		);
	}

	private _updateModelValues(): void {
		const { modelIds, modelLabels, modelDescriptions } = this._arrays;
		const { configKey, configSectionId, logPrefix, filter, storageFormat } = this._options;

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
				if (model.metadata?.isUserSelectable === false) {
					return false;
				}
				if (filter && !filter(model.metadata)) {
					return false;
				}
				return true;
			});

			supportedModels.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

			// Build a vendor id -> display name lookup so labels can show the
			// human-readable provider name (e.g. "Copilot") instead of the
			// vendor id (e.g. "copilot") which is what gets stored.
			const vendorDisplayNames = new Map<string, string>();
			for (const vendor of this._languageModelsService.getVendors()) {
				vendorDisplayNames.set(vendor.vendor, vendor.displayName);
			}

			this._logService.trace(`${logPrefix} Picker rebuilt: ${models.length} model(s) considered, ${supportedModels.length} included; vendors: [${Array.from(vendorDisplayNames.keys()).join(', ')}]`);

			for (const model of supportedModels) {
				try {
					const storedId = storageFormat === 'vendorAndId'
						? `${model.metadata.vendor}/${model.metadata.id}`
						: ILanguageModelChatMetadata.asQualifiedName(model.metadata);
					const vendorDisplayName = vendorDisplayNames.get(model.metadata.vendor);
					if (!vendorDisplayName) {
						this._logService.trace(`${logPrefix} No vendor descriptor for '${model.metadata.vendor}' (model '${model.metadata.id}'); falling back to vendor id in label.`);
					}
					modelIds.push(storedId);
					modelLabels.push(localize('modelLabelWithVendor', "{0} ({1})", model.metadata.name, vendorDisplayName ?? model.metadata.vendor));
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
