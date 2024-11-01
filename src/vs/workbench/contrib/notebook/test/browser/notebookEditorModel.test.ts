/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellKind, IOutputDto, NotebookData, NotebookSetting, TransientOptions } from '../../common/notebookCommon.js';
import { NotebookFileWorkingCopyModel } from '../../common/notebookEditorModel.js';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from '../../common/notebookService.js';
import { setupInstantiationService } from './testNotebookEditor.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';

suite('NotebookFileWorkingCopyModel', function () {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	const configurationService = new TestConfigurationService();
	const telemetryService = new class extends mock<ITelemetryService>() {
		override publicLogError2() { }
	};
	const logservice = new class extends mock<ILogService>() { };

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
				configurationService,
				telemetryService,
				logservice
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
				configurationService,
				telemetryService,
				logservice
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
				configurationService,
				telemetryService,
				logservice
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
				configurationService,
				telemetryService,
				logservice

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
				configurationService,
				telemetryService,
				logservice
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
				configurationService,
				telemetryService,
				logservice
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
			configurationService,
			telemetryService,
			logservice
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

	test('Notebook model will not return a save delegate if the serializer has not been retreived', async function () {
		const notebook = instantiationService.createInstance(NotebookTextModel,
			'notebook',
			URI.file('test'),
			[{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [], metadata: { foo: 123, bar: 456 } }],
			{},
			{ transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false, }
		);
		disposables.add(notebook);

		const serializer = new class extends mock<INotebookSerializer>() {
			override save(): Promise<IFileStatWithMetadata> {
				return Promise.resolve({ name: 'savedFile' } as IFileStatWithMetadata);
			}
		};
		(serializer as any).test = 'yes';

		let resolveSerializer: (serializer: INotebookSerializer) => void = () => { };
		const serializerPromise = new Promise<INotebookSerializer>(resolve => {
			resolveSerializer = resolve;
		});
		const notebookService = mockNotebookService(notebook, serializerPromise);
		configurationService.setUserConfiguration(NotebookSetting.remoteSaving, true);

		const model = disposables.add(new NotebookFileWorkingCopyModel(
			notebook,
			notebookService,
			configurationService,
			telemetryService,
			logservice
		));

		// the save method should not be set if the serializer is not yet resolved
		const notExist = model.save;
		assert.strictEqual(notExist, undefined);

		resolveSerializer(serializer);
		await model.getNotebookSerializer();
		const result = await model.save?.({} as any, {} as any);

		assert.strictEqual(result!.name, 'savedFile');
	});
});

function mockNotebookService(notebook: NotebookTextModel, notebookSerializer: Promise<INotebookSerializer> | INotebookSerializer) {
	return new class extends mock<INotebookService>() {
		private serializer: INotebookSerializer | undefined = undefined;
		override async withNotebookDataProvider(viewType: string): Promise<SimpleNotebookProviderInfo> {
			this.serializer = await notebookSerializer;
			return new SimpleNotebookProviderInfo(
				notebook.viewType,
				this.serializer,
				{
					id: new ExtensionIdentifier('test'),
					location: undefined
				}
			);
		}
		override tryGetDataProviderSync(viewType: string): SimpleNotebookProviderInfo | undefined {
			if (!this.serializer) {
				return undefined;
			}
			return new SimpleNotebookProviderInfo(
				notebook.viewType,
				this.serializer,
				{
					id: new ExtensionIdentifier('test'),
					location: undefined
				}
			);
		}
	};
}
