/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mapFilter } from './arrays.js';
export class ValidatorBase {
    validateOrThrow(content) {
        const result = this.validate(content);
        if (result.error) {
            throw new Error(result.error.message);
        }
        return result.content;
    }
}
class TypeofValidator extends ValidatorBase {
    constructor(type) {
        super();
        this.type = type;
    }
    validate(content) {
        if (typeof content !== this.type) {
            return { content: undefined, error: { message: `Expected ${this.type}, but got ${typeof content}` } };
        }
        return { content: content, error: undefined };
    }
    getJSONSchema() {
        return { type: this.type };
    }
}
const vStringValidator = new TypeofValidator('string');
export function vString() { return vStringValidator; }
const vNumberValidator = new TypeofValidator('number');
export function vNumber() { return vNumberValidator; }
const vBooleanValidator = new TypeofValidator('boolean');
export function vBoolean() { return vBooleanValidator; }
const vObjAnyValidator = new TypeofValidator('object');
export function vObjAny() { return vObjAnyValidator; }
class UncheckedValidator extends ValidatorBase {
    validate(content) {
        return { content: content, error: undefined };
    }
    getJSONSchema() {
        return {};
    }
}
export function vUnchecked() {
    return new UncheckedValidator();
}
class UndefinedValidator extends ValidatorBase {
    validate(content) {
        if (content !== undefined) {
            return { content: undefined, error: { message: `Expected undefined, but got ${typeof content}` } };
        }
        return { content: undefined, error: undefined };
    }
    getJSONSchema() {
        return {};
    }
}
export function vUndefined() {
    return new UndefinedValidator();
}
export function vUnknown() {
    return vUnchecked();
}
export class Optional {
    constructor(validator) {
        this.validator = validator;
    }
}
export function vOptionalProp(validator) {
    return new Optional(validator);
}
class ObjValidator extends ValidatorBase {
    constructor(properties) {
        super();
        this.properties = properties;
    }
    validate(content) {
        if (typeof content !== 'object' || content === null) {
            return { content: undefined, error: { message: 'Expected object' } };
        }
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        const result = {};
        for (const key in this.properties) {
            const prop = this.properties[key];
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            const fieldValue = content[key];
            const isOptional = prop instanceof Optional;
            const validator = isOptional ? prop.validator : prop;
            if (isOptional && fieldValue === undefined) {
                // Optional field not provided, skip validation
                continue;
            }
            const { content: value, error } = validator.validate(fieldValue);
            if (error) {
                return { content: undefined, error: { message: `Error in property '${key}': ${error.message}` } };
            }
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            result[key] = value;
        }
        return { content: result, error: undefined };
    }
    getJSONSchema() {
        const requiredFields = [];
        const schemaProperties = {};
        for (const [key, prop] of Object.entries(this.properties)) {
            const isOptional = prop instanceof Optional;
            const validator = isOptional ? prop.validator : prop;
            schemaProperties[key] = validator.getJSONSchema();
            if (!isOptional) {
                requiredFields.push(key);
            }
        }
        const schema = {
            type: 'object',
            properties: schemaProperties,
            ...(requiredFields.length > 0 ? { required: requiredFields } : {})
        };
        return schema;
    }
}
export function vObj(properties) {
    return new ObjValidator(properties);
}
class ArrayValidator extends ValidatorBase {
    constructor(validator) {
        super();
        this.validator = validator;
    }
    validate(content) {
        if (!Array.isArray(content)) {
            return { content: undefined, error: { message: 'Expected array' } };
        }
        const result = [];
        for (let i = 0; i < content.length; i++) {
            const { content: value, error } = this.validator.validate(content[i]);
            if (error) {
                return { content: undefined, error: { message: `Error in element ${i}: ${error.message}` } };
            }
            result.push(value);
        }
        return { content: result, error: undefined };
    }
    getJSONSchema() {
        return {
            type: 'array',
            items: this.validator.getJSONSchema(),
        };
    }
}
export function vArray(validator) {
    return new ArrayValidator(validator);
}
class TupleValidator extends ValidatorBase {
    constructor(validators) {
        super();
        this.validators = validators;
    }
    validate(content) {
        if (!Array.isArray(content)) {
            return { content: undefined, error: { message: 'Expected array' } };
        }
        if (content.length !== this.validators.length) {
            return { content: undefined, error: { message: `Expected tuple of length ${this.validators.length}, but got ${content.length}` } };
        }
        const result = [];
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
    getJSONSchema() {
        return {
            type: 'array',
            items: this.validators.map(validator => validator.getJSONSchema()),
        };
    }
}
export function vTuple(...validators) {
    return new TupleValidator(validators);
}
class UnionValidator extends ValidatorBase {
    constructor(validators) {
        super();
        this.validators = validators;
    }
    validate(content) {
        let lastError;
        for (const validator of this.validators) {
            const { content: value, error } = validator.validate(content);
            if (!error) {
                // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                return { content: value, error: undefined };
            }
            lastError = error;
        }
        return { content: undefined, error: lastError };
    }
    getJSONSchema() {
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
export function vUnion(...validators) {
    return new UnionValidator(validators);
}
class EnumValidator extends ValidatorBase {
    constructor(values) {
        super();
        this.values = values;
    }
    validate(content) {
        if (this.values.indexOf(content) === -1) {
            return { content: undefined, error: { message: `Expected one of: ${this.values.join(', ')}` } };
        }
        return { content: content, error: undefined };
    }
    getJSONSchema() {
        return {
            enum: this.values,
        };
    }
}
export function vEnum(...values) {
    return new EnumValidator(values);
}
class LiteralValidator extends ValidatorBase {
    constructor(value) {
        super();
        this.value = value;
    }
    validate(content) {
        if (content !== this.value) {
            return { content: undefined, error: { message: `Expected: ${this.value}` } };
        }
        return { content: content, error: undefined };
    }
    getJSONSchema() {
        return {
            const: this.value,
        };
    }
}
export function vLiteral(value) {
    return new LiteralValidator(value);
}
class LazyValidator extends ValidatorBase {
    constructor(fn) {
        super();
        this.fn = fn;
    }
    validate(content) {
        return this.fn().validate(content);
    }
    getJSONSchema() {
        return this.fn().getJSONSchema();
    }
}
export function vLazy(fn) {
    return new LazyValidator(fn);
}
class UseRefSchemaValidator extends ValidatorBase {
    constructor(_ref, _validator) {
        super();
        this._ref = _ref;
        this._validator = _validator;
    }
    validate(content) {
        return this._validator.validate(content);
    }
    getJSONSchema() {
        return { $ref: this._ref };
    }
}
export function vWithJsonSchemaRef(ref, validator) {
    return new UseRefSchemaValidator(ref, validator);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL3ZhbGlkYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQVN4QyxNQUFNLE9BQWdCLGFBQWE7SUFLbEMsZUFBZSxDQUFDLE9BQWdCO1FBQy9CLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEMsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUM7SUFDdkIsQ0FBQztDQUNEO0FBZ0JELE1BQU0sZUFBOEMsU0FBUSxhQUE4QjtJQUN6RixZQUE2QixJQUFVO1FBQ3RDLEtBQUssRUFBRSxDQUFDO1FBRG9CLFNBQUksR0FBSixJQUFJLENBQU07SUFFdkMsQ0FBQztJQUVELFFBQVEsQ0FBQyxPQUFnQjtRQUN4QixJQUFJLE9BQU8sT0FBTyxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNsQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsWUFBWSxJQUFJLENBQUMsSUFBSSxhQUFhLE9BQU8sT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQ3ZHLENBQUM7UUFFRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQTBCLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ2xFLENBQUM7SUFFRCxhQUFhO1FBQ1osT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7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