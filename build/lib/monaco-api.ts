/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import { type IFileMap, TypeScriptLanguageServiceHost } from './typeScriptLanguageServiceHost.ts';
import ts from 'typescript';

import tsfmt from '../../tsfmt.json' with { type: 'json' };

const dtsv = '3';

const SRC = path.join(import.meta.dirname, '../../src');
export const RECIPE_PATH = path.join(import.meta.dirname, '../monaco/monaco.d.ts.recipe');
const DECLARATION_PATH = path.join(import.meta.dirname, '../../src/vs/monaco.d.ts');

function logErr(message: any, ...rest: unknown[]): void {
	fancyLog(ansiColors.yellow(`[monaco.d.ts]`), message, ...rest);
}

type SourceFileGetter = (moduleId: string) => ts.SourceFile | null;

type TSTopLevelDeclaration = ts.InterfaceDeclaration | ts.EnumDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration | ts.FunctionDeclaration | ts.ModuleDeclaration;
type TSTopLevelDeclare = TSTopLevelDeclaration | ts.VariableStatement;

function isDeclaration(ts: typeof import('typescript'), a: TSTopLevelDeclare): a is TSTopLevelDeclaration {
	return (
		a.kind === ts.SyntaxKind.InterfaceDeclaration
		|| a.kind === ts.SyntaxKind.EnumDeclaration
		|| a.kind === ts.SyntaxKind.ClassDeclaration
		|| a.kind === ts.SyntaxKind.TypeAliasDeclaration
		|| a.kind === ts.SyntaxKind.FunctionDeclaration
		|| a.kind === ts.SyntaxKind.ModuleDeclaration
	);
}

function visitTopLevelDeclarations(ts: typeof import('typescript'), sourceFile: ts.SourceFile, visitor: (node: TSTopLevelDeclare) => boolean): void {
	let stop = false;

	const visit = (node: ts.Node): void => {
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
				stop = visitor(node as TSTopLevelDeclare);
		}

		if (stop) {
			return;
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
}


function getAllTopLevelDeclarations(ts: typeof import('typescript'), sourceFile: ts.SourceFile): TSTopLevelDeclare[] {
	const all: TSTopLevelDeclare[] = [];
	visitTopLevelDeclarations(ts, sourceFile, (node) => {
		if (node.kind === ts.SyntaxKind.InterfaceDeclaration || node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.ModuleDeclaration) {
			const interfaceDeclaration = node as ts.InterfaceDeclaration;
			const triviaStart = interfaceDeclaration.pos;
			const triviaEnd = interfaceDeclaration.name.pos;
			const triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });

			if (triviaText.indexOf('@internal') === -1) {
				all.push(node);
			}
		} else {
			const nodeText = getNodeText(sourceFile, node);
			if (nodeText.indexOf('@internal') === -1) {
				all.push(node);
			}
		}
		return false /*continue*/;
	});
	return all;
}


function getTopLevelDeclaration(ts: typeof import('typescript'), sourceFile: ts.SourceFile, typeName: string): TSTopLevelDeclare | null {
	let result: TSTopLevelDeclare | null = null;
	visitTopLevelDeclarations(ts, sourceFile, (node) => {
		if (isDeclaration(ts, node) && node.name) {
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


function getNodeText(sourceFile: ts.SourceFile, node: { pos: number; end: number }): string {
	return sourceFile.getFullText().substring(node.pos, node.end);
}

function hasModifier(modifiers: readonly ts.ModifierLike[] | undefined, kind: ts.SyntaxKind): boolean {
	if (modifiers) {
		for (let i = 0; i < modifiers.length; i++) {
			const mod = modifiers[i];
			if (mod.kind === kind) {
				return true;
			}
		}
	}
	return false;
}

function isStatic(ts: typeof import('typescript'), member: ts.ClassElement | ts.TypeElement): boolean {
	if (ts.canHaveModifiers(member)) {
		return hasModifier(ts.getModifiers(member), ts.SyntaxKind.StaticKeyword);
	}
	return false;
}

function isDefaultExport(ts: typeof import('typescript'), declaration: ts.InterfaceDeclaration | ts.ClassDeclaration): boolean {
	return (
		hasModifier(declaration.modifiers, ts.SyntaxKind.DefaultKeyword)
		&& hasModifier(declaration.modifiers, ts.SyntaxKind.ExportKeyword)
	);
}

function getMassagedTopLevelDeclarationText(ts: typeof import('typescript'), sourceFile: ts.SourceFile, declaration: TSTopLevelDeclare, importName: string, usage: string[], enums: IEnumEntry[]): string {
	let result = getNodeText(sourceFile, declaration);
	if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
		const interfaceDeclaration = declaration as ts.InterfaceDeclaration | ts.ClassDeclaration;

		const staticTypeName = (
			isDefaultExport(ts, interfaceDeclaration)
				? `${importName}.default`
				: `${importName}.${declaration.name!.text}`
		);

		let instanceTypeName = staticTypeName;
		const typeParametersCnt = (interfaceDeclaration.typeParameters ? interfaceDeclaration.typeParameters.length : 0);
		if (typeParametersCnt > 0) {
			const arr: string[] = [];
			for (let i = 0; i < typeParametersCnt; i++) {
				arr.push('any');
			}
			instanceTypeName = `${instanceTypeName}<${arr.join(',')}>`;
		}

		const members: ts.NodeArray<ts.ClassElement | ts.TypeElement> = interfaceDeclaration.members;
		members.forEach((member) => {
			try {
				const memberText = getNodeText(sourceFile, member);
				if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
					result = result.replace(memberText, '');
				} else {
					const memberName = (member.name as ts.Identifier | ts.StringLiteral).text;
					const memberAccess = (memberName.indexOf('.') >= 0 ? `['${memberName}']` : `.${memberName}`);
					if (isStatic(ts, member)) {
						usage.push(`a = ${staticTypeName}${memberAccess};`);
					} else {
						usage.push(`a = (<${instanceTypeName}>b)${memberAccess};`);
					}
				}
			} catch (err) {
				// life..
			}
		});
	}
	result = result.replace(/export default /g, 'export ');
	result = result.replace(/export declare /g, 'export ');
	result = result.replace(/declare /g, '');
	const lines = result.split(/\r\n|\r|\n/);
	for (let i = 0; i < lines.length; i++) {
		if (/\s*\*/.test(lines[i])) {
			// very likely a comment
			continue;
		}
		lines[i] = lines[i].replace(/"/g, '\'');
	}
	result = lines.join('\n');

	if (declaration.kind === ts.SyntaxKind.EnumDeclaration) {
		result = result.replace(/const enum/, 'enum');
		enums.push({
			enumName: declaration.name.getText(sourceFile),
			text: result
		});
	}

	return result;
}

interface Formatting<TContext> {
	getFormatContext(options: ts.FormatCodeSettings): TContext;
	formatDocument(file: ts.SourceFile, ruleProvider: TContext, options: ts.FormatCodeSettings): ts.TextChange[];
}

type Typescript = typeof import('typescript') & { readonly formatting: Formatting<unknown> };

function format(ts: Typescript, text: string, endl: string): string {
	const REALLY_FORMAT = false;

	text = preformat(text, endl);
	if (!REALLY_FORMAT) {
		return text;
	}

	// Parse the source text
	const sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);

	// Get the formatting edits on the input sources
	const edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(tsfmt), tsfmt);

	// Apply the edits on the input code
	return applyEdits(text, edits);

	function countParensCurly(text: string): number {
		let cnt = 0;
		for (let i = 0; i < text.length; i++) {
			if (text.charAt(i) === '(' || text.charAt(i) === '{') {
				cnt++;
			}
			if (text.charAt(i) === ')' || text.charAt(i) === '}') {
				cnt--;
			}
		}
		return cnt;
	}

	function repeatStr(s: string, cnt: number): string {
		let r = '';
		for (let i = 0; i < cnt; i++) {
			r += s;
		}
		return r;
	}

	function preformat(text: string, endl: string): string {
		const lines = text.split(endl);
		let inComment = false;
		let inCommentDeltaIndent = 0;
		let indent = 0;
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i].replace(/\s$/, '');
			let repeat = false;
			let lineIndent = 0;
			do {
				repeat = false;
				if (line.substring(0, 4) === '    ') {
					line = line.substring(4);
					lineIndent++;
					repeat = true;
				}
				if (line.charAt(0) === '\t') {
					line = line.substring(1);
					lineIndent++;
					repeat = true;
				}
			} while (repeat);

			if (line.length === 0) {
				continue;
			}

			if (inComment) {
				if (/\*\//.test(line)) {
					inComment = false;
				}
				lines[i] = repeatStr('\t', lineIndent + inCommentDeltaIndent) + line;
				continue;
			}

			if (/\/\*/.test(line)) {
				inComment = true;
				inCommentDeltaIndent = indent - lineIndent;
				lines[i] = repeatStr('\t', indent) + line;
				continue;
			}

			const cnt = countParensCurly(line);
			let shouldUnindentAfter = false;
			let shouldUnindentBefore = false;
			if (cnt < 0) {
				if (/[({]/.test(line)) {
					shouldUnindentAfter = true;
				} else {
					shouldUnindentBefore = true;
				}
			} else if (cnt === 0) {
				shouldUnindentBefore = /^\}/.test(line);
			}
			let shouldIndentAfter = false;
			if (cnt > 0) {
				shouldIndentAfter = true;
			} else if (cnt === 0) {
				shouldIndentAfter = /{$/.test(line);
			}

			if (shouldUnindentBefore) {
				indent--;
			}

			lines[i] = repeatStr('\t', indent) + line;

			if (shouldUnindentAfter) {
				indent--;
			}
			if (shouldIndentAfter) {
				indent++;
			}
		}
		return lines.join(endl);
	}

	function getRuleProvider(options: ts.FormatCodeSettings) {
		// Share this between multiple formatters using the same options.
		// This represents the bulk of the space the formatter uses.

		return ts.formatting.getFormatContext(options);
	}

	function applyEdits(text: string, edits: ts.TextChange[]): string {
		// Apply edits in reverse on the existing text
		let result = text;
		for (let i = edits.length - 1; i >= 0; i--) {
			const change = edits[i];
			const head = result.slice(0, change.span.start);
			const tail = result.slice(change.span.start + change.span.length);
			result = head + change.newText + tail;
		}
		return result;
	}
}

function createReplacerFromDirectives(directives: [RegExp, string][]): (str: string) => string {
	return (str: string) => {
		for (let i = 0; i < directives.length; i++) {
			str = str.replace(directives[i][0], directives[i][1]);
		}
		return str;
	};
}

function createReplacer(data: string): (str: string) => string {
	data = data || '';
	const rawDirectives = data.split(';');
	const directives: [RegExp, string][] = [];
	rawDirectives.forEach((rawDirective) => {
		if (rawDirective.length === 0) {
			return;
		}
		const pieces = rawDirective.split('=>');
		let findStr = pieces[0];
		const replaceStr = pieces[1];

		findStr = findStr.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
		findStr = '\\b' + findStr + '\\b';
		directives.push([new RegExp(findStr, 'g'), replaceStr]);
	});

	return createReplacerFromDirectives(directives);
}

interface ITempResult {
	result: string;
	usageContent: string;
	enums: string;
}

interface IEnumEntry {
	enumName: string;
	text: string;
}

function generateDeclarationFile(ts: Typescript, recipe: string, sourceFileGetter: SourceFileGetter): ITempResult | null {
	const endl = /\r\n/.test(recipe) ? '\r\n' : '\n';

	const lines = recipe.split(endl);
	const result: string[] = [];

	let usageCounter = 0;
	const usageImports: string[] = [];
	const usage: string[] = [];

	let failed = false;

	usage.push(`var a: any;`);
	usage.push(`var b: any;`);

	const generateUsageImport = (moduleId: string) => {
		const importName = 'm' + (++usageCounter);
		usageImports.push(`import * as ${importName} from './${moduleId}';`);
		return importName;
	};

	const enums: IEnumEntry[] = [];
	let version: string | null = null;

	lines.forEach(line => {

		if (failed) {
			return;
		}

		const m0 = line.match(/^\/\/dtsv=(\d+)$/);
		if (m0) {
			version = m0[1];
		}

		const m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m1) {
			const moduleId = m1[1];
			const sourceFile = sourceFileGetter(moduleId);
			if (!sourceFile) {
				logErr(`While handling ${line}`);
				logErr(`Cannot find ${moduleId}`);
				failed = true;
				return;
			}

			const importName = generateUsageImport(moduleId);

			const replacer = createReplacer(m1[2]);

			const typeNames = m1[3].split(/,/);
			typeNames.forEach((typeName) => {
				typeName = typeName.trim();
				if (typeName.length === 0) {
					return;
				}
				const declaration = getTopLevelDeclaration(ts, sourceFile, typeName);
				if (!declaration) {
					logErr(`While handling ${line}`);
					logErr(`Cannot find ${typeName}`);
					failed = true;
					return;
				}
				result.push(replacer(getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums)));
			});
			return;
		}

		const m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m2) {
			const moduleId = m2[1];
			const sourceFile = sourceFileGetter(moduleId);
			if (!sourceFile) {
				logErr(`While handling ${line}`);
				logErr(`Cannot find ${moduleId}`);
				failed = true;
				return;
			}

			const importName = generateUsageImport(moduleId);

			const replacer = createReplacer(m2[2]);

			const typeNames = m2[3].split(/,/);
			const typesToExcludeMap: { [typeName: string]: boolean } = {};
			const typesToExcludeArr: string[] = [];
			typeNames.forEach((typeName) => {
				typeName = typeName.trim();
				if (typeName.length === 0) {
					return;
				}
				typesToExcludeMap[typeName] = true;
				typesToExcludeArr.push(typeName);
			});

			getAllTopLevelDeclarations(ts, sourceFile).forEach((declaration) => {
				if (isDeclaration(ts, declaration) && declaration.name) {
					if (typesToExcludeMap[declaration.name.text]) {
						return;
					}
				} else {
					// node is ts.VariableStatement
					const nodeText = getNodeText(sourceFile, declaration);
					for (let i = 0; i < typesToExcludeArr.length; i++) {
						if (nodeText.indexOf(typesToExcludeArr[i]) >= 0) {
							return;
						}
					}
				}
				result.push(replacer(getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums)));
			});
			return;
		}

		result.push(line);
	});

	if (failed) {
		return null;
	}

	if (version !== dtsv) {
		if (!version) {
			logErr(`gulp watch restart required. 'monaco.d.ts.recipe' is written before versioning was introduced.`);
		} else {
			logErr(`gulp watch restart required. 'monaco.d.ts.recipe' v${version} does not match runtime v${dtsv}.`);
		}
		return null;
	}

	let resultTxt = result.join(endl);
	resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
	resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
	resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);
	resultTxt = format(ts, resultTxt, endl);
	resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);

	enums.sort((e1, e2) => {
		if (e1.enumName < e2.enumName) {
			return -1;
		}
		if (e1.enumName > e2.enumName) {
			return 1;
		}
		return 0;
	});

	let resultEnums = [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copyright (c) Microsoft Corporation. All rights reserved.',
		' *  Licensed under the MIT License. See License.txt in the project root for license information.',
		' *--------------------------------------------------------------------------------------------*/',
		'',
		'// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
		''
	].concat(enums.map(e => e.text)).join(endl);
	resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
	resultEnums = format(ts, resultEnums, endl);
	resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);

	return {
		result: resultTxt,
		usageContent: `${usageImports.join('\n')}\n\n${usage.join('\n')}`,
		enums: resultEnums
	};
}

export interface IMonacoDeclarationResult {
	content: string;
	usageContent: string;
	enums: string;
	filePath: string;
	isTheSame: boolean;
}

function _run(ts: Typescript, sourceFileGetter: SourceFileGetter): IMonacoDeclarationResult | null {
	const recipe = fs.readFileSync(RECIPE_PATH).toString();
	const t = generateDeclarationFile(ts, recipe, sourceFileGetter);
	if (!t) {
		return null;
	}

	const result = t.result;
	const usageContent = t.usageContent;
	const enums = t.enums;

	const currentContent = fs.readFileSync(DECLARATION_PATH).toString();
	const one = currentContent.replace(/\r\n/gm, '\n');
	const other = result.replace(/\r\n/gm, '\n');
	const isTheSame = (one === other);

	return {
		content: result,
		usageContent: usageContent,
		enums: enums,
		filePath: DECLARATION_PATH,
		isTheSame
	};
}

export class FSProvider {
	public existsSync(filePath: string): boolean {
		return fs.existsSync(filePath);
	}
	public statSync(filePath: string): fs.Stats {
		return fs.statSync(filePath);
	}
	public readFileSync(_moduleId: string, filePath: string): Buffer {
		return fs.readFileSync(filePath);
	}
}

class CacheEntry {
	public readonly sourceFile: ts.SourceFile;
	public readonly mtime: number;

	constructor(
		sourceFile: ts.SourceFile,
		mtime: number
	) {
		this.sourceFile = sourceFile;
		this.mtime = mtime;
	}
}

export class DeclarationResolver {

	public readonly ts: typeof import('typescript');
	private _sourceFileCache: { [moduleId: string]: CacheEntry | null };
	private readonly _fsProvider: FSProvider;

	constructor(fsProvider: FSProvider) {
		this._fsProvider = fsProvider;
		this.ts = ts;
		this._sourceFileCache = Object.create(null);
	}

	public invalidateCache(moduleId: string): void {
		this._sourceFileCache[moduleId] = null;
	}

	public getDeclarationSourceFile(moduleId: string): ts.SourceFile | null {
		if (this._sourceFileCache[moduleId]) {
			// Since we cannot trust file watching to invalidate the cache, check also the mtime
			const fileName = this._getFileName(moduleId);
			const mtime = this._fsProvider.statSync(fileName).mtime.getTime();
			if (this._sourceFileCache[moduleId]!.mtime !== mtime) {
				this._sourceFileCache[moduleId] = null;
			}
		}
		if (!this._sourceFileCache[moduleId]) {
			this._sourceFileCache[moduleId] = this._getDeclarationSourceFile(moduleId);
		}
		return this._sourceFileCache[moduleId] ? this._sourceFileCache[moduleId]!.sourceFile : null;
	}

	private _getFileName(moduleId: string): string {
		if (/\.d\.ts$/.test(moduleId)) {
			return path.join(SRC, moduleId);
		}
		if (/\.js$/.test(moduleId)) {
			return path.join(SRC, moduleId.replace(/\.js$/, '.ts'));
		}
		return path.join(SRC, `${moduleId}.ts`);
	}

	private _getDeclarationSourceFile(moduleId: string): CacheEntry | null {
		const fileName = this._getFileName(moduleId);
		if (!this._fsProvider.existsSync(fileName)) {
			return null;
		}
		const mtime = this._fsProvider.statSync(fileName).mtime.getTime();
		if (/\.d\.ts$/.test(moduleId)) {
			// const mtime = this._fsProvider.statFileSync()
			const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
			return new CacheEntry(
				this.ts.createSourceFile(fileName, fileContents, this.ts.ScriptTarget.ES5),
				mtime
			);
		}
		const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
		const fileMap: IFileMap = new Map([
			['file.ts', fileContents]
		]);
		const service = this.ts.createLanguageService(new TypeScriptLanguageServiceHost(this.ts, fileMap, {}));
		const text = service.getEmitOutput('file.ts', true, true).outputFiles[0].text;
		return new CacheEntry(
			this.ts.createSourceFile(fileName, text, this.ts.ScriptTarget.ES5),
			mtime
		);
	}
}

export function run3(resolver: DeclarationResolver): IMonacoDeclarationResult | null {
	const sourceFileGetter = (moduleId: string) => resolver.getDeclarationSourceFile(moduleId);
	return _run(resolver.ts as Typescript, sourceFileGetter);
}


export function execute(): IMonacoDeclarationResult {
	const r = run3(new DeclarationResolver(new FSProvider()));
	if (!r) {
		throw new Error(`monaco.d.ts generation error - Cannot continue`);
	}
	return r;
}
