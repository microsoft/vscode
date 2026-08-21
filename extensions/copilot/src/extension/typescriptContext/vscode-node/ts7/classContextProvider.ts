/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project, Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import { isClassDeclaration, SyntaxKind, type ClassDeclaration, type Node, type SourceFile, type ExpressionWithTypeArguments } from '@typescript/native/unstable/ast';
import { CodeSnippetBuilder } from './code';
import { AbstractContextRunnable, ComputeCost, ContextProvider, Search, SnippetLocation, type ComputeContextSession, type ContextResult, type ContextRunnableCollector, type RequestContext, type RunnableResult } from './contextProvider';
import * as protocol from '../../common/serverProtocol';
import tss, { type CancellationTokenWithTimer, Symbols } from './typescripts';

export type TypeInfo = {
	symbol: NativeSymbol;
	type: ExpressionWithTypeArguments;
	abstractMembers: number;
};

export type SimilarClassDeclaration = {
	declaration: ClassDeclaration;
	matchesAbstractMembers: number;
};

export class ClassBlueprintSearch extends Search<SimilarClassDeclaration> {
	private readonly classDeclaration: ClassDeclaration;

	public abstractMembers: number = 0;
	public extends: TypeInfo | undefined;
	public implements: readonly TypeInfo[] | undefined;

	private initialized: boolean = false;

	constructor(project: Project, symbols: Symbols, classDeclaration: ClassDeclaration) {
		super(project, symbols);
		this.classDeclaration = classDeclaration;
	}

	public override with(project: Project, symbols: Symbols): ClassBlueprintSearch {
		return project === this.project ? this : new ClassBlueprintSearch(project, symbols, this.classDeclaration);
	}

	public *all(): IterableIterator<TypeInfo> {
		if (this.extends !== undefined) {
			yield this.extends;
		}
		if (this.implements !== undefined) {
			yield* this.implements;
		}
	}

	public override async score(_project: Project, _context: RequestContext): Promise<number> {
		await this.initialize();
		return this.extends === undefined && this.implements === undefined ? -1 : 1;
	}

	public override async run(_context: RequestContext, token: CancellationTokenWithTimer): Promise<SimilarClassDeclaration | undefined> {
		await this.initialize();
		let result: SimilarClassDeclaration | undefined;
		const matches = new Map<ClassDeclaration, number>();
		for (const typeInfo of this.all()) {
			token.throwIfCancellationRequested();
			// const node = isExpressionWithTypeArguments(typeInfo.type) ? typeInfo.type.expression : typeInfo.type.typeName;
			const node = typeInfo.type.expression;
			for (const entry of await this.project.checker.getReferencedSymbolsForNode(node, node.getStart())) {
				for (const reference of entry.references) {
					const node = await reference.resolve(this.project);
					const candidate = node === undefined ? undefined : this.getContainingClass(node);
					if (candidate === undefined || this.isSame(candidate)) {
						continue;
					}
					matches.set(candidate, (matches.get(candidate) ?? 0) + typeInfo.abstractMembers);
				}
			}
		}
		for (const [declaration, matchesAbstractMembers] of matches) {
			if (result === undefined || matchesAbstractMembers > result.matchesAbstractMembers) {
				result = { declaration, matchesAbstractMembers };
			}
		}
		return result;
	}

	private async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		const implemented: TypeInfo[] = [];
		for (const heritageClause of this.classDeclaration.heritageClauses ?? []) {
			for (const type of heritageClause.types) {
				// const symbol = await (isExpressionWithTypeArguments(type) ? this.symbols.getLeafSymbolAtLocation(type.expression) : this.symbols.getLeafSymbolAtLocation(type.typeName));
				const symbol = await this.symbols.getLeafSymbolAtLocation(type.expression);
				if (symbol === undefined) {
					continue;
				}
				const abstractMembers = (await symbol.getMembers()).size;
				this.abstractMembers += abstractMembers;
				const info = { symbol, type, abstractMembers };
				if (heritageClause.token === SyntaxKind.ExtendsKeyword) {
					this.extends = info;
				} else {
					implemented.push(info);
				}
			}
		}
		this.implements = implemented.length === 0 ? undefined : implemented.sort((first, second) => second.abstractMembers - first.abstractMembers);
	}

	private isSame(other: ClassDeclaration): boolean {
		return this.classDeclaration === other || (this.classDeclaration.getSourceFile().path === other.getSourceFile().path && this.classDeclaration.pos === other.pos);
	}

	private getContainingClass(node: Node): ClassDeclaration | undefined {
		let current: Node | undefined = node;
		while (current !== undefined) {
			if (isClassDeclaration(current)) {
				return current;
			}
			current = current.parent;
		}
		return undefined;
	}
}

export class SuperClassRunnable extends AbstractContextRunnable {
	private readonly classDeclaration: ClassDeclaration;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, classDeclaration: ClassDeclaration, priority: number = protocol.Priorities.Inherited) {
		super(session, project, context, 'SuperClassRunnable', SnippetLocation.Primary, priority, ComputeCost.Medium);
		this.classDeclaration = classDeclaration;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.classDeclaration.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, { emitMode: protocol.EmitMode.ClientBased, scope: this.createCacheScope(this.classDeclaration.members, this.classDeclaration.getSourceFile()) });
	}

	protected override async run(_result: RunnableResult): Promise<void> {
		const clazz = await this.symbols.getLeafSymbolAtLocation(this.classDeclaration.name ?? this.classDeclaration);
		if (!Symbols.isClass(clazz)) {
			return;
		}
		const direct = await this.symbols.getDirectSuperSymbols(clazz);
		if (direct?.extends !== undefined) {
			await this.handleSymbol(direct.extends.symbol, direct.extends.name);
		}
		for (const implemented of direct?.implements ?? []) {
			await this.handleSymbol(implemented.symbol, implemented.name);
		}
	}
}

class SimilarClassRunnable extends AbstractContextRunnable {
	private readonly classDeclaration: ClassDeclaration;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, classDeclaration: ClassDeclaration, priority: number = protocol.Priorities.Blueprints) {
		super(session, project, context, 'SimilarClassRunnable', SnippetLocation.Primary, priority, ComputeCost.High);
		this.classDeclaration = classDeclaration;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.classDeclaration.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit);
	}

	protected override async run(result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		const search = new ClassBlueprintSearch(this.getProject(), this.symbols, this.classDeclaration);
		if (await search.score(this.getProject(), this.context) <= 0) {
			return;
		}
		const [project, similarClass] = await this.session.run(search, this.context, token);
		if (project === undefined || similarClass === undefined) {
			return;
		}
		const builder = new CodeSnippetBuilder(this.context, this.context.getSymbols(project), this.getActiveSourceFile());
		await builder.addDeclaration(similarClass.declaration);
		result.addSnippet(builder, this.location, undefined);
	}
}

export class ClassContextProvider extends ContextProvider {
	public static create(declaration: ClassDeclaration, tokenInfo: tss.TokenInfo): ContextProvider {
		return declaration.members.length === 0 ? new WholeClassContextProvider(declaration, tokenInfo) : new ClassContextProvider(declaration, tokenInfo);
	}

	private readonly classDeclaration: ClassDeclaration;

	constructor(classDeclaration: ClassDeclaration, _tokenInfo: tss.TokenInfo) {
		super();
		this.classDeclaration = classDeclaration;
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		token.throwIfCancellationRequested();
		result.addPrimary(new SuperClassRunnable(session, project, context, this.classDeclaration));
	}
}

export class WholeClassContextProvider extends ContextProvider {
	private readonly classDeclaration: ClassDeclaration;

	constructor(classDeclaration: ClassDeclaration, _tokenInfo: tss.TokenInfo) {
		super();
		this.classDeclaration = classDeclaration;
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		token.throwIfCancellationRequested();
		result.addPrimary(new SuperClassRunnable(session, project, context, this.classDeclaration));
		if (session.enableBlueprintSearch()) {
			result.addPrimary(new SimilarClassRunnable(session, project, context, this.classDeclaration));
		}
	}
}
