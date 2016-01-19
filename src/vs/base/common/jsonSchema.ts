/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface IJSONSchema {
	id?:string;
	$schema?: string;
	type?:any;
	title?:string;
	default?:any;
	definitions?:IJSONSchemaMap;
	description?:string;
	properties?: IJSONSchemaMap;
	patternProperties?:IJSONSchemaMap;
	additionalProperties?:any;
	minProperties?:number;
	maxProperties?:number;
	dependencies?:any;
	items?:any;
	minItems?:number;
	maxItems?:number;
	uniqueItems?:boolean;
	additionalItems?:boolean;
	pattern?:string;
	errorMessage?: string;
	minLength?:number;
	maxLength?:number;
	minimum?:number;
	maximum?:number;
	exclusiveMinimum?:boolean;
	exclusiveMaximum?:boolean;
	multipleOf?:number;
	required?:string[];
	$ref?:string;
	anyOf?:IJSONSchema[];
	allOf?:IJSONSchema[];
	oneOf?:IJSONSchema[];
	not?:IJSONSchema;
	enum?:any[];
	format?: string;
}

export interface IJSONSchemaMap {
	[name: string]:IJSONSchema;
}
