/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';

import { version } from '@typescript/native';
import { ModuleKind, SignatureKind, SymbolFlags, type Project, type Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import {
	ScriptTarget,
	SyntaxKind,
	isArrowFunction,
	isBlock,
	isCallExpression,
	isElementAccessExpression,
	isFunctionDeclaration,
	isFunctionExpression,
	isIdentifier,
	isImportDeclaration,
	isIntersectionTypeNode,
	isNamedImports,
	isNamespaceImport,
	isPropertyAccessExpression,
	isTypeLiteralNode,
	isTypeReferenceNode,
	isUnionTypeNode,
	type FunctionLikeDeclaration,
	type ImportDeclaration,
	type Node,
	type SourceFile,
	type TypeNode,
	type VariableDeclaration,
} from '@typescript/native/unstable/ast';
import * as protocol from '../../common/serverProtocol';
import {
	AbstractContextRunnable,
	CacheScopes,
	ComputeCost,
	ContextProvider,
	SnippetLocation,
	type ComputeContextSession,
	type ContextResult,
	type ContextRunnableCollector,
	type ProviderComputeContext,
	type RequestContext,
	type RunnableResult,
	type SymbolData,
} from './contextProvider';
import tss, { type CancellationTokenWithTimer } from './typescripts';

export class CompilerOptionsRunnable extends AbstractContextRunnable {
	private readonly sourceFile: SourceFile;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, sourceFile: SourceFile) {
		super(session, project, context, 'CompilerOptionsRunnable', SnippetLocation.Primary, protocol.Priorities.Traits, ComputeCost.Low);
		this.sourceFile = sourceFile;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.sourceFile;
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheInfo: protocol.CacheInfo = { emitMode: protocol.EmitMode.ClientBased, scope: { kind: protocol.CacheScopeKind.File } };
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, cacheInfo);
	}

	protected override async run(result: RunnableResult): Promise<void> {
		const compilerOptions = this.getProject().program.getCompilerOptions();
		this.addTrait(result, protocol.TraitKind.Version, 'The TypeScript version used in this project is ', version);
		this.addTrait(result, protocol.TraitKind.Module, 'The TypeScript module system used in this project is ', compilerOptions.module === undefined ? undefined : ModuleKind[compilerOptions.module]);
		this.addTrait(result, protocol.TraitKind.ModuleResolution, 'The TypeScript module resolution strategy used in this project is ', compilerOptions.moduleResolution === undefined ? undefined : this.moduleResolutionName(compilerOptions.moduleResolution));
		this.addTrait(result, protocol.TraitKind.Target, 'The target version of JavaScript for this project is ', compilerOptions.target === undefined ? undefined : ScriptTarget[compilerOptions.target]);
		this.addTrait(result, protocol.TraitKind.Lib, 'Library files that should be included in TypeScript compilation are ', compilerOptions.lib?.toString());
	}

	private addTrait(result: RunnableResult, kind: protocol.TraitKind, name: string, value: string | undefined): void {
		if (value === undefined) {
			return;
		}
		const key = protocol.Trait.createContextItemKey(kind);
		if (!result.addFromKnownItems(key)) {
			result.addTrait(kind, name, value, key);
		}
	}

	private moduleResolutionName(value: number): string {
		switch (value) {
			case 1: return 'Classic';
			case 2: return 'Node10';
			case 3: return 'Node16';
			case 99: return 'NodeNext';
			case 100: return 'Bundler';
			default: return 'Unknown';
		}
	}
}

export abstract class FunctionLikeContextRunnable<T extends FunctionLikeDeclaration = FunctionLikeDeclaration> extends AbstractContextRunnable {
	protected readonly declaration: T;
	protected readonly sourceFile: SourceFile;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, id: string, declaration: T, priority: number, cost: ComputeCost) {
		super(session, project, context, id, SnippetLocation.Primary, priority, cost);
		this.declaration = declaration;
		this.sourceFile = declaration.getSourceFile();
	}

	public override getActiveSourceFile(): SourceFile {
		return this.sourceFile;
	}

	protected getCacheScope(): protocol.CacheScope | undefined {
		return this.declaration.body === undefined || !isBlock(this.declaration.body)
			? undefined
			: this.createCacheScope(this.declaration.body, this.sourceFile);
	}
}

export class SignatureRunnable extends FunctionLikeContextRunnable {
	constructor(session: ComputeContextSession, project: Project, context: RequestContext, declaration: FunctionLikeDeclaration, priority: number = protocol.Priorities.Locals) {
		super(session, project, context, SignatureRunnable.computeId(session, declaration), declaration, priority, ComputeCost.Low);
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const scope = this.getCacheScope();
		const cacheInfo = scope === undefined ? undefined : { emitMode: protocol.EmitMode.ClientBased, scope };
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, cacheInfo);
	}

	protected override async run(_result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		for (const parameter of this.declaration.parameters) {
			token.throwIfCancellationRequested();
			if (parameter.type !== undefined) {
				await this.processType(parameter.type, token);
			}
		}
		if (this.declaration.type !== undefined) {
			token.throwIfCancellationRequested();
			await this.processType(this.declaration.type, token);
		}
	}

	private async processType(type: TypeNode, token: CancellationTokenWithTimer): Promise<void> {
		for (const symbolEmitData of await this.getSymbolsForTypeNode(type)) {
			token.throwIfCancellationRequested();
			await this.handleSymbol(symbolEmitData.symbol, symbolEmitData.name);
		}
	}

	private static computeId(_session: ComputeContextSession, declaration: FunctionLikeDeclaration): string {
		const end = declaration.type?.end ?? declaration.parameters.end;
		const hash = createHash('md5'); // CodeQL [SM04514] Used only as a compact cache key, not for security.
		hash.update(declaration.getSourceFile().fileName);
		hash.update(`[${declaration.parameters.pos},${end}]`);
		return `SignatureRunnable:${hash.digest('base64')}`;
	}
}

export class TypeOfLocalsRunnable extends AbstractContextRunnable {
	private readonly tokenInfo: tss.TokenInfo;
	private readonly excludes: Set<NativeSymbol>;
	private readonly cacheScope: protocol.CacheScope | undefined;
	private runnableResult: RunnableResult | undefined;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, tokenInfo: tss.TokenInfo, excludes: Set<NativeSymbol>, cacheScope: protocol.CacheScope | undefined, priority: number = protocol.Priorities.Locals) {
		super(session, project, context, 'TypeOfLocalsRunnable', SnippetLocation.Primary, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.excludes = excludes;
		this.cacheScope = cacheScope;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheInfo = this.cacheScope === undefined ? undefined : { emitMode: protocol.EmitMode.ClientBasedOnTimeout, scope: this.cacheScope };
		this.runnableResult = result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, cacheInfo);
		return this.runnableResult;
	}

	protected override async run(_result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		const anchor = this.tokenInfo.previous ?? this.tokenInfo.token ?? this.tokenInfo.touching;
		const symbols = this.symbols;
		const checker = symbols.getTypeChecker();
		const sourceFile = anchor.getSourceFile();
		// The AST navigation helpers hand out synthesized token nodes, so the checker can only resolve them via a document position.
		const inScope = await symbols.getSymbolsInScope({ document: sourceFile.fileName, position: anchor.getStart(sourceFile) }, SymbolFlags.BlockScopedVariable);
		if (inScope.length === 0) {
			return;
		}

		// When we try to capture locals outside of a callable (e.g. top level in a source file) we capture the declarations as
		// scope. If we are inside the body of the callable defines the scope.
		const cacheNodes = this.cacheScope === undefined ? new Set<Node>() : undefined;
		// The symbols are block scope variables. We try to find the type of the variable
		// to include it in the context.
		for (const symbol of inScope) {
			token.throwIfCancellationRequested();
			if (this.excludes.has(symbol)) {
				continue;
			}
			const declaration: VariableDeclaration | undefined = await symbols.getDeclaration(symbol, SyntaxKind.VariableDeclaration);
			if (declaration === undefined) {
				continue;
			}
			let symbolsToEmit: SymbolData[] | undefined = undefined;
			if (declaration.type !== undefined) {
				symbolsToEmit = await this.getSymbolsForTypeNode(declaration.type);
			} else {
				const type = await checker.getTypeAtLocation(declaration.type ?? declaration);
				if (type !== undefined) {
					symbolsToEmit = await this.getSymbolsToEmitForType(type);
				}
			}
			if (symbolsToEmit === undefined || symbolsToEmit.length === 0) {
				continue;
			}
			for (const { symbol, name } of symbolsToEmit) {
				token.throwIfCancellationRequested();
				await this.handleSymbol(symbol, name);
			}


			if (cacheNodes !== undefined) {
				const declarationList = tss.Nodes.getParentOfKind(declaration, SyntaxKind.VariableDeclarationList);
				if (declarationList !== undefined) {
					cacheNodes.add(declarationList);
				}
			}
		}
		if (cacheNodes !== undefined && cacheNodes.size > 0 && this.runnableResult !== undefined) {
			this.runnableResult.setCacheInfo({ emitMode:protocol.EmitMode.ClientBasedOnTimeout, scope: CacheScopes.createOutsideCacheScope(cacheNodes, sourceFile) });
		}
	}
}

export class TypesOfNeighborFilesRunnable extends AbstractContextRunnable {
	private readonly tokenInfo: tss.TokenInfo;
	private static readonly SymbolsToInclude: number = SymbolFlags.Class | SymbolFlags.Interface | SymbolFlags.TypeAlias | SymbolFlags.RegularEnum | SymbolFlags.ConstEnum | SymbolFlags.Function;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, tokenInfo: tss.TokenInfo, priority: number = protocol.Priorities.NeighborFiles) {
		super(session, project, context, 'TypesOfNeighborFilesRunnable', SnippetLocation.Secondary, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, { emitMode: protocol.EmitMode.ClientBased, scope: { kind: protocol.CacheScopeKind.NeighborFiles } });
	}

	protected override async run(result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		for (const neighborFile of this.context.neighborFiles) {
			token.throwIfCancellationRequested();
			if (result.isSecondaryBudgetExhausted()) {
				return;
			}
			const neighborSourceFile = await this.getProject().program.getSourceFile(neighborFile);
			if (neighborSourceFile === undefined || await this.skipSourceFile(neighborSourceFile)) {
				continue;
			}
			const sourceFileSymbol = await this.symbols.getLeafSymbolAtLocation(neighborSourceFile);
			if (sourceFileSymbol === undefined) {
				continue;
			}
			for (const [name, member] of await sourceFileSymbol.getExports()) {
				if ((member.flags & TypesOfNeighborFilesRunnable.SymbolsToInclude) !== 0 && !await this.handleSymbol(member, name, true)) {
					return;
				}
			}
		}
	}
}

type ImportBlock = { before: Node | undefined; imports: ImportDeclaration[]; after: Node | undefined };

export class ImportsRunnable extends AbstractContextRunnable {
	private readonly tokenInfo: tss.TokenInfo;
	private readonly excludes: Set<NativeSymbol>;
	private cacheInfo: protocol.CacheInfo | undefined;
	private runnableResult: RunnableResult | undefined;

	private static readonly CacheNodes = new Set<SyntaxKind>([
		SyntaxKind.FunctionDeclaration,
		SyntaxKind.ArrowFunction,
		SyntaxKind.FunctionExpression,
		SyntaxKind.Constructor,
		SyntaxKind.MethodDeclaration,
		SyntaxKind.ClassDeclaration,
		SyntaxKind.ModuleDeclaration,
	]);

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, tokenInfo: tss.TokenInfo, excludes: Set<NativeSymbol>, priority: number = protocol.Priorities.Imports) {
		super(session, project, context, 'ImportsRunnable', SnippetLocation.Secondary, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.excludes = excludes;
		const scopeNode = this.getCacheScopeNode();
		this.cacheInfo = scopeNode === undefined ? undefined : { emitMode: protocol.EmitMode.ClientBased, scope: this.createCacheScope(scopeNode) };
	}

	public override getActiveSourceFile(): SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	public override useCachedResult(cached: protocol.CachedContextRunnableResult): boolean {
		if (cached.cache?.emitMode === protocol.EmitMode.ClientBased && cached.state === protocol.ContextRunnableState.Finished) {
			if (cached.cache.scope.kind === protocol.CacheScopeKind.WithinRange) {
				return true;
			}
			if (cached.cache.scope.kind === protocol.CacheScopeKind.OutsideRange) {
				return this.cacheInfo === undefined;
			}
		}
		return super.useCachedResult(cached);
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		this.runnableResult = result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, this.cacheInfo);
		return this.runnableResult;
	}

	protected override async run(_result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		const sourceFile = this.getActiveSourceFile();
		const importBlocks = this.getImportBlocks(sourceFile);
		const importedSymbols: { symbol: NativeSymbol; name: string }[] = [];
		const outsideRanges: protocol.Range[] = [];
		for (const block of importBlocks) {
			for (const statement of block.imports) {
				token.throwIfCancellationRequested();
				const importClause = statement.importClause;
				if (importClause?.name !== undefined) {
					await this.addImportedSymbol(importedSymbols, importClause.name);
				}
				const bindings = importClause?.namedBindings;
				if (bindings !== undefined) {
					if (isNamespaceImport(bindings)) {
						await this.addImportedSymbol(importedSymbols, bindings.name);
					} else if (isNamedImports(bindings)) {
						for (const element of bindings.elements) {
							await this.addImportedSymbol(importedSymbols, element.name);
						}
					}
				}
			}
			if (this.cacheInfo === undefined && block.imports.length > 0) {
				outsideRanges.push({
					start: block.before === undefined ? CacheScopes.createRange(block.imports[0], sourceFile).start : CacheScopes.createRange(block.before, sourceFile).end,
					end: block.after === undefined ? CacheScopes.createRange(block.imports.at(-1) ?? block.imports[0], sourceFile).end : CacheScopes.createRange(block.after, sourceFile).start,
				});
			}
		}
		for (const { symbol, name } of importedSymbols) {
			if ((symbol.flags & (SymbolFlags.Class | SymbolFlags.Interface | SymbolFlags.TypeAlias | SymbolFlags.RegularEnum | SymbolFlags.ConstEnum | SymbolFlags.Alias | SymbolFlags.ValueModule)) !== 0 && !await this.handleSymbol(symbol, name, true)) {
				break;
			}
		}
		if (this.cacheInfo === undefined && outsideRanges.length > 0) {
			this.runnableResult?.setCacheInfo({ emitMode: protocol.EmitMode.ClientBased, scope: { kind: protocol.CacheScopeKind.OutsideRange, ranges: outsideRanges } });
		}
	}

	private async addImportedSymbol(result: { symbol: NativeSymbol; name: string }[], node: Node): Promise<void> {
		const symbol = await this.symbols.getLeafSymbolAtLocation(node);
		if (symbol !== undefined && !this.excludes.has(symbol)) {
			result.push({ symbol, name: node.getText() });
		}
	}

	private getImportBlocks(sourceFile: SourceFile): ImportBlock[] {
		if (this.cacheInfo !== undefined) {
			return [{ before: undefined, imports: sourceFile.statements.filter(isImportDeclaration), after: undefined }];
		}
		const result: ImportBlock[] = [];
		let before: Node | undefined;
		let imports: ImportDeclaration[] = [];
		for (const node of sourceFile.statements) {
			if (isImportDeclaration(node)) {
				imports.push(node);
			} else if (imports.length === 0) {
				before = node;
			} else {
				result.push({ before, imports, after: node });
				before = undefined;
				imports = [];
			}
		}
		if (imports.length > 0) {
			result.push({ before, imports, after: undefined });
		}
		return result;
	}

	private getCacheScopeNode(): Node | undefined {
		let current: Node | undefined = this.tokenInfo.touching ?? this.tokenInfo.token;
		let result: Node | undefined;
		while (current !== undefined && current.kind !== SyntaxKind.SourceFile) {
			if (ImportsRunnable.CacheNodes.has(current.kind)) {
				result = current;
			}
			current = current.parent;
		}
		return result;
	}
}

export class TypeOfExpressionRunnable extends AbstractContextRunnable {
	private readonly expression: Node;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, expression: Node, priority: number = protocol.Priorities.Expression) {
		super(session, project, context, 'TypeOfExpressionRunnable', SnippetLocation.Primary, priority, ComputeCost.Low);
		this.expression = expression;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.expression.getSourceFile();
	}

	public static create(session: ComputeContextSession, project: Project, context: RequestContext, tokenInfo: tss.TokenInfo, _token: CancellationTokenWithTimer): TypeOfExpressionRunnable | undefined {
		const previous = tokenInfo.previous;
		if (previous !== undefined && (isIdentifier(previous) || previous.kind === SyntaxKind.DotToken) && isPropertyAccessExpression(previous.parent)) {
			const identifier = this.getRightMostIdentifier(previous.parent.expression, 0);
			if (identifier !== undefined) {
				return new TypeOfExpressionRunnable(session, project, context, identifier);
			}
		}
		return undefined;
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.ignore);
	}

	protected override async run(_result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		const expressionSymbol = await this.symbols.getLeafSymbolAtLocation(this.expression);
		if (expressionSymbol === undefined) {
			return;
		}
		const checker = this.getProject().checker;
		const type = await checker.getTypeOfSymbolAtLocation(expressionSymbol, this.expression);
		for (const signature of [
			...await checker.getSignaturesOfType(type, SignatureKind.Construct),
			...await checker.getSignaturesOfType(type, SignatureKind.Call),
		]) {
			token.throwIfCancellationRequested();
			const returnType = await checker.getReturnTypeOfSignature(signature);
			if (returnType === undefined) {
				continue;
			}
			for (const symbol of await this.symbols.getTypeSymbols(returnType)) {
				await this.handleSymbol(symbol, symbol.name);
			}
		}
		for (const symbol of await this.symbols.getTypeSymbols(type)) {
			await this.handleSymbol(symbol, symbol.name);
		}
	}

	private static getRightMostIdentifier(node: Node, count: number): Node | undefined {
		if (count === 32) {
			return undefined;
		}
		if (isIdentifier(node)) {
			return node;
		}
		if (isPropertyAccessExpression(node)) {
			return this.getRightMostIdentifier(node.name, count + 1);
		}
		if (isElementAccessExpression(node)) {
			return node.argumentExpression === undefined ? undefined : this.getRightMostIdentifier(node.argumentExpression, count + 1);
		}
		if (isCallExpression(node)) {
			return this.getRightMostIdentifier(node.expression, count + 1);
		}
		return undefined;
	}
}

export abstract class FunctionLikeContextProvider extends ContextProvider {
	protected readonly functionLikeDeclaration: FunctionLikeDeclaration;
	protected readonly tokenInfo: tss.TokenInfo;
	protected readonly computeContext: ProviderComputeContext;
	public override readonly isCallableProvider: boolean = true;

	constructor(declaration: FunctionLikeDeclaration, tokenInfo: tss.TokenInfo, computeContext: ProviderComputeContext) {
		super();
		this.functionLikeDeclaration = declaration;
		this.tokenInfo = tokenInfo;
		this.computeContext = computeContext;
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		token.throwIfCancellationRequested();
		result.addPrimary(new SignatureRunnable(session, project, context, this.functionLikeDeclaration));
		if (!this.computeContext.isFirstCallableProvider(this)) {
			return;
		}
		const excludes = await this.getTypeExcludes(project, context);
		result.addPrimary(new TypeOfLocalsRunnable(session, project, context, this.tokenInfo, excludes, CacheScopes.fromDeclaration(this.functionLikeDeclaration)));
		const expression = TypeOfExpressionRunnable.create(session, project, context, this.tokenInfo, token);
		if (expression !== undefined) {
			result.addPrimary(expression);
		}
		result.addSecondary(new ImportsRunnable(session, project, context, this.tokenInfo, excludes));
		if (context.neighborFiles.length > 0) {
			result.addTertiary(new TypesOfNeighborFilesRunnable(session, project, context, this.tokenInfo));
		}
	}

	protected abstract getTypeExcludes(project: Project, context: RequestContext): Promise<Set<NativeSymbol>>;
}

export function isFunctionContextNode(node: Node): node is FunctionLikeDeclaration {
	return isFunctionDeclaration(node) || isFunctionExpression(node) || isArrowFunction(node);
}

export function isCompositeTypeNode(node: TypeNode): boolean {
	return isTypeReferenceNode(node) || isTypeLiteralNode(node) || isUnionTypeNode(node) || isIntersectionTypeNode(node);
}
