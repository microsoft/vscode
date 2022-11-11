/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import { error } from 'fancy-log';
import { basename, dirname, join, relative } from 'path';
import * as fs from 'fs';

class ShortIdent {

	private static _keywords = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
		'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
		'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
		'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']);

	static alphabet: string[] = [];

	static {
		for (let i = 97; i < 122; i++) {
			this.alphabet.push(String.fromCharCode(i));
		}
		for (let i = 65; i < 90; i++) {
			this.alphabet.push(String.fromCharCode(i));
		}
	}


	private _value = 0;

	private readonly _isNameTaken: (name: string) => boolean;

	constructor(isNameTaken: (name: string) => boolean) {
		this._isNameTaken = name => {
			return ShortIdent._keywords.has(name) || isNameTaken(name);
		};
	}

	next(): string {
		const candidate = ShortIdent.convert(this._value);
		this._value++;
		if (this._isNameTaken(candidate)) {
			// try again
			return this.next();
		}
		return candidate;
	}

	private static convert(n: number): string {
		const base = this.alphabet.length;
		let result = '';
		do {
			const rest = n % 50;
			result += this.alphabet[rest];
			n = (n / base) | 0;
		} while (n > 0);
		return result;
	}
}

const projectPath = 1
	? join(__dirname, '../../src/tsconfig.json')
	: '/Users/jrieken/Code/_samples/3wm/mangePrivate/tsconfig.json';

const existingOptions: Partial<ts.CompilerOptions> = {};

const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
if (parsed.error) {
	console.log(error);
	throw parsed.error;
}

const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(projectPath), existingOptions);
if (cmdLine.errors.length > 0) {
	console.log(error);
	throw parsed.error;
}


const host = new class implements ts.LanguageServiceHost {

	private _scriptSnapshots: Map<string, ts.IScriptSnapshot> = new Map();

	getCompilationSettings(): ts.CompilerOptions {
		return cmdLine.options;
	}
	getScriptFileNames(): string[] {
		return cmdLine.fileNames;
	}
	getScriptVersion(_fileName: string): string {
		return '1';
	}
	getProjectVersion(): string {
		return '1';
	}
	getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
		let result: ts.IScriptSnapshot | undefined = this._scriptSnapshots.get(fileName);
		if (result === undefined) {
			const content = ts.sys.readFile(fileName);
			if (content === undefined) {
				return undefined;
			}
			result = ts.ScriptSnapshot.fromString(content);
			this._scriptSnapshots.set(fileName, result);
		}
		return result;
	}
	getCurrentDirectory(): string {
		return dirname(projectPath);
	}
	getDefaultLibFileName(options: ts.CompilerOptions): string {
		return ts.getDefaultLibFilePath(options);
	}
	directoryExists = ts.sys.directoryExists;
	getDirectories = ts.sys.getDirectories;
	fileExists = ts.sys.fileExists;
	readFile = ts.sys.readFile;
	readDirectory = ts.sys.readDirectory;
	// this is necessary to make source references work.
	realpath = ts.sys.realpath;
};


const allClassDataBySymbol = new Map<ts.Symbol, ClassData>();
const service = ts.createLanguageService(host);
const program = service.getProgram()!;
const checker = program.getTypeChecker();

const enum FieldType {
	Public,
	Protected,
	Private
}

class ClassData {

	fields = new Map<string, { type: FieldType; symbol: ts.Symbol; pos: number }>();

	replacements: Map<string, string> | undefined;

	parent: ClassData | undefined;
	children: ClassData[] | undefined;

	constructor(
		readonly fileName: string,
		readonly node: ts.ClassDeclaration | ts.ClassExpression,
		readonly symbol: ts.Symbol,
	) {
		// analyse all fields (properties and methods). Find usages of all protected and
		// private ones and keep track of all public ones (to prevent naming collisions)

		const candidates: (ts.NamedDeclaration)[] = [];
		for (const member of node.members) {
			if (ts.isMethodDeclaration(member)) {
				// method `foo() {}`
				candidates.push(member);

			} else if (ts.isPropertyDeclaration(member)) {
				// property `foo = 234`
				candidates.push(member);

			} else if (ts.isGetAccessor(member)) {
				// getter: `get foo() { ... }`
				candidates.push(member);

			} else if (ts.isSetAccessor(member)) {
				// setter: `set foo() { ... }`
				candidates.push(member);

			} else if (ts.isConstructorDeclaration(member)) {
				// constructor-prop:`constructor(private foo) {}`
				for (const param of member.parameters) {
					if (hasModifier(param, ts.SyntaxKind.PrivateKeyword)
						|| hasModifier(param, ts.SyntaxKind.ProtectedKeyword)
						|| hasModifier(param, ts.SyntaxKind.PublicKeyword)
						|| hasModifier(param, ts.SyntaxKind.ReadonlyKeyword)
					) {
						candidates.push(param);
					}
				}
			}
		}
		for (const member of candidates) {
			const ident = ClassData._getMemberName(member);
			if (!ident) {
				continue;
			}
			const symbol = checker.getSymbolAtLocation(member.name!);
			if (!symbol) {
				throw new Error(`NO SYMBOL for ${node.getText()}`);
			}
			const type = ClassData._getFieldType(member);
			this.fields.set(ident, { type, symbol, pos: member.name!.pos });
		}
	}

	private static _getMemberName(node: ts.NamedDeclaration): string | undefined {
		if (!node.name) {
			return undefined;
		}
		const { name } = node;
		let ident = name.getText();
		if (name.kind === ts.SyntaxKind.ComputedPropertyName) {
			if (name.expression.kind !== ts.SyntaxKind.StringLiteral) {
				// unsupported: [Symbol.foo] or [abc + 'field']
				return;
			}
			// ['foo']
			ident = name.expression.getText().slice(1, -1);
		}

		return ident;
	}

	private static _getFieldType(node: ts.Node): FieldType {
		if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) {
			return FieldType.Private;
		} else if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) {
			return FieldType.Protected;
		} else {
			return FieldType.Public;
		}
	}

	static _shouldMangle(type: FieldType): boolean {
		return type === FieldType.Private;
	}

	static fillInReplacement(data: ClassData) {

		if (data.replacements) {
			// already done
			return;
		}

		// check with parent
		if (data.parent) {
			ClassData.fillInReplacement(data.parent);
		}

		// full chain
		const classAndAllParents: ClassData[] = [];
		let node: ClassData | undefined = data;
		while (node) {
			classAndAllParents.push(node);
			node = node.parent;
		}

		const identPool = new ShortIdent(name => {

			// parents
			let node: ClassData | undefined = data.parent;
			while (node) {
				if (node.isNameTaken(name)) {
					return true;
				}
				node = node.parent;
			}

			// children
			if (data.children) {
				const stack = [...data.children];
				while (stack.length) {
					const node = stack.pop()!;
					if (node.isNameTaken(name)) {
						return true;
					}
					if (node.children) {
						stack.push(...node.children);
					}
				}
			}

			// self
			return data.isNameTaken(name);
		});

		data.replacements = new Map();

		for (const [name, info] of data.fields) {
			if (ClassData._shouldMangle(info.type)) {
				const shortName = identPool.next();
				data.replacements.set(name, shortName);
			}
		}
	}

	// a name is taken when a field that doesn't get mangled exists or
	// when the name is already in use for replacement
	isNameTaken(name: string) {
		if (this.fields.has(name) && !ClassData._shouldMangle(this.fields.get(name)!.type)) {
			// public field
			return true;
		}
		if (this.replacements) {
			for (const shortName of this.replacements.values()) {
				if (shortName === name) {
					// replaced already (happens wih super types)
					return true;
				}
			}
		}
		if ((<any>this.node.getSourceFile()).identifiers instanceof Map) {
			// taken by any other
			if ((<any>this.node.getSourceFile()).identifiers.has(name)) {
				return true;
			}
		}
		return false;
	}

	// --- parent chaining

	private _addChild(child: ClassData) {
		this.children ??= [];
		this.children.push(child);
		child.parent = this;
	}

	static setupParents(data: ClassData) {
		const extendsClause = data.node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
		if (!extendsClause) {
			// no EXTENDS-clause
			return;
		}
		const extendsSymbol = getSuperType(extendsClause.types[0].expression);
		if (!extendsSymbol) {
			// IGNORE: failed to find super-class
			return;
		}
		const parent = allClassDataBySymbol.get(extendsSymbol);
		parent?._addChild(data);
	}
}

function visit(node: ts.Node): void {

	if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {

		if (node.members.length === 0) {
			// IGNORE: no members
			return;
		}

		const classSymbol = checker.getTypeAtLocation(node.name ?? node).symbol;
		if (!classSymbol) {
			throw new Error('MISSING');
		}
		if (allClassDataBySymbol.has(classSymbol)) {
			throw new Error('DUPE?');
		}

		allClassDataBySymbol.set(classSymbol, new ClassData(node.getSourceFile().fileName, node, classSymbol));
	}

	ts.forEachChild(node, visit);
}


// --- ast utils


function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
	const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
	return Boolean(modifiers?.find(mode => mode.kind === kind));
}

function getSuperType(node: ts.Node): ts.Symbol | undefined {
	const type = checker.getTypeAtLocation(node);
	if (!type.symbol) {
		return;
	}
	if (!type.symbol.declarations || type.symbol.declarations.length !== 1) {
		return;
	}
	const dec = type.symbol.declarations[0];
	if (dec.kind === ts.SyntaxKind.ClassDeclaration) {
		return type.symbol;
	}
	return undefined;
}

// step 1: collect all class data and store it by symbols
// step 2: hook up extends-chaines and populate field replacement maps
// step 3: generate and apply rewrites

async function mangle() {

	// (1) find all classes and field info
	for (const file of program.getSourceFiles()) {
		if (!file.isDeclarationFile) {
			ts.forEachChild(file, visit);
		}
	}
	console.log(`done COLLECTING ${allClassDataBySymbol.size} classes`);

	// (1.1) connect all class info
	for (const data of allClassDataBySymbol.values()) {
		ClassData.setupParents(data);
	}

	// (2) fill in replacement strings
	for (const data of allClassDataBySymbol.values()) {
		ClassData.fillInReplacement(data);
	}
	console.log(`done creating REPLACEMENTS`);

	// (3) prepare rename edits
	type Edit = { newText: string; offset: number; length: number };
	const editsByFile = new Map<string, Edit[]>();

	const appendEdit = (fileName: string, edit: Edit) => {
		const edits = editsByFile.get(fileName);
		if (!edits) {
			editsByFile.set(fileName, [edit]);
		} else {
			edits.push(edit);
		}
	};

	for (const data of allClassDataBySymbol.values()) {

		if (hasModifier(data.node, ts.SyntaxKind.DeclareKeyword)) {
			continue;
		}

		for (const [name, info] of data.fields) {
			if (!ClassData._shouldMangle(info.type)) {
				continue;
			}
			const newText = data.replacements!.get(name)!;
			const locations = service.findRenameLocations(data.fileName, info.pos, false, false, true) ?? [];
			for (const loc of locations) {
				appendEdit(loc.fileName, {
					newText: (loc.prefixText || '') + newText + (loc.suffixText || ''),
					offset: loc.textSpan.start,
					length: loc.textSpan.length
				});
			}
		}
	}

	console.log(`done preparing EDITS for ${editsByFile.size} files`);

	// (4) apply renames
	let savedBytes = 0;

	for (const item of program.getSourceFiles()) {

		let newFullText: string;
		const edits = editsByFile.get(item.fileName);
		if (!edits) {
			// just copy
			newFullText = item.getFullText();

		} else {
			// apply renames
			edits.sort((a, b) => b.offset - a.offset);
			const characters = item.getFullText().split('');

			let lastEdit: Edit | undefined;

			for (const edit of edits) {
				if (lastEdit) {
					if (lastEdit.offset === edit.offset) {
						//
						if (lastEdit.length !== edit.length || lastEdit.newText !== edit.newText) {
							console.log('OVERLAPPING edit', item.fileName, edit.offset, edits);
							throw new Error('OVERLAPPING edit');
						} else {
							continue;
						}
					}
				}
				lastEdit = edit;
				const removed = characters.splice(edit.offset, edit.length, edit.newText);
				savedBytes += removed.length - edit.newText.length;
			}
			newFullText = characters.join('');
		}

		const projectBase = dirname(projectPath);
		const newProjectBase = join(dirname(projectBase), basename(projectBase) + '-mangle');
		const newFilePath = join(newProjectBase, relative(projectBase, item.fileName));

		await fs.promises.mkdir(dirname(newFilePath), { recursive: true });

		await fs.promises.writeFile(newFilePath, newFullText);
	}

	console.log(`DONE saved ${savedBytes / 1000}kb`);
}

mangle();
