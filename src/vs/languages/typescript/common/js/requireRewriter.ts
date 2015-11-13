/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import rewriter = require('vs/languages/typescript/common/js/rewriting');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

class RequireRewriter implements rewriter.ISyntaxRewriter {

	public get name() {
		return 'rewriter.modules.require';
	}

	private static _pattern = /\brequire\b/g;

	public computeEdits(context: rewriter.AnalyzerContext): void {

		var sourceText = context.sourceFile.getFullText();
		RequireRewriter._pattern.lastIndex = 0;

		while (RequireRewriter._pattern.test(sourceText)) {

			var offset = RequireRewriter._pattern.lastIndex - 1,
				node = ts.getTokenAtPosition(context.sourceFile, offset);

			if (node && node.kind === ts.SyntaxKind.Identifier && node.parent
				&& node.parent.kind === ts.SyntaxKind.CallExpression) {

				RequireRewriter._checkCallExpression(<ts.CallExpression> node.parent, context);
			}
		}
	}

	private static _checkCallExpression(call: ts.CallExpression, context: rewriter.AnalyzerContext): void {
		if (call.arguments.length !== 1 || call.arguments[0].kind !== ts.SyntaxKind.StringLiteral) {
			return;
		}
		var stringLiteral = <ts.StringLiteral> call.arguments[0];
		var modulePath = stringLiteral.getText().replace(/\.js("|')$/, (m, g1) => g1);
		var variableName = rewriter.encodeVariableName(stringLiteral);

		context.newDerive(stringLiteral, `import * as ${variableName} from ${modulePath};\n`);

		if (RequireRewriter._needsLeadingSemicolon(call)) {
			context.newReplace(call.getStart(), call.getWidth(), `;(<typeof ${variableName}>${call.getText() })`);
		} else {
			context.newReplace(call.getStart(), call.getWidth(), `(<typeof ${variableName}>${call.getText() })`);
		}
	}

	private static _needsLeadingSemicolon(call: ts.CallExpression): boolean {
		let prevToken = ts.getTokenAtPosition(call.getSourceFile(), call.getFullStart() - 1);

		if (!prevToken || !prevToken.parent) {
			return false;
		}

		switch (prevToken.parent.kind) {
			case ts.SyntaxKind.CallExpression:
			case ts.SyntaxKind.VariableStatement:
			case ts.SyntaxKind.ExpressionStatement:
			case ts.SyntaxKind.ReturnStatement:
			case ts.SyntaxKind.PropertyDeclaration:
			case ts.SyntaxKind.PropertySignature:
				let semicolon = ts.findChildOfKind(prevToken.parent, ts.SyntaxKind.SemicolonToken);
				return !semicolon;
		}

		return false;
	}
}

export = RequireRewriter;