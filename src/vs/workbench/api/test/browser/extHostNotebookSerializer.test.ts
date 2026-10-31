/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainContext, MainThreadCommandsShape, MainThreadNotebookShape } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { ExtHostConsumerFileSystem } from '../../common/extHostFileSystemConsumer.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { ExtHostNotebookController } from '../../common/extHostNotebook.js';
import { ExtHostSearch } from '../../common/extHostSearch.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { NotebookData } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostNotebookSerializer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createNotebooks() {
		const rpc = new TestRPCProtocol();
		const handles: number[] = [];
		rpc.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
		});
		rpc.set(MainContext.MainThreadNotebook, new class extends mock<MainThreadNotebookShape>() {
			override $registerNotebookSerializer(handle: number): void {
				handles.push(handle);
			}
			override $unregisterNotebookSerializer(): void { }
		});
		const logService = new NullLogService();
		const documentsAndEditors = new ExtHostDocumentsAndEditors(rpc, logService);
		const documents = store.add(new ExtHostDocuments(rpc, documentsAndEditors));
		const commands = new ExtHostCommands(rpc, logService, new class extends mock<IExtHostTelemetry>() { });
		const fileSystem = new ExtHostConsumerFileSystem(rpc, new ExtHostFileSystemInfo());
		const search = new ExtHostSearch(rpc, new URITransformerService(null), logService);
		const notebooks = new ExtHostNotebookController(rpc, commands, documentsAndEditors, documents, fileSystem, search, logService);
		return { rpc, notebooks, handles };
	}

	test('disposed serializers cannot deserialize subsequent requests', async () => {
		const { rpc, notebooks, handles } = createNotebooks();
		const registration = store.add(notebooks.registerNotebookSerializer(nullExtensionDescription, 'test.notebook', {
			deserializeNotebook: () => new NotebookData([]),
			serializeNotebook: () => new Uint8Array()
		}));
		await rpc.sync();
		assert.deepStrictEqual((await notebooks.$dataToNotebook(handles[0], VSBuffer.alloc(0), CancellationToken.None)).value.cells, []);
		registration.dispose();
		await assert.rejects(notebooks.$dataToNotebook(handles[0], VSBuffer.alloc(0), CancellationToken.None), /NO serializer found/);
	});

	test('disposed serializers cannot serialize subsequent requests', async () => {
		const { rpc, notebooks, handles } = createNotebooks();
		const registration = store.add(notebooks.registerNotebookSerializer(nullExtensionDescription, 'test.notebook', {
			deserializeNotebook: () => new NotebookData([]),
			serializeNotebook: () => new Uint8Array([42])
		}));
		await rpc.sync();
		const data = await notebooks.$dataToNotebook(handles[0], VSBuffer.alloc(0), CancellationToken.None);
		assert.deepStrictEqual(Array.from((await notebooks.$notebookToData(handles[0], data, CancellationToken.None)).buffer), [42]);
		registration.dispose();
		await assert.rejects(notebooks.$notebookToData(handles[0], data, CancellationToken.None), /NO serializer found/);
	});

	test('disposing one serializer leaves another registration usable', async () => {
		const { rpc, notebooks, handles } = createNotebooks();
		const serializer = {
			deserializeNotebook: () => new NotebookData([]),
			serializeNotebook: () => new Uint8Array([42])
		};
		const registration = store.add(notebooks.registerNotebookSerializer(nullExtensionDescription, 'test.first', serializer));
		store.add(notebooks.registerNotebookSerializer(nullExtensionDescription, 'test.second', serializer));
		await rpc.sync();
		registration.dispose();
		registration.dispose();
		const data = await notebooks.$dataToNotebook(handles[1], VSBuffer.alloc(0), CancellationToken.None);
		assert.deepStrictEqual(Array.from((await notebooks.$notebookToData(handles[1], data, CancellationToken.None)).buffer), [42]);
	});

	test('an in-flight deserialization can finish without reviving a disposed serializer', async () => {
		const { rpc, notebooks, handles } = createNotebooks();
		const result = new DeferredPromise<NotebookData>();
		const registration = store.add(notebooks.registerNotebookSerializer(nullExtensionDescription, 'test.notebook', {
			deserializeNotebook: () => result.p,
			serializeNotebook: () => new Uint8Array()
		}));
		await rpc.sync();
		const pending = notebooks.$dataToNotebook(handles[0], VSBuffer.alloc(0), CancellationToken.None);
		registration.dispose();
		await result.complete(new NotebookData([]));
		assert.deepStrictEqual((await pending).value.cells, []);
		await assert.rejects(notebooks.$dataToNotebook(handles[0], VSBuffer.alloc(0), CancellationToken.None), /NO serializer found/);
	});
});
