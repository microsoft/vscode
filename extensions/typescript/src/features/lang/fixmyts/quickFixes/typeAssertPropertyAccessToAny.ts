/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import {QuickFix, QuickFixQueryInformation, Refactoring, CanProvideFixResponse} from "../quickFix";
import * as ts from "typescript";

export class TypeAssertPropertyAccessToAny implements QuickFix {
	key = 'TypeAssertPropertyAccessToAny';

	canProvideFix(info: QuickFixQueryInformation): CanProvideFixResponse {
		var relevantError = info.positionErrors.filter(x => x.code === 2339)[0];
		if (!relevantError) {
			return null;
		}
		if (info.positionNode.kind !== ts.SyntaxKind.Identifier) {
			return null;
		}

		var match = getIdentifierName(info.positionErrorMessages[0]);

		if (!match) {
			return null;
		}

		var {identifierName} = match;
		return { display: `Assert "any" for property access "${identifierName}"` };
	}

	provideFix(info: QuickFixQueryInformation): Refactoring[] {
		/**
		 * We want the largest property access expressing `a.b.c` starting at the identifer `c`
		 * Since this gets tokenized as `a.b` `.` `c` so its just the parent :)
		 */
		let parent = info.positionNode.parent;
		if (parent.kind === ts.SyntaxKind.PropertyAccessExpression) {
			let propertyAccess = <ts.PropertyAccessExpression>parent;
			let start = propertyAccess.getStart();
			let end = propertyAccess.dotToken.getStart();

			let oldText = propertyAccess.getText().substr(0, end - start);

			let refactoring: Refactoring = {
				filePath: info.filePath,
				span: {
					start: start,
					length: end - start,
				},
				newText: `(${oldText} as any)`
			};

			return [refactoring];
		}
		return [];
	}
}

function getIdentifierName(errorText: string) {
	// see https://github.com/Microsoft/TypeScript/blob/6637f49209ceb5ed719573998381eab010fa48c9/src/compiler/diagnosticMessages.json#L842
	var match = /Property \'(\w+)\' does not exist on type \.*/.exec(errorText);

	if (!match) {
		return null;
	}

	var [, identifierName] = match;
	return { identifierName };
}
