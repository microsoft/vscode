/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { JSONSchemaType } from '../../../../base/common/jsonSchema.js';
import { Color } from '../../../../base/common/color.js';
import { isObject, isUndefinedOrNull, isString, isStringArray } from '../../../../base/common/types.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';

type Validator<T> = { enabled: boolean; isValid: (value: T) => boolean; message: string };

function canBeType(propTypes: (string | undefined)[], ...types: JSONSchemaType[]): boolean {
	return types.some(t => propTypes.includes(t));
}

function isNullOrEmpty(value: unknown): boolean {
	return value === '' || isUndefinedOrNull(value);
}

export function createValidator(prop: IConfigurationPropertySchema): (value: any) => (string | null) {
	const type: (string | undefined)[] = Array.isArray(prop.type) ? prop.type : [prop.type];
	const isNullable = canBeType(type, 'null');
	const isNumeric = (canBeType(type, 'number') || canBeType(type, 'integer')) && (type.length === 1 || type.length === 2 && isNullable);

	const numericValidations = getNumericValidators(prop);
	const stringValidations = getStringValidators(prop);
	const arrayValidator = getArrayValidator(prop);
	const objectValidator = getObjectValidator(prop);

	return value => {
		if (isNullable && isNullOrEmpty(value)) { return ''; }

		const errors: string[] = [];
		if (arrayValidator) {
			const err = arrayValidator(value);
			if (err) {
				errors.push(err);
			}
		}

		if (objectValidator) {
			const err = objectValidator(value);
			if (err) {
				errors.push(err);
			}
		}

		if (prop.type === 'boolean' && value !== true && value !== false) {
			errors.push(nls.localize('validations.booleanIncorrectType', 'Incorrect type. Expected "boolean".'));
		}

		if (isNumeric) {
			if (isNullOrEmpty(value) || typeof value === 'boolean' || Array.isArray(value) || isNaN(+value)) {
				errors.push(nls.localize('validations.expectedNumeric', "Value must be a number."));
			} else {
				errors.push(...numericValidations.filter(validator => !validator.isValid(+value)).map(validator => validator.message));
			}
		}

		if (prop.type === 'string') {
			if (prop.enum && !isStringArray(prop.enum)) {
				errors.push(nls.localize('validations.stringIncorrectEnumOptions', 'The enum options should be strings, but there is a non-string option. Please file an issue with the extension author.'));
			} else if (!isString(value)) {
				errors.push(nls.localize('validations.stringIncorrectType', 'Incorrect type. Expected "string".'));
			} else {
				errors.push(...stringValidations.filter(validator => !validator.isValid(value)).map(validator => validator.message));
			}
		}

		if (errors.length) {
			return prop.errorMessage ? [prop.errorMessage, ...errors].join(' ') : errors.join(' ');
		}

		return '';
	};
}

/**
 * Returns an error string if the value is invalid and can't be displayed in the settings UI for the given type.
 */
export function getInvalidTypeError(value: any, type: undefined | string | string[]): string | undefined {
	if (typeof type === 'undefined') {
		return;
	}

	const typeArr = Array.isArray(type) ? type : [type];
	if (!typeArr.some(_type => valueValidatesAsType(value, _type))) {
		return nls.localize('invalidTypeError', "Setting has an invalid type, expected {0}. Fix in JSON.", JSON.stringify(type));
	}

	return;
}

function valueValidatesAsType(value: any, type: string): boolean {
	const valueType = typeof value;
	if (type === 'boolean') {
		return valueType === 'boolean';
	} else if (type === 'object') {
		return value && !Array.isArray(value) && valueType === 'object';
	} else if (type === 'null') {
		return value === null;
	} else if (type === 'array') {
		return Array.isArray(value);
	} else if (type === 'string') {
		return valueType === 'string';
	} else if (type === 'number' || type === 'integer') {
		return valueType === 'number';
	}

	return true;
}

function toRegExp(pattern: string): RegExp {
	try {
		// The u flag allows support for better Unicode matching,
		// but deprecates some patterns such as [\s-9]
		// Ref https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Character_class#description
		return new RegExp(pattern, 'u');
	} catch (e) {
		try {
			return new RegExp(pattern);
		} catch (e) {
			// If the pattern can't be parsed even without the 'u' flag,
			// just log the error to avoid rendering the entire Settings editor blank.
			// Ref https://github.com/microsoft/vscode/issues/195054
			console.error(nls.localize('regexParsingError', "Error parsing the following regex both with and without the u flag:"), pattern);
			return /.*/;
		}
	}
}

function getStringValidators(prop: IConfigurationPropertySchema) {
	const uriRegex = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
	let patternRegex: RegExp | undefined;
	if (typeof prop.pattern === 'string') {
		patternRegex = toRegExp(prop.pattern);
	}

	return [
		{
			enabled: prop.maxLength !== undefined,
			isValid: ((value: { length: number }) => value.length <= prop.maxLength!),
			message: nls.localize('validations.maxLength', "Value must be {0} or fewer characters long.", prop.maxLength)
		},
		{
			enabled: prop.minLength !== undefined,
			isValid: ((value: { length: number }) => value.length >= prop.minLength!),
			message: nls.localize('validations.minLength', "Value must be {0} or more characters long.", prop.minLength)
		},
		{
			enabled: patternRegex !== undefined,
			isValid: ((value: string) => patternRegex!.test(value)),
			message: prop.patternErrorMessage || nls.localize('validations.regex', "Value must match regex `{0}`.", prop.pattern)
		},
		{
			enabled: prop.format === 'color-hex',
			isValid: ((value: string) => Color.Format.CSS.parseHex(value)),
			message: nls.localize('validations.colorFormat', "Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.")
		},
		{
			enabled: prop.format === 'uri' || prop.format === 'uri-reference',
			isValid: ((value: string) => !!value.length),
			message: nls.localize('validations.uriEmpty', "URI expected.")
		},
		{
			enabled: prop.format === 'uri' || prop.format === 'uri-reference',
			isValid: ((value: string) => uriRegex.test(value)),
			message: nls.localize('validations.uriMissing', "URI is expected.")
		},
		{
			enabled: prop.format === 'uri',
			isValid: ((value: string) => {
				const matches = value.match(uriRegex);
				return !!(matches && matches[2]);
			}),
			message: nls.localize('validations.uriSchemeMissing', "URI with a scheme is expected.")
		},
		{
			enabled: prop.enum !== undefined,
			isValid: ((value: string) => {
				return prop.enum!.includes(value);
			}),
			message: nls.localize('validations.invalidStringEnumValue', "Value is not accepted. Valid values: {0}.",
				prop.enum ? prop.enum.map(key => `"${key}"`).join(', ') : '[]')
		}
	].filter(validation => validation.enabled);
}

function getNumericValidators(prop: IConfigurationPropertySchema): Validator<number>[] {
	const type: (string | undefined)[] = Array.isArray(prop.type) ? prop.type : [prop.type];

	const isNullable = canBeType(type, 'null');
	const isIntegral = (canBeType(type, 'integer')) && (type.length === 1 || type.length === 2 && isNullable);
	const isNumeric = canBeType(type, 'number', 'integer') && (type.length === 1 || type.length === 2 && isNullable);
	if (!isNumeric) {
		return [];
	}

	let exclusiveMax: number | undefined;
	let exclusiveMin: number | undefined;

	if (typeof prop.exclusiveMaximum === 'boolean') {
		exclusiveMax = prop.exclusiveMaximum ? prop.maximum : undefined;
	} else {
		exclusiveMax = prop.exclusiveMaximum;
	}

	if (typeof prop.exclusiveMinimum === 'boolean') {
		exclusiveMin = prop.exclusiveMinimum ? prop.minimum : undefined;
	} else {
		exclusiveMin = prop.exclusiveMinimum;
	}

	return [
		{
			enabled: exclusiveMax !== undefined && (prop.maximum === undefined || exclusiveMax <= prop.maximum),
			isValid: ((value: number) => value < exclusiveMax!),
			message: nls.localize('validations.exclusiveMax', "Value must be strictly less than {0}.", exclusiveMax)
		},
		{
			enabled: exclusiveMin !== undefined && (prop.minimum === undefined || exclusiveMin >= prop.minimum),
			isValid: ((value: number) => value > exclusiveMin!),
			message: nls.localize('validations.exclusiveMin', "Value must be strictly greater than {0}.", exclusiveMin)
		},
		{
			enabled: prop.maximum !== undefined && (exclusiveMax === undefined || exclusiveMax > prop.maximum),
			isValid: ((value: number) => value <= prop.maximum!),
			message: nls.localize('validations.max', "Value must be less than or equal to {0}.", prop.maximum)
		},
		{
			enabled: prop.minimum !== undefined && (exclusiveMin === undefined || exclusiveMin < prop.minimum),
			isValid: ((value: number) => value >= prop.minimum!),
			message: nls.localize('validations.min', "Value must be greater than or equal to {0}.", prop.minimum)
		},
		{
			enabled: prop.multipleOf !== undefined,
			isValid: ((value: number) => value % prop.multipleOf! === 0),
			message: nls.localize('validations.multipleOf', "Value must be a multiple of {0}.", prop.multipleOf)
		},
		{
			enabled: isIntegral,
			isValid: ((value: number) => value % 1 === 0),
			message: nls.localize('validations.expectedInteger', "Value must be an integer.")
		},
	].filter(validation => validation.enabled);
}

function getArrayValidator(prop: IConfigurationPropertySchema): ((value: any) => (string | null)) | null {
	if (prop.type === 'array' && prop.items && !Array.isArray(prop.items)) {
		const propItems = prop.items;
		if (propItems && !Array.isArray(propItems.type)) {
			const withQuotes = (s: string) => `'` + s + `'`;
			return value => {
				if (!value) {
					return null;
				}

				let message = '';

				if (!Array.isArray(value)) {
					message += nls.localize('validations.arrayIncorrectType', 'Incorrect type. Expected an array.');
					message += '\n';
					return message;
				}

				const arrayValue = value as unknown[];
				if (prop.uniqueItems) {
					if (new Set(arrayValue).size < arrayValue.length) {
						message += nls.localize('validations.stringArrayUniqueItems', 'Array has duplicate items');
						message += '\n';
					}
				}

				if (prop.minItems && arrayValue.length < prop.minItems) {
					message += nls.localize('validations.stringArrayMinItem', 'Array must have at least {0} items', prop.minItems);
					message += '\n';
				}

				if (prop.maxItems && arrayValue.length > prop.maxItems) {
					message += nls.localize('validations.stringArrayMaxItem', 'Array must have at most {0} items', prop.maxItems);
					message += '\n';
				}

				if (propItems.type === 'string') {
					if (!isStringArray(arrayValue)) {
						message += nls.localize('validations.stringArrayIncorrectType', 'Incorrect type. Expected a string array.');
						message += '\n';
						return message;
					}

					if (typeof propItems.pattern === 'string') {
						const patternRegex = toRegExp(propItems.pattern);
						arrayValue.forEach(v => {
							if (!patternRegex.test(v)) {
								message +=
									propItems.patternErrorMessage ||
									nls.localize(
										'validations.stringArrayItemPattern',
										'Value {0} must match regex {1}.',
										withQuotes(v),
										withQuotes(propItems.pattern!)
									);
							}
						});
					}

					const propItemsEnum = propItems.enum;
					if (propItemsEnum) {
						arrayValue.forEach(v => {
							if (propItemsEnum.indexOf(v) === -1) {
								message += nls.localize(
									'validations.stringArrayItemEnum',
									'Value {0} is not one of {1}',
									withQuotes(v),
									'[' + propItemsEnum.map(withQuotes).join(', ') + ']'
								);
								message += '\n';
							}
						});
					}
				} else if (propItems.type === 'integer' || propItems.type === 'number') {
					arrayValue.forEach(v => {
						const errorMessage = getErrorsForSchema(propItems, v);
						if (errorMessage) {
							message += `${v}: ${errorMessage}\n`;
						}
					});
				}

				return message;
			};
		}
	}

	return null;
}

function getObjectValidator(prop: IConfigurationPropertySchema): ((value: any) => (string | null)) | null {
	if (prop.type === 'object') {
		const { properties, patternProperties, additionalProperties } = prop;
		return value => {
			if (!value) {
				return null;
			}

			const errors: string[] = [];

			if (!isObject(value)) {
				errors.push(nls.localize('validations.objectIncorrectType', 'Incorrect type. Expected an object.'));
			} else {
				Object.keys(value).forEach((key: string) => {
					const data = value[key];
					if (properties && key in properties) {
						const errorMessage = getErrorsForSchema(properties[key], data);
						if (errorMessage) {
							errors.push(`${key}: ${errorMessage}\n`);
						}
						return;
					}

					if (patternProperties) {
						for (const pattern in patternProperties) {
							if (RegExp(pattern).test(key)) {
								const errorMessage = getErrorsForSchema(patternProperties[pattern], data);
								if (errorMessage) {
									errors.push(`${key}: ${errorMessage}\n`);
								}
								return;
							}
						}
					}

					if (additionalProperties === false) {
						errors.push(nls.localize('validations.objectPattern', 'Property {0} is not allowed.\n', key));
					} else if (typeof additionalProperties === 'object') {
						const errorMessage = getErrorsForSchema(additionalProperties, data);
						if (errorMessage) {
							errors.push(`${key}: ${errorMessage}\n`);
						}
					}
				});
			}

			if (errors.length) {
				return prop.errorMessage ? [prop.errorMessage, ...errors].join(' ') : errors.join(' ');
			}

			return '';
		};
	}

	return null;
}

function getErrorsForSchema(propertySchema: IConfigurationPropertySchema, data: any): string | null {
	const validator = createValidator(propertySchema);
	const errorMessage = validator(data);
	return errorMessage;
}
