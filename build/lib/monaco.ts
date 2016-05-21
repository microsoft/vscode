/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// PREREQUISITE:
// SET VSCODE_BUILD_DECLARATION_FILES=1
// run gulp watch once


import fs = require('fs');
import ts = require('typescript');
import path = require('path');


const SRC = path.join(__dirname, '../../src');
const OUT = path.join(__dirname, '../../out');


function moduleIdToPath(moduleId:string): string {
	if (/\.d\.ts/.test(moduleId)) {
		return path.join(SRC, moduleId);
	}
	return path.join(OUT, moduleId) + '.d.ts';
}


var SOURCE_FILE_MAP: {[moduleId:string]:ts.SourceFile;} = {};
function getSourceFile(moduleId:string): ts.SourceFile {
	if (!SOURCE_FILE_MAP[moduleId]) {
		let filePath = moduleIdToPath(moduleId);
		let fileContents = fs.readFileSync(filePath).toString();
		let sourceFile = ts.createSourceFile(filePath, fileContents, ts.ScriptTarget.ES5);

		SOURCE_FILE_MAP[moduleId] = sourceFile;
	}
	return SOURCE_FILE_MAP[moduleId];
}


type TSTopLevelDeclaration = ts.InterfaceDeclaration | ts.EnumDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration | ts.FunctionDeclaration;
type TSTopLevelDeclare = TSTopLevelDeclaration | ts.VariableStatement;

function isDeclaration(a:TSTopLevelDeclare): a is TSTopLevelDeclaration {
	let tmp = <TSTopLevelDeclaration>a;
	return tmp.name && typeof tmp.name.text === 'string';
}

function visitTopLevelDeclarations(sourceFile:ts.SourceFile, visitor:(node:TSTopLevelDeclare)=>boolean): void {
	let stop = false;

	let visit = (node: ts.Node): void => {
		if (stop) {
			return;
		}

		switch (node.kind) {
			case ts.SyntaxKind.InterfaceDeclaration:
			case ts.SyntaxKind.EnumDeclaration:
			case ts.SyntaxKind.ClassDeclaration:
			case ts.SyntaxKind.VariableStatement:
			case ts.SyntaxKind.TypeAliasDeclaration:
			case ts.SyntaxKind.FunctionDeclaration:
				stop = visitor(<TSTopLevelDeclare>node);
				break;
		}

		if (node.kind !== ts.SyntaxKind.SourceFile) {
			if (getNodeText(sourceFile, node).indexOf('cursorStyleToString') >= 0) {
				console.log('FOUND TEXT IN NODE: ' + ts.SyntaxKind[node.kind]);
				console.log(getNodeText(sourceFile, node));
			}
		}

		if (stop) {
			return;
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
}


function getAllTopLevelDeclarations(sourceFile:ts.SourceFile): TSTopLevelDeclare[] {
	let all:TSTopLevelDeclare[] = [];
	visitTopLevelDeclarations(sourceFile, (node) => {
		all.push(node);
		return false /*continue*/;
	});
	return all;
}


function getTopLevelDeclaration(sourceFile:ts.SourceFile, typeName:string): TSTopLevelDeclare {
	let result:TSTopLevelDeclare = null;
	visitTopLevelDeclarations(sourceFile, (node) => {
		if (isDeclaration(node)) {
			if (node.name.text === typeName) {
				result = node;
				return true /*stop*/;
			}
			return false /*continue*/;
		}
		// node is ts.VariableStatement
		return (getNodeText(sourceFile, node).indexOf(typeName) >= 0);
	});
	return result;
}


function getNodeText(sourceFile:ts.SourceFile, node:ts.Node): string {
	return sourceFile.getFullText().substring(node.pos, node.end);
}


function getMassagedTopLevelDeclarationText(sourceFile:ts.SourceFile, declaration: TSTopLevelDeclare): string {
	let result = getNodeText(sourceFile, declaration);
	result = result.replace(/export default/g, 'export');
	result = result.replace(/export declare/g, 'export');
	return result;
}

function format(text:string): string {
	let options = getDefaultOptions();

	// Parse the source text
	let sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);

	// Get the formatting edits on the input sources
	let edits = (<any>ts).formatting.formatDocument(sourceFile, getRuleProvider(options), options);

	// Apply the edits on the input code
	return applyEdits(text, edits);

	function getRuleProvider(options: ts.FormatCodeOptions) {
		// Share this between multiple formatters using the same options.
		// This represents the bulk of the space the formatter uses.
		let ruleProvider = new (<any>ts).formatting.RulesProvider();
		ruleProvider.ensureUpToDate(options);
		return ruleProvider;
	}

	function applyEdits(text: string, edits: ts.TextChange[]): string {
		// Apply edits in reverse on the existing text
		let result = text;
		for (let i = edits.length - 1; i >= 0; i--) {
			let change = edits[i];
			let head = result.slice(0, change.span.start);
			let tail = result.slice(change.span.start + change.span.length)
			result = head + change.newText + tail;
		}
		return result;
	}

	function getDefaultOptions(): ts.FormatCodeOptions {
		return {
			IndentSize: 4,
			TabSize: 4,
			NewLineCharacter: '\r\n',
			ConvertTabsToSpaces: true,
			IndentStyle: ts.IndentStyle.Block,

			InsertSpaceAfterCommaDelimiter: true,
			InsertSpaceAfterSemicolonInForStatements: true,
			InsertSpaceBeforeAndAfterBinaryOperators: true,
			InsertSpaceAfterKeywordsInControlFlowStatements: true,
			InsertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
			InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
			InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
			InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: true,
			PlaceOpenBraceOnNewLineForFunctions: false,
			PlaceOpenBraceOnNewLineForControlBlocks: false,
		};
	}
}

var recipe = fs.readFileSync(path.join(__dirname, './monaco-editor.d.ts.recipe')).toString();
var lines = recipe.split(/\r\n|\n|\r/);
var result = [];

lines.forEach(line => {

	let m1 = line.match(/^\s*#include\(([^\)]*)\)\:(.*)$/);
	if (m1) {
		let moduleId = m1[1];
		let sourceFile = getSourceFile(moduleId);

		let typeNames = m1[2].split(/,/);
		typeNames.forEach((typeName) => {
			typeName = typeName.trim();
			if (typeName.length === 0) {
				return;
			}
			let declaration = getTopLevelDeclaration(sourceFile, typeName);
			result.push(getMassagedTopLevelDeclarationText(sourceFile, declaration));
		});
		return;
	}

	let m2 = line.match(/^\s*#includeAll\(([^\)]*)\)\:(.*)$/);
	if (m2) {
		let moduleId = m2[1];
		let sourceFile = getSourceFile(moduleId);

		let typeNames = m2[2].split(/,/);
		let typesToExclude: {[typeName:string]:boolean;} = {};
		typeNames.forEach((typeName) => {
			typeName = typeName.trim();
			if (typeName.length === 0) {
				return;
			}
			typesToExclude[typeName] = true;
		});

		getAllTopLevelDeclarations(sourceFile).forEach((declaration) => {
			result.push(getMassagedTopLevelDeclarationText(sourceFile, declaration));
		});
		return;
	}

	result.push(line);
});

let resultTxt = result.join('\n');
resultTxt = resultTxt.replace(/\beditorCommon\./g, '');
resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');

resultTxt = format(resultTxt);

resultTxt = resultTxt.replace(/\r\n/g, '\n');

fs.writeFileSync(path.join(__dirname, './monaco-editor.d.ts'), resultTxt);
