/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import * as ts from 'typescript';

export var forEachChild = ts.forEachChild;

export function forEachChildRecursive<T>(node: ts.Node, cbNode: (node: ts.Node, depth: number) => T, depth = 0): T {
	var res = cbNode(node, depth);
	forEachChildRecursive(node, cbNode, depth + 1);
	return res;
}

/** Number to string */
export function syntaxKindToString(syntaxKind: ts.SyntaxKind): string {
	return (<any>ts).SyntaxKind[syntaxKind];
}

export function getNodeByKindAndName(sourcefiles: ts.SourceFile[], kind: ts.SyntaxKind, name: string): ts.Node {
	let found: ts.Node = undefined;

	function findNode(node: ts.Node) {
		if (node.kind === kind) {
			// Now lookup name:
			if (node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.InterfaceDeclaration) {
				let nodeName = (<any>node).name && ((<any>node).name).text;
				if (nodeName === name) {
					found = node;
				}
			}
		}

		if (!found) { forEachChild(node, findNode); }
	}

	for (let file of sourcefiles) {
		forEachChild(file, findNode);
	}

	return found;
}


export function getSourceFileImports(srcFile: ts.SourceFile): string[] {
	var modules: string[] = [];
	getImports(srcFile, modules);
	return modules;
}


// https://github.com/Microsoft/TypeScript/issues/2621#issuecomment-90986004
function getImports(searchNode: ts.Node, importedModules: string[]) {
	ts.forEachChild(searchNode, node => {
		// Vist top-level import nodes
		if (node.kind === ts.SyntaxKind.ImportDeclaration || node.kind === ts.SyntaxKind.ImportEqualsDeclaration || node.kind === ts.SyntaxKind.ExportDeclaration) {
			let moduleNameExpr = getExternalModuleName(node);
			// if they have a name, that is a string, i.e. not alias defition `import x = y`
			if (moduleNameExpr && moduleNameExpr.kind === ts.SyntaxKind.StringLiteral) {
				importedModules.push((<ts.LiteralExpression>moduleNameExpr).text);
			}
		}
		else if (node.kind === ts.SyntaxKind.ModuleDeclaration && (<ts.ModuleDeclaration>node).name.kind === ts.SyntaxKind.StringLiteral) {
			// Ambient module declaration
			getImports((<ts.ModuleDeclaration>node).body, importedModules);
		}
	});
}
function getExternalModuleName(node: ts.Node): ts.Expression {
	if (node.kind === ts.SyntaxKind.ImportDeclaration) {
		return (<ts.ImportDeclaration>node).moduleSpecifier;
	}
	if (node.kind === ts.SyntaxKind.ImportEqualsDeclaration) {
		let reference = (<ts.ImportEqualsDeclaration>node).moduleReference;
		if (reference.kind === ts.SyntaxKind.ExternalModuleReference) {
			return (<ts.ExternalModuleReference>reference).expression;
		}
	}
	if (node.kind === ts.SyntaxKind.ExportDeclaration) {
		return (<ts.ExportDeclaration>node).moduleSpecifier;
	}
}