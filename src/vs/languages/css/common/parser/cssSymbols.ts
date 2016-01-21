/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nodes = require('./cssNodes');
import arrays = require('vs/base/common/arrays');

export class Scope {

	public parent:Scope;
	public children:Scope[];

	public offset:number;
	public length:number;

	private symbols:Symbol[];

	constructor(offset:number, length:number) {
		this.offset = offset;
		this.length = length;
		this.symbols = [];

		this.parent = null;
		this.children = [];
	}

	public addChild(scope:Scope):void {
		this.children.push(scope);
		scope.setParent(this);
	}

	public setParent(scope:Scope):void {
		this.parent = scope;
	}

	public findScope(offset:number, length:number=0):Scope {
		if (this.offset <= offset && this.offset + this.length > offset + length || this.offset === offset && this.length === length) {
			return this.findInScope(offset, length);
		}
		return null;
	}

	private findInScope(offset: number, length: number = 0): Scope {
		// find the first scope child that has an offset larger than offset + length
		var end = offset + length;
		var idx = arrays.findFirst(this.children, s => s.offset > end);
		if (idx === 0) {
			// all scopes have offsets larger than our end
			return this;
		}

		var res = this.children[idx-1];
		if (res.offset <= offset && res.offset + res.length >= offset + length) {
			return res.findInScope(offset, length);
		}
		return this;
	}

	public addSymbol(symbol:Symbol):void {
		this.symbols.push(symbol);
	}

	public getSymbol(name:string, type: nodes.ReferenceType):Symbol {
		for (var index = 0; index < this.symbols.length; index++) {
			var symbol = this.symbols[index];
			if (symbol.name === name && symbol.type === type) {
				return symbol;
			}
		}
		return null;
	}

	public getSymbols():Symbol[] {
		return this.symbols;
	}
}

export class GlobalScope extends Scope {

	constructor() {
		super(0, Number.MAX_VALUE);
	}
}



export class Symbol {

	public name:string;
	public type:nodes.ReferenceType;
	public node:nodes.Node;

	constructor(name:string, node:nodes.Node, type: nodes.ReferenceType) {
		this.name = name;
		this.node = node;
		this.type = type;
	}
}

export class ScopeBuilder implements nodes.IVisitor {

	public scope:Scope;

	constructor(scope:Scope) {
		this.scope = scope;
	}

	private addSymbol(node:nodes.Node, name:string, type: nodes.ReferenceType) : void {
		if (node.offset !== -1) {
			var current = this.scope.findScope(node.offset, node.length);
			current.addSymbol(new Symbol(name, node, type));
		}
	}

	private addScope(node:nodes.Node) : Scope {
		if (node.offset !== -1) {
			var current = this.scope.findScope(node.offset, node.length);
			if (current.offset !== node.offset || current.length !== node.length) { // scope already known?
				var newScope = new Scope(node.offset, node.length);
				current.addChild(newScope);
				return newScope;
			}
			return current;
		}
		return null;
	}

	private addSymbolToChildScope(scopeNode:nodes.Node, node:nodes.Node, name:string, type: nodes.ReferenceType): void {
		if (scopeNode && scopeNode.offset !== -1 ) {
			var current = this.addScope(scopeNode); // create the scope or gets the existing one
			current.addSymbol(new Symbol(name, node, type));
		}
	}

	public visitNode(node:nodes.Node):boolean {
		switch (node.type) {
			case nodes.NodeType.Keyframe:
				this.addSymbol(node, (<nodes.Keyframe> node).getName(), nodes.ReferenceType.Keyframe);
				return true;
			case nodes.NodeType.VariableDeclaration:
				this.addSymbol(node, (<nodes.VariableDeclaration> node).getName(), nodes.ReferenceType.Variable);
				return true;
			case nodes.NodeType.Ruleset:
				return this.visitRuleSet(<nodes.RuleSet> node);
			case nodes.NodeType.MixinDeclaration:
				this.addSymbol(node, (<nodes.MixinDeclaration> node).getName(), nodes.ReferenceType.Mixin);
				return true;
			case nodes.NodeType.FunctionDeclaration:
				this.addSymbol(node, (<nodes.FunctionDeclaration> node).getName(), nodes.ReferenceType.Function);
				return true;
			case nodes.NodeType.FunctionParameter: {
				// parameters are part of the body scope
				let scopeNode = (<nodes.BodyDeclaration> node.getParent()).getDeclarations();
				if (scopeNode) {
					this.addSymbolToChildScope(scopeNode, node, (<nodes.FunctionParameter> node).getName(), nodes.ReferenceType.Variable);
				}
				return true;
			}
			case nodes.NodeType.Declarations:
				this.addScope(node);
				return true;
			case nodes.NodeType.For:
			case nodes.NodeType.Each: {
				var forOrEachNode = <nodes.ForStatement | nodes.EachStatement> node;
				let scopeNode = forOrEachNode.getDeclarations();
				if (scopeNode) {
					this.addSymbolToChildScope(scopeNode, forOrEachNode.variable, forOrEachNode.variable.getName(), nodes.ReferenceType.Variable);
				}
				return true;
			}
		}
		return true;
	}

	public visitRuleSet(node:nodes.RuleSet):boolean {
		var current = this.scope.findScope(node.offset, node.length);
		node.getSelectors().getChildren().forEach((node) => {
			if (node instanceof nodes.Selector) {
				if (node.getChildren().length === 1) { // only selectors with a single element can be extended
					current.addSymbol(new Symbol(node.getChild(0).getText(), node, nodes.ReferenceType.Rule));
				}
			}
		});
		return true;
	}
}


export class Symbols {

	private global:Scope;

	constructor(node:nodes.Node) {
		this.global = new GlobalScope();
		node.accept(new ScopeBuilder(this.global));
	}

	public findSymbolsAtOffset(offset:number, referenceType: nodes.ReferenceType) : Symbol[] {
		var scope = this.global.findScope(offset, 0);
		var result : Symbol[] = [];
		var names : { [name:string]: boolean } = {};
		while (scope) {
			var symbols = scope.getSymbols();
			for (var i = 0; i < symbols.length; i++) {
				var symbol = symbols[i];
				if (symbol.node.offset <= offset && symbol.type === referenceType && !names[symbol.name]) {
					result.push(symbol);
					names[symbol.name] = true;
				}
			}
			scope = scope.parent;
		}
		return result;
	}

	private internalFindSymbol(node:nodes.Node, referenceTypes:nodes.ReferenceType[]): Symbol {
		var scopeNode = node;
		if (node.parent instanceof nodes.FunctionParameter && node.parent.getParent() instanceof nodes.BodyDeclaration) {
			scopeNode = (<nodes.BodyDeclaration> node.parent.getParent()).getDeclarations();
		}
		if (node.parent instanceof nodes.FunctionArgument && node.parent.getParent() instanceof nodes.Function) {
			var funcId = (<nodes.Function> node.parent.getParent()).getIdentifier();
			if (funcId) {
				var functionSymbol = this.internalFindSymbol(funcId, [nodes.ReferenceType.Function]);
				if (functionSymbol) {
					scopeNode = (<nodes.FunctionDeclaration> functionSymbol.node).getDeclarations();
				}
			}
		}
		if (!scopeNode) {
			return null;
		}
		var name = node.getText();
		var scope = this.global.findScope(scopeNode.offset, scopeNode.length);
		while (scope) {
			for (var index = 0; index < referenceTypes.length; index++) {
				var type = referenceTypes[index];
				var symbol = scope.getSymbol(name, type);
				if (symbol) {
					return symbol;
				}
			}
			scope = scope.parent;
		}
		return null;
	}

	private evaluateReferenceTypes(node: nodes.Node) : nodes.ReferenceType[] {
		if (node instanceof nodes.Identifier) {
			var referenceTypes = (<nodes.Identifier> node).referenceTypes;
			if (referenceTypes) {
				return referenceTypes;
			} else {
				// are a reference to a keyframe?
				var decl = nodes.getParentDeclaration(node);
				if (decl) {
					var propertyName = decl.getNonPrefixedPropertyName();
					if ((propertyName === 'animation' || propertyName === 'animation-name')
						&& decl.getValue() && decl.getValue().offset === node.offset) {
						return [ nodes.ReferenceType.Keyframe ];
					}
				}
			}
		} else if (node instanceof nodes.Variable) {
			return [ nodes.ReferenceType.Variable ];
		}
		var selector = node.findParent(nodes.NodeType.Selector);
		if (selector) {
			return [ nodes.ReferenceType.Rule ];
		}
		var extendsRef = <nodes.ExtendsReference> node.findParent(nodes.NodeType.ExtendsReference);
		if (extendsRef) {
			return [ nodes.ReferenceType.Rule ];
		}
		return null;
	}

	public findSymbolFromNode(node: nodes.Node):Symbol {
		if (!node) {
			return null;
		}
		while (node.type === nodes.NodeType.Interpolation) {
			node = node.getParent();
		}

		var referenceTypes = this.evaluateReferenceTypes(node);
		if (referenceTypes) {
			return this.internalFindSymbol(node, referenceTypes);
		}
		return null;
	}

	public matchesSymbol(node: nodes.Node, symbol: Symbol):boolean {
		if (!node) {
			return null;
		}
		while (node.type === nodes.NodeType.Interpolation) {
			node = node.getParent();
		}
		if (symbol.name.length !== node.length || symbol.name !== node.getText()) {
			return false;
		}

		var referenceTypes = this.evaluateReferenceTypes(node);
		if (!referenceTypes || referenceTypes.indexOf(symbol.type) === -1) {
			return false;
		}

		var nodeSymbol = this.internalFindSymbol(node, referenceTypes);
		return nodeSymbol === symbol;
	}


	public findSymbol(name:string, type: nodes.ReferenceType, offset:number):Symbol {
		var scope = this.global.findScope(offset);
		while(scope) {
			var symbol = scope.getSymbol(name, type);
			if (symbol) {
				return symbol;
			}
			scope = scope.parent;
		}
		return null;
	}
}
