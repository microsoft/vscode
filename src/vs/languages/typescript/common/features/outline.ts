/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Modes = require('vs/editor/common/modes');
import converter = require('vs/languages/typescript/common/features/converter');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

var outlineTypeTable: { [kind: string]: string } = Object.create(null);
outlineTypeTable[ts.ScriptElementKind.moduleElement] = 'module';
outlineTypeTable[ts.ScriptElementKind.classElement] = 'class';
outlineTypeTable[ts.ScriptElementKind.enumElement] = 'enum';
outlineTypeTable[ts.ScriptElementKind.interfaceElement] = 'interface';
outlineTypeTable[ts.ScriptElementKind.memberFunctionElement] = 'method';
outlineTypeTable[ts.ScriptElementKind.memberVariableElement] = 'property';
outlineTypeTable[ts.ScriptElementKind.memberGetAccessorElement] = 'property';
outlineTypeTable[ts.ScriptElementKind.memberSetAccessorElement] = 'property';
outlineTypeTable[ts.ScriptElementKind.variableElement] = 'variable';
outlineTypeTable[ts.ScriptElementKind.constElement] = 'variable';
outlineTypeTable[ts.ScriptElementKind.localVariableElement] = 'variable';
outlineTypeTable[ts.ScriptElementKind.variableElement] = 'variable';
outlineTypeTable[ts.ScriptElementKind.functionElement] = 'function';
outlineTypeTable[ts.ScriptElementKind.localFunctionElement] = 'function';


function _compare(a:Modes.IOutlineEntry, b:Modes.IOutlineEntry):number {
	if (a.range.startLineNumber < b.range.startLineNumber) {
		return -1;
	} else if (a.range.startLineNumber > b.range.startLineNumber) {
		return 1;
	} else if (a.range.startColumn < b.range.startColumn) {
		return -1;
	} else if (a.range.startColumn > b.range.startColumn) {
		return 1;
	} else {
		return 0;
	}
}

export function compute(languageService: ts.LanguageService, resource: URI): Modes.IOutlineEntry[] {

	var isJavaScript = /\.js$/.test(resource.fsPath);

	return isJavaScript
		? functionsAndGlobals(languageService, resource)
		: navigationBarItems(languageService, resource);
}

function navigationBarItems(languageService: ts.LanguageService, resource: URI): Modes.IOutlineEntry[] {

	var sourceFile = languageService.getSourceFile(resource.toString()),
		items = languageService.getNavigationBarItems(sourceFile.fileName),
		parent: Modes.IOutlineEntry = { type: '', label: '', range: undefined, children: [] };

	items
		.filter(item => item.text !== '<global>')
		.forEach(item => parent.children.push(_convert(sourceFile, item)));

	return parent.children.sort(_compare);
}

function _convert(file:ts.SourceFile, item: ts.NavigationBarItem): Modes.IOutlineEntry {

	var span = item.spans[0],
		range = converter.getRange(file, span);

	return <Modes.IOutlineEntry> {
		label: item.text,
		type: outlineTypeTable[item.kind] || 'variable',
		range,
		children: item.childItems.map(child => _convert(file, child)).sort(_compare)
	};
}

function functionsAndGlobals(languageService: ts.LanguageService, resource: URI): Modes.IOutlineEntry[] {

	var stack: ts.Node[] = [],
		sourceFile = languageService.getSourceFile(resource.toString()),
		result: Modes.IOutlineEntry[] = [];

	sourceFile.statements.forEach(statement => {

		if (statement.kind === ts.SyntaxKind.VariableStatement) {
			// global variables
			(<ts.VariableStatement> statement).declarationList.declarations.forEach(declaration => {
				result.push({
					label: declaration.name.getText(),
					type: 'variable',
					range: converter.getRange(sourceFile, declaration.getStart(), declaration.getEnd())
				});
			});
		}

		// walk all other elements and search for functions
		stack.push(statement);
	});

	while (stack.length) {

		var node = stack.pop(),
			label = '';

		if (node.kind === ts.SyntaxKind.FunctionDeclaration) {
			// function farboo() {}
			label = (<ts.FunctionDeclaration> node).name.text;
		} else if (node.kind === ts.SyntaxKind.FunctionExpression) {
			// var a = function() {}, map(function(){}), { a: function() {}}

			if ((<ts.FunctionExpression> node).name) {
				label = (<ts.FunctionExpression> node).name.text;

			} else if (node.parent.kind === ts.SyntaxKind.PropertyAssignment
				&& (<ts.PropertyAssignment> node.parent).name) {

				label = `${ts.getTextOfNode((<ts.PropertyAssignment> node.parent).name)}: function()`;
			}
		}

		if (label) {
			result.push({
				label,
				type: 'function',
				range: converter.getRange(sourceFile, node.getStart(), node.getEnd())
			});
		}

		stack.push.apply(stack, node.getChildren());
	}

	// add classes
	let items = languageService.getNavigationBarItems(sourceFile.fileName);
	for (let item of items) {
		if (item.kind === ts.ScriptElementKind.classElement) {
			let entry = _convert(sourceFile, item);
			result.push(entry);
		}
	}

	return result.sort(_compare);
}

