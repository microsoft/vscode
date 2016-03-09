/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Json = require('./json-toolbox/json');
import JsonSchema = require('./json-toolbox/jsonSchema');
import {JSONLocation} from './jsonLocation';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();


export interface IRange {
	start: number;
	end: number;
}

export interface IError {
	location: IRange;
	message: string;
}

export class ASTNode {
	public start: number;
	public end: number;
	public type: string;
	public parent: ASTNode;
	public name: string;

	constructor(parent: ASTNode, type: string, name: string, start: number, end?: number) {
		this.type = type;
		this.name = name;
		this.start = start;
		this.end = end;
		this.parent = parent;
	}

	public getNodeLocation(): JSONLocation {
		let path = this.parent ? this.parent.getNodeLocation() : new JSONLocation([]);
		if (this.name) {
			path = path.append(this.name);
		}
		return path;
	}


	public getChildNodes(): ASTNode[] {
		return [];
	}

	public getValue(): any {
		// override in children
		return;
	}

	public contains(offset: number, includeRightBound: boolean = false): boolean {
		return offset >= this.start && offset < this.end || includeRightBound && offset === this.end;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		return visitor(this);
	}

	public getNodeFromOffset(offset: number): ASTNode {
		let findNode = (node: ASTNode): ASTNode => {
			if (offset >= node.start && offset < node.end) {
				let children = node.getChildNodes();
				for (let i = 0; i < children.length && children[i].start <= offset; i++) {
					let item = findNode(children[i]);
					if (item) {
						return item;
					}
				}
				return node;
			}
			return null;
		};
		return findNode(this);
	}

	public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
		let findNode = (node: ASTNode): ASTNode => {
			if (offset >= node.start && offset <= node.end) {
				let children = node.getChildNodes();
				for (let i = 0; i < children.length && children[i].start <= offset; i++) {
					let item = findNode(children[i]);
					if (item) {
						return item;
					}
				}
				return node;
			}
			return null;
		};
		return findNode(this);
	}

	public validate(schema: JsonSchema.IJSONSchema, validationResult: ValidationResult, matchingSchemas: IApplicableSchema[], offset: number = -1): void {
		if (offset !== -1 && !this.contains(offset)) {
			return;
		}

		if (Array.isArray(schema.type)) {
			if ((<string[]>schema.type).indexOf(this.type) === -1) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: schema.errorMessage || localize('typeArrayMismatchWarning', 'Incorrect type. Expected one of {0}', (<string[]>schema.type).join(', '))
				});
			}
		}
		else if (schema.type) {
			if (this.type !== schema.type) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: schema.errorMessage || localize('typeMismatchWarning', 'Incorrect type. Expected "{0}"', schema.type)
				});
			}
		}
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach((subSchema) => {
				this.validate(subSchema, validationResult, matchingSchemas, offset);
			});
		}
		if (schema.not) {
			let subValidationResult = new ValidationResult();
			let subMatchingSchemas: IApplicableSchema[] = [];
			this.validate(schema.not, subValidationResult, subMatchingSchemas, offset);
			if (!subValidationResult.hasErrors()) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('notSchemaWarning', "Matches a schema that is not allowed.")
				});
			}
			if (matchingSchemas) {
				subMatchingSchemas.forEach((ms) => {
					ms.inverted = !ms.inverted;
					matchingSchemas.push(ms);
				});
			}
		}

		let testAlternatives = (alternatives: JsonSchema.IJSONSchema[], maxOneMatch: boolean) => {
			let matches = [];

			// remember the best match that is used for error messages
			let bestMatch: { schema: JsonSchema.IJSONSchema; validationResult: ValidationResult; matchingSchemas: IApplicableSchema[]; } = null;
			alternatives.forEach((subSchema) => {
				let subValidationResult = new ValidationResult();
				let subMatchingSchemas: IApplicableSchema[] = [];
				this.validate(subSchema, subValidationResult, subMatchingSchemas);
				if (!subValidationResult.hasErrors()) {
					matches.push(subSchema);
				}
				if (!bestMatch) {
					bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
				} else {
					if (!maxOneMatch && !subValidationResult.hasErrors() && !bestMatch.validationResult.hasErrors()) {
						// no errors, both are equally good matches
						bestMatch.matchingSchemas.push.apply(bestMatch.matchingSchemas, subMatchingSchemas);
						bestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
						bestMatch.validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
					} else {
						let compareResult = subValidationResult.compare(bestMatch.validationResult);
						if (compareResult > 0) {
							// our node is the best matching so far
							bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
						} else if (compareResult === 0) {
							// there's already a best matching but we are as good
							bestMatch.matchingSchemas.push.apply(bestMatch.matchingSchemas, subMatchingSchemas);
						}
					}
				}
			});

			if (matches.length > 1 && maxOneMatch) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.start + 1 },
					message: localize('oneOfWarning', "Matches multiple schemas when only one must validate.")
				});
			}
			if (bestMatch !== null) {
				validationResult.merge(bestMatch.validationResult);
				validationResult.propertiesMatches += bestMatch.validationResult.propertiesMatches;
				validationResult.propertiesValueMatches += bestMatch.validationResult.propertiesValueMatches;
				if (matchingSchemas) {
					matchingSchemas.push.apply(matchingSchemas, bestMatch.matchingSchemas);
				}
			}
			return matches.length;
		};
		if (Array.isArray(schema.anyOf)) {
			testAlternatives(schema.anyOf, false);
		}
		if (Array.isArray(schema.oneOf)) {
			testAlternatives(schema.oneOf, true);
		}

		if (Array.isArray(schema.enum)) {
			if (schema.enum.indexOf(this.getValue()) === -1) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('enumWarning', 'Value is not an accepted value. Valid values: {0}', JSON.stringify(schema.enum))
				});
			} else {
				validationResult.enumValueMatch = true;
			}
		}

		if (matchingSchemas !== null) {
			matchingSchemas.push({ node: this, schema: schema });
		}
	}
}

export class NullASTNode extends ASTNode {

	constructor(parent: ASTNode, name: string, start: number, end?: number) {
		super(parent, 'null', name, start, end);
	}

	public getValue(): any {
		return null;
	}
}

export class BooleanASTNode extends ASTNode {

	private value: boolean;

	constructor(parent: ASTNode, name: string, value: boolean, start: number, end?: number) {
		super(parent, 'boolean', name, start, end);
		this.value = value;
	}

	public getValue(): any {
		return this.value;
	}

}

export class ArrayASTNode extends ASTNode {

	public items: ASTNode[];

	constructor(parent: ASTNode, name: string, start: number, end?: number) {
		super(parent, 'array', name, start, end);
		this.items = [];
	}

	public getChildNodes(): ASTNode[] {
		return this.items;
	}

	public getValue(): any {
		return this.items.map((v) => v.getValue());
	}

	public addItem(item: ASTNode): boolean {
		if (item) {
			this.items.push(item);
			return true;
		}
		return false;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		let ctn = visitor(this);
		for (let i = 0; i < this.items.length && ctn; i++) {
			ctn = this.items[i].visit(visitor);
		}
		return ctn;
	}

	public validate(schema: JsonSchema.IJSONSchema, validationResult: ValidationResult, matchingSchemas: IApplicableSchema[], offset: number = -1): void {
		if (offset !== -1 && !this.contains(offset)) {
			return;
		}
		super.validate(schema, validationResult, matchingSchemas, offset);

		if (Array.isArray(schema.items)) {
			let subSchemas = <JsonSchema.IJSONSchema[]> schema.items;
			subSchemas.forEach((subSchema, index) => {
				let itemValidationResult = new ValidationResult();
				let item = this.items[index];
				if (item) {
					item.validate(subSchema, itemValidationResult, matchingSchemas, offset);
					validationResult.mergePropertyMatch(itemValidationResult);
				} else if (this.items.length >= subSchemas.length) {
					validationResult.propertiesValueMatches++;
				}
			});

			if (schema.additionalItems === false && this.items.length > subSchemas.length) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('additionalItemsWarning', 'Array has too many items according to schema. Expected {0} or fewer', subSchemas.length)
				});
			} else if (this.items.length >= subSchemas.length) {
				validationResult.propertiesValueMatches += (this.items.length - subSchemas.length);
			}
		}
		else if (schema.items) {
			this.items.forEach((item) => {
				let itemValidationResult = new ValidationResult();
				item.validate(schema.items, itemValidationResult, matchingSchemas, offset);
				validationResult.mergePropertyMatch(itemValidationResult);
			});
		}

		if (schema.minItems && this.items.length < schema.minItems) {
			validationResult.warnings.push({
				location: { start: this.start, end: this.end },
				message: localize('minItemsWarning', 'Array has too few items. Expected {0} or more', schema.minItems)
			});
		}

		if (schema.maxItems && this.items.length > schema.maxItems) {
			validationResult.warnings.push({
				location: { start: this.start, end: this.end },
				message: localize('maxItemsWarning', 'Array has too many items. Expected {0} or fewer', schema.minItems)
			});
		}

		if (schema.uniqueItems === true) {
			let values = this.items.map((node) => {
				return node.getValue();
			});
			let duplicates = values.some((value, index) => {
				return index !== values.lastIndexOf(value);
			});
			if (duplicates) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('uniqueItemsWarning', 'Array has duplicate items')
				});
			}
		}
	}
}

export class NumberASTNode extends ASTNode {

	public isInteger: boolean;
	public value: number;

	constructor(parent: ASTNode, name: string, start: number, end?: number) {
		super(parent, 'number', name, start, end);
		this.isInteger = true;
		this.value = Number.NaN;
	}

	public getValue(): any {
		return this.value;
	}

	public validate(schema: JsonSchema.IJSONSchema, validationResult: ValidationResult, matchingSchemas: IApplicableSchema[], offset: number = -1): void {
		if (offset !== -1 && !this.contains(offset)) {
			return;
		}

		// work around type validation in the base class
		let typeIsInteger = false;
		if (schema.type === 'integer' || (Array.isArray(schema.type) && (<string[]>schema.type).indexOf('integer') !== -1)) {
			typeIsInteger = true;
		}
		if (typeIsInteger && this.isInteger === true) {
			this.type = 'integer';
		}
		super.validate(schema, validationResult, matchingSchemas, offset);
		this.type = 'number';

		let val = this.getValue();

		if (typeof schema.multipleOf === 'number') {
			if (val % schema.multipleOf !== 0) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('multipleOfWarning', 'Value is not divisible by {0}', schema.multipleOf)
				});
			}
		}

		if (typeof schema.minimum === 'number') {
			if (schema.exclusiveMinimum && val <= schema.minimum) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('exclusiveMinimumWarning', 'Value is below the exclusive minimum of {0}', schema.minimum)
				});
			}
			if (!schema.exclusiveMinimum && val < schema.minimum) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('minimumWarning', 'Value is below the minimum of {0}', schema.minimum)
				});
			}
		}

		if (typeof schema.maximum === 'number') {
			if (schema.exclusiveMaximum && val >= schema.maximum) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('exclusiveMaximumWarning', 'Value is above the exclusive maximum of {0}', schema.maximum)
				});
			}
			if (!schema.exclusiveMaximum && val > schema.maximum) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('maximumWarning', 'Value is above the maximum of {0}', schema.maximum)
				});
			}
		}

	}
}

export class StringASTNode extends ASTNode {
	public isKey: boolean;
	public value: string;

	constructor(parent: ASTNode, name: string, isKey: boolean, start: number, end?: number) {
		super(parent, 'string', name, start, end);
		this.isKey = isKey;
		this.value = '';
	}

	public getValue(): any {
		return this.value;
	}

	public validate(schema: JsonSchema.IJSONSchema, validationResult: ValidationResult, matchingSchemas: IApplicableSchema[], offset: number = -1): void {
		if (offset !== -1 && !this.contains(offset)) {
			return;
		}
		super.validate(schema, validationResult, matchingSchemas, offset);

		if (schema.minLength && this.value.length < schema.minLength) {
			validationResult.warnings.push({
				location: { start: this.start, end: this.end },
				message: localize('minLengthWarning', 'String is shorter than the minimum length of ', schema.minLength)
			});
		}

		if (schema.maxLength && this.value.length > schema.maxLength) {
			validationResult.warnings.push({
				location: { start: this.start, end: this.end },
				message: localize('maxLengthWarning', 'String is shorter than the maximum length of ', schema.maxLength)
			});
		}

		if (schema.pattern) {
			let regex = new RegExp(schema.pattern);
			if (!regex.test(this.value)) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: schema.errorMessage || localize('patternWarning', 'String does not match the pattern of "{0}"', schema.pattern)
				});
			}
		}

	}
}

export class PropertyASTNode extends ASTNode {
	public key: StringASTNode;
	public value: ASTNode;
	public colonOffset: number;

	constructor(parent: ASTNode, key: StringASTNode) {
		super(parent, 'property', null, key.start);
		this.key = key;
		key.parent = this;
		key.name = key.value;
		this.colonOffset = -1;
	}

	public getChildNodes(): ASTNode[] {
		return this.value ? [this.key, this.value] : [this.key];
	}

	public setValue(value: ASTNode): boolean {
		this.value = value;
		return value !== null;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		return visitor(this) && this.key.visit(visitor) && this.value && this.value.visit(visitor);
	}

	public validate(schema: JsonSchema.IJSONSchema, validationResult: ValidationResult, matchingSchemas: IApplicableSchema[], offset: number = -1): void {
		if (offset !== -1 && !this.contains(offset)) {
			return;
		}
		if (this.value) {
			this.value.validate(schema, validationResult, matchingSchemas, offset);
		}
	}
}

export class ObjectASTNode extends ASTNode {
	public properties: PropertyASTNode[];

	constructor(parent: ASTNode, name: string, start: number, end?: number) {
		super(parent, 'object', name, start, end);

		this.properties = [];
	}

	public getChildNodes(): ASTNode[] {
		return this.properties;
	}

	public addProperty(node: PropertyASTNode): boolean {
		if (!node) {
			return false;
		}
		this.properties.push(node);
		return true;
	}

	public getFirstProperty(key: string): PropertyASTNode {
		for (let i = 0; i < this.properties.length; i++) {
			if (this.properties[i].key.value === key) {
				return this.properties[i];
			}
		}
		return null;
	}

	public getKeyList(): string[] {
		return this.properties.map((p) => p.key.getValue());
	}

	public getValue(): any {
		let value: any = {};
		this.properties.forEach((p) => {
			let v = p.value && p.value.getValue();
			if (v) {
				value[p.key.getValue()] = v;
			}
		});
		return value;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		let ctn = visitor(this);
		for (let i = 0; i < this.properties.length && ctn; i++) {
			ctn = this.properties[i].visit(visitor);
		}
		return ctn;
	}

	public validate(schema: JsonSchema.IJSONSchema, validationResult: ValidationResult, matchingSchemas: IApplicableSchema[], offset: number = -1): void {
		if (offset !== -1 && !this.contains(offset)) {
			return;
		}

		super.validate(schema, validationResult, matchingSchemas, offset);
		let seenKeys: { [key: string]: ASTNode } = {};
		let unprocessedProperties: string[] = [];
		this.properties.forEach((node) => {
			let key = node.key.value;
			seenKeys[key] = node.value;
			unprocessedProperties.push(key);
		});

		if (Array.isArray(schema.required)) {
			schema.required.forEach((propertyName: string) => {
				if (!seenKeys[propertyName]) {
					let key = this.parent && this.parent && (<PropertyASTNode>this.parent).key;
					let location = key ? { start: key.start, end: key.end } : { start: this.start, end: this.start + 1 };
					validationResult.warnings.push({
						location: location,
						message: localize('MissingRequiredPropWarning', 'Missing property "{0}"', propertyName)
					});
				}
			});
		}


		let propertyProcessed = (prop: string) => {
			let index = unprocessedProperties.indexOf(prop);
			while (index >= 0) {
				unprocessedProperties.splice(index, 1);
				index = unprocessedProperties.indexOf(prop);
			}
		};

		if (schema.properties) {
			Object.keys(schema.properties).forEach((propertyName: string) => {
				propertyProcessed(propertyName);
				let prop = schema.properties[propertyName];
				let child = seenKeys[propertyName];
				if (child) {
					let propertyvalidationResult = new ValidationResult();
					child.validate(prop, propertyvalidationResult, matchingSchemas, offset);
					validationResult.mergePropertyMatch(propertyvalidationResult);
				}

			});
		}

		if (schema.patternProperties) {
			Object.keys(schema.patternProperties).forEach((propertyPattern: string) => {
				let regex = new RegExp(propertyPattern);
				unprocessedProperties.slice(0).forEach((propertyName: string) => {
					if (regex.test(propertyName)) {
						propertyProcessed(propertyName);
						let child = seenKeys[propertyName];
						if (child) {
							let propertyvalidationResult = new ValidationResult();
							child.validate(schema.patternProperties[propertyPattern], propertyvalidationResult, matchingSchemas, offset);
							validationResult.mergePropertyMatch(propertyvalidationResult);
						}

					}
				});
			});
		}

		if (schema.additionalProperties) {
			unprocessedProperties.forEach((propertyName: string) => {
				let child = seenKeys[propertyName];
				if (child) {
					let propertyvalidationResult = new ValidationResult();
					child.validate(schema.additionalProperties, propertyvalidationResult, matchingSchemas, offset);
					validationResult.mergePropertyMatch(propertyvalidationResult);
				}
			});
		} else if (schema.additionalProperties === false) {
			if (unprocessedProperties.length > 0) {
				unprocessedProperties.forEach((propertyName: string) => {
					let child = seenKeys[propertyName];
					if (child) {
						let propertyNode = <PropertyASTNode>child.parent;

						validationResult.warnings.push({
							location: { start: propertyNode.key.start, end: propertyNode.key.end },
							message: localize('DisallowedExtraPropWarning', 'Property {0} is not allowed', propertyName)
						});
					}
				});
			}
		}

		if (schema.maxProperties) {
			if (this.properties.length > schema.maxProperties) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('MaxPropWarning', 'Object has more properties than limit of {0}', schema.maxProperties)
				});
			}
		}

		if (schema.minProperties) {
			if (this.properties.length < schema.minProperties) {
				validationResult.warnings.push({
					location: { start: this.start, end: this.end },
					message: localize('MinPropWarning', 'Object has fewer properties than the required number of {0}', schema.minProperties)
				});
			}
		}

		if (schema.dependencies) {
			Object.keys(schema.dependencies).forEach((key: string) => {
				let prop = seenKeys[key];
				if (prop) {
					if (Array.isArray(schema.dependencies[key])) {
						let valueAsArray: string[] = schema.dependencies[key];
						valueAsArray.forEach((requiredProp: string) => {
							if (!seenKeys[requiredProp]) {
								validationResult.warnings.push({
									location: { start: this.start, end: this.end },
									message: localize('RequiredDependentPropWarning', 'Object is missing property {0} required by property {1}', requiredProp, key)
								});
							} else {
								validationResult.propertiesValueMatches++;
							}
						});
					} else if (schema.dependencies[key]) {
						let valueAsSchema: JsonSchema.IJSONSchema = schema.dependencies[key];
						let propertyvalidationResult = new ValidationResult();
						this.validate(valueAsSchema, propertyvalidationResult, matchingSchemas, offset);
						validationResult.mergePropertyMatch(propertyvalidationResult);
					}
				}
			});
		}
	}
}

export class JSONDocumentConfig {
	public ignoreDanglingComma: boolean;

	constructor() {
		this.ignoreDanglingComma = false;
	}
}

export interface IApplicableSchema {
	node: ASTNode;
	inverted?: boolean;
	schema: JsonSchema.IJSONSchema;
}

export class ValidationResult {
	public errors: IError[];
	public warnings: IError[];

	public propertiesMatches: number;
	public propertiesValueMatches: number;
	public enumValueMatch: boolean;

	constructor() {
		this.errors = [];
		this.warnings = [];
		this.propertiesMatches = 0;
		this.propertiesValueMatches = 0;
		this.enumValueMatch = false;
	}

	public hasErrors(): boolean {
		return !!this.errors.length || !!this.warnings.length;
	}

	public mergeAll(validationResults: ValidationResult[]): void {
		validationResults.forEach((validationResult) => {
			this.merge(validationResult);
		});
	}

	public merge(validationResult: ValidationResult): void {
		this.errors = this.errors.concat(validationResult.errors);
		this.warnings = this.warnings.concat(validationResult.warnings);
	}

	public mergePropertyMatch(propertyValidationResult: ValidationResult): void {
		this.merge(propertyValidationResult);
		this.propertiesMatches++;
		if (propertyValidationResult.enumValueMatch || !propertyValidationResult.hasErrors() && propertyValidationResult.propertiesMatches) {
			this.propertiesValueMatches++;
		}
	}

	public compare(other: ValidationResult): number {
		let hasErrors = this.hasErrors();
		if (hasErrors !== other.hasErrors()) {
			return hasErrors ? -1 : 1;
		}
		if (this.enumValueMatch !== other.enumValueMatch) {
			return other.enumValueMatch ? -1 : 1;
		}
		if (this.propertiesValueMatches !== other.propertiesValueMatches) {
			return this.propertiesValueMatches - other.propertiesValueMatches;
		}
		return this.propertiesMatches - other.propertiesMatches;
	}

}

export class JSONDocument {
	public config: JSONDocumentConfig;
	public root: ASTNode;

	private validationResult: ValidationResult;

	constructor(config: JSONDocumentConfig) {
		this.config = config;
		this.validationResult = new ValidationResult();
	}

	public get errors(): IError[] {
		return this.validationResult.errors;
	}

	public get warnings(): IError[] {
		return this.validationResult.warnings;
	}

	public getNodeFromOffset(offset: number): ASTNode {
		return this.root && this.root.getNodeFromOffset(offset);
	}

	public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
		return this.root && this.root.getNodeFromOffsetEndInclusive(offset);
	}

	public visit(visitor: (node: ASTNode) => boolean): void {
		if (this.root) {
			this.root.visit(visitor);
		}
	}

	public validate(schema: JsonSchema.IJSONSchema, matchingSchemas: IApplicableSchema[] = null, offset: number = -1): void {
		if (this.root) {
			this.root.validate(schema, this.validationResult, matchingSchemas, offset);
		}
	}
}

export function parse(text: string, config = new JSONDocumentConfig()): JSONDocument {

	let _doc = new JSONDocument(config);
	let _scanner = Json.createScanner(text, true);

	function _accept(token: Json.SyntaxKind): boolean {
		if (_scanner.getToken() === token) {
			_scanner.scan();
			return true;
		}
		return false;
	}

	function _error<T extends ASTNode>(message: string, node: T = null, skipUntilAfter: Json.SyntaxKind[] = [], skipUntil: Json.SyntaxKind[] = []): T {
		if (_doc.errors.length === 0 || _doc.errors[0].location.start !== _scanner.getTokenOffset()) {
			// ignore multiple errors on the same offset
			let error = { message: message, location: { start: _scanner.getTokenOffset(), end: _scanner.getTokenOffset() + _scanner.getTokenLength() } };
			_doc.errors.push(error);
		}

		if (node) {
			_finalize(node, false);
		}
		if (skipUntilAfter.length + skipUntil.length > 0) {
			let token = _scanner.getToken();
			while (token !== Json.SyntaxKind.EOF) {
				if (skipUntilAfter.indexOf(token) !== -1) {
					_scanner.scan();
					break;
				} else if (skipUntil.indexOf(token) !== -1) {
					break;
				}
				token = _scanner.scan();
			}
		}
		return node;
	}

	function _checkScanError(): boolean {
		switch (_scanner.getTokenError()) {
			case Json.ScanError.InvalidUnicode:
				_error(localize('InvalidUnicode', 'Invalid unicode sequence in string'));
				return true;
			case Json.ScanError.InvalidEscapeCharacter:
				_error(localize('InvalidEscapeCharacter', 'Invalid escape character in string'));
				return true;
			case Json.ScanError.UnexpectedEndOfNumber:
				_error(localize('UnexpectedEndOfNumber', 'Unexpected end of number'));
				return true;
			case Json.ScanError.UnexpectedEndOfComment:
				_error(localize('UnexpectedEndOfComment', 'Unexpected end of comment'));
				return true;
			case Json.ScanError.UnexpectedEndOfString:
				_error(localize('UnexpectedEndOfString', 'Unexpected end of string'));
				return true;
		}
		return false;
	}

	function _finalize<T extends ASTNode>(node: T, scanNext: boolean): T {
		node.end = _scanner.getTokenOffset() + _scanner.getTokenLength();

		if (scanNext) {
			_scanner.scan();
		}

		return node;
	}

	function _parseArray(parent: ASTNode, name: string): ArrayASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.OpenBracketToken) {
			return null;
		}
		let node = new ArrayASTNode(parent, name, _scanner.getTokenOffset());
		_scanner.scan(); // consume OpenBracketToken

		let count = 0;
		if (node.addItem(_parseValue(node, '' + count++))) {
			while (_accept(Json.SyntaxKind.CommaToken)) {
				if (!node.addItem(_parseValue(node, '' + count++)) && !_doc.config.ignoreDanglingComma) {
					_error(localize('ValueExpected', 'Value expected'));
				}
			}
		}

		if (_scanner.getToken() !== Json.SyntaxKind.CloseBracketToken) {
			return _error(localize('ExpectedCloseBracket', 'Expected comma or closing bracket'), node);
		}

		return _finalize(node, true);
	}

	function _parseProperty(parent: ObjectASTNode, keysSeen: any): PropertyASTNode {

		let key = _parseString(null, null, true);
		if (!key) {
			if (_scanner.getToken() === Json.SyntaxKind.Unknown) {
				// give a more helpful error message
				let value = _scanner.getTokenValue();
				if (value.length > 0 && (value.charAt(0) === '\'' || Json.isLetter(value.charAt(0).charCodeAt(0)))) {
					_error(localize('DoubleQuotesExpected', 'Property keys must be doublequoted'));
				}
			}
			return null;
		}
		let node = new PropertyASTNode(parent, key);

		if (keysSeen[key.value]) {
			_doc.warnings.push({ location: { start: node.key.start, end: node.key.end }, message: localize('DuplicateKeyWarning', "Duplicate object key") });
		}
		keysSeen[key.value] = true;

		if (_scanner.getToken() === Json.SyntaxKind.ColonToken) {
			node.colonOffset = _scanner.getTokenOffset();
		} else {
			return _error(localize('ColonExpected', 'Colon expected'), node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
		}

		_scanner.scan(); // consume ColonToken

		if (!node.setValue(_parseValue(node, key.value))) {
			return _error(localize('ValueExpected', 'Value expected'), node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
		}
		node.end = node.value.end;
		return node;
	}

	function _parseObject(parent: ASTNode, name: string): ObjectASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.OpenBraceToken) {
			return null;
		}
		let node = new ObjectASTNode(parent, name, _scanner.getTokenOffset());
		_scanner.scan(); // consume OpenBraceToken

		let keysSeen: any = {};
		if (node.addProperty(_parseProperty(node, keysSeen))) {
			while (_accept(Json.SyntaxKind.CommaToken)) {
				if (!node.addProperty(_parseProperty(node, keysSeen)) && !_doc.config.ignoreDanglingComma) {
					_error(localize('PropertyExpected', 'Property expected'));
				}
			}
		}

		if (_scanner.getToken() !== Json.SyntaxKind.CloseBraceToken) {
			return _error(localize('ExpectedCloseBrace', 'Expected comma or closing brace'), node);
		}
		return _finalize(node, true);
	}

	function _parseString(parent: ASTNode, name: string, isKey: boolean): StringASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.StringLiteral) {
			return null;
		}

		let node = new StringASTNode(parent, name, isKey, _scanner.getTokenOffset());
		node.value = _scanner.getTokenValue();

		_checkScanError();

		return _finalize(node, true);
	}

	function _parseNumber(parent: ASTNode, name: string): NumberASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.NumericLiteral) {
			return null;
		}

		let node = new NumberASTNode(parent, name, _scanner.getTokenOffset());
		if (!_checkScanError()) {
			let tokenValue = _scanner.getTokenValue();
			try {
				let numberValue = JSON.parse(tokenValue);
				if (typeof numberValue !== 'number') {
					return _error(localize('InvalidNumberFormat', 'Invalid number format'), node);
				}
				node.value = numberValue;
			} catch (e) {
				return _error(localize('InvalidNumberFormat', 'Invalid number format'), node);
			}
			node.isInteger = tokenValue.indexOf('.') === -1;
		}
		return _finalize(node, true);
	}

	function _parseLiteral(parent: ASTNode, name: string): ASTNode {
		let node: ASTNode;
		switch (_scanner.getToken()) {
			case Json.SyntaxKind.NullKeyword:
				node = new NullASTNode(parent, name, _scanner.getTokenOffset());
				break;
			case Json.SyntaxKind.TrueKeyword:
				node = new BooleanASTNode(parent, name, true, _scanner.getTokenOffset());
				break;
			case Json.SyntaxKind.FalseKeyword:
				node = new BooleanASTNode(parent, name, false, _scanner.getTokenOffset());
				break;
			default:
				return null;
		}
		return _finalize(node, true);
	}

	function _parseValue(parent: ASTNode, name: string): ASTNode {
		return _parseArray(parent, name) || _parseObject(parent, name) || _parseString(parent, name, false) || _parseNumber(parent, name) || _parseLiteral(parent, name);
	}

	_scanner.scan();

	_doc.root = _parseValue(null, null);
	if (!_doc.root) {
		_error(localize('Invalid symbol', 'Expected a JSON object, array or literal'));
	} else if (_scanner.getToken() !== Json.SyntaxKind.EOF) {
		_error(localize('End of file expected', 'End of file expected'));
	}
	return _doc;
}