/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { afterEach, suite, test } from 'vitest';
import { TreeSitterExpressionInfo } from '../../../../platform/parser/node/nodes';
import { IParserService, TreeSitterAST } from '../../../../platform/parser/node/parserService';
import { WASMLanguage } from '../../../../platform/parser/node/treeSitterLanguages';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { findSymbolLocationInFile, SymbolFileCache } from '../../vscode-node/findWord';

class TestParserService implements Partial<IParserService> {
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

const testWorkspace = ensureTestWorkspace();
const originalWorkspaceReadFile = vscode.workspace.fs.readFile;
const originalWorkspaceTextDocuments = vscode.workspace.textDocuments;

afterEach(() => {
	testWorkspace.textDocuments = originalWorkspaceTextDocuments;
	testWorkspace.fs.readFile = originalWorkspaceReadFile;
});

function setWorkspaceFileContents(contentsByUri: ReadonlyMap<string, string>): void {
	testWorkspace.textDocuments = [];
	testWorkspace.fs.readFile = async (uri: vscode.Uri) => {
		const contents = contentsByUri.get(uri.toString());
		if (contents === undefined) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return new TextEncoder().encode(contents);
	};
}

function symbol(contents: string, identifier: string): TreeSitterExpressionInfo {
	const startIndex = contents.indexOf(identifier);
	return {
		identifier,
		text: identifier,
		startIndex,
		endIndex: startIndex + identifier.length,
	};
}

function declaration(contents: string, identifier: string, text: string): TreeSitterExpressionInfo {
	const startIndex = contents.indexOf(text);
	return {
		identifier,
		text,
		startIndex,
		endIndex: startIndex + text.length,
	};
}

function asParserService(parserService: TestParserService): IParserService {
	return parserService as unknown as IParserService;
}

suite('Find symbol location in file', () => {

	test('Should return the exact symbol location', async () => {
		const contents = [
			'const value = 1;',
			'',
			'class Foo {',
			'}',
		].join('\n');
		const uri = URI.file('/workspace/src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const location = await findSymbolLocationInFile(
			asParserService(new TestParserService([symbol(contents, 'Foo')])),
			uri,
			'Foo',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.uri.toString(), uri.toString());
		assert.strictEqual(location.range.start.line, 2);
		assert.strictEqual(location.range.start.character, 6);
	});

	test('Should prefer declaration matches over earlier generic symbol references', async () => {
		const declarationText = 'class Foo(Base):';
		const contents = [
			'if isinstance(module, Foo):',
			'',
			declarationText,
			'\tpass',
		].join('\n');
		const uri = URI.file('/workspace/src/file.py');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const parserService = new TestParserService(
			[symbol(contents, 'Foo')],
			[declaration(contents, 'Foo', declarationText)],
		);
		const location = await findSymbolLocationInFile(
			asParserService(parserService),
			uri,
			'Foo',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.range.start.line, 2);
		assert.strictEqual(location.range.start.character, 0);
		assert.strictEqual(parserService.genericSymbolQueryCount, 0);
	});

	test('Should prefer declaration fallback over generic symbol references for qualified names', async () => {
		const declarationText = 'class Foo:';
		const contents = [
			'if value.bar:',
			'\tpass',
			'',
			declarationText,
			'\tpass',
		].join('\n');
		const uri = URI.file('/workspace/src/file.py');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const parserService = new TestParserService(
			[symbol(contents, 'bar')],
			[declaration(contents, 'Foo', declarationText)],
		);
		const location = await findSymbolLocationInFile(
			asParserService(parserService),
			uri,
			'Foo.bar',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.range.start.line, 3);
		assert.strictEqual(location.range.start.character, 0);
		assert.strictEqual(parserService.genericSymbolQueryCount, 0);
	});

	test('Should use the highest-index qualified name part when there is no exact match', async () => {
		const contents = [
			'class Foo {',
			'\tmethod() {',
			'\t}',
			'}',
		].join('\n');
		const uri = URI.file('/workspace/src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const location = await findSymbolLocationInFile(
			asParserService(new TestParserService([
				symbol(contents, 'Foo'),
				symbol(contents, 'method'),
			])),
			uri,
			'Foo.method',
			CancellationToken.None,
		);

		assert(location);
		assert.strictEqual(location.range.start.line, 1);
		assert.strictEqual(location.range.start.character, 1);
	});

	test('Should return undefined for unsupported, missing, or unmatched files', async () => {
		const contents = 'class Foo {}';
		const tsUri = URI.file('/workspace/src/file.ts');
		const txtUri = URI.file('/workspace/src/file.txt');
		setWorkspaceFileContents(new Map([[tsUri.toString(), contents]]));

		const parserService = asParserService(new TestParserService([symbol(contents, 'Foo')]));

		assert.strictEqual(await findSymbolLocationInFile(parserService, txtUri, 'Foo', CancellationToken.None), undefined);
		assert.strictEqual(await findSymbolLocationInFile(parserService, URI.file('/workspace/src/missing.ts'), 'Foo', CancellationToken.None), undefined);
		assert.strictEqual(await findSymbolLocationInFile(parserService, tsUri, 'Missing', CancellationToken.None), undefined);
	});

	test('Should reuse cached file symbols for repeated URI lookups', async () => {
		const contents = [
			'class Foo {',
			'\tmethod() {',
			'\t}',
			'}',
		].join('\n');
		const uri = URI.file('/workspace/src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const parserService = new TestParserService([
			symbol(contents, 'Foo'),
			symbol(contents, 'method'),
		]);
		const cache: SymbolFileCache = new Map();

		const classLocation = await findSymbolLocationInFile(asParserService(parserService), uri, 'Foo', CancellationToken.None, cache);
		const methodLocation = await findSymbolLocationInFile(asParserService(parserService), uri, 'Foo.method', CancellationToken.None, cache);

		assert(classLocation);
		assert(methodLocation);
		assert.strictEqual(parserService.parseCount, 1);
		assert.strictEqual(parserService.genericSymbolQueryCount, 1);
	});
});
