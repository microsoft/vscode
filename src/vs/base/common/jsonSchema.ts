/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface IJSONSchema {
	id?: string;
	$schema?: string;
	type?: string | string[];
	title?: string;
	default?: any;
	definitions?: IJSONSchemaMap;
	description?: string;
	properties?: IJSONSchemaMap;
	patternProperties?: IJSONSchemaMap;
	additionalProperties?: boolean | IJSONSchema;
	minProperties?: number;
	maxProperties?: number;
	dependencies?: IJSONSchemaMap | string[];
	items?: IJSONSchema | IJSONSchema[];
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	additionalItems?: boolean;
	pattern?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: boolean;
	exclusiveMaximum?: boolean;
	multipleOf?: number;
	required?: string[];
	$ref?: string;
	anyOf?: IJSONSchema[];
	allOf?: IJSONSchema[];
	oneOf?: IJSONSchema[];
	not?: IJSONSchema;
	enum?: any[];
	format?: string;

	defaultSnippets?: IJSONSchemaSnippet[]; // VSCode extension
	errorMessage?: string; // VSCode extension
	deprecationMessage?: string; // VSCode extension
	enumDescriptions?: string[]; // VSCode extension
}

export interface IJSONSchemaMap {
	[name: string]: IJSONSchema;
}

export interface IJSONSchemaSnippet {
	label?: string;
	description?: string;
	body?: any; // a object that will be JSON stringified
	bodyText?: string; // an already stringified JSON object that can contain new lines (\n) and tabs (\t)
}
