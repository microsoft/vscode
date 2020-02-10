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
import { workbenchInstantiationService, TestEditorService } from 'vs/workbench/test/browser/workbenchTestServices';
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

suite('Untitled text editors', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		(accessor.untitledTextEditorService as UntitledTextEditorService).dispose();
	});

	test('basics', async () => {
		const service = accessor.untitledTextEditorService;
		const workingCopyService = accessor.workingCopyService;

		const input1 = service.create();
		await input1.resolve();
		assert.equal(input1, service.create({ untitledResource: input1.getResource() }));
		assert.equal(service.get(input1.getResource()), input1.model);

		assert.ok(service.get(input1.getResource()));
		assert.ok(!service.get(URI.file('testing')));

		const input2 = service.create();
		assert.equal(service.get(input2.getResource()), input2.model);

		// get()
		assert.equal(service.get(input1.getResource()), input1.model);
		assert.equal(service.get(input2.getResource()), input2.model);

		// revert()
		await input1.revert(0);
		assert.ok(input1.isDisposed());
		assert.ok(!service.get(input1.getResource()));

		// dirty
		const model = await input2.resolve();
		assert.equal(await service.resolve({ untitledResource: input2.getResource() }), model);
		assert.ok(service.get(model.resource));

		assert.ok(!input2.isDirty());

		const resourcePromise = awaitDidChangeDirty(accessor.untitledTextEditorService);

		model.textEditorModel.setValue('foo bar');

		const resource = await resourcePromise;

		assert.equal(resource.toString(), input2.getResource().toString());

		assert.ok(input2.isDirty());

		assert.ok(workingCopyService.isDirty(input2.getResource()));
		assert.equal(workingCopyService.dirtyCount, 1);

		await input1.revert(0);
		await input2.revert(0);
		assert.ok(!service.get(input1.getResource()));
		assert.ok(!service.get(input2.getResource()));
		assert.ok(!input2.isDirty());
		assert.ok(!model.isDirty());

		assert.ok(!workingCopyService.isDirty(input2.getResource()));
		assert.equal(workingCopyService.dirtyCount, 0);

		assert.equal(await input1.revert(0), false);
		assert.ok(input1.isDisposed());
		assert.ok(!service.get(input1.getResource()));

		input2.dispose();
		assert.ok(!service.get(input2.getResource()));
	});

	function awaitDidChangeDirty(service: IUntitledTextEditorService): Promise<URI> {
		return new Promise(c => {
			const listener = service.onDidChangeDirty(async resource => {
				listener.dispose();

				c(resource);
			});
		});
	}

	test('setValue()', async () => {
		const service = accessor.untitledTextEditorService;
		const untitled = service.create();

		const model = await untitled.resolve();

		model.setValue('not dirty', true);
		assert.ok(!model.isDirty());

		model.setValue('dirty');
		assert.ok(model.isDirty());

		untitled.dispose();
		model.dispose();
	});

	test('associated resource is dirty', () => {
		const service = accessor.untitledTextEditorService;
		const file = URI.file(join('C:\\', '/foo/file.txt'));
		const untitled = service.create({ associatedResource: file });

		assert.ok(untitled.hasAssociatedFilePath);
		assert.equal(untitled.isDirty(), true);

		untitled.dispose();
	});

	test('no longer dirty when content gets empty (not with associated resource)', async () => {
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

	test('via create options', async () => {
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
		assert.ok(model4.hasAssociatedFilePath);
		assert.ok(model4.isDirty());

		model1.dispose();
		model2.dispose();
		model3.dispose();
		model4.dispose();
		input.dispose();
	});

	test('associated path remains dirty when content gets empty', async () => {
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

	test('initial content is dirty', async () => {
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

	test('created with files.defaultLanguage setting', () => {
		const defaultLanguage = 'javascript';
		const config = accessor.testConfigurationService;
		config.setUserConfiguration('files', { 'defaultLanguage': defaultLanguage });

		const service = accessor.untitledTextEditorService;
		const input = service.create();

		assert.equal(input.getMode(), defaultLanguage);

		config.setUserConfiguration('files', { 'defaultLanguage': undefined });

		input.dispose();
	});

	test('created with files.defaultLanguage setting (${activeEditorLanguage})', () => {
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

	test('created with mode overrides files.defaultLanguage setting', () => {
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

	test('can change mode afterwards', async () => {
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

	test('service#onDidChangeEncoding', async () => {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		service.onDidChangeEncoding(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		// encoding
		const model = await input.resolve();
		model.setEncoding('utf16');
		assert.equal(counter, 1);
		input.dispose();
		model.dispose();
	});

	test('service#onDidChangeLabel', async () => {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		service.onDidChangeLabel(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		// label
		const model = await input.resolve();
		model.textEditorModel.setValue('Foo Bar');
		assert.equal(counter, 1);
		input.dispose();
		model.dispose();
	});

	test('service#onDidDisposeModel', async () => {
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

	test('model#onDidChangeContent', async function () {
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

	test('model#onDispose when reverted', async function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		const model = await input.resolve();
		model.onDispose(() => counter++);

		model.textEditorModel.setValue('foo');

		await model.revert();

		assert.ok(input.isDisposed());
		assert.ok(counter > 1);
	});

	test('model#onDidChangeName and input name', async function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		let model = await input.resolve();
		model.onDidChangeName(() => counter++);

		model.textEditorModel.setValue('foo');
		assert.equal(input.getName(), 'foo');
		assert.equal(model.name, 'foo');

		assert.equal(counter, 1);
		model.textEditorModel.setValue('bar');
		assert.equal(input.getName(), 'bar');
		assert.equal(model.name, 'bar');

		assert.equal(counter, 2);
		model.textEditorModel.setValue('');
		assert.equal(input.getName(), 'Untitled-1');
		assert.equal(model.name, 'Untitled-1');

		model.textEditorModel.setValue('        ');
		assert.equal(input.getName(), 'Untitled-1');
		assert.equal(model.name, 'Untitled-1');

		model.textEditorModel.setValue('([]}'); // require actual words
		assert.equal(input.getName(), 'Untitled-1');
		assert.equal(model.name, 'Untitled-1');

		model.textEditorModel.setValue('([]}hello   '); // require actual words
		assert.equal(input.getName(), '([]}hello');
		assert.equal(model.name, '([]}hello');

		assert.equal(counter, 4);

		model.textEditorModel.setValue('Hello\nWorld');
		assert.equal(counter, 5);

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
		assert.equal(counter, 5); // change was not on first line

		input.dispose();
		model.dispose();

		const inputWithContents = service.create({ initialValue: 'Foo' });
		model = await inputWithContents.resolve();

		assert.equal(inputWithContents.getName(), 'Foo');

		inputWithContents.dispose();
		model.dispose();
	});

	test('model#onDidChangeDirty', async function () {
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

	test('model#onDidChangeEncoding', async function () {
		const service = accessor.untitledTextEditorService;
		const input = service.create();

		let counter = 0;

		const model = await input.resolve();
		model.onDidChangeEncoding(() => counter++);

		model.setEncoding('utf16');

		assert.equal(counter, 1, 'Dirty model should trigger event');
		model.setEncoding('utf16');

		assert.equal(counter, 1, 'Another change to same encoding does not fire event');

		input.dispose();
		model.dispose();
	});
});
