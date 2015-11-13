/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import rewriter = require('vs/languages/typescript/common/js/rewriting');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

class DefineRewriter implements rewriter.ISyntaxRewriter {

	public get name() {
		return 'rewriter.modules.define';
	}

	private static _pattern = /\bdefine\b/g;

	public computeEdits(context: rewriter.AnalyzerContext): void {

		var sourceText = context.sourceFile.getFullText();
		DefineRewriter._pattern.lastIndex = 0;

		while (DefineRewriter._pattern.test(sourceText)) {

			var offset = DefineRewriter._pattern.lastIndex - 1,
				node = ts.getTokenAtPosition(context.sourceFile, offset);

			if (node && node.kind === ts.SyntaxKind.Identifier && node.parent
				&& node.parent.kind === ts.SyntaxKind.CallExpression) {

				DefineRewriter._checkArguments(<ts.CallExpression> node.parent, context);
			}
		}
	}

	private static _checkArguments(call: ts.CallExpression, context: rewriter.AnalyzerContext): void {

		var dependencies: ts.StringLiteral[],
			parameters: ts.ParameterDeclaration[];

		var idx = call.arguments[0] && call.arguments[0].kind === ts.SyntaxKind.StringLiteral
			? 1 : 0;

		// define(id?, [dep], function(){ ... });
		//              ^^^
		if (call.arguments[idx] && call.arguments[idx].kind === ts.SyntaxKind.ArrayLiteralExpression) {
			(<ts.ArrayLiteralExpression> call.arguments[idx]).elements.forEach(element => {
				if (element.kind === ts.SyntaxKind.StringLiteral) {
					if (!dependencies) {
						dependencies = [<ts.StringLiteral> element];
					} else {
						dependencies.push(<ts.StringLiteral> element);
					}
				}
			});
		}

		// define(id?, [dep], function(dep1, dep2){ ... });
		//                             ^^^^^^^^^^
		idx += 1;
		if (dependencies && call.arguments[idx] && call.arguments[idx].kind === ts.SyntaxKind.FunctionExpression) {
			parameters = (<ts.FunctionExpression> call.arguments[idx]).parameters;
		}

		if (!dependencies || !parameters || !parameters.length) {
			return;
		}

		for (var i = 0; i < parameters.length; i++) {
			var parameter = parameters[i];
			if (DefineRewriter._specialModules[parameter.name.getText()]) {
				// ignore magic dependencies: require, exports, and module
				continue;
			}
			var dependency = dependencies[i];
			if (!dependency) {
				// no more dependencies to fill in
				break;
			}
			var variableName = rewriter.encodeVariableName(parameter);
			context.newDerive(dependency, DefineRewriter._importPattern, variableName, dependency.getText());
			context.newInsert(parameter.name.getEnd(), DefineRewriter._typeOfPattern, variableName);
		}
	}

	static _specialModules: { [n: string]: boolean } = { 'require': true, 'exports': true, 'module': true };
	static _importPattern = 'import * as {0} from {1};\n';
	static _typeOfPattern = ': typeof {0}';
}

export = DefineRewriter;