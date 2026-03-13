/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFilter } from './arrays.js';
import { IJSONSchema } from './jsonSchema.js';

export interface IValidator<T> {
	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError };

	getJSONSchema(): IJSONSchema;
}

export abstract class ValidatorBase<T> implements IValidator<T> {
	abstract validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError };

	abstract getJSONSchema(): IJSONSchema;

	validateOrThrow(content: unknown): T {
		const result = this.validate(content);
		if (result.error) {
			throw new Error(result.error.message);
		}
		return result.content;
	}
}

export type ValidatorType<T> = T extends IValidator<infer U> ? U : never;

export interface ValidationError {
	message: string;
}

type TypeOfMap = {
	string: string;
	number: number;
	boolean: boolean;
	object: object;
	null: null;
};

class TypeofValidator<TKey extends keyof TypeOfMap> extends ValidatorBase<TypeOfMap[TKey]> {
	constructor(private readonly type: TKey) {
		super();
	}

	validate(content: unknown): { content: TypeOfMap[TKey]; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== this.type) {
			return { content: undefined, error: { message: `Expected ${this.type}, but got ${typeof content}` } };
		}

		return { content: content as TypeOfMap[TKey], error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return { type: this.type };
	}
}

const vStringValidator = new TypeofValidator('string');
export function vString(): ValidatorBase<string> { return vStringValidator; }

const vNumberValidator = new TypeofValidator('number');
export function vNumber(): ValidatorBase<number> { return vNumberValidator; }

const vBooleanValidator = new TypeofValidator('boolean');
export function vBoolean(): ValidatorBase<boolean> { return vBooleanValidator; }

const vObjAnyValidator = new TypeofValidator('object');
export function vObjAny(): ValidatorBase<object> { return vObjAnyValidator; }


class UncheckedValidator<T> extends ValidatorBase<T> {
	validate(content: unknown): { content: T; error: undefined } {
		return { content: content as T, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {};
	}
}

export function vUnchecked<T>(): ValidatorBase<T> {
	return new UncheckedValidator<T>();
}

class UndefinedValidator extends ValidatorBase<undefined> {
	validate(content: unknown): { content: undefined; error: undefined } | { content: undefined; error: ValidationError } {
		if (content !== undefined) {
			return { content: undefined, error: { message: `Expected undefined, but got ${typeof content}` } };
		}

		return { content: undefined, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {};
	}
}

export function vUndefined(): ValidatorBase<undefined> {
	return new UndefinedValidator();
}

export function vUnknown(): ValidatorBase<unknown> {
	return vUnchecked();
}

export type ObjectProperties = Record<string, unknown>;

export class Optional<T extends IValidator<unknown>> {
	constructor(public readonly validator: T) { }
}

export function vOptionalProp<T>(validator: IValidator<T>): Optional<IValidator<T>> {
	return new Optional(validator);
}

type ExtractOptionalKeys<T> = {
	[K in keyof T]: T[K] extends Optional<IValidator<unknown>> ? K : never;
}[keyof T];

type ExtractRequiredKeys<T> = {
	[K in keyof T]: T[K] extends Optional<IValidator<unknown>> ? never : K;
}[keyof T];

export type vObjType<T extends Record<string, IValidator<unknown> | Optional<IValidator<unknown>>>> = {
	[K in ExtractRequiredKeys<T>]: T[K] extends IValidator<infer U> ? U : never;
} & {
	[K in ExtractOptionalKeys<T>]?: T[K] extends Optional<IValidator<infer U>> ? U : never;
};

class ObjValidator<T extends Record<string, IValidator<unknown> | Optional<IValidator<unknown>>>> extends ValidatorBase<vObjType<T>> {
	constructor(private readonly properties: T) {
		super();
	}

	validate(content: unknown): { content: vObjType<T>; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== 'object' || content === null) {
			return { content: undefined, error: { message: 'Expected object' } };
		}

		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const result: vObjType<T> = {} as vObjType<T>;

		for (const key in this.properties) {
			const prop = this.properties[key];
			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
			const fieldValue = (content as any)[key];

			const isOptional = prop instanceof Optional;
			const validator: IValidator<unknown> = isOptional ? prop.validator : prop;

			if (isOptional && fieldValue === undefined) {
				// Optional field not provided, skip validation
				continue;
			}

			const { content: value, error } = validator.validate(fieldValue);
			if (error) {
				return { content: undefined, error: { message: `Error in property '${key}': ${error.message}` } };
			}

			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
			(result as any)[key] = value;
		}

		return { content: result, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		const requiredFields: string[] = [];
		const schemaProperties: Record<string, IJSONSchema> = {};

		for (const [key, prop] of Object.entries(this.properties)) {
			const isOptional = prop instanceof Optional;
			const validator: IValidator<unknown> = isOptional ? prop.validator : prop;
			schemaProperties[key] = validator.getJSONSchema();
			if (!isOptional) {
				requiredFields.push(key);
			}
		}

		const schema: IJSONSchema = {
			type: 'object',
			properties: schemaProperties,
			...(requiredFields.length > 0 ? { required: requiredFields } : {})
		};

		return schema;
	}
}

export function vObj<T extends Record<string, IValidator<unknown> | Optional<IValidator<unknown>>>>(properties: T): ValidatorBase<vObjType<T>> {
	return new ObjValidator(properties);
}

class ArrayValidator<T> extends ValidatorBase<T[]> {
	constructor(private readonly validator: IValidator<T>) {
		super();
	}

	validate(content: unknown): { content: T[]; error: undefined } | { content: undefined; error: ValidationError } {
		if (!Array.isArray(content)) {
			return { content: undefined, error: { message: 'Expected array' } };
		}

		const result: T[] = [];
		for (let i = 0; i < content.length; i++) {
			const { content: value, error } = this.validator.validate(content[i]);
			if (error) {
				return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
			}

			result.push(value);
		}

		return { content: result, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {
			type: 'array',
			items: this.validator.getJSONSchema(),
		};
	}
}

export function vArray<T>(validator: IValidator<T>): ValidatorBase<T[]> {
	return new ArrayValidator(validator);
}

type vTupleType<T extends IValidator<unknown>[]> = { [K in keyof T]: ValidatorType<T[K]> };

class TupleValidator<T extends IValidator<unknown>[]> extends ValidatorBase<vTupleType<T>> {
	constructor(private readonly validators: T) {
		super();
	}

	validate(content: unknown): { content: vTupleType<T>; error: undefined } | { content: undefined; error: ValidationError } {
		if (!Array.isArray(content)) {
			return { content: undefined, error: { message: 'Expected array' } };
		}

		if (content.length !== this.validators.length) {
			return { content: undefined, error: { message: `Expected tuple of length ${this.validators.length}, but got ${content.length}` } };
		}

		const result = [] as vTupleType<T>;
		for (let i = 0; i < this.validators.length; i++) {
			const validator = this.validators[i];
			const { content: value, error } = validator.validate(content[i]);
			if (error) {
				return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
			}
			result.push(value);
		}

		return { content: result, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {
			type: 'array',
			items: this.validators.map(validator => validator.getJSONSchema()),
		};
	}
}

export function vTuple<T extends IValidator<unknown>[]>(...validators: T): ValidatorBase<vTupleType<T>> {
	return new TupleValidator(validators);
}

class UnionValidator<T extends IValidator<unknown>[]> extends ValidatorBase<ValidatorType<T[number]>> {
	constructor(private readonly validators: T) {
		super();
	}

	validate(content: unknown): { content: ValidatorType<T[number]>; error: undefined } | { content: undefined; error: ValidationError } {
		let lastError: ValidationError | undefined;
		for (const validator of this.validators) {
			const { content: value, error } = validator.validate(content);
			if (!error) {
				// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
				return { content: value as any, error: undefined };
			}

			lastError = error;
		}

		return { content: undefined, error: lastError! };
	}

	getJSONSchema(): IJSONSchema {
		return {
			oneOf: mapFilter(this.validators, validator => {
				if (validator instanceof UndefinedValidator) {
					return undefined;
				}
				return validator.getJSONSchema();
			}),
		};
	}
}

export function vUnion<T extends IValidator<unknown>[]>(...validators: T): ValidatorBase<ValidatorType<T[number]>> {
	return new UnionValidator(validators);
}

class EnumValidator<T extends string[]> extends ValidatorBase<T[number]> {
	constructor(private readonly values: T) {
		super();
	}

	validate(content: unknown): { content: T[number]; error: undefined } | { content: undefined; error: ValidationError } {
		if (this.values.indexOf(content as string) === -1) {
			return { content: undefined, error: { message: `Expected one of: ${this.values.join(', ')}` } };
		}

		return { content: content as T[number], error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {
			enum: this.values,
		};
	}
}

export function vEnum<T extends string[]>(...values: T): ValidatorBase<T[number]> {
	return new EnumValidator(values);
}

class LiteralValidator<T extends string> extends ValidatorBase<T> {
	constructor(private readonly value: T) {
		super();
	}

	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		if (content !== this.value) {
			return { content: undefined, error: { message: `Expected: ${this.value}` } };
		}

		return { content: content as T, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {
			const: this.value,
		};
	}
}

export function vLiteral<T extends string>(value: T): ValidatorBase<T> {
	return new LiteralValidator(value);
}

class LazyValidator<T> extends ValidatorBase<T> {
	constructor(private readonly fn: () => IValidator<T>) {
		super();
	}

	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		return this.fn().validate(content);
	}

	getJSONSchema(): IJSONSchema {
		return this.fn().getJSONSchema();
	}
}

export function vLazy<T>(fn: () => IValidator<T>): ValidatorBase<T> {
	return new LazyValidator(fn);
}

class UseRefSchemaValidator<T> extends ValidatorBase<T> {
	constructor(
		private readonly _ref: string,
		private readonly _validator: IValidator<T>
	) {
		super();
	}

	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		return this._validator.validate(content);
	}

	getJSONSchema(): IJSONSchema {
		return { $ref: this._ref };
	}
}

export function vWithJsonSchemaRef<T>(ref: string, validator: IValidator<T>): ValidatorBase<T> {
	return new UseRefSchemaValidator(ref, validator);
}
