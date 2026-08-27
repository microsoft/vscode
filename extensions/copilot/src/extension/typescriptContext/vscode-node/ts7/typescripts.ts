/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';

import { Symbol as NativeSymbol, SymbolFlags, type NodeHandle, type Program, type Project, type Type, type DocumentPosition } from '@typescript/native/unstable/async';
import {
	findPrecedingToken,
	getTokenAtPosition,
	isBlock,
	isClassDeclaration,
	isInterfaceDeclaration,
	isModuleBlock,
	isSourceFile,
	isTypeAliasDeclaration,
	isTypeReferenceNode,
	isExpressionWithTypeArguments,
	SyntaxKind,
	type Node,
	type SourceFile,
	type TypeNode,
	type DeclarationBase
} from '@typescript/native/unstable/ast';
import type * as vscode from 'vscode';

export class OperationCanceledException extends Error {
	constructor() {
		super('TypeScript 7 context request cancelled');
	}
}

export class CancellationTokenWithTimer {
	private readonly cancellationToken: vscode.CancellationToken;
	private readonly end: number;

	constructor(cancellationToken: vscode.CancellationToken, startTime: number, budget: number, isDebugging: boolean = false) {
		this.cancellationToken = cancellationToken;
		this.end = isDebugging ? Number.MAX_VALUE : startTime + budget;
	}

	public isCancellationRequested(): boolean {
		return this.cancellationToken.isCancellationRequested || this.isTimedOut();
	}

	public isTimedOut(): boolean {
		return Date.now() > this.end;
	}

	public throwIfCancellationRequested(): void {
		if (this.isCancellationRequested()) {
			throw new OperationCanceledException();
		}
	}
}

namespace tss {
	export type TokenInfo = {
		token: Node;
		touching?: Node;
		previous?: Node;
	};

	export function getRelevantTokens(sourceFile: SourceFile, position: number): TokenInfo {
		const token = getTokenAtPosition(sourceFile, position);
		const result: TokenInfo = { token };
		if (token.kind === SyntaxKind.EndOfFile) {
			result.previous = findPrecedingToken(sourceFile, position);
			return result;
		}

		const start = token.getStart(sourceFile);
		if (position > start) {
			result.touching = token;
		} else if (position < start) {
			let candidate: Node | undefined = token.parent;
			while (candidate !== undefined) {
				if (position >= candidate.getStart(sourceFile)) {
					result.touching = candidate;
					break;
				}
				candidate = candidate.parent;
			}
		}
		result.previous = findPrecedingToken(sourceFile, position);
		return result;
	}

	export namespace Nodes {
		export function getChildren(node: Node): readonly Node[] {
			if (isSourceFile(node)) {
				return node.statements;
			}
			const result: Node[] = [];
			node.forEachChild(child => {
				result.push(child);
				return undefined;
			});
			return result;
		}

		export function getTypeName(node: TypeNode): string | undefined {
			return isTypeReferenceNode(node) ? node.typeName.getText() : undefined;
		}

		export function getParentOfKind(node: Node, kind: SyntaxKind): Node | undefined {
			let current: Node | undefined = node;
			while (current !== undefined) {
				if (current.kind === kind) {
					return current;
				}
				current = current.parent;
			}
			return undefined;
		}

		export function getParentBlock(node: Node): Node | undefined {
			let current: Node | undefined = node;
			while (current !== undefined) {
				if (isBlock(current) || isModuleBlock(current) || isSourceFile(current)) {
					return current;
				}
				current = current.parent;
			}
			return undefined;
		}
	}

	export namespace StableSyntaxKinds {
		export function getPath(node: Node): number[] {
			const result: number[] = [];
			let current: Node | undefined = node;
			while (current !== undefined) {
				result.push(current.kind);
				if (isSourceFile(current)) {
					break;
				}
				current = current.parent;
			}
			return result;
		}
	}
}

export type TokenInfo = tss.TokenInfo;

export type DirectSuperSymbolInfo = {
	extends?: { symbol: NativeSymbol; name: string };
	implements?: { symbol: NativeSymbol; name: string }[];
};

export type SymbolInfo = {
	symbol: NativeSymbol;
	primary: SourceFile;
	declarations: readonly Node[];
};

export class Symbols {
	private readonly project: Project;
	private readonly token: CancellationTokenWithTimer;
	private readonly declarationCache: Map<number, Promise<readonly Node[]>> = new Map();

	constructor(project: Project, token: CancellationTokenWithTimer) {
		this.project = project;
		this.token = token;
	}

	public getProject(): Project {
		return this.project;
	}

	public getProgram(): Program {
		return this.project.program;
	}

	public getTypeChecker(): Project['checker'] {
		return this.project.checker;
	}

	public async isSourceFileFromLibrary(sourceFile: SourceFile): Promise<boolean> {
		this.token.throwIfCancellationRequested();
		const isDefaultLibrary = await this.project.program.isSourceFileDefaultLibrary(sourceFile);
		this.token.throwIfCancellationRequested();
		if (isDefaultLibrary) {
			return true;
		}
		const isExternalLibrary = await this.project.program.isSourceFileFromExternalLibrary(sourceFile);
		this.token.throwIfCancellationRequested();
		return isExternalLibrary;
	}

	public async getSymbolAtLocation(node: Node): Promise<NativeSymbol | undefined> {
		this.token.throwIfCancellationRequested();
		const result = await this.project.checker.getSymbolAtLocation(node);
		this.token.throwIfCancellationRequested();
		return result;
	}

	public async getSymbolsInScope(location: Node | DocumentPosition, meaning: SymbolFlags): Promise<readonly NativeSymbol[]> {
		interface CheckerWithSymbolsInScope {
			getSymbolsInScope(location: Node | DocumentPosition, meaning: SymbolFlags): readonly NativeSymbol[];
		}
		const checker = this.project.checker;
		if (typeof (checker as unknown as CheckerWithSymbolsInScope).getSymbolsInScope === 'function') {
			return (checker as unknown as CheckerWithSymbolsInScope).getSymbolsInScope(location, meaning);
		}
		return [];
	}

	public async getAliasedSymbol(symbol: NativeSymbol): Promise<NativeSymbol | undefined> {
		return Symbols.isAlias(symbol) ? this.getLeafSymbol(symbol) : symbol;
	}

	public async getAliasedSymbolAtLocation(node: Node): Promise<NativeSymbol | undefined> {
		const symbol = await this.getSymbolAtLocation(node);
		return symbol === undefined ? undefined : this.getAliasedSymbol(symbol);
	}

	public async getLeafSymbolAtLocation(node: Node): Promise<NativeSymbol | undefined> {
		const symbol = await this.getSymbolAtLocation(node);
		return symbol === undefined ? undefined : this.getLeafSymbol(symbol);
	}

	public async getLeafSymbol(initialSymbol: NativeSymbol): Promise<NativeSymbol> {
		let symbol = initialSymbol;
		let count = 0;
		while (Symbols.isAlias(symbol) && count++ < 10) {
			this.token.throwIfCancellationRequested();
			const candidate = await this.project.checker.getAliasedSymbol(symbol);
			this.token.throwIfCancellationRequested();
			if (candidate.id === symbol.id || await this.project.checker.isUnknownSymbol(candidate)) {
				break;
			}
			symbol = candidate;
		}
		while (Symbols.isTypeAlias(symbol) && count++ < 10) {
			const declarations = await this.getDeclarations(symbol);
			if (declarations.length !== 1 || !isTypeAliasDeclaration(declarations[0])) {
				break;
			}
			const candidate = await this.getSymbolAtLocation(declarations[0].type);
			if (candidate === undefined || candidate.id === symbol.id) {
				break;
			}
			symbol = candidate;
		}
		return symbol;
	}

	public getDeclarations(symbol: NativeSymbol): Promise<readonly Node[]> {
		let result = this.declarationCache.get(symbol.id);
		if (result === undefined) {
			result = this.resolveDeclarations(symbol.declarations);
			this.declarationCache.set(symbol.id, result);
		}
		return result;
	}

	public async getSymbolInfo(symbol: NativeSymbol, activeSourceFile?: SourceFile): Promise<SymbolInfo | undefined> {
		const declarations = await this.getDeclarations(symbol);
		if (declarations.length === 0) {
			return undefined;
		}
		let primary: SourceFile | undefined;
		for (const declaration of declarations) {
			const sourceFile = declaration.getSourceFile();
			primary ??= sourceFile;
			if (activeSourceFile !== undefined && sourceFile.path === activeSourceFile.path) {
				return undefined;
			}
			this.token.throwIfCancellationRequested();
			const metadata = await this.project.program.getSourceFileMetadataByPath(sourceFile.path);
			this.token.throwIfCancellationRequested();
			if (metadata?.isDefaultLibrary || metadata?.isFromExternalLibrary) {
				return undefined;
			}
		}
		return primary === undefined ? undefined : { symbol, primary, declarations };
	}

	public async getDirectSuperSymbols(symbol: NativeSymbol): Promise<DirectSuperSymbolInfo | undefined> {
		const result: DirectSuperSymbolInfo = {};
		for (const declaration of await this.getDeclarations(symbol)) {
			if (!isClassDeclaration(declaration) && !isInterfaceDeclaration(declaration)) {
				continue;
			}
			for (const heritageClause of declaration.heritageClauses ?? []) {
				for (const type of heritageClause.types) {
					const candidate = await (isExpressionWithTypeArguments(type) ? this.getLeafSymbolAtLocation(type.expression) : this.getLeafSymbolAtLocation(type.typeName));
					if (candidate === undefined) {
						continue;
					}
					const name = isExpressionWithTypeArguments(type) ? type.expression.getText() : type.typeName.getText();
					if (heritageClause.token === SyntaxKind.ExtendsKeyword && result.extends === undefined) {
						result.extends = { symbol: candidate, name };
					} else if (heritageClause.token === SyntaxKind.ImplementsKeyword) {
						(result.implements ??= []).push({ symbol: candidate, name });
					}
				}
			}
		}
		return result.extends === undefined && result.implements === undefined ? undefined : result;
	}

	public async getAllSuperTypes(symbol: NativeSymbol): Promise<readonly NativeSymbol[]> {
		return this.getAllSuperSymbols(symbol);
	}

	public async getAllSuperClasses(symbol: NativeSymbol): Promise<readonly NativeSymbol[]> {
		return (await this.getAllSuperSymbols(symbol)).filter(candidate => Symbols.isClass(candidate));
	}

	public async getAllSuperSymbols(symbol: NativeSymbol): Promise<readonly NativeSymbol[]> {
		const result: NativeSymbol[] = [];
		const seen = new Set<number>([symbol.id]);
		const queue: NativeSymbol[] = [symbol];
		while (queue.length > 0) {
			this.token.throwIfCancellationRequested();
			const current = queue.shift();
			if (current === undefined) {
				break;
			}
			const direct = await this.getDirectSuperSymbols(current);
			const candidates = direct === undefined ? [] : [direct.extends?.symbol, ...(direct.implements?.map(item => item.symbol) ?? [])];
			for (const candidate of candidates) {
				if (candidate === undefined || seen.has(candidate.id)) {
					continue;
				}
				seen.add(candidate.id);
				result.push(candidate);
				queue.push(candidate);
			}
		}
		return result;
	}

	public async getTypeSymbols(type: Type): Promise<readonly NativeSymbol[]> {
		const result: NativeSymbol[] = [];
		await this.collectTypeSymbols(result, new Set(), type);
		return result;
	}

	public async createKey(symbol: NativeSymbol): Promise<string | undefined>;
	public async createKey(declaration: DeclarationBase): Promise<string | undefined>;
	public async createKey(arg: NativeSymbol | DeclarationBase): Promise<string | undefined>
	{
		if (arg instanceof NativeSymbol) {
			const symbol = arg;
			const declarations = await this.getDeclarations(symbol);
			if (declarations.length === 0) {
				return undefined;
			}
			const fragments = declarations.map(declaration => ({
				f: declaration.getSourceFile().path,
				s: declaration.getStart(),
				e: declaration.getEnd(),
				k: declaration.kind,
			})).sort((first, second) => first.f.localeCompare(second.f) || first.s - second.s || first.e - second.e || first.k - second.k);
			const hash = createHash('md5'); // CodeQL [SM04514] Used only as a compact cache key, not for security.
			if ((symbol.flags & SymbolFlags.Transient) !== 0) {
				hash.update(JSON.stringify({ trans: true }));
			}
			hash.update(JSON.stringify(fragments));
			return hash.digest('base64');
		} else {
			const declaration = arg;
			const fragment = {
				f: declaration.getSourceFile().path,
				s: declaration.getStart(),
				e: declaration.getEnd(),
				k: declaration.kind,
			};
			const hash = createHash('md5'); // CodeQL [SM04514] Used only as a compact cache key, not for security.
			hash.update(JSON.stringify(fragment));
			return hash.digest('base64');
		}
	}

	public async getDeclaration<T extends Node>(symbol: NativeSymbol, kind: SyntaxKind): Promise<T | undefined> {
		return (await this.getDeclarations(symbol)).find(declaration => declaration.kind === kind) as T | undefined;
	}

	public static isFunctionScopedVariable(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.FunctionScopedVariable) !== 0;
	}

	public static isBlockScopedVariable(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.BlockScopedVariable) !== 0;
	}

	public static isConstructor(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Constructor) !== 0;
	}

	public static isMethod(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Method) !== 0;
	}

	public static isProperty(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Property) !== 0;
	}

	public static isClass(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Class) !== 0;
	}

	public static isInterface(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Interface) !== 0;
	}

	public static isTypeAlias(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.TypeAlias) !== 0;
	}

	public static isTypeParameter(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.TypeParameter) !== 0;
	}

	public static isTypeLiteral(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.TypeLiteral) !== 0;
	}

	public static isEnum(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & (SymbolFlags.RegularEnum | SymbolFlags.ConstEnum)) !== 0;
	}

	public static isFunction(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Function) !== 0;
	}

	public static isValueModule(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.ValueModule) !== 0;
	}

	public static isAlias(symbol: NativeSymbol | undefined): symbol is NativeSymbol {
		return symbol !== undefined && (symbol.flags & SymbolFlags.Alias) !== 0;
	}

	public static isInternal(symbol: NativeSymbol): boolean {
		return symbol.name === '__type' || symbol.name === '__class' || symbol.name === '__object';
	}

	private async collectTypeSymbols(result: NativeSymbol[], seen: Set<number>, type: Type): Promise<void> {
		this.token.throwIfCancellationRequested();
		const alias = await type.getAliasSymbol();
		const symbol = alias ?? await type.getSymbol();
		if (symbol !== undefined) {
			const leaf = await this.getLeafSymbol(symbol);
			if (!seen.has(leaf.id)) {
				seen.add(leaf.id);
				result.push(leaf);
			}
			return;
		}
		if (type.isUnionType() || type.isIntersectionType()) {
			for (const item of await type.getTypes()) {
				await this.collectTypeSymbols(result, seen, item);
			}
		}
	}

	private async resolveDeclarations(handles: readonly NodeHandle[]): Promise<readonly Node[]> {
		const result: Node[] = [];
		for (const handle of handles) {
			this.token.throwIfCancellationRequested();
			const declaration = await handle.resolve(this.project);
			this.token.throwIfCancellationRequested();
			if (declaration !== undefined) {
				result.push(declaration);
			}
		}
		return result;
	}
}

export namespace Types {
	export function isIntersection(type: Type): boolean {
		return type.isIntersectionType();
	}

	export function isUnion(type: Type): boolean {
		return type.isUnionType();
	}
}

export default tss;
