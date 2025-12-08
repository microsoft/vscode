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
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, NotebookData, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookFileWorkingCopyModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('NotebookFileWorkingCopyModel', function () {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	const configurationService = new TestConfigurationService();

	suiteSetup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
	});

	suiteTeardown(() => disposables.dispose());

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
			const model = new NotebookFileWorkingCopyModel(
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
			);

			await model.snapshot(CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}

		{ // NOT transient output
			let callCount = 0;
			const model = new NotebookFileWorkingCopyModel(
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
			);
			await model.snapshot(CancellationToken.None);
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

		{ // transient
			let callCount = 0;
			const model = new NotebookFileWorkingCopyModel(
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
			);

			await model.snapshot(CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}

		{ // NOT transient
			let callCount = 0;
			const model = new NotebookFileWorkingCopyModel(
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
			);
			await model.snapshot(CancellationToken.None);
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

		{ // transient
			let callCount = 0;
			const model = new NotebookFileWorkingCopyModel(
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
			);

			await model.snapshot(CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}

		{ // NOT transient
			let callCount = 0;
			const model = new NotebookFileWorkingCopyModel(
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
			);
			await model.snapshot(CancellationToken.None);
			assert.strictEqual(callCount, 1);
		}
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
