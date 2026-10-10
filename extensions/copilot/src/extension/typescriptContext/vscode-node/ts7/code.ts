/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SymbolFlags, type Project, type Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import {
	ModifierFlags,
	getLeadingCommentRanges,
	isCallSignatureDeclaration,
	isClassDeclaration,
	isConstructorDeclaration,
	isEnumDeclaration,
	isEnumMember,
	isFunctionDeclaration,
	isGetAccessorDeclaration,
	isInterfaceDeclaration,
	isMethodDeclaration,
	isMethodSignatureDeclaration,
	isPropertyDeclaration,
	isPropertySignatureDeclaration,
	isSetAccessorDeclaration,
	isTypeAliasDeclaration,
	SyntaxKind,
	type CallSignatureDeclaration,
	type ConstructorDeclaration,
	type FunctionDeclaration,
	type GetAccessorDeclaration,
	type MethodDeclaration,
	type MethodSignatureDeclaration,
	type ModifierLike,
	type Node,
	type NodeArray,
	type PropertyDeclaration,
	type PropertySignatureDeclaration,
	type SetAccessorDeclaration,
	type SourceFile,
	type TypeParameterDeclaration,
} from '@typescript/native/unstable/ast';
import * as protocol from '../../common/serverProtocol';
import type { RequestContext } from './contextProvider';
import { ProgramContext, type SnippetProvider } from './types';
import { Symbols } from './typescripts';

namespace Nodes {
	export function getLines(node: Node, includeDocumentation: boolean, sourceFile: SourceFile = node.getSourceFile()): string[] {
		const textStartPosition = node.getStart(sourceFile, includeDocumentation);
		const startRange = sourceFile.getLineAndCharacterOfPosition(textStartPosition);
		const lines = sourceFile.text.substring(textStartPosition, node.getEnd()).split(/\r?\n/g);
		if (startRange.character > 0) {
			const lineStartPosition = sourceFile.getPositionOfLineAndCharacter(startRange.line, 0);
			const indent = sourceFile.text.substring(lineStartPosition, textStartPosition);
			stripIndent(lines, indent);
		}
		trimLines(lines);
		return lines;
	}

	export function getDocumentation(node: Node): string[] | undefined {
		const fullText = node.getFullText();
		const range = getLeadingCommentRanges(fullText, 0)?.at(-1);
		if (range === undefined) {
			return undefined;
		}
		const lines = fullText.substring(range.pos, range.end).trim().split(/\r?\n/);
		trimLines(lines);
		if (lines.length > 1) {
			const match = lines[1].match(/^\s+/);
			if (match !== null) {
				stripIndent(lines, match[0], 0);
			}
		}
		return lines;
	}

	function stripIndent(lines: string[], indent: string, start: number = 1): void {
		if (lines.slice(start).every(line => line.startsWith(indent))) {
			for (let index = start; index < lines.length; index++) {
				lines[index] = lines[index].substring(indent.length);
			}
		}
	}

	function trimLines(lines: string[]): void {
		while (lines.length > 0 && lines[0].trim().length === 0) {
			lines.shift();
		}
		while (lines.length > 0 && lines.at(-1)?.trim().length === 0) {
			lines.pop();
		}
	}
}

abstract class AbstractEmitter {
	protected readonly context: RequestContext;

	private readonly lines: string[] = [];
	private indent: number = 0;

	public readonly source: string;
	protected readonly additionalSources: Set<string> = new Set();

	constructor(context: RequestContext, source: SourceFile) {
		this.context = context;
		this.source = source.fileName;
	}

	public abstract readonly key: string | undefined;

	public async initialize(): Promise<void> {
	}

	public abstract emit(currentSourceFile: SourceFile): Promise<void>;

	protected async makeKey(symbols: NativeSymbol | readonly NativeSymbol[]): Promise<string | undefined> {
		const values = Array.isArray(symbols) ? symbols : [symbols];
		const keys: string[] = [];
		for (const symbol of values) {
			const key = await this.context.getSymbols(this.context.session.project).createKey(symbol);
			if (key === undefined) {
				return undefined;
			}
			keys.push(key);
		}
		return keys.length === 0 ? undefined : keys.join(';');
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
		this.lines.push(this.indent === 0 ? line : `${'\t'.repeat(this.indent)}${line}`);
	}

	protected addLines(lines: readonly string[]): void {
		for (const line of lines) {
			this.addLine(line);
		}
	}

	protected addConstructorDeclaration(declaration: ConstructorDeclaration): void {
		this.addDocumentation(declaration);
		const modifiers = this.getModifiers(declaration.modifiers);
		const parameters = declaration.parameters.map(parameter => parameter.getText()).join(', ');
		this.addLine(`${modifiers}constructor(${parameters});`);
	}

	protected addPropertyDeclaration(declaration: PropertyDeclaration | PropertySignatureDeclaration): void {
		this.addLines(Nodes.getLines(declaration, this.context.includeDocumentation));
	}

	protected addMethodDeclaration(declaration: MethodDeclaration | MethodSignatureDeclaration): void {
		this.addDocumentation(declaration);
		const modifiers = this.getModifiers(declaration.modifiers);
		const typeParameters = this.getTypeParameters(declaration.typeParameters);
		const parameters = declaration.parameters.map(parameter => parameter.getText()).join(', ');
		const returnType = declaration.type === undefined ? '' : `: ${declaration.type.getText()}`;
		this.addLine(`${modifiers}${declaration.name.getText()}${typeParameters}(${parameters})${returnType};`);
	}

	protected addCallSignatureDeclaration(declaration: CallSignatureDeclaration): void {
		this.addDocumentation(declaration);
		const typeParameters = this.getTypeParameters(declaration.typeParameters);
		const parameters = declaration.parameters.map(parameter => parameter.getText()).join(', ');
		const returnType = declaration.type === undefined ? '' : `: ${declaration.type.getText()}`;
		this.addLine(`${typeParameters}(${parameters})${returnType};`);
	}

	protected addGetAccessorDeclaration(declaration: GetAccessorDeclaration): void {
		this.addAccessorDeclaration(declaration, 'get');
	}

	protected addSetAccessorDeclaration(declaration: SetAccessorDeclaration): void {
		this.addAccessorDeclaration(declaration, 'set');
	}

	private addAccessorDeclaration(declaration: GetAccessorDeclaration | SetAccessorDeclaration, prefix: 'get' | 'set'): void {
		this.addDocumentation(declaration);
		const modifiers = this.getModifiers(declaration.modifiers);
		const parameters = declaration.parameters.map(parameter => parameter.getText()).join(', ');
		const returnType = declaration.type === undefined ? '' : `: ${declaration.type.getText()}`;
		this.addLine(`${modifiers}${prefix} ${declaration.name.getText()}(${parameters})${returnType};`);
	}

	protected addFunctionDeclaration(declaration: FunctionDeclaration, name?: string, ensureModifier?: string): void {
		name ??= declaration.name?.getText() ?? '';
		this.addDocumentation(declaration);
		const modifiers = this.getModifiers(declaration.modifiers, ensureModifier, true);
		const typeParameters = this.getTypeParameters(declaration.typeParameters);
		const parameters = declaration.parameters.map(parameter => parameter.getText()).join(', ');
		const returnType = declaration.type === undefined ? '' : `: ${declaration.type.getText()}`;
		this.addLine(`${modifiers}function ${name}${typeParameters}(${parameters})${returnType};`);
	}

	protected addDocumentation(declaration: Node): void {
		if (!this.context.includeDocumentation) {
			return;
		}
		const documentation = Nodes.getDocumentation(declaration);
		if (documentation !== undefined) {
			this.addLines(documentation);
		}
	}

	protected getModifiers(modifiers: NodeArray<ModifierLike> | undefined, prefix?: string, skipFunctionModifiers: boolean = false): string {
		const result: string[] = [];
		if (prefix !== undefined) {
			result.push(prefix);
		}
		for (const modifier of modifiers ?? []) {
			if (skipFunctionModifiers && (modifier.kind === SyntaxKind.AsyncKeyword || modifier.kind === SyntaxKind.DeclareKeyword || modifier.kind === SyntaxKind.ExportKeyword)) {
				continue;
			}
			result.push(modifier.getText());
		}
		return result.length === 0 ? '' : `${result.join(' ')} `;
	}

	protected getTypeParameters(typeParameters: NodeArray<TypeParameterDeclaration> | undefined): string {
		return typeParameters === undefined ? '' : `<${typeParameters.map(parameter => parameter.getText()).join(', ')}>`;
	}
}

abstract class TypeEmitter extends AbstractEmitter {
	protected readonly symbols: Symbols;
	protected readonly type: NativeSymbol;
	protected readonly name: string;

	private readonly seen: Set<string> = new Set();

	constructor(context: RequestContext, symbols: Symbols, source: SourceFile, type: NativeSymbol, name: string) {
		super(context, source);
		this.symbols = symbols;
		this.type = type;
		this.name = name;
	}

	protected async processMembers(members: ReadonlyMap<string, NativeSymbol>, includePrivates: boolean = true): Promise<void> {
		for (const [name, member] of members) {
			if (!this.seen.has(name)) {
				this.seen.add(name);
				await this.processMember(member, includePrivates);
			}
		}
	}

	protected async processMember(member: NativeSymbol, includePrivates: boolean): Promise<void> {
		for (const declaration of await this.symbols.getDeclarations(member)) {
			if (!includePrivates && this.hasModifier(declaration, ModifierFlags.Private)) {
				continue;
			}
			if (isPropertyDeclaration(declaration) || isPropertySignatureDeclaration(declaration)) {
				this.addPropertyDeclaration(declaration);
				this.additionalSources.add(declaration.getSourceFile().fileName);
				break;
			} else if (isMethodDeclaration(declaration) || isMethodSignatureDeclaration(declaration)) {
				this.addMethodDeclaration(declaration);
			} else if (isGetAccessorDeclaration(declaration)) {
				this.addGetAccessorDeclaration(declaration);
			} else if (isSetAccessorDeclaration(declaration)) {
				this.addSetAccessorDeclaration(declaration);
			} else if (isCallSignatureDeclaration(declaration)) {
				this.addCallSignatureDeclaration(declaration);
			} else if (isConstructorDeclaration(declaration)) {
				this.addConstructorDeclaration(declaration);
			} else {
				continue;
			}
			this.additionalSources.add(declaration.getSourceFile().fileName);
		}
	}

	protected async getTypeParametersFromSymbol(): Promise<string> {
		const declaration = (await this.symbols.getDeclarations(this.type))[0];
		if (declaration !== undefined && (isClassDeclaration(declaration) || isInterfaceDeclaration(declaration) || isTypeAliasDeclaration(declaration))) {
			return this.getTypeParameters(declaration.typeParameters);
		}
		return '';
	}

	private hasModifier(node: Node, modifier: ModifierFlags): boolean {
		return 'modifierFlags' in node && typeof node.modifierFlags === 'number' && (node.modifierFlags & modifier) !== 0;
	}
}

class ClassEmitter extends TypeEmitter {
	private readonly includeSuperClasses: boolean;
	private readonly includePrivates: boolean;
	private superClasses: readonly NativeSymbol[] | undefined;

	public key: string | undefined;

	constructor(context: RequestContext, symbols: Symbols, source: SourceFile, type: NativeSymbol, name: string, includeSuperClasses: boolean, includePrivates: boolean) {
		super(context, symbols, source, type, name);
		this.includeSuperClasses = includeSuperClasses;
		this.includePrivates = includePrivates;
	}

	public override async initialize(): Promise<void> {
		if (this.includeSuperClasses) {
			this.superClasses = (await this.symbols.getAllSuperSymbols(this.type)).filter(candidate => (candidate.flags & SymbolFlags.Class) !== 0);
			this.key = await this.makeKey([this.type, ...this.superClasses]);
		} else {
			this.key = await this.makeKey(this.type);
		}
	}

	public async emit(): Promise<void> {
		this.addLine(`declare class ${this.name}${await this.getTypeParametersFromSymbol()} {`);
		this.increaseIndent();
		await this.processMembers(await this.type.getMembers(), this.includePrivates);
		if (this.superClasses !== undefined) {
			for (let index = this.superClasses.length - 1; index >= 0; index--) {
				await this.processMembers(await this.superClasses[index].getMembers(), false);
			}
		}
		this.decreaseIndent();
		this.addLine('}');
	}
}

class InterfaceEmitter extends TypeEmitter {
	private superTypes: readonly NativeSymbol[] = [];

	public key: string | undefined;

	public override async initialize(): Promise<void> {
		this.superTypes = (await this.symbols.getAllSuperSymbols(this.type)).filter(candidate => (candidate.flags & SymbolFlags.Interface) !== 0);
		this.key = await this.makeKey([this.type, ...this.superTypes]);
	}

	public async emit(): Promise<void> {
		this.addLine(`interface ${this.name}${await this.getTypeParametersFromSymbol()} {`);
		this.increaseIndent();
		await this.processMembers(await this.type.getMembers());
		for (let index = this.superTypes.length - 1; index >= 0; index--) {
			await this.processMembers(await this.superTypes[index].getMembers());
		}
		this.decreaseIndent();
		this.addLine('}');
	}
}

class EnumEmitter extends AbstractEmitter {
	private readonly type: NativeSymbol;
	private readonly name: string;
	private readonly declaration: Node | undefined;

	public key: string | undefined;

	constructor(context: RequestContext, source: SourceFile, type: NativeSymbol, name: string, declaration: Node | undefined) {
		super(context, source);
		this.type = type;
		this.name = name;
		this.declaration = declaration;
	}

	public override async initialize(): Promise<void> {
		this.key = await this.makeKey(this.type);
	}

	public async emit(): Promise<void> {
		const prefix = (this.type.flags & SymbolFlags.ConstEnum) !== 0 ? 'const ' : '';
		this.addLine(`${prefix}enum ${this.name} {`);
		this.increaseIndent();
		if (this.declaration !== undefined && isEnumDeclaration(this.declaration)) {
			for (let index = 0; index < this.declaration.members.length; index++) {
				const member = this.declaration.members[index];
				if (!isEnumMember(member)) {
					continue;
				}
				const lines = Nodes.getLines(member, this.context.includeDocumentation, this.declaration.getSourceFile());
				if (index < this.declaration.members.length - 1 && lines.length > 0) {
					lines[lines.length - 1] += ',';
				}
				this.addLines(lines);
			}
		}
		this.decreaseIndent();
		this.addLine('}');
	}
}

class TypeLiteralEmitter extends TypeEmitter {
	public key: string | undefined;

	public override async initialize(): Promise<void> {
		this.key = await this.makeKey(this.type);
	}

	public async emit(): Promise<void> {
		this.addLine(`type ${this.name} = {`);
		this.increaseIndent();
		await this.processMembers(await this.type.getMembers());
		this.decreaseIndent();
		this.addLine('}');
	}
}

class FunctionEmitter extends AbstractEmitter {
	private readonly symbols: Symbols;
	private readonly func: NativeSymbol;
	private readonly name: string;

	public readonly key: string | undefined = undefined;

	constructor(context: RequestContext, symbols: Symbols, source: SourceFile, func: NativeSymbol, name?: string) {
		super(context, source);
		this.symbols = symbols;
		this.func = func;
		this.name = name ?? func.name;
	}

	public async emit(currentSourceFile: SourceFile): Promise<void> {
		for (const declaration of await this.symbols.getDeclarations(this.func)) {
			if (isFunctionDeclaration(declaration) && declaration.getSourceFile().path !== currentSourceFile.path) {
				this.addFunctionDeclaration(declaration, this.name, 'declare');
				this.additionalSources.add(declaration.getSourceFile().fileName);
			}
		}
	}
}

class ModuleEmitter extends AbstractEmitter {
	private readonly symbols: Symbols;
	private readonly module: NativeSymbol;
	private readonly name: string;

	public readonly key: string | undefined = undefined;

	constructor(context: RequestContext, symbols: Symbols, source: SourceFile, module: NativeSymbol, name?: string) {
		super(context, source);
		this.symbols = symbols;
		this.module = module;
		this.name = name ?? module.name;
	}

	public async emit(currentSourceFile: SourceFile): Promise<void> {
		this.addLine(`declare namespace ${this.name} {`);
		this.increaseIndent();
		await this.addExports(await this.module.getExports(), currentSourceFile);
		this.decreaseIndent();
		this.addLine('}');
	}

	private async addExports(members: ReadonlyMap<string, NativeSymbol>, currentSourceFile: SourceFile): Promise<void> {
		for (const member of members.values()) {
			if ((member.flags & SymbolFlags.Function) === 0) {
				continue;
			}
			for (const declaration of await this.symbols.getDeclarations(member)) {
				if (isFunctionDeclaration(declaration) && declaration.getSourceFile().path !== currentSourceFile.path) {
					this.addFunctionDeclaration(declaration);
					this.additionalSources.add(declaration.getSourceFile().fileName);
				}
			}
		}
	}
}

export class CodeSnippetBuilder extends ProgramContext implements SnippetProvider {
	private readonly context: RequestContext;
	private readonly symbols: Symbols;
	private readonly currentSourceFile: SourceFile;
	private readonly lines: string[] = [];
	private readonly additionalSources: Set<string> = new Set();
	private source: string | undefined;
	private indent: number = 0;

	constructor(context: RequestContext, symbols: Symbols, currentSourceFile: SourceFile) {
		super();
		this.context = context;
		this.symbols = symbols;
		this.currentSourceFile = currentSourceFile;
	}

	public isEmpty(): boolean {
		return this.lines.length === 0 || this.source === undefined;
	}

	public snippet(key: string | undefined): protocol.CodeSnippet {
		if (this.source === undefined) {
			throw new Error('No source');
		}
		this.additionalSources.delete(this.source);
		return protocol.CodeSnippet.create(key, this.source, this.additionalSources.size === 0 ? undefined : [...this.additionalSources], this.lines.join('\n'));
	}

	public async addDeclaration(declaration: Node): Promise<void> {
		const sourceFile = declaration.getSourceFile();
		if (!await this.canUseSourceFile(sourceFile)) {
			return;
		}
		this.addLines(Nodes.getLines(declaration, this.context.includeDocumentation, sourceFile));
		this.addSource(sourceFile.fileName);
	}

	public addLines(lines: readonly string[]): void {
		this.lines.push(...(this.indent === 0 ? lines : lines.map(line => `${'\t'.repeat(this.indent)}${line}`)));
	}

	public async addClassSymbol(clazz: NativeSymbol, name: string, includeSuperClasses: boolean = true, includePrivates: boolean = false): Promise<void> {
		if ((clazz.flags & SymbolFlags.Class) === 0) {
			return;
		}
		const info = await this.symbols.getSymbolInfo(clazz, this.currentSourceFile);
		if (info !== undefined) {
			await this.addEmitter(new ClassEmitter(this.context, this.symbols, info.primary, clazz, name, includeSuperClasses, includePrivates));
		}
	}

	public async addTypeLiteralSymbol(type: NativeSymbol, name: string): Promise<void> {
		if ((type.flags & SymbolFlags.TypeLiteral) === 0) {
			return;
		}
		const info = await this.symbols.getSymbolInfo(type, this.currentSourceFile);
		if (info !== undefined) {
			await this.addEmitter(new TypeLiteralEmitter(this.context, this.symbols, info.primary, type, name));
		}
	}

	public async addInterfaceSymbol(iface: NativeSymbol, name: string): Promise<void> {
		if ((iface.flags & SymbolFlags.Interface) === 0) {
			return;
		}
		const info = await this.symbols.getSymbolInfo(iface, this.currentSourceFile);
		if (info !== undefined) {
			await this.addEmitter(new InterfaceEmitter(this.context, this.symbols, info.primary, iface, name));
		}
	}

	public async addTypeAliasSymbol(_symbol: NativeSymbol, _name: string): Promise<void> {
	}

	public async addEnumSymbol(enm: NativeSymbol, name: string): Promise<void> {
		if ((enm.flags & (SymbolFlags.RegularEnum | SymbolFlags.ConstEnum)) === 0) {
			return;
		}
		const info = await this.symbols.getSymbolInfo(enm, this.currentSourceFile);
		if (info !== undefined) {
			await this.addEmitter(new EnumEmitter(this.context, info.primary, enm, name, info.declarations.find(isEnumDeclaration)));
		}
	}

	public async addFunctionSymbol(func: NativeSymbol, name?: string): Promise<void> {
		if ((func.flags & SymbolFlags.Function) === 0) {
			return;
		}
		const info = await this.symbols.getSymbolInfo(func, this.currentSourceFile);
		if (info !== undefined) {
			await this.addEmitter(new FunctionEmitter(this.context, this.symbols, info.primary, func, name));
		}
	}

	public async addModuleSymbol(module: NativeSymbol, name?: string): Promise<void> {
		if ((module.flags & SymbolFlags.ValueModule) === 0) {
			return;
		}
		const info = await this.symbols.getSymbolInfo(module, this.currentSourceFile);
		if (info !== undefined) {
			await this.addEmitter(new ModuleEmitter(this.context, this.symbols, info.primary, module, name));
		}
	}

	public async addTypeSymbol(type: NativeSymbol, name?: string): Promise<void> {
		if (name === undefined && this.isInternal(type)) {
			return;
		}
		const symbolName = name ?? type.name;
		if ((type.flags & SymbolFlags.Class) !== 0) {
			await this.addClassSymbol(type, symbolName);
		} else if ((type.flags & SymbolFlags.Interface) !== 0) {
			await this.addInterfaceSymbol(type, symbolName);
		} else if ((type.flags & SymbolFlags.TypeAlias) !== 0) {
			await this.addTypeAliasSymbol(type, symbolName);
		} else if ((type.flags & (SymbolFlags.RegularEnum | SymbolFlags.ConstEnum)) !== 0) {
			await this.addEnumSymbol(type, symbolName);
		} else if ((type.flags & SymbolFlags.Function) !== 0) {
			await this.addFunctionSymbol(type, symbolName);
		} else if ((type.flags & SymbolFlags.ValueModule) !== 0) {
			await this.addModuleSymbol(type, symbolName);
		} else if ((type.flags & SymbolFlags.TypeLiteral) !== 0) {
			await this.addTypeLiteralSymbol(type, symbolName);
		}
	}

	protected override getProject(): Project {
		return this.symbols.getProject();
	}

	protected override getSymbols(): Symbols {
		return this.symbols;
	}

	private async addEmitter(emitter: AbstractEmitter): Promise<void> {
		await emitter.initialize();
		let lines: string[] | undefined;
		let source: string | undefined;
		let additionalSources: Set<string> | undefined;
		if (emitter.key !== undefined) {
			const cached = this.context.session.getCachedCode(emitter.key);
			if (cached !== undefined) {
				lines = cached.value;
				source = cached.uri;
				additionalSources = cached.additionalUris;
			}
		}
		if (lines === undefined || source === undefined) {
			await emitter.emit(this.currentSourceFile);
			lines = emitter.getLines();
			source = emitter.source;
			additionalSources = emitter.getAdditionalSources();
			if (emitter.key !== undefined) {
				this.context.session.cacheCode(emitter.key, { value: lines, uri: source, additionalUris: additionalSources });
			}
		}
		this.addLines(lines);
		this.addSource(source);
		this.addAdditionalSource(additionalSources);
	}

	private async canUseSourceFile(sourceFile: SourceFile): Promise<boolean> {
		if (sourceFile.path === this.currentSourceFile.path) {
			return false;
		}
		const metadata = await this.symbols.getProject().program.getSourceFileMetadataByPath(sourceFile.path);
		return !metadata?.isDefaultLibrary && !metadata?.isFromExternalLibrary;
	}

	private isInternal(symbol: NativeSymbol): boolean {
		return symbol.name === '__type' || symbol.name === '__class' || symbol.name === '__object';
	}

	private addSource(source: string): void {
		if (this.source === undefined) {
			this.source = source;
		} else if (this.source !== source) {
			this.additionalSources.add(source);
		}
	}

	private addAdditionalSource(sources: Set<string> | undefined): void {
		if (sources !== undefined) {
			for (const source of sources) {
				this.additionalSources.add(source);
			}
		}
	}
}
