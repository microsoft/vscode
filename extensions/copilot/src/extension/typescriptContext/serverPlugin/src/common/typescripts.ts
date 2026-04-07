/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import type { Hash } from './host';
import type { KeyComputationContext } from './types';

const EmptyIterator = (function* () { })();
namespace tss {
	export type SymbolId = number;
	type InternalTypeScript = {
		getTokenAtPosition(sourceFile: tt.SourceFile, position: number): tt.Node;
		getTouchingToken(sourceFile: tt.SourceFile, position: number, includePrecedingTokenAtEndPosition?: (n: tt.Node) => boolean): tt.Node;
		getNameTable(sourceFile: tt.SourceFile): Map<tt.__String, number>;
		findReferencedSymbols(program: tt.Program, cancellationToken: tt.CancellationToken, sourceFiles: readonly tt.SourceFile[], sourceFile: tt.SourceFile, position: number): tt.ReferencedSymbol[] | undefined;
		getSymbolId(symbol: tt.Symbol): SymbolId;
	} & typeof ts;

	const its = ts as unknown as InternalTypeScript;

	export const getTokenAtPosition: (sourceFile: tt.SourceFile, position: number) => tt.Node = its.getTokenAtPosition;
	export const getTouchingToken: (sourceFile: tt.SourceFile, position: number, includePrecedingTokenAtEndPosition?: (n: tt.Node) => boolean) => tt.Node = its.getTouchingToken;
	export const getNameTable: (sourceFile: tt.SourceFile) => Map<tt.__String, number> = its.getNameTable;
	export const findReferencedSymbols: (program: tt.Program, cancellationToken: tt.CancellationToken, sourceFiles: readonly tt.SourceFile[], sourceFile: tt.SourceFile, position: number) => tt.ReferencedSymbol[] | undefined = its.findReferencedSymbols;
	export const getSymbolId: (symbol: tt.Symbol) => SymbolId = its.getSymbolId;

	export type TokenInfo = {
		token: tt.Node;
		touching?: tt.Node;
		previous?: tt.Node;
	};

	export function getRelevantTokens(sourceFile: tt.SourceFile, position: number): TokenInfo {
		// We first get the token at the position. This will be the leaf token even if
		// position denotes a white space. In this case the next token after the while space
		// will be considered.
		const token = tss.getTokenAtPosition(sourceFile, position);

		if (token.kind === ts.SyntaxKind.EndOfFileToken) {
			let current = token;
			let start = position;
			while (current.kind === ts.SyntaxKind.EndOfFileToken && start > 0) {
				current = tss.getTokenAtPosition(sourceFile, --start);
			}
			if (current.kind === ts.SyntaxKind.EndOfFileToken) {
				return { token };
			} else {
				return { previous: current, token };
			}
		}

		const result: TokenInfo = { token };
		let needsPrevious = true;
		// if the position is actual inside the token use it exclusively.
		if (position > token.getStart(sourceFile)) {
			result.touching = token;
			needsPrevious = false;
		} else if (position < token.getStart(sourceFile)) {
			let candidate = token.parent;
			while (candidate !== undefined) {
				if (position >= candidate.getStart(sourceFile)) {
					result.touching = candidate;
					break;
				}
				candidate = candidate.parent;
			}
		}
		if (needsPrevious) {
			let current = token;
			while (current.parent) {
				const children = Nodes.getChildren(current.parent, sourceFile);
				const currentIndex = findNodeIndex(children, current);
				if (currentIndex > 0) {
					// Found a previous sibling, now get its rightmost token
					let previousNode = children[currentIndex - 1];
					let previousChildren = Nodes.getChildren(previousNode, sourceFile);
					while (previousChildren.length > 0) {
						const lastChild = previousChildren[previousChildren.length - 1];
						if (lastChild.kind === ts.SyntaxKind.EndOfFileToken) {
							break;
						}
						previousNode = lastChild;
						previousChildren = Nodes.getChildren(previousNode, sourceFile);
					}
					if (previousNode.kind !== ts.SyntaxKind.EndOfFileToken) {
						result.previous = previousNode;
						break;
					}
				}
				current = current.parent;
			}
		}

		return result;
	}

	function findNodeIndex(nodes: readonly tt.Node[], target: tt.Node): number {
		let left = 0;
		let right = nodes.length - 1;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const midPos = nodes[mid].getStart();
			const targetPos = target.getStart();

			if (midPos === targetPos) {
				// Found matching position, but need to verify it's the same node
				if (nodes[mid] === target) {
					return mid;
				}
				return -1;
			}

			if (midPos < targetPos) {
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}
		return -1;
	}

	export namespace Programs {
		interface InternalCompilerOptions extends tt.CompilerOptions {
			configFilePath?: string;
		}

		export function getKey(program: tt.Program): string | undefined {
			const compilerOptions = program.getCompilerOptions();
			if (typeof compilerOptions.project === 'string') {
				return compilerOptions.project;
			}
			const configFilePath = (compilerOptions as InternalCompilerOptions).configFilePath;
			return typeof configFilePath === 'string' ? configFilePath : undefined;
		}
	}

	export class CancellationTokenWithTimer implements tt.CancellationToken {

		private readonly cancellationToken: tt.HostCancellationToken | undefined;
		private readonly end: number;
		constructor(cancellationToken: tt.HostCancellationToken | undefined, startTime: number, budget: number, isDebugging: boolean = false) {
			this.cancellationToken = isDebugging ? undefined : cancellationToken;
			this.end = isDebugging ? Number.MAX_VALUE : startTime + budget;
		}

		public isCancellationRequested(): boolean {
			if (this.cancellationToken && this.cancellationToken.isCancellationRequested()) {
				return true;
			}
			return Date.now() > this.end;
		}

		public isTimedOut(): boolean {
			return Date.now() > this.end;
		}

		public throwIfCancellationRequested(): void {
			if (this.isCancellationRequested()) {
				throw new ts.OperationCanceledException();
			}
		}
	}

	export class NullCancellationToken implements tt.CancellationToken {
		public isCancellationRequested(): boolean {
			return false;
		}
		public throwIfCancellationRequested(): void {
			// noop
		}
	}

	interface InternalNode extends tt.Node {
		symbol?: tt.Symbol;
	}

	export namespace Nodes {

		export function getChildren(node: tt.Node, sourceFile: tt.SourceFile): readonly tt.Node[] {
			// If you ask a source file for its children you get an array
			// with [SyntaxList, EndOfFileToken]
			if (ts.isSourceFile(node)) {
				const children = node.getChildren(sourceFile);
				if (children.length > 0 && children[0].kind === ts.SyntaxKind.SyntaxList) {
					return children[0].getChildren(sourceFile);
				} else {
					return node.statements;
				}
			} else {
				return node.getChildren(sourceFile);
			}
		}


		export function getSymbol(node: tt.Node): tt.Symbol | undefined {
			return (node as InternalNode).symbol;
		}

		export function getTypeName(node: tt.TypeNode): string | undefined {
			if (ts.isTypeReferenceNode(node)) {
				return node.typeName.getText();
			}
			return undefined;
		}

		export function getParentOfKind(node: tt.Node, kind: tt.SyntaxKind): tt.Node | undefined {
			let current: tt.Node | undefined = node;
			while (current !== undefined) {
				if (current.kind === kind) {
					return current;
				}
				current = current.parent;
			}
			return undefined;
		}
	}

	export namespace Declarations {
		export function isPrivate(node: tt.Declaration): boolean {
			const modifierFlags = ts.getCombinedModifierFlags(node);
			return (modifierFlags & ts.ModifierFlags.Private) !== 0;
		}
	}

	export namespace TypeDeclarations {

		export type Type = tt.InterfaceDeclaration | tt.ClassDeclaration;

		export enum Mode {
			topLevel
		}

		export function is(node: tt.Node): node is Type {
			const kind = node.kind;
			return kind === ts.SyntaxKind.InterfaceDeclaration || kind === ts.SyntaxKind.ClassDeclaration;
		}

		export function entries(sourceFile: tt.SourceFile, _mode: Mode = Mode.topLevel): IterableIterator<Type> {
			return fromStatements(sourceFile.statements);
		}

		function* fromStatements(statements: readonly tt.Statement[]): IterableIterator<Type> {
			for (const statement of statements) {
				if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
					yield statement;
				} else if (ts.isModuleDeclaration(statement) && statement.body !== undefined && ts.isModuleBlock(statement.body)) {
					yield* fromStatements(statement.body.statements);
				}
			}
		}
	}

	export namespace ClassDeclarations {
		export function getExtendsClause(classDeclaration: tt.ClassDeclaration): tt.HeritageClause | undefined {
			const heritageClauses = classDeclaration.heritageClauses;
			if (heritageClauses === undefined) {
				return undefined;
			}
			return heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
		}

		export function entries(sourceFile: tt.SourceFile): IterableIterator<tt.ClassDeclaration> {
			return fromStatements(sourceFile.statements);
		}

		function* fromStatements(statements: readonly tt.Statement[]): IterableIterator<tt.ClassDeclaration> {
			for (const statement of statements) {
				if (ts.isClassDeclaration(statement)) {
					yield statement;
				} else if (ts.isModuleDeclaration(statement) && statement.body !== undefined && ts.isModuleBlock(statement.body)) {
					yield* fromStatements(statement.body.statements);
				}
			}
		}

		export function fromSymbol(symbol: tt.Symbol): tt.ClassDeclaration | undefined {
			if (!Symbols.isClass(symbol)) {
				return undefined;
			}
			const declarations = symbol.getDeclarations();
			if (declarations === undefined) {
				return undefined;
			}
			for (const declaration of declarations) {
				if (ts.isClassDeclaration(declaration)) {
					return declaration;
				}
			}
			return undefined;
		}
	}

	export namespace TypeChecker {

		interface InternalTypeChecker extends tt.TypeChecker {
			getAccessibleSymbolChain(symbol: tt.Symbol, enclosingDeclaration: tt.Node | undefined, meaning: tt.SymbolFlags, useOnlyExternalAliasing: boolean): tt.Symbol[] | undefined;
		}
		export function getAccessibleSymbolChain(typeChecker: tt.TypeChecker, symbol: tt.Symbol, enclosingDeclaration: tt.Node | undefined, meaning: tt.SymbolFlags, useOnlyExternalAliasing: boolean): tt.Symbol[] | undefined {
			const internalTypeChecker = typeChecker as InternalTypeChecker;
			if (typeof internalTypeChecker.getAccessibleSymbolChain !== 'function') {
				return undefined;
			}
			return internalTypeChecker.getAccessibleSymbolChain(symbol, enclosingDeclaration, meaning, useOnlyExternalAliasing);
		}
	}

	export namespace Types {

		export function isIntersection(type: tt.Type): type is tt.IntersectionType {
			return (type.flags & ts.TypeFlags.Intersection) !== 0;
		}

		export function isUnion(type: tt.Type): type is tt.UnionType {
			return (type.flags & ts.TypeFlags.Union) !== 0;
		}

		export function getBaseTypes(type: tt.Type): tt.Type[] | undefined {
			return type.getBaseTypes();
		}

		export function getExtendsTypes(typeChecker: tt.TypeChecker, type: tt.Type): tt.Type[] | undefined {
			const symbol = type.getSymbol();
			if (symbol === undefined) {
				return undefined;
			}
			const declarations = symbol.getDeclarations();
			if (declarations === undefined) {
				return undefined;
			}
			const result: tt.Type[] = []; // Changed from tts.Type[] to tts.Type[]
			for (const declaration of declarations) {
				if (ts.isClassDeclaration(declaration)) {
					const heritageClauses = declaration.heritageClauses;
					if (heritageClauses !== undefined) {
						for (const heritageClause of heritageClauses) {
							for (const type of heritageClause.types) {
								result.push(typeChecker.getTypeAtLocation(type.expression));
							}
						}
					}
				}
			}
			return result;
		}
	}

	interface InternalLanguageServiceHost extends tt.LanguageServiceHost {
		runWithTemporaryFileUpdate?(rootFile: string, updatedText: string, cb: (updatedProgram: tt.Program, originalProgram: tt.Program | undefined, updatedFile: tt.SourceFile) => void): void;
	}

	export namespace LanguageServiceHost {
		export function runWithTemporaryFileUpdate(host: tt.LanguageServiceHost, rootFile: string, updatedText: string, cb: (updatedProgram: tt.Program, originalProgram: tt.Program | undefined, updatedFile: tt.SourceFile) => void): void {
			const internalHost = host as InternalLanguageServiceHost;
			if (typeof internalHost.runWithTemporaryFileUpdate === 'function') {
				internalHost.runWithTemporaryFileUpdate(rootFile, updatedText, cb);
			}
		}
	}

	interface InternalSymbol extends tt.Symbol {
		parent?: tt.Symbol;
		containingType?: tt.UnionOrIntersectionType;
	}

	export enum Traversal {
		depthFirst = 'depthFirst',
		breadthFirst = 'breadthFirst'
	}

	enum InternalTraversal {
		breadthFirstOnly = 'breadthFirstOnly'
	}

	interface SubTypeTraversal<T extends tt.ClassDeclaration | TypeDeclarations.Type> {
		start: tt.Symbol;
		mode: Traversal | InternalTraversal;
		isValid(): boolean;
		isValidDeclaration(declaration: tt.Declaration): boolean;
		getDeclarations(sourceFile: tt.SourceFile): IterableIterator<T>;
		isSubType(declaration: T, symbol: tt.Symbol): boolean;
		with(start: tt.Symbol): SubTypeTraversal<T>;
	}

	class ClassTraversal {

		public readonly start: tt.Symbol;
		public readonly mode: Traversal | InternalTraversal;
		private readonly symbols: Symbols;

		constructor(start: tt.Symbol, mode: Traversal | InternalTraversal, symbols: Symbols) {
			this.start = start;
			this.mode = mode;
			this.symbols = symbols;
		}

		public isValid(): boolean {
			return Symbols.isClass(this.start);
		}

		public isValidDeclaration(declaration: tt.Declaration): boolean {
			return ts.isClassDeclaration(declaration);
		}

		public *getDeclarations(sourceFile: tt.SourceFile): IterableIterator<tt.ClassDeclaration> {
			yield* ClassDeclarations.entries(sourceFile);
		}

		public isSubType(declaration: tt.ClassDeclaration, symbol: tt.Symbol): boolean {
			return this.symbols.isSubClass(declaration, symbol);
		}

		with(start: tt.Symbol): ClassTraversal {
			return new ClassTraversal(start, this.mode, this.symbols);
		}
	}

	class TypeTraversal implements SubTypeTraversal<TypeDeclarations.Type> {
		public readonly start: tt.Symbol;
		public readonly mode: Traversal | InternalTraversal;
		private readonly symbols: Symbols;

		constructor(start: tt.Symbol, mode: Traversal | InternalTraversal, symbols: Symbols) {
			this.start = start;
			this.mode = mode;
			this.symbols = symbols;
		}

		public isValid(): boolean {
			return Symbols.isClass(this.start) || Symbols.isInterface(this.start) || Symbols.isTypeAlias(this.start);
		}

		public isValidDeclaration(declaration: tt.Declaration): boolean {
			return TypeDeclarations.is(declaration) || ts.isTypeAliasDeclaration(declaration);
		}

		public *getDeclarations(sourceFile: tt.SourceFile): IterableIterator<TypeDeclarations.Type> {
			yield* TypeDeclarations.entries(sourceFile, TypeDeclarations.Mode.topLevel);
		}

		public isSubType(declaration: TypeDeclarations.Type, symbol: tt.Symbol): boolean {
			return this.symbols.isSubType(declaration, symbol);
		}

		public with(start: tt.Symbol): TypeTraversal {
			return new TypeTraversal(start, this.mode, this.symbols);
		}
	}

	export type DirectSuperSymbolInfo = { extends?: { symbol: tt.Symbol; name: string } | undefined; implements?: { symbol: tt.Symbol; name: string }[] }

	export class Symbols {

		private readonly program: tt.Program;
		private readonly typeChecker: tt.TypeChecker;

		constructor(program: tt.Program) {
			this.program = program;
			this.typeChecker = program.getTypeChecker();
		}

		public static Unknown = 'unknown';
		public static Undefined = 'undefined';
		public static None = 'none';

		public static getParent(symbol: tt.Symbol): tt.Symbol | undefined {
			return (symbol as InternalSymbol).parent;
		}

		public static isFunctionScopedVariable(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.FunctionScopedVariable) !== 0;
		}

		public static isBlockScopedVariable(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.BlockScopedVariable) !== 0;
		}

		public static isConstructor(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Constructor) !== 0;
		}

		public static isGetAccessor(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.GetAccessor) !== 0;
		}

		public static isSetAccessor(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.SetAccessor) !== 0;
		}

		public static isMethod(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Method) !== 0;
		}

		public static isProperty(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Property) !== 0;
		}

		public static isClass(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Class) !== 0;
		}

		public static isObjectLiteral(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.ObjectLiteral) !== 0;
		}

		public static isInterface(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Interface) !== 0;
		}

		public static isTypeAlias(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.TypeAlias) !== 0;
		}

		public static isTypeParameter(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.TypeParameter) !== 0;
		}

		public static isTypeLiteral(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.TypeLiteral) !== 0;
		}

		public static isAlias(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Alias) !== 0;
		}

		public static isFunction(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Function) !== 0;
		}

		public static isValueModule(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.ValueModule) !== 0;
		}

		public static isNamespaceModule(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.NamespaceModule) !== 0;
		}

		public static isEnum(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Enum) !== 0;
		}

		public static isRegularEnum(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.RegularEnum) !== 0;
		}

		public static isConstEnum(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.ConstEnum) !== 0;
		}

		public static isSignature(symbol: tt.Symbol | undefined): boolean {
			return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Signature) !== 0;
		}

		public static hasModifierFlags(symbol: tt.Symbol, flags: tt.ModifierFlags): boolean {
			const declarations = symbol.declarations;
			if (declarations !== undefined) {
				for (const declaration of declarations) {
					const modifierFlags = ts.getCombinedModifierFlags(declaration);
					if ((modifierFlags & flags) === 0) {
						return false;
					}
				}
			}
			return true;
		}

		public static isAbstract(symbol: tt.Symbol): boolean {
			return this.hasModifierFlags(symbol, ts.ModifierFlags.Abstract);
		}

		public static isStatic(symbol: tt.Symbol): boolean {
			return this.hasModifierFlags(symbol, ts.ModifierFlags.Static);
		}

		public static isPrivate(symbol: tt.Symbol): boolean {
			return this.hasModifierFlags(symbol, ts.ModifierFlags.Private);
		}

		private static internalSymbolNames: Set<string>;
		public static isInternal(symbol: tt.Symbol): boolean {
			if (this.internalSymbolNames === undefined) {
				this.internalSymbolNames = new Set();
				for (const item in ts.InternalSymbolName) {
					this.internalSymbolNames.add((ts.InternalSymbolName as Record<string, string>)[item]);
				}
			}
			return this.internalSymbolNames.has(symbol.escapedName as string);
		}

		public static isSourceFile(symbol: tt.Symbol): boolean {
			const declarations = symbol.getDeclarations();
			return declarations !== undefined && declarations.length === 1 && ts.isSourceFile(declarations[0]);
		}

		public static fillSources(sources: Set<string>, symbol: tt.Symbol): void {
			if (symbol.declarations === undefined) {
				return;
			}
			for (const declaration of symbol.declarations) {
				const sourceFile = declaration.getSourceFile();
				if (sourceFile !== undefined) {
					sources.add(sourceFile.fileName);
				}
			}
		}

		public static getPrimarySourceFile(symbol: tt.Symbol): tt.SourceFile | undefined {
			const declarations = symbol.declarations;
			if (declarations === undefined || declarations.length === 0) {
				return undefined;
			}
			return declarations[0].getSourceFile();
		}

		public static getDeclaration<T extends tt.Declaration>(symbol: tt.Symbol, kind: tt.SyntaxKind): T | undefined {
			const declarations = symbol.getDeclarations();
			if (declarations === undefined || declarations.length === 0) {
				return undefined;
			}
			for (const declaration of declarations) {
				if (declaration.kind === kind) {
					return declaration as T;
				}
			}
			return undefined;
		}

		public static createKey(symbol: tt.Symbol, hashProvider: { createHash(algorithm: string): Hash }): string | undefined {
			const declarations = symbol.getDeclarations();
			if (declarations === undefined) {
				return undefined;
			}
			const fragments: { f: string; s: number; e: number; k: number }[] = [];
			for (const declaration of declarations) {
				const sourceFile = declaration.getSourceFile();
				fragments.push({
					f: sourceFile.fileName,
					s: declaration.getStart(),
					e: declaration.getEnd(),
					k: declaration.kind
				});
			}
			if (fragments.length > 1) {
				fragments.sort((a, b) => {
					let result = a.f < b.f ? -1 : (a.f > b.f ? 1 : 0);
					if (result !== 0) {
						return result;
					}
					result = a.s - b.s;
					if (result !== 0) {
						return result;
					}
					result = a.e - b.e;
					if (result !== 0) {
						return result;
					}
					return a.k - b.k;
				});
			}
			const hash = hashProvider.createHash('md5'); // CodeQL [SM04514] The 'md5' algorithm is used to compute a shorter string to represent a symbol in a map. It has no security implications.
			if ((symbol.flags & ts.SymbolFlags.Transient) !== 0) {
				hash.update(JSON.stringify({ trans: true }, undefined, 0));
			}
			hash.update(JSON.stringify(fragments, undefined, 0));
			return hash.digest('base64');
		}

		/**
		 * Creates a key for a symbol that takes the document's version into account. The key is used
		 * on the server side. It ensures that the key changes when the document changes.
		 * @param symbol The symbol to create the key for.
		 * @param versionProvider Provides the script version for a source file.
		 * @param hashProvider Provides a hash function to create the key.
		 * @returns A versioned key for the symbol or `undefined` if the key could not be created.
		 */
		public static createVersionedKey(symbol: tt.Symbol, context: KeyComputationContext): string | undefined {
			const declarations = symbol.getDeclarations();
			if (declarations === undefined) {
				return undefined;
			}
			const fragments: { f: string; v: string; s: number; e: number; k: number }[] = [];
			for (const declaration of declarations) {
				const sourceFile = declaration.getSourceFile();
				const scriptVersion = context.getScriptVersion(sourceFile);
				if (scriptVersion === undefined) {
					return undefined;
				}
				fragments.push({
					f: sourceFile.fileName,
					v: scriptVersion,
					s: declaration.getStart(),
					e: declaration.getEnd(),
					k: declaration.kind
				});
			}
			if (fragments.length > 1) {
				fragments.sort((a, b) => {
					let result = a.f < b.f ? -1 : (a.f > b.f ? 1 : 0);
					if (result !== 0) {
						return result;
					}
					result = a.v < b.v ? -1 : (a.v > b.v ? 1 : 0);
					if (result !== 0) {
						return result;
					}
					result = a.s - b.s;
					if (result !== 0) {
						return result;
					}
					result = a.e - b.e;
					if (result !== 0) {
						return result;
					}
					return a.k - b.k;
				});
			}
			const hash = context.host.createHash('md5'); // CodeQL [SM04514] The 'md5' algorithm is used to compute a shorter string to represent a symbol in a map. It has no security implications.
			if ((symbol.flags & ts.SymbolFlags.Transient) !== 0) {
				hash.update(JSON.stringify({ trans: true }, undefined, 0));
			}
			hash.update(JSON.stringify(fragments, undefined, 0));
			return hash.digest('base64');
		}

		public getFullyQualifiedSymbolName(symbol: tt.Symbol): string | undefined {
			const declarations = symbol.getDeclarations();
			if (declarations === undefined || declarations.length === 0) {
				return undefined;
			}

			// Make sure all declarations come out of the same source file. We only need to check
			// this for the first declaration since all parent declarations are in the same source file
			// when using a module system (see below).
			const sourceFile = declarations[0].getSourceFile();
			for (let i = 1; i < declarations.length; i++) {
				const otherSourceFile = declarations[i].getSourceFile();
				if (otherSourceFile !== sourceFile) {
					return undefined;
				}
			}

			// We can only compute a reasonable moniker for symbols used in module systems.
			// These are the huge majority of the TypeScript project so we ignore the rest
			// for now. In a module system the source file has an attached symbol.
			if (this.getSymbolAtLocation(sourceFile) === undefined) {
				return undefined;
			}

			const parts: string[] = [];
			let current: tt.Symbol | undefined = symbol;
			while (current !== undefined) {
				const declarations = current.declarations;
				if (declarations === undefined || declarations.length === 0) {
					return undefined;
				}
				// The symbol represents a source file. Use the file path as a moniker.
				if (declarations.length === 1 && ts.isSourceFile(declarations[0])) {
					break;
				}
				parts.push(this.getExportSymbolName(current));
				current = Symbols.getParent(current);
			}
			return parts.length === 0 ? undefined : `${parts.reverse().join('.')}`;
		}

		private static escapeRegExp: RegExp = new RegExp('\\.', 'g');
		private getExportSymbolName(symbol: tt.Symbol): string {
			let escapedName = symbol.getEscapedName() as string;
			if (escapedName.charAt(0) === '\"' || escapedName.charAt(0) === '\'') {
				escapedName = escapedName.substr(1, escapedName.length - 2);
			}
			// We use `.` as a path separator so escape `.` into `..`
			escapedName = escapedName.replace(Symbols.escapeRegExp, '..');
			return escapedName;
		}


		public getProgram(): tt.Program {
			return this.program;
		}

		public getTypeChecker(): tt.TypeChecker {
			return this.typeChecker;
		}

		public getSymbolAtLocation(node: tt.Node): tt.Symbol | undefined {
			let result = this.typeChecker.getSymbolAtLocation(node);
			if (result === undefined) {
				result = Nodes.getSymbol(node);
			}
			return result;
		}

		public getExtendsSymbol(symbol: tt.Symbol): [tt.Symbol | undefined, string | undefined] {
			const declarations = symbol.declarations;
			if (declarations === undefined) {
				return [undefined, undefined];
			}
			for (const declaration of declarations) {
				if (ts.isClassDeclaration(declaration)) {
					const heritageClauses = declaration.heritageClauses;
					if (heritageClauses !== undefined) {
						for (const heritageClause of heritageClauses) {
							if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
								const extendsNode = heritageClause.types[0]?.expression;
								let candidate = this.typeChecker.getSymbolAtLocation(extendsNode);
								if (Symbols.isAlias(candidate)) {
									candidate = this.typeChecker.getAliasedSymbol(candidate!);
								}
								if (Symbols.isClass(candidate)) {
									return [candidate, extendsNode.getText()];
								}
							}
						}
					}
				}
			}
			return [undefined, undefined];
		}

		public getDirectSuperSymbols(symbol: tt.Symbol): DirectSuperSymbolInfo | undefined {
			const declarations = symbol.declarations;
			if (declarations === undefined) {
				return undefined;
			}
			const result: DirectSuperSymbolInfo = {};
			for (const declaration of declarations) {
				if (ts.isClassDeclaration(declaration)) {
					const heritageClauses = declaration.heritageClauses;
					if (heritageClauses !== undefined) {
						for (const heritageClause of heritageClauses) {
							const extendsNode = heritageClause.types[0]?.expression;
							let candidate = this.typeChecker.getSymbolAtLocation(extendsNode);
							if (Symbols.isAlias(candidate)) {
								candidate = this.typeChecker.getAliasedSymbol(candidate!);
							}
							if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
								if (Symbols.isClass(candidate)) {
									result.extends = { symbol: candidate!, name: extendsNode.getText() };
								}
							} else if (heritageClause.token === ts.SyntaxKind.ImplementsKeyword) {
								if (Symbols.isInterface(candidate)) {
									if (result.implements === undefined) {
										result.implements = [];
									}
									result.implements.push({ symbol: candidate!, name: extendsNode.getText() });
								}
							}
						}
					}
				}
			}
			return result;
		}

		public getAliasedSymbolAtLocation(node: tt.Node): tt.Symbol | undefined {
			const symbol = this.getSymbolAtLocation(node);
			if (symbol === undefined) {
				return undefined;
			}
			if (Symbols.isAlias(symbol)) {
				return this.typeChecker.getAliasedSymbol(symbol);
			}
			return symbol;
		}

		public getLeafSymbolAtLocation(node: tt.Node): tt.Symbol | undefined {
			const symbol = this.getSymbolAtLocation(node);
			if (symbol === undefined) {
				return undefined;
			}
			return this.getLeafSymbol(symbol);
		}

		public getSymbolAtTypeNodeLocation(node: tt.TypeNode): tt.Symbol | undefined {
			if (ts.isTypeReferenceNode(node)) {
				return this.getLeafSymbolAtLocation(node.typeName);
			} else if (ts.isTypeLiteralNode(node)) {
				return this.getLeafSymbolAtLocation(node);
			} else {
				return this.getLeafSymbolAtLocation(node);
			}
		}

		public getAliasedSymbol(symbol: tt.Symbol): tt.Symbol | undefined {
			return Symbols.isAlias(symbol) ? this.typeChecker.getAliasedSymbol(symbol) : symbol;
		}

		public getLeafSymbol(symbol: tt.Symbol): tt.Symbol {
			let count = 0;
			while (Symbols.isAlias(symbol) && count++ < 10) {
				symbol = this.typeChecker.getAliasedSymbol(symbol);
			}
			while (Symbols.isTypeAlias(symbol) && count++ < 10) {
				const declarations = symbol.declarations;
				if (declarations === undefined || declarations.length !== 1) {
					break;
				}
				const declaration = declarations[0];
				if (!ts.isTypeAliasDeclaration(declaration)) {
					break;
				}
				const typeSymbol = this.getSymbolAtLocation(declaration.type);
				if (typeSymbol === undefined) {
					break;
				}
				symbol = typeSymbol;
			}
			return symbol;
		}

		public getAllSuperTypes(symbol: tt.Symbol, traversal: Traversal = Traversal.depthFirst): IterableIterator<tt.Symbol> {
			return this._getAllSuperTypes(symbol, traversal, new Set(), false);
		}

		public getAllSuperTypesWithPath(symbol: tt.Symbol, traversal: Traversal = Traversal.depthFirst): IterableIterator<[tt.Symbol, tt.Symbol]> {
			return this._getAllSuperTypes(symbol, traversal, new Set(), true);
		}

		public getDirectSuperTypes(symbol: tt.Symbol): IterableIterator<tt.Symbol> {
			return this._getAllSuperTypes(symbol, InternalTraversal.breadthFirstOnly, new Set(), false);
		}

		private _getAllSuperTypes(start: tt.Symbol, traversal: Traversal | InternalTraversal, seen: Set<tt.Symbol>, includePath: false): IterableIterator<tt.Symbol>;
		private _getAllSuperTypes(start: tt.Symbol, traversal: Traversal | InternalTraversal, seen: Set<tt.Symbol>, includePath: true): IterableIterator<[tt.Symbol, tt.Symbol]>;
		private _getAllSuperTypes(start: tt.Symbol, traversal: Traversal | InternalTraversal, seen: Set<tt.Symbol>, includePath: boolean): IterableIterator<tt.Symbol> | IterableIterator<[tt.Symbol, tt.Symbol]>;
		private *_getAllSuperTypes(start: tt.Symbol, traversal: Traversal | InternalTraversal, seen: Set<tt.Symbol>, includePath: boolean): IterableIterator<tt.Symbol | [tt.Symbol, tt.Symbol]> {
			const queue: tt.Symbol[] = [start];
			while (queue.length > 0) {
				let symbol = queue.pop()!;
				if (Symbols.isAlias(symbol)) {
					seen.add(symbol);
					symbol = this.typeChecker.getAliasedSymbol(symbol);
				}
				if (Symbols.isClass(symbol) || Symbols.isInterface(symbol)) {
					const declarations = symbol.declarations;
					if (declarations === undefined) {
						return;
					}
					for (const declaration of declarations) {
						let heritageClauses: tt.NodeArray<tt.HeritageClause> | undefined;
						if (ts.isClassDeclaration(declaration)) {
							heritageClauses = declaration.heritageClauses;
						} else if (ts.isInterfaceDeclaration(declaration)) {
							heritageClauses = declaration.heritageClauses;
						}
						if (heritageClauses === undefined) {
							continue;
						}
						// In TS classes must come first.
						for (const heritageClause of heritageClauses) {
							for (const type of heritageClause.types) {
								// We can't reach to the leave symbol here since in a hierarchy we need to
								// reference Type References by name.
								const superType = this.getAliasedSymbolAtLocation(type.expression);
								if (superType !== undefined && !seen.has(superType)) {
									seen.add(superType);
									yield includePath ? [symbol, superType] : superType;
									if (traversal === Traversal.depthFirst) {
										yield* this._getAllSuperTypes(superType, traversal, seen, includePath);
									} else if (traversal === Traversal.breadthFirst) {
										queue.push(superType);
									}
									// Here traversal === InternalTraversal.breadthFirstOnly; do nothing since iteration is already done.
								}
							}
						}
					}
				} else if (Symbols.isTypeAlias(symbol)) {
					const declarations = symbol.declarations;
					if (declarations === undefined) {
						return;
					}
					for (const declaration of declarations) {
						if (ts.isTypeAliasDeclaration(declaration)) {
							const type = declaration.type;
							if (ts.isTypeLiteralNode(type)) {
								const superType = this.getAliasedSymbolAtLocation(type);
								if (superType !== undefined && !seen.has(superType)) {
									seen.add(superType);
									yield includePath ? [symbol, superType] : superType;
								}
							} else if (ts.isTypeReferenceNode(type)) {
								const superType = this.getAliasedSymbolAtLocation(type.typeName);
								if (superType !== undefined && !seen.has(superType)) {
									// This is something like type _NameLength = NameLength
									// Yield NameLength since it could represent and interface.
									seen.add(superType);
									yield includePath ? [symbol, superType] : superType;
									if (traversal === Traversal.depthFirst) {
										yield* this._getAllSuperTypes(superType, traversal, seen, includePath);
									} else if (traversal === Traversal.breadthFirst) {
										queue.push(superType);
									} // Here traversal === InternalTraversal.breadthFirstOnly; do nothing since iteration is already done.
								}
							} else if (ts.isIntersectionTypeNode(type)) {
								for (const item of type.types) {
									const superType = this.getSymbolAtTypeNodeLocation(item);
									if (superType !== undefined && !seen.has(superType)) {
										if (Symbols.isTypeLiteral(superType)) {
											seen.add(superType);
											yield includePath ? [symbol, superType] : superType;
										} else if (Symbols.isTypeAlias(superType)) {
											seen.add(superType);
											if (traversal === Traversal.depthFirst) {
												yield* this._getAllSuperTypes(superType, traversal, seen, includePath);
											} else if (traversal === Traversal.breadthFirst) {
												queue.push(superType);
											} // Here traversal === InternalTraversal.breadthFirstOnly; do nothing since iteration is already done.
										} else {
											seen.add(superType);
											yield includePath ? [symbol, superType] : superType;
											if (traversal === Traversal.depthFirst) {
												yield* this._getAllSuperTypes(superType, traversal, seen, includePath);
											} else if (traversal === Traversal.breadthFirst) {
												queue.push(superType);
											} // Here traversal === InternalTraversal.breadthFirstOnly; do nothing since iteration is already done.
										}
									}
								}
							}
						}
					}
				}
			}
		}

		public getAllSuperClasses(symbol: tt.Symbol): IterableIterator<tt.Symbol> {
			return this._getAllSuperClasses(symbol, new Set());
		}

		private *_getAllSuperClasses(symbol: tt.Symbol, seen: Set<tt.Symbol>): IterableIterator<tt.Symbol> {
			if (!Symbols.isClass(symbol)) {
				return;
			}
			const queue: tt.Symbol[] = [symbol];
			while (queue.length > 0) {
				const symbol = queue.pop()!;
				const declarations = symbol.declarations;
				if (declarations === undefined) {
					continue;
				}
				for (const declaration of declarations) {
					if (!ts.isClassDeclaration(declaration)) {
						continue;
					}
					const heritageClauses = declaration.heritageClauses;
					if (heritageClauses === undefined) {
						continue;
					}
					for (const heritageClause of heritageClauses) {
						if (heritageClause.token !== ts.SyntaxKind.ExtendsKeyword || heritageClause.types.length < 1) {
							continue;
						}
						// TypeScript has exactly one extends clause.
						const type = heritageClause.types[0];
						const superClass = this.getAliasedSymbolAtLocation(type.expression);
						if (superClass !== undefined && !seen.has(superClass)) {
							seen.add(superClass);
							yield superClass;
							queue.push(superClass);
						}
					}
				}
			}
		}

		public isSubType(declaration: tt.ClassDeclaration | tt.InterfaceDeclaration, symbol: tt.Symbol): boolean {
			if (declaration.heritageClauses === undefined) {
				return false;
			}
			for (const heritageClause of declaration.heritageClauses) {
				for (const type of heritageClause.types) {
					const superType = this.getAliasedSymbolAtLocation(type.expression);
					if (superType !== undefined && superType === symbol) {
						return true;
					}
				}
			}
			return false;
		}

		public isSubClass(declaration: tt.ClassDeclaration, symbol: tt.Symbol): boolean {
			if (declaration.heritageClauses === undefined) {
				return false;
			}
			for (const heritageClause of declaration.heritageClauses) {
				if (heritageClause.token !== ts.SyntaxKind.ExtendsKeyword) {
					continue;
				}
				// TypeScript has exactly one extends clause.
				if (heritageClause.types.length < 1) {
					return false;
				}
				const superType = this.getAliasedSymbolAtLocation(heritageClause.types[0].expression);
				if (superType !== undefined && superType === symbol) {
					return true;
				}
			}
			return false;
		}

		public getDirectSubTypes(start: tt.Symbol, preferredSourceFiles: tt.SourceFile[] | undefined, stateProvider: StateProvider, token: tt.CancellationToken): IterableIterator<tt.Symbol> {
			const traversal = Symbols.isClass(start)
				? new ClassTraversal(start, InternalTraversal.breadthFirstOnly, this)
				: Symbols.isInterface(start) || Symbols.isTypeAlias(start) ? new TypeTraversal(start, InternalTraversal.breadthFirstOnly, this) : undefined;
			if (traversal === undefined) {
				return EmptyIterator;
			}
			return this._getAllSubTypes(traversal, preferredSourceFiles, stateProvider, new Set(), token);
		}

		public getAllSubTypes(start: tt.Symbol, traversal: Traversal = Traversal.depthFirst, preferredSourceFiles: tt.SourceFile[] | undefined, stateProvider: StateProvider, token: tt.CancellationToken): IterableIterator<tt.Symbol> {
			const nt = Symbols.isClass(start)
				? new ClassTraversal(start, traversal, this)
				: Symbols.isInterface(start) || Symbols.isTypeAlias(start) ? new TypeTraversal(start, traversal, this) : undefined;
			if (nt === undefined) {
				return EmptyIterator;
			}
			return this._getAllSubTypes(nt, preferredSourceFiles, stateProvider, new Set(), token);
		}

		private *_getAllSubTypes(traversal: SubTypeTraversal<TypeDeclarations.Type>, preferredSourceFiles: tt.SourceFile[] | undefined, stateProvider: StateProvider, seen: Set<tt.Symbol>, token: tt.CancellationToken): IterableIterator<tt.Symbol> {
			// In TypeScript classes can be used as interfaces as well (e.g. interface Foo extends Clazz)
			// However we ignore this pattern for now since it allows that if we have a class as a start symbol
			// that we can traverse the class hierarchy only.
			if (!traversal.isValid()) {
				return;
			}
			const queue: tt.Symbol[] = [traversal.start];
			while (queue.length > 0) {
				const current = queue.pop()!;
				const declarations = current.declarations;
				if (declarations === undefined || declarations.length === 0) {
					return;
				}
				for (const declaration of declarations) {
					if (!traversal.isValidDeclaration(declaration)) {
						continue;
					}
					const referencedBy = new ReferencedByVisitor(this.program, declaration.getSourceFile(), preferredSourceFiles, stateProvider, token);
					for (const sourceFile of referencedBy) {
						for (const typeDeclaration of traversal.getDeclarations(sourceFile)) {
							const symbol = this.getAliasedSymbolAtLocation(typeDeclaration.name ? typeDeclaration.name : typeDeclaration);
							if (symbol === undefined || seen.has(symbol)) {
								continue;
							}
							if (traversal.isSubType(typeDeclaration, current)) {
								seen.add(symbol);
								yield symbol;
								if (traversal.mode === Traversal.depthFirst) {
									yield* this._getAllSubTypes(traversal.with(symbol), preferredSourceFiles, stateProvider, seen, token);
								} else if (traversal.mode === Traversal.breadthFirst) {
									queue.push(symbol);
								} // Here traversal === InternalTraversal.breadthFirstOnly; do nothing since iteration is already done.
							}
						}
					}
				}
			}
		}

		public getMemberStatistic(symbol: tt.Symbol): { abstract: Set<string>; concrete: Set<string> } {
			const abstractMembers = new Set<string>();
			const concreteMembers = new Set<string>();
			Symbols._getMemberStatistic(abstractMembers, concreteMembers, symbol);
			for (const superType of this.getAllSuperTypes(symbol)) {
				Symbols._getMemberStatistic(abstractMembers, concreteMembers, superType);
			}
			return { abstract: abstractMembers, concrete: concreteMembers };
		}

		private static _getMemberStatistic(abstractMembers: Set<string>, concreteMembers: Set<string>, symbol: tt.Symbol): void {
			if (Symbols.isClass(symbol)) {
				const declarations = symbol.declarations;
				if (declarations === undefined) {
					return;
				}
				for (const declaration of declarations) {
					if (ts.isClassDeclaration(declaration)) {
						for (const member of declaration.members) {
							if ((ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member) || ts.isPropertyDeclaration(member))) {
								const name = member.name.getText();
								if (Symbols.includesAbstract(member.modifiers) && !concreteMembers.has(name)) {
									abstractMembers.add(name);
								} else {
									concreteMembers.add(name);
								}
							} else if (ts.isIndexSignatureDeclaration(member)) {
								if (Symbols.includesAbstract(member.modifiers) && !concreteMembers.has('[]')) {
									abstractMembers.add('[]');
								} else {
									concreteMembers.add('[]');
								}
							}
						}
					}
				}
			} else if (Symbols.isInterface(symbol) || Symbols.isTypeLiteral(symbol)) {
				if (symbol.members !== undefined) {
					for (const member of symbol.members.values()) {
						if (!concreteMembers.has(member.name)) {
							abstractMembers.add(member.name);
						}
					}
				}
			}
		}

		private static includesAbstract(modifiers: tt.NodeArray<tt.ModifierLike> | undefined): boolean {
			if (modifiers === undefined) {
				return false;
			}
			return modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
		}
	}

	interface InternalSession {
		projectService?: tt.server.ProjectService;
		getFileAndProject?(args: tt.server.protocol.FileRequestArgs): Sessions.FileAndProject;
		getPositionInFile?(args: tt.server.protocol.Location & { position?: number }, file: tt.server.NormalizedPath): number;
	}

	export namespace Sessions {

		export interface FileAndProject {
			readonly file: tt.server.NormalizedPath;
			readonly project: tt.server.Project;
		}

		export function getProjectService(session: tt.server.Session): tt.server.ProjectService | undefined {
			return (session as unknown as InternalSession).projectService;
		}

		export function getFileAndProject(session: tt.server.Session, args: tt.server.protocol.FileRequestArgs): FileAndProject | undefined {
			const internal: InternalSession = session as unknown as InternalSession;
			if (typeof internal.getFileAndProject !== 'function') {
				return undefined;
			}
			return internal.getFileAndProject(args);
		}

		export function getPositionInFile(session: tt.server.Session, args: tt.server.protocol.Location & { position?: number }, file: tt.server.NormalizedPath): number | undefined {
			const internal: InternalSession = session as unknown as InternalSession;
			if (typeof internal.getPositionInFile !== 'function') {
				return undefined;
			}
			return internal.getPositionInFile(args, file);
		}
	}

	interface InternalSourceFile extends tt.SourceFile {
		externalModuleIndicator?: tt.Node | true;
		imports?: readonly tt.StringLiteralLike[];
	}

	function isExternalModuleImportEquals(eq: tt.ImportEqualsDeclaration): eq is tt.ImportEqualsDeclaration & { moduleReference: { expression: tt.StringLiteral } } {
		return eq.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference && eq.moduleReference.expression.kind === ts.SyntaxKind.StringLiteral;
	}

	export interface StateProvider {
		getImportedByState(key: string): ImportedByState;
	}

	export class ImportedByState {
		public readonly key: string;

		private readonly traversed: Set<string>;
		private complete: boolean;
		private outdated: boolean;
		private importedBy: Map<string, Set<string>>;
		private outdatedImportedBy: Map<string, Set<string>> | undefined;

		constructor(key: string) {
			this.key = key;
			this.complete = false;
			this.outdated = false;
			this.traversed = new Set();
			this.importedBy = new Map();
			this.outdatedImportedBy = undefined;
		}

		public isComplete(): boolean {
			return this.complete;
		}

		public markComplete(): void {
			this.complete = true;
			this.outdated = false;
			this.outdatedImportedBy = undefined;
		}

		public addTraversed(sourceFile: tt.SourceFile): void {
			this.traversed.add(sourceFile.fileName);
		}

		public isTraversed(sourceFile: tt.SourceFile): boolean {
			return this.traversed.has(sourceFile.fileName);
		}

		public hasTraversed(): boolean {
			return this.traversed.size > 0;
		}

		public imports(source: tt.SourceFile, imports: tt.SourceFile): void {
			let values = this.importedBy.get(imports.fileName);
			if (values === undefined) {
				values = new Set();
				this.importedBy.set(imports.fileName, values);
			}
			values.add(source.fileName);
		}

		public getImportedBy(source: tt.SourceFile, considerOutdated: boolean): IterableIterator<string> {
			let importedBy = this.importedBy.get(source.fileName);
			if (importedBy === undefined && considerOutdated) {
				importedBy = this.outdatedImportedBy?.get(source.fileName);
			}
			return importedBy === undefined ? EmptyIterator : importedBy.values();
		}

		public markAsOutdated(): void {
			this.outdated = true;
			this.outdatedImportedBy = this.importedBy;
			this.importedBy = new Map();
		}

		public isOutdated(): boolean {
			return this.outdated;
		}
	}

	export class ReferencedByVisitor {

		public readonly program: tt.Program;
		public readonly sourceFile: tt.SourceFile;
		private readonly preferredSourceFiles: tt.SourceFile[] | undefined;
		private readonly token: tt.CancellationToken;

		private readonly importedByState: ImportedByState | undefined;

		constructor(program: tt.Program, sourceFile: tt.SourceFile, preferredSourceFiles: tt.SourceFile[] | undefined, stateProvider: StateProvider, token: tt.CancellationToken) {
			this.program = program;
			this.sourceFile = sourceFile;
			this.preferredSourceFiles = preferredSourceFiles;
			this.token = token;
			const programKey = tss.Programs.getKey(program);
			this.importedByState = programKey !== undefined ? stateProvider.getImportedByState(programKey) : undefined;
		}

		public getSourceFile(fileName: string): tt.SourceFile | undefined {
			return this.program.getSourceFile(fileName);
		}

		[Symbol.iterator](): IterableIterator<tt.SourceFile> {
			return this.entries();
		}

		public *entries(): IterableIterator<tt.SourceFile> {
			this.token.throwIfCancellationRequested();

			const program = this.program;

			// We have some imported by state. We first use it to see if we can find something in
			// the cache.
			if (this.importedByState !== undefined) {
				for (const fileName of this.importedByState.getImportedBy(this.sourceFile, true)) {
					this.token.throwIfCancellationRequested();
					const sourceFile = this.getSourceFile(fileName);
					if (sourceFile !== undefined && !this.skipSourceFile(program, sourceFile)) {
						yield sourceFile;
					}
				}
				// If the imported by state was complete we are done.
				if (this.importedByState.isComplete() && !this.importedByState.isOutdated()) {
					return;
				}
			}

			interface AmbientModuleDeclaration extends tt.ModuleDeclaration {
				body?: tt.ModuleBlock;
			}
			function isAmbientModuleDeclaration(node: tt.Node): node is AmbientModuleDeclaration {
				return node.kind === ts.SyntaxKind.ModuleDeclaration && (node as tt.ModuleDeclaration).name.kind === ts.SyntaxKind.StringLiteral;
			}

			function getUnderlyingSourceFileFromImport(checker: tt.TypeChecker, node: tt.StringLiteralLike): tt.SourceFile | undefined {
				const importedSymbol = checker.getSymbolAtLocation(node);
				if (importedSymbol === undefined || !Symbols.isSourceFile(importedSymbol)) {
					return undefined;
				}
				// We know the symbol is a source file which means the declaration at position 0
				// is the source file itself.
				return importedSymbol.declarations![0] as tt.SourceFile;
			}

			type SourceFileLike = tt.SourceFile | AmbientModuleDeclaration;


			const checker = program.getTypeChecker();
			const sourceFileSymbolToCheck = checker.getSymbolAtLocation(this.sourceFile);
			if (sourceFileSymbolToCheck === undefined) {
				return;
			}
			for (const sourceFile of this.allSourceFiles()) {
				this.token.throwIfCancellationRequested();
				if (this.sourceFile === sourceFile) {
					yield sourceFile;
					continue;
				}
				if (this.skipSourceFile(program, sourceFile)) {
					continue;
				}
				// We have a module system.
				// externalModuleIndicator is either true or the Node.
				if (sourceFile.externalModuleIndicator && sourceFile.imports !== undefined) {
					for (let i = 0; i < sourceFile.imports.length; i++) {
						this.token.throwIfCancellationRequested();
						const importedSymbol = checker.getSymbolAtLocation(sourceFile.imports[i]);
						if (importedSymbol === sourceFileSymbolToCheck) {
							if (this.importedByState !== undefined) {
								this.importedByState.imports(sourceFile, this.sourceFile);
								// If we capture the state for the imported by we need to visit
								// all imports. Otherwise the traversed state will be incomplete.
								for (let r = i + 1; r < sourceFile.imports.length; r++) {
									const importedSourceFile = getUnderlyingSourceFileFromImport(checker, sourceFile.imports[i]);
									if (importedSourceFile !== undefined && !this.skipSourceFile(program, importedSourceFile)) {
										this.importedByState?.imports(sourceFile, importedSourceFile);
									}
								}
							}
							yield sourceFile;
							break;
						} else if (importedSymbol !== undefined && Symbols.isSourceFile(importedSymbol)) {
							const importedSourceFile: tt.SourceFile = importedSymbol.declarations![0] as tt.SourceFile;
							if (!this.skipSourceFile(program, importedSourceFile)) {
								this.importedByState?.imports(sourceFile, importedSourceFile);
							}
						}
					}
				} else {
					const sf = sourceFile as SourceFileLike;
					const statements = sf.kind === ts.SyntaxKind.SourceFile ? sf.statements : sf.body!.statements;
					const imports = (statement: tt.Statement): boolean => {
						switch (statement.kind) {
							case ts.SyntaxKind.ExportDeclaration:
							case ts.SyntaxKind.ImportDeclaration: {
								const decl = statement as tt.ImportDeclaration | tt.ExportDeclaration;
								if (decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) {
									const importedSourceFileSymbol = checker.getSymbolAtLocation(decl.moduleSpecifier);
									if (importedSourceFileSymbol === sourceFileSymbolToCheck) {
										return true;
									}
								}
								break;
							}
							case ts.SyntaxKind.ImportEqualsDeclaration: {
								const decl = statement as tt.ImportEqualsDeclaration;
								if (isExternalModuleImportEquals(decl)) {
									const importedSourceFileSymbol = checker.getSymbolAtLocation(decl.moduleReference.expression);
									if (importedSourceFileSymbol === sourceFileSymbolToCheck) {
										return true;
									}
								}
								break;
							}
						}
						return false;
					};
					loop: for (const statement of statements) {
						this.token.throwIfCancellationRequested();
						if (imports(statement)) {
							this.importedByState?.imports(sourceFile, this.sourceFile);
							yield sourceFile;
							break loop;
						} else if (isAmbientModuleDeclaration(statement)) {
							const moduleStatements = statement.body && statement.body.statements;
							if (moduleStatements !== undefined) {
								for (const moduleStatement of moduleStatements) {
									if (imports(moduleStatement)) {
										this.importedByState?.imports(sourceFile, this.sourceFile);
										yield sourceFile;
										break loop;
									}
								}
							}
						}
					}
				}
			}
		}

		private skipSourceFile(program: tt.Program, sourceFile: tt.SourceFile): boolean {
			return program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile) || sourceFile.isDeclarationFile;
		}

		private *allSourceFiles(): IterableIterator<InternalSourceFile> {
			if (this.importedByState === undefined) {
				if (this.preferredSourceFiles !== undefined) {
					yield* (this.preferredSourceFiles as InternalSourceFile[]);
				}
				yield* (this.program.getSourceFiles() as InternalSourceFile[]);
			} else {
				if (this.preferredSourceFiles !== undefined) {
					for (const sourceFile of this.preferredSourceFiles) {
						if (!this.importedByState.isTraversed(sourceFile)) {
							this.importedByState.addTraversed(sourceFile);
							yield sourceFile;
						}
					}
					for (const sourceFile of this.program.getSourceFiles()) {
						if (!this.importedByState.isTraversed(sourceFile)) {
							this.importedByState.addTraversed(sourceFile);
							yield sourceFile;
						}
					}
				}
				this.importedByState.markComplete();
			}
		}
	}

	export namespace StableSyntaxKinds {
		const KindMap: Map<tt.SyntaxKind, number> = new Map([
			[ts.SyntaxKind.Unknown, 0],
			[ts.SyntaxKind.EndOfFileToken, 1],
			[ts.SyntaxKind.SingleLineCommentTrivia, 2],
			[ts.SyntaxKind.MultiLineCommentTrivia, 3],
			[ts.SyntaxKind.NewLineTrivia, 4],
			[ts.SyntaxKind.WhitespaceTrivia, 5],
			[ts.SyntaxKind.ShebangTrivia, 6],
			[ts.SyntaxKind.ConflictMarkerTrivia, 7],
			[ts.SyntaxKind.NonTextFileMarkerTrivia, 8],
			[ts.SyntaxKind.NumericLiteral, 9],
			[ts.SyntaxKind.BigIntLiteral, 10],
			[ts.SyntaxKind.StringLiteral, 11],
			[ts.SyntaxKind.JsxText, 12],
			[ts.SyntaxKind.JsxTextAllWhiteSpaces, 13],
			[ts.SyntaxKind.RegularExpressionLiteral, 14],
			[ts.SyntaxKind.NoSubstitutionTemplateLiteral, 15],
			[ts.SyntaxKind.TemplateHead, 16],
			[ts.SyntaxKind.TemplateMiddle, 17],
			[ts.SyntaxKind.TemplateTail, 18],
			[ts.SyntaxKind.OpenBraceToken, 19],
			[ts.SyntaxKind.CloseBraceToken, 20],
			[ts.SyntaxKind.OpenParenToken, 21],
			[ts.SyntaxKind.CloseParenToken, 22],
			[ts.SyntaxKind.OpenBracketToken, 23],
			[ts.SyntaxKind.CloseBracketToken, 24],
			[ts.SyntaxKind.DotToken, 25],
			[ts.SyntaxKind.DotDotDotToken, 26],
			[ts.SyntaxKind.SemicolonToken, 27],
			[ts.SyntaxKind.CommaToken, 28],
			[ts.SyntaxKind.QuestionDotToken, 29],
			[ts.SyntaxKind.LessThanToken, 30],
			[ts.SyntaxKind.LessThanSlashToken, 31],
			[ts.SyntaxKind.GreaterThanToken, 32],
			[ts.SyntaxKind.LessThanEqualsToken, 33],
			[ts.SyntaxKind.GreaterThanEqualsToken, 34],
			[ts.SyntaxKind.EqualsEqualsToken, 35],
			[ts.SyntaxKind.ExclamationEqualsToken, 36],
			[ts.SyntaxKind.EqualsEqualsEqualsToken, 37],
			[ts.SyntaxKind.ExclamationEqualsEqualsToken, 38],
			[ts.SyntaxKind.EqualsGreaterThanToken, 39],
			[ts.SyntaxKind.PlusToken, 40],
			[ts.SyntaxKind.MinusToken, 41],
			[ts.SyntaxKind.AsteriskToken, 42],
			[ts.SyntaxKind.AsteriskAsteriskToken, 43],
			[ts.SyntaxKind.SlashToken, 44],
			[ts.SyntaxKind.PercentToken, 45],
			[ts.SyntaxKind.PlusPlusToken, 46],
			[ts.SyntaxKind.MinusMinusToken, 47],
			[ts.SyntaxKind.LessThanLessThanToken, 48],
			[ts.SyntaxKind.GreaterThanGreaterThanToken, 49],
			[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, 50],
			[ts.SyntaxKind.AmpersandToken, 51],
			[ts.SyntaxKind.BarToken, 52],
			[ts.SyntaxKind.CaretToken, 53],
			[ts.SyntaxKind.ExclamationToken, 54],
			[ts.SyntaxKind.TildeToken, 55],
			[ts.SyntaxKind.AmpersandAmpersandToken, 56],
			[ts.SyntaxKind.BarBarToken, 57],
			[ts.SyntaxKind.QuestionToken, 58],
			[ts.SyntaxKind.ColonToken, 59],
			[ts.SyntaxKind.AtToken, 60],
			[ts.SyntaxKind.QuestionQuestionToken, 61],
			[ts.SyntaxKind.BacktickToken, 62],
			[ts.SyntaxKind.HashToken, 63],
			[ts.SyntaxKind.EqualsToken, 64],
			[ts.SyntaxKind.PlusEqualsToken, 65],
			[ts.SyntaxKind.MinusEqualsToken, 66],
			[ts.SyntaxKind.AsteriskEqualsToken, 67],
			[ts.SyntaxKind.AsteriskAsteriskEqualsToken, 68],
			[ts.SyntaxKind.SlashEqualsToken, 69],
			[ts.SyntaxKind.PercentEqualsToken, 70],
			[ts.SyntaxKind.LessThanLessThanEqualsToken, 71],
			[ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, 72],
			[ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, 73],
			[ts.SyntaxKind.AmpersandEqualsToken, 74],
			[ts.SyntaxKind.BarEqualsToken, 75],
			[ts.SyntaxKind.BarBarEqualsToken, 76],
			[ts.SyntaxKind.AmpersandAmpersandEqualsToken, 77],
			[ts.SyntaxKind.QuestionQuestionEqualsToken, 78],
			[ts.SyntaxKind.CaretEqualsToken, 79],
			[ts.SyntaxKind.Identifier, 80],
			[ts.SyntaxKind.PrivateIdentifier, 81],
			[ts.SyntaxKind.BreakKeyword, 83],
			[ts.SyntaxKind.CaseKeyword, 84],
			[ts.SyntaxKind.CatchKeyword, 85],
			[ts.SyntaxKind.ClassKeyword, 86],
			[ts.SyntaxKind.ConstKeyword, 87],
			[ts.SyntaxKind.ContinueKeyword, 88],
			[ts.SyntaxKind.DebuggerKeyword, 89],
			[ts.SyntaxKind.DefaultKeyword, 90],
			[ts.SyntaxKind.DeleteKeyword, 91],
			[ts.SyntaxKind.DoKeyword, 92],
			[ts.SyntaxKind.ElseKeyword, 93],
			[ts.SyntaxKind.EnumKeyword, 94],
			[ts.SyntaxKind.ExportKeyword, 95],
			[ts.SyntaxKind.ExtendsKeyword, 96],
			[ts.SyntaxKind.FalseKeyword, 97],
			[ts.SyntaxKind.FinallyKeyword, 98],
			[ts.SyntaxKind.ForKeyword, 99],
			[ts.SyntaxKind.FunctionKeyword, 100],
			[ts.SyntaxKind.IfKeyword, 101],
			[ts.SyntaxKind.ImportKeyword, 102],
			[ts.SyntaxKind.InKeyword, 103],
			[ts.SyntaxKind.InstanceOfKeyword, 104],
			[ts.SyntaxKind.NewKeyword, 105],
			[ts.SyntaxKind.NullKeyword, 106],
			[ts.SyntaxKind.ReturnKeyword, 107],
			[ts.SyntaxKind.SuperKeyword, 108],
			[ts.SyntaxKind.SwitchKeyword, 109],
			[ts.SyntaxKind.ThisKeyword, 110],
			[ts.SyntaxKind.ThrowKeyword, 111],
			[ts.SyntaxKind.TrueKeyword, 112],
			[ts.SyntaxKind.TryKeyword, 113],
			[ts.SyntaxKind.TypeOfKeyword, 114],
			[ts.SyntaxKind.VarKeyword, 115],
			[ts.SyntaxKind.VoidKeyword, 116],
			[ts.SyntaxKind.WhileKeyword, 117],
			[ts.SyntaxKind.WithKeyword, 118],
			[ts.SyntaxKind.ImplementsKeyword, 119],
			[ts.SyntaxKind.InterfaceKeyword, 120],
			[ts.SyntaxKind.LetKeyword, 121],
			[ts.SyntaxKind.PackageKeyword, 122],
			[ts.SyntaxKind.PrivateKeyword, 123],
			[ts.SyntaxKind.ProtectedKeyword, 124],
			[ts.SyntaxKind.PublicKeyword, 125],
			[ts.SyntaxKind.StaticKeyword, 126],
			[ts.SyntaxKind.YieldKeyword, 127],
			[ts.SyntaxKind.AbstractKeyword, 128],
			[ts.SyntaxKind.AccessorKeyword, 129],
			[ts.SyntaxKind.AsKeyword, 130],
			[ts.SyntaxKind.AssertsKeyword, 131],
			[ts.SyntaxKind.AssertKeyword, 132],
			[ts.SyntaxKind.AnyKeyword, 133],
			[ts.SyntaxKind.AsyncKeyword, 134],
			[ts.SyntaxKind.AwaitKeyword, 135],
			[ts.SyntaxKind.BooleanKeyword, 136],
			[ts.SyntaxKind.ConstructorKeyword, 137],
			[ts.SyntaxKind.DeclareKeyword, 138],
			[ts.SyntaxKind.GetKeyword, 139],
			[ts.SyntaxKind.InferKeyword, 140],
			[ts.SyntaxKind.IntrinsicKeyword, 141],
			[ts.SyntaxKind.IsKeyword, 142],
			[ts.SyntaxKind.KeyOfKeyword, 143],
			[ts.SyntaxKind.ModuleKeyword, 144],
			[ts.SyntaxKind.NamespaceKeyword, 145],
			[ts.SyntaxKind.NeverKeyword, 146],
			[ts.SyntaxKind.OutKeyword, 147],
			[ts.SyntaxKind.ReadonlyKeyword, 148],
			[ts.SyntaxKind.RequireKeyword, 149],
			[ts.SyntaxKind.NumberKeyword, 150],
			[ts.SyntaxKind.ObjectKeyword, 151],
			[ts.SyntaxKind.SatisfiesKeyword, 152],
			[ts.SyntaxKind.SetKeyword, 153],
			[ts.SyntaxKind.StringKeyword, 154],
			[ts.SyntaxKind.SymbolKeyword, 155],
			[ts.SyntaxKind.TypeKeyword, 156],
			[ts.SyntaxKind.UndefinedKeyword, 157],
			[ts.SyntaxKind.UniqueKeyword, 158],
			[ts.SyntaxKind.UnknownKeyword, 159],
			[ts.SyntaxKind.UsingKeyword, 160],
			[ts.SyntaxKind.FromKeyword, 161],
			[ts.SyntaxKind.GlobalKeyword, 162],
			[ts.SyntaxKind.BigIntKeyword, 163],
			[ts.SyntaxKind.OverrideKeyword, 164],
			[ts.SyntaxKind.OfKeyword, 165],
			[ts.SyntaxKind.QualifiedName, 166],
			[ts.SyntaxKind.ComputedPropertyName, 167],
			[ts.SyntaxKind.TypeParameter, 168],
			[ts.SyntaxKind.Parameter, 169],
			[ts.SyntaxKind.Decorator, 170],
			[ts.SyntaxKind.PropertySignature, 171],
			[ts.SyntaxKind.PropertyDeclaration, 172],
			[ts.SyntaxKind.MethodSignature, 173],
			[ts.SyntaxKind.MethodDeclaration, 174],
			[ts.SyntaxKind.ClassStaticBlockDeclaration, 175],
			[ts.SyntaxKind.Constructor, 176],
			[ts.SyntaxKind.GetAccessor, 177],
			[ts.SyntaxKind.SetAccessor, 178],
			[ts.SyntaxKind.CallSignature, 179],
			[ts.SyntaxKind.ConstructSignature, 180],
			[ts.SyntaxKind.IndexSignature, 181],
			[ts.SyntaxKind.TypePredicate, 182],
			[ts.SyntaxKind.TypeReference, 183],
			[ts.SyntaxKind.FunctionType, 184],
			[ts.SyntaxKind.ConstructorType, 185],
			[ts.SyntaxKind.TypeQuery, 186],
			[ts.SyntaxKind.TypeLiteral, 187],
			[ts.SyntaxKind.ArrayType, 188],
			[ts.SyntaxKind.TupleType, 189],
			[ts.SyntaxKind.OptionalType, 190],
			[ts.SyntaxKind.RestType, 191],
			[ts.SyntaxKind.UnionType, 192],
			[ts.SyntaxKind.IntersectionType, 193],
			[ts.SyntaxKind.ConditionalType, 194],
			[ts.SyntaxKind.InferType, 195],
			[ts.SyntaxKind.ParenthesizedType, 196],
			[ts.SyntaxKind.ThisType, 197],
			[ts.SyntaxKind.TypeOperator, 198],
			[ts.SyntaxKind.IndexedAccessType, 199],
			[ts.SyntaxKind.MappedType, 200],
			[ts.SyntaxKind.LiteralType, 201],
			[ts.SyntaxKind.NamedTupleMember, 202],
			[ts.SyntaxKind.TemplateLiteralType, 203],
			[ts.SyntaxKind.TemplateLiteralTypeSpan, 204],
			[ts.SyntaxKind.ImportType, 205],
			[ts.SyntaxKind.ObjectBindingPattern, 206],
			[ts.SyntaxKind.ArrayBindingPattern, 207],
			[ts.SyntaxKind.BindingElement, 208],
			[ts.SyntaxKind.ArrayLiteralExpression, 209],
			[ts.SyntaxKind.ObjectLiteralExpression, 210],
			[ts.SyntaxKind.PropertyAccessExpression, 211],
			[ts.SyntaxKind.ElementAccessExpression, 212],
			[ts.SyntaxKind.CallExpression, 213],
			[ts.SyntaxKind.NewExpression, 214],
			[ts.SyntaxKind.TaggedTemplateExpression, 215],
			[ts.SyntaxKind.TypeAssertionExpression, 216],
			[ts.SyntaxKind.ParenthesizedExpression, 217],
			[ts.SyntaxKind.FunctionExpression, 218],
			[ts.SyntaxKind.ArrowFunction, 219],
			[ts.SyntaxKind.DeleteExpression, 220],
			[ts.SyntaxKind.TypeOfExpression, 221],
			[ts.SyntaxKind.VoidExpression, 222],
			[ts.SyntaxKind.AwaitExpression, 223],
			[ts.SyntaxKind.PrefixUnaryExpression, 224],
			[ts.SyntaxKind.PostfixUnaryExpression, 225],
			[ts.SyntaxKind.BinaryExpression, 226],
			[ts.SyntaxKind.ConditionalExpression, 227],
			[ts.SyntaxKind.TemplateExpression, 228],
			[ts.SyntaxKind.YieldExpression, 229],
			[ts.SyntaxKind.SpreadElement, 230],
			[ts.SyntaxKind.ClassExpression, 231],
			[ts.SyntaxKind.OmittedExpression, 232],
			[ts.SyntaxKind.ExpressionWithTypeArguments, 233],
			[ts.SyntaxKind.AsExpression, 234],
			[ts.SyntaxKind.NonNullExpression, 235],
			[ts.SyntaxKind.MetaProperty, 236],
			[ts.SyntaxKind.SyntheticExpression, 237],
			[ts.SyntaxKind.SatisfiesExpression, 238],
			[ts.SyntaxKind.TemplateSpan, 239],
			[ts.SyntaxKind.SemicolonClassElement, 240],
			[ts.SyntaxKind.Block, 241],
			[ts.SyntaxKind.EmptyStatement, 242],
			[ts.SyntaxKind.VariableStatement, 243],
			[ts.SyntaxKind.ExpressionStatement, 244],
			[ts.SyntaxKind.IfStatement, 245],
			[ts.SyntaxKind.DoStatement, 246],
			[ts.SyntaxKind.WhileStatement, 247],
			[ts.SyntaxKind.ForStatement, 248],
			[ts.SyntaxKind.ForInStatement, 249],
			[ts.SyntaxKind.ForOfStatement, 250],
			[ts.SyntaxKind.ContinueStatement, 251],
			[ts.SyntaxKind.BreakStatement, 252],
			[ts.SyntaxKind.ReturnStatement, 253],
			[ts.SyntaxKind.WithStatement, 254],
			[ts.SyntaxKind.SwitchStatement, 255],
			[ts.SyntaxKind.LabeledStatement, 256],
			[ts.SyntaxKind.ThrowStatement, 257],
			[ts.SyntaxKind.TryStatement, 258],
			[ts.SyntaxKind.DebuggerStatement, 259],
			[ts.SyntaxKind.VariableDeclaration, 260],
			[ts.SyntaxKind.VariableDeclarationList, 261],
			[ts.SyntaxKind.FunctionDeclaration, 262],
			[ts.SyntaxKind.ClassDeclaration, 263],
			[ts.SyntaxKind.InterfaceDeclaration, 264],
			[ts.SyntaxKind.TypeAliasDeclaration, 265],
			[ts.SyntaxKind.EnumDeclaration, 266],
			[ts.SyntaxKind.ModuleDeclaration, 267],
			[ts.SyntaxKind.ModuleBlock, 268],
			[ts.SyntaxKind.CaseBlock, 269],
			[ts.SyntaxKind.NamespaceExportDeclaration, 270],
			[ts.SyntaxKind.ImportEqualsDeclaration, 271],
			[ts.SyntaxKind.ImportDeclaration, 272],
			[ts.SyntaxKind.ImportClause, 273],
			[ts.SyntaxKind.NamespaceImport, 274],
			[ts.SyntaxKind.NamedImports, 275],
			[ts.SyntaxKind.ImportSpecifier, 276],
			[ts.SyntaxKind.ExportAssignment, 277],
			[ts.SyntaxKind.ExportDeclaration, 278],
			[ts.SyntaxKind.NamedExports, 279],
			[ts.SyntaxKind.NamespaceExport, 280],
			[ts.SyntaxKind.ExportSpecifier, 281],
			[ts.SyntaxKind.MissingDeclaration, 282],
			[ts.SyntaxKind.ExternalModuleReference, 283],
			[ts.SyntaxKind.JsxElement, 284],
			[ts.SyntaxKind.JsxSelfClosingElement, 285],
			[ts.SyntaxKind.JsxOpeningElement, 286],
			[ts.SyntaxKind.JsxClosingElement, 287],
			[ts.SyntaxKind.JsxFragment, 288],
			[ts.SyntaxKind.JsxOpeningFragment, 289],
			[ts.SyntaxKind.JsxClosingFragment, 290],
			[ts.SyntaxKind.JsxAttribute, 291],
			[ts.SyntaxKind.JsxAttributes, 292],
			[ts.SyntaxKind.JsxSpreadAttribute, 293],
			[ts.SyntaxKind.JsxExpression, 294],
			[ts.SyntaxKind.JsxNamespacedName, 295],
			[ts.SyntaxKind.CaseClause, 296],
			[ts.SyntaxKind.DefaultClause, 297],
			[ts.SyntaxKind.HeritageClause, 298],
			[ts.SyntaxKind.CatchClause, 299],
			[ts.SyntaxKind.ImportAttributes, 300],
			[ts.SyntaxKind.ImportAttribute, 301],
			[ts.SyntaxKind.PropertyAssignment, 303],
			[ts.SyntaxKind.ShorthandPropertyAssignment, 304],
			[ts.SyntaxKind.SpreadAssignment, 305],
			[ts.SyntaxKind.EnumMember, 306],
			[ts.SyntaxKind.SourceFile, 307],
			[ts.SyntaxKind.Bundle, 308],
			[ts.SyntaxKind.JSDocTypeExpression, 309],
			[ts.SyntaxKind.JSDocNameReference, 310],
			[ts.SyntaxKind.JSDocMemberName, 311],
			[ts.SyntaxKind.JSDocAllType, 312],
			[ts.SyntaxKind.JSDocUnknownType, 313],
			[ts.SyntaxKind.JSDocNullableType, 314],
			[ts.SyntaxKind.JSDocNonNullableType, 315],
			[ts.SyntaxKind.JSDocOptionalType, 316],
			[ts.SyntaxKind.JSDocFunctionType, 317],
			[ts.SyntaxKind.JSDocVariadicType, 318],
			[ts.SyntaxKind.JSDocNamepathType, 319],
			[ts.SyntaxKind.JSDoc, 320],
			[ts.SyntaxKind.JSDocText, 321],
			[ts.SyntaxKind.JSDocTypeLiteral, 322],
			[ts.SyntaxKind.JSDocSignature, 323],
			[ts.SyntaxKind.JSDocLink, 324],
			[ts.SyntaxKind.JSDocLinkCode, 325],
			[ts.SyntaxKind.JSDocLinkPlain, 326],
			[ts.SyntaxKind.JSDocTag, 327],
			[ts.SyntaxKind.JSDocAugmentsTag, 328],
			[ts.SyntaxKind.JSDocImplementsTag, 329],
			[ts.SyntaxKind.JSDocAuthorTag, 330],
			[ts.SyntaxKind.JSDocDeprecatedTag, 331],
			[ts.SyntaxKind.JSDocClassTag, 332],
			[ts.SyntaxKind.JSDocPublicTag, 333],
			[ts.SyntaxKind.JSDocPrivateTag, 334],
			[ts.SyntaxKind.JSDocProtectedTag, 335],
			[ts.SyntaxKind.JSDocReadonlyTag, 336],
			[ts.SyntaxKind.JSDocOverrideTag, 337],
			[ts.SyntaxKind.JSDocCallbackTag, 338],
			[ts.SyntaxKind.JSDocOverloadTag, 339],
			[ts.SyntaxKind.JSDocEnumTag, 340],
			[ts.SyntaxKind.JSDocParameterTag, 341],
			[ts.SyntaxKind.JSDocReturnTag, 342],
			[ts.SyntaxKind.JSDocThisTag, 343],
			[ts.SyntaxKind.JSDocTypeTag, 344],
			[ts.SyntaxKind.JSDocTemplateTag, 345],
			[ts.SyntaxKind.JSDocTypedefTag, 346],
			[ts.SyntaxKind.JSDocSeeTag, 347],
			[ts.SyntaxKind.JSDocPropertyTag, 348],
			[ts.SyntaxKind.JSDocThrowsTag, 349],
			[ts.SyntaxKind.JSDocSatisfiesTag, 350],
			[ts.SyntaxKind.JSDocImportTag, 351],
			[ts.SyntaxKind.SyntaxList, 352],
			[ts.SyntaxKind.NotEmittedStatement, 353],
			[ts.SyntaxKind.PartiallyEmittedExpression, 354],
			[ts.SyntaxKind.CommaListExpression, 355],
			[ts.SyntaxKind.SyntheticReferenceExpression, 356],
			[ts.SyntaxKind.NotEmittedTypeElement, 357], // New in 5.8.x. Position in 5.8 is 354 and the rest shifts.
		]);
		const UnknownStableSyntaxKind: number = 9999;
		export function getPath(node: tt.Node): number[] {
			const path: number[] = [];
			while (node !== undefined) {
				path.push(KindMap.get(node.kind) ?? UnknownStableSyntaxKind);
				node = node.parent;
			}
			return path;
		}
	}
}
export = tss;