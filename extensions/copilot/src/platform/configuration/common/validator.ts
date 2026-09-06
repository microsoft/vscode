/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonSchema } from './jsonSchema';

export interface IValidator<T> {
	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError };

	toSchema(): JsonSchema;

	/**
	 * Returns true if this validator represents a required field.
	 * Used by vObj to determine which fields are required.
	 */
	isRequired?(): boolean;
}

export type ValidatorType<T> = T extends IValidator<infer U> ? U : never;

export interface ValidationError {
	message: string;
}

interface TypeOfMap {
	string: string;
	number: number;
	boolean: boolean;
	object: object;
	undefined: undefined;
	function: Function;
	symbol: symbol;
}

class TypeofValidator<TKey extends keyof TypeOfMap> implements IValidator<TypeOfMap[TKey]> {
	constructor(private readonly type: TKey) { }

	validate(content: unknown): { content: TypeOfMap[TKey]; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== this.type) {
			return { content: undefined, error: { message: `Expected ${this.type}, but got ${typeof content}` } };
		}

		return { content: content as TypeOfMap[TKey], error: undefined };
	}

	toSchema(): JsonSchema {
		return { type: this.type };
	}
}

const vStringValidator = new TypeofValidator('string');
export function vString(): IValidator<string> { return vStringValidator; }

const vNumberValidator = new TypeofValidator('number');
export function vNumber(): IValidator<number> { return vNumberValidator; }

const vBooleanValidator = new TypeofValidator('boolean');
export function vBoolean(): IValidator<boolean> { return vBooleanValidator; }

const vObjAnyValidator = new TypeofValidator('object');
export function vObjAny(): IValidator<object> { return vObjAnyValidator; }

const vUndefinedValidator = new TypeofValidator('undefined');
export function vUndefined(): IValidator<undefined> { return vUndefinedValidator; }

class NullValidator implements IValidator<null> {
	validate(content: unknown): { content: null; error: undefined } | { content: undefined; error: ValidationError } {
		if (content !== null) {
			return { content: undefined, error: { message: `Expected null, but got ${typeof content}` } };
		}
		return { content: null, error: undefined };
	}

	toSchema(): JsonSchema {
		return { type: 'null' };
	}
}

const vNullValidator = new NullValidator();
export function vNull(): IValidator<null> { return vNullValidator; }

export function vNullable<T>(validator: IValidator<T>): IValidator<T | null> {
	return vUnion(validator, vNullValidator);
}

export function vUnchecked<T>(): IValidator<T> {
	return {
		validate(content: unknown): { content: T; error: undefined } {
			return { content: content as T, error: undefined };
		},
		toSchema() {
			return {

			};
		},
	};
}

export function vUnknown(): IValidator<unknown> {
	return vUnchecked();
}

export type ObjectProperties = Record<string, any>;

export function vRequired<T>(validator: IValidator<T>): IValidator<T> {
	return {
		validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
			if (content === undefined) {
				return { content: undefined, error: { message: 'Required field is missing' } };
			}
			return validator.validate(content);
		},
		toSchema(): JsonSchema {
			return validator.toSchema();
		},
		isRequired(): boolean {
			return true;
		}
	};
}

export function vObj<T extends Record<string, IValidator<any>>>(properties: T): IValidator<{ [K in keyof T]: ValidatorType<T[K]> }> {
	return {
		validate(content: unknown): { content: any; error: undefined } | { content: undefined; error: ValidationError } {
			if (typeof content !== 'object' || content === null) {
				return { content: undefined, error: { message: 'Expected object' } };
			}

			const result: any = {};
			for (const key in properties) {
				const validator = properties[key];
				const fieldValue = (content as any)[key];

				// Check if field is required and missing
				const isRequired = validator.isRequired?.() ?? false;
				if (isRequired && fieldValue === undefined) {
					return { content: undefined, error: { message: `Required field '${key}' is missing` } };
				}

				// If field is not required and is missing, skip validation
				if (!isRequired && fieldValue === undefined) {
					continue;
				}

				const { content: value, error } = validator.validate(fieldValue);
				if (error) {
					return { content: undefined, error: { message: `Error in property '${key}': ${error.message}` } };
				}

				result[key] = value;
			}

			return { content: result, error: undefined };
		},
		toSchema() {
			const requiredFields: string[] = [];
			const schemaProperties: Record<string, JsonSchema> = {};

			for (const [key, validator] of Object.entries(properties)) {
				schemaProperties[key] = validator.toSchema();
				if (validator.isRequired?.()) {
					requiredFields.push(key);
				}
			}

			const schema: JsonSchema = {
				type: 'object',
				properties: schemaProperties,
				...(requiredFields.length > 0 ? { required: requiredFields } : {})
			};

			return schema;
		}
	};
}

export function vArray<T>(validator: IValidator<T>): IValidator<T[]> {
	return {
		validate(content: unknown): { content: T[]; error: undefined } | { content: undefined; error: ValidationError } {
			if (!Array.isArray(content)) {
				return { content: undefined, error: { message: 'Expected array' } };
			}

			const result: T[] = [];
			for (let i = 0; i < content.length; i++) {
				const { content: value, error } = validator.validate(content[i]);
				if (error) {
					return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
				}

				result.push(value);
			}

			return { content: result, error: undefined };
		},

		toSchema(): JsonSchema {
			return {
				type: 'array',
				items: validator.toSchema(),
			};
		}
	};
}

export function vTuple<T extends IValidator<any>[]>(...validators: T): IValidator<{ [K in keyof T]: ValidatorType<T[K]> }> {
	return {
		validate(content: unknown): { content: any; error: undefined } | { content: undefined; error: ValidationError } {
			if (!Array.isArray(content)) {
				return { content: undefined, error: { message: 'Expected array' } };
			}

			if (content.length !== validators.length) {
				return { content: undefined, error: { message: `Expected tuple of length ${validators.length}, but got ${content.length}` } };
			}

			const result: any = [];
			for (let i = 0; i < validators.length; i++) {
				const validator = validators[i];
				const { content: value, error } = validator.validate(content[i]);
				if (error) {
					return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
				}

				result.push(value);
			}

			return { content: result, error: undefined };
		},

		toSchema(): JsonSchema {
			return {
				type: 'array',
				items: validators.map(validator => validator.toSchema()),
			};
		}
	};
}

export function vUnion<T extends IValidator<any>[]>(...validators: T): IValidator<ValidatorType<T[number]>> {
	return {
		validate(content: unknown): { content: any; error: undefined } | { content: undefined; error: ValidationError } {
			let lastError: ValidationError | undefined;
			for (const validator of validators) {
				const { content: value, error } = validator.validate(content);
				if (!error) {
					return { content: value, error: undefined };
				}

				lastError = error;
			}

			return { content: undefined, error: lastError! };
		},

		toSchema(): JsonSchema {
			return {
				oneOf: validators.map(validator => validator.toSchema()),
			};
		}
	};
}

export function vEnum<T extends string[]>(...values: T): IValidator<T[number]> {
	return {
		validate(content: unknown): { content: any; error: undefined } | { content: undefined; error: ValidationError } {
			if (values.indexOf(content as any) === -1) {
				return { content: undefined, error: { message: `Expected one of: ${values.join(', ')}` } };
			}

			return { content, error: undefined };
		},

		toSchema(): JsonSchema {
			return {
				enum: values,
			};
		}
	};
}

export function vLiteral<T extends string>(value: T): IValidator<T> {
	return {
		validate(content: unknown): { content: any; error: undefined } | { content: undefined; error: ValidationError } {
			if (content !== value) {
				return { content: undefined, error: { message: `Expected: ${value}` } };
			}

			return { content, error: undefined };
		},

		toSchema(): JsonSchema {
			return {
				const: value,
			};
		}
	};
}

export function vLazy<T>(fn: () => IValidator<T>): IValidator<T> {
	return {
		validate(content: unknown): { content: any; error: undefined } | { content: undefined; error: ValidationError } {
			return fn().validate(content);
		},

		toSchema(): JsonSchema {
			return fn().toSchema();
		}
	};
}
