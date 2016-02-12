/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import nodes = require('vs/languages/css/common/parser/cssNodes');
import service = require('vs/languages/css/common/services/cssLanguageService');
import languageFacts = require('vs/languages/css/common/services/languageFacts');

export enum Type {
	Url,
	Percentage,
	Length,
	Number,
	Time,
	Angle,
	Color,

	Identifier,
	Enum,
	Unknown
}

export interface IType {
	isSimpleType():boolean;
}

export class SimpleType implements IType {

	constructor(public type:Type) {
		// empty
	}

	public isSimpleType():boolean {
		return true;
	}

	public static Color = new SimpleType(Type.Color);
	public static Identifier = new SimpleType(Type.Identifier);
	public static Url = new SimpleType(Type.Url);
	public static Unknown = new SimpleType(Type.Unknown);
}

export class MultiType implements IType {

	constructor(public types:IType[]) {
		// empty
	}

	public isSimpleType():boolean {
		return false;
	}
}

export function typeAtPosition(service:service.ILanguageService, resource:URI, offset:number):IType {

	return null;
}

export function typeFromNode(node:nodes.Node):IType {

	if(!node) {
		return SimpleType.Unknown;
	}

	switch(node.type) {
		case nodes.NodeType.Expression: return typeFromExpression(<nodes.Expression> node);
		case nodes.NodeType.BinaryExpression: return typeFromBinaryExpression(<nodes.BinaryExpression> node);
		case nodes.NodeType.Term: return typeFromTerm(<nodes.Term> node);
		case nodes.NodeType.Function: return typeFromFunction(<nodes.Function> node);
		case nodes.NodeType.NumericValue: return typeFromNumeric(<nodes.NumericValue> node);
		case nodes.NodeType.HexColorValue: return SimpleType.Color;
		case nodes.NodeType.Identifier: return typeFromLiteral(node);
		case nodes.NodeType.FunctionArgument: return typeFromFunctionArgument(<nodes.FunctionArgument> node);
	}

	return SimpleType.Unknown;
}

function typeFromExpression(node:nodes.Expression):IType {
	var types:IType[] = node.getChildren().map((node) => {
		return typeFromNode(node);
	});
	if(types.length === 0) {
		return SimpleType.Unknown;
	} else if(types.length === 1) {
		return types[0];
	} else {
		return new MultiType(types);
	}
}

function typeFromBinaryExpression(node:nodes.BinaryExpression):IType {
	if(node.getRight()) {
		return new MultiType([typeFromNode(node.getLeft()), typeFromNode(node.getRight())]);
	} else {
		return typeFromNode(node.getLeft());
	}
}

function typeFromTerm(node:nodes.Term):IType {
	if(!node.getExpression()) {
		return SimpleType.Unknown;
	} else {
		return typeFromNode(node.getExpression());
	}
}

function typeFromFunctionArgument(node:nodes.FunctionArgument):IType {
	if(!node.getValue()) {
		return SimpleType.Unknown;
	} else {
		return typeFromNode(node.getValue());
	}
}

function typeFromFunction(node:nodes.Function):IType {

	switch(node.getName()) {
		case 'rgb':
		case 'rgba':
		case 'hsl':
		case 'hsla':
			return SimpleType.Color;
		case 'url':
			return SimpleType.Url;
	}
	var types:IType[] = node.getArguments().getChildren().map((node) => {
		return typeFromNode(node);
	});
	if(types.length === 0) {
		return SimpleType.Unknown;
	} else if(types.length === 1) {
		return types[0];
	} else {
		return new MultiType(types);
	}
}

function typeFromNumeric(node:nodes.NumericValue):IType {

	return new SimpleType((function(){
		var value = node.getValue();
		switch(value.unit) {
			case '%':
				return Type.Percentage;
			case 'px':
			case 'cm':
			case 'mm':
			case 'in':
			case 'pt':
			case 'pc':
				return Type.Length;
			case 's':
			case 'ms':
				return Type.Time;
			case 'deg':
			case 'rad':
			case 'grad':
				return Type.Angle;
		}

		return Type.Number;
	}()));
}

function isColor(name:string):boolean {
	return !!languageFacts.colors[name];
}

function typeFromLiteral(node:nodes.Node):IType {
	if(isColor(node.getText())) {
		return SimpleType.Color;
	} else {
		return SimpleType.Identifier;
	}
}