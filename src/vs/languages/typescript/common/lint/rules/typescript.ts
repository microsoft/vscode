/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import rules = require('vs/languages/typescript/common/lint/rules');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

/**
 * Use of functions without return type
 */
export class FunctionsWithoutReturnType implements rules.IStyleRule<ts.FunctionDeclaration> {

	public code = 'SA9002';

	public name = 'FunctionsWithoutReturnType';

	public filter = [
		ts.SyntaxKind.FunctionDeclaration,
		ts.SyntaxKind.MethodDeclaration,
		ts.SyntaxKind.ArrowFunction
	];

	public checkNode(node:ts.FunctionDeclaration, context:rules.IRuleContext): void {
		if(node.type) {
			return;
		}

		context.reportError(node.name, this.name, this.code);
	}
}

/**
 * A single line comment that could be a mistyped ///-reference.
 */
export class TripleSlashReferenceAlike implements rules.IStyleRule<ts.SourceFile> {

	private static _TripleSlashReference = /^(\/\/\/\s*<reference\s+path=)('|")(.+?)\2\s*(static=('|")(.+?)\2\s*)*/im;

	public code = 'SA9056';

	public name = 'TripleSlashReferenceAlike';

	public filter = [ts.SyntaxKind.SourceFile];

	public checkNode(node:ts.SourceFile, context:rules.IRuleContext): void {
		var triviaWidth = node.getLeadingTriviaWidth();
		var triviaText = node.getFullText().substr(0, triviaWidth);

		if(this._couldMeanTripleSlash(triviaText)) {
			context.reportError(node, this.name, this.code, 0, triviaWidth);
		}
	}

	private _couldMeanTripleSlash(text:string):boolean {
		if(TripleSlashReferenceAlike._TripleSlashReference.test(text)) {
			// a proper reference
			return false;
		}

		var segments = text.split(/[\s=]/);
		if(segments.length > 5) {
			// smells like something else
			return;
		}

		var reference = 0,
			path = 0,
			literal = 0;

		for(var i = 0, len = segments.length; i < len; i++) {
			reference = Math.max(reference, strings.difference('reference', segments[i]));
			path = Math.max(path, strings.difference('path', segments[i]));
			literal = Math.max(literal, (strings.startsWith(segments[i], '"') || strings.startsWith(segments[i], '\'') ? 1 : 0) +
				(strings.endsWith(segments[i], '"') || strings.endsWith(segments[i], '\'') ? 1 : 0));
		}

		if((literal > 0 || path > 5) && reference > 5) {
			return true;
		}

		return false;
	}
}

/**
 * Checks for import statements that are not used.
 */
export class UnusedImports implements rules.IStyleRule2<ts.ImportEqualsDeclaration> {

	public code = 'SA9057';

	public name = 'UnusedImports';

	public filter = [ts.SyntaxKind.ImportEqualsDeclaration];

	public checkNode(node: ts.ImportEqualsDeclaration, context: rules.IRuleContext2): void {

		var position = ts.getTokenPosOfNode(node.name),
			entries = context.languageService().getOccurrencesAtPosition(context.filename(), position);

		if (entries && entries.length === 1) {
			context.reportError(node, this.name, this.code, ts.getTokenPosOfNode(node));
		}
	}
}

/**
 * Checks for variables that are not being used nor exported.
 */
export class UnusedVariables implements rules.IStyleRule2<ts.VariableStatement> {

	public code = 'SA9058';

	public name = 'UnusedVariables';

	public filter = [ts.SyntaxKind.VariableStatement];

	public checkNode(node: ts.VariableStatement, context: rules.IRuleContext2): void {

		if (node.flags & ts.NodeFlags.Export) {
			// exported variable
			return;
		}

		if (node.parent.kind === ts.SyntaxKind.SourceFile) {
			// global variable
			return;
		}

		var parent = node.parent,
			body: ts.Node,
			bodyText: string;

		while (parent && !body) {
			switch (parent.kind) {
				case ts.SyntaxKind.Constructor:
				case ts.SyntaxKind.MethodDeclaration:
				case ts.SyntaxKind.FunctionDeclaration:
				case ts.SyntaxKind.FunctionExpression:
				case ts.SyntaxKind.GetAccessor:
				case ts.SyntaxKind.SetAccessor:
					body = (<ts.FunctionLikeDeclaration> parent).body;
					break;
			}
			parent = parent.parent;
		}

		var isUsed: (declaration: ts.Identifier) => boolean;

		if (body) {
			// strategy 1: string.indexOf
			var bodyText = body.getFullText(),
				offset = body.getFullStart();

			isUsed = (name: ts.Identifier) => {
				var c = 0, idx = 0;
				while (c < 2) {
					idx = bodyText.indexOf(name.getText(), idx);
					if (idx === -1) {
						break;
					}
					idx += name.getText().length;
					var items = context.languageService().getDefinitionAtPosition(context.filename(), offset + idx);
					if (items && items.length > 0 && items[0].textSpan.start <= name.getStart()
						&& name.getStart() <= items[0].textSpan.start + items[0].textSpan.length) {

						c += 1;
					}
				}
				return c > 1;
			};

		} else {
			// strategy 2: languageService#findOccurrences
			isUsed = (name: ts.Identifier) => {
				var position = ts.getTokenPosOfNode(name),
					entries: ts.ReferenceEntry[];

				entries = context.languageService().getOccurrencesAtPosition(context.filename(), position);
				return entries && entries.length > 1;
			};
		}

		node.declarationList.declarations.forEach(declaration => {

			if(!declaration.name) {
				return;
			}

			if (declaration.name.kind === ts.SyntaxKind.Identifier) {
				if (!isUsed(<ts.Identifier> declaration.name)) {
					context.reportError(declaration.name, this.name, this.code);
				}
			} else {
				let patterns = [<ts.BindingPattern> declaration.name];
				while(patterns.length) {
					let pattern = patterns.pop();
					for (let element of pattern.elements) {
						if (element.name.kind === ts.SyntaxKind.Identifier) {
							if (!isUsed(<ts.Identifier> element.name)) {
								context.reportError(element.name, this.name, this.code);
							}
						} else {
							patterns.push(<ts.BindingPattern> element.name);
						}
					}
				}
			}

		});
	}
}

/**
 * Checks for local functions that aren't used
 */
export class UnusedFunctions implements rules.IStyleRule2<ts.FunctionDeclaration> {

	public code = 'SA9059';

	public name = 'UnusedFunctions';

	public filter = [ts.SyntaxKind.FunctionDeclaration];

	public checkNode(node:ts.FunctionDeclaration, context:rules.IRuleContext2): void {
		if((node.flags & ts.NodeFlags.Export) || (node.flags & ts.NodeFlags.DeclarationFile)) {
			return;
		}

		var position = ts.getTokenPosOfNode(node.name),
			entries = context.languageService().getOccurrencesAtPosition(context.filename(), position);

		if(entries && entries.length <= 1) {
			context.reportError(node.name, this.name, this.code, position);
		}
	}
}

/**
 * Checks for private members that are not accessed.
 */
export class UnusedMembers implements rules.IStyleRule2<ts.PropertyDeclaration> {

	public code = 'SA9060';

	public name = 'UnusedMembers';

	public filter = [ts.SyntaxKind.PropertyDeclaration, ts.SyntaxKind.MethodDeclaration];

	public checkNode(node:ts.PropertyDeclaration, context:rules.IRuleContext2): void {
		if(!(node.flags & ts.NodeFlags.Private)) {
			return;
		}
		if(!node.name) {
			return;
		}

		var position = ts.getTokenPosOfNode(node.name),
			entries = context.languageService().getOccurrencesAtPosition(context.filename(), position);

		if(entries && entries.length <= 1) {
			context.reportError(node.name, this.name, this.code, position);
		}
	}
}

///**
// * Checks if a variable is being used before its declared.
// */
//export class UsedBeforeDeclared implements rules.IStyleRule2<typescriptServices.VariableDeclaratorSyntax> {
//
//	public code = 'SA9061';
//
//	public name = 'UsedBeforeDeclared';
//
//	public filter = [typescriptServices.SyntaxKind.VariableDeclarator];
//
//    public checkNode(token:typescriptServices.VariableDeclaratorSyntax, context:rules.IRuleContext2): void {
//
//		var start = context.start(token.identifier),
//			position = context.end(token.identifier) - 1,
//			entries = context.languageService().getOccurrencesAtPosition(context.filename(), position);
//
//		for(var i = 0, len = entries.length; i < len; i++) {
//			if(entries[i].minChar < start) {
//				context.reportError(token.identifier, this.name, this.code);
//				break;
//			}
//		}
//	}
//}