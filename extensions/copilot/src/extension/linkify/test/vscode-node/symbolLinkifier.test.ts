/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { NullEnvService } from '../../../../platform/env/common/nullEnvService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../platform/filesystem/common/fileTypes';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { LinkifySymbolAnchor } from '../../common/linkifiedText';
import { ILinkifyService, LinkifyService } from '../../common/linkifyService';
import { SymbolLinkifier } from '../../vscode-node/symbolLinkifier';
import { assertPartsEqual, createMockFsService, createMockWorkspaceService, linkify, workspaceFile } from '../node/util';
import { asParserService, createTestFile, symbol, TestParserService } from './util';

function createWorkspaceService(workspace: URI): IWorkspaceService {
	return new class implements Partial<IWorkspaceService> {
		getWorkspaceFolders(): URI[] {
			return [workspace];
		}

		getWorkspaceFolder(): URI | undefined {
			return workspace;
		}

		getWorkspaceFolderName(): string {
			return 'workspace';
		}
	} as unknown as IWorkspaceService;
}

function createTestLinkifierService(listOfFiles: readonly string[], parserService: IParserService = asParserService(new TestParserService()), workspace?: URI): ILinkifyService {
	const fs = createMockFsService(workspace ? listOfFiles.map(file => URI.joinPath(workspace, file)) : listOfFiles);
	const workspaceService = workspace ? createWorkspaceService(workspace) : createMockWorkspaceService();
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
		const { workspace, uri } = await createTestFile('src/file.ts', contents);

		const testParserService = new TestParserService([
			symbol(contents, 'Foo')
		]);
		const parserService = asParserService(testParserService);
		const linkifier = createTestLinkifierService(['src/file.ts'], parserService, workspace);

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
		const { workspace, uri } = await createTestFile('src/file.ts', contents);

		const testParserService = new TestParserService([
			symbol(contents, 'Bar')
		]);
		const parserService = asParserService(testParserService);
		const linkifier = createTestLinkifierService(['src/file.ts'], parserService, workspace);

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
		const { workspace } = await createTestFile('src/file.ts', contents);

		const testParserService = new TestParserService([
			symbol(contents, 'Foo'),
			symbol(contents, 'Bar'),
		]);
		const fs = createMockFsService([URI.joinPath(workspace, 'src/file.ts')]);
		const linkifier = new SymbolLinkifier(fs, asParserService(testParserService), createWorkspaceService(workspace));

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

	test(`Should reuse the tree-sitter cache across streamed chunks`, async () => {
		const contents = [
			'class Foo {',
			'}',
			'',
			'class Bar {',
			'}',
		].join('\n');
		const { workspace } = await createTestFile('src/file.ts', contents);

		const testParserService = new TestParserService([
			symbol(contents, 'Foo'),
			symbol(contents, 'Bar'),
		]);
		const fs = createMockFsService([URI.joinPath(workspace, 'src/file.ts')]);
		const linkifier = new SymbolLinkifier(fs, asParserService(testParserService), createWorkspaceService(workspace));
		const context = { requestId: undefined, references: [] };

		const firstResult = await linkifier.linkify('[`Foo`](src/file.ts)', context, CancellationToken.None);
		const secondResult = await linkifier.linkify('[`Bar`](src/file.ts)', context, CancellationToken.None);

		assert.strictEqual(testParserService.parseCount, 1);
		assert(firstResult);
		assert(secondResult);
		assert(firstResult.parts[0] instanceof LinkifySymbolAnchor);
		assert(secondResult.parts[0] instanceof LinkifySymbolAnchor);
		assert.strictEqual(firstResult.parts[0].symbolInformation.location.range.start.line, 0);
		assert.strictEqual(secondResult.parts[0].symbolInformation.location.range.start.line, 3);
	});

	test(`Should resolve multiple symbol links in parallel`, async () => {
		const workspace = URI.file('/workspace');
		const files = [
			URI.joinPath(workspace, 'src/foo.ts'),
			URI.joinPath(workspace, 'src/bar.ts'),
		];
		let activeStats = 0;
		let maxActiveStats = 0;
		const fs = new class implements Partial<IFileSystemService> {
			async stat(path: URI): Promise<vscode.FileStat> {
				activeStats++;
				maxActiveStats = Math.max(maxActiveStats, activeStats);
				try {
					await new Promise(resolve => setTimeout(resolve, 0));
					if (!files.some(file => file.toString() === path.toString())) {
						throw new Error(`File not found: ${path.toString()}`);
					}
					return { ctime: 0, mtime: 0, size: 0, type: FileType.File };
				} finally {
					activeStats--;
				}
			}
		} as IFileSystemService;
		const linkifier = new SymbolLinkifier(fs, asParserService(new TestParserService()), createWorkspaceService(workspace));

		const result = await linkifier.linkify('[`Foo`](src/foo.ts) [`Bar`](src/bar.ts)', { requestId: undefined, references: [] }, CancellationToken.None);

		assert(result);
		assert.strictEqual(maxActiveStats, 2);
		assert.strictEqual(result.parts.length, 3);
		assert(result.parts[0] instanceof LinkifySymbolAnchor);
		assert(result.parts[2] instanceof LinkifySymbolAnchor);
	});

	test(`Should not linkify symbols that resolve outside the workspace`, async () => {
		const workspace = URI.file('/workspace');
		const outsideUri = URI.joinPath(workspace, '../outside.ts');
		const testParserService = new TestParserService([
			{ identifier: 'Foo', text: 'Foo', startIndex: 0, endIndex: 3 }
		]);
		const fs = createMockFsService([outsideUri]);
		const linkifier = new SymbolLinkifier(fs, asParserService(testParserService), createWorkspaceService(workspace));

		const result = await linkifier.linkify('[`Foo`](%2e%2e/outside.ts)', { requestId: undefined, references: [] }, CancellationToken.None);

		assert.deepStrictEqual(result?.parts, ['`Foo`']);
		assert.strictEqual(testParserService.parseCount, 0);
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
		const { workspace, uri } = await createTestFile('src/file.txt', contents);
		const symbolProvider = vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'plaintext' }, {
			provideDocumentSymbols(document) {
				assert.strictEqual(document.uri.toString(), uri.toString());
				return [
					new vscode.DocumentSymbol(
						'Foo',
						'',
						vscode.SymbolKind.Class,
						new vscode.Range(5, 0, 6, 1),
						new vscode.Range(5, 6, 5, 9)
					)
				];
			}
		});

		try {
			const linkifier = createTestLinkifierService(['src/file.txt'], asParserService(new TestParserService()), workspace);
			const parts = (await linkify(linkifier, '[`Foo`](src/file.txt)')).parts;

			assert.strictEqual(parts.length, 1);
			assert(parts[0] instanceof LinkifySymbolAnchor);
			assert.strictEqual(parts[0].symbolInformation.kind, vscode.SymbolKind.Variable);
			assert.strictEqual(parts[0].symbolInformation.location.range.start.line, 0);
			assert(parts[0].resolve);

			const resolved = await parts[0].resolve(CancellationToken.None);

			assert.strictEqual(resolved.kind, vscode.SymbolKind.Class);
			assert.strictEqual(resolved.location.uri.toString(), uri.toString());
			assert.strictEqual(resolved.location.range.start.line, 5);
			assert.strictEqual(resolved.location.range.start.character, 6);
		} finally {
			symbolProvider.dispose();
		}
	});
});
