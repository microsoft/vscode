/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { CodeSnippetBuilder } from './code';
import { AbstractContextRunnable, ComputeCost, ContextProvider, ContextResult, Search, SnippetLocation, type ComputeContextSession, type ContextRunnableCollector, type RequestContext, type RunnableResult } from './contextProvider';
import { EmitMode, Priorities, SpeculativeKind } from './protocol';
import tss, { ClassDeclarations, ReferencedByVisitor, Symbols, type DirectSuperSymbolInfo } from './typescripts';

export type TypeInfo = {
	symbol: tt.Symbol;
	type: tt.ExpressionWithTypeArguments;
	abstractMembers: number;
};

export type SimilarClassDeclaration = {
	declaration: tt.ClassDeclaration;
	matchesAbstractMembers: number;
};

export class ClassBlueprintSearch extends Search<SimilarClassDeclaration> {

	private readonly classDeclaration: tt.ClassDeclaration;
	private readonly stateProvider: tss.StateProvider;

	public readonly abstractMembers: number;
	public readonly extends: TypeInfo | undefined;
	public readonly implements: readonly TypeInfo[] | undefined;

	constructor(program: tt.Program, symbols: Symbols, classDeclarationOrSearch: tt.ClassDeclaration | ClassBlueprintSearch, stateProvider?: tss.StateProvider) {
		super(program, symbols);
		if (classDeclarationOrSearch instanceof ClassBlueprintSearch) {
			const search = classDeclarationOrSearch;
			this.classDeclaration = Search.getNodeInProgram(program, search.classDeclaration);
			this.stateProvider = search.stateProvider;
			this.abstractMembers = search.abstractMembers;
			const mapTypeInfo = (typeInfo: TypeInfo): TypeInfo | undefined => {
				const type = typeInfo.type;
				const sourceFile = program.getSourceFile(type.getSourceFile().fileName);
				if (sourceFile !== undefined) {
					const localType = tss.getTokenAtPosition(sourceFile, type.pos);
					if (ts.isExpressionWithTypeArguments(localType)) {
						const symbol = symbols.getLeafSymbolAtLocation(localType.expression);
						if (symbol !== undefined && !this.getSymbolInfo(symbol).skip) {
							return { symbol, type: localType, abstractMembers: typeInfo.abstractMembers };
						}
					}
				}
				return undefined;
			};
			if (search.extends !== undefined) {
				this.extends = mapTypeInfo(search.extends);
			}
			if (search.implements !== undefined) {
				let impl: TypeInfo[] | undefined;
				for (const info of search.implements) {
					const mapped = mapTypeInfo(info);
					if (mapped !== undefined) {
						impl = impl ?? [];
						impl.push(mapped);
					}
				}
				this.implements = impl;
			}
		} else {
			const classDeclaration = classDeclarationOrSearch;
			this.classDeclaration = classDeclaration;
			this.stateProvider = stateProvider!;
			const heritageClauses = classDeclaration.heritageClauses;
			if (heritageClauses === undefined) {
				this.abstractMembers = 0;
				this.extends = undefined;
				this.implements = undefined;
				return;
			}

			let totalAbstractMembers = 0;
			let extendsSymbol: TypeInfo | undefined;
			let implementsSymbols: TypeInfo[] | undefined;

			for (const heritageClause of heritageClauses) {
				if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
					if (heritageClause.types.length === 1) {
						const type = heritageClause.types[0];
						const symbol = this.getHeritageSymbol(type.expression);
						if (symbol !== undefined && !this.getSymbolInfo(symbol).skip) {
							const abstractMembers = this.getNumberOfAbstractMembers(symbol);
							totalAbstractMembers += abstractMembers;
							extendsSymbol = { symbol, type: type, abstractMembers: abstractMembers };
						}
					}
				} else if (heritageClause.token === ts.SyntaxKind.ImplementsKeyword) {
					for (const type of heritageClause.types) {
						const symbol = this.getHeritageSymbol(type.expression);
						if (symbol !== undefined && !this.getSymbolInfo(symbol).skip) {
							implementsSymbols = implementsSymbols ?? [];
							const abstractMembers = this.getNumberOfAbstractMembers(symbol);
							totalAbstractMembers += abstractMembers;
							implementsSymbols.push({ symbol, type: type, abstractMembers: abstractMembers });
						}
					}
				}
			}
			if (implementsSymbols !== undefined) {
				implementsSymbols.sort((a, b) => b.abstractMembers - a.abstractMembers);
			}
			this.abstractMembers = totalAbstractMembers;
			this.extends = extendsSymbol;
			this.implements = implementsSymbols;
		}
	}

	public with(program: tt.Program): ClassBlueprintSearch {
		if (program === this.program) {
			return this;
		}
		return new ClassBlueprintSearch(program, new Symbols(program), this);
	}

	public *all(): IterableIterator<TypeInfo> {
		if (this.extends !== undefined) {
			yield this.extends;
		}
		if (this.implements !== undefined) {
			yield* this.implements;
		}
	}

	private isSame(other: tt.ClassDeclaration): boolean {
		return this.classDeclaration === other ||
			(this.classDeclaration.getSourceFile().fileName === other.getSourceFile().fileName && this.classDeclaration.pos === other.pos);
	}

	public score(program: tt.Program, context: RequestContext): number {
		// We have no abstract member. The program is only
		// of interest if it includes the extends class.
		if (this.abstractMembers === 0) {
			if (this.extends === undefined) {
				return -1;
			}
			const declarations = this.extends.symbol.declarations;
			if (declarations === undefined) {
				return -1;
			}
			for (const declaration of declarations) {
				if (program.getSourceFile(declaration.getSourceFile().fileName) === undefined) {
					return -1;
				}
			}
			return 1;
		}
		let possible: number | undefined = undefined;
		for (const info of this.all()) {
			if (info.symbol.declarations === undefined) {
				continue;
			}
			for (const declaration of info.symbol.declarations) {
				const sourceFile = declaration.getSourceFile();
				if (program.getSourceFile(sourceFile.fileName) !== undefined) {
					possible ??= 0;
					possible += info.abstractMembers;
					break;
				}
			}
		}
		if (possible === undefined) {
			return -1;
		}
		// this.abstractMembers !== 0 here.
		let result = possible / this.abstractMembers;

		// now factor the neighbor files in to prefer a program where all neighbor files are
		// part of.
		const neighborFiles = context.neighborFiles;
		if (neighborFiles.length === 0) {
			return result;
		}
		const factor = Math.pow(10, neighborFiles.length.toString().length);
		result *= factor;
		for (const file of neighborFiles) {
			if (program.getSourceFile(file) !== undefined) {
				result += 1;
			}
		}
		return result;
	}

	public run(context: RequestContext, token: tt.CancellationToken): SimilarClassDeclaration | undefined {
		if (this.extends === undefined && this.implements === undefined) {
			return undefined;
		}
		let result: SimilarClassDeclaration | undefined;
		const symbol2TypeInfo: Map<tt.Symbol, TypeInfo> = new Map([...this.all()].map(info => [info.symbol, info]));
		for (const typeInfo of this.all()) {
			const symbol = typeInfo.symbol;
			const declarations = symbol.declarations;
			if (declarations === undefined) {
				continue;
			}
			const declarationSourceFileVisited = new Set<string>();
			for (const declaration of declarations) {
				if (!ts.isClassDeclaration(declaration) && !ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration) || declaration.name === undefined) {
					continue;
				}
				const declarationSourceFile = declaration.getSourceFile();
				if (declarationSourceFileVisited.has(declarationSourceFile.fileName)) {
					continue;
				}
				const referencedByVisitor = new ReferencedByVisitor(this.program, declarationSourceFile, context.getPreferredNeighborFiles(this.program), this.stateProvider, token);
				for (const sourceFile of referencedByVisitor.entries()) {
					token.throwIfCancellationRequested();
					for (const candidate of ClassDeclarations.entries(sourceFile)) {
						if (candidate.heritageClauses === undefined) {
							continue;
						}
						if (this.isSame(candidate)) {
							continue;
						}
						let matchesAbstractMembers: number | undefined = undefined;
						for (const heritageClause of candidate.heritageClauses) {
							for (const type of heritageClause.types) {
								const symbol = this.getHeritageSymbol(type.expression);
								if (symbol === undefined) {
									continue;
								}
								const typeInfo = symbol2TypeInfo.get(symbol);
								if (typeInfo === undefined) {
									continue;
								}
								matchesAbstractMembers ??= 0;
								matchesAbstractMembers += typeInfo.abstractMembers;
							}
						}
						if (matchesAbstractMembers !== undefined) {
							if (result === undefined) {
								result = { declaration: candidate, matchesAbstractMembers: matchesAbstractMembers };
							} else if (matchesAbstractMembers > result.matchesAbstractMembers) {
								result = { declaration: candidate, matchesAbstractMembers: matchesAbstractMembers };
							}
						}
						// Here we can be smart. We could for 30ms continue to search for a better match and then return the best match.
						if (result !== undefined && result.matchesAbstractMembers === this.abstractMembers) {
							return result;
						}
					}
				}
			}
		}
		return undefined;
	}

	private getNumberOfAbstractMembers(symbol: tt.Symbol): number {
		const stats = this.symbols.getMemberStatistic(symbol);
		return stats.abstract.size;
	}
}

export class SuperClassRunnable extends AbstractContextRunnable {

	private readonly classDeclaration: tt.ClassDeclaration;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, classDeclaration: tt.ClassDeclaration, priority: number = Priorities.Inherited) {
		super(session, languageService, context, 'SuperClassRunnable', SnippetLocation.Primary, priority, ComputeCost.Medium);
		this.classDeclaration = classDeclaration;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.classDeclaration.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheScope = this.createCacheScope(this.classDeclaration.members, this.classDeclaration.getSourceFile());
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, { emitMode: EmitMode.ClientBased, scope: cacheScope });
	}

	protected override run(_result: RunnableResult, _token: tt.CancellationToken): void {
		const symbols = this.symbols;
		const clazz = symbols.getLeafSymbolAtLocation(this.classDeclaration.name ?? this.classDeclaration);
		if (clazz === undefined || !Symbols.isClass(clazz) || clazz.declarations === undefined) {
			return;
		}

		const directSuperSymbolInfo: DirectSuperSymbolInfo | undefined = symbols.getDirectSuperSymbols(clazz);
		if (directSuperSymbolInfo === undefined) {
			return;
		}
		if (directSuperSymbolInfo.extends !== undefined) {
			const { symbol, name } = directSuperSymbolInfo.extends;
			if (symbol !== undefined && name !== undefined) {
				this.handleSymbol(symbol, name);
			}
		}
		if (directSuperSymbolInfo.implements !== undefined) {
			for (const impl of directSuperSymbolInfo.implements) {
				const { symbol, name } = impl;
				if (symbol !== undefined && name !== undefined) {
					this.handleSymbol(symbol, name);
				}
			}
		}
	}
}

class SimilarClassRunnable extends AbstractContextRunnable {

	private readonly classDeclaration: tt.ClassDeclaration;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, classDeclaration: tt.ClassDeclaration, priority: number = Priorities.Blueprints) {
		super(session, languageService, context, 'SimilarClassRunnable', SnippetLocation.Primary, priority, ComputeCost.High);
		this.classDeclaration = classDeclaration;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.classDeclaration.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit);
	}

	protected override run(result: RunnableResult, token: tt.CancellationToken): void {
		const program = this.getProgram();
		const classDeclaration = this.classDeclaration;
		const symbol = this.symbols.getLeafSymbolAtLocation(classDeclaration.name ?? classDeclaration);
		if (symbol === undefined || !Symbols.isClass(symbol)) {
			return;
		}
		const search = new ClassBlueprintSearch(program, this.symbols, classDeclaration);
		if (search.extends === undefined && search.implements === undefined) {
			return;
		}
		const [foundInProgram, similarClass] = this.session.run(search, this.context, token);
		if (foundInProgram === undefined || similarClass === undefined) {
			return;
		}
		const code = new CodeSnippetBuilder(this.context, this.context.getSymbols(foundInProgram), classDeclaration.getSourceFile());
		code.addDeclaration(similarClass.declaration);
		result.addSnippet(code, this.location, undefined);
	}
}

export class ClassContextProvider extends ContextProvider {

	public static create(declaration: tt.ClassDeclaration, tokenInfo: tss.TokenInfo): ContextProvider {
		if (declaration.members === undefined || declaration.members.length === 0) {
			return new WholeClassContextProvider(declaration, tokenInfo);
		} else {
			return new ClassContextProvider(declaration, tokenInfo);
		}
	}

	private readonly classDeclaration: tt.ClassDeclaration;

	constructor(classDeclaration: tt.ClassDeclaration, _tokenInfo: tss.TokenInfo) {
		super();
		this.classDeclaration = classDeclaration;
	}

	public override provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		result.addPrimary(
			new SuperClassRunnable(session, languageService, context, this.classDeclaration),
		);
	}
}

export class WholeClassContextProvider extends ContextProvider {

	private readonly classDeclaration: tt.ClassDeclaration;

	constructor(classDeclaration: tt.ClassDeclaration, _tokenInfo: tss.TokenInfo) {
		super();
		this.classDeclaration = classDeclaration;
	}

	public override provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		result.addPrimary(
			new SuperClassRunnable(session, languageService, context, this.classDeclaration),
		);
		if (session.enableBlueprintSearch()) {
			result.addPrimary(new SimilarClassRunnable(session, languageService, context, this.classDeclaration));
		}
	}
}