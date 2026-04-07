/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { CodeSnippetBuilder } from './code';
import type { Host } from './host';
import {
	CacheScopeKind, CodeSnippet,
	ContextItem,
	ContextItemReference,
	ContextKind,
	ContextRequestResultState,
	ContextRunnableResultKind,
	ContextRunnableState,
	EmitMode, ErrorData, SpeculativeKind, Timings, Trait, TraitKind,
	type CachedContextItem,
	type CachedContextRunnableResult,
	type CacheInfo, type CacheScope,
	type ContextItemKey,
	type ContextRequestResult,
	type ContextRunnableResult,
	type ContextRunnableResultId,
	type ContextRunnableResultReference,
	type ContextRunnableResultTypes,
	type FullContextItem, type PriorityTag, type Range
} from './protocol';
import { ProgramContext, RecoverableError, type CodeCacheItem, type EmitterContext, type SnippetProvider } from './types';
import tss, { ImportedByState, Symbols, Types } from './typescripts';
import { LRUCache } from './utils';


export class RequestContext {

	private readonly symbols: Map<tt.Program, Symbols>;

	public readonly neighborFiles: tt.server.NormalizedPath[];
	public readonly clientSideRunnableResults: Map<ContextRunnableResultId, CachedContextRunnableResult>;
	private readonly clientSideContextItems: Map<ContextItemKey, CachedContextItem>;

	public readonly session: ComputeContextSession;
	public readonly includeDocumentation: boolean;

	constructor(session: ComputeContextSession, neighborFiles: tt.server.NormalizedPath[], clientSideRunnableResults: Map<ContextRunnableResultId, CachedContextRunnableResult>, includeDocumentation: boolean) {
		this.session = session;
		this.symbols = new Map();
		this.neighborFiles = neighborFiles;
		this.clientSideRunnableResults = clientSideRunnableResults;
		this.clientSideContextItems = new Map();
		for (const rr of clientSideRunnableResults.values()) {
			for (const item of rr.items) {
				this.clientSideContextItems.set(item.key, item);
			}
		}
		this.includeDocumentation = includeDocumentation;
	}

	public getSymbols(program: tt.Program): Symbols {
		let result = this.symbols.get(program);
		if (result === undefined) {
			result = new Symbols(program);
			this.symbols.set(program, result);
		}
		return result;
	}

	public getPreferredNeighborFiles(program: tt.Program): tt.SourceFile[] {
		const result: tt.SourceFile[] = [];
		for (const file of this.neighborFiles) {
			const sourceFile = program.getSourceFile(file);
			if (sourceFile !== undefined) {
				result.push(sourceFile);
			}
		}
		return result;
	}

	public createContextItemReferenceIfManaged(key: ContextItemKey): ContextItemReference | undefined {
		const cachedItem = this.clientSideContextItems.get(key);
		return cachedItem !== undefined
			? ContextItemReference.create(cachedItem.key)
			: undefined;
	}

	public clientHasContextItem(key: ContextItemKey): boolean {
		return this.clientSideContextItems.has(key);
	}
}

export abstract class Search<R> extends ProgramContext {

	protected readonly program: tt.Program;
	protected readonly symbols: Symbols;

	constructor(program: tt.Program, symbols: Symbols = new Symbols(program)) {
		super();
		if (program !== symbols.getProgram()) {
			throw new Error('Program and symbols program must match');
		}
		this.program = program;
		this.symbols = symbols;
	}

	public getSymbols(): Symbols {
		return this.symbols;
	}

	protected override getProgram(): tt.Program {
		return this.program;
	}

	public getHeritageSymbol(node: tt.Node): tt.Symbol | undefined {
		let result = this.symbols.getLeafSymbolAtLocation(node);
		if (result === undefined) {
			return undefined;
		}
		if (Symbols.isAlias(result)) {
			result = this.symbols.getLeafSymbol(result);
		}
		let counter = 0;
		while (Symbols.isTypeAlias(result) && counter < 10) {
			const declarations = result!.declarations;
			if (declarations !== undefined) {
				const start: tt.Symbol = result!;
				for (const declaration of declarations) {
					if (ts.isTypeAliasDeclaration(declaration)) {
						const type = declaration.type;
						if (ts.isTypeReferenceNode(type)) {
							result = this.symbols.getLeafSymbolAtLocation(type.typeName);
						}
					}
				}
				if (start === result) {
					break;
				}
			}
			counter++;
		}
		return result;
	}

	public static getNodeInProgram<T extends tt.Node>(program: tt.Program, node: T): T {
		function sameChain(node: tt.Node | undefined, other: tt.Node | undefined): boolean {
			if (node === undefined || other === undefined) {
				return node === other;
			}
			while (node !== undefined && other !== undefined) {
				if (node.kind !== other.kind || node.pos !== other.pos || node.end !== other.end) {
					return false;
				}
				node = node.parent;
				other = other.parent;
			}
			return node === undefined && other === undefined;
		}
		const fileName = node.getSourceFile().fileName;
		const other = program.getSourceFile(fileName);
		if (other === undefined) {
			throw new RecoverableError(`No source file found for ${fileName}`, RecoverableError.SourceFileNotFound);
		}
		const candidate = tss.getTokenAtPosition(other, node.pos);
		let otherNode = candidate;
		if (otherNode === undefined) {
			throw new RecoverableError(`No node found for ${fileName}:${node.pos}`, RecoverableError.NodeNotFound);
		}

		while (otherNode !== undefined) {
			if (node.pos === otherNode.pos && node.end === otherNode.end && node.kind === otherNode.kind && sameChain(node.parent, otherNode.parent)) {
				return otherNode as T;
			}
			otherNode = otherNode.parent;
		}

		throw new RecoverableError(`Found node ${candidate.kind} for node ${node.kind} in file ${fileName}:${node.pos}`, RecoverableError.NodeKindMismatch);
	}

	public abstract with(program: tt.Program): Search<R>;
	public abstract score(program: tt.Program, context: RequestContext): number;
	public abstract run(context: RequestContext, token: tt.CancellationToken): R | undefined;

}

export interface Logger {
	info(s: string): void;
	msg(s: string, type?: tt.server.Msg): void;
	startGroup(): void;
	endGroup(): void;
}

export class NullLogger implements Logger {
	public info(): void {
	}
	public msg(): void {
	}
	public startGroup(): void {
	}
	public endGroup(): void {
	}
}

export abstract class ComputeContextSession implements tss.StateProvider, EmitterContext {

	public readonly languageServiceHost: tt.LanguageServiceHost;
	public readonly host: Host;

	private readonly codeCache: LRUCache<string, CodeCacheItem>;
	private readonly importedByState: Map<string, ImportedByState>;
	private readonly supportsCaching: boolean;

	protected constructor(languageServiceHost: tt.LanguageServiceHost, host: Host, supportsCaching: boolean) {
		this.languageServiceHost = languageServiceHost;
		this.host = host;
		this.codeCache = new LRUCache(100);
		this.importedByState = new Map();
		this.supportsCaching = supportsCaching;
	}

	public getImportedByState(key: string): ImportedByState {
		let state = this.importedByState.get(key);
		if (state === undefined) {
			state = new ImportedByState(key);
			this.importedByState.set(key, state);
		}
		return state;
	}

	public run<R>(search: Search<R>, context: RequestContext, token: tt.CancellationToken): [tt.Program | undefined, R | undefined] {
		const programsToSearch = this.getPossiblePrograms(search, context);
		for (const program of programsToSearch) {
			const programSearch = search.with(program);
			const result = programSearch.run(context, token);
			if (result !== undefined) {
				return [program, result];
			}
		}
		return [undefined, undefined];
	}

	private getPossiblePrograms<R>(search: Search<R>, context: RequestContext): tt.Program[] {
		const candidates: [number, tt.Program][] = [];
		for (const languageService of this.getLanguageServices()) {
			const program = languageService.getProgram();
			if (program === undefined) {
				continue;
			}
			const score = search.score(program, context);
			if (score > 0) {
				candidates.push([score, program]);
			}
		}
		return candidates.sort((a, b) => b[0] - a[0]).map(c => c[1]);
	}

	public getCachedCode(key: string): CodeCacheItem | undefined;
	public getCachedCode(symbol: tt.Symbol): CodeCacheItem | undefined;
	public getCachedCode(symbolOrKey: tt.Symbol | string, symbol?: tt.Symbol): CodeCacheItem | undefined {
		if (!this.supportsCaching) {
			return undefined;
		}
		if (typeof symbolOrKey === 'string') {
			return this.codeCache.get(symbolOrKey);
		} else {
			const key = Symbols.createVersionedKey(symbol!, this);
			return key === undefined ? undefined : this.codeCache.get(key);
		}
	}

	public cacheCode(key: string, code: CodeCacheItem): void;
	public cacheCode(symbol: tt.Symbol, code: CodeCacheItem): void;
	public cacheCode(symbolOrKey: tt.Symbol | string, code: CodeCacheItem): void {
		if (!this.supportsCaching) {
			return;
		}
		if (typeof symbolOrKey === 'string') {
			this.codeCache.set(symbolOrKey as string, code);
		} else {
			const key = Symbols.createVersionedKey(symbolOrKey, this);
			if (key !== undefined) {
				this.codeCache.set(key, code!);
			}
		}
	}

	public enableBlueprintSearch(): boolean {
		return false;
	}

	public abstract readonly logger: Logger;
	public abstract getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService>;
	public abstract logError(error: Error, cmd: string): void;
	public abstract getScriptVersion(sourceFile: tt.SourceFile): string | undefined;
}


export interface RunnableResultContext {
	createContextItemReference(key: ContextItemKey): ContextItemReference | undefined;
	manageContextItem(item: FullContextItem): ContextItem;
}

export enum SnippetLocation {
	Primary,
	Secondary
}

export class RunnableResult {

	private readonly id: string;
	private readonly runnableResultContext: RunnableResultContext;

	private readonly primaryBudget: CharacterBudget;
	private readonly secondaryBudget: CharacterBudget;
	private state: ContextRunnableState;
	private speculativeKind: SpeculativeKind;
	private cache: CacheInfo | undefined;

	public readonly priority: number;
	public readonly items: ContextItem[];
	public debugPath: string | undefined;

	constructor(id: ContextRunnableResultId, priority: number, runnableResultContext: RunnableResultContext, primaryBudget: CharacterBudget, secondaryBudget: CharacterBudget, speculativeKind: SpeculativeKind, cache?: CacheInfo | undefined) {
		this.id = id;
		this.priority = priority;
		this.runnableResultContext = runnableResultContext;
		this.primaryBudget = primaryBudget;
		this.secondaryBudget = secondaryBudget;
		this.state = ContextRunnableState.Created;
		this.speculativeKind = speculativeKind;
		this.cache = cache;
		this.items = [];
	}

	public isPrimaryBudgetExhausted(): boolean {
		if (this.primaryBudget.isExhausted()) {
			this.state = ContextRunnableState.IsFull;
			return true;
		}
		return false;
	}

	public isSecondaryBudgetExhausted(): boolean {
		return this.secondaryBudget.isExhausted();
	}

	public done(): void {
		if (this.state === ContextRunnableState.Created || this.state === ContextRunnableState.InProgress) {
			this.state = ContextRunnableState.Finished;
		}
	}

	public setCacheInfo(cache: CacheInfo): void {
		this.cache = cache;
	}

	public addFromKnownItems(key: string): boolean {
		this.state = ContextRunnableState.InProgress;
		const reference = this.runnableResultContext.createContextItemReference(key);
		if (reference === undefined) {
			return false;
		}
		this.items.push(reference);
		return true;
	}

	public addTrait(traitKind: TraitKind, name: string, value: string): void {
		this.state = ContextRunnableState.InProgress;
		const trait = Trait.create(traitKind, name, value);
		this.items.push(this.runnableResultContext.manageContextItem(trait));
		this.primaryBudget.spent(Trait.sizeInChars(trait));
	}

	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined): void;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: false): void;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: true): boolean;
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: boolean): boolean
	public addSnippet(code: SnippetProvider, location: SnippetLocation, key: string | undefined, ifRoom: boolean = false): boolean {
		const budget = location === SnippetLocation.Primary ? this.primaryBudget : this.secondaryBudget;
		if (code.isEmpty()) {
			return true;
		}
		const snippet: CodeSnippet = code.snippet(key);
		const size = CodeSnippet.sizeInChars(snippet);
		if (ifRoom && !budget.hasRoom(size)) {
			this.state = ContextRunnableState.IsFull;
			return false;
		}
		this.state = ContextRunnableState.InProgress;
		budget.spent(size);
		this.items.push(this.runnableResultContext.manageContextItem(snippet));
		return true;
	}

	public toJson(): ContextRunnableResult {
		return {
			kind: ContextRunnableResultKind.ComputedResult,
			id: this.id,
			state: this.state,
			priority: this.priority,
			items: this.items,
			cache: this.cache,
			speculativeKind: this.speculativeKind,
			debugPath: this.debugPath
		};
	}
}

class RunnableResultReference {

	private readonly cached: CachedContextRunnableResult;

	constructor(cached: CachedContextRunnableResult) {
		this.cached = cached;
	}

	public get items(): ContextItem[] {
		const result: ContextItem[] = [];
		for (const item of this.cached.items) {
			result.push(ContextItemReference.create(item.key));
		}
		return result;
	}

	public toJson(): ContextRunnableResultReference {
		return {
			kind: ContextRunnableResultKind.Reference,
			id: this.cached.id,
		};
	}
}

export class ContextResult {

	public readonly primaryBudget: CharacterBudget;
	public readonly secondaryBudget: CharacterBudget;
	public readonly context: RequestContext;

	private state: ContextRequestResultState;
	private path: number[] | undefined;
	private timings: Timings | undefined;
	private timedOut: boolean;
	private readonly errors: ErrorData[];

	private readonly runnableResults: (RunnableResult | RunnableResultReference)[] = [];
	private readonly contextItems: Map<ContextItemKey, FullContextItem>;

	constructor(primaryBudget: CharacterBudget, secondaryBudget: CharacterBudget, context: RequestContext) {
		this.primaryBudget = primaryBudget;
		this.secondaryBudget = secondaryBudget;
		this.context = context;
		this.state = ContextRequestResultState.Created;
		this.path = undefined;
		this.timedOut = false;
		this.errors = [];
		this.runnableResults = [];
		this.contextItems = new Map<ContextItemKey, FullContextItem>();
	}

	public getSession(): ComputeContextSession {
		return this.context.session;
	}

	public addPath(path: number[]): void {
		this.path = path;
	}

	public addErrorData(error: RecoverableError): void {
		this.errors.push(ErrorData.create(error.code, error.message));
	}

	public addTimings(totalTime: number, computeTime: number): void {
		this.timings = Timings.create(totalTime, computeTime);
	}

	public setTimedOut(timedOut: boolean): void {
		this.timedOut = timedOut;
	}

	public createRunnableResult(id: ContextRunnableResultId, priority: number, speculativeKind: SpeculativeKind, cache?: CacheInfo | undefined): RunnableResult {
		this.state = ContextRequestResultState.InProgress;
		const result = new RunnableResult(id, priority, this, this.primaryBudget, this.secondaryBudget, speculativeKind, cache);
		this.runnableResults.push(result);
		return result;
	}

	public addRunnableResultReference(cached: CachedContextRunnableResult): void {
		this.state = ContextRequestResultState.InProgress;
		this.runnableResults.push(new RunnableResultReference(cached));
	}

	public createContextItemReference(key: ContextItemKey): ContextItemReference | undefined {
		const clientSide = this.context.createContextItemReferenceIfManaged(key);
		if (clientSide !== undefined) {
			return clientSide;
		}
		const serverSide = this.contextItems.get(key);
		if (serverSide !== undefined) {
			return ContextItemReference.create(key);
		}
		return undefined;
	}

	public manageContextItem(item: FullContextItem): ContextItem {
		if (!ContextItem.hasKey(item)) {
			return item;
		}
		const key = item.key;
		if (this.context.clientHasContextItem(key)) {
			// The item is already known on the client side.
			return ContextItemReference.create(key);
		}
		if (this.contextItems.has(key)) {
			// The item is already known on the server side.
			return ContextItemReference.create(key);
		}
		this.contextItems.set(key, item);
		return ContextItemReference.create(key);
	}

	public done(): void {
		this.state = ContextRequestResultState.Finished;
	}

	public items(): (FullContextItem & PriorityTag)[] {
		const seen: Set<ContextItemKey> = new Set();
		const items: (FullContextItem & PriorityTag)[] = [];
		const runnableResults: RunnableResult[] = this.runnableResults.slice().filter(item => item instanceof RunnableResult).sort((a, b) => {
			return a.priority < b.priority ? 1 : a.priority > b.priority ? -1 : 0;
		});
		for (const runnableResult of runnableResults) {
			for (const item of runnableResult.items) {
				if (item.kind === ContextKind.Reference) {
					if (seen.has(item.key)) {
						// We have already seen this item, skip it.
						continue;
					}
					seen.add(item.key);
					const referenced = this.contextItems.get(item.key);
					if (referenced !== undefined) {
						const withPriority = Object.assign({}, referenced, { priority: runnableResult.priority }) as FullContextItem & PriorityTag;
						items.push(withPriority);
					}
				} else {
					const withPriority = Object.assign({}, item, { priority: runnableResult.priority }) as FullContextItem & PriorityTag;
					items.push(withPriority);
				}
			}
		}
		return items;
	}

	public toJson(): ContextRequestResult {
		const runnableResults: ContextRunnableResultTypes[] = [];
		for (const runnableResult of this.runnableResults) {
			runnableResults.push(runnableResult.toJson());
		}
		return {
			state: this.state,
			path: this.path,
			timings: this.timings,
			errors: this.errors,
			timedOut: this.timedOut,
			exhausted: this.primaryBudget.isExhausted(),
			runnableResults: runnableResults,
			contextItems: Array.from(this.contextItems.values())
		};
	}
}

export enum ComputeCost {
	Low = 1,
	Medium = 2,
	High = 3
}

export namespace CacheScopes {
	export function fromDeclaration(declaration: tt.FunctionLikeDeclarationBase): CacheScope | undefined {
		const body = declaration.body;
		if (body === undefined || !ts.isBlock(body)) {
			return undefined;
		}
		return createWithinCacheScope(body, declaration.getSourceFile());
	}

	export function createWithinCacheScope(node: tt.Node, sourceFile?: tt.SourceFile | undefined): CacheScope;
	export function createWithinCacheScope(node: tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): CacheScope;
	export function createWithinCacheScope(node: tt.Node | tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): CacheScope {
		if (isNodeArray(node)) {
			return {
				kind: CacheScopeKind.WithinRange,
				range: createRange(node as tt.NodeArray<tt.Node>, sourceFile),
			};
		} else {
			return {
				kind: CacheScopeKind.WithinRange,
				range: createRange(node as tt.Node, sourceFile),
			};
		}
	}

	export function createOutsideCacheScope(nodes: Iterable<tt.Node>, sourceFile: tt.SourceFile | undefined): CacheScope {
		const ranges: Range[] = [];
		for (const node of nodes) {
			ranges.push(createRange(node, sourceFile));
		}
		ranges.sort((a, b) => {
			if (a.start.line !== b.start.line) {
				return a.start.line - b.start.line;
			}
			return a.start.character - b.start.character;
		});
		return {
			kind: CacheScopeKind.OutsideRange,
			ranges
		};
	}

	export function createRange(node: tt.Node, sourceFile?: tt.SourceFile | undefined): Range;
	export function createRange(node: tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): Range;
	export function createRange(node: tt.Node | tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): Range {
		let startOffset: number;
		let endOffset: number;
		if (isNodeArray(node)) {
			startOffset = node.pos;
			endOffset = node.end;
		} else {
			startOffset = node.getStart(sourceFile);
			endOffset = node.getEnd();
			if (sourceFile === undefined) {
				sourceFile = node.getSourceFile();
			}
		}
		const start = ts.getLineAndCharacterOfPosition(sourceFile!, startOffset);
		const end = ts.getLineAndCharacterOfPosition(sourceFile!, endOffset);
		return { start, end };
	}

	function isNodeArray(node: tt.Node | tt.NodeArray<tt.Node>): node is tt.NodeArray<tt.Node> {
		return Array.isArray(node);
	}
}

export interface ContextRunnable {
	readonly id: ContextRunnableResultId;
	readonly priority: number;
	readonly cost: ComputeCost;
	initialize(result: ContextResult): void;
	compute(token: tt.CancellationToken): void;
}

class CacheBasedContextRunnable implements ContextRunnable {

	private readonly cached: CachedContextRunnableResult;
	private tokenBudget: CharacterBudget | undefined;

	public readonly id: ContextRunnableResultId;
	public readonly priority: number;
	public readonly cost: ComputeCost;

	constructor(cached: CachedContextRunnableResult, priority: number, cost: ComputeCost) {
		this.cached = cached;
		this.id = cached.id;
		this.priority = priority;
		this.cost = cost;
	}

	initialize(result: ContextResult): void {
		this.tokenBudget = result.primaryBudget;
		result.addRunnableResultReference(this.cached);
	}

	compute(): void {
		if (this.tokenBudget === undefined) {
			return;
		}
		// Update the token budget.
		for (const item of this.cached.items) {
			this.tokenBudget.spent(item.sizeInChars ?? 0);
		}
	}
}

export type SymbolData = {
	symbol: tt.Symbol;
	name?: string;
}

enum SymbolEmitDataKind {
	symbol = 'symbol',
	typeAlias = 'typeAlias',
}

type SymbolEmitData = {
	kind: SymbolEmitDataKind.symbol;
	symbol: tt.Symbol;
	name?: string;
}

type TypeAliasEmitData = {
	kind: SymbolEmitDataKind.typeAlias;
	node: tt.TypeAliasDeclaration;
}

type EmitData = SymbolEmitData | TypeAliasEmitData;

export abstract class AbstractContextRunnable implements ContextRunnable {

	public readonly session: ComputeContextSession;
	public readonly symbols: Symbols;

	public readonly id: ContextRunnableResultId;
	protected readonly location: SnippetLocation;
	public readonly priority: number;
	public readonly cost: ComputeCost;

	protected readonly languageService: tt.LanguageService;
	protected readonly context: RequestContext;
	private readonly program: tt.Program | undefined;
	private result: RunnableResult | undefined;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, id: ContextRunnableResultId, location: SnippetLocation, priority: number, cost: ComputeCost) {
		this.session = session;
		this.languageService = languageService;
		this.program = languageService.getProgram();
		this.context = context;
		this.symbols = context.getSymbols(this.getProgram());
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

	public useCachedResult(cached: CachedContextRunnableResult): boolean {
		const cacheInfo = cached.cache;
		if (cacheInfo === undefined) {
			return false;
		}
		if (cacheInfo.emitMode === EmitMode.ClientBased) {
			if (cached.state === ContextRunnableState.Finished) {
				return true;
			}
			if (cached.state === ContextRunnableState.IsFull) {
				const kind = cached.cache?.scope.kind;
				if (kind === CacheScopeKind.WithinRange || kind === CacheScopeKind.NeighborFiles || kind === CacheScopeKind.File) {
					return true;
				}
			}
		}
		return false;
	}

	public compute(token: tt.CancellationToken): void {
		if (this.result === undefined) {
			throw new Error('Runnable not initialized');
		}
		token.throwIfCancellationRequested();
		if (this.result.isPrimaryBudgetExhausted()) {
			return;
		}
		this.run(this.result, token);
		this.result.done();
	}

	public abstract getActiveSourceFile(): tt.SourceFile;

	protected abstract createRunnableResult(result: ContextResult): RunnableResult;

	protected abstract run(result: RunnableResult, token: tt.CancellationToken): void;

	protected getProgram(): tt.Program {
		if (this.program === undefined) {
			throw new RecoverableError('No program available', RecoverableError.NoProgram);
		}
		return this.program;
	}

	protected createCacheScope(node: tt.Node, sourceFile?: tt.SourceFile | undefined): CacheScope;
	protected createCacheScope(node: tt.NodeArray<tt.Node>, sourceFile: tt.SourceFile | undefined): CacheScope;
	protected createCacheScope(node: tt.Node | tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): CacheScope {
		return CacheScopes.createWithinCacheScope(node as any, sourceFile);
	}

	protected addScopeNode<T extends tt.Node>(scopeNodes: Set<T>, symbol: tt.Symbol, kind: tt.SyntaxKind, sourceFile: tt.SourceFile): Set<T> | undefined {
		const declarations = symbol.getDeclarations();
		if (declarations === undefined) {
			return undefined;
		}
		let scopeNode: T | undefined = undefined;
		let outsideDeclarations: number = 0;
		for (const declaration of declarations) {
			if (declaration.getSourceFile() !== sourceFile) {
				outsideDeclarations++;
				continue;
			}
			const parent = tss.Nodes.getParentOfKind(declaration, kind) as T;
			if (parent === undefined) {
				return undefined;
			}
			if (scopeNode === undefined) {
				scopeNode = parent;
			} else if (scopeNode !== parent) {
				return undefined;
			}
		}
		if (outsideDeclarations < declarations.length) {
			if (scopeNode !== undefined) {
				scopeNodes.add(scopeNode);
			} else {
				return undefined;
			}
		}
		return scopeNodes;
	}

	protected createCacheInfo(emitMode: EmitMode, cacheScope?: CacheScope | undefined): CacheInfo | undefined {
		return cacheScope !== undefined ? { emitMode, scope: cacheScope } : undefined;
	}

	protected handleSymbol(symbol: tt.Symbol, name?: string, ifRoom?: boolean): boolean {
		if (this.result === undefined) {
			return true;
		}
		const symbolsToEmit = this.getEmitDataForSymbol(symbol, name);
		if (symbolsToEmit.length === 0) {
			return true;
		}
		for (const emitData of symbolsToEmit) {
			if (emitData.kind === SymbolEmitDataKind.typeAlias) {
				if (this.skipNode(emitData.node)) {
					continue;
				}
				const snippetBuilder = new CodeSnippetBuilder(this.context, this.symbols, this.getActiveSourceFile());
				snippetBuilder.addDeclaration(emitData.node);
				if (ifRoom === undefined || ifRoom === false) {
					this.result.addSnippet(snippetBuilder, this.location, undefined);
				} else {
					if (!this.result.addSnippet(snippetBuilder, this.location, undefined, ifRoom)) {
						return false;
					}
				}
			} else if (emitData.kind === SymbolEmitDataKind.symbol) {
				const { symbol, name } = emitData;
				if (this.skipSymbolBasedOnDeclaration(symbol) || Symbols.isTypeParameter(symbol)) {
					continue;
				}
				const key = Symbols.createKey(symbol, this.session.host);
				if (key !== undefined && this.result.addFromKnownItems(key)) {
					continue;
				}
				const snippetBuilder = new CodeSnippetBuilder(this.context, this.symbols, this.getActiveSourceFile());
				snippetBuilder.addTypeSymbol(symbol, name);
				if (ifRoom === undefined || ifRoom === false) {
					this.result.addSnippet(snippetBuilder, this.location, key);
				} else {
					if (!this.result.addSnippet(snippetBuilder, this.location, key, ifRoom)) {
						return false;
					}
				}
			}
		}
		return true;
	}

	protected isNodeArray(node: tt.Node | tt.NodeArray<tt.Node>): node is tt.NodeArray<tt.Node> {
		return Array.isArray(node);
	}

	protected skipNode(node: tt.Node): boolean {
		return this.skipSourceFile(node.getSourceFile());
	}

	protected skipSourceFile(sourceFile: tt.SourceFile): boolean {
		if (this.getActiveSourceFile().fileName === sourceFile.fileName) {
			return true;
		}
		const program = this.getProgram();
		return program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile);
	}

	protected skipSymbolBasedOnDeclaration(symbol: tt.Symbol): boolean {
		const declarations = symbol.getDeclarations();
		if (declarations === undefined || declarations.length === 0) {
			return false;
		}
		for (const declaration of declarations) {
			if (this.skipSourceFile(declaration.getSourceFile())) {
				return true;
			}
		}
		return false;
	}

	protected getSymbolsForTypeNode(node: tt.TypeNode): SymbolData[] {
		const result: SymbolData[] = [];
		this.doGetSymbolsForTypeNode(result, node);
		return result;
	}

	private doGetSymbolsForTypeNode(result: SymbolData[], node: tt.TypeNode): void {
		if (ts.isTypeReferenceNode(node)) {
			const symbol = this.symbols.getLeafSymbolAtLocation(node.typeName);
			if (symbol !== undefined) {
				result.push({ symbol, name: node.typeName.getText() });
			}
		} else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
			for (const type of node.types) {
				this.doGetSymbolsForTypeNode(result, type);
			}
		}
	}

	protected getSymbolsToEmitForType(type: tt.Type): SymbolData[] {
		const result: SymbolData[] = [];
		this.doGetSymbolsForType(result, type);
		return result;
	}

	private doGetSymbolsForType(result: SymbolData[], type: tt.Type): void {
		const symbol = type.getSymbol();
		if (symbol !== undefined) {
			result.push({ symbol, name: symbol.getName() });
		} else if (Types.isIntersection(type) || Types.isUnion(type)) {
			for (const item of type.types) {
				this.doGetSymbolsForType(result, item);
			}
		}
	}

	protected getEmitDataForSymbol(symbol: tt.Symbol, name?: string): EmitData[] {
		const result: EmitData[] = [];
		this.doGetEmitDataForSymbol(result, new Set<tt.Symbol>(), 0, symbol, name);
		return result;
	}

	private doGetEmitDataForSymbol(result: EmitData[], seen: Set<tt.Symbol>, level: number, symbol: tt.Symbol, name?: string): void {
		if (Symbols.isAlias(symbol)) {
			symbol = this.symbols.getLeafSymbol(symbol);
		}
		if (seen.has(symbol) || level > 2) {
			return;
		}
		seen.add(symbol);

		if (Symbols.isTypeAlias(symbol)) {
			const declarations = symbol.getDeclarations();
			if (declarations === undefined || declarations.length === 0) {
				return;
			}
			let declaration: tt.TypeAliasDeclaration | undefined = undefined;
			for (const decl of declarations) {
				if (ts.isTypeAliasDeclaration(decl)) {
					declaration = decl;
					// Multiple type aliases declarations with the same name
					// and different types are not possible.
					break;
				}
			}
			if (declaration === undefined) {
				return;
			}
			name = name ?? declaration.name.getText();
			const type = declaration.type;
			if (ts.isTypeLiteralNode(type)) {
				const symbol = this.symbols.getLeafSymbolAtLocation(type);
				if (symbol !== undefined) {
					if (seen.has(symbol)) {
						return;
					}
					result.push({ kind: SymbolEmitDataKind.symbol, symbol, name });
				}
			} else if (ts.isTypeReferenceNode(type)) {
				const symbol = this.symbols.getLeafSymbolAtLocation(type.typeName);
				if (symbol !== undefined) {
					if (seen.has(symbol)) {
						return;
					}
					this.doGetEmitDataForSymbol(result, seen, level + 1, symbol, name);
				}
			} else if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
				result.push({ kind: SymbolEmitDataKind.typeAlias, node: declaration });
				if (level >= 2) {
					return;
				}
				for (const item of type.types) {
					const symbol = this.symbols.getLeafSymbolAtLocation(item);
					if (symbol !== undefined) {
						if (seen.has(symbol)) {
							continue;
						}
						// We can't name type literals on that level and we have included
						// the type alias itself, so we don't need to emit it again.
						if (!Symbols.isTypeLiteral(symbol)) {
							this.doGetEmitDataForSymbol(result, seen, level + 1, symbol, name);
						}
					} else {
						const symbolData = this.getSymbolsForTypeNode(item);
						for (const { symbol, name } of symbolData) {
							if (seen.has(symbol)) {
								continue;
							}
							this.doGetEmitDataForSymbol(result, seen, level + 1, symbol, name);
						}
					}
				}
			}
		} else {
			result.push({ kind: SymbolEmitDataKind.symbol, symbol, name });
		}
	}
}


export class ContextRunnableCollector {

	private readonly cachedRunnableResults: Map<string, CachedContextRunnableResult>;

	public readonly primary: ContextRunnable[];
	public readonly secondary: ContextRunnable[];
	public readonly tertiary: ContextRunnable[];

	constructor(cachedRunnableResults: Map<string, CachedContextRunnableResult>) {
		this.cachedRunnableResults = cachedRunnableResults;
		this.primary = [];
		this.secondary = [];
		this.tertiary = [];
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
		for (const runnable of this.primary) {
			yield runnable;
		}
		for (const runnable of this.secondary) {
			yield runnable;
		}
		for (const runnable of this.tertiary) {
			yield runnable;
		}
	}

	public getPrimaryRunnables(): ContextRunnable[] {
		return this.primary.sort((a, b) => {
			const result = a.cost - b.cost;
			if (result !== 0) {
				return result;
			}
			return b.priority - a.priority;
		});
	}

	public getSecondaryRunnables(): ContextRunnable[] {
		return this.secondary.sort((a, b) => {
			const result = a.cost - b.cost;
			if (result !== 0) {
				return result;
			}
			return b.priority - a.priority;
		});
	}

	public getTertiaryRunnables(): ContextRunnable[] {
		return this.tertiary.sort((a, b) => {
			const result = a.cost - b.cost;
			if (result !== 0) {
				return result;
			}
			return b.priority - a.priority;
		});
	}

	private useCachedRunnableIfPossible(runnable: AbstractContextRunnable): ContextRunnable {
		const cached = this.cachedRunnableResults.get(runnable.id);
		if (cached === undefined) {
			return runnable;
		}
		return runnable.useCachedResult(cached) ? new CacheBasedContextRunnable(cached, runnable.priority, runnable.cost) : runnable;
	}
}

export abstract class ContextProvider {

	constructor() {
	}

	public isCallableProvider?: boolean;
	public abstract provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void;
}

export interface ProviderComputeContext {
	isFirstCallableProvider(contextProvider: ContextProvider): boolean;
}
export type ContextProviderFactory = (node: tt.Node, tokenInfo: tss.TokenInfo, context: ProviderComputeContext) => ContextProvider | undefined;

export class TokenBudgetExhaustedError extends Error {
	constructor() {
		super('Budget exhausted');
	}
}

export class CharacterBudget {

	private charBudget: number;
	private lowWaterMark: number;
	private itemRejected: boolean;

	constructor(budget: number, lowWaterMark: number = 256) {
		this.charBudget = budget;
		this.lowWaterMark = lowWaterMark;
		this.itemRejected = false;
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
		if (this.charBudget <= 0) {
			throw new TokenBudgetExhaustedError();
		}
	}

	public spentAndThrowIfExhausted(chars: number): void {
		this.spent(chars);
		this.throwIfExhausted();
	}
}