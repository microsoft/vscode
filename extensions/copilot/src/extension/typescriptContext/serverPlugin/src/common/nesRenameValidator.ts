/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { PrepareNesRenameResponse, RenameKind } from './protocol';
import { Symbols } from './typescripts';

export class PrepareNesRenameResult {

	private canRename: RenameKind | undefined;
	private oldName: string | undefined;
	private reason: string | undefined;
	private timedOut: boolean;
	private onOldState: boolean;

	constructor() {
		this.canRename = undefined;
		this.oldName = undefined;
		this.reason = undefined;
		this.timedOut = false;
		this.onOldState = false;
	}

	public getCanRename(): RenameKind | undefined {
		return this.canRename;
	}

	public setCanRename(value: RenameKind.no, reason?: string): PrepareNesRenameResult;
	public setCanRename(value: RenameKind.yes | RenameKind.maybe, oldName: string, onOldState?: boolean): PrepareNesRenameResult;
	public setCanRename(value: RenameKind, str?: string, onOldState?: boolean): PrepareNesRenameResult {
		this.canRename = value;
		if (value !== RenameKind.no) {
			this.oldName = str;
			if (onOldState !== undefined) {
				this.onOldState = onOldState;
			}
		} else {
			this.reason = str;
		}
		return this;
	}

	public setOnOldState(value: boolean): PrepareNesRenameResult {
		if (this.canRename === RenameKind.no) {
			throw new Error('Cannot set onOldState when canRename is no');
		}
		this.onOldState = value;
		return this;
	}

	public setTimedOut(value: boolean): PrepareNesRenameResult {
		this.timedOut = value;
		return this;
	}

	public toJsonResponse(): PrepareNesRenameResponse.OK {
		if (this.timedOut) {
			return {
				canRename: RenameKind.no,
				reason: this.reason,
				timedOut: this.timedOut
			};
		} else {
			if (this.canRename === RenameKind.yes || this.canRename === RenameKind.maybe) {
				return {
					canRename: this.canRename,
					oldName: this.oldName!,
					onOldState: this.onOldState,
				};
			} else {
				return {
					canRename: RenameKind.no,
					timedOut: false,
					reason: this.reason,
				};
			}
		}
	}
}

class DeclarationChecker {

	private readonly result: PrepareNesRenameResult;
	private readonly symbol: tt.Symbol;

	constructor(result: PrepareNesRenameResult, symbol: tt.Symbol) {
		this.result = result;
		this.symbol = symbol;
	}

	public checkDeclarations(): void {
		const declarations: tt.Declaration[] | undefined = this.symbol.getDeclarations();
		if (declarations === undefined || declarations.length <= 1) {
			return;
		}
		let withBody = 0;
		const signatures: Set<string> = new Set<string>();
		for (const declaration of declarations) {
			if (ts.isMethodDeclaration(declaration) || ts.isFunctionDeclaration(declaration)) {
				if (declaration.body !== undefined) {
					withBody++;
					if (withBody === 2) {
						this.result.setCanRename(RenameKind.no, 'The symbol has multiple declarations with body');
						return;
					}
					continue;
				}
			}
			const text = declaration.getText();
			if (signatures.has(text)) {
				this.result.setCanRename(RenameKind.no, 'The symbol has multiple identical declarations');
				return;
			} else {
				signatures.add(text);
			}
		}
	}
}

export function validateNesRename(result: PrepareNesRenameResult, program: tt.Program, node: tt.Node, oldName: string, newName: string, token: tt.CancellationToken): void {
	const symbols = new Symbols(program);
	const symbol = symbols.getLeafSymbolAtLocation(node);
	if (symbol === undefined) {
		result.setCanRename(RenameKind.no, 'No symbol found at location');
		return;
	}
	const parent = Symbols.getParent(symbol);
	const declarations: tt.Declaration[] | undefined = symbol.getDeclarations();
	if (declarations !== undefined) {
		if (declarations.length === 1 && (Symbols.isBlockScopedVariable(symbol) || Symbols.isFunctionScopedVariable(symbol))) {
			// if we have a block scoped or function scoped variable then it might still be redeclared in the same scope. We need
			// to catch this since renaming it could cause issues.
			const typeChecker = symbols.getTypeChecker();
			const inScope = typeChecker.getSymbolsInScope(declarations[0], ts.SymbolFlags.BlockScopedVariable | ts.SymbolFlags.FunctionScopedVariable);
			for (const inScopeSymbol of inScope) {
				if (inScopeSymbol === symbol) {
					continue;
				}
				if (inScopeSymbol.getName() === symbol.getName()) {
					result.setCanRename(RenameKind.no, `A variable with the name '${oldName}' already exists in the same scope`);
					return;
				}
			}
		} else if (declarations.length > 1) {
			// If the symbol has more than one declaration we need to be careful to rename it. The second declaration
			// could simply be a copy paste of the previous one and renaming it could cause some bad side effects.
			if (Symbols.isFunction(symbol)) {
				const checker = new DeclarationChecker(result, symbol);
				checker.checkDeclarations();
				if (result.getCanRename() === RenameKind.no) {
					return;
				}
			} else if (!Symbols.isMethod(symbol) || parent === undefined) {
				result.setCanRename(RenameKind.no, 'The symbol has multiple declarations');
				return;
			} else {
				// We do have a method with multiple declarations.
				if (Symbols.isInterface(parent) || Symbols.isTypeLiteral(parent) || Symbols.isClass(parent)) {
					const checker = new DeclarationChecker(result, symbol);
					checker.checkDeclarations();
					if (result.getCanRename() === RenameKind.no) {
						return;
					}
				}
			}
		}
	}


	const escapedNewName = ts.escapeLeadingUnderscores(newName);
	// First see if the symbol has a parent. If so the new name must not conflict with existing members.
	if (parent !== undefined) {
		const members = parent.members;
		if (members !== undefined && members.has(escapedNewName)) {
			result.setCanRename(RenameKind.no, `A member with the name '${newName}' already exists on '${parent.getName()}'`);
			return;
		}
		const exports = parent.exports;
		if (exports !== undefined && exports.has(escapedNewName)) {
			result.setCanRename(RenameKind.no, `An export with the name '${newName}' already exists on module '${parent.getName()}'`);
			return;
		}
		if (Symbols.isClass(parent) || Symbols.isInterface(parent)) {
			// check all super types.
			for (const superType of symbols.getAllSuperTypes(parent)) {
				const members = superType.members;
				if (members !== undefined && members.has(escapedNewName)) {
					result.setCanRename(RenameKind.no, `A member with the name '${newName}' already exists on base type '${superType.getName()}'`);
					return;
				}
				token.throwIfCancellationRequested();
			}
			result.setCanRename(RenameKind.yes, oldName);
			return;
		} else if (Symbols.isEnum(parent) || Symbols.isConstEnum(parent)) {
			result.setCanRename(RenameKind.yes, oldName);
			return;
		}
	}
	token.throwIfCancellationRequested();
	if (declarations !== undefined && declarations.length > 0) {
		if (hasSameSymbolOnDeclarationSide(symbols, symbol, declarations, newName)) {
			result.setCanRename(RenameKind.no, `A symbol with the name '${newName}' already exists in the scope`);
			return;
		} else {
			result.setCanRename(RenameKind.yes, oldName);
			return;
		}
	} else {
		result.setCanRename(RenameKind.no, 'The symbol has no declarations');
		return;
	}
}

function hasSameSymbolOnDeclarationSide(symbols: Symbols, _symbol: tt.Symbol, declarations: tt.Declaration[], newName: string): boolean {
	const typeChecker = symbols.getTypeChecker();
	let inModule: boolean | undefined = undefined;
	for (const declaration of declarations) {
		const inScope = typeChecker.resolveName(newName, declaration, ts.SymbolFlags.All, /*excludeGlobals*/ false);
		if (inScope !== undefined) {
			inModule = inModule ?? isInModule(symbols, declarations);
			if (!inModule) {
				return true;
			} else {
				const block = getParentBlock(declaration);
				if (block === undefined) {
					return true;
				} else {
					if (isInSameBlockScopeDeclared(inScope, block)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

function isInModule(symbols: Symbols, declarations: tt.Declaration[]): boolean {
	for (const declaration of declarations) {
		const sourceFile = declaration.getSourceFile();
		const moduleSymbol = symbols.getSymbolAtLocation(sourceFile);
		if (moduleSymbol === undefined) {
			return false;
		}
	}
	return true;
}

function isInSameBlockScopeDeclared(symbol: tt.Symbol, block: tt.Block | tt.ModuleBlock | tt.SourceFile): boolean {
	const declarations: tt.Declaration[] | undefined = symbol.getDeclarations();
	if (declarations === undefined) {
		return false;
	}
	for (const declaration of declarations) {
		const parentBlock = getParentBlock(declaration);
		if (parentBlock === block) {
			return true;
		}
	}
	return false;
}

function getParentBlock(node: tt.Node): tt.Block | tt.ModuleBlock | tt.SourceFile | undefined {
	let current: tt.Node | undefined = node;
	while (current !== undefined) {
		if (current.kind === ts.SyntaxKind.Block ||
			current.kind === ts.SyntaxKind.ModuleBlock ||
			current.kind === ts.SyntaxKind.SourceFile) {
			return current as tt.Block | tt.ModuleBlock | tt.SourceFile;
		}
		current = current.parent;
	}
	return undefined;
}