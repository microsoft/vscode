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


type TypeScriptTypeDeclaration = ts.InterfaceDeclaration | ts.EnumDeclaration | ts.ClassDeclaration;


function visitTopLevelDeclarations(sourceFile:ts.SourceFile, visitor:(node:TypeScriptTypeDeclaration)=>boolean): void {
	let stop = false;

	let visit = (node: ts.Node): void => {
		if (stop) {
			return;
		}

		switch (node.kind) {
			case ts.SyntaxKind.InterfaceDeclaration:
			case ts.SyntaxKind.EnumDeclaration:
			case ts.SyntaxKind.ClassDeclaration:
				stop = visitor(<TypeScriptTypeDeclaration>node);
				break;
		}

		if (stop) {
			return;
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
}


function getAllTopLevelDeclarations(sourceFile:ts.SourceFile): TypeScriptTypeDeclaration[] {
	let all:TypeScriptTypeDeclaration[] = [];
	visitTopLevelDeclarations(sourceFile, (node) => {
		all.push(node);
		return false /*continue*/;
	});
	return all;
}


function getTopLevelDeclaration(sourceFile:ts.SourceFile, typeName:string): TypeScriptTypeDeclaration {
	let result:TypeScriptTypeDeclaration = null;
	visitTopLevelDeclarations(sourceFile, (node) => {
		if (node.name.text === typeName) {
			result = node;
			return true /*stop*/;
		}
		return false /*continue*/;
	});
	return result;
}


function getNodeText(sourceFile:ts.SourceFile, node:ts.Node): string {
	return sourceFile.getFullText().substring(node.pos, node.end);
}


function getMassagedTopLevelDeclarationText(sourceFile:ts.SourceFile, declaration: TypeScriptTypeDeclaration): string {
	let result = getNodeText(sourceFile, declaration);
	result = result.replace(/export default/g, 'export');
	result = result.replace(/export declare/g, 'export');
	return result;
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

fs.writeFileSync(path.join(__dirname, './monaco-editor.d.ts'), result.join('\n'));
