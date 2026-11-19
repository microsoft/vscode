/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { CellKind, CellUri } from '../../../contrib/notebook/common/notebookCommon.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { MainThreadNotebookShape } from '../../common/extHost.protocol.js';
import { CommandsConverter, ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocumentData } from '../../common/extHostDocumentData.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostConsumerFileSystem } from '../../common/extHostFileSystemConsumer.js';
import { ExtHostNotebookController } from '../../common/extHostNotebook.js';
import { IExtHostSearch } from '../../common/extHostSearch.js';
import { Disposable, NotebookCellStatusBarAlignment } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Notebook cell status command lifetime', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.file('/status.notebook');
	let service: ExtHostNotebookController;
	let converter: CommandsConverter;
	let handle: number;

	setup(() => {
		const commands = new class extends mock<ExtHostCommands>() {
			override readonly converter = new CommandsConverter(this, () => undefined, new NullLogService());
			override registerCommand(): Disposable { return store.add(new Disposable(() => { })); }
			override registerApiCommand(): Disposable { return this.registerCommand(); }
			override registerArgumentProcessor(): void { }
		};
		converter = commands.converter;
		const cellUri = CellUri.generate(uri, 0);
		const document = new ExtHostDocumentData(undefined!, cellUri, ['sample'], '\n', 1, 'plaintext', false, 'utf8');
		service = new ExtHostNotebookController(SingleProxyRPCProtocol(new class extends mock<MainThreadNotebookShape>() {
			override async $registerNotebookCellStatusBarItemProvider(value: number): Promise<void> { handle = value; }
			override async $unregisterNotebookCellStatusBarItemProvider(): Promise<void> { }
		}), commands, new class extends mock<ExtHostDocumentsAndEditors>() {
			override $acceptDocumentsAndEditorsDelta(): void { }
			override acceptDocumentsAndEditorsDelta(): void { }
			override getDocument(): ExtHostDocumentData { return document; }
		}, new class extends mock<ExtHostDocuments>() { }, new class extends mock<IExtHostConsumerFileSystem>() { }, new class extends mock<IExtHostSearch>() { }, new NullLogService());
		service.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
			addedDocuments: [{
				uri, viewType: 'test', versionId: 0, cells: [{ handle: 0, uri: cellUri, source: ['sample'], eol: '\n', language: 'plaintext', cellKind: CellKind.Code, outputs: [] }]
			}]
		}));
		store.add(toDisposable(() => service.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [uri] }))));
	});

	function register() {
		const command: vscode.Command = { command: 'test.status', title: 'Inspect Status', arguments: [{ value: 'original' }] };
		store.add(service.registerNotebookCellStatusBarItemProvider(nullExtensionDescription, 'test', {
			provideCellStatusBarItems: () => ({ text: 'Inspect', alignment: NotebookCellStatusBarAlignment.Left, command })
		}));
		return command;
	}

	test('releases command arguments with the cell status result', async () => {
		const command = register();
		const result = await service.$provideNotebookCellStatusBarItems(handle, uri, 0, CancellationToken.None);
		assert.ok(result?.items[0].command && typeof result.items[0].command !== 'string');
		assert.strictEqual(converter.fromInternal(result.items[0].command), command);
		service.$releaseNotebookCellStatusBarItems(result.cacheId);
		assert.strictEqual(converter.fromInternal(result.items[0].command), undefined);
		service.$releaseNotebookCellStatusBarItems(result.cacheId);
	});

	test('releasing one result preserves another live result', async () => {
		const command = register();
		const first = await service.$provideNotebookCellStatusBarItems(handle, uri, 0, CancellationToken.None);
		const second = await service.$provideNotebookCellStatusBarItems(handle, uri, 0, CancellationToken.None);
		assert.ok(first?.items[0].command && typeof first.items[0].command !== 'string' && second?.items[0].command && typeof second.items[0].command !== 'string');
		service.$releaseNotebookCellStatusBarItems(first.cacheId);
		assert.deepStrictEqual([converter.fromInternal(first.items[0].command), converter.fromInternal(second.items[0].command)], [undefined, command]);
		service.$releaseNotebookCellStatusBarItems(second.cacheId);
	});

	test('ignores unknown result IDs', () => {
		service.$releaseNotebookCellStatusBarItems(-1);
		service.$releaseNotebookCellStatusBarItems(-1);
	});
});
