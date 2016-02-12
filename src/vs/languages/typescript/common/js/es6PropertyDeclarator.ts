/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import rewriter = require('vs/languages/typescript/common/js/rewriting');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

class ES6PropertyDeclarator implements rewriter.ISyntaxRewriter {

	public get name() {
		return 'rewriter.es6.propertyDeclarator';
	}

	public computeEdits(context: rewriter.AnalyzerContext): void {

		var sourceText = context.sourceFile.getFullText(),
			pattern = /\bclass\b/g;

		while (pattern.test(sourceText)) {

			var node = ts.getTokenAtPosition(context.sourceFile, pattern.lastIndex - 1);
			if (node.parent
				&& (node.parent.kind === ts.SyntaxKind.ClassDeclaration || node.parent.kind === ts.SyntaxKind.ClassExpression)) {

				this._checkForThisAssignments(<ts.ClassDeclaration> node.parent, context);
			}
		}
	}

	private _checkForThisAssignments(decl: ts.ClassDeclaration, context: rewriter.AnalyzerContext): void {

		var pattern = /this/g,
			classSourceText = decl.getText(),
			names: { [n: string]: any },
			skipNames: { [n: string]: any };

		while (pattern.test(classSourceText)) {
			var offset = decl.getStart() + pattern.lastIndex - 1;
			var token = ts.getTokenAtPosition(decl.getSourceFile(), offset);

			if (token.parent.kind === ts.SyntaxKind.PropertyAccessExpression
				&& token.parent.parent.kind === ts.SyntaxKind.BinaryExpression) {

				if (!skipNames) {
					// index get/set accessor to avoid duplicate members
					// https://monacotools.visualstudio.com/DefaultCollection/Monaco/_workitems/edit/18402
					skipNames = Object.create(null);
					for (let member of decl.members) {
						if(member.kind === ts.SyntaxKind.SetAccessor ||
							member.kind === ts.SyntaxKind.GetAccessor) {

							skipNames[(<ts.AccessorDeclaration> member).name.getText()] = true;
						}
					}
				}

				// TODO@Joh - filter this-use inside functions
				var name = (<ts.PropertyAccessExpression> token.parent).name;
				if(!skipNames[name.text]) {
					if(!names) {
						names = Object.create(null);
					}
					names[name.text] = true;
				}
			}
		}

		if(names) {
			var text: string[] = [];
			for(var k in names) {
				text.push('\n;');
				text.push(k);
			}
			context.newInsert(decl.members.end, text.join(''));
		}
	}
}

export = ES6PropertyDeclarator;