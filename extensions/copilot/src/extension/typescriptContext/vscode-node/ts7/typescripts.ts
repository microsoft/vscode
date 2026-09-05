/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import type * as vscode from 'vscode';

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
		const KindMap: Map<SyntaxKind, number> = new Map([
			[SyntaxKind.Unknown, 0],
			// [SyntaxKind.EndOfFileToken, 1],
			[SyntaxKind.SingleLineCommentTrivia, 2],
			[SyntaxKind.MultiLineCommentTrivia, 3],
			[SyntaxKind.NewLineTrivia, 4],
			[SyntaxKind.WhitespaceTrivia, 5],
			// [SyntaxKind.ShebangTrivia, 6],
			[SyntaxKind.ConflictMarkerTrivia, 7],
			[SyntaxKind.NonTextFileMarkerTrivia, 8],
			[SyntaxKind.NumericLiteral, 9],
			[SyntaxKind.BigIntLiteral, 10],
			[SyntaxKind.StringLiteral, 11],
			[SyntaxKind.JsxText, 12],
			[SyntaxKind.JsxTextAllWhiteSpaces, 13],
			[SyntaxKind.RegularExpressionLiteral, 14],
			[SyntaxKind.NoSubstitutionTemplateLiteral, 15],
			[SyntaxKind.TemplateHead, 16],
			[SyntaxKind.TemplateMiddle, 17],
			[SyntaxKind.TemplateTail, 18],
			[SyntaxKind.OpenBraceToken, 19],
			[SyntaxKind.CloseBraceToken, 20],
			[SyntaxKind.OpenParenToken, 21],
			[SyntaxKind.CloseParenToken, 22],
			[SyntaxKind.OpenBracketToken, 23],
			[SyntaxKind.CloseBracketToken, 24],
			[SyntaxKind.DotToken, 25],
			[SyntaxKind.DotDotDotToken, 26],
			[SyntaxKind.SemicolonToken, 27],
			[SyntaxKind.CommaToken, 28],
			[SyntaxKind.QuestionDotToken, 29],
			[SyntaxKind.LessThanToken, 30],
			[SyntaxKind.LessThanSlashToken, 31],
			[SyntaxKind.GreaterThanToken, 32],
			[SyntaxKind.LessThanEqualsToken, 33],
			[SyntaxKind.GreaterThanEqualsToken, 34],
			[SyntaxKind.EqualsEqualsToken, 35],
			[SyntaxKind.ExclamationEqualsToken, 36],
			[SyntaxKind.EqualsEqualsEqualsToken, 37],
			[SyntaxKind.ExclamationEqualsEqualsToken, 38],
			[SyntaxKind.EqualsGreaterThanToken, 39],
			[SyntaxKind.PlusToken, 40],
			[SyntaxKind.MinusToken, 41],
			[SyntaxKind.AsteriskToken, 42],
			[SyntaxKind.AsteriskAsteriskToken, 43],
			[SyntaxKind.SlashToken, 44],
			[SyntaxKind.PercentToken, 45],
			[SyntaxKind.PlusPlusToken, 46],
			[SyntaxKind.MinusMinusToken, 47],
			[SyntaxKind.LessThanLessThanToken, 48],
			[SyntaxKind.GreaterThanGreaterThanToken, 49],
			[SyntaxKind.GreaterThanGreaterThanGreaterThanToken, 50],
			[SyntaxKind.AmpersandToken, 51],
			[SyntaxKind.BarToken, 52],
			[SyntaxKind.CaretToken, 53],
			[SyntaxKind.ExclamationToken, 54],
			[SyntaxKind.TildeToken, 55],
			[SyntaxKind.AmpersandAmpersandToken, 56],
			[SyntaxKind.BarBarToken, 57],
			[SyntaxKind.QuestionToken, 58],
			[SyntaxKind.ColonToken, 59],
			[SyntaxKind.AtToken, 60],
			[SyntaxKind.QuestionQuestionToken, 61],
			[SyntaxKind.BacktickToken, 62],
			[SyntaxKind.HashToken, 63],
			[SyntaxKind.EqualsToken, 64],
			[SyntaxKind.PlusEqualsToken, 65],
			[SyntaxKind.MinusEqualsToken, 66],
			[SyntaxKind.AsteriskEqualsToken, 67],
			[SyntaxKind.AsteriskAsteriskEqualsToken, 68],
			[SyntaxKind.SlashEqualsToken, 69],
			[SyntaxKind.PercentEqualsToken, 70],
			[SyntaxKind.LessThanLessThanEqualsToken, 71],
			[SyntaxKind.GreaterThanGreaterThanEqualsToken, 72],
			[SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, 73],
			[SyntaxKind.AmpersandEqualsToken, 74],
			[SyntaxKind.BarEqualsToken, 75],
			[SyntaxKind.BarBarEqualsToken, 76],
			[SyntaxKind.AmpersandAmpersandEqualsToken, 77],
			[SyntaxKind.QuestionQuestionEqualsToken, 78],
			[SyntaxKind.CaretEqualsToken, 79],
			[SyntaxKind.Identifier, 80],
			[SyntaxKind.PrivateIdentifier, 81],
			[SyntaxKind.BreakKeyword, 83],
			[SyntaxKind.CaseKeyword, 84],
			[SyntaxKind.CatchKeyword, 85],
			[SyntaxKind.ClassKeyword, 86],
			[SyntaxKind.ConstKeyword, 87],
			[SyntaxKind.ContinueKeyword, 88],
			[SyntaxKind.DebuggerKeyword, 89],
			[SyntaxKind.DefaultKeyword, 90],
			[SyntaxKind.DeleteKeyword, 91],
			[SyntaxKind.DoKeyword, 92],
			[SyntaxKind.ElseKeyword, 93],
			[SyntaxKind.EnumKeyword, 94],
			[SyntaxKind.ExportKeyword, 95],
			[SyntaxKind.ExtendsKeyword, 96],
			[SyntaxKind.FalseKeyword, 97],
			[SyntaxKind.FinallyKeyword, 98],
			[SyntaxKind.ForKeyword, 99],
			[SyntaxKind.FunctionKeyword, 100],
			[SyntaxKind.IfKeyword, 101],
			[SyntaxKind.ImportKeyword, 102],
			[SyntaxKind.InKeyword, 103],
			[SyntaxKind.InstanceOfKeyword, 104],
			[SyntaxKind.NewKeyword, 105],
			[SyntaxKind.NullKeyword, 106],
			[SyntaxKind.ReturnKeyword, 107],
			[SyntaxKind.SuperKeyword, 108],
			[SyntaxKind.SwitchKeyword, 109],
			[SyntaxKind.ThisKeyword, 110],
			[SyntaxKind.ThrowKeyword, 111],
			[SyntaxKind.TrueKeyword, 112],
			[SyntaxKind.TryKeyword, 113],
			[SyntaxKind.TypeOfKeyword, 114],
			[SyntaxKind.VarKeyword, 115],
			[SyntaxKind.VoidKeyword, 116],
			[SyntaxKind.WhileKeyword, 117],
			[SyntaxKind.WithKeyword, 118],
			[SyntaxKind.ImplementsKeyword, 119],
			[SyntaxKind.InterfaceKeyword, 120],
			[SyntaxKind.LetKeyword, 121],
			[SyntaxKind.PackageKeyword, 122],
			[SyntaxKind.PrivateKeyword, 123],
			[SyntaxKind.ProtectedKeyword, 124],
			[SyntaxKind.PublicKeyword, 125],
			[SyntaxKind.StaticKeyword, 126],
			[SyntaxKind.YieldKeyword, 127],
			[SyntaxKind.AbstractKeyword, 128],
			[SyntaxKind.AccessorKeyword, 129],
			[SyntaxKind.AsKeyword, 130],
			[SyntaxKind.AssertsKeyword, 131],
			[SyntaxKind.AssertKeyword, 132],
			[SyntaxKind.AnyKeyword, 133],
			[SyntaxKind.AsyncKeyword, 134],
			[SyntaxKind.AwaitKeyword, 135],
			[SyntaxKind.BooleanKeyword, 136],
			[SyntaxKind.ConstructorKeyword, 137],
			[SyntaxKind.DeclareKeyword, 138],
			[SyntaxKind.GetKeyword, 139],
			[SyntaxKind.InferKeyword, 140],
			[SyntaxKind.IntrinsicKeyword, 141],
			[SyntaxKind.IsKeyword, 142],
			[SyntaxKind.KeyOfKeyword, 143],
			[SyntaxKind.ModuleKeyword, 144],
			[SyntaxKind.NamespaceKeyword, 145],
			[SyntaxKind.NeverKeyword, 146],
			[SyntaxKind.OutKeyword, 147],
			[SyntaxKind.ReadonlyKeyword, 148],
			[SyntaxKind.RequireKeyword, 149],
			[SyntaxKind.NumberKeyword, 150],
			[SyntaxKind.ObjectKeyword, 151],
			[SyntaxKind.SatisfiesKeyword, 152],
			[SyntaxKind.SetKeyword, 153],
			[SyntaxKind.StringKeyword, 154],
			[SyntaxKind.SymbolKeyword, 155],
			[SyntaxKind.TypeKeyword, 156],
			[SyntaxKind.UndefinedKeyword, 157],
			[SyntaxKind.UniqueKeyword, 158],
			[SyntaxKind.UnknownKeyword, 159],
			[SyntaxKind.UsingKeyword, 160],
			[SyntaxKind.FromKeyword, 161],
			[SyntaxKind.GlobalKeyword, 162],
			[SyntaxKind.BigIntKeyword, 163],
			[SyntaxKind.OverrideKeyword, 164],
			[SyntaxKind.OfKeyword, 165],
			[SyntaxKind.QualifiedName, 166],
			[SyntaxKind.ComputedPropertyName, 167],
			[SyntaxKind.TypeParameter, 168],
			[SyntaxKind.Parameter, 169],
			[SyntaxKind.Decorator, 170],
			[SyntaxKind.PropertySignature, 171],
			[SyntaxKind.PropertyDeclaration, 172],
			[SyntaxKind.MethodSignature, 173],
			[SyntaxKind.MethodDeclaration, 174],
			[SyntaxKind.ClassStaticBlockDeclaration, 175],
			[SyntaxKind.Constructor, 176],
			[SyntaxKind.GetAccessor, 177],
			[SyntaxKind.SetAccessor, 178],
			[SyntaxKind.CallSignature, 179],
			[SyntaxKind.ConstructSignature, 180],
			[SyntaxKind.IndexSignature, 181],
			[SyntaxKind.TypePredicate, 182],
			[SyntaxKind.TypeReference, 183],
			[SyntaxKind.FunctionType, 184],
			[SyntaxKind.ConstructorType, 185],
			[SyntaxKind.TypeQuery, 186],
			[SyntaxKind.TypeLiteral, 187],
			[SyntaxKind.ArrayType, 188],
			[SyntaxKind.TupleType, 189],
			[SyntaxKind.OptionalType, 190],
			[SyntaxKind.RestType, 191],
			[SyntaxKind.UnionType, 192],
			[SyntaxKind.IntersectionType, 193],
			[SyntaxKind.ConditionalType, 194],
			[SyntaxKind.InferType, 195],
			[SyntaxKind.ParenthesizedType, 196],
			[SyntaxKind.ThisType, 197],
			[SyntaxKind.TypeOperator, 198],
			[SyntaxKind.IndexedAccessType, 199],
			[SyntaxKind.MappedType, 200],
			[SyntaxKind.LiteralType, 201],
			[SyntaxKind.NamedTupleMember, 202],
			[SyntaxKind.TemplateLiteralType, 203],
			[SyntaxKind.TemplateLiteralTypeSpan, 204],
			[SyntaxKind.ImportType, 205],
			[SyntaxKind.ObjectBindingPattern, 206],
			[SyntaxKind.ArrayBindingPattern, 207],
			[SyntaxKind.BindingElement, 208],
			[SyntaxKind.ArrayLiteralExpression, 209],
			[SyntaxKind.ObjectLiteralExpression, 210],
			[SyntaxKind.PropertyAccessExpression, 211],
			[SyntaxKind.ElementAccessExpression, 212],
			[SyntaxKind.CallExpression, 213],
			[SyntaxKind.NewExpression, 214],
			[SyntaxKind.TaggedTemplateExpression, 215],
			[SyntaxKind.TypeAssertionExpression, 216],
			[SyntaxKind.ParenthesizedExpression, 217],
			[SyntaxKind.FunctionExpression, 218],
			[SyntaxKind.ArrowFunction, 219],
			[SyntaxKind.DeleteExpression, 220],
			[SyntaxKind.TypeOfExpression, 221],
			[SyntaxKind.VoidExpression, 222],
			[SyntaxKind.AwaitExpression, 223],
			[SyntaxKind.PrefixUnaryExpression, 224],
			[SyntaxKind.PostfixUnaryExpression, 225],
			[SyntaxKind.BinaryExpression, 226],
			[SyntaxKind.ConditionalExpression, 227],
			[SyntaxKind.TemplateExpression, 228],
			[SyntaxKind.YieldExpression, 229],
			[SyntaxKind.SpreadElement, 230],
			[SyntaxKind.ClassExpression, 231],
			[SyntaxKind.OmittedExpression, 232],
			[SyntaxKind.ExpressionWithTypeArguments, 233],
			[SyntaxKind.AsExpression, 234],
			[SyntaxKind.NonNullExpression, 235],
			[SyntaxKind.MetaProperty, 236],
			[SyntaxKind.SyntheticExpression, 237],
			[SyntaxKind.SatisfiesExpression, 238],
			[SyntaxKind.TemplateSpan, 239],
			[SyntaxKind.SemicolonClassElement, 240],
			[SyntaxKind.Block, 241],
			[SyntaxKind.EmptyStatement, 242],
			[SyntaxKind.VariableStatement, 243],
			[SyntaxKind.ExpressionStatement, 244],
			[SyntaxKind.IfStatement, 245],
			[SyntaxKind.DoStatement, 246],
			[SyntaxKind.WhileStatement, 247],
			[SyntaxKind.ForStatement, 248],
			[SyntaxKind.ForInStatement, 249],
			[SyntaxKind.ForOfStatement, 250],
			[SyntaxKind.ContinueStatement, 251],
			[SyntaxKind.BreakStatement, 252],
			[SyntaxKind.ReturnStatement, 253],
			[SyntaxKind.WithStatement, 254],
			[SyntaxKind.SwitchStatement, 255],
			[SyntaxKind.LabeledStatement, 256],
			[SyntaxKind.ThrowStatement, 257],
			[SyntaxKind.TryStatement, 258],
			[SyntaxKind.DebuggerStatement, 259],
			[SyntaxKind.VariableDeclaration, 260],
			[SyntaxKind.VariableDeclarationList, 261],
			[SyntaxKind.FunctionDeclaration, 262],
			[SyntaxKind.ClassDeclaration, 263],
			[SyntaxKind.InterfaceDeclaration, 264],
			[SyntaxKind.TypeAliasDeclaration, 265],
			[SyntaxKind.EnumDeclaration, 266],
			[SyntaxKind.ModuleDeclaration, 267],
			[SyntaxKind.ModuleBlock, 268],
			[SyntaxKind.CaseBlock, 269],
			[SyntaxKind.NamespaceExportDeclaration, 270],
			[SyntaxKind.ImportEqualsDeclaration, 271],
			[SyntaxKind.ImportDeclaration, 272],
			[SyntaxKind.ImportClause, 273],
			[SyntaxKind.NamespaceImport, 274],
			[SyntaxKind.NamedImports, 275],
			[SyntaxKind.ImportSpecifier, 276],
			[SyntaxKind.ExportAssignment, 277],
			[SyntaxKind.ExportDeclaration, 278],
			[SyntaxKind.NamedExports, 279],
			[SyntaxKind.NamespaceExport, 280],
			[SyntaxKind.ExportSpecifier, 281],
			[SyntaxKind.MissingDeclaration, 282],
			[SyntaxKind.ExternalModuleReference, 283],
			[SyntaxKind.JsxElement, 284],
			[SyntaxKind.JsxSelfClosingElement, 285],
			[SyntaxKind.JsxOpeningElement, 286],
			[SyntaxKind.JsxClosingElement, 287],
			[SyntaxKind.JsxFragment, 288],
			[SyntaxKind.JsxOpeningFragment, 289],
			[SyntaxKind.JsxClosingFragment, 290],
			[SyntaxKind.JsxAttribute, 291],
			[SyntaxKind.JsxAttributes, 292],
			[SyntaxKind.JsxSpreadAttribute, 293],
			[SyntaxKind.JsxExpression, 294],
			[SyntaxKind.JsxNamespacedName, 295],
			[SyntaxKind.CaseClause, 296],
			[SyntaxKind.DefaultClause, 297],
			[SyntaxKind.HeritageClause, 298],
			[SyntaxKind.CatchClause, 299],
			[SyntaxKind.ImportAttributes, 300],
			[SyntaxKind.ImportAttribute, 301],
			[SyntaxKind.PropertyAssignment, 303],
			[SyntaxKind.ShorthandPropertyAssignment, 304],
			[SyntaxKind.SpreadAssignment, 305],
			[SyntaxKind.EnumMember, 306],
			[SyntaxKind.SourceFile, 307],
			// [SyntaxKind.Bundle, 308],
			[SyntaxKind.JSDocTypeExpression, 309],
			[SyntaxKind.JSDocNameReference, 310],
			// [SyntaxKind.JSDocMemberName, 311],
			[SyntaxKind.JSDocAllType, 312],
			// [SyntaxKind.JSDocUnknownType, 313],
			[SyntaxKind.JSDocNullableType, 314],
			[SyntaxKind.JSDocNonNullableType, 315],
			[SyntaxKind.JSDocOptionalType, 316],
			// [SyntaxKind.JSDocFunctionType, 317],
			[SyntaxKind.JSDocVariadicType, 318],
			// [SyntaxKind.JSDocNamepathType, 319],
			[SyntaxKind.JSDoc, 320],
			[SyntaxKind.JSDocText, 321],
			[SyntaxKind.JSDocTypeLiteral, 322],
			[SyntaxKind.JSDocSignature, 323],
			[SyntaxKind.JSDocLink, 324],
			[SyntaxKind.JSDocLinkCode, 325],
			[SyntaxKind.JSDocLinkPlain, 326],
			// [SyntaxKind.JSDocTag, 327],
			[SyntaxKind.JSDocAugmentsTag, 328],
			[SyntaxKind.JSDocImplementsTag, 329],
			// [SyntaxKind.JSDocAuthorTag, 330],
			[SyntaxKind.JSDocDeprecatedTag, 331],
			// [SyntaxKind.JSDocClassTag, 332],
			[SyntaxKind.JSDocPublicTag, 333],
			[SyntaxKind.JSDocPrivateTag, 334],
			[SyntaxKind.JSDocProtectedTag, 335],
			[SyntaxKind.JSDocReadonlyTag, 336],
			[SyntaxKind.JSDocOverrideTag, 337],
			[SyntaxKind.JSDocCallbackTag, 338],
			[SyntaxKind.JSDocOverloadTag, 339],
			// [SyntaxKind.JSDocEnumTag, 340],
			[SyntaxKind.JSDocParameterTag, 341],
			[SyntaxKind.JSDocReturnTag, 342],
			[SyntaxKind.JSDocThisTag, 343],
			[SyntaxKind.JSDocTypeTag, 344],
			[SyntaxKind.JSDocTemplateTag, 345],
			[SyntaxKind.JSDocTypedefTag, 346],
			[SyntaxKind.JSDocSeeTag, 347],
			[SyntaxKind.JSDocPropertyTag, 348],
			[SyntaxKind.JSDocThrowsTag, 349],
			[SyntaxKind.JSDocSatisfiesTag, 350],
			[SyntaxKind.JSDocImportTag, 351],
			[SyntaxKind.SyntaxList, 352],
			[SyntaxKind.NotEmittedStatement, 353],
			[SyntaxKind.PartiallyEmittedExpression, 354],
			// [SyntaxKind.CommaListExpression, 355],
			[SyntaxKind.SyntheticReferenceExpression, 356],
			[SyntaxKind.NotEmittedTypeElement, 357], // New in 5.8.x. Position in 5.8 is 354 and the rest shifts
			[SyntaxKind.DeferKeyword, 358], // New in 6.0.3
			[SyntaxKind.Count, 359]
		]);

		const UnknownStableSyntaxKind: number = 9999;
		export function getPath(node: Node): number[] {
			const path: number[] = [];
			while (node !== undefined) {
				path.push(KindMap.get(node.kind) ?? UnknownStableSyntaxKind);
				node = node.parent;
			}
			return path;
		}
	}
}

export default tss;
