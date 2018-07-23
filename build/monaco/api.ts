/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs = require('fs');
import ts = require('typescript');
import path = require('path');
const tsfmt = require('../../tsfmt.json');

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

function moduleIdToPath(out: string, moduleId: string): string {
	if (/\.d\.ts/.test(moduleId)) {
		return path.join(SRC, moduleId);
	}
	return path.join(OUT_ROOT, out, moduleId) + '.d.ts';
}

let SOURCE_FILE_MAP: { [moduleId: string]: ts.SourceFile; } = {};
function getSourceFile(out: string, inputFiles: { [file: string]: string; }, moduleId: string): ts.SourceFile {
	if (!SOURCE_FILE_MAP[moduleId]) {
		let filePath = path.normalize(moduleIdToPath(out, moduleId));

		if (!inputFiles.hasOwnProperty(filePath)) {
			logErr('CANNOT FIND FILE ' + filePath + '. YOU MIGHT NEED TO RESTART gulp');
			return null;
		}

		let fileContents = inputFiles[filePath];
		let sourceFile = ts.createSourceFile(filePath, fileContents, ts.ScriptTarget.ES5);

		SOURCE_FILE_MAP[moduleId] = sourceFile;
	}
	return SOURCE_FILE_MAP[moduleId];
}


type TSTopLevelDeclaration = ts.InterfaceDeclaration | ts.EnumDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration | ts.FunctionDeclaration | ts.ModuleDeclaration;
type TSTopLevelDeclare = TSTopLevelDeclaration | ts.VariableStatement;

function isDeclaration(a: TSTopLevelDeclare): a is TSTopLevelDeclaration {
	return (
		a.kind === ts.SyntaxKind.InterfaceDeclaration
		|| a.kind === ts.SyntaxKind.EnumDeclaration
		|| a.kind === ts.SyntaxKind.ClassDeclaration
		|| a.kind === ts.SyntaxKind.TypeAliasDeclaration
		|| a.kind === ts.SyntaxKind.FunctionDeclaration
		|| a.kind === ts.SyntaxKind.ModuleDeclaration
	);
}

function visitTopLevelDeclarations(sourceFile: ts.SourceFile, visitor: (node: TSTopLevelDeclare) => boolean): void {
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


function getAllTopLevelDeclarations(sourceFile: ts.SourceFile): TSTopLevelDeclare[] {
	let all: TSTopLevelDeclare[] = [];
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


function getTopLevelDeclaration(sourceFile: ts.SourceFile, typeName: string): TSTopLevelDeclare {
	let result: TSTopLevelDeclare = null;
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


function getNodeText(sourceFile: ts.SourceFile, node: { pos: number; end: number; }): string {
	return sourceFile.getFullText().substring(node.pos, node.end);
}

function hasModifier(modifiers: ts.NodeArray<ts.Modifier>, kind: ts.SyntaxKind): boolean {
	if (modifiers) {
		for (let i = 0; i < modifiers.length; i++) {
			let mod = modifiers[i];
			if (mod.kind === kind) {
				return true;
			}
		}
	}
	return false;
}

function isStatic(member: ts.ClassElement | ts.TypeElement): boolean {
	return hasModifier(member.modifiers, ts.SyntaxKind.StaticKeyword);
}

function isDefaultExport(declaration: ts.InterfaceDeclaration | ts.ClassDeclaration): boolean {
	return (
		hasModifier(declaration.modifiers, ts.SyntaxKind.DefaultKeyword)
		&& hasModifier(declaration.modifiers, ts.SyntaxKind.ExportKeyword)
	);
}

function getMassagedTopLevelDeclarationText(sourceFile: ts.SourceFile, declaration: TSTopLevelDeclare, importName: string, usage: string[]): string {
	let result = getNodeText(sourceFile, declaration);
	// if (result.indexOf('MonacoWorker') >= 0) {
	// 	console.log('here!');
	// 	// console.log(ts.SyntaxKind[declaration.kind]);
	// }
	if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
		let interfaceDeclaration = <ts.InterfaceDeclaration | ts.ClassDeclaration>declaration;

		const staticTypeName = (
			isDefaultExport(interfaceDeclaration)
				? `${importName}.default`
				: `${importName}.${declaration.name.text}`
		);

		let instanceTypeName = staticTypeName;
		const typeParametersCnt = (interfaceDeclaration.typeParameters ? interfaceDeclaration.typeParameters.length : 0);
		if (typeParametersCnt > 0) {
			let arr: string[] = [];
			for (let i = 0; i < typeParametersCnt; i++) {
				arr.push('any');
			}
			instanceTypeName = `${instanceTypeName}<${arr.join(',')}>`;
		}

		const members: ts.NodeArray<ts.ClassElement | ts.TypeElement> = interfaceDeclaration.members;
		members.forEach((member) => {
			try {
				let memberText = getNodeText(sourceFile, member);
				if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
					// console.log('BEFORE: ', result);
					result = result.replace(memberText, '');
					// console.log('AFTER: ', result);
				} else {
					const memberName = (<ts.Identifier | ts.StringLiteral>member.name).text;
					if (isStatic(member)) {
						usage.push(`a = ${staticTypeName}.${memberName};`);
					} else {
						usage.push(`a = (<${instanceTypeName}>b).${memberName};`);
					}
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

function format(text: string): string {

	// Parse the source text
	let sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);

	// Get the formatting edits on the input sources
	let edits = (<any>ts).formatting.formatDocument(sourceFile, getRuleProvider(tsfmt), tsfmt);

	// Apply the edits on the input code
	return applyEdits(text, edits);

	function getRuleProvider(options: ts.FormatCodeSettings) {
		// Share this between multiple formatters using the same options.
		// This represents the bulk of the space the formatter uses.
		return (ts as any).formatting.getFormatContext(options);
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
}

function createReplacer(data: string): (str: string) => string {
	data = data || '';
	let rawDirectives = data.split(';');
	let directives: [RegExp, string][] = [];
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

	return (str: string) => {
		for (let i = 0; i < directives.length; i++) {
			str = str.replace(directives[i][0], directives[i][1]);
		}
		return str;
	};
}

function generateDeclarationFile(out: string, inputFiles: { [file: string]: string; }, recipe: string): [string, string] {
	const endl = /\r\n/.test(recipe) ? '\r\n' : '\n';

	let lines = recipe.split(endl);
	let result: string[] = [];

	let usageCounter = 0;
	let usageImports: string[] = [];
	let usage: string[] = [];

	usage.push(`var a;`);
	usage.push(`var b;`);

	const generateUsageImport = (moduleId: string) => {
		let importName = 'm' + (++usageCounter);
		usageImports.push(`import * as ${importName} from '${moduleId.replace(/\.d\.ts$/, '')}';`);
		return importName;
	};

	lines.forEach(line => {

		let m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m1) {
			CURRENT_PROCESSING_RULE = line;
			let moduleId = m1[1];
			let sourceFile = getSourceFile(out, inputFiles, moduleId);
			if (!sourceFile) {
				return;
			}

			const importName = generateUsageImport(moduleId);

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
				result.push(replacer(getMassagedTopLevelDeclarationText(sourceFile, declaration, importName, usage)));
			});
			return;
		}

		let m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m2) {
			CURRENT_PROCESSING_RULE = line;
			let moduleId = m2[1];
			let sourceFile = getSourceFile(out, inputFiles, moduleId);
			if (!sourceFile) {
				return;
			}

			const importName = generateUsageImport(moduleId);

			let replacer = createReplacer(m2[2]);

			let typeNames = m2[3].split(/,/);
			let typesToExcludeMap: { [typeName: string]: boolean; } = {};
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
				result.push(replacer(getMassagedTopLevelDeclarationText(sourceFile, declaration, importName, usage)));
			});
			return;
		}

		result.push(line);
	});

	let resultTxt = result.join(endl);
	resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
	resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
	resultTxt = resultTxt.replace(/\bTPromise</g, 'Promise<');

	resultTxt = format(resultTxt);

	return [
		resultTxt,
		`${usageImports.join('\n')}\n\n${usage.join('\n')}`
	];
}

function getIncludesInRecipe(): string[] {
	let recipe = fs.readFileSync(RECIPE_PATH).toString();
	let lines = recipe.split(/\r\n|\n|\r/);
	let result = [];

	lines.forEach(line => {

		let m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m1) {
			let moduleId = m1[1];
			result.push(moduleId);
			return;
		}

		let m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m2) {
			let moduleId = m2[1];
			result.push(moduleId);
			return;
		}
	});

	return result;
}

export function getFilesToWatch(out: string): string[] {
	return getIncludesInRecipe().map((moduleId) => moduleIdToPath(out, moduleId));
}

export interface IMonacoDeclarationResult {
	content: string;
	usageContent: string;
	filePath: string;
	isTheSame: boolean;
}

export function run(out: string, inputFiles: { [file: string]: string; }): IMonacoDeclarationResult {
	log('Starting monaco.d.ts generation');
	SOURCE_FILE_MAP = {};

	let recipe = fs.readFileSync(RECIPE_PATH).toString();
	let [result, usageContent] = generateDeclarationFile(out, inputFiles, recipe);

	let currentContent = fs.readFileSync(DECLARATION_PATH).toString();
	log('Finished monaco.d.ts generation');

	const one = currentContent.replace(/\r\n/gm, '\n');
	const other = result.replace(/\r\n/gm, '\n');
	const isTheSame = one === other;

	return {
		content: result,
		usageContent: usageContent,
		filePath: DECLARATION_PATH,
		isTheSame
	};
}

export function complainErrors() {
	logErr('Not running monaco.d.ts generation due to compile errors');
}



interface ILibMap { [libName: string]: string; }
interface IFileMap { [fileName: string]: string; }

class TypeScriptLanguageServiceHost implements ts.LanguageServiceHost {

	private readonly _libs: ILibMap;
	private readonly _files: IFileMap;
	private readonly _compilerOptions: ts.CompilerOptions;

	constructor(libs: ILibMap, files: IFileMap, compilerOptions: ts.CompilerOptions) {
		this._libs = libs;
		this._files = files;
		this._compilerOptions = compilerOptions;
	}

	// --- language service host ---------------

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}
	getScriptFileNames(): string[] {
		return (
			[]
				.concat(Object.keys(this._libs))
				.concat(Object.keys(this._files))
		);
	}
	getScriptVersion(fileName: string): string {
		return '1';
	}
	getProjectVersion(): string {
		return '1';
	}
	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		if (this._files.hasOwnProperty(fileName)) {
			return ts.ScriptSnapshot.fromString(this._files[fileName]);
		} else if (this._libs.hasOwnProperty(fileName)) {
			return ts.ScriptSnapshot.fromString(this._libs[fileName]);
		} else {
			return ts.ScriptSnapshot.fromString('');
		}
	}
	getScriptKind(fileName: string): ts.ScriptKind {
		return ts.ScriptKind.TS;
	}
	getCurrentDirectory(): string {
		return '';
	}
	getDefaultLibFileName(options: ts.CompilerOptions): string {
		return 'defaultLib:es5';
	}
	isDefaultLibFileName(fileName: string): boolean {
		return fileName === this.getDefaultLibFileName(this._compilerOptions);
	}
}

export function execute(): IMonacoDeclarationResult {

	const OUTPUT_FILES: { [file: string]: string; } = {};
	const SRC_FILES: IFileMap = {};
	const SRC_FILE_TO_EXPECTED_NAME: { [filename: string]: string; } = {};
	getIncludesInRecipe().forEach((moduleId) => {
		if (/\.d\.ts$/.test(moduleId)) {
			let fileName = path.join(SRC, moduleId);
			OUTPUT_FILES[moduleIdToPath('src', moduleId)] = fs.readFileSync(fileName).toString();
			return;
		}

		let fileName = path.join(SRC, moduleId) + '.ts';
		SRC_FILES[fileName] = fs.readFileSync(fileName).toString();
		SRC_FILE_TO_EXPECTED_NAME[fileName] = moduleIdToPath('src', moduleId);
	});

	const languageService = ts.createLanguageService(new TypeScriptLanguageServiceHost({}, SRC_FILES, {}));

	var t1 = Date.now();
	Object.keys(SRC_FILES).forEach((fileName) => {
		var t = Date.now();
		const emitOutput = languageService.getEmitOutput(fileName, true);
		OUTPUT_FILES[SRC_FILE_TO_EXPECTED_NAME[fileName]] = emitOutput.outputFiles[0].text;
		// console.log(`Generating .d.ts for ${fileName} took ${Date.now() - t} ms`);
	});
	console.log(`Generating .d.ts took ${Date.now() - t1} ms`);

	// console.log(result.filePath);
	// fs.writeFileSync(result.filePath, result.content.replace(/\r\n/gm, '\n'));
	// fs.writeFileSync(path.join(SRC, 'user.ts'), result.usageContent.replace(/\r\n/gm, '\n'));

	return run('src', OUTPUT_FILES);
}
