/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NullEnvService } from '../../../../platform/env/common/nullEnvService';
import { LinkifySymbolAnchor } from '../../common/linkifiedText';
import { ILinkifyService, LinkifyService } from '../../common/linkifyService';
import { SymbolLinkifier } from '../../vscode-node/symbolLinkifier';
import { assertPartsEqual, createMockFsService, createMockWorkspaceService, linkify, workspaceFile } from '../node/util';

function createTestLinkifierService(...listOfFiles: readonly string[]): ILinkifyService {
	const fs = createMockFsService(listOfFiles);
	const workspaceService = createMockWorkspaceService();
	const linkifier = new LinkifyService(fs, workspaceService, NullEnvService.Instance);
	linkifier.registerGlobalLinkifier({ create: () => new SymbolLinkifier(fs, workspaceService) });
	return linkifier;
}

suite('Symbol Linkify', () => {

	test(`Should create symbol links from Markdown links`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		);
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
		const linkifier = createTestLinkifierService();
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
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		);
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
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		);

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
		const linkifier = createTestLinkifierService(
			'space file.ts',
		);
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
});
