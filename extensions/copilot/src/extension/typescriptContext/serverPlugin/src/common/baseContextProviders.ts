/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { CodeSnippetBuilder } from './code';
import {
	AbstractContextRunnable, CacheScopes, ComputeCost, ContextProvider, SnippetLocation, type ComputeContextSession,
	type ContextResult,
	type ContextRunnableCollector,
	type ProviderComputeContext, type RequestContext, type RunnableResult,
	type SymbolData
} from './contextProvider';
import {
	CacheScopeKind, ContextRunnableState, EmitMode, Priorities,
	Range,
	SpeculativeKind,
	Trait, TraitKind, type CachedContextRunnableResult, type CacheInfo, type CacheScope,
	type ContextItemKey
} from './protocol';
import tss, { Symbols } from './typescripts';

export class CompilerOptionsRunnable extends AbstractContextRunnable {

	public static VersionTraitKey: string = Trait.createContextItemKey(TraitKind.Version);

	// Traits to collect from the compiler options in the format of [trait kind, trait description, context key, CompilerOptions.enumType (if applicable)]
	public static traitsToCollect: [TraitKind, string, ContextItemKey, unknown | undefined][] = [
		[TraitKind.Module, 'The TypeScript module system used in this project is ', Trait.createContextItemKey(TraitKind.Module), ts.ModuleKind],
		[TraitKind.ModuleResolution, 'The TypeScript module resolution strategy used in this project is ', Trait.createContextItemKey(TraitKind.ModuleResolution), ts.ModuleResolutionKind],
		[TraitKind.Target, 'The target version of JavaScript for this project is ', Trait.createContextItemKey(TraitKind.Target), ts.ScriptTarget],
		[TraitKind.Lib, 'Library files that should be included in TypeScript compilation are ', Trait.createContextItemKey(TraitKind.Lib), undefined],
	];

	private readonly sourceFile: tt.SourceFile;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, sourceFile: tt.SourceFile) {
		super(session, languageService, context, 'CompilerOptionsRunnable', SnippetLocation.Primary, Priorities.Traits, ComputeCost.Low);
		this.sourceFile = sourceFile;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.sourceFile;
	}
	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheInfo: CacheInfo = { emitMode: EmitMode.ClientBased, scope: { kind: CacheScopeKind.File } };
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, cacheInfo);
	}

	protected override run(result: RunnableResult, _token: tt.CancellationToken): void {
		const compilerOptions = this.getProgram().getCompilerOptions();
		if (!result.addFromKnownItems(CompilerOptionsRunnable.VersionTraitKey)) {
			result.addTrait(TraitKind.Version, 'The TypeScript version used in this project is ', ts.version);
		}
		for (const [traitKind, trait, key, enumType] of CompilerOptionsRunnable.traitsToCollect) {
			if (result.addFromKnownItems(key)) {
				continue;
			}
			let traitValue = compilerOptions[traitKind as keyof tt.CompilerOptions];
			if (traitValue) {
				if (typeof traitValue === 'number') {
					const enumName = CompilerOptionsRunnable.getEnumName(enumType as Record<string, unknown>, traitValue);
					if (enumName) {
						traitValue = enumName;
					}
				}
				result.addTrait(traitKind, trait, traitValue.toString());
			}
		}
	}

	private static getEnumName(enumObj: Record<string, unknown>, value: unknown): string | undefined {
		return Object.keys(enumObj).find(key => enumObj[key] === value);
	}
}

export abstract class FunctionLikeContextRunnable<T extends tt.FunctionLikeDeclarationBase = tt.FunctionLikeDeclarationBase> extends AbstractContextRunnable {

	protected readonly declaration: T;
	protected readonly sourceFile: tt.SourceFile;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, id: string, declaration: T, priority: number, cost: ComputeCost) {
		super(session, languageService, context, id, SnippetLocation.Primary, priority, cost);
		this.declaration = declaration;
		this.sourceFile = declaration.getSourceFile();
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.sourceFile;
	}
	protected getCacheScope(): CacheScope | undefined {
		const body = this.declaration.body;
		if (body === undefined || !ts.isBlock(body)) {
			return undefined;
		}
		return super.createCacheScope(body, this.sourceFile);
	}
}

export class SignatureRunnable extends FunctionLikeContextRunnable {

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: tt.FunctionLikeDeclarationBase, priority: number = Priorities.Locals) {
		super(session, languageService, context, SignatureRunnable.computeId(session, declaration), declaration, priority, ComputeCost.Low);
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const scope = this.getCacheScope();
		const cacheInfo: CacheInfo | undefined = scope !== undefined ? { emitMode: EmitMode.ClientBased, scope } : undefined;
		const runnableResult = result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, cacheInfo);
		runnableResult.debugPath = this.getDebugPath();
		return runnableResult;
	}

	protected override run(result: RunnableResult, token: tt.CancellationToken): void {
		const parameters = this.declaration.parameters;
		for (let i = 0; i < parameters.length; i++) {
			token.throwIfCancellationRequested();
			const parameter = this.declaration.parameters[i];
			const type = parameter.type;
			if (type === undefined) {
				continue;
			}
			this.processType(result, type, token);
		}
		const returnType = this.declaration.type;
		if (returnType !== undefined) {
			token.throwIfCancellationRequested();
			this.processType(result, returnType, token);
		}
	}

	private processType(_result: RunnableResult, type: tt.TypeNode, token: tt.CancellationToken): void {
		const symbolsToEmit = this.getSymbolsForTypeNode(type);
		if (symbolsToEmit.length === 0) {
			return;
		}
		for (const symbolEmitData of symbolsToEmit) {
			token.throwIfCancellationRequested();
			this.handleSymbol(symbolEmitData.symbol, symbolEmitData.name);
		}
	}

	private getDebugPath(): string | undefined {
		if (!this.session.host.isDebugging()) {
			return undefined;
		}
		const { sourceFile, startPos, endPos } = SignatureRunnable.getSourceFileAndPositions(this.declaration);
		const start = ts.getLineAndCharacterOfPosition(sourceFile, startPos);
		const end = ts.getLineAndCharacterOfPosition(sourceFile, endPos);
		return `SignatureRunnable:${sourceFile.fileName}:[${start.line},${start.character},${end.line},${end.character}]`;

	}

	private static computeId(session: ComputeContextSession, declaration: tt.FunctionLikeDeclarationBase): string {
		const { sourceFile, startPos, endPos } = SignatureRunnable.getSourceFileAndPositions(declaration);
		const hash = session.host.createHash('md5'); // CodeQL [SM04514] The 'md5' algorithm is used to compute a shorter string to represent a symbol in a map. It has no security implications.
		hash.update(sourceFile.fileName);
		hash.update(`[${startPos},${endPos}]`);
		return `SignatureRunnable:${hash.digest('base64')}`;
	}

	private static getSourceFileAndPositions(declaration: tt.FunctionLikeDeclarationBase): { sourceFile: tt.SourceFile; startPos: number; endPos: number } {
		const startPos = declaration.parameters.pos;
		const endPos = declaration.type?.end ?? declaration.parameters.end;
		const sourceFile = declaration.getSourceFile();
		return { sourceFile, startPos, endPos };
	}
}

export class TypeOfLocalsRunnable extends AbstractContextRunnable {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly excludes: Set<tt.Symbol>;
	private readonly cacheScope: CacheScope | undefined;
	private runnableResult: RunnableResult | undefined;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, excludes: Set<tt.Symbol>, cacheScope: CacheScope | undefined, priority: number = Priorities.Locals) {
		super(session, languageService, context, 'TypeOfLocalsRunnable', SnippetLocation.Primary, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.excludes = excludes;
		this.cacheScope = cacheScope;
		this.runnableResult = undefined;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheInfo: CacheInfo | undefined = this.cacheScope !== undefined ? { emitMode: EmitMode.ClientBasedOnTimeout, scope: this.cacheScope } : undefined;
		this.runnableResult = result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, cacheInfo);
		return this.runnableResult;
	}

	protected override run(_result: RunnableResult, cancellationToken: tt.CancellationToken): void {
		const token = this.tokenInfo.previous ?? this.tokenInfo.token ?? this.tokenInfo.touching;
		const symbols = this.symbols;
		const typeChecker = symbols.getTypeChecker();
		const inScope = typeChecker.getSymbolsInScope(token, ts.SymbolFlags.BlockScopedVariable);
		if (inScope.length === 0) {
			return;
		}
		const sourceFile = token.getSourceFile();
		// When we try to capture locals outside of a callable (e.g. top level in a source file) we capture the declarations as
		// scope. If we are inside the body of the callable defines the scope.
		let variableDeclarations: Set<tt.VariableDeclarationList> | undefined = this.cacheScope === undefined ? new Set() : undefined;
		// The symbols are block scope variables. We try to find the type of the variable
		// to include it in the context.
		for (const symbol of inScope) {
			cancellationToken.throwIfCancellationRequested();
			if (this.excludes.has(symbol)) {
				continue;
			}
			const declaration: tt.VariableDeclaration | undefined = Symbols.getDeclaration(symbol, ts.SyntaxKind.VariableDeclaration);
			if (declaration === undefined) {
				continue;
			}
			let symbolsToEmit: SymbolData[] | undefined = undefined;
			if (declaration.type !== undefined) {
				symbolsToEmit = this.getSymbolsForTypeNode(declaration.type);
			} else {
				const type = typeChecker.getTypeAtLocation(declaration.type ?? declaration);
				if (type !== undefined) {
					symbolsToEmit = this.getSymbolsToEmitForType(type);
				}
			}
			if (symbolsToEmit === undefined || symbolsToEmit.length === 0) {
				continue;
			}
			for (const { symbol, name } of symbolsToEmit) {
				cancellationToken.throwIfCancellationRequested();
				this.handleSymbol(symbol, name);
			}

			if (variableDeclarations !== undefined) {
				variableDeclarations = this.addScopeNode(variableDeclarations, symbol, ts.SyntaxKind.VariableDeclarationList, sourceFile);
			}
		}
		if (variableDeclarations !== undefined && variableDeclarations.size > 0 && this.runnableResult !== undefined) {
			this.runnableResult.setCacheInfo({ emitMode: EmitMode.ClientBasedOnTimeout, scope: CacheScopes.createOutsideCacheScope(variableDeclarations, sourceFile) });
		}
	}
}

export class TypesOfNeighborFilesRunnable extends AbstractContextRunnable {

	private readonly tokenInfo: tss.TokenInfo;

	private static SymbolsToInclude: number = ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum | ts.SymbolFlags.Function;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, priority: number = Priorities.NeighborFiles) {
		super(session, languageService, context, 'TypesOfNeighborFilesRunnable', SnippetLocation.Secondary, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheInfo: CacheInfo = { emitMode: EmitMode.ClientBased, scope: { kind: CacheScopeKind.NeighborFiles } };
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, cacheInfo);
	}

	protected override run(result: RunnableResult, cancellationToken: tt.CancellationToken): void {
		const symbols = this.symbols;
		for (const neighborFile of this.context.neighborFiles) {
			cancellationToken.throwIfCancellationRequested();
			if (result.isSecondaryBudgetExhausted()) {
				return;
			}
			const neighborSourceFile = this.getProgram().getSourceFile(neighborFile);
			if (neighborSourceFile === undefined || this.skipSourceFile(neighborSourceFile)) {
				continue;
			}
			const sourceFileSymbol = symbols.getLeafSymbolAtLocation(neighborSourceFile);
			// The neighbor file might have been seen when importing a value module
			if (sourceFileSymbol === undefined) {
				continue;
			}
			if (sourceFileSymbol.exports !== undefined) {
				for (const member of sourceFileSymbol.exports) {
					cancellationToken.throwIfCancellationRequested();
					const memberSymbol = member[1];
					if ((memberSymbol.flags & TypesOfNeighborFilesRunnable.SymbolsToInclude) === 0) {
						continue;
					}
					if (!this.handleSymbol(memberSymbol, member[0] as string, true)) {
						return;
					}
				}
			}
		}
	}
}

type ImportBlock = { before: tt.Node | undefined; imports: tt.ImportDeclaration[]; after: tt.Node | undefined };
export class ImportsRunnable extends AbstractContextRunnable {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly excludes: Set<tt.Symbol>;
	private cacheInfo: CacheInfo | undefined;
	private runnableResult: RunnableResult | undefined;

	private static readonly CacheNodes: Set<tt.SyntaxKind> = new Set([
		ts.SyntaxKind.FunctionDeclaration,
		ts.SyntaxKind.ArrowFunction,
		ts.SyntaxKind.FunctionExpression,
		ts.SyntaxKind.Constructor,
		ts.SyntaxKind.MethodDeclaration,
		ts.SyntaxKind.ClassDeclaration,
		ts.SyntaxKind.ModuleDeclaration
	]);

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, excludes: Set<tt.Symbol>, priority: number = Priorities.Imports) {
		super(session, languageService, context, 'ImportsRunnable', SnippetLocation.Secondary, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.excludes = excludes;
		this.runnableResult = undefined;
		const scopeNode = this.getCacheScopeNode();
		this.cacheInfo = scopeNode === undefined
			? undefined
			: { emitMode: EmitMode.ClientBased, scope: this.createCacheScope(scopeNode) };
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	public override useCachedResult(cached: CachedContextRunnableResult): boolean {
		const cacheInfo = cached.cache;
		if (cacheInfo === undefined) {
			return false;
		}
		if (cacheInfo.emitMode === EmitMode.ClientBased && cached.state === ContextRunnableState.Finished) {
			const scope = cacheInfo.scope;
			if (scope.kind === CacheScopeKind.WithinRange) {
				return true;
			} else if (scope.kind === CacheScopeKind.OutsideRange) {
				// If we have a cache info that means we have an within range cache scope.
				// So we can't use the cached result since we need to emit a new scope.
				return this.cacheInfo === undefined;
			}
		}
		return super.useCachedResult(cached);
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		this.runnableResult = result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, this.cacheInfo);
		return this.runnableResult;
	}

	protected override run(result: RunnableResult, cancellationToken: tt.CancellationToken): void {
		cancellationToken.throwIfCancellationRequested();
		const token = this.tokenInfo.touching ?? this.tokenInfo.token;
		const sourceFile = token.getSourceFile();
		const importBlocks = this.getImportBlocks(sourceFile);
		cancellationToken.throwIfCancellationRequested();
		const importedSymbols: { symbol: tt.Symbol; name: string }[] = [];
		let outSideRanges: Range[] | undefined = undefined;
		for (const block of importBlocks) {
			for (const stmt of block.imports) {
				cancellationToken.throwIfCancellationRequested();
				if (stmt.importClause === undefined) {
					continue;
				}
				const importClause = stmt.importClause;
				if (importClause.name !== undefined) {
					const symbol = this.symbols.getLeafSymbolAtLocation(importClause.name);
					if (symbol !== undefined && !this.excludes.has(symbol)) {
						importedSymbols.push({ symbol, name: importClause.name.getText() });
					}
				} else if (importClause.namedBindings !== undefined) {
					const namedBindings = importClause.namedBindings;
					if (ts.isNamespaceImport(namedBindings)) {
						const symbol = this.symbols.getLeafSymbolAtLocation(namedBindings.name);
						if (symbol !== undefined && !this.excludes.has(symbol)) {
							importedSymbols.push({ symbol, name: namedBindings.name.getText() });
						}
					} else if (ts.isNamedImports(namedBindings)) {
						for (const element of namedBindings.elements) {
							const symbol = this.symbols.getLeafSymbolAtLocation(element.name);
							if (symbol !== undefined && !this.excludes.has(symbol)) {
								importedSymbols.push({ symbol, name: element.name.getText() });
							}
						}
					}
				}
			}
			if (this.cacheInfo === undefined) {
				if (outSideRanges === undefined) {
					outSideRanges = [];
				}
				const start = block.before !== undefined ? CacheScopes.createRange(block.before, sourceFile).end : CacheScopes.createRange(block.imports[0], sourceFile).start;
				const end = block.after !== undefined ? CacheScopes.createRange(block.after, sourceFile).start : CacheScopes.createRange(block.imports[block.imports.length - 1], sourceFile).end;
				outSideRanges.push({ start, end });
			}
		}

		for (const { symbol, name } of importedSymbols) {
			const flags = symbol.flags;
			if ((flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum | ts.SymbolFlags.Alias | ts.SymbolFlags.ValueModule)) === 0) {
				continue;
			}

			if (!this.handleSymbol(symbol, name, true)) {
				break;
			}
		}
		if (this.cacheInfo === undefined && outSideRanges !== undefined && outSideRanges.length > 0) {
			result.setCacheInfo({ emitMode: EmitMode.ClientBased, scope: { kind: CacheScopeKind.OutsideRange, ranges: outSideRanges } });
		}
	}

	private getImportBlocks(sourceFile: tt.SourceFile): ImportBlock[] {
		if (this.cacheInfo !== undefined) {
			const imports: tt.ImportDeclaration[] = [];
			for (const node of tss.Nodes.getChildren(sourceFile, sourceFile)) {
				if (ts.isImportDeclaration(node)) {
					imports.push(node);
				}
			}
			return [{ before: undefined, imports, after: undefined }];
		} else {
			const result: ImportBlock[] = [];
			let before: tt.Node | undefined = undefined;
			let after: tt.Node | undefined = undefined;
			let imports: tt.ImportDeclaration[] = [];
			for (const node of tss.Nodes.getChildren(sourceFile, sourceFile)) {
				if (ts.isImportDeclaration(node)) {
					imports.push(node);
				} else {
					if (imports.length === 0) {
						before = node;
					} else {
						after = node;
						result.push({ before, imports, after });
						before = undefined;
						after = undefined;
						imports = [];
					}
				}
			}
			if (imports.length > 0) {
				result.push({ before, imports, after });
			}
			return result;
		}
	}

	private getCacheScopeNode(): tt.Node | undefined {
		let current = this.tokenInfo.touching ?? this.tokenInfo.token;
		if (current === undefined || current.kind === ts.SyntaxKind.EndOfFileToken || current.kind === ts.SyntaxKind.Unknown) {
			return undefined;
		}
		let result: tt.Node | undefined;
		while (current !== undefined && current.kind !== ts.SyntaxKind.SourceFile) {
			if (ImportsRunnable.CacheNodes.has(current.kind)) {
				result = current;
			}
			current = current.parent;
		}
		return result;
	}
}

export class TypeOfExpressionRunnable extends AbstractContextRunnable {

	private readonly expression: tt.Expression;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, expression: tt.Expression, priority: number = Priorities.Expression) {
		super(session, languageService, context, 'TypeOfExpressionRunnable', SnippetLocation.Primary, priority, ComputeCost.Low);
		this.expression = expression;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.expression.getSourceFile();
	}

	public static create(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, _token: tt.CancellationToken): TypeOfExpressionRunnable | undefined {
		const previous = tokenInfo.previous;
		if (previous === undefined || previous.parent === undefined) {
			return;
		}
		if ((ts.isIdentifier(previous) || previous.kind === ts.SyntaxKind.DotToken) && ts.isPropertyAccessExpression(previous.parent)) {
			const identifier = this.getRightMostIdentifier(previous.parent.expression, 0);
			if (identifier !== undefined) {
				return new TypeOfExpressionRunnable(session, languageService, context, identifier);
			}
		}
		return undefined;
	}


	private static getRightMostIdentifier(node: tt.Node, count: number): tt.Identifier | undefined {
		if (count === 32) {
			return undefined;
		}
		switch (node.kind) {
			case ts.SyntaxKind.Identifier:
				return node as tt.Identifier;
			case ts.SyntaxKind.PropertyAccessExpression:
				return this.getRightMostIdentifier((node as tt.PropertyAccessExpression).name, count + 1);
			case ts.SyntaxKind.ElementAccessExpression:
				return this.getRightMostIdentifier((node as tt.ElementAccessExpression).argumentExpression, count + 1);
			case ts.SyntaxKind.CallExpression:
				return this.getRightMostIdentifier((node as tt.CallExpression).expression, count + 1);
			default:
				return undefined;
		}
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.ignore);
	}

	protected override run(result: RunnableResult, token: tt.CancellationToken): void {
		const expSymbol = this.symbols.getLeafSymbolAtLocation(this.expression);
		if (expSymbol === undefined) {
			return;
		}
		const typeChecker = this.symbols.getTypeChecker();
		const type = typeChecker.getTypeOfSymbolAtLocation(expSymbol, this.expression);
		const signatures = type.getConstructSignatures().concat(type.getCallSignatures());
		const sourceFile = this.expression.getSourceFile();
		for (const signature of signatures) {
			token.throwIfCancellationRequested();
			const returnType = signature.getReturnType();
			const returnTypeSymbol = returnType.aliasSymbol ?? returnType.getSymbol();
			if (returnTypeSymbol === undefined) {
				continue;
			}
			const snippetBuilder = new CodeSnippetBuilder(this.context, this.symbols, sourceFile);
			snippetBuilder.addTypeSymbol(returnTypeSymbol, returnTypeSymbol.name);
			result.addSnippet(snippetBuilder, this.location, undefined);
		}
		const typeSymbol = type.getSymbol();
		if (typeSymbol === undefined) {
			return;
		}
		const snippetBuilder = new CodeSnippetBuilder(this.context, this.symbols, sourceFile);
		snippetBuilder.addTypeSymbol(typeSymbol, typeSymbol.name);
		result.addSnippet(snippetBuilder, this.location, undefined);
	}
}

export abstract class FunctionLikeContextProvider extends ContextProvider {

	protected readonly functionLikeDeclaration: tt.FunctionLikeDeclarationBase;
	protected readonly tokenInfo: tss.TokenInfo;
	protected readonly computeContext: ProviderComputeContext;

	public override readonly isCallableProvider: boolean;

	constructor(declaration: tt.FunctionLikeDeclarationBase, tokenInfo: tss.TokenInfo, computeContext: ProviderComputeContext) {
		super();
		this.functionLikeDeclaration = declaration;
		this.tokenInfo = tokenInfo;
		this.computeContext = computeContext;
		this.isCallableProvider = true;
	}

	public override provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		result.addPrimary(new SignatureRunnable(session, languageService, context, this.functionLikeDeclaration),);

		// If we already have a callable provider then we don't need to compute anything
		// around the cursor location.
		if (!this.computeContext.isFirstCallableProvider(this)) {
			return;
		}

		const excludes = this.getTypeExcludes(languageService, context);
		result.addPrimary(new TypeOfLocalsRunnable(session, languageService, context, this.tokenInfo, excludes, CacheScopes.fromDeclaration(this.functionLikeDeclaration)));
		const runnable = TypeOfExpressionRunnable.create(session, languageService, context, this.tokenInfo, token);
		if (runnable !== undefined) {
			result.addPrimary(runnable);
		}
		result.addSecondary(new ImportsRunnable(session, languageService, context, this.tokenInfo, excludes));
		if (context.neighborFiles.length > 0) {
			result.addTertiary(new TypesOfNeighborFilesRunnable(session, languageService, context, this.tokenInfo));
		}
	}

	protected abstract getTypeExcludes(languageService: tt.LanguageService, context: RequestContext): Set<tt.Symbol>;
}