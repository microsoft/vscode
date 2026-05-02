/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type JsonSchema =
	| NumericJsonSchema
	| StringJsonSchema
	| ArrayJsonSchema
	| ObjectJsonSchema
	| JsonSchemaReference
	| EmptyJsonSchema;

export interface EmptyJsonSchema { }

export interface JsonSchemaReference {
	$ref: string;
}

export interface BaseJsonSchema {
	$id?: string;
	$schema?: string;
	title?: string;
	description?: string;

	definitions?: {
		[name: string]: JsonSchema;
	};

	enum?: unknown[];
	format?: string | Format;

	if?: JsonSchema;
	then?: JsonSchema;
	else?: JsonSchema;
	allOf?: JsonSchema[];
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	not?: JsonSchema;
}

export type Format =
	| typeof Format.dateTime
	| typeof Format.date
	| typeof Format.time
	| typeof Format.email
	| typeof Format.idnEmail
	| typeof Format.hostname
	| typeof Format.idnHostname
	| typeof Format.ipv4
	| typeof Format.ipv6
	| typeof Format.uri
	| typeof Format.uriReference
	| typeof Format.iri
	| typeof Format.iriReference
	| typeof Format.uriTemplate
	| typeof Format.jsonPointer
	| typeof Format.relativeJsonPointer
	| typeof Format.regex;

export namespace Format {
	export const dateTime = 'date-time';
	export const date = 'date';
	export const time = 'time';
	export const email = 'email';
	export const idnEmail = 'idn-email';
	export const hostname = 'hostname';
	export const idnHostname = 'idn-hostname';
	export const ipv4 = 'ipv4';
	export const ipv6 = 'ipv6';
	export const uri = 'uri';
	export const uriReference = 'uri-reference';
	export const iri = 'iri';
	export const iriReference = 'iri-reference';
	export const uriTemplate = 'uri-template';
	export const jsonPointer = 'json-pointer';
	export const relativeJsonPointer = 'relative-json-pointer';
	export const regex = 'regex';
}

export interface NumericJsonSchema extends BaseJsonSchema {
	type: JsonSchemaType.Numeric | JsonSchemaType[];
	multipleOf?: number;
	maximum?: number;
	exclusiveMaximum?: boolean;
	minimum?: number;
	exclusiveMinimum?: boolean;
}

export interface StringJsonSchema extends BaseJsonSchema {
	type: typeof JsonSchemaType.string | JsonSchemaType[];
	maxLength?: number;
	minLength?: number;
	pattern?: string;
}

export interface ArrayJsonSchema extends BaseJsonSchema {
	type: typeof JsonSchemaType.array | JsonSchemaType[];
	items?: JsonSchema | JsonSchema[];
	additionalItems?: JsonSchema;
	maxItems?: number;
	minItems?: number;
	uniqueItems?: boolean;
	contains: JsonSchema;
}

export interface ObjectJsonSchema extends BaseJsonSchema {
	type: typeof JsonSchemaType.object | JsonSchemaType[];
	maxProperties?: number;
	minProperties?: number;
	required?: string[];
	properties?: {
		[name: string]: JsonSchema;
	};
	patternProperties?: {
		[name: string]: JsonSchema;
	};
	additionalProperties?: JsonSchema;
	dependencies?: {
		[name: string]: JsonSchema | string[];
	};
}

namespace JsonSchemaType {
	export const number = 'number';
	export const integer = 'integer';
	export const array = 'array';
	export const object = 'object';
	export const string = 'string';
	export type Numeric = typeof number | typeof integer;
}

export type JsonSchemaType =
	| 'null'
	| 'boolean'
	| typeof JsonSchemaType.object
	| typeof JsonSchemaType.array
	| typeof JsonSchemaType.string
	| JsonSchemaType.Numeric;