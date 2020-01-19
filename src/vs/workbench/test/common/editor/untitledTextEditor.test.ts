/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vs/base/common/uri';
import * as assert from 'assert';
import { join } from 'vs/base/common/path';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntitledTextEditorService, UntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { workbenchInstantiationService, TestEditorService } from 'vs/workbench/test/workbenchTestServices';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { ModesRegistry, PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IWorkingCopyService, IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';

class ServiceAccessor {
	constructor(
		@IUntitledTextEditorService public readonly untitledTextEditorService: IUntitledTextEditorService,
		@IEditorService public readonly editorService: TestEditorService,
		@IWorkingCopyService public readonly workingCopyService: IWorkingCopyService,
		@IModeService public readonly modeService: ModeServiceImpl,
		@IConfigurationService public readonly testConfigurationService: TestConfigurationService
	) { }
}

suite('Workbench untitled text editors', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		(accessor.untitledTextEditorService as UntitledTextEditorService).dispose();
	});

	test('Untitled Text Editor Service', async (done) => {
		const service = accessor.untitledTextEditorService;
		const workingCopyService = accessor.workingCopyService;

		const input1 = service.create();
		assert.equal(input1, service.create({ untitledResource: input1.getResource() }));
		assert.equal(service.get(input1.getResource()), input1);

		assert.ok(service.exists(input1.getResource()));
		assert.ok(!service.exists(URI.file('testing')));

		const input2 = service.create();
		assert.equal(service.get(input2.getResource()), input2);

		// get()
		assert.equal(service.get(input1.getResource()), input1);
		assert.equal(service.get(input2.getResource()), input2);

		// revert()
		input1.revert();
		assert.ok(input1.isDisposed());
		assert.ok(!service.get(input1.getResource()));

		// dirty
		const model = await input2.resolve();
		assert.equal(await service.resolve({ untitledResource: input2.getResource() }), model);

		assert.ok(!input2.isDirty());

		const listener = service.onDidChangeDirty(resource => {
			listener.dispose();

			assert.equal(resource.toString(), input2.getResource().toString());

			assert.ok(input2.isDirty());

			assert.ok(workingCopyService.isDirty(input2.getResource()));
			assert.equal(workingCopyService.dirtyCount, 1);

			input1.revert();
			input2.revert();
			assert.ok(!service.get(input1.getResource()));
			assert.ok(!service.get(input2.getResource()));
			assert.ok(!input2.isDirty());
			assert.ok(!model.isDirty());

			assert.ok(!workingCopyService.isDirty(input2.getResource()));
			assert.equal(workingCopyService.dirtyCount, 0);

			assert.ok(input1.revert());
			assert.ok(input1.isDisposed());
			assert.ok(!service.exists(input1.getResource()));

			input2.dispose();
			assert.ok(!service.exists(input2.getResource()));

			done();
		});

		model.textEditorModel.setValue('foo bar');
		model.dispose();
		input1.dispose();
		input2.dispose();
	});

	test('Untitled with associated resource is dirty', () => {
		const service = accessor.untitledTextEditorService;
		const file = URI.file(join('C:\\', '/foo/file.txt'));
		const untitled = service.create({ associatedResource: file });

		assert.ok(service.hasAssociatedFilePath(untitled.getResource()));
		assert.equal(untitled.isDirty(), true);

		untitled.dispose();
	});

	test('Untitled no longer dirty when content gets empty (not with associated resource)', async () => {
		const service = accessor.untitledTextEditorService;
		const workingCopyService = accessor.workingCopyService;
		const input = service.create();

		// dirty
		const model = await input.resolve();
		model.textEditorModel.setValue('foo bar');
		assert.ok(model.isDirty());
		assert.ok(workingCopyService.isDirty(model.resource));
		model.textEditorModel.setValue('');
		assert.ok(!model.isDirty());
		assert.ok(!workingCopyService.isDirty(model.resource));
		input.dispose();
		model.dispose();
	});

	test('Untitled via create options', async () => {
		const service = accessor.untitledTextEditorService;

		const model1 = await service.create().resolve();

		model1.textEditorModel!.setValue('foo bar');
		assert.ok(model1.isDirty());

		model1.textEditorModel!.setValue('');
		assert.ok(!model1.isDirty());

		const model2 = await service.create({ initialValue: 'Hello World' }).resolve();
		assert.equal(snapshotToString(model2.createSnapshot()!), 'Hello World');

		const input = service.create();

		const model3 = await service.create({ untitledResource: input.getResource() }).resolve();

		assert.equal(model3.resource.toString(), input.getResource().toString());

		const file = URI.file(join('C:\\', '/foo/file44.txt'));
		const model4 = await service.create({ associatedResource: file }).resolve();
		assert.ok(service.hasAssociatedFilePath(model4.resource));
		assert.ok(model4.isDirty());

		model1.dispose();
		model2.dispose();
		model3.dispose();
		model4.dispose();
		input.dispose();
	});

	test('Untitled suggest name', function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		assert.ok(input.suggestFileName().length > 0);
		input.dispose();
	});

	test('Untitled with associated path remains dirty when content gets empty', async () => {
		const service = accessor.untitledTextEditorService;
		const file = URI.file(join('C:\\', '/foo/file.txt'));
		const input = service.create({ associatedResource: file });

		// dirty
		const model = await input.resolve();
		model.textEditorModel.setValue('foo bar');
		assert.ok(model.isDirty());
		model.textEditorModel.setValue('');
		assert.ok(model.isDirty());
		input.dispose();
		model.dispose();
	});

	test('Untitled with initial content is dirty', async () => {
		const service = accessor.untitledTextEditorService;
		const workingCopyService = accessor.workingCopyService;

		const untitled = service.create({ initialValue: 'Hello World' });
		assert.equal(untitled.isDirty(), true);

		let onDidChangeDirty: IWorkingCopy | undefined = undefined;
		const listener = workingCopyService.onDidChangeDirty(copy => {
			onDidChangeDirty = copy;
		});

		// dirty
		const model = await untitled.resolve();
		assert.ok(model.isDirty());
		assert.equal(workingCopyService.dirtyCount, 1);
		assert.equal(onDidChangeDirty, model);

		untitled.dispose();
		listener.dispose();
		model.dispose();
	});

	test('Untitled created with files.defaultLanguage setting', () => {
		const defaultLanguage = 'javascript';
		const config = accessor.testConfigurationService;
		config.setUserConfiguration('files', { 'defaultLanguage': defaultLanguage });

		const service = accessor.untitledTextEditorService;
		const input = service.create();

		assert.equal(input.getMode(), defaultLanguage);

		config.setUserConfiguration('files', { 'defaultLanguage': undefined });

		input.dispose();
	});

	test('Untitled created with files.defaultLanguage setting (${activeEditorLanguage})', () => {
		const config = accessor.testConfigurationService;
		config.setUserConfiguration('files', { 'defaultLanguage': '${activeEditorLanguage}' });

		accessor.editorService.activeTextEditorMode = 'typescript';

		const service = accessor.untitledTextEditorService;
		const input = service.create();

		assert.equal(input.getMode(), 'typescript');

		config.setUserConfiguration('files', { 'defaultLanguage': undefined });
		accessor.editorService.activeTextEditorMode = undefined;

		input.dispose();
	});

	test('Untitled created with mode overrides files.defaultLanguage setting', () => {
		const mode = 'typescript';
		const defaultLanguage = 'javascript';
		const config = accessor.testConfigurationService;
		config.setUserConfiguration('files', { 'defaultLanguage': defaultLanguage });

		const service = accessor.untitledTextEditorService;
		const input = service.create({ mode });

		assert.equal(input.getMode(), mode);

		config.setUserConfiguration('files', { 'defaultLanguage': undefined });

		input.dispose();
	});

	test('Untitled can change mode afterwards', async () => {
		const mode = 'untitled-input-test';

		ModesRegistry.registerLanguage({
			id: mode,
		});

		const service = accessor.untitledTextEditorService;
		const input = service.create({ mode });

		assert.equal(input.getMode(), mode);

		const model = await input.resolve();
		assert.equal(model.getMode(), mode);

		input.setMode('text');

		assert.equal(input.getMode(), PLAINTEXT_MODE_ID);

		input.dispose();
		model.dispose();
	});

	test('encoding change event', async () => {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		service.onDidChangeEncoding(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		// dirty
		const model = await input.resolve();
		model.setEncoding('utf16');
		assert.equal(counter, 1);
		input.dispose();
		model.dispose();
	});

	test('onDidChangeContent event', async function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		const model = await input.resolve();
		model.onDidChangeContent(() => counter++);

		model.textEditorModel.setValue('foo');

		assert.equal(counter, 1, 'Dirty model should trigger event');
		model.textEditorModel.setValue('bar');

		assert.equal(counter, 2, 'Content change when dirty should trigger event');
		model.textEditorModel.setValue('');

		assert.equal(counter, 3, 'Manual revert should trigger event');
		model.textEditorModel.setValue('foo');

		assert.equal(counter, 4, 'Dirty model should trigger event');

		input.dispose();
		model.dispose();
	});

	test('onDidChangeFirstLine event and input name', async function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		let model = await input.resolve();
		model.onDidChangeFirstLine(() => counter++);

		model.textEditorModel.setValue('foo');
		assert.equal(input.getName(), 'foo');

		assert.equal(counter, 1);
		model.textEditorModel.setValue('bar');
		assert.equal(input.getName(), 'bar');

		assert.equal(counter, 2);
		model.textEditorModel.setValue('');
		assert.equal(input.getName(), 'Untitled-1');

		assert.equal(counter, 3);

		model.textEditorModel.setValue('Hello\nWorld');
		assert.equal(counter, 4);

		function createSingleEditOp(text: string, positionLineNumber: number, positionColumn: number, selectionLineNumber: number = positionLineNumber, selectionColumn: number = positionColumn): IIdentifiedSingleEditOperation {
			let range = new Range(
				selectionLineNumber,
				selectionColumn,
				positionLineNumber,
				positionColumn
			);

			return {
				identifier: null,
				range,
				text,
				forceMoveMarkers: false
			};
		}

		model.textEditorModel.applyEdits([createSingleEditOp('hello', 2, 2)]);
		assert.equal(counter, 4); // change was not on first line

		input.dispose();
		model.dispose();

		const inputWithContents = service.create({ initialValue: 'Foo' });
		model = await inputWithContents.resolve();

		assert.equal(inputWithContents.getName(), 'Foo');

		inputWithContents.dispose();
		model.dispose();
	});

	test('onDidChangeDirty event', async function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		const model = await input.resolve();
		model.onDidChangeDirty(() => counter++);

		model.textEditorModel.setValue('foo');

		assert.equal(counter, 1, 'Dirty model should trigger event');
		model.textEditorModel.setValue('bar');

		assert.equal(counter, 1, 'Another change does not fire event');

		input.dispose();
		model.dispose();
	});

	test('onDidDisposeModel event', async () => {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		service.onDidDisposeModel(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		const model = await input.resolve();
		assert.equal(counter, 0);
		input.dispose();
		assert.equal(counter, 1);
		model.dispose();
	});
});
