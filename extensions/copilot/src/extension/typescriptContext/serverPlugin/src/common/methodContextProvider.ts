/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { FunctionLikeContextProvider, FunctionLikeContextRunnable } from './baseContextProviders';
import { CodeSnippetBuilder } from './code';
import {
	AbstractContextRunnable, ComputeCost, ContextResult, Search, SnippetLocation, type ComputeContextSession, type ContextRunnableCollector, type ProviderComputeContext, type RequestContext,
	type RunnableResult
} from './contextProvider';
import { EmitMode, Priorities, SpeculativeKind, type CacheInfo } from './protocol';
import { RecoverableError } from './types';
import tss, { ClassDeclarations, Declarations, Symbols, Traversal, type StateProvider, type TokenInfo } from './typescripts';

abstract class ClassPropertyBlueprintSearch<T extends tt.MethodDeclaration | tt.ConstructorDeclaration> extends Search<tt.ClassDeclaration> {

	protected declaration: T;
	protected readonly stateProvider: StateProvider;

	constructor(program: tt.Program, symbols: Symbols, declaration: T, stateProvider: StateProvider) {
		super(program, symbols);
		this.declaration = declaration;
		this.stateProvider = stateProvider;
	}


	public isSame(other: T): boolean {
		return this.declaration === other ||
			(this.declaration.getSourceFile().fileName === other.getSourceFile().fileName && this.declaration.pos === other.pos);
	}

	public score(program: tt.Program, context: RequestContext): number {
		if (program.getSourceFile(this.declaration.getSourceFile().fileName) === undefined) {
			return 0;
		}
		const neighborFiles = context.neighborFiles;
		if (neighborFiles.length === 0) {
			return 1;
		}
		let result = Math.pow(10, neighborFiles.length.toString().length);
		for (const file of neighborFiles) {
			if (program.getSourceFile(file) !== undefined) {
				result += 1;
			}
		}
		return result;
	}
}

abstract class MethodBlueprintSearch extends ClassPropertyBlueprintSearch<tt.MethodDeclaration> {

	constructor(program: tt.Program, symbols: Symbols, declaration: tt.MethodDeclaration, stateProvider: StateProvider) {
		super(program, symbols, declaration, stateProvider);
	}

	public static create(program: tt.Program, symbols: Symbols, declaration: tt.MethodDeclaration, stateProvider: StateProvider): ClassPropertyBlueprintSearch<tt.MethodDeclaration> | undefined {
		const classDeclaration = declaration.parent;
		if (!ts.isClassDeclaration(classDeclaration)) {
			return undefined;
		}
		const isPrivate = Declarations.isPrivate(declaration);
		const typesToCheck: tt.Symbol[] = [];
		let classToCheck: tt.Symbol | undefined = undefined;
		if (!isPrivate) {
			const symbol = symbols.getLeafSymbolAtLocation(classDeclaration.name !== undefined ? classDeclaration.name : classDeclaration);
			if (symbol === undefined || !Symbols.isClass(symbol)) {
				return undefined;
			}
			const name = ts.escapeLeadingUnderscores(declaration.name.getText());
			let path: tt.Symbol[] | undefined = undefined;
			let skip: boolean = false;
			for (const [typeSymbol, superTypeSymbol] of symbols.getAllSuperTypesWithPath(symbol)) {
				if (symbol === typeSymbol) {
					// We start a new path;
					skip = false;
					path = [];
				}
				if (skip) {
					continue;
				}
				path!.push(superTypeSymbol);
				const method = superTypeSymbol.members?.get(name);
				if (method !== undefined) {
					if (Symbols.isInterface(superTypeSymbol) || Symbols.isTypeLiteral(superTypeSymbol)) {
						typesToCheck.push(...path!);
						skip = true;
					} else if (Symbols.isClass(superTypeSymbol)) {
						if (Symbols.isAbstract(method)) {
							// If the method is abstract we check in the same class
							// hierarchy
							classToCheck = superTypeSymbol;
							break;
						} else {
							// Method is not abstract, so the method overrides another
							// method. So we search in the same class hierarchy as well.
							classToCheck = superTypeSymbol;
							break;
						}
					}
				}
			}
		}
		if (isPrivate) {
			const extendsClause = ClassDeclarations.getExtendsClause(classDeclaration);
			if (extendsClause === undefined || extendsClause.types.length === 0) {
				return undefined;
			} else {
				const extendsSymbol = symbols.getLeafSymbolAtLocation(extendsClause.types[0].expression);
				if (extendsSymbol === undefined || !Symbols.isClass(extendsSymbol)) {
					return undefined;
				}
				return new PrivateMethodBlueprintSearch(program, symbols, classDeclaration, extendsSymbol, declaration, stateProvider);
			}
		} else {
			if (classToCheck !== undefined) {
				return new FindMethodInSubclassSearch(program, symbols, classDeclaration, declaration, classToCheck, stateProvider);
			} else if (typesToCheck.length > 0) {
				// the super types we collect contain type literals. Since they can't be referred to by name we
				// can filter them out for the find in hierarchy search. We also filter the symbols that are unnamed.
				const filteredTypesToCheck = typesToCheck.filter((symbol) => {
					if (Symbols.isTypeLiteral(symbol)) {
						return false;
					}
					const name = symbol.escapedName;
					if (name === '__type' || name === '__class') {
						return false;
					}
					return true;
				});
				return new FindMethodInHierarchySearch(program, symbols, classDeclaration, declaration, filteredTypesToCheck, stateProvider);
			} else {
				return undefined;
			}
		}
	}
}

abstract class FindInSiblingClassSearch<T extends tt.MethodDeclaration | tt.ConstructorDeclaration> extends ClassPropertyBlueprintSearch<T> {

	private readonly classDeclaration: tt.ClassDeclaration;
	protected readonly extendsSymbol: tt.Symbol;

	constructor(program: tt.Program, symbols: Symbols, search: FindInSiblingClassSearch<T>);
	constructor(program: tt.Program, symbols: Symbols, classDeclaration: tt.ClassDeclaration, extendsSymbol: tt.Symbol, declaration: T, stateProvider: StateProvider);
	constructor(program: tt.Program, symbols: Symbols, classDeclarationOrSearch: tt.ClassDeclaration | FindInSiblingClassSearch<T>, extendsSymbol?: tt.Symbol, declaration?: T, stateProvider?: StateProvider) {
		if (classDeclarationOrSearch instanceof FindInSiblingClassSearch) {
			const search = classDeclarationOrSearch as FindInSiblingClassSearch<T>;
			const methodDeclaration = Search.getNodeInProgram(program, search.declaration);
			super(program, symbols, methodDeclaration, search.stateProvider);
			this.classDeclaration = Search.getNodeInProgram(program, search.classDeclaration);
			const declarations = search.extendsSymbol.declarations;
			if (declarations === undefined || declarations.length === 0) {
				throw new Error('No declarations found for extends symbol');
			}
			let extendsSymbol: tt.Symbol | undefined;
			for (const declaration of declarations) {
				if (ts.isClassDeclaration(declaration)) {
					const heritageClause = ClassDeclarations.getExtendsClause(declaration);
					if (heritageClause === undefined || heritageClause.types.length === 0) {
						throw new Error('No extends clause found');
					}
					extendsSymbol = this.symbols.getLeafSymbolAtLocation(heritageClause.types[0].expression);
					if (extendsSymbol === undefined || !Symbols.isClass(extendsSymbol)) {
						throw new Error('No extends symbol found');
					}
					break;
				}
			}
			if (extendsSymbol === undefined) {
				throw new Error('No extends symbol found');
			}
			this.extendsSymbol = extendsSymbol;
		} else {
			super(program, symbols, declaration!, stateProvider!);
			this.classDeclaration = classDeclarationOrSearch;
			this.extendsSymbol = extendsSymbol!;
		}
	}

	public run(context: RequestContext, token: tt.CancellationToken): tt.ClassDeclaration | undefined {
		const memberName = this.getMemberName();
		for (const subType of this.symbols.getDirectSubTypes(this.extendsSymbol, context.getPreferredNeighborFiles(this.program), this.stateProvider, token)) {
			token.throwIfCancellationRequested();
			if (subType.members !== undefined) {
				const member = subType.members.get(memberName);
				if (member === undefined) {
					continue;
				}

				const declarations = member.declarations;
				if (declarations === undefined || declarations.length === 0) {
					continue;
				}
				for (const declaration of declarations) {
					if (declaration.kind !== this.declaration.kind) {
						continue;
					}
					const parent = declaration.parent;
					if (!ts.isClassDeclaration(parent) || parent === this.classDeclaration) {
						continue;
					}
					return parent;
				}
			}
		}
		return undefined;
	}

	protected abstract getMemberName(): tt.__String;
}

class PrivateMethodBlueprintSearch extends FindInSiblingClassSearch<tt.MethodDeclaration> {

	constructor(program: tt.Program, symbols: Symbols, search: PrivateMethodBlueprintSearch);
	constructor(program: tt.Program, symbols: Symbols, classDeclaration: tt.ClassDeclaration, extendsSymbol: tt.Symbol, declaration: tt.MethodDeclaration, stateProvider: StateProvider);
	constructor(program: tt.Program, symbols: Symbols, classDeclarationOrSearch: tt.ClassDeclaration | PrivateMethodBlueprintSearch, extendsSymbol?: tt.Symbol, declaration?: tt.MethodDeclaration, stateProvider?: StateProvider) {
		if (classDeclarationOrSearch instanceof PrivateMethodBlueprintSearch) {
			super(program, symbols, classDeclarationOrSearch);
		} else {
			super(program, symbols, classDeclarationOrSearch, extendsSymbol!, declaration!, stateProvider!);
		}
	}

	public with(program: tt.Program): PrivateMethodBlueprintSearch {
		if (program === this.program) {
			return this;
		}
		return new PrivateMethodBlueprintSearch(program, new Symbols(program), this);
	}

	protected getMemberName(): tt.__String {
		return ts.escapeLeadingUnderscores(this.declaration.name.getText());
	}
}

class FindMethodInSubclassSearch extends MethodBlueprintSearch {

	private readonly classDeclaration: tt.ClassDeclaration;
	private readonly startClass: tt.Symbol;

	constructor(program: tt.Program, symbols: Symbols, search: FindMethodInSubclassSearch);
	constructor(program: tt.Program, symbols: Symbols, classDeclaration: tt.ClassDeclaration, declaration: tt.MethodDeclaration, startClass: tt.Symbol, stateProvider: StateProvider);
	constructor(program: tt.Program, symbols: Symbols, classDeclarationOrSearch: tt.ClassDeclaration | FindMethodInSubclassSearch, declaration?: tt.MethodDeclaration, startClass?: tt.Symbol, stateProvider?: StateProvider) {
		if (classDeclarationOrSearch instanceof FindMethodInSubclassSearch) {
			const search = classDeclarationOrSearch as FindMethodInSubclassSearch;
			const declaration = Search.getNodeInProgram(program, search.declaration);
			super(program, symbols, declaration, search.stateProvider);
			this.classDeclaration = Search.getNodeInProgram(program, search.classDeclaration);
			const startClass = search.startClass;
			const declarations = startClass.declarations;
			if (declarations === undefined || declarations.length === 0) {
				throw new RecoverableError('No declarations found for start class', RecoverableError.NoDeclaration);
			}
			let symbol: tt.Symbol | undefined;
			for (const declaration of declarations) {
				if (!ts.isClassDeclaration(declaration)) {
					continue;
				}
				symbol = this.symbols.getLeafSymbolAtLocation(declaration.name ? declaration.name : declaration);
				if (symbol !== undefined) {
					break;
				}
			}
			if (symbol === undefined) {
				throw new RecoverableError('No symbol found for start class', RecoverableError.SymbolNotFound);
			}
			this.startClass = symbol;
		} else {
			super(program, symbols, declaration!, stateProvider!);
			this.classDeclaration = classDeclarationOrSearch;
			this.startClass = startClass!;
		}
	}

	public with(program: tt.Program): FindMethodInSubclassSearch {
		if (program === this.program) {
			return this;
		}
		return new FindMethodInSubclassSearch(program, new Symbols(program), this);
	}

	public run(context: RequestContext, token: tt.CancellationToken): tt.ClassDeclaration | undefined {
		if (!Symbols.isClass(this.startClass)) {
			return undefined;
		}
		const callableName = ts.escapeLeadingUnderscores(this.declaration.name.getText());
		for (const subType of this.symbols.getAllSubTypes(this.startClass, Traversal.breadthFirst, context.getPreferredNeighborFiles(this.program), this.stateProvider, token)) {
			token.throwIfCancellationRequested();
			if (subType.members !== undefined) {
				const member = subType.members.get(callableName);
				if (member === undefined) {
					continue;
				}

				const declarations = member.declarations;
				if (declarations === undefined || declarations.length === 0) {
					continue;
				}
				for (const declaration of declarations) {
					if (!ts.isMethodDeclaration(declaration)) {
						continue;
					}
					const parent = declaration.parent;
					if (!ts.isClassDeclaration(parent) || parent === this.classDeclaration) {
						continue;
					}
					return parent;
				}
			}
		}
		return undefined;
	}
}

class FindMethodInHierarchySearch extends MethodBlueprintSearch {

	private readonly classDeclaration: tt.ClassDeclaration;
	private readonly typesToCheck: tt.Symbol[];

	constructor(program: tt.Program, symbols: Symbols, search: FindMethodInHierarchySearch);
	constructor(program: tt.Program, symbols: Symbols, classDeclaration: tt.ClassDeclaration, declaration: tt.MethodDeclaration, typesToCheck: tt.Symbol[], stateProvider: StateProvider);
	constructor(program: tt.Program, symbols: Symbols, classDeclarationOrSearch: tt.ClassDeclaration | FindMethodInHierarchySearch, declaration?: tt.MethodDeclaration, typesToCheck?: tt.Symbol[], stateProvider?: StateProvider) {
		if (classDeclarationOrSearch instanceof FindMethodInHierarchySearch) {
			const search = classDeclarationOrSearch as FindMethodInHierarchySearch;
			const declaration = Search.getNodeInProgram(program, search.declaration);
			super(program, symbols, declaration, search.stateProvider);
			this.classDeclaration = Search.getNodeInProgram(program, search.classDeclaration);
			const typesToCheck: tt.Symbol[] = [];
			for (const symbolToCheck of search.typesToCheck) {
				const declarations = symbolToCheck.declarations;
				if (declarations === undefined || declarations.length === 0) {
					throw new RecoverableError('No declarations found for start class', RecoverableError.NoDeclaration);
				}
				let symbol: tt.Symbol | undefined;
				for (const declaration of declarations) {
					// todo@dbaeumer We need to check for typedefs as well.
					if (!ts.isClassDeclaration(declaration) && !ts.isInterfaceDeclaration(declaration)) {
						continue;
					}
					symbol = this.symbols.getLeafSymbolAtLocation(declaration.name ? declaration.name : declaration);
					if (symbol !== undefined && symbol.flags === symbolToCheck.flags) {
						break;
					}
				}
				if (symbol === undefined) {
					throw new RecoverableError('No symbol found for start class', RecoverableError.SymbolNotFound);
				}
				typesToCheck.push(symbol);
			}
			this.typesToCheck = typesToCheck;
		} else {
			super(program, symbols, declaration!, stateProvider!);
			this.classDeclaration = classDeclarationOrSearch;
			this.typesToCheck = typesToCheck!;
		}
	}

	public with(program: tt.Program): FindMethodInHierarchySearch {
		if (program === this.program) {
			return this;
		}
		return new FindMethodInHierarchySearch(program, new Symbols(program), this);
	}

	public run(context: RequestContext, token: tt.CancellationToken): tt.ClassDeclaration | undefined {
		const callableName = ts.escapeLeadingUnderscores(this.declaration.name.getText());
		const startSet = new Set<tt.Symbol>(this.typesToCheck);
		const queue: tt.Symbol[] = [];
		// To find a good match we first look at the direct sub types of the types to check. If we find a match
		// we use it. If not we add the type to a queue to check later.
		for (const toCheck of this.typesToCheck) {
			token.throwIfCancellationRequested();
			for (const subType of this.symbols.getDirectSubTypes(toCheck, context.getPreferredNeighborFiles(this.program), this.stateProvider, token)) {
				token.throwIfCancellationRequested();
				if (startSet.has(subType)) {
					continue;
				}
				if (Symbols.isClass(subType)) {
					const member = subType.members?.get(callableName);
					if (member !== undefined && !Symbols.isAbstract(member)) {
						const declaration = ClassDeclarations.fromSymbol(subType);
						if (declaration === this.classDeclaration) {
							continue;
						}
						if (declaration !== undefined) {
							return declaration;
						}
					}
				}
				queue.push(subType);
			}
		}
		// We have not found any match yet. So we look at all the sub types of the types to check.
		const seen: Set<tt.Symbol> = new Set<tt.Symbol>();
		for (const symbol of queue) {
			token.throwIfCancellationRequested();
			if (seen.has(symbol)) {
				continue;
			}
			for (const subType of this.symbols.getAllSubTypes(symbol, Traversal.breadthFirst, context.getPreferredNeighborFiles(this.program), this.stateProvider, token)) {
				token.throwIfCancellationRequested();
				if (seen.has(subType)) {
					continue;
				}
				if (Symbols.isClass(subType)) {
					const member = subType.members?.get(callableName);
					if (member !== undefined && !Symbols.isAbstract(member)) {
						const declaration = ClassDeclarations.fromSymbol(subType);
						if (declaration === this.classDeclaration) {
							seen.add(subType);
							continue;
						}
						if (declaration !== undefined) {
							return declaration;
						}
					}
				}
				seen.add(subType);
			}
			seen.add(symbol);
		}
		return undefined;
	}
}

abstract class SimilarPropertyRunnable<T extends tt.MethodDeclaration | tt.ConstructorDeclaration> extends FunctionLikeContextRunnable<T> {

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: T, priority: number = Priorities.Blueprints) {
		super(session, languageService, context, 'SimilarPropertyRunnable', declaration, priority, ComputeCost.High);
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const scope = this.getCacheScope();
		const cacheInfo: CacheInfo | undefined = scope !== undefined ? { emitMode: EmitMode.ClientBased, scope } : undefined;
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, cacheInfo);
	}

	protected override run(result: RunnableResult, token: tt.CancellationToken): void {
		const search = this.createSearch(token);
		if (search !== undefined) {
			const [program, candidate] = this.session.run(search, this.context, token);
			if (program !== undefined && candidate !== undefined) {
				const symbol = this.symbols.getLeafSymbolAtLocation(candidate.name ? candidate.name : candidate);
				if (symbol === undefined) {
					return;
				}
				const sourceFile = this.declaration.getSourceFile();
				const snippetBuilder = new CodeSnippetBuilder(this.context, this.context.getSymbols(program), sourceFile);
				snippetBuilder.addDeclaration(candidate);
				result.addSnippet(snippetBuilder, this.location, undefined);
			}
		}
	}

	protected abstract createSearch(token: tt.CancellationToken): Search<tt.ClassDeclaration> | undefined;
}

class SimilarMethodRunnable extends SimilarPropertyRunnable<tt.MethodDeclaration> {

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: tt.MethodDeclaration) {
		super(session, languageService, context, declaration);
	}

	protected override createSearch(): Search<tt.ClassDeclaration> | undefined {
		return MethodBlueprintSearch.create(this.getProgram(), this.symbols, this.declaration, this.session);
	}
}

abstract class ClassPropertyContextProvider<T extends tt.MethodDeclaration | tt.ConstructorDeclaration | tt.GetAccessorDeclaration | tt.SetAccessorDeclaration> extends FunctionLikeContextProvider {

	protected readonly declaration: T;
	public override readonly isCallableProvider: boolean;


	constructor(declaration: T, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
		this.declaration = declaration;
		this.isCallableProvider = true;
	}

	protected getTypeExcludes(languageService: tt.LanguageService, context: RequestContext): Set<tt.Symbol> {
		const result = new Set<tt.Symbol>();
		const classDeclaration = this.declaration.parent;
		if (ts.isClassDeclaration(classDeclaration) && classDeclaration.heritageClauses !== undefined && classDeclaration.heritageClauses.length > 0) {
			const program = languageService.getProgram();
			if (program !== undefined) {
				const symbols = context.getSymbols(program);
				for (const heritageClause of classDeclaration.heritageClauses) {
					if (heritageClause.token !== ts.SyntaxKind.ExtendsKeyword) {
						continue;
					}
					for (const type of heritageClause.types) {
						const symbol = symbols.getLeafSymbolAtLocation(type.expression);
						if (symbol !== undefined && Symbols.isClass(symbol)) {
							return result.add(symbol);
						}
					}
				}
			}
		}
		return result;
	}
}

class PropertiesTypeRunnable extends AbstractContextRunnable {

	private readonly declaration: tt.MethodDeclaration | tt.ConstructorDeclaration | tt.GetAccessorDeclaration | tt.SetAccessorDeclaration;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: tt.MethodDeclaration | tt.ConstructorDeclaration | tt.GetAccessorDeclaration | tt.SetAccessorDeclaration, priority: number = Priorities.Properties) {
		super(session, languageService, context, 'PropertiesTypeRunnable', SnippetLocation.Secondary, priority, ComputeCost.Medium);
		this.declaration = declaration;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.declaration.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const cacheInfo: CacheInfo | undefined = { emitMode: EmitMode.ClientBased, scope: this.createCacheScope(this.declaration) };
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, cacheInfo);
	}

	protected override run(result: RunnableResult, token: tt.CancellationToken): void {
		// We could consider object literals here as well. However they don't usually have a this
		// and all things a public in an literal. So we skip them for now.
		const containerDeclaration = this.declaration.parent;
		if (!ts.isClassDeclaration(containerDeclaration)) {
			return;
		}
		const program = this.getProgram();
		const symbols = this.context.getSymbols(program);
		const containerSymbol = symbols.getLeafSymbolAtLocation(containerDeclaration.name ? containerDeclaration.name : containerDeclaration);
		if (containerSymbol === undefined || !Symbols.isClass(containerSymbol)) {
			return;
		}
		if (containerSymbol.members !== undefined) {
			for (const member of containerSymbol.members.values()) {
				token.throwIfCancellationRequested();
				if (!this.handleMember(result, member, symbols, ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) {
					return;
				}
			}
		}

		for (const type of symbols.getAllSuperClasses(containerSymbol)) {
			token.throwIfCancellationRequested();
			if (type.members === undefined) {
				continue;
			}
			for (const member of type.members.values()) {
				token.throwIfCancellationRequested();
				if (!this.handleMember(result, member, symbols, ts.ModifierFlags.Public | ts.ModifierFlags.Protected)) {
					return;
				}
			}
		}
	}

	private handleMember(_result: RunnableResult, symbol: tt.Symbol, symbols: Symbols, flags: tt.ModifierFlags): boolean {
		if (!Symbols.hasModifierFlags(symbol, flags)) {
			return true;
		}

		let continueResult: boolean = true;
		for (const [typeSymbol, name] of this.getEmitMemberData(symbol, symbols)) {
			if (typeSymbol === undefined) {
				continue;
			}
			continueResult = continueResult && this.handleSymbol(typeSymbol, name, true);
			if (!continueResult) {
				break;
			}
		}
		return continueResult;
	}

	private static readonly NoEmitData: readonly [tt.Symbol | undefined, string | undefined] = Object.freeze<[tt.Symbol | undefined, string | undefined]>([undefined, undefined]);
	private *getEmitMemberData(symbol: tt.Symbol, symbols: Symbols): IterableIterator<readonly [tt.Symbol | undefined, string | undefined]> {
		if (Symbols.isProperty(symbol)) {
			const type = symbols.getTypeChecker().getTypeOfSymbol(symbol);
			let typeSymbol = type.symbol;
			if (typeSymbol === undefined) {
				return;
			}
			typeSymbol = symbols.getLeafSymbol(typeSymbol);
			let name: string | undefined = undefined;
			const declaration = Symbols.getDeclaration<tt.PropertyDeclaration>(symbol, ts.SyntaxKind.PropertyDeclaration);
			if (declaration !== undefined) {
				if (declaration.type !== undefined) {
					name = tss.Nodes.getTypeName(declaration.type);
				}
			}
			yield [typeSymbol, name];
			return;
		} else if (Symbols.isMethod(symbol)) {
			const type = symbols.getTypeChecker().getTypeOfSymbol(symbol);
			const signatures = type.getCallSignatures();
			if (signatures.length === 0) {
				return;
			}
			for (const signature of signatures) {
				let typeSymbol = signature.getReturnType().symbol;
				if (typeSymbol === undefined) {
					yield PropertiesTypeRunnable.NoEmitData;
				}
				typeSymbol = symbols.getLeafSymbol(typeSymbol);
				let name: string | undefined = undefined;
				const declaration = signature.getDeclaration();
				if (declaration !== undefined) {
					if (declaration.type !== undefined) {
						name = tss.Nodes.getTypeName(declaration.type);
					}
				}
				yield [typeSymbol, name];
			}
		}
		return;
	}
}

export class MethodContextProvider extends ClassPropertyContextProvider<tt.MethodDeclaration> {

	constructor(declaration: tt.MethodDeclaration, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
	}

	public override provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		if (session.enableBlueprintSearch()) {
			result.addPrimary(new SimilarMethodRunnable(session, languageService, context, this.declaration));
		}
		super.provide(result, session, languageService, context, token);
		result.addSecondary(new PropertiesTypeRunnable(session, languageService, context, this.declaration));
	}
}

export class AccessorProvider extends ClassPropertyContextProvider<tt.GetAccessorDeclaration | tt.SetAccessorDeclaration> {

	constructor(declaration: tt.GetAccessorDeclaration | tt.SetAccessorDeclaration, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
	}

	public override provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		super.provide(result, session, languageService, context, token);
		result.addSecondary(new PropertiesTypeRunnable(session, languageService, context, this.declaration));
	}
}

class ConstructorBlueprintSearch extends FindInSiblingClassSearch<tt.ConstructorDeclaration> {

	constructor(program: tt.Program, symbols: Symbols, search: ConstructorBlueprintSearch);
	constructor(program: tt.Program, symbols: Symbols, classDeclaration: tt.ClassDeclaration, extendsSymbol: tt.Symbol, declaration: tt.ConstructorDeclaration, stateProvider: StateProvider);
	constructor(program: tt.Program, symbols: Symbols, classDeclarationOrSearch: tt.ClassDeclaration | ConstructorBlueprintSearch, extendsSymbol?: tt.Symbol, declaration?: tt.ConstructorDeclaration, stateProvider?: StateProvider) {
		if (classDeclarationOrSearch instanceof ConstructorBlueprintSearch) {
			super(program, symbols, classDeclarationOrSearch);
		} else {
			super(program, symbols, classDeclarationOrSearch, extendsSymbol!, declaration!, stateProvider!);
		}
	}

	public with(program: tt.Program): ConstructorBlueprintSearch {
		if (program === this.program) {
			return this;
		}
		return new ConstructorBlueprintSearch(program, new Symbols(program), this);
	}

	protected getMemberName(): tt.__String {
		return ts.InternalSymbolName.Constructor as tt.__String;
	}
}

class SimilarConstructorRunnable extends SimilarPropertyRunnable<tt.ConstructorDeclaration> {

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: tt.ConstructorDeclaration) {
		super(session, languageService, context, declaration);
	}

	protected override createSearch(): Search<tt.ClassDeclaration> | undefined {
		const classDeclaration = this.declaration.parent;
		if (!ts.isClassDeclaration(classDeclaration)) {
			return undefined;
		}

		const extendsClause = ClassDeclarations.getExtendsClause(classDeclaration);
		if (extendsClause === undefined || extendsClause.types.length === 0) {
			return undefined;
		} else {
			const extendsSymbol = this.symbols.getLeafSymbolAtLocation(extendsClause.types[0].expression);
			if (extendsSymbol === undefined || !Symbols.isClass(extendsSymbol)) {
				return undefined;
			}
			return new ConstructorBlueprintSearch(this.getProgram(), this.symbols, classDeclaration, extendsSymbol, this.declaration, this.session);
		}
	}
}

export class ConstructorContextProvider extends ClassPropertyContextProvider<tt.ConstructorDeclaration> {

	constructor(declaration: tt.ConstructorDeclaration, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
	}

	public override provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		if (session.enableBlueprintSearch()) {
			result.addPrimary(new SimilarConstructorRunnable(session, languageService, context, this.declaration));
		}
		super.provide(result, session, languageService, context, token);
	}
}