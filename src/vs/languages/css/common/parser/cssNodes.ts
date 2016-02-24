/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/base/common/types');
import _level = require('vs/languages/css/common/level');

/// <summary>
/// Nodes for the css 2.1 specification. See for reference:
/// http://www.w3.org/TR/CSS21/grammar.html#grammar
/// </summary>

export enum NodeType {
	Undefined,
	Identifier,
	Stylesheet,
	Ruleset,
	Selector,
	SimpleSelector,
	SelectorInterpolation,
	SelectorCombinator,
	SelectorCombinatorParent,
	SelectorCombinatorSibling,
	SelectorCombinatorAllSiblings,
	Page,
	PageBoxMarginBox,
	ClassSelector,
	IdentifierSelector,
	ElementNameSelector,
	PseudoSelector,
	AttributeSelector,
	Declaration,
	Declarations,
	Property,
	Expression,
	BinaryExpression,
	Term,
	Operator,
	Value,
	StringLiteral,
	URILiteral,
	EscapedValue,
	Function,
	NumericValue,
	HexColorValue,
	MixinDeclaration,
	MixinReference,
	VariableName,
	VariableDeclaration,
	Prio,
	Interpolation,
	NestedProperties,
	ExtendsReference,
	SelectorPlaceholder,
	Debug,
	If,
	Else,
	For,
	Each,
	While,
	MixinContent,
	Media,
	Keyframe,
	FontFace,
	Import,
	Namespace,
	Invocation,
	FunctionDeclaration,
	ReturnStatement,
	MediaQuery,
	FunctionParameter,
	FunctionArgument,
	KeyframeSelector,
	MSViewPort,
	Document
}

export enum ReferenceType {
	Mixin,
	Rule,
	Variable,
	Function,
	Keyframe,
	Unknown
}



export function getNodeAtOffset(node:Node, offset:number):Node {

	var candidate:Node = null;
	if (!node || offset < node.offset || offset > node.offset + node.length ) {
		return null;
	}

	// Find the shortest node at the position
	node.accept((node) => {
		if (node.offset === -1 && node.length === -1) {
			return true;
		}
		if (node.offset <= offset && node.offset + node.length >= offset) {
			if(!candidate) {
				candidate = node;
			} else if(node.length <= candidate.length) {
				candidate = node;
			}
			return true;
		}
		return false;
	});
	return candidate;
}

export function getNodePath(node:Node, offset:number):Node[] {

	var candidate:Node = getNodeAtOffset(node, offset),
		path:Node[] = [];

	while(candidate) {
		path.unshift(candidate);
		candidate = candidate.parent;
	}

	return path;
}

export function getParentDeclaration(node:Node) : Declaration {
	var decl = <Declaration> node.findParent(NodeType.Declaration);
	if (decl && decl.getValue() && decl.getValue().encloses(node)) {
		return decl;
	}
	return null;
}

export interface ITextProvider {
	(offset: number, length: number) : string;
}


export class Node {

	public parent:Node;

	public offset:number;
	public length:number;

	public options:{[name:string]:any;};

	public textProvider: ITextProvider; // only set on the root node

	private children:Node[];
	private issues:IMarker[];

	private nodeType: NodeType;

	constructor(offset:number=-1, len:number=-1, nodeType?: NodeType) {
		this.parent = null;
		this.offset = offset;
		this.length = len;
		if (nodeType) {
			this.nodeType = nodeType;
		}
	}

	public set type(type:NodeType) {
		this.nodeType = type;
	}

	public get type():NodeType {
		return this.nodeType || NodeType.Undefined;
	}

	public getTextProvider(): ITextProvider {
		var node: Node = this;
		while (node && !node.textProvider) {
			node = node.parent;
		}
		if (node) {
			return node.textProvider;
		}
		return () => { return 'unknown'; };
	}

	public getText():string {
		return this.getTextProvider()(this.offset, this.length);
	}

	public matches(str:string) : boolean {
		return this.length === str.length && this.getTextProvider()(this.offset, this.length) === str;
	}

	public startsWith(str: string) : boolean {
		return this.length >= str.length && this.getTextProvider()(this.offset, str.length) === str;
	}

	public endsWith(str: string) : boolean {
		return this.length >= str.length && this.getTextProvider()(this.offset + this.length - str.length, str.length) === str;
	}

	public accept(visitor: IVisitorFunction):void;
	public accept(visitor: IVisitor):void;
	public accept(visitor: any):void {

		if(!types.isFunction(visitor)) {
			visitor = visitor.visitNode.bind(visitor);
		}

		if(visitor(this) && this.children) {
			this.children.forEach((child) => {
				child.accept(visitor);
			});
		}
	}

	public adoptChild(node:Node, index: number = -1):Node {
		if (node.parent && node.parent.children) {
			var idx = node.parent.children.indexOf(node);
			if(idx >= 0) {
				node.parent.children.splice(idx, 1);
			}
		}
		node.parent = this;
		var children = this.children;
		if (!children) {
			children = this.children = [];
		}
		if (index !== -1) {
			children.splice(idx, 0, node);
		} else {
			children.push(node);
		}
		return node;
	}

	public attachTo(parent:Node, index:number=-1):Node {
		if (parent) {
			parent.adoptChild(this, index);
		}
		return this;
	}

	public collectIssues(results:any[]) : void {
		if (this.issues) {
			results.push.apply(results, this.issues);
		}
	}

	public addIssue(issue: IMarker) : void {
		if (!this.issues) {
			this.issues = [];
		}
		this.issues.push(issue);
	}

	public hasIssue(rule: IRule) : boolean {
		return this.issues && this.issues.some(i => i.getRule() === rule);
	}

	public isErroneous():boolean {
		return this.issues && this.issues.length > 0;
	}

	public setNode(field:string, node:Node, index:number=-1):boolean {
		if(node) {
			node.attachTo(this, index);
			this[field] = node;
			return true;
		}
		return false;
	}

	public addChild(node:Node):boolean {
		if(node) {
			if (!this.children) {
				this.children = [];
			}
			node.attachTo(this);
			this.updateOffsetAndLength(node);
			return true;
		}
		return false;
	}

	private updateOffsetAndLength(node:Node):void {
		if (node.offset < this.offset || this.offset === -1) {
			this.offset = node.offset;
		}
		if ((node.offset + node.length > this.offset + this.length) || this.length === -1)  {
			this.length = node.offset + node.length - this.offset;
		}
	}

	public hasChildren():boolean {
		return this.children && this.children.length > 0;
	}

	public getChildren():Node[] {
		return this.children ? this.children.slice(0) : [];
	}

	public getChild(index:number):Node {
		if (this.children && index < this.children.length) {
			return this.children[index];
		}
		return null;
	}

	public addChildren(nodes:Node[]):void {
		nodes.forEach((node) => this.addChild(node));
	}

	public findFirstChildBeforeOffset(offset:number): Node {
		if (this.children) {
			var current:Node = null;
			for (var i= this.children.length - 1; i >= 0; i--) {
				// iterate until we find a child that has a start offset smaller than the input offset
				current= this.children[i];
				if (current.offset <= offset) {
					return current;
				}
			}
		}
		return null;
	}

	public findChildAtOffset(offset:number, goDeep: boolean): Node {
		var current:Node = this.findFirstChildBeforeOffset(offset);
		if (current && current.offset + current.length >= offset) {
			if (goDeep) {
				return current.findChildAtOffset(offset, true) || current;
			}
			return current;
		}
		return null;
	}

	public encloses(candidate:Node):boolean {
		return this.offset <= candidate.offset && this.offset + this.length >= candidate.offset + candidate.length;
	}

	public getParent():Node {
		var result = this.parent;
		while(result instanceof Nodelist) {
			result = result.parent;
		}
		return result;
	}

	public findParent(type:NodeType):Node {
		var result: Node = this;
		while (result && result.type !== type) {
			result = result.parent;
		}
		return result;
	}

	public setData(key:string, value:any):void {
		if(!this.options) {
			this.options = {};
		}
		this.options[key] = value;
	}

	public getData(key:string):any {
		if(!this.options || !this.options.hasOwnProperty(key)) {
			return null;
		}
		return this.options[key];
	}
}

export class Nodelist extends Node {

	constructor(parent:Node, index:number = -1) {
		super(-1, -1);
		this.attachTo(parent, index);
		this.offset = -1;
		this.length = -1;
	}
}


export class Identifier extends Node {

	public referenceTypes: ReferenceType[];

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Identifier;
	}

	public containsInterpolation() : boolean {
		return this.hasChildren();
	}
}

export class Stylesheet extends Node {

	private name:string;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Stylesheet;
	}

	public setName(value:string):void {
		this.name = value;
	}

}

export class Declarations extends Node {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Declarations;
	}
}

export class BodyDeclaration extends Node {

	private declarations: Declarations;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public getDeclarations():Declarations {
		return this.declarations;
	}

	public setDeclarations(decls:Declarations):boolean {
		return this.setNode('declarations', decls);
	}

}

export class RuleSet extends BodyDeclaration {

	private selectors:Nodelist;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Ruleset;
	}

	public getSelectors():Nodelist {
		if (!this.selectors) {
			this.selectors = new Nodelist(this);
		}
		return this.selectors;
	}

	public isNested():boolean {
		return this.parent && this.parent.findParent(NodeType.Ruleset) !== null;
	}
}

export class Selector extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Selector;
	}

}

export class SimpleSelector extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.SimpleSelector;
	}
}

export class Declaration extends Node {

	private property:Property;
	private value:Expression;
	private nestedProprties:NestedProperties;

	// positions for code assist
	public colonPosition:number;
	public semicolonPosition:number; // semicolon following the declaration

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Declaration;
	}

	public setProperty(node:Property):boolean {
		return this.setNode('property', node);
	}

	public getProperty():Property {
		return this.property;
	}

	public getFullPropertyName(): string {
		var propertyName = this.property ? this.property.getName() : 'unknown';
		if (this.parent instanceof Declarations && this.parent.getParent() instanceof NestedProperties) {
			var parentDecl = this.parent.getParent().getParent();
			if (parentDecl instanceof Declaration) {
				return (<Declaration> parentDecl).getFullPropertyName() + propertyName;
			}
		}
		return propertyName;
	}

	public getNonPrefixedPropertyName() : string {
		var propertyName = this.getFullPropertyName();
		if (propertyName && propertyName.charAt(0) === '-') {
			var vendorPrefixEnd = propertyName.indexOf('-', 1);
			if (vendorPrefixEnd !== -1) {
				return propertyName.substring(vendorPrefixEnd + 1);
			}
		}
		return propertyName;
	}

	public setValue(value:Expression):boolean {
		return this.setNode('value', value);
	}

	public getValue():Expression {
		return this.value;
	}

	public setNestedProperties(value:NestedProperties):boolean {
		return this.setNode('nestedProprties', value);
	}

	public getNestedProperties():NestedProperties {
		return this.nestedProprties;
	}
}

export class Property extends Node {

	private identifier: Identifier;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Property;
	}

	public setIdentifier(value: Identifier): boolean {
		return this.setNode('identifier', value);
	}

	public getIdentifier():Identifier {
		return this.identifier;
	}

	public getName():string {
		return this.getText();
	}
}

export class Invocation extends Node {

	private arguments:Nodelist;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Invocation;
	}

	public getArguments():Nodelist {
		if(!this.arguments) {
			this.arguments = new Nodelist(this);
		}
		return this.arguments;
	}
}

export class Function extends Invocation {

	private identifier:Identifier;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Function;
	}

	public setIdentifier(node:Identifier):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}

}

export class FunctionParameter extends Node {

	private identifier:Node;
	private defaultValue:Node;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.FunctionParameter;
	}

	public setIdentifier(node:Node):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public setDefaultValue(node: Node):boolean {
		return this.setNode('defaultValue', node, 0);
	}

	public getDefaultValue(): Node {
		return this.defaultValue;
	}
}

export class FunctionArgument extends Node {

	private identifier:Node;
	private value:Node;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.FunctionArgument;
	}

	public setIdentifier(node:Node):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public setValue(node: Node):boolean {
		return this.setNode('value', node, 0);
	}

	public getValue(): Node {
		return this.value;
	}
}

export class IfStatement extends BodyDeclaration {
	public expression:Expression;
	public elseClause: BodyDeclaration;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.If;
	}

	public setExpression(node:Expression):boolean {
		return this.setNode('expression', node, 0);
	}

	public setElseClause(elseClause:BodyDeclaration):boolean {
		return this.setNode('elseClause', elseClause);
	}
}

export class ForStatement extends BodyDeclaration {
	public variable:Variable;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.For;
	}

	public setVariable(node:Variable):boolean {
		return this.setNode('variable', node, 0);
	}
}

export class EachStatement extends BodyDeclaration {
	public variable:Variable;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Each;
	}

	public setVariable(node:Variable):boolean {
		return this.setNode('variable', node, 0);
	}
}

export class WhileStatement extends BodyDeclaration {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.While;
	}
}

export class ElseStatement extends BodyDeclaration {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Else;
	}
}

export class FunctionDeclaration extends BodyDeclaration {
	private identifier:Identifier;
	private parameters: Nodelist;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.FunctionDeclaration;
	}

	public setIdentifier(node:Identifier):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getParameters():Nodelist {
		if(!this.parameters) {
			this.parameters = new Nodelist(this);
		}
		return this.parameters;
	}
}

export class MSViewPort extends BodyDeclaration {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.MSViewPort;
	}
}

export class FontFace extends BodyDeclaration {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.FontFace;
	}

}

export class NestedProperties extends BodyDeclaration {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.NestedProperties;
	}
}

export class Keyframe extends BodyDeclaration {

	private keyword: Node;
	private identifier:Identifier;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Keyframe;
	}

	public setKeyword(keyword:Node):boolean {
		return this.setNode('keyword', keyword, 0);
	}

	public getKeyword(): Node {
		return this.keyword;
	}

	public setIdentifier(node:Identifier):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}
}

export class KeyframeSelector extends BodyDeclaration {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.KeyframeSelector;
	}
}

export class Import extends Node {

	private medialist:Node;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Import;
	}

	public setMedialist(node:Node):boolean {
		if(node) {
			node.attachTo(this);
			this.medialist = node;
			return true;
		}
		return false;
	}
}

export class Namespace extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Namespace;
	}

}

export class Media extends BodyDeclaration {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Media;
	}
}

export class Document extends BodyDeclaration {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Document;
	}
}

export class Medialist extends Node {
	private mediums:Nodelist;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public getMediums():Nodelist {
		if (!this.mediums) {
			this.mediums = new Nodelist(this);
		}
		return this.mediums;
	}
}

export class MediaQuery extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.MediaQuery;
	}
}

export class Page extends BodyDeclaration {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Page;
	}

}

export class PageBoxMarginBox extends BodyDeclaration {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.PageBoxMarginBox;
	}

}

export class Expression extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Expression;
	}
}

export class BinaryExpression extends Node {

	private left:Node;
	private right:Node;
	private operator:Node;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.BinaryExpression;
	}

	public setLeft(left:Node):boolean {
		return this.setNode('left', left);
	}

	public getLeft():Node {
		return this.left;
	}

	public setRight(right:Node):boolean {
		return this.setNode('right', right);
	}

	public getRight():Node {
		return this.right;
	}

	public setOperator(value:Node):boolean {
		return this.setNode('operator', value);
	}

	public getOperator():Node {
		return this.operator;
	}
}

export class Term extends Node {

	private operator:Node;
	private expression:Node;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Term;
	}

	public setOperator(value:Node):boolean {
		return this.setNode('operator', value);
	}

	public getOperator():Node {
		return this.operator;
	}

	public setExpression(value:Node):boolean {
		return this.setNode('expression', value);
	}

	public getExpression():Node {
		return this.expression;
	}
}

export class Operator extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Operator;
	}

}

export class HexColorValue extends Node {
	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.HexColorValue;
	}

}

export class NumericValue extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.NumericValue;
	}

	public getValue() : { value: string; unit: string } {
		var raw = this.getText();
		var unitIdx = 0,
			code:number,
			_dot = '.'.charCodeAt(0),
			_0 = '0'.charCodeAt(0),
			_9 = '9'.charCodeAt(0);

		for (var i = 0, len = raw.length; i < len; i++) {
			code = raw.charCodeAt(i);
			if(!(_0 <= code && code <= _9 || code === _dot)) {
				break;
			}
			unitIdx += 1;
		}
		return {
			value: raw.substring(0, unitIdx),
			unit: unitIdx < len ? raw.substring(unitIdx) : undefined
		};
	}
}

export class VariableDeclaration extends Node {

	private variable:Variable;
	private value:Node;

	public colonPosition: number;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.VariableDeclaration;
	}

	public setVariable(node:Variable):boolean {
		if (node) {
			node.attachTo(this);
			this.variable = node;
			return true;
		}
		return false;
	}

	public getName():string {
		return this.variable ? this.variable.getName() : '';
	}

	public setValue(node:Node):boolean {
		if (node) {
			node.attachTo(this);
			this.value = node;
			return true;
		}
		return false;
	}

}

export class Interpolation extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.Interpolation;
	}
}

export class Variable extends Node {

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.VariableName;
	}

	public getName():string {
		return this.getText();
	}

}

export class ExtendsReference extends Node {
	private selector:Selector;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.ExtendsReference;
	}

	public setSelector(node:Selector):boolean {
		return this.setNode('selector', node, 0);
	}

	public getSelector(): Selector {
		return this.selector;
	}

	public getName() : string {
		return this.selector ? this.selector.getText() : '';
	}
}


export class MixinReference extends Node {
	private identifier:Identifier;
	private arguments:Nodelist;
	private content: BodyDeclaration;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.MixinReference;
	}

	public setIdentifier(node:Identifier):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getArguments():Nodelist {
		if (!this.arguments) {
			this.arguments = new Nodelist(this);
		}
		return this.arguments;
	}

	public setContent(node:BodyDeclaration):boolean {
		return this.setNode('content', node);
	}

	public getContent(): BodyDeclaration {
		return this.content;
	}
}

export class MixinDeclaration extends BodyDeclaration {

	private identifier:Identifier;
	private parameters:Nodelist;
	private guard:LessGuard;

	constructor(offset:number, length:number) {
		super(offset, length);
	}

	public get type():NodeType {
		return NodeType.MixinDeclaration;
	}

	public setIdentifier(node:Identifier):boolean {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Identifier {
		return this.identifier;
	}

	public getName() : string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getParameters():Nodelist {
		if (!this.parameters) {
			this.parameters = new Nodelist(this);
		}
		return this.parameters;
	}

	public setGuard(node:LessGuard):boolean {
		if(node) {
			node.attachTo(this);
			this.guard = node;
		}
		return false;
	}
}

export class LessGuard extends Node {

	public isNegated:boolean;
	private conditions:Nodelist;

	public getConditions():Nodelist {
		if(!this.conditions) {
			this.conditions = new Nodelist(this);
		}
		return this.conditions;
	}
}

export class GuardCondition extends Node {

	public variable:Node;
	public isEquals:boolean;
	public isGreater:boolean;
	public isEqualsGreater:boolean;
	public isLess:boolean;
	public isEqualsLess:boolean;

	public setVariable(node:Node):boolean {
		return this.setNode('variable', node);
	}
}

export interface IRule {
	id: string;
	message: string;
}


export interface IMarker {
	getNode():Node;
	getMessage():string;
	getOffset(): number;
	getLength(): number;
	getRule():IRule;
	getLevel():_level.Level;
}

export class Marker implements IMarker {

	private node:Node;
	private rule:IRule;
	private level:_level.Level;
	private message:string;
	private offset:number;
	private length:number;

	constructor(node:Node, rule:IRule, level:_level.Level, message?:string, offset:number=node.offset, length:number=node.length) {
		this.node = node;
		this.rule = rule;
		this.level = level;
		this.message = message || rule.message;
		this.offset= offset;
		this.length= length;
	}

	public getRule():IRule {
		return this.rule;
	}

	public getLevel():_level.Level {
		return this.level;
	}

	public getOffset():number {
		return this.offset;
	}

	public getLength():number {
		return this.length;
	}

	public getNode():Node {
		return this.node;
	}

	public getMessage():string {
		return this.message;
	}
}

export interface IVisitor {
	visitNode:(node:Node)=>boolean;
}

export interface IVisitorFunction {
	(node:Node):boolean;
}
/*
export class DefaultVisitor implements IVisitor {

	public visitNode(node:Node):boolean {
		switch (node.type) {
			case NodeType.Stylesheet:
				return this.visitStylesheet(<Stylesheet> node);
			case NodeType.FontFace:
				return this.visitFontFace(<FontFace> node);
			case NodeType.Ruleset:
				return this.visitRuleSet(<RuleSet> node);
			case NodeType.Selector:
				return this.visitSelector(<Selector> node);
			case NodeType.SimpleSelector:
				return this.visitSimpleSelector(<SimpleSelector> node);
			case NodeType.Declaration:
				return this.visitDeclaration(<Declaration> node);
			case NodeType.Function:
				return this.visitFunction(<Function> node);
			case NodeType.FunctionDeclaration:
				return this.visitFunctionDeclaration(<FunctionDeclaration> node);
			case NodeType.FunctionParameter:
				return this.visitFunctionParameter(<FunctionParameter> node);
			case NodeType.FunctionArgument:
				return this.visitFunctionArgument(<FunctionArgument> node);
			case NodeType.Term:
				return this.visitTerm(<Term> node);
			case NodeType.Declaration:
				return this.visitExpression(<Expression> node);
			case NodeType.NumericValue:
				return this.visitNumericValue(<NumericValue> node);
			case NodeType.Page:
				return this.visitPage(<Page> node);
			case NodeType.PageBoxMarginBox:
				return this.visitPageBoxMarginBox(<PageBoxMarginBox> node);
			case NodeType.Property:
				return this.visitProperty(<Property> node);
			case NodeType.NumericValue:
				return this.visitNodelist(<Nodelist> node);
			case NodeType.Import:
				return this.visitImport(<Import> node);
			case NodeType.Namespace:
				return this.visitNamespace(<Namespace> node);
			case NodeType.Keyframe:
				return this.visitKeyframe(<Keyframe> node);
			case NodeType.KeyframeSelector:
				return this.visitKeyframeSelector(<KeyframeSelector> node);
			case NodeType.MixinDeclaration:
				return this.visitMixinDeclaration(<MixinDeclaration> node);
			case NodeType.MixinReference:
				return this.visitMixinReference(<MixinReference> node);
			case NodeType.Variable:
				return this.visitVariable(<Variable> node);
			case NodeType.VariableDeclaration:
				return this.visitVariableDeclaration(<VariableDeclaration> node);
		}
		return this.visitUnknownNode(node);
	}

	public visitFontFace(node:FontFace):boolean {
		return true;
	}

	public visitKeyframe(node:Keyframe):boolean {
		return true;
	}

	public visitKeyframeSelector(node:KeyframeSelector):boolean {
		return true;
	}

	public visitStylesheet(node:Stylesheet):boolean {
		return true;
	}

	public visitProperty(Node:Property):boolean {
		return true;
	}

	public visitRuleSet(node:RuleSet):boolean {
		return true;
	}

	public visitSelector(node:Selector):boolean {
		return true;
	}

	public visitSimpleSelector(node:SimpleSelector):boolean {
		return true;
	}

	public visitDeclaration(node:Declaration):boolean {
		return true;
	}

	public visitFunction(node:Function):boolean {
		return true;
	}

	public visitFunctionDeclaration(node:FunctionDeclaration):boolean {
		return true;
	}

	public visitInvocation(node:Invocation):boolean {
		return true;
	}

	public visitTerm(node:Term):boolean {
		return true;
	}

	public visitImport(node:Import):boolean {
		return true;
	}

	public visitNamespace(node:Namespace):boolean {
		return true;
	}

	public visitExpression(node:Expression):boolean {
		return true;
	}

	public visitNumericValue(node:NumericValue):boolean {
		return true;
	}

	public visitPage(node:Page):boolean {
		return true;
	}

	public visitPageBoxMarginBox(node:PageBoxMarginBox):boolean {
		return true;
	}

	public visitNodelist(node:Nodelist):boolean {
		return true;
	}

	public visitVariableDeclaration(node:VariableDeclaration):boolean {
		return true;
	}

	public visitVariable(node:Variable):boolean {
		return true;
	}

	public visitMixinDeclaration(node:MixinDeclaration):boolean {
		return true;
	}

	public visitMixinReference(node:MixinReference):boolean {
		return true;
	}

	public visitUnknownNode(node:Node):boolean {
		return true;
	}
}
*/
export class ParseErrorCollector implements IVisitor {

	static entries(node:Node):IMarker[] {
		var visitor = new ParseErrorCollector();
		node.accept(visitor);
		return visitor.entries;
	}

	public entries:IMarker[];

	constructor() {
		this.entries = [];
	}

	public visitNode(node:Node):boolean {

		if(node.isErroneous()) {
			node.collectIssues(this.entries);
		}
		return true;
	}
}

