/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import rewriter = require('vs/languages/typescript/common/js/rewriting');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import collections = require('vs/base/common/collections');

export class Node {
	constructor(public offset:number, public length:number) {
		// empty
	}
}

export class List<T extends Node> extends Node {
	public items:T[] = [];
}

export class DefineNode extends Node {
	constructor(offset:number, length:number, public scope:number) {
		super(offset, length);
	}
	public objectLiteral:Node;
	public identifier:string;
	public dependencyArray:List<DependencyNode>;
	public callbackParameters:List<CallbackParameter>;
	public callbackBody:Node;
	public requireStatements:RequireStatement[] = [];
	public exportsDotExpressions:ExportsExpression[] = [];
}

export class CallbackParameter extends Node {
	constructor(offset:number, length:number, public name:string) {
		super(offset, length);
	}
}

export class DependencyNode extends Node {

	constructor(offset: number, length: number, private _path: string) {
		super(offset, length);

		// normalize paths that end with an extension
		// 'farboo.js' becomes 'farboo'
		var match = /('|")(.+)\1/.exec(this._path),
			extname: string;

		if (match && (extname = paths.extname(match[2]))) {
			this._path = `${match[1]}${match[2].substring(0, match[2].length - extname.length) }${match[1]}`;
		}
	}

	get path() {
		return this._path;
	}
}

export class RequireStatement extends DependencyNode {

	constructor(offset: number, length: number, public name: string, path: string) {
		super(offset, length, path);
	}
}

export class ExportsExpression extends Node {

	constructor(offset:number, length:number, public name:string, public node:ts.Node) {
		super(offset, length);
	}
}

export class GlobalExportsExpression extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}
}

export class NamedExportExpresson extends Node {
	constructor(public name:string) {
		super(0, 0);
	}
}

export class ImportsAndExportsCollector implements rewriter.ISyntaxRewriter {


	private static _SpecialCallbackParams = { 'exports': true, 'module': true, 'require': true };
	private static _DeclareWithLiteral = 'declare function define<T>(literal:T):T;\n';
	private static _DeclareTemplate = 'declare function define<T>({0}{1}callback:({2})=>T):T;\n';
	private static _Define = 'define';
	private static _Require = 'require';

	private _context:rewriter.AnalyzerContext;
	private _currentScopeId:number ;
	private _currentNode:DefineNode;
	private _bucket:Node[];
	private _variableNames:VariableNames;

	public get name() {
		return 'rewriter.importsAndExports';
	}

	public computeEdits(context:rewriter.AnalyzerContext):void {

		// pseudo declare exports, module, and require so that
		// we don't show error for module'ish statements that
		// we cannot translate (for instance exports.far.boo = 'farboo')
		context.newInsert('declare var exports:any; declare var module:any; declare var require:any;\n');

		// init state
		this._context = context;
		this._currentScopeId = 0;
		this._currentNode = null;
		this._bucket = [];
		this._variableNames = new VariableNames();

		// walk the syntax tree
		this._visitNode(this._context.sourceFile);

		// compute edits
		let hasSeenDefine = false;
		let exports: string[] = [];

		for(var i = 0, len = this._bucket.length; i < len; i++) {
			var node = this._bucket[i];
			if (node instanceof DefineNode && !hasSeenDefine && (<DefineNode> node).scope === 0) {
				this._translateDefineNode(<DefineNode> node);
				hasSeenDefine = true;
			} else if (node instanceof GlobalExportsExpression) {
				this._translateGlobalExportsExpression(<GlobalExportsExpression> node);
			} else if (node instanceof ExportsExpression) {
				// this._translateExportsExpression(<ExportsExpression> node, exports);
				let lhs = rewriter.encodeVariableName(node.node);
				this._context.newReplace(node.node.getStart(), node.node.getWidth(), `var ${lhs}`);
				exports.push(`${lhs} as ${(<ExportsExpression> node).name}`);

			} else if(node instanceof NamedExportExpresson) {
				// this._translateNamedExportExpresson(<NamedExportExpresson> node);
				exports.push((<NamedExportExpresson> node).name);

			} else if(node instanceof RequireStatement) {
				this._translateRequireStatement(<RequireStatement> node);
			}
		}

		if (exports.length) {
			this._context.newAppend(`\nexport {${exports.join(', ') }}`);
		}
	}

	public get nodes() {
		return this._bucket;
	}

	// ---- until methods ---------------------------------------

	public _untilParent(node:ts.Node, kind:ts.SyntaxKind): ts.Node {
		var parent = node.parent;
		while(parent && parent.kind !== kind) {
			parent = parent.parent;
		}
		return parent;
	}

	private _store(node:Node):void {
		if(this._currentNode) {
			if(node instanceof RequireStatement) {
				this._currentNode.requireStatements.push(<RequireStatement> node);
			} else if(node instanceof ExportsExpression) {
				this._currentNode.exportsDotExpressions.push(<ExportsExpression> node);
			}
		} else {
			this._bucket.push(node);
		}
	}

	// ---- visit implementation ---------------------------------------

	public visitBinaryExpression(node: ts.BinaryExpression): void {
		var exp: Node;

		// we must cover these cases:
		// (1) exports = function f() {}
		// (2) exports.f = function f() {}
		// (3) module.exports = function f() {}
		// (4) module.exports.f = function f() {}
		if(node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.parent.kind === ts.SyntaxKind.ExpressionStatement) {

			var start: number,
				end: number;

			if(syntax.isIdentifier(node.left, 'exports')) {
				// (1) exports = ...
				start = node.left.getStart();
				end = node.left.getEnd();
				exp = new GlobalExportsExpression(start, end - start);

			} else if(node.left.kind === ts.SyntaxKind.PropertyAccessExpression) {
				var propertyAccess = <ts.PropertyAccessExpression> node.left,
					nameText = propertyAccess.name.text;

				if(propertyAccess.expression.kind === ts.SyntaxKind.Identifier) {
					var expressionText = ts.getTextOfNode(propertyAccess.expression);
					if(expressionText === 'exports') {
						// (2) exports.f = ...
						exp = new ExportsExpression(propertyAccess.getStart(), propertyAccess.getWidth(), nameText, node.left);

					} else if(expressionText === 'module' && nameText === 'exports') {
						// (3) module.exports = ...
						exp = new GlobalExportsExpression(propertyAccess.getStart(), propertyAccess.getWidth());
					}

				} else if(propertyAccess.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
					var nestedMemberAccessExpression = <ts.PropertyAccessExpression> propertyAccess.expression;
					if(syntax.isIdentifier(nestedMemberAccessExpression.expression, 'module') && syntax.isIdentifier(nestedMemberAccessExpression.name, 'exports')) {
						// (4) module.exports.f = ...
						exp = new ExportsExpression(propertyAccess.getStart(), propertyAccess.getWidth(), nameText, node.left);
					}
				}
			}

			if(exp && ts.getContainingFunction(node) && !syntax.getContainingAmdDefineCall(node)) {

				if(exp instanceof ExportsExpression) {
					// (module.)exports.f = ...
					// when occurring inside a function we can
					// only hoist up the name of the variable
					exp = new NamedExportExpresson((<ExportsExpression>exp).name);
				} else if(exp instanceof GlobalExportsExpression) {
					// (module.)exports = ...
					// when occuring inside a function we cannot
					// do anything and don't rewrite in this case
					exp = undefined;
				}
			}
		}

		if(exp) {
			this._store(exp);
		} else {
			this._visitNode(node);
		}
	}

	public visitCallExpression(node:ts.CallExpression): void {

		if(false && syntax.isIdentifier(node.expression, ImportsAndExportsCollector._Require)) {
			var args = node.arguments;
			if(syntax.isPath(args, ts.SyntaxKind.StringLiteral)) {
				// amd/commonjs: require via explicit call
				var name:string,
					variableDeclaration = this._untilParent(node, ts.SyntaxKind.VariableDeclaration);

				if (variableDeclaration && (<ts.VariableDeclaration> variableDeclaration).name.kind === ts.SyntaxKind.Identifier) {
					name = (<ts.Identifier>(<ts.VariableDeclaration> variableDeclaration).name).text;
				}

				this._store(new RequireStatement(ts.getTokenPosOfNode(node), node.getWidth(), name, ts.getTextOfNode(args[0])));
			}

		} else if(syntax.isIdentifier(node.expression, ImportsAndExportsCollector._Define)) {

			this._currentNode = new DefineNode(ts.getTokenPosOfNode(node), node.getWidth(), this._currentScopeId);
			args = node.arguments;

			if(syntax.isPath(args, ts.SyntaxKind.ObjectLiteralExpression)) {
				// § 1.3.1: simple name/value pairs
				this._currentNode.objectLiteral = new Node(ts.getTokenPosOfNode(args[0]), args[0].getWidth());

			} else if(syntax.isPath(args, ts.SyntaxKind.FunctionExpression)) {
				// § 1.3.2: definition functions
				this._fillInParametersAndBody(<ts.FunctionExpression> args[0], this._currentNode);

			} else if(syntax.isPath(args, ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.FunctionExpression)) {
				// § 1.3.3: definition function with dependencies
				this._fillInDependencies(<ts.ArrayLiteralExpression> args[0], this._currentNode);
				this._fillInParametersAndBody(<ts.FunctionExpression> args[1], this._currentNode);

			} else if(syntax.isPath(args, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.FunctionExpression)) {
				// § 1.3.6: module with a name
				this._currentNode.identifier = (<ts.StringLiteral> args[0]).text;
				this._fillInDependencies(<ts.ArrayLiteralExpression> args[1], this._currentNode);
				this._fillInParametersAndBody(<ts.FunctionExpression> args[2], this._currentNode);

			} else {
				this._currentNode = null;
			}

			if(this._currentNode) {
				this._bucket.push(this._currentNode);
				this._visitNode(node);
				this._currentNode = null;
				return;
			}
		}

		this._visitNode(node);
	}

	private _fillInDependencies(arraySyntax:ts.ArrayLiteralExpression, node:DefineNode):void {
		node.dependencyArray = new List<DependencyNode>(ts.getTokenPosOfNode(arraySyntax), arraySyntax.getWidth());
		for(var i = 0, len = arraySyntax.elements.length; i < len; i++) {
			var expression = arraySyntax.elements[i];
			node.dependencyArray.items.push(new DependencyNode(ts.getTokenPosOfNode(expression), expression.getWidth(), ts.getTextOfNode(expression)));
		}
	}

	private _fillInParametersAndBody(functionSyntax:ts.FunctionExpression, node:DefineNode):void {
		var start:number, end:number;
		// parameter: list
		start = functionSyntax.parameters.pos;
		end = functionSyntax.parameters.end;
		node.callbackParameters = new List<CallbackParameter>(start, end - start);

		// parameter: each parameter
		var params = functionSyntax.parameters;
		for(var i = 0, len = params.length; i < len; i++) {
			var param = params[i];
			node.callbackParameters.items.push(new CallbackParameter(ts.getTokenPosOfNode(param), param.getWidth(), ts.getTextOfNode(param)));
		}

		// body: omit curly brackets
		start = functionSyntax.body.getStart() + 1;
		end = functionSyntax.body.getEnd() - 1;
		node.callbackBody = new Node(start, end - start);
	}

	private _visitNode(node:ts.Node): void {
		ts.forEachChild(node, child => {
			switch (child.kind) {
				case ts.SyntaxKind.BinaryExpression:
					this.visitBinaryExpression(<ts.BinaryExpression>child);
					break;
				case ts.SyntaxKind.CallExpression:
					this.visitCallExpression(<ts.CallExpression>child);
					break;
				case ts.SyntaxKind.FunctionDeclaration:
				case ts.SyntaxKind.FunctionExpression:
				case ts.SyntaxKind.ArrowFunction:
					this._currentScopeId += 1;
					this._visitNode(child);
					this._currentScopeId -= 1;
					break;
				default:
					this._visitNode(child);
					break;
			}
		});
	}

	// ---- rewrite implementation ---------------------------------------

	private _translateRequireStatement(node:RequireStatement):void {
		var varName = this._variableNames.next(node.name || node.path);
		this._context.newInsert(strings.format('import {0} = require({1});\n', varName, node.path));
		this._context.newReplace(node.offset, node.length, varName);
	}

	private _translateGlobalExportsExpression(node:GlobalExportsExpression):void {
		var varName = this._variableNames.next();
		this._context.newReplace(node.offset, node.length, strings.format('var {0}', varName));
		this._context.newAppend(strings.format('\nexport = {0};', varName));
	}

	// private _translateExportsExpression(node: ExportsExpression): void {
	// 	let lhs = rewriter.encodeVariableName(node.node);
	// 	this._context.newReplace(node.node.getStart(), node.node.getWidth(), `export var ${lhs}`);
	// 	// this._context.newReplace(node.offset, node.length - node.name.length, 'export var ');
	// }

	// private _translateNamedExportExpresson(node:NamedExportExpresson):void {
	// 	this._context.newAppend(`export var ${node.name}:any;\n`);
	// }

	private _translateDefineNode(node:DefineNode):void {

		if(node.objectLiteral) {
			this._context.newInsert(ImportsAndExportsCollector._DeclareWithLiteral);

		} else {
			// dependency-array: import-require statements
			if(false && node.dependencyArray) {
				for(var i = 0, len = node.callbackParameters.items.length; i < len; i++) {
					var param = node.callbackParameters.items[i],
						dependency = node.dependencyArray.items[i];

					if(ImportsAndExportsCollector._SpecialCallbackParams.hasOwnProperty(param.name)) {
						continue;
					}

					if(dependency) {
						var dependencyName = this._variableNames.next();
						this._context.newInsert(strings.format('import {0} = require({1});\n', dependencyName, dependency.path));
						this._context.newInsert(param.offset + param.length, strings.format(':typeof {0}', dependencyName));
					}
				}
			}

			// require-call: move into signature
			var extraCallbackParams:string[] = [];
			for(var i = 0, len = node.requireStatements.length; i < len; i++) {
				var requireStatement = node.requireStatements[i],
					importName = this._variableNames.next(),
					placeholderName = this._variableNames.next();

				this._context.newInsert(strings.format('import {0} = require({1});\n', importName, requireStatement.path));
				this._context.newReplace(requireStatement.offset, requireStatement.length, placeholderName);
				extraCallbackParams.push(strings.format('{0}:typeof {1}', placeholderName, importName));
			}
			if(extraCallbackParams.length > 0) {
				this._context.newInsert(node.callbackParameters.offset + node.callbackParameters.length, strings.format('{0}{1}',
					node.callbackParameters.items.length > 0 ? ',' : '',
					extraCallbackParams.join(',')));
			}

			// exports.<name>: generate return type
			var returnStructure:string[] = [];
			for(var i = 0, len = node.exportsDotExpressions.length; i < len; i++) {
				var exportsDot = node.exportsDotExpressions[i],
					varName = this._variableNames.next();

				this._context.newReplace(exportsDot.offset, exportsDot.length, strings.format('var {0}', varName));
				returnStructure.push(exportsDot.name);
				returnStructure.push(':');
				returnStructure.push(varName);
				returnStructure.push(',');
			}
			if(returnStructure.length > 0) {
				returnStructure.pop(); // remote last comma
				this._context.newInsert(node.callbackBody.offset + node.callbackBody.length, strings.format('return {{0}};', returnStructure.join(strings.empty)));
			}

			// add a 'nice' declaration for the define function
			var idParam = node.identifier ? 'id,' : strings.empty,
				depParam = node.dependencyArray ? 'dep,' : strings.empty,
				params = node.callbackParameters.items.map(item => item.name).concat(node.requireStatements.map((item, idx) => strings.format('_p{0}', idx))).join(',');

			this._context.newInsert(strings.format(ImportsAndExportsCollector._DeclareTemplate, idParam, depParam, params));
		}

		// export what we declare to be returned
		var returnVariable = this._variableNames.next();
		this._context.newInsert(node.offset, strings.format('var {0} = ', returnVariable));
		this._context.newAppend(strings.format('\nexport = {0};', returnVariable));
	}
}

class VariableNames {

	private static _RegExp = /[^A-Za-z_$]/g;
	private static _SpecialChar = '\u0332';

	private _counter = 0;
	private _proposalToName:collections.IStringDictionary<string> = {};
	private _allNames:collections.IStringDictionary<boolean> = {};

	public next(proposal?:string):string {
		if(!proposal) {
			return strings.format('_var_{0}', this._counter++);
		}
		var name = collections.lookup(this._proposalToName, proposal);
		if(name) {
			return name;
		}

		name = proposal.replace(/["']/g, strings.empty);
		name = paths.basename(name);
		name = name.replace(VariableNames._RegExp, strings.empty);

		if(name.length === 0) {
			return this.next();
		} else {
			name = name.split(strings.empty).join(VariableNames._SpecialChar);
		}
		name = name + VariableNames._SpecialChar;

		var basename = name;
		for(var i = 1; collections.contains(this._allNames, name); i++) {
			name = basename + i;
		}

		this._allNames[name] = true;
		this._proposalToName[proposal] = name;
		return name;
	}

	public allocateIfFree(name:string):boolean {
		if(collections.contains(this._allNames, name)) {
			return false;
		}
		this._allNames[name] = true;
		return true;
	}

	public reset():void {
		this._counter = 0;
		this._proposalToName = {};
		this._allNames = {};
	}
}

module syntax {

	export function isPath(list:ts.NodeArray<ts.Expression>, ...kinds:ts.SyntaxKind[]):boolean {

		if(kinds.length !== list.length) {
			return false;
		}
		for(var i = 0, len = kinds.length; i < len; i++) {
			if(list[i].kind !== kinds[i]) {
				return false;
			}
		}
		return true;
	}

	export function isIdentifier(node:ts.Node, value:string):boolean {
		return node.kind === ts.SyntaxKind.Identifier && ts.getTextOfNode(node) === value;
	}

	export function getContainingAmdDefineCall(node: ts.Node): ts.Node {
		while (true) {
			node = node.parent;
			if (!node || isAmdDefineCall(node)) {
				return node;
			}
		}
	}

	export function isAmdDefineCall(node: ts.Node): boolean {
		if (node.kind !== ts.SyntaxKind.CallExpression) {
			return false;
		}

		var callExpression = <ts.CallExpression> node;
		if (!isIdentifier(callExpression.expression, 'define')) {
			return false;
		}

		if (syntax.isPath(callExpression.arguments, ts.SyntaxKind.ObjectLiteralExpression)) {
			// § 1.3.1: simple name/value pairs
			return true;

		} else if (syntax.isPath(callExpression.arguments, ts.SyntaxKind.FunctionExpression)) {
			// § 1.3.2: definition functions
			return true;

		} else if (syntax.isPath(callExpression.arguments, ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.FunctionExpression)) {
			// § 1.3.3: definition function with dependencies
			return true;

		} else if (syntax.isPath(callExpression.arguments, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.FunctionExpression)) {
			// § 1.3.6: module with a name
			return true;
		}

		return false;
	}
}
