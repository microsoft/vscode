/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { suite, test } from 'vitest';
import { NullEnvService } from '../../../../platform/env/common/nullEnvService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { LinkifySymbolAnchor } from '../../common/linkifiedText';
import { ILinkifyService, LinkifyService } from '../../common/linkifyService';
import { SymbolLinkifier } from '../../vscode-node/symbolLinkifier';
import { assertPartsEqual, createMockFsService, createMockWorkspaceService, linkify, workspaceFile } from '../node/util';
import { asParserService, setExecuteCommand, setWorkspaceFileContents, symbol, TestParserService } from './util';

function createTestLinkifierService(listOfFiles: readonly string[], parserService: IParserService = asParserService(new TestParserService())): ILinkifyService {
	const fs = createMockFsService(listOfFiles);
	const workspaceService = createMockWorkspaceService();
	const linkifier = new LinkifyService(fs, workspaceService, NullEnvService.Instance);
	linkifier.registerGlobalLinkifier({ create: () => new SymbolLinkifier(fs, parserService, workspaceService) });
	return linkifier;
}

suite('Symbol Linkify', () => {

	test(`Should create symbol links from Markdown links`, async () => {
		const linkifier = createTestLinkifierService([
			'file.ts',
			'src/file.ts',
		]);
		assertPartsEqual(
			(await linkify(linkifier,
				'[`symbol`](file.ts) [`symbol`](src/file.ts)')
			).parts,
			[
				new LinkifySymbolAnchor({
					name: 'symbol',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('file.ts'), new vscode.Position(0, 0))
				}),
				' ',
				new LinkifySymbolAnchor({
					name: 'symbol',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('src/file.ts'), new vscode.Position(0, 0))
				})
			],
		);
	});

	test(`Should de-linkify symbol links to files that don't exist`, async () => {
		const linkifier = createTestLinkifierService([]);
		assertPartsEqual(
			(await linkify(linkifier,
				'[`symbol`](file.ts) [`symbol`](src/file.ts)'
			)).parts,
			[
				'`symbol` `symbol`'
			],
		);
	});

	test(`Should create symbol links for symbols containing $ or _`, async () => {
		const linkifier = createTestLinkifierService([
			'file.ts',
			'src/file.ts',
		]);
		assertPartsEqual(
			(await linkify(linkifier,
				'[`_symbol`](file.ts) [`$symbol`](src/file.ts)',
			)).parts,
			[
				new LinkifySymbolAnchor({
					name: '_symbol',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('file.ts'), new vscode.Position(0, 0))
				}),
				' ',
				new LinkifySymbolAnchor({
					name: '$symbol',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('src/file.ts'), new vscode.Position(0, 0))
				})
			],
		);
	});

	test(`Should create symbol links for symbols with function call or generic syntax`, async () => {
		const linkifier = createTestLinkifierService([
			'file.ts',
			'src/file.ts',
		]);

		assertPartsEqual(
			(await linkify(linkifier,
				'[`symbol<T>`](file.ts) [`func()`](src/file.ts)',
			)).parts,
			[
				new LinkifySymbolAnchor({
					name: 'symbol<T>',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('file.ts'), new vscode.Position(0, 0))
				}),
				' ',
				new LinkifySymbolAnchor({
					name: 'func()',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('src/file.ts'), new vscode.Position(0, 0))
				})
			]
		);
	});

	test(`Should support files with spaces`, async () => {
		const linkifier = createTestLinkifierService([
			'space file.ts',
		]);
		assertPartsEqual(
			(await linkify(linkifier,
				'[`symbol`](space%20file.ts) [`symbol`](space%20file.ts)')
			).parts,
			[
				new LinkifySymbolAnchor({
					name: 'symbol',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('space file.ts'), new vscode.Position(0, 0))
				}),
				' ',
				new LinkifySymbolAnchor({
					name: 'symbol',
					containerName: '',
					kind: vscode.SymbolKind.Constant,
					location: new vscode.Location(workspaceFile('space file.ts'), new vscode.Position(0, 0))
				})
			],
		);
	});

	test(`Should use tree-sitter for linked-backtick initial symbol locations`, async () => {
		const contents = [
			'const value = 1;',
			'',
			'class Foo {',
			'}',
		].join('\n');
		const uri = workspaceFile('src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const testParserService = new TestParserService([
			symbol(contents, 'Foo')
		]);
		const parserService = asParserService(testParserService);
		const linkifier = createTestLinkifierService(['src/file.ts'], parserService);

		const parts = (await linkify(linkifier, '[`Foo`](src/file.ts)')).parts;

		assert.strictEqual(parts.length, 1);
		assert(parts[0] instanceof LinkifySymbolAnchor);
		assert.strictEqual(parts[0].symbolInformation.location.uri.toString(), uri.toString());
		assert.strictEqual(parts[0].symbolInformation.location.range.start.line, 2);
		assert.strictEqual(parts[0].symbolInformation.location.range.start.character, 6);
	});

	test(`Should keep the start-of-file fallback when tree-sitter does not find a symbol`, async () => {
		const contents = [
			'const value = 1;',
			'',
			'class Bar {',
			'}',
		].join('\n');
		const uri = workspaceFile('src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const testParserService = new TestParserService([
			symbol(contents, 'Bar')
		]);
		const parserService = asParserService(testParserService);
		const linkifier = createTestLinkifierService(['src/file.ts'], parserService);

		const parts = (await linkify(linkifier, '[`Foo`](src/file.ts)')).parts;

		assert.strictEqual(parts.length, 1);
		assert(parts[0] instanceof LinkifySymbolAnchor);
		assert.strictEqual(parts[0].symbolInformation.location.uri.toString(), uri.toString());
		assert.strictEqual(parts[0].symbolInformation.location.range.start.line, 0);
		assert.strictEqual(parts[0].symbolInformation.location.range.start.character, 0);
	});

	test(`Should reuse the tree-sitter cache for multiple links to the same file`, async () => {
		const contents = [
			'class Foo {',
			'}',
			'',
			'class Bar {',
			'}',
		].join('\n');
		const uri = workspaceFile('src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));

		const testParserService = new TestParserService([
			symbol(contents, 'Foo'),
			symbol(contents, 'Bar'),
		]);
		const fs = createMockFsService(['src/file.ts']);
		const linkifier = new SymbolLinkifier(fs, asParserService(testParserService), createMockWorkspaceService());

		const result = await linkifier.linkify('[`Foo`](src/file.ts) [`Bar`](src/file.ts)', { requestId: undefined, references: [] }, CancellationToken.None);

		assert.strictEqual(testParserService.parseCount, 1);
		assert(result);
		const parts = result.parts;
		assert.strictEqual(parts.length, 3);
		assert(parts[0] instanceof LinkifySymbolAnchor);
		assert(parts[2] instanceof LinkifySymbolAnchor);
		assert.strictEqual(parts[0].symbolInformation.location.range.start.line, 0);
		assert.strictEqual(parts[0].symbolInformation.location.range.start.character, 6);
		assert.strictEqual(parts[2].symbolInformation.location.range.start.line, 3);
		assert.strictEqual(parts[2].symbolInformation.location.range.start.character, 6);
	});

	test(`Should let LSP resolve upgrade symbol kind and location`, async () => {
		const contents = [
			'const value = 1;',
			'',
			'class Foo {',
			'}',
			'',
			'class Foo {',
			'}',
		].join('\n');
		const uri = workspaceFile('src/file.ts');
		setWorkspaceFileContents(new Map([[uri.toString(), contents]]));
		setExecuteCommand(async <T>(command: string, resolvedUri: vscode.Uri): Promise<T> => {
			assert.strictEqual(command, 'vscode.executeDocumentSymbolProvider');
			assert.strictEqual(resolvedUri.toString(), uri.toString());
			return [
				{
					name: 'Foo',
					detail: '',
					kind: vscode.SymbolKind.Class,
					range: new vscode.Range(5, 0, 6, 1),
					selectionRange: new vscode.Range(5, 6, 5, 9),
					children: [],
				}
			] as T;
		});

		const linkifier = createTestLinkifierService(['src/file.ts'], asParserService(new TestParserService([
			symbol(contents, 'Foo')
		])));
		const parts = (await linkify(linkifier, '[`Foo`](src/file.ts)')).parts;

		assert.strictEqual(parts.length, 1);
		assert(parts[0] instanceof LinkifySymbolAnchor);
		assert.strictEqual(parts[0].symbolInformation.kind, vscode.SymbolKind.Variable);
		assert.strictEqual(parts[0].symbolInformation.location.range.start.line, 2);
		assert(parts[0].resolve);

		const resolved = await parts[0].resolve(CancellationToken.None);

		assert.strictEqual(resolved.kind, vscode.SymbolKind.Class);
		assert.strictEqual(resolved.location.uri.toString(), uri.toString());
		assert.strictEqual(resolved.location.range.start.line, 5);
		assert.strictEqual(resolved.location.range.start.character, 6);
	});
});
