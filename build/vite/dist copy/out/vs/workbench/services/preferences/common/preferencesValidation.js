/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Color } from '../../../../base/common/color.js';
import { isObject, isUndefinedOrNull, isString, isStringArray } from '../../../../base/common/types.js';
function canBeType(propTypes, ...types) {
    return types.some(t => propTypes.includes(t));
}
function isNullOrEmpty(value) {
    return value === '' || isUndefinedOrNull(value);
}
export function createValidator(prop) {
    const type = Array.isArray(prop.type) ? prop.type : [prop.type];
    const isNullable = canBeType(type, 'null');
    const isNumeric = (canBeType(type, 'number') || canBeType(type, 'integer')) && (type.length === 1 || type.length === 2 && isNullable);
    const numericValidations = getNumericValidators(prop);
    const stringValidations = getStringValidators(prop);
    const arrayValidator = getArrayValidator(prop);
    const objectValidator = getObjectValidator(prop);
    return value => {
        if (isNullable && isNullOrEmpty(value)) {
            return '';
        }
        const errors = [];
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
            }
            else {
                errors.push(...numericValidations.filter(validator => !validator.isValid(+value)).map(validator => validator.message));
            }
        }
        if (prop.type === 'string') {
            if (prop.enum && !isStringArray(prop.enum)) {
                errors.push(nls.localize('validations.stringIncorrectEnumOptions', 'The enum options should be strings, but there is a non-string option. Please file an issue with the extension author.'));
            }
            else if (!isString(value)) {
                errors.push(nls.localize('validations.stringIncorrectType', 'Incorrect type. Expected "string".'));
            }
            else {
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
export function getInvalidTypeError(value, type) {
    if (typeof type === 'undefined') {
        return;
    }
    const typeArr = Array.isArray(type) ? type : [type];
    if (!typeArr.some(_type => valueValidatesAsType(value, _type))) {
        return nls.localize('invalidTypeError', "Setting has an invalid type, expected {0}. Fix in JSON.", JSON.stringify(type));
    }
    return;
}
function valueValidatesAsType(value, type) {
    const valueType = typeof value;
    if (type === 'boolean') {
        return valueType === 'boolean';
    }
    else if (type === 'object') {
        return value && !Array.isArray(value) && valueType === 'object';
    }
    else if (type === 'null') {
        return value === null;
    }
    else if (type === 'array') {
        return Array.isArray(value);
    }
    else if (type === 'string') {
        return valueType === 'string';
    }
    else if (type === 'number' || type === 'integer') {
        return valueType === 'number';
    }
    return true;
}
function toRegExp(pattern) {
    try {
        // The u flag allows support for better Unicode matching,
        // but deprecates some patterns such as [\s-9]
        // Ref https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Character_class#description
        return new RegExp(pattern, 'u');
    }
    catch (e) {
        try {
            return new RegExp(pattern);
        }
        catch (e) {
            // If the pattern can't be parsed even without the 'u' flag,
            // just log the error to avoid rendering the entire Settings editor blank.
            // Ref https://github.com/microsoft/vscode/issues/195054
            console.error(nls.localize('regexParsingError', "Error parsing the following regex both with and without the u flag:"), pattern);
            return /.*/;
        }
    }
}
function getStringValidators(prop) {
    const uriRegex = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
    let patternRegex;
    if (typeof prop.pattern === 'string') {
        patternRegex = toRegExp(prop.pattern);
    }
    return [
        {
            enabled: prop.maxLength !== undefined,
            isValid: ((value) => value.length <= prop.maxLength),
            message: nls.localize('validations.maxLength', "Value must be {0} or fewer characters long.", prop.maxLength)
        },
        {
            enabled: prop.minLength !== undefined,
            isValid: ((value) => value.length >= prop.minLength),
            message: nls.localize('validations.minLength', "Value must be {0} or more characters long.", prop.minLength)
        },
        {
            enabled: patternRegex !== undefined,
            isValid: ((value) => patternRegex.test(value)),
            message: prop.patternErrorMessage || nls.localize('validations.regex', "Value must match regex `{0}`.", prop.pattern)
        },
        {
            enabled: prop.format === 'color-hex',
            isValid: ((value) => Color.Format.CSS.parseHex(value)),
            message: nls.localize('validations.colorFormat', "Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.")
        },
        {
            enabled: prop.format === 'uri' || prop.format === 'uri-reference',
            isValid: ((value) => !!value.length),
            message: nls.localize('validations.uriEmpty', "URI expected.")
        },
        {
            enabled: prop.format === 'uri' || prop.format === 'uri-reference',
            isValid: ((value) => uriRegex.test(value)),
            message: nls.localize('validations.uriMissing', "URI is expected.")
        },
        {
            enabled: prop.format === 'uri',
            isValid: ((value) => {
                const matches = value.match(uriRegex);
                return !!(matches && matches[2]);
            }),
            message: nls.localize('validations.uriSchemeMissing', "URI with a scheme is expected.")
        },
        {
            enabled: prop.enum !== undefined,
            isValid: ((value) => {
                return prop.enum.includes(value);
            }),
            message: nls.localize('validations.invalidStringEnumValue', "Value is not accepted. Valid values: {0}.", prop.enum ? prop.enum.map(key => `"${key}"`).join(', ') : '[]')
        }
    ].filter(validation => validation.enabled);
}
function getNumericValidators(prop) {
    const type = Array.isArray(prop.type) ? prop.type : [prop.type];
    const isNullable = canBeType(type, 'null');
    const isIntegral = (canBeType(type, 'integer')) && (type.length === 1 || type.length === 2 && isNullable);
    const isNumeric = canBeType(type, 'number', 'integer') && (type.length === 1 || type.length === 2 && isNullable);
    if (!isNumeric) {
        return [];
    }
    let exclusiveMax;
    let exclusiveMin;
    if (typeof prop.exclusiveMaximum === 'boolean') {
        exclusiveMax = prop.exclusiveMaximum ? prop.maximum : undefined;
    }
    else {
        exclusiveMax = prop.exclusiveMaximum;
    }
    if (typeof prop.exclusiveMinimum === 'boolean') {
        exclusiveMin = prop.exclusiveMinimum ? prop.minimum : undefined;
    }
    else {
        exclusiveMin = prop.exclusiveMinimum;
    }
    return [
        {
            enabled: exclusiveMax !== undefined && (prop.maximum === undefined || exclusiveMax <= prop.maximum),
            isValid: ((value) => value < exclusiveMax),
            message: nls.localize('validations.exclusiveMax', "Value must be strictly less than {0}.", exclusiveMax)
        },
        {
            enabled: exclusiveMin !== undefined && (prop.minimum === undefined || exclusiveMin >= prop.minimum),
            isValid: ((value) => value > exclusiveMin),
            message: nls.localize('validations.exclusiveMin', "Value must be strictly greater than {0}.", exclusiveMin)
        },
        {
            enabled: prop.maximum !== undefined && (exclusiveMax === undefined || exclusiveMax > prop.maximum),
            isValid: ((value) => value <= prop.maximum),
            message: nls.localize('validations.max', "Value must be less than or equal to {0}.", prop.maximum)
        },
        {
            enabled: prop.minimum !== undefined && (exclusiveMin === undefined || exclusiveMin < prop.minimum),
            isValid: ((value) => value >= prop.minimum),
            message: nls.localize('validations.min', "Value must be greater than or equal to {0}.", prop.minimum)
        },
        {
            enabled: prop.multipleOf !== undefined,
            isValid: ((value) => value % prop.multipleOf === 0),
            message: nls.localize('validations.multipleOf', "Value must be a multiple of {0}.", prop.multipleOf)
        },
        {
            enabled: isIntegral,
            isValid: ((value) => value % 1 === 0),
            message: nls.localize('validations.expectedInteger', "Value must be an integer.")
        },
    ].filter(validation => validation.enabled);
}
function getArrayValidator(prop) {
    if (prop.type === 'array' && prop.items && !Array.isArray(prop.items)) {
        const propItems = prop.items;
        if (propItems && !Array.isArray(propItems.type)) {
            const withQuotes = (s) => `'` + s + `'`;
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
                const arrayValue = value;
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
                                        nls.localize('validations.stringArrayItemPattern', 'Value {0} must match regex {1}.', withQuotes(v), withQuotes(propItems.pattern));
                            }
                        });
                    }
                    const propItemsEnum = propItems.enum;
                    if (propItemsEnum) {
                        arrayValue.forEach(v => {
                            if (propItemsEnum.indexOf(v) === -1) {
                                message += nls.localize('validations.stringArrayItemEnum', 'Value {0} is not one of {1}', withQuotes(v), '[' + propItemsEnum.map(withQuotes).join(', ') + ']');
                                message += '\n';
                            }
                        });
                    }
                }
                else if (propItems.type === 'integer' || propItems.type === 'number') {
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
function getObjectValidator(prop) {
    if (prop.type === 'object') {
        const { properties, patternProperties, additionalProperties, propertyNames } = prop;
        return value => {
            if (!value) {
                return null;
            }
            const errors = [];
            let propertyNamesErrorShown = false;
            if (!isObject(value)) {
                errors.push(nls.localize('validations.objectIncorrectType', 'Incorrect type. Expected an object.'));
            }
            else {
                Object.keys(value).forEach((key) => {
                    const data = value[key];
                    // Validate propertyNames.pattern - show error message once
                    if (propertyNames?.pattern && !propertyNamesErrorShown) {
                        const patternRegex = toRegExp(propertyNames.pattern);
                        if (!patternRegex.test(key)) {
                            const errorMessage = propertyNames.patternErrorMessage ||
                                nls.localize('validations.propertyNamePattern', 'Property name must match pattern `{0}`.', propertyNames.pattern);
                            errors.push(errorMessage + '\n');
                            propertyNamesErrorShown = true;
                        }
                    }
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
                    }
                    else if (typeof additionalProperties === 'object') {
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
/**
 * Validates a single property name against the propertyNames.pattern schema.
 * Returns true if the key is valid, false otherwise.
 */
export function validatePropertyName(propertyNames, key) {
    if (!propertyNames?.pattern) {
        return true;
    }
    const patternRegex = toRegExp(propertyNames.pattern);
    return patternRegex.test(key);
}
function getErrorsForSchema(propertySchema, data) {
    const validator = createValidator(propertySchema);
    const errorMessage = validator(data);
    return errorMessage;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNWYWxpZGF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlc1ZhbGlkYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFLeEcsU0FBUyxTQUFTLENBQUMsU0FBaUMsRUFBRSxHQUFHLEtBQXVCO0lBQy9FLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMvQyxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBYztJQUNwQyxPQUFPLEtBQUssS0FBSyxFQUFFLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDakQsQ0FBQztBQUVELE1BQU0sVUFBVSxlQUFlLENBQUMsSUFBa0M7SUFDakUsTUFBTSxJQUFJLEdBQTJCLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN4RixNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzNDLE1BQU0sU0FBUyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxT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