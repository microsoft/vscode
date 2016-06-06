/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import {QuickFix, QuickFixQueryInformation, Refactoring, CanProvideFixResponse} from '../quickFix';
import * as ast from '../astUtils';
import * as ts from 'typescript';
import {EOL} from 'os';

function getClassAndAbstractClassName(error: ts.Diagnostic) {
	var errorText: string = ts.flattenDiagnosticMessageText(error.messageText, EOL);

	var match = errorText.match(/Non-abstract class \'(\w+)\' does not implement inherited abstract member \'(\w+)\' from class \'(\w+)\'./);

	// safety
	if (!match || match.length !== 4) {
		return null;
	}

	var [, className, , abstractClassName] = match;
	return { className, abstractClassName };
}

export class ImplementAbstractClass implements QuickFix {
	key = 'ImplementAbstractClass';

	canProvideFix(info: QuickFixQueryInformation): CanProvideFixResponse {
		var relevantError = info.positionErrors.filter(x => x.code === 2515)[0];
		if (!relevantError) {
			return null;
		}
		if (info.positionNode.kind !== ts.SyntaxKind.Identifier) {
			return null;
		}

		var match = getClassAndAbstractClassName(relevantError);

		if (!match) {
			return null;
		}

		var {className, abstractClassName} = match;
		return { display: `Implement members of ${abstractClassName} in ${className}` };
	}

	provideFix(info: QuickFixQueryInformation): Refactoring[] {
		var relevantError = info.positionErrors.filter(x => x.code === 2515)[0];
		if (!relevantError) {
			return null;
		}
		if (info.positionNode.kind !== ts.SyntaxKind.Identifier) {
			return null;
		}

		var match = getClassAndAbstractClassName(relevantError);
		var {className, abstractClassName} = match;

		// Get all the members of the interface:
		let abstractClassTarget = <ts.InterfaceDeclaration>ast.getNodeByKindAndName(info.program.getSourceFiles(), ts.SyntaxKind.ClassDeclaration, abstractClassName);

		// The class that we are trying to add stuff to
		let classTarget = <ts.ClassDeclaration>ast.getNodeByKindAndName([info.sourceFile], ts.SyntaxKind.ClassDeclaration, className);

		// Then the last brace
		let firstBrace = classTarget.getChildren().filter(x => x.kind === ts.SyntaxKind.OpenBraceToken)[0];

		// And the correct indent
		//var indentLength = info.service.getIndentationAtPosition(
		// memberTarget.getSourceFile().fileName, firstBrace.end, info.project.projectFile.project.formatCodeOptions);
		//var indent = Array(indentLength + info.project.projectFile.project.formatCodeOptions.IndentSize + 1).join(' ');
		var indent = Array(info.document.lineAt(info.position.start).firstNonWhitespaceCharacterIndex - info.document.lineAt(info.position.start).range.start.character + 1).join(' ');

		let refactorings: Refactoring[] = [];

		//
		// The code for the error is actually from typeChecker.checkTypeRelatedTo so investigate that code more
		// also look at the code from the mixin PR on ms/typescript
		//
		var currentMemberNames = [];
		classTarget.members.forEach(function (member) {
			let name = member.name && (<any>member.name).text;
			if (name) {
				currentMemberNames.push(name);
			}
		});
		abstractClassTarget.members.forEach(function (member) {
			let name = member.name && (<any>member.name).text;
			if (name && currentMemberNames.indexOf(name) === -1) {
				var content = member.getFullText().replace('abstract', '');
				if (content.lastIndexOf(';') === content.length - 1) {
					content = content.substring(0, content.length - 1);
				}
				content += '{' + EOL + 'return null;' + EOL + '}';
				var refactoring = {
					span: {
						start: firstBrace.end,
						length: 0
					},
					newText: ('' + EOL + indent) + content,
					filePath: classTarget.getSourceFile().fileName
				};
				refactorings.push(refactoring);
			}
		});

		return refactorings;
	}
}