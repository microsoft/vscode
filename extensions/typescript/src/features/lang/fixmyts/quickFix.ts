/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import {TextDocument, Range} from 'vscode';
import * as ts from 'typescript';
/**
 * Interfaces for quick fixes
 */

export interface Refactoring extends ts.TextChange {
	filePath: string;

	/** If you want to insert a snippet. Be careful that you shouldn't return more than one refatoring if you want to use this */
	isNewTextSnippet?: boolean;
}


/** Note this interface has a few redundant stuff. This is intentional to precompute once */
export interface QuickFixQueryInformation {

	program: ts.Program;
	typeChecker: ts.TypeChecker;
	sourceFile: ts.SourceFile;
	sourceFileText: string;
	positionErrors: ts.Diagnostic[];
	positionErrorMessages: string[];
	position: Range;
	positionNode: ts.Node;
	document: TextDocument;
	filePath: string;

	/**
	 * Either the previous or the current.
	 * This needs more thinking e.g. 'rename' already does the right thing. See how it is implemented
	 */
	oneOfPositionNodesOfType?(kind: ts.SyntaxKind): boolean;
}

export interface CanProvideFixResponse {
	/**
	 * Return '' if you can't provide a fix
	 * return 'Some string to display' if you can provide a string
	 */
	display: string;
	isNewTextSnippet?: boolean;
}

export interface QuickFix {
	/** Some unique key. Classname works best ;) */
	key: string;

	canProvideFix(info: QuickFixQueryInformation): CanProvideFixResponse;

	provideFix(info: QuickFixQueryInformation): Refactoring[];
}


/** You don't need to create this manually. Just use the util function */
export interface RefactoringsByFilePath {
	[filePath: string]: Refactoring[];
}

/** Utility method. Reason is we want to transact by file path */
export function getRefactoringsByFilePath(refactorings: Refactoring[]): RefactoringsByFilePath {
	var loc: RefactoringsByFilePath = {};
	for (let refac of refactorings) {
		if (!loc[refac.filePath]){
			loc[refac.filePath] = [];
		}
		loc[refac.filePath].push(refac);
	}

	// sort each of these in descending by start location
	for (let filePath in loc) {
		let refactorings = loc[filePath];
		refactorings.sort((a: Refactoring, b: Refactoring) => {
			return (b.span.start - a.span.start);
		});
	}

	return loc;
}
