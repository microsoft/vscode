/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { localize } from '../../../../../../../nls.js';
import { getModelContextWindowTotal, ILanguageModelChatMetadataAndIdentifier, ILanguageModelConfigurationSchema, type IModelConfigurationAccess } from '../../../../common/languageModels.js';
import { isAutoModel, isHydraFusionModel } from './modelPickerPresentation.js';

export type { IModelConfigurationAccess } from '../../../../common/languageModels.js';

/** The thinking effort group, or the routing tier for the Auto model. */
export const MODEL_CONFIG_GROUP_EFFORT = 'navigation';
/** The context window group: how much context the model is given. */
export const MODEL_CONFIG_GROUP_CONTEXT = 'tokens';

export type IModelConfigPropertySchema = NonNullable<ILanguageModelConfigurationSchema['properties']>[string];

/** One configurable property of a model, with the value currently in effect. */
export interface IModelConfigProperty {
	readonly key: string;
	readonly value: unknown;
	readonly schema: IModelConfigPropertySchema;
}

/**
 * The first property of a model's configuration schema belonging to `group` that
 * offers a choice, with the user's value or the schema default.
 */
export function getModelConfigProperty(
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: Pick<IModelConfigurationAccess, 'getModelConfiguration' | 'getModelConfigurationSchema'>,
	group: string,
): IModelConfigProperty | undefined {
	const properties = model && (configurationAccess.getModelConfigurationSchema?.(model.identifier) ?? model.metadata.configurationSchema)?.properties;
	if (!properties) {
		return undefined;
	}
	const currentConfig = configurationAccess.getModelConfiguration(model.identifier) ?? {};
	for (const [key, schema] of Object.entries(properties)) {
		if (schema.group !== group || !schema.enum?.length) {
			continue;
		}
		return { key, value: currentConfig[key] ?? schema.default, schema };
	}
	return undefined;
}

/** The label an enum value is shown with, falling back to a formatted raw value. */
export function getModelConfigValueLabel(schema: IModelConfigPropertySchema, value: unknown): string {
	if (value === 'fast' && schema.enum?.includes('efficiency') && !schema.enum.includes('fast')) {
		return localize('chat.modelPicker.automaticTier', "Automatic");
	}
	const index = schema.enum?.indexOf(value) ?? -1;
	const label = index >= 0 ? schema.enumItemLabels?.[index] : undefined;
	return label ?? (typeof value === 'number' ? formatTokenCount(value) : String(value));
}

/**
 * Whether the context property is set to its largest value. Producers order the
 * context enum from smallest window to largest, so the last entry is the
 * extended one.
 */
export function isExtendedContext(property: IModelConfigProperty): boolean {
	const values = property.schema.enum ?? [];
	return values.length > 1 && property.value === values[values.length - 1];
}

/** A short readout of the effective effort and context, including defaults. */
export function getModelConfigSummary(
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: IModelConfigurationAccess,
): string | undefined {
	const parts = getModelConfigDisplayValues(model, configurationAccess).map(value => value.label);
	return parts.length ? parts.join(' \u00b7 ') : undefined;
}

/** Names each displayed setting for assistive technology. */
export function getModelConfigDescription(
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: IModelConfigurationAccess,
): string | undefined {
	const parts = getModelConfigDisplayValues(model, configurationAccess).map(value => value.description);
	return parts.length ? parts.join(', ') : undefined;
}

function getModelConfigDisplayValues(model: ILanguageModelChatMetadataAndIdentifier | undefined, configurationAccess: IModelConfigurationAccess): { label: string; description: string }[] {
	const values: { label: string; description: string }[] = [];
	for (const group of [MODEL_CONFIG_GROUP_EFFORT, MODEL_CONFIG_GROUP_CONTEXT]) {
		const property = getModelConfigProperty(model, configurationAccess, group);
		if (property?.value !== undefined && property.schema.enum?.includes(property.value)) {
			const label = getModelConfigValueLabel(property.schema, property.value);
			const title = property.schema.title ?? (group === MODEL_CONFIG_GROUP_EFFORT
				? localize('chat.effort.header', "Thinking Effort")
				: localize('chat.context.header', "Context"));
			values.push({ label, description: localize('chat.modelPicker.configValue', "{0}: {1}", title, label) });
		} else if (!property && group === MODEL_CONFIG_GROUP_CONTEXT && model && !isAutoModel(model) && !isHydraFusionModel(model)) {
			const total = getModelContextWindowTotal(model.metadata);
			if (Number.isFinite(total) && total > 0) {
				const label = formatTokenCount(total);
				values.push({ label, description: localize('chat.modelPicker.maxContext', "Max context: {0}", label) });
			}
		}
	}
	return values;
}

/** The effort and context properties whose effective values differ from their defaults. */
export function getChangedModelConfigProperties(
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: IModelConfigurationAccess,
): IModelConfigProperty[] {
	const properties: IModelConfigProperty[] = [];
	for (const group of [MODEL_CONFIG_GROUP_EFFORT, MODEL_CONFIG_GROUP_CONTEXT]) {
		const property = getModelConfigProperty(model, configurationAccess, group);
		if (!property || property.value === undefined || property.value === property.schema.default) {
			continue;
		}
		properties.push(property);
	}
	return properties;
}
