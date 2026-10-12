/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import type { ILanguageModelConfigurationSchema } from './languageModels.js';

type PropertySchema = NonNullable<ILanguageModelConfigurationSchema['properties']>[string];

/** Presentation choices do not constrain an otherwise valid numeric setting. */
export function getModelConfigurationChoices(schema: PropertySchema): readonly { value: unknown; label?: string; description?: string }[] {
	if (schema.enum?.length) {
		return schema.enum.map((value, index) => ({ value, label: schema.enumItemLabels?.[index], description: schema.enumDescriptions?.[index] }));
	}
	if (!supportsCustomModelConfiguration(schema)) {
		return [];
	}
	const seen = new Set<number>();
	return (schema.suggestedValues ?? []).filter(choice => {
		if (!isValidModelConfigurationNumber(choice.value, schema) || seen.has(choice.value)) {
			return false;
		}
		seen.add(choice.value);
		return true;
	});
}

/** Only explicitly suggested, bounded integer properties offer numeric entry. */
export function supportsCustomModelConfiguration(schema: PropertySchema): boolean {
	return schema.type === 'integer' && Array.isArray(schema.suggestedValues) && schema.enum === undefined
		&& Number.isSafeInteger(schema.minimum) && schema.minimum! > 0
		&& Number.isSafeInteger(schema.maximum) && schema.maximum! >= schema.minimum!
		&& schema.const === undefined && !schema.anyOf && !schema.oneOf && !schema.allOf && !schema.not && !schema.$ref;
}

/** Validates the numeric value independently from suggested menu choices. */
export function isValidModelConfigurationNumber(value: number, schema: PropertySchema): boolean {
	return Number.isSafeInteger(value) && value >= schema.minimum! && value <= schema.maximum!
		&& !(typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
		&& !(typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
		&& !(typeof schema.multipleOf === 'number' && value % schema.multipleOf !== 0);
}

/** Collects one valid number. Cancellation or a read-only property never writes. */
export async function promptModelConfigurationNumber(
	input: Pick<IQuickInputService, 'input'>,
	schema: PropertySchema,
	current: unknown,
): Promise<number | undefined> {
	if (schema.readOnly || !supportsCustomModelConfiguration(schema)) {
		return undefined;
	}
	const parse = (value: string): number | undefined => {
		const trimmed = value.trim();
		if (!/^\d+$/.test(trimmed)) {
			return undefined;
		}
		const number = Number(trimmed);
		return isValidModelConfigurationNumber(number, schema) ? number : undefined;
	};
	const result = await input.input({
		title: typeof schema.title === 'string' ? schema.title : localize('modelConfiguration.custom', "Custom Value"),
		value: typeof current === 'number' ? String(current) : undefined,
		prompt: localize('modelConfiguration.range', "Enter a whole number from {0} to {1}.", schema.minimum, schema.maximum),
		validateInput: async value => parse(value) === undefined ? localize('modelConfiguration.invalidNumber', "Enter a whole number within the allowed range.") : undefined,
	});
	return result === undefined ? undefined : parse(result);
}
