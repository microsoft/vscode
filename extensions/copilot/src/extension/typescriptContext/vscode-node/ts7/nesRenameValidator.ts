/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SymbolFlags, type Project, type Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import { escapeLeadingUnderscores, isBlock, isFunctionDeclaration, isMethodDeclaration, isModuleBlock, isSourceFile, type Node } from '@typescript/native/unstable/ast';
import * as protocol from '../../common/serverProtocol';
import { CancellationTokenWithTimer, Symbols } from './typescripts';

const renameSymbolFlags = SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace | SymbolFlags.Alias;

export class PrepareNesRenameResult {
	private canRename: protocol.RenameKind | undefined;
	private oldName: string | undefined;
	private reason: string | undefined;
	private timedOut: boolean = false;
	private onOldState: boolean = false;

	public getCanRename(): protocol.RenameKind | undefined {
		return this.canRename;
	}

	public setCanRename(value: protocol.RenameKind.no, reason?: string): PrepareNesRenameResult;
	public setCanRename(value: protocol.RenameKind.yes | protocol.RenameKind.maybe, oldName: string, onOldState?: boolean): PrepareNesRenameResult;
	public setCanRename(value: protocol.RenameKind, valueOrReason?: string, onOldState?: boolean): PrepareNesRenameResult {
		this.canRename = value;
		if (value === protocol.RenameKind.no) {
			this.reason = valueOrReason;
		} else {
			this.oldName = valueOrReason;
			this.onOldState = onOldState ?? this.onOldState;
		}
		return this;
	}

	public setOnOldState(value: boolean): PrepareNesRenameResult {
		if (this.canRename === protocol.RenameKind.no) {
			throw new Error('Cannot set onOldState when canRename is no');
		}
		this.onOldState = value;
		return this;
	}

	public setTimedOut(value: boolean): PrepareNesRenameResult {
		this.timedOut = value;
		return this;
	}

	public toJsonResponse(): protocol.PrepareNesRenameResponse.OK {
		if (this.timedOut) {
			return {
				canRename: protocol.RenameKind.no,
				reason: this.reason,
				timedOut: true,
			};
		}
		if (this.canRename === protocol.RenameKind.yes || this.canRename === protocol.RenameKind.maybe) {
			return {
				canRename: this.canRename,
				oldName: this.oldName!,
				onOldState: this.onOldState,
			};
		}
		return {
			canRename: protocol.RenameKind.no,
			timedOut: false,
			reason: this.reason,
		};
	}
}

class DeclarationChecker {
	constructor(
		private readonly result: PrepareNesRenameResult,
		private readonly symbols: Symbols,
		private readonly symbol: NativeSymbol,
	) { }

	public async checkDeclarations(): Promise<void> {
		const declarations = await this.symbols.getDeclarations(this.symbol);
		if (declarations.length <= 1) {
			return;
		}
		let withBody = 0;
		const signatures = new Set<string>();
		for (const declaration of declarations) {
			if ((isMethodDeclaration(declaration) || isFunctionDeclaration(declaration)) && declaration.body !== undefined) {
				withBody++;
				if (withBody === 2) {
					this.result.setCanRename(protocol.RenameKind.no, 'The symbol has multiple declarations with body');
					return;
				}
				continue;
			}
			const text = declaration.getText();
			if (signatures.has(text)) {
				this.result.setCanRename(protocol.RenameKind.no, 'The symbol has multiple identical declarations');
				return;
			}
			signatures.add(text);
		}
	}
}

export async function validateNesRename(result: PrepareNesRenameResult, project: Project, node: Node, oldName: string, newName: string, token: CancellationTokenWithTimer): Promise<void> {
	const symbols = new Symbols(project, token);
	const symbol = await symbols.getLeafSymbolAtLocation(node);
	if (symbol === undefined) {
		result.setCanRename(protocol.RenameKind.no, 'No symbol found at location');
		return;
	}
	const parent = await symbol.getParent();
	const declarations = await symbols.getDeclarations(symbol);
	for (const declaration of declarations) {
		if (await symbols.isSourceFileFromLibrary(declaration.getSourceFile())) {
			result.setCanRename(protocol.RenameKind.no, 'The symbol is declared in a library file');
			return;
		}
	}
	if (declarations.length === 1 && (Symbols.isBlockScopedVariable(symbol) || Symbols.isFunctionScopedVariable(symbol))) {
		const inScope = await symbols.getSymbolsInScope(declarations[0], SymbolFlags.BlockScopedVariable | SymbolFlags.FunctionScopedVariable);
		for (const inScopeSymbol of inScope) {
			if (inScopeSymbol.id !== symbol.id && inScopeSymbol.name === symbol.name) {
				result.setCanRename(protocol.RenameKind.no, `A variable with the name '${oldName}' already exists in the same scope`);
				return;
			}
		}
	} else if (declarations.length > 1) {
		if (Symbols.isFunction(symbol)) {
			await new DeclarationChecker(result, symbols, symbol).checkDeclarations();
			if (result.getCanRename() === protocol.RenameKind.no) {
				return;
			}
		} else if (!Symbols.isMethod(symbol) || parent === undefined) {
			result.setCanRename(protocol.RenameKind.no, 'The symbol has multiple declarations');
			return;
		} else if (Symbols.isInterface(parent) || Symbols.isTypeLiteral(parent) || Symbols.isClass(parent)) {
			await new DeclarationChecker(result, symbols, symbol).checkDeclarations();
			if (result.getCanRename() === protocol.RenameKind.no) {
				return;
			}
		}
	}

	const escapedNewName = escapeLeadingUnderscores(newName);
	if (parent !== undefined) {
		if ((await parent.getMembers()).has(escapedNewName)) {
			result.setCanRename(protocol.RenameKind.no, `A member with the name '${newName}' already exists on '${parent.name}'`);
			return;
		}
		if ((await parent.getExports()).has(escapedNewName)) {
			result.setCanRename(protocol.RenameKind.no, `An export with the name '${newName}' already exists on module '${parent.name}'`);
			return;
		}
		if (Symbols.isClass(parent) || Symbols.isInterface(parent)) {
			for (const superType of await symbols.getAllSuperTypes(parent)) {
				if ((await superType.getMembers()).has(escapedNewName)) {
					result.setCanRename(protocol.RenameKind.no, `A member with the name '${newName}' already exists on base type '${superType.name}'`);
					return;
				}
				token.throwIfCancellationRequested();
			}
			result.setCanRename(protocol.RenameKind.yes, oldName);
			return;
		} else if (Symbols.isEnum(parent)) {
			result.setCanRename(protocol.RenameKind.yes, oldName);
			return;
		}
	}
	token.throwIfCancellationRequested();
	if (declarations.length === 0) {
		result.setCanRename(protocol.RenameKind.no, 'The symbol has no declarations');
		return;
	}
	if (await hasSameSymbolOnDeclarationSide(symbols, declarations, newName)) {
		result.setCanRename(protocol.RenameKind.no, `A symbol with the name '${newName}' already exists in the scope`);
	} else {
		result.setCanRename(protocol.RenameKind.yes, oldName);
	}
}

async function hasSameSymbolOnDeclarationSide(symbols: Symbols, declarations: readonly Node[], newName: string): Promise<boolean> {
	let inModule: boolean | undefined;
	for (const declaration of declarations) {
		const inScope = await symbols.getTypeChecker().resolveName(newName, renameSymbolFlags, declaration, false);
		if (inScope !== undefined) {
			inModule ??= await isInModule(symbols, declarations);
			if (!inModule) {
				return true;
			}
			const block = getParentBlock(declaration);
			if (block === undefined || await isInSameBlockScopeDeclared(symbols, inScope, block)) {
				return true;
			}
		}
	}
	return false;
}

async function isInModule(symbols: Symbols, declarations: readonly Node[]): Promise<boolean> {
	for (const declaration of declarations) {
		// if (await symbols.getTypeChecker().getSymbolOfSourceFile(declaration.getSourceFile().fileName) === undefined) {
		if (await symbols.getLeafSymbolAtLocation(declaration.getSourceFile()) === undefined) {
			return false;
		}
	}
	return true;
}

async function isInSameBlockScopeDeclared(symbols: Symbols, symbol: NativeSymbol, block: Node): Promise<boolean> {
	for (const declaration of await symbols.getDeclarations(symbol)) {
		if (getParentBlock(declaration) === block) {
			return true;
		}
	}
	return false;
}

function getParentBlock(node: Node): Node | undefined {
	let current: Node | undefined = node;
	while (current !== undefined) {
		if (isBlock(current) || isModuleBlock(current) || isSourceFile(current)) {
			return current;
		}
		current = current.parent;
	}
	return undefined;
}
