/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, IOutputDto, NotebookData, NotebookSetting, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookFileWorkingCopyModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { SnapshotContext } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';

suite('NotebookFileWorkingCopyModel', function () {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	const configurationService = new TestConfigurationService();

	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
	});

	test('no transient output is send to serializer', async function () {

		const notebook = instantiationService.createInstance(NotebookTextModel,
			'notebook',
			URI.file('test'),
			[{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [{ outputId: 'id', outputs: [{ mime: Mimes.text, data: VSBuffer.fromString('Hello Out') }] }] }],
			{},
			{ transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
		);

		{ // transient output
			let callCount = 0;
			const model = disposables.add(new NotebookFileWorkingCopyModel(
				notebook,
				mockNotebookService(notebook,
					new class extends mock<INotebookSerializer>() {
						override options: TransientOptions = { transientOutputs: true, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
						override async notebookToData(notebook: NotebookData) {
							callCount += 1;
							assert.strictEqual(notebook.cells.length, 1);
							assert.strictEqual(notebook.cells[0].outputs.length, 0);
							return VSBuffer.fromString('');
						}
					}
				),
				configurationService
			));

			await model.snapshot(SnapshotContext.Save, CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}

		{ // NOT transient output
			let callCount = 0;
			const model = disposables.add(new NotebookFileWorkingCopyModel(
				notebook,
				mockNotebookService(notebook,
					new class extends mock<INotebookSerializer>() {
						override options: TransientOptions = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
						override async notebookToData(notebook: NotebookData) {
							callCount += 1;
							assert.strictEqual(notebook.cells.length, 1);
							assert.strictEqual(notebook.cells[0].outputs.length, 1);
							return VSBuffer.fromString('');
						}
					}
				),
				configurationService
			));
			await model.snapshot(SnapshotContext.Save, CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}
	});

	test('no transient metadata is send to serializer', async function () {

		const notebook = instantiationService.createInstance(NotebookTextModel,
			'notebook',
			URI.file('test'),
			[{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [] }],
			{ foo: 123, bar: 456 },
			{ transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
		);

		disposables.add(notebook);

		{ // transient
			let callCount = 0;
			const model = disposables.add(new NotebookFileWorkingCopyModel(
				notebook,
				mockNotebookService(notebook,
					new class extends mock<INotebookSerializer>() {
						override options: TransientOptions = { transientOutputs: true, transientCellMetadata: {}, transientDocumentMetadata: { bar: true }, cellContentMetadata: {} };
						override async notebookToData(notebook: NotebookData) {
							callCount += 1;
							assert.strictEqual(notebook.metadata.foo, 123);
							assert.strictEqual(notebook.metadata.bar, undefined);
							return VSBuffer.fromString('');
						}
					}
				),
				configurationService
			));

			await model.snapshot(SnapshotContext.Save, CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}

		{ // NOT transient
			let callCount = 0;
			const model = disposables.add(new NotebookFileWorkingCopyModel(
				notebook,
				mockNotebookService(notebook,
					new class extends mock<INotebookSerializer>() {
						override options: TransientOptions = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
						override async notebookToData(notebook: NotebookData) {
							callCount += 1;
							assert.strictEqual(notebook.metadata.foo, 123);
							assert.strictEqual(notebook.metadata.bar, 456);
							return VSBuffer.fromString('');
						}
					}
				),
				configurationService
			));
			await model.snapshot(SnapshotContext.Save, CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}
	});

	test('no transient cell metadata is send to serializer', async function () {

		const notebook = instantiationService.createInstance(NotebookTextModel,
			'notebook',
			URI.file('test'),
			[{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [], metadata: { foo: 123, bar: 456 } }],
			{},
			{ transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false, }
		);
		disposables.add(notebook);

		{ // transient
			let callCount = 0;
			const model = disposables.add(new NotebookFileWorkingCopyModel(
				notebook,
				mockNotebookService(notebook,
					new class extends mock<INotebookSerializer>() {
						override options: TransientOptions = { transientOutputs: true, transientDocumentMetadata: {}, transientCellMetadata: { bar: true }, cellContentMetadata: {} };
						override async notebookToData(notebook: NotebookData) {
							callCount += 1;
							assert.strictEqual(notebook.cells[0].metadata!.foo, 123);
							assert.strictEqual(notebook.cells[0].metadata!.bar, undefined);
							return VSBuffer.fromString('');
						}
					}
				),
				configurationService
			));

			await model.snapshot(SnapshotContext.Save, CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}

		{ // NOT transient
			let callCount = 0;
			const model = disposables.add(new NotebookFileWorkingCopyModel(
				notebook,
				mockNotebookService(notebook,
					new class extends mock<INotebookSerializer>() {
						override options: TransientOptions = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
						override async notebookToData(notebook: NotebookData) {
							callCount += 1;
							assert.strictEqual(notebook.cells[0].metadata!.foo, 123);
							assert.strictEqual(notebook.cells[0].metadata!.bar, 456);
							return VSBuffer.fromString('');
						}
					}
				),
				configurationService
			));
			await model.snapshot(SnapshotContext.Save, CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}
	});

	test('Notebooks with outputs beyond the size threshold will throw for backup snapshots', async function () {
		const outputLimit = 100;
		await configurationService.setUserConfiguration(NotebookSetting.outputBackupSizeLimit, outputLimit * 1.0 / 1024);
		const largeOutput: IOutputDto = { outputId: '123', outputs: [{ mime: Mimes.text, data: VSBuffer.fromString('a'.repeat(outputLimit + 1)) }] };
		const notebook = instantiationService.createInstance(NotebookTextModel,
			'notebook',
			URI.file('test'),
			[{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [largeOutput], metadata: { foo: 123, bar: 456 } }],
			{},
			{ transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false, }
		);
		disposables.add(notebook);

		let callCount = 0;
		const model = disposables.add(new NotebookFileWorkingCopyModel(
			notebook,
			mockNotebookService(notebook,
				new class extends mock<INotebookSerializer>() {
					override options: TransientOptions = { transientOutputs: true, transientDocumentMetadata: {}, transientCellMetadata: { bar: true }, cellContentMetadata: {} };
					override async notebookToData(notebook: NotebookData) {
						callCount += 1;
						assert.strictEqual(notebook.cells[0].metadata!.foo, 123);
						assert.strictEqual(notebook.cells[0].metadata!.bar, undefined);
						return VSBuffer.fromString('');
					}
				}
			),
			configurationService
		));

		try {
			await model.snapshot(SnapshotContext.Backup, CancellationToken.None);
			assert.fail('Expected snapshot to throw an error for large output');
		} catch (e) {
			assert.notEqual(e.code, 'ERR_ASSERTION', e.message);
		}

		await model.snapshot(SnapshotContext.Save, CancellationToken.None);
		assert.strictEqual(callCount, 1);

	});
});

function mockNotebookService(notebook: NotebookTextModel, notebookSerializer: INotebookSerializer) {
	return new class extends mock<INotebookService>() {
		override async withNotebookDataProvider(viewType: string): Promise<SimpleNotebookProviderInfo> {
			return new SimpleNotebookProviderInfo(
				notebook.viewType,
				notebookSerializer,
				{
					id: new ExtensionIdentifier('test'),
					location: undefined
				}
			);
		}
	};
}
