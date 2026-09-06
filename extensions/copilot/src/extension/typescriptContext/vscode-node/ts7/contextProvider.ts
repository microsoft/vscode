/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project, Symbol as NativeSymbol, Type } from '@typescript/native/unstable/async';
import {
	isIntersectionTypeNode,
	isTypeAliasDeclaration,
	isTypeLiteralNode,
	isTypeReferenceNode,
	isUnionTypeNode,
	type FunctionLikeDeclaration,
	type Node,
	type NodeArray,
	type SourceFile,
	type TypeAliasDeclaration,
	type TypeNode,
} from '@typescript/native/unstable/ast';
import { CodeSnippetBuilder } from './code';
import * as protocol from '../../common/serverProtocol';
import { type CodeCacheItem, type EmitterContext, ProgramContext, RecoverableError, type SnippetProvider } from './types';
import tss, { type CancellationTokenWithTimer, Symbols, Types } from './typescripts';

export class RequestContext {
	private readonly symbols: Map<Project, Symbols> = new Map();
	private readonly clientSideContextItems: Map<protocol.ContextItemKey, protocol.CachedContextItem> = new Map();

	public readonly neighborFiles: readonly string[];
	public readonly clientSideRunnableResults: Map<protocol.ContextRunnableResultId, protocol.CachedContextRunnableResult>;
	public readonly session: ComputeContextSession;
	public readonly includeDocumentation: boolean;

	constructor(session: ComputeContextSession, neighborFiles: readonly string[], clientSideRunnableResults: Map<protocol.ContextRunnableResultId, protocol.CachedContextRunnableResult>, includeDocumentation: boolean) {
		this.session = session;
		this.neighborFiles = neighborFiles;
		this.clientSideRunnableResults = clientSideRunnableResults;
		this.includeDocumentation = includeDocumentation;
		for (const runnableResult of clientSideRunnableResults.values()) {
			for (const item of runnableResult.items) {
				this.clientSideContextItems.set(item.key, item);
			}
		}
	}

	public getSymbols(project: Project): Symbols {
		let result = this.symbols.get(project);
		if (result === undefined) {
			result = new Symbols(project, this.session.token);
			this.symbols.set(project, result);
		}
		return result;
	}

	public async getPreferredNeighborFiles(project: Project): Promise<SourceFile[]> {
		const result: SourceFile[] = [];
		for (const file of this.neighborFiles) {
			const sourceFile = await project.program.getSourceFile(file);
			if (sourceFile !== undefined) {
				result.push(sourceFile);
			}
		}
		return result;
	}

	public createContextItemReferenceIfManaged(key: protocol.ContextItemKey): protocol.ContextItemReference | undefined {
		const cachedItem = this.clientSideContextItems.get(key);
		return cachedItem === undefined ? undefined : protocol.ContextItemReference.create(cachedItem.key);
	}

	public clientHasContextItem(key: protocol.ContextItemKey): boolean {
		return this.clientSideContextItems.has(key);
	}
}

export abstract class Search<R> extends ProgramContext {
	protected readonly project: Project;
	protected readonly symbols: Symbols;

	constructor(project: Project, symbols: Symbols) {
		super();
		if (project !== symbols.getProject()) {
			throw new Error('Project and symbols project must match');
		}
		this.project = project;
		this.symbols = symbols;
	}

	public getSymbols(): Symbols {
		return this.symbols;
	}

	protected getProject(): Project {
		return this.project;
	}

	public abstract with(project: Project, symbols: Symbols): Search<R>;
	public abstract score(project: Project, context: RequestContext): Promise<number>;
	public abstract run(context: RequestContext, token: CancellationTokenWithTimer): Promise<R | undefined>;
}

export class ComputeContextSession implements EmitterContext {
	public readonly project: Project;
	public readonly token: CancellationTokenWithTimer;

	private readonly codeCache: Map<string, CodeCacheItem> = new Map();

	constructor(project: Project, token: CancellationTokenWithTimer) {
		this.project = project;
		this.token = token;
	}

	public async run<R>(search: Search<R>, context: RequestContext, token: CancellationTokenWithTimer): Promise<[Project | undefined, R | undefined]> {
		const symbols = context.getSymbols(this.project);
		const projectSearch = search.with(this.project, symbols);
		if (await projectSearch.score(this.project, context) <= 0) {
			return [undefined, undefined];
		}
		const result = await projectSearch.run(context, token);
		return result === undefined ? [undefined, undefined] : [this.project, result];
	}

	public getCachedCode(key: string): CodeCacheItem | undefined {
		return this.codeCache.get(key);
	}

	public cacheCode(key: string, code: CodeCacheItem): void {
		this.codeCache.set(key, code);
	}

	public enableBlueprintSearch(): boolean {
		return false;
	}
}

export interface RunnableResultContext {
	createContextItemReference(key: protocol.ContextItemKey): protocol.ContextItemReference | undefined;
	manageContextItem(item: protocol.FullContextItem): protocol.ContextItem;
}

export enum SnippetLocation {
	Primary,
	Secondary,
}

export class RunnableResult {
	private readonly id: string;
	private readonly runnableResultContext: RunnableResultContext;
	private readonly primaryBudget: CharacterBudget;
	private readonly secondaryBudget: CharacterBudget;
	private state: protocol.ContextRunnableState;
	private speculativeKind: protocol.SpeculativeKind;
	private cache: protocol.CacheInfo | undefined;

	public readonly priority: number;
	public readonly items: Map<string, protocol.ContextItem>;
	public debugPath: string | undefined;

	constructor(id: protocol.ContextRunnableResultId, priority: number, runnableResultContext: RunnableResultContext, primaryBudget: CharacterBudget, secondaryBudget: CharacterBudget, speculativeKind: protocol.SpeculativeKind, cache?: protocol.CacheInfo) {
		this.id = id;
		this.priority = priority;
		this.runnableResultContext = runnableResultContext;
		this.primaryBudget = primaryBudget;
		this.secondaryBudget = secondaryBudget;
		this.state = protocol.ContextRunnableState.Created;
		this.speculativeKind = speculativeKind;
		this.cache = cache;
		this.items = new Map<string, protocol.ContextItem>();
	}

	public isPrimaryBudgetExhausted(): boolean {
		if (this.primaryBudget.isExhausted()) {
			this.state = protocol.ContextRunnableState.IsFull;
			return true;
		}
		return false;
	}

	public isSecondaryBudgetExhausted(): boolean {
		return this.secondaryBudget.isExhausted();
	}

	public done(): void {
		if (this.state === protocol.ContextRunnableState.Created || this.state === protocol.ContextRunnableState.InProgress) {
			this.state = protocol.ContextRunnableState.Finished;
		}
	}

	public setCacheInfo(cache: protocol.CacheInfo): void {
		this.cache = cache;
	}

	public addFromKnownItems(key: string): boolean {
		this.state = protocol.ContextRunnableState.InProgress;
		const reference = this.runnableResultContext.createContextItemReference(key);
		if (reference === undefined) {
			return false;
		}
		this.items.set(key, reference);
		return true;
	}

	public addTrait(traitKind: protocol.TraitKind, name: string, value: string, key: string): void {
		this.state = protocol.ContextRunnableState.InProgress;
		const trait = protocol.Trait.create(traitKind, name, value);
		this.items.set(key ?? crypto.randomUUID(), this.runnableResultContext.manageContextItem(trait));
		this.primaryBudget.spent(protocol.Trait.sizeInChars(trait));
	}

	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined): void;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: false): void;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: true): boolean;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: boolean): boolean;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: boolean = false): boolean {
		const budget = location === SnippetLocation.Primary ? this.primaryBudget : this.secondaryBudget;
		if (code.isEmpty()) {
			return true;
		}
		const snippet = code.snippet(key);
		const size = protocol.CodeSnippet.sizeInChars(snippet);
		if (ifRoom && !budget.hasRoom(size)) {
			this.state = protocol.ContextRunnableState.IsFull;
			return false;
		}
		this.state = protocol.ContextRunnableState.InProgress;
		budget.spent(size);
		this.items.set(key ?? crypto.randomUUID(), this.runnableResultContext.manageContextItem(snippet));
		return true;
	}

	public toJson(): protocol.ContextRunnableResult {
		return {
			kind: protocol.ContextRunnableResultKind.ComputedResult,
			id: this.id,
			state: this.state,
			priority: this.priority,
			items: Array.from(this.items.values()),
			cache: this.cache,
			speculativeKind: this.speculativeKind,
			debugPath: this.debugPath,
		};
	}
}

class RunnableResultReference {
	private readonly cached: protocol.CachedContextRunnableResult;

	constructor(cached: protocol.CachedContextRunnableResult) {
		this.cached = cached;
	}

	public get items(): protocol.ContextItem[] {
		return this.cached.items.map(item => protocol.ContextItemReference.create(item.key));
	}

	public toJson(): protocol.ContextRunnableResultReference {
		return { kind: protocol.ContextRunnableResultKind.Reference, id: this.cached.id };
	}
}

export class ContextResult implements RunnableResultContext {
	public readonly primaryBudget: CharacterBudget;
	public readonly secondaryBudget: CharacterBudget;
	public readonly context: RequestContext;

	private state: protocol.ContextRequestResultState = protocol.ContextRequestResultState.Created;
	private path: number[] | undefined;
	private timings: protocol.Timings | undefined;
	private timedOut: boolean = false;
	private readonly errors: protocol.ErrorData[] = [];
	private readonly runnableResults: (RunnableResult | RunnableResultReference)[] = [];
	private readonly contextItems: Map<protocol.ContextItemKey, protocol.FullContextItem> = new Map();

	constructor(primaryBudget: CharacterBudget, secondaryBudget: CharacterBudget, context: RequestContext) {
		this.primaryBudget = primaryBudget;
		this.secondaryBudget = secondaryBudget;
		this.context = context;
	}

	public getSession(): ComputeContextSession {
		return this.context.session;
	}

	public addPath(path: number[]): void {
		this.path = path;
	}

	public addErrorData(error: RecoverableError): void {
		this.errors.push(protocol.ErrorData.create(error.code, error.message));
	}

	public addTimings(totalTime: number, computeTime: number): void {
		this.timings = protocol.Timings.create(totalTime, computeTime);
	}

	public setTimedOut(timedOut: boolean): void {
		this.timedOut = timedOut;
	}

	public createRunnableResult(id: protocol.ContextRunnableResultId, priority: number, speculativeKind: protocol.SpeculativeKind, cache?: protocol.CacheInfo): RunnableResult {
		this.state = protocol.ContextRequestResultState.InProgress;
		const result = new RunnableResult(id, priority, this, this.primaryBudget, this.secondaryBudget, speculativeKind, cache);
		this.runnableResults.push(result);
		return result;
	}

	public addRunnableResultReference(cached: protocol.CachedContextRunnableResult): void {
		this.state = protocol.ContextRequestResultState.InProgress;
		this.runnableResults.push(new RunnableResultReference(cached));
	}

	public createContextItemReference(key: protocol.ContextItemKey): protocol.ContextItemReference | undefined {
		return this.context.createContextItemReferenceIfManaged(key)
			?? (this.contextItems.has(key) ? protocol.ContextItemReference.create(key) : undefined);
	}

	public manageContextItem(item: protocol.FullContextItem): protocol.ContextItem {
		if (!protocol.ContextItem.hasKey(item)) {
			return item;
		}
		if (this.context.clientHasContextItem(item.key) || this.contextItems.has(item.key)) {
			return protocol.ContextItemReference.create(item.key);
		}
		this.contextItems.set(item.key, item);
		return protocol.ContextItemReference.create(item.key);
	}

	public done(): void {
		this.state = protocol.ContextRequestResultState.Finished;
	}

	public toJson(): protocol.ComputeContextResponse.OK {
		return {
			state: this.state,
			path: this.path,
			timings: this.timings,
			errors: this.errors,
			timedOut: this.timedOut,
			exhausted: this.primaryBudget.isExhausted(),
			runnableResults: this.runnableResults.map(result => result.toJson()),
			contextItems: Array.from(this.contextItems.values()),
		};
	}
}

export enum ComputeCost {
	Low = 1,
	Medium = 2,
	High = 3,
}

export namespace CacheScopes {
	export function fromDeclaration(declaration: FunctionLikeDeclaration): protocol.CacheScope | undefined {
		return declaration.body === undefined ? undefined : createWithinCacheScope(declaration.body, declaration.getSourceFile());
	}

	export function createWithinCacheScope(node: Node | NodeArray<Node>, sourceFile?: SourceFile): protocol.CacheScope {
		return { kind: protocol.CacheScopeKind.WithinRange, range: createRange(node, sourceFile) };
	}

	export function createOutsideCacheScope(nodes: Iterable<Node>, sourceFile: SourceFile): protocol.CacheScope {
		const ranges = Array.from(nodes, node => createRange(node, sourceFile));
		ranges.sort((first, second) => first.start.line - second.start.line || first.start.character - second.start.character);
		return { kind: protocol.CacheScopeKind.OutsideRange, ranges };
	}

	export function createRange(node: Node | NodeArray<Node>, sourceFile?: SourceFile): protocol.Range {
		let startOffset: number;
		let endOffset: number;
		if (Array.isArray(node)) {
			startOffset = node.pos;
			endOffset = node.end;
		} else {
			const syntaxNode = node as Node;
			sourceFile ??= syntaxNode.getSourceFile();
			startOffset = syntaxNode.getStart(sourceFile);
			endOffset = syntaxNode.getEnd();
		}
		if (sourceFile === undefined) {
			throw new Error('No source file for cache range');
		}
		return {
			start: sourceFile.getLineAndCharacterOfPosition(startOffset),
			end: sourceFile.getLineAndCharacterOfPosition(endOffset),
		};
	}
}

export interface ContextRunnable {
	readonly id: protocol.ContextRunnableResultId;
	readonly priority: number;
	readonly cost: ComputeCost;
	initialize(result: ContextResult): void;
	compute(token: CancellationTokenWithTimer): Promise<void>;
}

class CacheBasedContextRunnable implements ContextRunnable {
	private readonly cached: protocol.CachedContextRunnableResult;
	private tokenBudget: CharacterBudget | undefined;

	public readonly id: protocol.ContextRunnableResultId;
	public readonly priority: number;
	public readonly cost: ComputeCost;

	constructor(cached: protocol.CachedContextRunnableResult, priority: number, cost: ComputeCost) {
		this.cached = cached;
		this.id = cached.id;
		this.priority = priority;
		this.cost = cost;
	}

	public initialize(result: ContextResult): void {
		this.tokenBudget = result.primaryBudget;
		result.addRunnableResultReference(this.cached);
	}

	public async compute(): Promise<void> {
		for (const item of this.cached.items) {
			this.tokenBudget?.spent(item.sizeInChars ?? 0);
		}
	}
}

export type SymbolData = { symbol: NativeSymbol; name?: string };

enum SymbolEmitDataKind {
	symbol = 'symbol',
	typeAlias = 'typeAlias',
}

type SymbolEmitData = { kind: SymbolEmitDataKind.symbol; symbol: NativeSymbol; name?: string };
type TypeAliasEmitData = { kind: SymbolEmitDataKind.typeAlias; node: TypeAliasDeclaration };
type EmitData = SymbolEmitData | TypeAliasEmitData;

export abstract class AbstractContextRunnable implements ContextRunnable {
	public readonly session: ComputeContextSession;
	public readonly symbols: Symbols;
	public readonly id: protocol.ContextRunnableResultId;
	protected readonly location: SnippetLocation;
	public readonly priority: number;
	public readonly cost: ComputeCost;

	protected readonly project: Project;
	protected readonly context: RequestContext;
	private result: RunnableResult | undefined;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, id: protocol.ContextRunnableResultId, location: SnippetLocation, priority: number, cost: ComputeCost) {
		this.session = session;
		this.project = project;
		this.context = context;
		this.symbols = context.getSymbols(project);
		this.id = id;
		this.location = location;
		this.priority = priority;
		this.cost = cost;
	}

	public initialize(result: ContextResult): void {
		if (this.result !== undefined) {
			throw new Error('Runnable already initialized');
		}
		this.result = this.createRunnableResult(result);
	}

	public useCachedResult(cached: protocol.CachedContextRunnableResult): boolean {
		const cacheInfo = cached.cache;
		if (cacheInfo?.emitMode !== protocol.EmitMode.ClientBased) {
			return false;
		}
		if (cached.state === protocol.ContextRunnableState.Finished) {
			return true;
		}
		if (cached.state !== protocol.ContextRunnableState.IsFull) {
			return false;
		}
		const kind = cacheInfo.scope.kind;
		return kind === protocol.CacheScopeKind.WithinRange || kind === protocol.CacheScopeKind.NeighborFiles || kind === protocol.CacheScopeKind.File;
	}

	public async compute(token: CancellationTokenWithTimer): Promise<void> {
		if (this.result === undefined) {
			throw new Error('Runnable not initialized');
		}
		token.throwIfCancellationRequested();
		if (!this.result.isPrimaryBudgetExhausted()) {
			await this.run(this.result, token);
			this.result.done();
		}
	}

	public abstract getActiveSourceFile(): SourceFile;
	protected abstract createRunnableResult(result: ContextResult): RunnableResult;
	protected abstract run(result: RunnableResult, token: CancellationTokenWithTimer): Promise<void>;

	protected getProject(): Project {
		return this.project;
	}

	protected createCacheScope(node: Node | NodeArray<Node>, sourceFile?: SourceFile): protocol.CacheScope {
		return CacheScopes.createWithinCacheScope(node, sourceFile);
	}

	protected async handleSymbol(symbol: NativeSymbol, name?: string, ifRoom: boolean = false): Promise<boolean> {
		if (this.result === undefined) {
			return true;
		}
		const emitData = await this.getEmitDataForSymbol(symbol, name);
		for (const item of emitData) {
			if (item.kind === SymbolEmitDataKind.typeAlias) {
				if (await this.skipNode(item.node)) {
					continue;
				}
				const key = await this.symbols.createKey(item.node);
				if (key !== undefined && this.result.addFromKnownItems(key)) {
					continue;
				}
				const builder = new CodeSnippetBuilder(this.context, this.symbols, this.getActiveSourceFile());
				await builder.addDeclaration(item.node);
				if (!builder.isEmpty() && !this.result.addSnippet(builder, this.location, key, ifRoom)) {
					return false;
				}
			} else {
				if (Symbols.isTypeParameter(item.symbol) || await this.skipSymbolBasedOnDeclaration(item.symbol)) {
					continue;
				}
				const key = await this.symbols.createKey(item.symbol);
				if (key !== undefined && this.result.addFromKnownItems(key)) {
					continue;
				}
				const builder = new CodeSnippetBuilder(this.context, this.symbols, this.getActiveSourceFile());
				await builder.addTypeSymbol(item.symbol, item.name);
				if (!builder.isEmpty() && !this.result.addSnippet(builder, this.location, key, ifRoom)) {
					return false;
				}
			}
		}
		return true;
	}

	protected async skipNode(node: Node): Promise<boolean> {
		return this.skipSourceFile(node.getSourceFile());
	}

	protected async skipSourceFile(sourceFile: SourceFile): Promise<boolean> {
		if (this.getActiveSourceFile().path === sourceFile.path) {
			return true;
		}
		const metadata = await this.project.program.getSourceFileMetadataByPath(sourceFile.path);
		return metadata?.isDefaultLibrary === true || metadata?.isFromExternalLibrary === true;
	}

	protected async skipSymbolBasedOnDeclaration(symbol: NativeSymbol): Promise<boolean> {
		for (const declaration of await this.symbols.getDeclarations(symbol)) {
			if (await this.skipSourceFile(declaration.getSourceFile())) {
				return true;
			}
		}
		return false;
	}

	protected async getSymbolsForTypeNode(node: TypeNode): Promise<SymbolData[]> {
		const result: SymbolData[] = [];
		await this.doGetSymbolsForTypeNode(result, node);
		return result;
	}

	protected async getSymbolsToEmitForType(type: Type): Promise<SymbolData[]> {
		return (await this.symbols.getTypeSymbols(type)).map(symbol => ({ symbol, name: symbol.name }));
	}

	private async doGetSymbolsForTypeNode(result: SymbolData[], node: TypeNode): Promise<void> {
		if (isTypeReferenceNode(node)) {
			const symbol = await this.symbols.getLeafSymbolAtLocation(node.typeName);
			if (symbol !== undefined) {
				result.push({ symbol, name: node.typeName.getText() });
			}
		} else if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
			for (const type of node.types) {
				await this.doGetSymbolsForTypeNode(result, type);
			}
		} else if (isTypeLiteralNode(node)) {
			const symbol = await this.symbols.getLeafSymbolAtLocation(node);
			if (symbol !== undefined) {
				result.push({ symbol, name: symbol.name });
			}
		}
	}

	private async getEmitDataForSymbol(symbol: NativeSymbol, name?: string): Promise<EmitData[]> {
		const result: EmitData[] = [];
		await this.doGetEmitDataForSymbol(result, new Set(), 0, symbol, name);
		return result;
	}

	private async doGetEmitDataForSymbol(result: EmitData[], seen: Set<number>, level: number, initialSymbol: NativeSymbol, name?: string): Promise<void> {
		const symbol = Symbols.isAlias(initialSymbol) ? await this.symbols.getLeafSymbol(initialSymbol) : initialSymbol;
		if (seen.has(symbol.id) || level > 2) {
			return;
		}
		seen.add(symbol.id);
		if (!Symbols.isTypeAlias(symbol)) {
			result.push({ kind: SymbolEmitDataKind.symbol, symbol, name });
			return;
		}

		const declaration = (await this.symbols.getDeclarations(symbol)).find(isTypeAliasDeclaration);
		if (declaration === undefined) {
			return;
		}
		name ??= declaration.name.getText();
		const type = declaration.type;
		if (isTypeLiteralNode(type)) {
			let typeSymbol = await this.symbols.getSymbolAtLocation(type);
			if (typeSymbol === undefined) {
				const resolvedType = await this.project.checker.getTypeFromTypeNode(type);
				typeSymbol = resolvedType === undefined ? undefined : await resolvedType.getSymbol();
			}
			if (typeSymbol !== undefined && !seen.has(typeSymbol.id)) {
				result.push({ kind: SymbolEmitDataKind.symbol, symbol: typeSymbol, name });
			}
		} else if (isTypeReferenceNode(type)) {
			const typeSymbol = await this.symbols.getSymbolAtLocation(type.typeName);
			if (typeSymbol !== undefined) {
				await this.doGetEmitDataForSymbol(result, seen, level + 1, typeSymbol, name);
			}
		} else if (isUnionTypeNode(type) || isIntersectionTypeNode(type)) {
			result.push({ kind: SymbolEmitDataKind.typeAlias, node: declaration });
			if (level < 2) {
				for (const item of type.types) {
					for (const data of await this.getSymbolsForTypeNode(item)) {
						await this.doGetEmitDataForSymbol(result, seen, level + 1, data.symbol, data.name);
					}
				}
			}
		}
	}
}

export class ContextRunnableCollector {
	private readonly cachedRunnableResults: Map<string, protocol.CachedContextRunnableResult>;

	public readonly primary: ContextRunnable[] = [];
	public readonly secondary: ContextRunnable[] = [];
	public readonly tertiary: ContextRunnable[] = [];

	constructor(cachedRunnableResults: Map<string, protocol.CachedContextRunnableResult>) {
		this.cachedRunnableResults = cachedRunnableResults;
	}

	public addPrimary(runnable: AbstractContextRunnable): void {
		this.primary.push(this.useCachedRunnableIfPossible(runnable));
	}

	public addSecondary(runnable: AbstractContextRunnable): void {
		this.secondary.push(this.useCachedRunnableIfPossible(runnable));
	}

	public addTertiary(runnable: AbstractContextRunnable): void {
		this.tertiary.push(this.useCachedRunnableIfPossible(runnable));
	}

	public *entries(): IterableIterator<ContextRunnable> {
		yield* this.primary;
		yield* this.secondary;
		yield* this.tertiary;
	}

	public getPrimaryRunnables(): ContextRunnable[] {
		return this.sort(this.primary);
	}

	public getSecondaryRunnables(): ContextRunnable[] {
		return this.sort(this.secondary);
	}

	public getTertiaryRunnables(): ContextRunnable[] {
		return this.sort(this.tertiary);
	}

	private sort(runnables: ContextRunnable[]): ContextRunnable[] {
		return runnables.sort((first, second) => first.cost - second.cost || second.priority - first.priority);
	}

	private useCachedRunnableIfPossible(runnable: AbstractContextRunnable): ContextRunnable {
		const cached = this.cachedRunnableResults.get(runnable.id);
		return cached !== undefined && runnable.useCachedResult(cached)
			? new CacheBasedContextRunnable(cached, runnable.priority, runnable.cost)
			: runnable;
	}
}

export abstract class ContextProvider {
	public isCallableProvider?: boolean;

	public abstract provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void>;
}

export interface ProviderComputeContext {
	isFirstCallableProvider(contextProvider: ContextProvider): boolean;
}

export type ContextProviderFactory = (node: Node, tokenInfo: tss.TokenInfo, context: ProviderComputeContext) => ContextProvider | undefined;

export class TokenBudgetExhaustedError extends Error {
	constructor() {
		super('Budget exhausted');
	}
}

export class CharacterBudget {
	private charBudget: number;
	private readonly lowWaterMark: number;
	private itemRejected: boolean = false;

	constructor(budget: number, lowWaterMark: number = 256) {
		this.charBudget = budget;
		this.lowWaterMark = lowWaterMark;
	}

	public spent(chars: number): void {
		this.charBudget -= chars;
	}

	public hasRoom(chars: number): boolean {
		const result = this.charBudget - this.lowWaterMark >= chars;
		if (!result) {
			this.itemRejected = true;
		}
		return result;
	}

	public isExhausted(): boolean {
		return this.charBudget <= 0;
	}

	public wasItemRejected(): boolean {
		return this.itemRejected;
	}

	public throwIfExhausted(): void {
		if (this.isExhausted()) {
			throw new TokenBudgetExhaustedError();
		}
	}

	public spentAndThrowIfExhausted(chars: number): void {
		this.spent(chars);
		this.throwIfExhausted();
	}
}

export { Types };
