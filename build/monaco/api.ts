/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs = require('fs');
import ts = require('typescript');
import path = require('path');

var util = require('gulp-util');
function log(message: any, ...rest: any[]): void {
	util.log(util.colors.cyan('[monaco.d.ts]'), message, ...rest);
}

const SRC = path.join(__dirname, '../../src');
const OUT_ROOT = path.join(__dirname, '../../');
const RECIPE_PATH = path.join(__dirname, './monaco.d.ts.recipe');
const DECLARATION_PATH = path.join(__dirname, '../../src/vs/monaco.d.ts');

var CURRENT_PROCESSING_RULE = '';
function logErr(message: any, ...rest: any[]): void {
	util.log(util.colors.red('[monaco.d.ts]'), 'WHILE HANDLING RULE: ', CURRENT_PROCESSING_RULE);
	util.log(util.colors.red('[monaco.d.ts]'), message, ...rest);
}

function moduleIdToPath(out:string, moduleId:string): string {
	if (/\.d\.ts/.test(moduleId)) {
		return path.join(SRC, moduleId);
	}
	return path.join(OUT_ROOT, out, moduleId) + '.d.ts';
}

let SOURCE_FILE_MAP: {[moduleId:string]:ts.SourceFile;} = {};
function getSourceFile(out:string, moduleId:string): ts.SourceFile {
	if (!SOURCE_FILE_MAP[moduleId]) {
		let filePath = moduleIdToPath(out, moduleId);

		let fileContents: string;
		try {
			fileContents = fs.readFileSync(filePath).toString();
		} catch (err) {
			logErr('CANNOT FIND FILE ' + filePath);
			return null;
		}

		let sourceFile = ts.createSourceFile(filePath, fileContents, ts.ScriptTarget.ES5);

		SOURCE_FILE_MAP[moduleId] = sourceFile;
	}
	return SOURCE_FILE_MAP[moduleId];
}


type TSTopLevelDeclaration = ts.InterfaceDeclaration | ts.EnumDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration | ts.FunctionDeclaration | ts.ModuleDeclaration;
type TSTopLevelDeclare = TSTopLevelDeclaration | ts.VariableStatement;

function isDeclaration(a:TSTopLevelDeclare): a is TSTopLevelDeclaration {
	return (
		a.kind === ts.SyntaxKind.InterfaceDeclaration
		|| a.kind === ts.SyntaxKind.EnumDeclaration
		|| a.kind === ts.SyntaxKind.ClassDeclaration
		|| a.kind === ts.SyntaxKind.TypeAliasDeclaration
		|| a.kind === ts.SyntaxKind.FunctionDeclaration
		|| a.kind === ts.SyntaxKind.ModuleDeclaration
	);
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
			case ts.SyntaxKind.ModuleDeclaration:
				stop = visitor(<TSTopLevelDeclare>node);
		}

		// if (node.kind !== ts.SyntaxKind.SourceFile) {
		// 	if (getNodeText(sourceFile, node).indexOf('SymbolKind') >= 0) {
		// 		console.log('FOUND TEXT IN NODE: ' + ts.SyntaxKind[node.kind]);
		// 		console.log(getNodeText(sourceFile, node));
		// 	}
		// }

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
		if (node.kind === ts.SyntaxKind.InterfaceDeclaration || node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.ModuleDeclaration) {
			let interfaceDeclaration = <ts.InterfaceDeclaration>node;
			let triviaStart = interfaceDeclaration.pos;
			let triviaEnd = interfaceDeclaration.name.pos;
			let triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });

			// // let nodeText = getNodeText(sourceFile, node);
			// if (getNodeText(sourceFile, node).indexOf('SymbolKind') >= 0) {
			// 	console.log('TRIVIA: ', triviaText);
			// }
			if (triviaText.indexOf('@internal') === -1) {
				all.push(node);
			}
		} else {
			let nodeText = getNodeText(sourceFile, node);
			if (nodeText.indexOf('@internal') === -1) {
				all.push(node);
			}
		}
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
		if (getNodeText(sourceFile, node).indexOf(typeName) >= 0) {
			result = node;
			return true /*stop*/;
		}
		return false /*continue*/;
	});
	return result;
}


function getNodeText(sourceFile:ts.SourceFile, node:{pos:number; end:number;}): string {
	return sourceFile.getFullText().substring(node.pos, node.end);
}


function getMassagedTopLevelDeclarationText(sourceFile:ts.SourceFile, declaration: TSTopLevelDeclare): string {
	let result = getNodeText(sourceFile, declaration);
	// if (result.indexOf('MonacoWorker') >= 0) {
	// 	console.log('here!');
	// 	// console.log(ts.SyntaxKind[declaration.kind]);
	// }
	if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
		let interfaceDeclaration = <ts.InterfaceDeclaration | ts.ClassDeclaration>declaration;

		let members:ts.NodeArray<ts.Node> = interfaceDeclaration.members;
		members.forEach((member) => {
			try {
				let memberText = getNodeText(sourceFile, member);
				if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
					// console.log('BEFORE: ', result);
					result = result.replace(memberText, '');
					// console.log('AFTER: ', result);
				}
			} catch (err) {
				// life..
			}
		});
	}
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

	function getRuleProvider(options: ts.FormatCodeSettings) {
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
			let tail = result.slice(change.span.start + change.span.length);
			result = head + change.newText + tail;
		}
		return result;
	}

	function getDefaultOptions(): ts.FormatCodeSettings {
		return {
			indentSize: 4,
			tabSize: 4,
			newLineCharacter: '\r\n',
			convertTabsToSpaces: true,
			indentStyle: ts.IndentStyle.Block,

			insertSpaceAfterCommaDelimiter: true,
			insertSpaceAfterSemicolonInForStatements: true,
			insertSpaceBeforeAndAfterBinaryOperators: true,
			insertSpaceAfterKeywordsInControlFlowStatements: true,
			insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: true,
			placeOpenBraceOnNewLineForFunctions: false,
			placeOpenBraceOnNewLineForControlBlocks: false,
		};
	}
}

function createReplacer(data:string): (str:string)=>string {
	data = data || '';
	let rawDirectives = data.split(';');
	let directives: [RegExp,string][] = [];
	rawDirectives.forEach((rawDirective) => {
		if (rawDirective.length === 0) {
			return;
		}
		let pieces = rawDirective.split('=>');
		let findStr = pieces[0];
		let replaceStr = pieces[1];

		findStr = findStr.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
		findStr = '\\b' + findStr + '\\b';
		directives.push([new RegExp(findStr, 'g'), replaceStr]);
	});

	return (str:string)=> {
		for (let i = 0; i < directives.length; i++) {
			str = str.replace(directives[i][0], directives[i][1]);
		}
		return str;
	};
}

function generateDeclarationFile(out:string, recipe:string): string {
	let lines = recipe.split(/\r\n|\n|\r/);
	let result = [];


	lines.forEach(line => {

		let m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m1) {
			CURRENT_PROCESSING_RULE = line;
			let moduleId = m1[1];
			let sourceFile = getSourceFile(out, moduleId);
			if (!sourceFile) {
				return;
			}

			let replacer = createReplacer(m1[2]);

			let typeNames = m1[3].split(/,/);
			typeNames.forEach((typeName) => {
				typeName = typeName.trim();
				if (typeName.length === 0) {
					return;
				}
				let declaration = getTopLevelDeclaration(sourceFile, typeName);
				if (!declaration) {
					logErr('Cannot find type ' + typeName);
					return;
				}
				result.push(replacer(getMassagedTopLevelDeclarationText(sourceFile, declaration)));
			});
			return;
		}

		let m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m2) {
			CURRENT_PROCESSING_RULE = line;
			let moduleId = m2[1];
			let sourceFile = getSourceFile(out, moduleId);
			if (!sourceFile) {
				return;
			}

			let replacer = createReplacer(m2[2]);

			let typeNames = m2[3].split(/,/);
			let typesToExcludeMap: {[typeName:string]:boolean;} = {};
			let typesToExcludeArr: string[] = [];
			typeNames.forEach((typeName) => {
				typeName = typeName.trim();
				if (typeName.length === 0) {
					return;
				}
				typesToExcludeMap[typeName] = true;
				typesToExcludeArr.push(typeName);
			});

			getAllTopLevelDeclarations(sourceFile).forEach((declaration) => {
				if (isDeclaration(declaration)) {
					if (typesToExcludeMap[declaration.name.text]) {
						return;
					}
				} else {
					// node is ts.VariableStatement
					let nodeText = getNodeText(sourceFile, declaration);
					for (let i = 0; i < typesToExcludeArr.length; i++) {
						if (nodeText.indexOf(typesToExcludeArr[i]) >= 0) {
							return;
						}
					}
				}
				result.push(replacer(getMassagedTopLevelDeclarationText(sourceFile, declaration)));
			});
			return;
		}

		result.push(line);
	});

	let resultTxt = result.join('\n');
	resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
	resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
	resultTxt = resultTxt.replace(/\bTPromise</g, 'Promise<');

	resultTxt = format(resultTxt);

	resultTxt = resultTxt.replace(/\r\n/g, '\n');
	return resultTxt;
}

export function getFilesToWatch(out:string): string[] {
	let recipe = fs.readFileSync(RECIPE_PATH).toString();
	let lines = recipe.split(/\r\n|\n|\r/);
	let result = [];

	lines.forEach(line => {

		let m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m1) {
			let moduleId = m1[1];
			result.push(moduleIdToPath(out, moduleId));
			return;
		}

		let m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m2) {
			let moduleId = m2[1];
			result.push(moduleIdToPath(out, moduleId));
			return;
		}
	});

	return result;
}

export interface IMonacoDeclarationResult {
	content: string;
	filePath: string;
	isTheSame: boolean;
}

export function run(out:string): IMonacoDeclarationResult {
	log('Starting monaco.d.ts generation');
	SOURCE_FILE_MAP = {};

	let recipe = fs.readFileSync(RECIPE_PATH).toString();
	let result = generateDeclarationFile(out, recipe);

	let currentContent = fs.readFileSync(DECLARATION_PATH).toString();
	log('Finished monaco.d.ts generation');

	return {
		content: result,
		filePath: DECLARATION_PATH,
		isTheSame: currentContent === result
	};
}

export function complainErrors() {
	logErr('Not running monaco.d.ts generation due to compile errors');
}