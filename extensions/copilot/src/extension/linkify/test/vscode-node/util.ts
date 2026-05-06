/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { afterEach } from 'vitest';
import { TreeSitterExpressionInfo } from '../../../../platform/parser/node/nodes';
import { IParserService, TreeSitterAST } from '../../../../platform/parser/node/parserService';
import { WASMLanguage } from '../../../../platform/parser/node/treeSitterLanguages';

export class TestParserService implements Partial<IParserService> {
	public parseCount = 0;
	public genericSymbolQueryCount = 0;

	constructor(
		private readonly symbols: readonly TreeSitterExpressionInfo[] = [],
		private readonly classDeclarations: readonly TreeSitterExpressionInfo[] = [],
		private readonly functionDefinitions: readonly TreeSitterExpressionInfo[] = [],
		private readonly typeDeclarations: readonly TreeSitterExpressionInfo[] = [],
	) { }

	getTreeSitterASTForWASMLanguage(_language: WASMLanguage, _source: string): TreeSitterAST {
		this.parseCount++;
		const symbols = this.symbols;
		const classDeclarations = this.classDeclarations;
		const functionDefinitions = this.functionDefinitions;
		const typeDeclarations = this.typeDeclarations;
		return {
			getClassDeclarations: async () => classDeclarations,
			getFunctionDefinitions: async () => functionDefinitions,
			getTypeDeclarations: async () => typeDeclarations,
			getSymbols: async () => {
				this.genericSymbolQueryCount++;
				return symbols;
			},
		} as unknown as TreeSitterAST;
	}
}

interface MutableTestWorkspace {
	textDocuments: typeof vscode.workspace.textDocuments;
	fs: {
		readFile: typeof vscode.workspace.fs.readFile;
	};
}

interface MutableTestCommands {
	executeCommand: typeof vscode.commands.executeCommand;
}

interface PartialMutableTestWorkspace {
	textDocuments?: MutableTestWorkspace['textDocuments'];
	fs?: Partial<MutableTestWorkspace['fs']>;
}

function ensureTestWorkspace(): MutableTestWorkspace {
	const testVscode = vscode as unknown as { workspace?: PartialMutableTestWorkspace };
	testVscode.workspace ??= {};
	testVscode.workspace.textDocuments ??= [];
	testVscode.workspace.fs ??= {};
	testVscode.workspace.fs.readFile ??= (async () => { throw new Error('workspace.fs.readFile not mocked in test'); }) as typeof vscode.workspace.fs.readFile;
	return testVscode.workspace as MutableTestWorkspace;
}

function ensureTestCommands(): MutableTestCommands {
	const testVscode = vscode as unknown as { commands?: Partial<MutableTestCommands> };
	testVscode.commands ??= {};
	testVscode.commands.executeCommand ??= (async () => undefined) as typeof vscode.commands.executeCommand;
	return testVscode.commands as MutableTestCommands;
}

const testWorkspace = ensureTestWorkspace();
const testCommands = ensureTestCommands();
const originalWorkspaceReadFile = vscode.workspace.fs.readFile;
const originalWorkspaceTextDocuments = vscode.workspace.textDocuments;
const originalExecuteCommand = vscode.commands.executeCommand;

afterEach(() => {
	testWorkspace.textDocuments = originalWorkspaceTextDocuments;
	testWorkspace.fs.readFile = originalWorkspaceReadFile;
	testCommands.executeCommand = originalExecuteCommand;
});

export function setWorkspaceFileContents(contentsByUri: ReadonlyMap<string, string>): void {
	testWorkspace.textDocuments = [];
	testWorkspace.fs.readFile = async (uri: vscode.Uri) => {
		const contents = contentsByUri.get(uri.toString());
		if (contents === undefined) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return new TextEncoder().encode(contents);
	};
}

export function setExecuteCommand(executeCommand: typeof vscode.commands.executeCommand): void {
	testCommands.executeCommand = executeCommand;
}

export function asParserService(parserService: TestParserService): IParserService {
	return parserService as unknown as IParserService;
}

export function symbol(contents: string, identifier: string): TreeSitterExpressionInfo {
	const startIndex = contents.indexOf(identifier);
	return {
		identifier,
		text: identifier,
		startIndex,
		endIndex: startIndex + identifier.length,
	};
}

export function declaration(contents: string, identifier: string, text: string): TreeSitterExpressionInfo {
	const startIndex = contents.indexOf(text);
	return {
		identifier,
		text,
		startIndex,
		endIndex: startIndex + text.length,
	};
}
