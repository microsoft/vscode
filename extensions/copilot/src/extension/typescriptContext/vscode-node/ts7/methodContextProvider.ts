/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SignatureKind, type Project, type Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import {
	escapeLeadingUnderscores,
	InternalSymbolName,
	ModifierFlags,
	isClassDeclaration,
	isConstructorDeclaration,
	isExpressionWithTypeArguments,
	isGetAccessorDeclaration,
	isInterfaceDeclaration,
	isMethodDeclaration,
	isMethodSignatureDeclaration,
	isPropertyDeclaration,
	isPropertySignatureDeclaration,
	isSetAccessorDeclaration,
	isTypeReferenceNode,
	type ClassDeclaration,
	type ConstructorDeclaration,
	type GetAccessorDeclaration,
	type InterfaceDeclaration,
	type MethodDeclaration,
	type Node,
	type SetAccessorDeclaration,
	type SourceFile,
	type __String,
} from '@typescript/native/unstable/ast';
import { FunctionLikeContextProvider, FunctionLikeContextRunnable } from './baseContextProviders';
import { CodeSnippetBuilder } from './code';
import {
	AbstractContextRunnable,
	ComputeCost,
	Search,
	SnippetLocation,
	type ComputeContextSession,
	type ContextResult,
	type ContextRunnableCollector,
	type ProviderComputeContext,
	type RequestContext,
	type RunnableResult,
} from './contextProvider';
import * as protocol from '../../common/serverProtocol';
import { type CancellationTokenWithTimer, Symbols, type TokenInfo } from './typescripts';

abstract class ClassPropertyBlueprintSearch<T extends MethodDeclaration | ConstructorDeclaration> extends Search<ClassDeclaration> {
	protected declaration: T;

	constructor(project: Project, symbols: Symbols, declaration: T) {
		super(project, symbols);
		this.declaration = declaration;
	}

	public isSame(other: T): boolean {
		return this.declaration === other || (this.declaration.getSourceFile().path === other.getSourceFile().path && this.declaration.pos === other.pos);
	}

	public override async score(project: Project, context: RequestContext): Promise<number> {
		if (await project.program.getSourceFile(this.declaration.getSourceFile().fileName) === undefined) {
			return 0;
		}
		if (context.neighborFiles.length === 0) {
			return 1;
		}
		let result = Math.pow(10, context.neighborFiles.length.toString().length);
		for (const file of context.neighborFiles) {
			if (await project.program.getSourceFile(file) !== undefined) {
				result++;
			}
		}
		return result;
	}

	protected async findClassWithMember(startSymbols: readonly NativeSymbol[], memberName: __String, token: CancellationTokenWithTimer): Promise<ClassDeclaration | undefined> {
		const queue = [...startSymbols];
		const seen = new Set<number>(queue.map(symbol => symbol.id));
		while (queue.length > 0) {
			token.throwIfCancellationRequested();
			const current = queue.shift();
			if (current === undefined) {
				break;
			}
			for (const candidate of await this.getDirectSubTypes(current, token)) {
				if (seen.has(candidate.id)) {
					continue;
				}
				seen.add(candidate.id);
				queue.push(candidate);
				if (!Symbols.isClass(candidate)) {
					continue;
				}
				const member = (await candidate.getMembers()).get(memberName);
				if (member === undefined) {
					continue;
				}
				for (const declaration of await this.symbols.getDeclarations(member)) {
					if (declaration.kind !== this.declaration.kind || (!isMethodDeclaration(declaration) && !isConstructorDeclaration(declaration))) {
						continue;
					}
					const parent = declaration.parent;
					if (isClassDeclaration(parent) && !this.isCurrentClass(parent)) {
						return parent;
					}
				}
			}
		}
		return undefined;
	}

	private async getDirectSubTypes(symbol: NativeSymbol, token: CancellationTokenWithTimer): Promise<NativeSymbol[]> {
		const result: NativeSymbol[] = [];
		const seen = new Set<number>();
		for (const declaration of await this.symbols.getDeclarations(symbol)) {
			const name = (isClassDeclaration(declaration) || isInterfaceDeclaration(declaration)) ? declaration.name : undefined;
			if (name === undefined) {
				continue;
			}
			for (const entry of await this.project.checker.getReferencedSymbolsForNode(name, name.getStart())) {
				for (const reference of entry.references) {
					token.throwIfCancellationRequested();
					const node = await reference.resolve(this.project);
					const subtypeDeclaration = node === undefined ? undefined : this.getContainingHeritageDeclaration(node);
					if (subtypeDeclaration === undefined) {
						continue;
					}
					const subtype = await this.symbols.getLeafSymbolAtLocation(subtypeDeclaration.name ?? subtypeDeclaration);
					if (subtype !== undefined && !seen.has(subtype.id)) {
						seen.add(subtype.id);
						result.push(subtype);
					}
				}
			}
		}
		return result;
	}

	private getContainingHeritageDeclaration(node: Node): ClassDeclaration | InterfaceDeclaration | undefined {
		let current: Node | undefined = node;
		let inHeritageClause = false;
		while (current !== undefined) {
			if (isExpressionWithTypeArguments(current)) {
				inHeritageClause = true;
			}
			if (inHeritageClause && (isClassDeclaration(current) || isInterfaceDeclaration(current))) {
				return current;
			}
			current = current.parent;
		}
		return undefined;
	}

	private isCurrentClass(candidate: ClassDeclaration): boolean {
		const current = this.declaration.parent;
		return isClassDeclaration(current) && (candidate === current || (candidate.getSourceFile().path === current.getSourceFile().path && candidate.pos === current.pos));
	}
}

abstract class MethodBlueprintSearch extends ClassPropertyBlueprintSearch<MethodDeclaration> {
	constructor(project: Project, symbols: Symbols, declaration: MethodDeclaration) {
		super(project, symbols, declaration);
	}

	public static async create(project: Project, symbols: Symbols, declaration: MethodDeclaration): Promise<ClassPropertyBlueprintSearch<MethodDeclaration> | undefined> {
		const classDeclaration = declaration.parent;
		if (!isClassDeclaration(classDeclaration)) {
			return undefined;
		}
		const classSymbol = await symbols.getLeafSymbolAtLocation(classDeclaration.name ?? classDeclaration);
		if (!Symbols.isClass(classSymbol)) {
			return undefined;
		}
		const direct = await symbols.getDirectSuperSymbols(classSymbol);
		const isPrivate = 'modifierFlags' in declaration && typeof declaration.modifierFlags === 'number' && (declaration.modifierFlags & ModifierFlags.Private) !== 0;
		if (isPrivate && direct?.extends !== undefined) {
			return new PrivateMethodBlueprintSearch(project, symbols, classDeclaration, direct.extends.symbol, declaration);
		}

		const memberName = escapeLeadingUnderscores(declaration.name.getText());
		for (const superClass of await symbols.getAllSuperClasses(classSymbol)) {
			if ((await superClass.getMembers()).has(memberName)) {
				return new FindMethodInSubclassSearch(project, symbols, classDeclaration, declaration, superClass);
			}
		}
		const typesToCheck: NativeSymbol[] = [];
		for (const superType of await symbols.getAllSuperTypes(classSymbol)) {
			if ((Symbols.isInterface(superType) || Symbols.isTypeLiteral(superType)) && (await superType.getMembers()).has(memberName)) {
				typesToCheck.push(superType);
			}
		}
		return typesToCheck.length === 0 ? undefined : new FindMethodInHierarchySearch(project, symbols, classDeclaration, declaration, typesToCheck);
	}
}

abstract class FindInSiblingClassSearch<T extends MethodDeclaration | ConstructorDeclaration> extends ClassPropertyBlueprintSearch<T> {
	private readonly classDeclaration: ClassDeclaration;
	protected readonly extendsSymbol: NativeSymbol;

	constructor(project: Project, symbols: Symbols, classDeclaration: ClassDeclaration, extendsSymbol: NativeSymbol, declaration: T) {
		super(project, symbols, declaration);
		this.classDeclaration = classDeclaration;
		this.extendsSymbol = extendsSymbol;
	}

	public override async run(_context: RequestContext, token: CancellationTokenWithTimer): Promise<ClassDeclaration | undefined> {
		return this.findClassWithMember([this.extendsSymbol], this.getMemberName(), token);
	}

	protected abstract getMemberName(): __String;

	protected getClassDeclaration(): ClassDeclaration {
		return this.classDeclaration;
	}
}

class PrivateMethodBlueprintSearch extends FindInSiblingClassSearch<MethodDeclaration> {
	public override with(project: Project, symbols: Symbols): PrivateMethodBlueprintSearch {
		return project === this.project ? this : new PrivateMethodBlueprintSearch(project, symbols, this.getClassDeclaration(), this.extendsSymbol, this.declaration);
	}

	protected override getMemberName(): __String {
		return escapeLeadingUnderscores(this.declaration.name.getText());
	}
}

class FindMethodInSubclassSearch extends MethodBlueprintSearch {
	private readonly classDeclaration: ClassDeclaration;
	private readonly startClass: NativeSymbol;

	constructor(project: Project, symbols: Symbols, classDeclaration: ClassDeclaration, declaration: MethodDeclaration, startClass: NativeSymbol) {
		super(project, symbols, declaration);
		this.classDeclaration = classDeclaration;
		this.startClass = startClass;
	}

	public override with(project: Project, symbols: Symbols): FindMethodInSubclassSearch {
		return project === this.project ? this : new FindMethodInSubclassSearch(project, symbols, this.classDeclaration, this.declaration, this.startClass);
	}

	public override async run(_context: RequestContext, token: CancellationTokenWithTimer): Promise<ClassDeclaration | undefined> {
		return this.findClassWithMember([this.startClass], escapeLeadingUnderscores(this.declaration.name.getText()), token);
	}
}

class FindMethodInHierarchySearch extends MethodBlueprintSearch {
	private readonly classDeclaration: ClassDeclaration;
	private readonly typesToCheck: readonly NativeSymbol[];

	constructor(project: Project, symbols: Symbols, classDeclaration: ClassDeclaration, declaration: MethodDeclaration, typesToCheck: readonly NativeSymbol[]) {
		super(project, symbols, declaration);
		this.classDeclaration = classDeclaration;
		this.typesToCheck = typesToCheck;
	}

	public override with(project: Project, symbols: Symbols): FindMethodInHierarchySearch {
		return project === this.project ? this : new FindMethodInHierarchySearch(project, symbols, this.classDeclaration, this.declaration, this.typesToCheck);
	}

	public override async run(_context: RequestContext, token: CancellationTokenWithTimer): Promise<ClassDeclaration | undefined> {
		return this.findClassWithMember(this.typesToCheck, escapeLeadingUnderscores(this.declaration.name.getText()), token);
	}
}

abstract class SimilarPropertyRunnable<T extends MethodDeclaration | ConstructorDeclaration> extends FunctionLikeContextRunnable<T> {
	constructor(session: ComputeContextSession, project: Project, context: RequestContext, declaration: T, priority: number = protocol.Priorities.Blueprints) {
		super(session, project, context, 'SimilarPropertyRunnable', declaration, priority, ComputeCost.High);
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		const scope = this.getCacheScope();
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, scope === undefined ? undefined : { emitMode: protocol.EmitMode.ClientBased, scope });
	}

	protected override async run(result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		const search = await this.createSearch(token);
		if (search === undefined) {
			return;
		}
		const [project, candidate] = await this.session.run(search, this.context, token);
		if (project === undefined || candidate === undefined) {
			return;
		}
		const builder = new CodeSnippetBuilder(this.context, this.context.getSymbols(project), this.declaration.getSourceFile());
		await builder.addDeclaration(candidate);
		result.addSnippet(builder, this.location, undefined);
	}

	protected abstract createSearch(token: CancellationTokenWithTimer): Promise<Search<ClassDeclaration> | undefined>;
}

class SimilarMethodRunnable extends SimilarPropertyRunnable<MethodDeclaration> {
	protected override async createSearch(): Promise<Search<ClassDeclaration> | undefined> {
		return MethodBlueprintSearch.create(this.getProject(), this.symbols, this.declaration);
	}
}

abstract class ClassPropertyContextProvider<T extends MethodDeclaration | ConstructorDeclaration | GetAccessorDeclaration | SetAccessorDeclaration> extends FunctionLikeContextProvider {
	protected readonly declaration: T;

	constructor(declaration: T, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
		this.declaration = declaration;
	}

	protected override async getTypeExcludes(project: Project, context: RequestContext): Promise<Set<NativeSymbol>> {
		const result = new Set<NativeSymbol>();
		const classDeclaration = this.declaration.parent;
		if (!isClassDeclaration(classDeclaration)) {
			return result;
		}
		const symbols = context.getSymbols(project);
		for (const heritageClause of classDeclaration.heritageClauses ?? []) {
			for (const type of heritageClause.types) {
				// const symbol = isExpressionWithTypeArguments(type) ? await symbols.getLeafSymbolAtLocation(type.expression) : await symbols.getLeafSymbolAtLocation(type.typeName);
				const symbol = await symbols.getLeafSymbolAtLocation(type.expression);
				if (Symbols.isClass(symbol)) {
					result.add(symbol);
				}
			}
		}
		return result;
	}
}

class PropertiesTypeRunnable extends AbstractContextRunnable {
	private readonly declaration: MethodDeclaration | ConstructorDeclaration | GetAccessorDeclaration | SetAccessorDeclaration;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, declaration: MethodDeclaration | ConstructorDeclaration | GetAccessorDeclaration | SetAccessorDeclaration, priority: number = protocol.Priorities.Properties) {
		super(session, project, context, 'PropertiesTypeRunnable', SnippetLocation.Secondary, priority, ComputeCost.Medium);
		this.declaration = declaration;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.declaration.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, { emitMode: protocol.EmitMode.ClientBased, scope: this.createCacheScope(this.declaration) });
	}

	protected override async run(_result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		const containerDeclaration = this.declaration.parent;
		if (!isClassDeclaration(containerDeclaration)) {
			return;
		}
		const containerSymbol = await this.symbols.getLeafSymbolAtLocation(containerDeclaration.name ?? containerDeclaration);
		if (!Symbols.isClass(containerSymbol)) {
			return;
		}
		for (const member of (await containerSymbol.getMembers()).values()) {
			token.throwIfCancellationRequested();
			if (!await this.handleMember(member, ModifierFlags.Private | ModifierFlags.Protected)) {
				return;
			}
		}
		for (const superClass of await this.symbols.getAllSuperClasses(containerSymbol)) {
			for (const member of (await superClass.getMembers()).values()) {
				token.throwIfCancellationRequested();
				if (!await this.handleMember(member, ModifierFlags.Public | ModifierFlags.Protected)) {
					return;
				}
			}
		}
	}

	private async handleMember(symbol: NativeSymbol, flags: ModifierFlags): Promise<boolean> {
		const declarations = await this.symbols.getDeclarations(symbol);
		if (!declarations.some(declaration => this.hasModifierFlags(declaration, flags))) {
			return true;
		}
		for (const [typeSymbol, name] of await this.getEmitMemberData(symbol, declarations)) {
			if (typeSymbol !== undefined && !await this.handleSymbol(typeSymbol, name, true)) {
				return false;
			}
		}
		return true;
	}

	private async getEmitMemberData(symbol: NativeSymbol, declarations: readonly Node[]): Promise<readonly (readonly [NativeSymbol | undefined, string | undefined])[]> {
		const result: (readonly [NativeSymbol | undefined, string | undefined])[] = [];
		const type = await this.getProject().checker.getTypeOfSymbol(symbol);
		if (type === undefined) {
			return result;
		}
		if (Symbols.isProperty(symbol)) {
			for (const typeSymbol of await this.symbols.getTypeSymbols(type)) {
				result.push([typeSymbol, this.getDeclaredTypeName(declarations)]);
			}
		} else if (Symbols.isMethod(symbol)) {
			for (const signature of await this.getProject().checker.getSignaturesOfType(type, SignatureKind.Call)) {
				const returnType = await this.getProject().checker.getReturnTypeOfSignature(signature);
				if (returnType !== undefined) {
					for (const typeSymbol of await this.symbols.getTypeSymbols(returnType)) {
						result.push([typeSymbol, this.getDeclaredTypeName(declarations)]);
					}
				}
			}
		}
		return result;
	}

	private getDeclaredTypeName(declarations: readonly Node[]): string | undefined {
		for (const declaration of declarations) {
			if ((isPropertyDeclaration(declaration) || isPropertySignatureDeclaration(declaration) || isMethodDeclaration(declaration) || isMethodSignatureDeclaration(declaration) || isGetAccessorDeclaration(declaration) || isSetAccessorDeclaration(declaration)) && declaration.type !== undefined && isTypeReferenceNode(declaration.type)) {
				return declaration.type.typeName.getText();
			}
		}
		return undefined;
	}

	private hasModifierFlags(node: Node, flags: ModifierFlags): boolean {
		return 'modifierFlags' in node && typeof node.modifierFlags === 'number' && (node.modifierFlags & flags) !== 0;
	}
}

export class MethodContextProvider extends ClassPropertyContextProvider<MethodDeclaration> {
	constructor(declaration: MethodDeclaration, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		if (session.enableBlueprintSearch()) {
			result.addPrimary(new SimilarMethodRunnable(session, project, context, this.declaration));
		}
		await super.provide(result, session, project, context, token);
		result.addSecondary(new PropertiesTypeRunnable(session, project, context, this.declaration));
	}
}

export class AccessorProvider extends ClassPropertyContextProvider<GetAccessorDeclaration | SetAccessorDeclaration> {
	constructor(declaration: GetAccessorDeclaration | SetAccessorDeclaration, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		await super.provide(result, session, project, context, token);
		result.addSecondary(new PropertiesTypeRunnable(session, project, context, this.declaration));
	}
}

class ConstructorBlueprintSearch extends FindInSiblingClassSearch<ConstructorDeclaration> {
	public override with(project: Project, symbols: Symbols): ConstructorBlueprintSearch {
		return project === this.project ? this : new ConstructorBlueprintSearch(project, symbols, this.getClassDeclaration(), this.extendsSymbol, this.declaration);
	}

	protected override getMemberName(): __String {
		return InternalSymbolName.Constructor;
	}
}

class SimilarConstructorRunnable extends SimilarPropertyRunnable<ConstructorDeclaration> {
	protected override async createSearch(): Promise<Search<ClassDeclaration> | undefined> {
		const classDeclaration = this.declaration.parent;
		if (!isClassDeclaration(classDeclaration)) {
			return undefined;
		}
		const classSymbol = await this.symbols.getLeafSymbolAtLocation(classDeclaration.name ?? classDeclaration);
		if (!Symbols.isClass(classSymbol)) {
			return undefined;
		}
		const direct = await this.symbols.getDirectSuperSymbols(classSymbol);
		return direct?.extends === undefined
			? undefined
			: new ConstructorBlueprintSearch(this.getProject(), this.symbols, classDeclaration, direct.extends.symbol, this.declaration);
	}
}

export class ConstructorContextProvider extends ClassPropertyContextProvider<ConstructorDeclaration> {
	constructor(declaration: ConstructorDeclaration, tokenInfo: TokenInfo, computeContext: ProviderComputeContext) {
		super(declaration, tokenInfo, computeContext);
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		if (session.enableBlueprintSearch()) {
			result.addPrimary(new SimilarConstructorRunnable(session, project, context, this.declaration));
		}
		await super.provide(result, session, project, context, token);
	}
}
