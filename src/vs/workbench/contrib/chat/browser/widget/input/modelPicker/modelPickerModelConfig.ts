/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Event } from '../../../../../../../base/common/event.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelConfigurationSchema } from '../../../../common/languageModels.js';

/**
 * Read/write access to a model's configuration (e.g. context size, thinking
 * effort). Implemented either by the global `ILanguageModelsService` or by
 * a per-editor override layer so that one editor's changes do not sync to other
 * already-open editors. Structurally satisfied by `ILanguageModelsService`.
 */
export interface IModelConfigurationAccess {
	getModelConfiguration(modelId: string): IStringDictionary<unknown> | undefined;
	setModelConfiguration(modelId: string, values: IStringDictionary<unknown>): Promise<void>;
	getModelConfigurationActions(modelId: string): IAction[];
	/**
	 * Fires when this access layer's configuration changes (e.g. user picks a
	 * new context size). Implementations that always read the global value can
	 * omit this and rely on `ILanguageModelsService.onDidChangeLanguageModels`.
	 */
	readonly onDidChange?: Event<string /* modelId */>;
}

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
	configurationAccess: IModelConfigurationAccess,
	group: string,
): IModelConfigProperty | undefined {
	const properties = model?.metadata.configurationSchema?.properties;
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

/**
 * A short read-out of the model settings the user changed, e.g. "Extra high · 1M".
 *
 * Only values that differ from the model's own defaults are named: a model left alone
 * has nothing to report, so the read-out marks the models that were deliberately tuned
 * rather than restating a default on every row.
 */
export function getModelConfigSummary(
	model: ILanguageModelChatMetadataAndIdentifier | undefined,
	configurationAccess: IModelConfigurationAccess,
): string | undefined {
	const parts: string[] = [];
	for (const group of [MODEL_CONFIG_GROUP_EFFORT, MODEL_CONFIG_GROUP_CONTEXT]) {
		const property = getModelConfigProperty(model, configurationAccess, group);
		if (!property || property.value === undefined || property.value === property.schema.default) {
			continue;
		}
		parts.push(getModelConfigValueLabel(property.schema, property.value));
	}
	return parts.length ? parts.join(' \u00b7 ') : undefined;
}
