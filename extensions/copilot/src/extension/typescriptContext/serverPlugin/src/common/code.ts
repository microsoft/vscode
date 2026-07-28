/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import type { RequestContext } from './contextProvider';
import { CodeSnippet } from './protocol';
import { ProgramContext, RecoverableError, SnippetProvider } from './types';
import { Symbols } from './typescripts';

namespace Nodes {

	export function getLines(node: tt.Node, includeJSDocComment: boolean, sourceFile?: tt.SourceFile | undefined): string[] {
		sourceFile ??= node.getSourceFile();
		const textStartPosition = node.getStart(sourceFile, includeJSDocComment);
		const startRange = sourceFile.getLineAndCharacterOfPosition(textStartPosition);
		const text = sourceFile.text.substring(textStartPosition, node.getEnd());
		const lines = text.split(/\r?\n/g);
		// We have an indentation on the start line
		if (startRange.character > 0) {
			const lineStartPosition = sourceFile.getPositionOfLineAndCharacter(startRange.line, 0);
			const indent = sourceFile.text.substring(lineStartPosition, textStartPosition);
			stripIndent(lines, indent);
		}
		trimLines(lines);
		return lines;
	}

	export function getDocumentation(node: tt.Node): string[] | undefined {
		const fullText = node.getFullText();
		const ranges = ts.getLeadingCommentRanges(fullText, 0);
		if (ranges !== undefined && ranges.length > 0) {
			const start = ranges.at(-1)!.pos;
			const end = ranges.at(-1)!.end;
			const text = fullText.substring(start, end).trim();
			const lines = text.split(/\r?\n/);
			trimLines(lines);
			if (lines.length > 1) {
				const line = lines[1];
				const match = line.match(/^\s+/);
				if (match !== null) {
					stripIndent(lines, match[0]);
				}
			}
			return lines;
		}
		return undefined;
	}

	function stripIndent(lines: string[], indent: string, start: number = 1): void {
		let allHaveIndent: boolean = true;
		for (let index = start; index < lines.length; index++) {
			if (!lines[index].startsWith(indent)) {
				allHaveIndent = false;
				break;
			}
		}
		if (allHaveIndent) {
			for (let index = start; index < lines.length; index++) {
				lines[index] = lines[index].substring(indent.length);
			}
		}
	}

	function trimLines(lines: string[]): void {
		while (lines.length > 0 && lines[0].trim() === '') {
			lines.shift();
		}
		while (lines.length > 0 && lines.at(-1)!.trim() === '') {
			lines.pop();
		}
	}
}

abstract class AbstractEmitter {

	protected readonly context: RequestContext;

	private indent: number;

	private readonly lines: string[];
	public readonly source: string;
	protected readonly additionalSources: Set<string>;


	constructor(context: RequestContext, source: tt.SourceFile, indent: number = 0) {
		this.context = context;
		this.indent = indent;
		this.source = source.fileName;
		this.lines = [];
		this.additionalSources = new Set();
	}

	public abstract readonly key: string | undefined;
	public abstract emit(currentSourceFile: tt.SourceFile): void;

	protected makeKey(symbols: tt.Symbol | tt.Symbol[]): string | undefined {
		if (Array.isArray(symbols)) {
			if (symbols.length === 0) {
				return undefined;
			}
			let keys: string[] | undefined = [];
			for (const symbol of symbols) {
				const key = Symbols.createVersionedKey(symbol, this.context.session);
				if (key !== undefined) {
					keys.push(key);
				} else {
					keys = undefined;
					break;
				}
			}
			return keys === undefined ? undefined : keys.join(';');
		} else {
			return Symbols.createVersionedKey(symbols, this.context.session);
		}
	}

	public getLines(): string[] {
		return this.lines;
	}

	public getAdditionalSources(): Set<string> {
		this.additionalSources.delete(this.source);
		return this.additionalSources;
	}

	protected increaseIndent(): void {
		this.indent++;
	}

	protected decreaseIndent(): void {
		this.indent--;
	}

	protected addLine(line: string): void {
		if (this.indent === 0) {
			this.lines.push(line);
		} else {
			this.lines.push('\t'.repeat(this.indent) + line);
		}
	}

	protected addLines(lines: string[]): void {
		for (const line of lines) {
			this.addLine(line);
		}
	}

	protected addConstructorDeclaration(declaration: tt.ConstructorDeclaration): void {
		this.addDocumentation(declaration);
		const elements: string[] = [];
		if (declaration.modifiers !== undefined) {
			elements.push(declaration.modifiers.map(m => m.getText()).join(' '));
			elements.push(' ');
		}
		elements.push('constructor');
		elements.push('(');
		elements.push(this.getParameters(declaration.parameters));
		elements.push(');');
		this.addLine(elements.join(''));
	}

	protected addPropertyDeclaration(declaration: tt.PropertyDeclaration | tt.PropertySignature): void {
		this.addLines(Nodes.getLines(declaration, this.context.includeDocumentation));
	}

	protected addMethodDeclaration(declaration: tt.MethodDeclaration | tt.MethodSignature): void {
		this.addDocumentation(declaration);
		const elements: string[] = [];
		if (declaration.modifiers !== undefined) {
			elements.push(declaration.modifiers.map(m => m.getText()).join(' '));
			elements.push(' ');
		}
		elements.push(declaration.name.getText());
		if (declaration.typeParameters !== undefined) {
			elements.push('<');
			elements.push(declaration.typeParameters.map(p => p.getText()).join(', '));
			elements.push('>');
		}
		elements.push('(');
		if (declaration.parameters !== undefined) {
			elements.push(declaration.parameters.map(p => p.getText()).join(', '));
		}
		elements.push(')');
		if (declaration.type !== undefined) {
			elements.push(': ');
			elements.push(declaration.type.getText());
		}
		elements.push(';');
		this.addLine(elements.join(''));
	}

	protected addCallSignatureDeclaration(declaration: tt.CallSignatureDeclaration): void {
		this.addDocumentation(declaration);
		const elements: string[] = [];
		if (declaration.typeParameters !== undefined) {
			elements.push('<');
			elements.push(declaration.typeParameters.map(p => p.getText()).join(', '));
			elements.push('>');
		}
		elements.push('(');
		if (declaration.parameters !== undefined) {
			elements.push(declaration.parameters.map(p => p.getText()).join(', '));
		}
		elements.push(')');
		if (declaration.type !== undefined) {
			elements.push(': ');
			elements.push(declaration.type.getText());
		}
		elements.push(';');
		this.addLine(elements.join(''));
	}

	protected addGetAccessorDeclaration(declaration: tt.GetAccessorDeclaration): void {
		this.addAccessorDeclaration(declaration, 'get');
	}

	protected addSetAccessorDeclaration(declaration: tt.SetAccessorDeclaration): void {
		this.addAccessorDeclaration(declaration, 'set');
	}

	private addAccessorDeclaration(declaration: tt.GetAccessorDeclaration | tt.SetAccessorDeclaration, prefix: 'get' | 'set'): void {
		this.addDocumentation(declaration);
		const elements: string[] = [];
		if (declaration.modifiers !== undefined) {
			elements.push(declaration.modifiers.map(m => m.getText()).join(' '));
			elements.push(' ');
		}
		elements.push(`${prefix} `);
		elements.push(declaration.name.getText());
		if (declaration.type !== undefined) {
			elements.push(': ');
			elements.push(declaration.type.getText());
		}
		elements.push(';');
		this.addLine(elements.join(''));
	}

	protected addFunctionDeclaration(declaration: tt.FunctionDeclaration, name?: string, ensureModifier?: string): void {
		name ??= declaration.name?.getText() ?? '';
		this.addDocumentation(declaration);
		const elements: string[] = [];
		elements.push(this.getModifiers(declaration.modifiers, ensureModifier));
		elements.push(' function ');
		elements.push(name);
		elements.push(this.getTypeParameters(declaration.typeParameters));
		elements.push('(');
		elements.push(this.getParameters(declaration.parameters));
		elements.push(')');
		elements.push(this.getReturnTypes(declaration));
		elements.push(';');
		this.addLine(elements.join(''));
	}

	protected addDocumentation(declaration: tt.Declaration): void {
		if (!this.context.includeDocumentation) {
			return;
		}
		const documentation = Nodes.getDocumentation(declaration);
		if (documentation !== undefined) {
			this.addLines(documentation);
		}
	}

	protected getModifiers(modifiers: tt.NodeArray<tt.ModifierLike> | undefined, prefix?: string): string {
		if (modifiers === undefined) {
			return '';
		}
		const result: string[] = [];
		if (prefix !== undefined) {
			result.push(prefix);
		}
		for (const modifier of modifiers) {
			if (modifier.kind === ts.SyntaxKind.AsyncKeyword || modifier.kind === ts.SyntaxKind.DeclareKeyword || modifier.kind === ts.SyntaxKind.ExportKeyword) {
				continue;
			}
			result.push(modifier.getText());
		}
		return result.join(' ');
	}

	protected getTypeParameters(typeParameters: tt.NodeArray<tt.TypeParameterDeclaration> | undefined): string {
		if (typeParameters === undefined) {
			return '';
		}
		const result: string[] = [];
		result.push('<');
		result.push(typeParameters.map(p => p.getText()).join(', '));
		result.push('>');
		return result.join('');
	}

	private getParameters(parameters: tt.NodeArray<tt.ParameterDeclaration> | undefined): string {
		if (parameters === undefined) {
			return '';
		}
		return parameters.map(p => p.getText()).join(', ');
	}

	private getReturnTypes(declaration: tt.MethodDeclaration | tt.FunctionDeclaration): string {
		if (declaration.type === undefined) {
			return '';
		}
		return `: ${declaration.type.getText()}`;
	}
}

abstract class TypeEmitter extends AbstractEmitter {

	protected readonly type: tt.Symbol;
	protected readonly name: string;

	private readonly seen: Set<tt.__String>;

	constructor(context: RequestContext, source: tt.SourceFile, type: tt.Symbol, name: string) {
		super(context, source);
		this.type = type;
		this.name = name;
		this.seen = new Set();
	}

	protected processMembers(members: tt.SymbolTable): void {
		for (const [_name, member] of members) {
			if (!this.seen.has(_name)) {
				this.seen.add(_name);
				this.processMember(member);
			}
		}
	}

	protected processMember(member: tt.Symbol): void {
		const declarations = member.declarations;
		if (declarations === undefined) {
			return;
		}
		if (Symbols.isProperty(member)) {
			const declaration = declarations[0];
			if (ts.isPropertyDeclaration(declaration) || ts.isPropertySignature(declaration)) {
				this.addPropertyDeclaration(declaration);
			}
		} else if (Symbols.isMethod(member)) {
			for (const declaration of declarations) {
				if (ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration)) {
					this.addMethodDeclaration(declaration);
				}
			}
		} else if (Symbols.isSetAccessor(member) || Symbols.isGetAccessor(member)) {
			for (const declaration of declarations) {
				if (ts.isGetAccessorDeclaration(declaration)) {
					this.addGetAccessorDeclaration(declaration);
				} else if (ts.isSetAccessorDeclaration(declaration)) {
					this.addSetAccessorDeclaration(declaration);
				}
			}
		} else if (Symbols.isSignature(member)) {
			for (const declaration of declarations) {
				if (ts.isCallSignatureDeclaration(declaration)) {
					this.addCallSignatureDeclaration(declaration);
				}
			}
		} else if (Symbols.isConstructor(member)) {
			for (const declaration of declarations) {
				if (ts.isConstructorDeclaration(declaration)) {
					this.addConstructorDeclaration(declaration);
				}
			}
		}
	}

	protected override getTypeParameters(): string {
		const declarations = this.type.declarations;
		if (declarations === undefined || declarations.length === 0) {
			return '';
		}
		const declaration = declarations[0];
		if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
			if (declaration.typeParameters !== undefined) {
				return super.getTypeParameters(declaration.typeParameters);
			}
		}
		return '';
	}
}

class ClassEmitter extends TypeEmitter {

	private readonly superClasses: tt.Symbol[] | undefined;
	private readonly includePrivates: boolean;

	public readonly key: string | undefined;

	constructor(context: RequestContext, symbols: Symbols, source: tt.SourceFile, clazz: tt.Symbol, name: string, includeSuperClasses: boolean, includePrivates: boolean) {
		super(context, source, clazz, name);
		this.includePrivates = includePrivates;
		this.key = undefined;
		if (includeSuperClasses) {
			this.superClasses = new Array<tt.Symbol>(...symbols.getAllSuperClasses(clazz));
			this.key = this.makeKey([clazz, ...this.superClasses]);
		} else {
			this.key = this.makeKey(clazz);
			this.superClasses = undefined;
		}
	}

	public emit(): void {
		this.addLine(`declare class ${this.name}${this.getTypeParameters()} {`);
		this.increaseIndent();
		if (this.type.members !== undefined) {
			Symbols.fillSources(this.additionalSources, this.type);
			this.processMembers(this.type.members);
		}
		if (this.superClasses !== undefined) {
			for (let i = this.superClasses.length - 1; i >= 0; i--) {
				const superClass = this.superClasses[i];
				if (superClass.members !== undefined) {
					Symbols.fillSources(this.additionalSources, superClass);
					this.processMembers(superClass.members);
				}
			}
		}
		this.decreaseIndent();
		this.addLine('}');
	}

	protected override processMember(member: tt.Symbol): void {
		if (!this.includePrivates && Symbols.isPrivate(member)) {
			return;
		}
		super.processMember(member);
	}
}

class InterfaceEmitter extends TypeEmitter {

	private readonly superTypes: tt.Symbol[];

	public readonly key: string | undefined;

	constructor(context: RequestContext, symbols: Symbols, source: tt.SourceFile, type: tt.Symbol, name: string) {
		super(context, source, type, name);
		this.superTypes = new Array<tt.Symbol>(...symbols.getAllSuperTypes(type)).filter(t => Symbols.isInterface(t));
		if (this.superTypes.length === 0) {
			this.key = this.makeKey(type);
		} else {
			this.key = this.makeKey([type, ...this.superTypes]);
		}
	}

	public emit(): void {
		this.addLine(`interface ${this.name}${this.getTypeParameters()} {`);
		this.increaseIndent();
		if (this.type.members !== undefined) {
			Symbols.fillSources(this.additionalSources, this.type);
			this.processMembers(this.type.members);
		}
		for (let i = this.superTypes.length - 1; i >= 0; i--) {
			const superType = this.superTypes[i];
			if (superType.members !== undefined) {
				Symbols.fillSources(this.additionalSources, superType);
				this.processMembers(superType.members);
			}
		}
		this.decreaseIndent();
		this.addLine('}');
	}
}

class EnumEmitter extends AbstractEmitter {

	private readonly type: tt.Symbol;
	private readonly name: string;

	public readonly key: string | undefined;

	constructor(context: RequestContext, source: tt.SourceFile, type: tt.Symbol, name: string) {
		super(context, source);
		this.type = type;
		this.name = name;
		this.key = this.makeKey(type);
	}

	public emit(): void {
		this.addLine(`${Symbols.isConstEnum(this.type) ? 'const ' : ''}enum ${this.name} {`);
		this.increaseIndent();
		if (this.type.exports !== undefined) {
			let index = 0;
			const last = this.type.exports.size - 1;
			for (const [_name, member] of this.type.exports) {
				const declarations = member.declarations;
				if (declarations === undefined) {
					continue;
				}
				const declaration = declarations[0];
				if (ts.isEnumMember(declaration)) {
					const lines = Nodes.getLines(declaration, this.context.includeDocumentation);
					if (index < last) {
						lines[lines.length - 1] += ',';
					}
					this.addLines(lines);
				}
				index++;
			}
		}
		this.decreaseIndent();
		this.addLine('}');
	}
}

class TypeLiteralEmitter extends TypeEmitter {

	public readonly key: string | undefined;

	constructor(context: RequestContext, source: tt.SourceFile, type: tt.Symbol, name: string) {
		super(context, source, type, name);
	}

	public emit(): void {
		this.addLine(`type ${this.name} = {`);
		this.increaseIndent();
		if (this.type.members !== undefined) {
			this.processMembers(this.type.members);
		}
		this.decreaseIndent();
		this.addLine('}');
	}
}

class FunctionEmitter extends AbstractEmitter {

	private readonly func: tt.Symbol;
	private readonly name: string;

	constructor(context: RequestContext, source: tt.SourceFile, func: tt.Symbol, name?: string) {
		super(context, source);
		this.func = func;
		this.name = name ?? func.getName();
	}

	public get key(): string | undefined {
		return undefined;
	}

	public emit(currentSourceFile: tt.SourceFile): void {
		const declarations = this.func.declarations;
		if (declarations !== undefined) {
			for (const declaration of declarations) {
				const fileName = declaration.getSourceFile().fileName;
				if (fileName === currentSourceFile.fileName) {
					continue;
				}
				if (ts.isFunctionDeclaration(declaration)) {
					this.addFunctionDeclaration(declaration, this.name, 'declare');
					this.additionalSources.add(fileName);
				}
			}
		}
	}
}


class ModuleEmitter extends AbstractEmitter {

	private readonly module: tt.Symbol;
	private readonly name: string;

	constructor(context: RequestContext, source: tt.SourceFile, module: tt.Symbol, name?: string) {
		super(context, source);
		this.module = module;
		this.name = name ?? module.getName();
	}

	public get key(): string | undefined {
		return undefined;
	}

	public emit(currentSourceFile: tt.SourceFile): void {
		this.addLine(`declare namespace ${this.name} {`);
		this.increaseIndent();
		const exports = this.module.exports;
		if (exports !== undefined) {
			this.addExports(exports, currentSourceFile);
		}
		this.decreaseIndent();
		this.addLine('}');
	}

	private addExports(members: tt.SymbolTable, currentSourceFile: tt.SourceFile): void {
		for (const [_name, member] of members) {
			const declarations = member.declarations;
			if (declarations === undefined) {
				continue;
			}
			// For now we only emit function declarations. We could also emit variable declarations.
			if (Symbols.isFunction(member)) {
				for (const declaration of declarations) {
					const fileName = declaration.getSourceFile().fileName;
					if (fileName === currentSourceFile.fileName) {
						continue;
					}
					if (ts.isFunctionDeclaration(declaration)) {
						this.addFunctionDeclaration(declaration, undefined, 'declare');
						this.additionalSources.add(fileName);
					}
				}
			}
		}
	}
}

export class CodeSnippetBuilder extends ProgramContext implements SnippetProvider {

	private readonly lines: string[];
	private source: string | undefined;
	private readonly additionalSources: Set<string>;
	private indent: number = 0;

	private readonly context: RequestContext;
	private readonly symbols: Symbols;
	private readonly currentSourceFile: tt.SourceFile;

	constructor(context: RequestContext, symbols: Symbols, currentSourceFile: tt.SourceFile) {
		super();
		this.lines = [];
		this.source = undefined;
		this.additionalSources = new Set();
		this.context = context;
		this.symbols = symbols;
		this.currentSourceFile = currentSourceFile;
	}

	protected override getSymbolInfo(symbol: tt.Symbol): { skip: true } | { skip: false; primary: tt.SourceFile } {
		const result = super.getSymbolInfo(symbol);
		if (result.skip === false && result.primary.fileName === this.currentSourceFile.fileName) {
			return { skip: true };
		}
		return result;
	}


	protected increaseIndent(): void {
		this.indent++;
	}

	protected decreaseIndent(): void {
		this.indent--;
	}

	protected getProgram(): tt.Program {
		return this.symbols.getProgram();
	}

	private addSource(source: string): void {
		if (this.source === undefined) {
			this.source = source;
		} else {
			this.additionalSources.add(source);
		}
	}

	private addAdditionalSource(sources: Set<string> | undefined): void {
		if (sources === undefined) {
			return;
		}
		for (const source of sources) {
			this.additionalSources.add(source);
		}
	}

	public isEmpty(): boolean {
		return this.lines.length === 0 || this.source === undefined;
	}

	public snippet(key: string | undefined): CodeSnippet {
		if (this.source === undefined) {
			throw new RecoverableError('No source', RecoverableError.NoSourceFile);
		}
		this.additionalSources.delete(this.source);
		return CodeSnippet.create(key, this.source, this.additionalSources.size === 0 ? undefined : [...this.additionalSources], this.lines.join('\n'));
	}

	public addDeclaration(declaration: tt.Declaration): void {
		const sourceFile = declaration.getSourceFile();
		if (sourceFile.fileName === this.currentSourceFile.fileName || this.skipDeclaration(declaration, sourceFile)) {
			return;
		}
		this.addLines(Nodes.getLines(declaration, this.context.includeDocumentation, sourceFile));
		this.addSource(sourceFile.fileName);
	}

	public addLines(lines: string[]): void {
		if (lines.length === 0) {
			return;
		}
		if (this.indent === 0) {
			this.lines.push(...lines);
		} else {
			this.lines.push(...lines.map(line => `${'\t'.repeat(this.indent)}${line}`));
		}
	}

	public addClassSymbol(clazz: tt.Symbol, name: string, includeSuperClasses: boolean = true, includePrivates: boolean = false): void {
		if (!Symbols.isClass(clazz)) {
			return;
		}
		const info = this.getSymbolInfo(clazz);
		if (info.skip) {
			return;
		}
		this.addEmitter(new ClassEmitter(this.context, this.symbols, info.primary, clazz, name, includeSuperClasses, includePrivates));
	}

	public addTypeLiteralSymbol(type: tt.Symbol, name: string): void {
		if (!Symbols.isTypeLiteral(type)) {
			return;
		}
		const info = this.getSymbolInfo(type);
		if (info.skip) {
			return;
		}
		this.addEmitter(new TypeLiteralEmitter(this.context, info.primary, type, name));
	}

	public addInterfaceSymbol(iface: tt.Symbol, name: string): void {
		if (!Symbols.isInterface(iface)) {
			return;
		}
		const info = this.getSymbolInfo(iface);
		if (info.skip) {
			return;
		}
		this.addEmitter(new InterfaceEmitter(this.context, this.symbols, info.primary, iface, name));
	}

	public addTypeAliasSymbol(symbol: tt.Symbol, _name: string): void {
		if (!Symbols.isTypeAlias(symbol)) {
			return;
		}
		// This should not happens since we flatten the type aliases in the symbols.
	}

	public addEnumSymbol(enm: tt.Symbol, name: string): void {
		if (!Symbols.isEnum(enm)) {
			return;
		}
		const info = this.getSymbolInfo(enm);
		if (info.skip) {
			return;
		}
		this.addEmitter(new EnumEmitter(this.context, info.primary, enm, name));
	}

	public addFunctionSymbol(func: tt.Symbol, name?: string): void {
		if (!Symbols.isFunction(func)) {
			return;
		}
		const info = this.getSymbolInfo(func);
		if (info.skip) {
			return;
		}
		this.addEmitter(new FunctionEmitter(this.context, info.primary, func, name));
	}

	public addModuleSymbol(module: tt.Symbol, name?: string): void {
		if (!Symbols.isValueModule(module)) {
			return;
		}
		const info = this.getSymbolInfo(module);
		if (info.skip) {
			return;
		}
		this.addEmitter(new ModuleEmitter(this.context, info.primary, module, name));
	}

	public addTypeSymbol(type: tt.Symbol, name?: string): void {
		if (name === undefined && Symbols.isInternal(type)) {
			return;
		}
		const symbolName = name ?? type.getName();
		if (Symbols.isClass(type)) {
			this.addClassSymbol(type, symbolName);
		} else if (Symbols.isInterface(type)) {
			this.addInterfaceSymbol(type, symbolName);
		} else if (Symbols.isTypeAlias(type)) {
			this.addTypeAliasSymbol(type, symbolName);
		} else if (Symbols.isEnum(type)) {
			this.addEnumSymbol(type, symbolName);
		} else if (Symbols.isFunction(type)) {
			this.addFunctionSymbol(type, symbolName);
		} else if (Symbols.isValueModule(type)) {
			this.addModuleSymbol(type, symbolName);
		} else if (Symbols.isTypeLiteral(type) && symbolName !== undefined) {
			this.addTypeLiteralSymbol(type, symbolName);
		}
	}

	private addEmitter(emitter: AbstractEmitter): void {
		let lines: string[] | undefined;
		let uri: string | undefined;
		let additionalUris: Set<string> | undefined;
		const session = this.context.session;
		if (emitter.key !== undefined) {
			const code = session.getCachedCode(emitter.key);
			if (code !== undefined) {
				lines = code.value;
				uri = code.uri;
				additionalUris = code.additionalUris;
			}
		}
		if (lines === undefined || uri === undefined) {
			emitter.emit(this.currentSourceFile);
			lines = emitter.getLines();
			uri = emitter.source;
			additionalUris = emitter.getAdditionalSources();
			if (emitter.key !== undefined) {
				session.cacheCode(emitter.key, { value: lines, uri, additionalUris });
			}
		}
		if (this.indent === 0) {
			this.lines.push(...lines);
		} else {
			this.lines.push(...lines.map(line => `${'\t'.repeat(this.indent)}${line}`));
		}
		this.addSource(uri);
		this.addAdditionalSource(additionalUris);
	}
}