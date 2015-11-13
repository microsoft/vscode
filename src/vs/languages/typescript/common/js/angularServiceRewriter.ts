/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import rewriter = require('vs/languages/typescript/common/js/rewriting');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

export class AngularServiceRewriter implements rewriter.ISyntaxRewriter {

	public get name() {
		return 'rewriter.angular';
	}

	public computeEdits(context: rewriter.AnalyzerContext): void {

		var offset = 0,
			sourceText = context.sourceFile.getFullText();

		while ((offset = sourceText.indexOf('$', offset)) !== -1) {

			var node = ts.getTokenAtPosition(context.sourceFile, offset);

			if (node) {
				offset += node.getFullWidth();

				if (node.kind === ts.SyntaxKind.Identifier
					&& node.parent && node.parent.kind === ts.SyntaxKind.Parameter) {

					var parent = (<ts.ParameterDeclaration> node.parent),
						name = parent.name.getText();

					if (name.length > 1) {
						var typeAnnotation = ` :angular.I${name[1].toUpperCase() }${name.substr(2)}Service`;
						context.newInsert(parent.name.end, typeAnnotation);
					}
				}
			}
		}
	}
}