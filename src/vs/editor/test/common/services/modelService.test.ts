/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CharCode } from '../../../../base/common/charCode.js';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { DefaultEndOfLine, ITextBuffer, ITextBufferFactory, ITextSnapshot } from '../../../common/model.js';
import { createTextBuffer } from '../../../common/model/textModel.js';
import { ModelService } from '../../../common/services/modelService.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { createModelServices, createTextModel } from '../testTextModel.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IModelService } from '../../../common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

const GENERATE_TESTS = false;

suite('ModelService', () => {
	let disposables: DisposableStore;
	let modelService: IModelService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = new DisposableStore();

		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'eol': '\n' });
		configService.setUserConfiguration('files', { 'eol': '\r\n' }, URI.file(platform.isWindows ? 'c:\\myroot' : '/myroot'));

		instantiationService = createModelServices(disposables, [
			[IConfigurationService, configService]
		]);
		modelService = instantiationService.get(IModelService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('EOL setting respected depending on root', () => {
		const model1 = modelService.createModel('farboo', null);
		const model2 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\myroot\\myfile.txt' : '/myroot/myfile.txt'));
		const model3 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\other\\myfile.txt' : '/other/myfile.txt'));

		assert.strictEqual(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
		assert.strictEqual(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
		assert.strictEqual(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);

		model1.dispose();
		model2.dispose();
		model3.dispose();
	});

	test('_computeEdits no change', function () {

		const model = disposables.add(createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		));

		const textBuffer = createAndRegisterTextBuffer(
			disposables,
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelService._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, []);
	});

	test('_computeEdits first line changed', function () {

		const model = disposables.add(createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		));

		const textBuffer = createAndRegisterTextBuffer(
			disposables,
			[
				'This is line One', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelService._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, [
			EditOperation.replaceMove(new Range(1, 1, 2, 1), 'This is line One\n')
		]);
	});

	test('_computeEdits EOL changed', function () {

		const model = disposables.add(createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		));

		const textBuffer = createAndRegisterTextBuffer(
			disposables,
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelService._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, []);
	});

	test('_computeEdits EOL and other change 1', function () {

		const model = disposables.add(createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		));

		const textBuffer = createAndRegisterTextBuffer(
			disposables,
			[
				'This is line One', //16
				'and this is line number two', //27
				'It is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelService._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, [
			EditOperation.replaceMove(
				new Range(1, 1, 4, 1),
				[
					'This is line One',
					'and this is line number two',
					'It is followed by #3',
					''
				].join('\r\n')
			)
		]);
	});

	test('_computeEdits EOL and other change 2', function () {

		const model = disposables.add(createTextModel(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}'				// 3
			].join('\n')
		));

		const textBuffer = createAndRegisterTextBuffer(
			disposables,
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}',			// 3
				''
			].join('\r\n'),
			DefaultEndOfLine.LF
		);

		const actual = ModelService._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, [
			EditOperation.replaceMove(new Range(3, 2, 3, 2), '\r\n')
		]);
	});

	test('generated1', () => {
		const file1 = ['pram', 'okctibad', 'pjuwtemued', 'knnnm', 'u', ''];
		const file2 = ['tcnr', 'rxwlicro', 'vnzy', '', '', 'pjzcogzur', 'ptmxyp', 'dfyshia', 'pee', 'ygg'];
		assertComputeEdits(file1, file2);
	});

	test('generated2', () => {
		const file1 = ['', 'itls', 'hrilyhesv', ''];
		const file2 = ['vdl', '', 'tchgz', 'bhx', 'nyl'];
		assertComputeEdits(file1, file2);
	});

	test('generated3', () => {
		const file1 = ['ubrbrcv', 'wv', 'xodspybszt', 's', 'wednjxm', 'fklajt', 'fyfc', 'lvejgge', 'rtpjlodmmk', 'arivtgmjdm'];
		const file2 = ['s', 'qj', 'tu', 'ur', 'qerhjjhyvx', 't'];
		assertComputeEdits(file1, file2);
	});

	test('generated4', () => {
		const file1 = ['ig', 'kh', 'hxegci', 'smvker', 'pkdmjjdqnv', 'vgkkqqx', '', 'jrzeb'];
		const file2 = ['yk', ''];
		assertComputeEdits(file1, file2);
	});

	test('does insertions in the middle of the document', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 2',
			'line 5',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does insertions at the end of the document', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 2',
			'line 3',
			'line 4'
		];
		assertComputeEdits(file1, file2);
	});

	test('does insertions at the beginning of the document', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 0',
			'line 1',
			'line 2',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does replacements', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 7',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does deletions', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3'
		];
		const file2 = [
			'line 1',
			'line 3'
		];
		assertComputeEdits(file1, file2);
	});

	test('does insert, replace, and delete', () => {
		const file1 = [
			'line 1',
			'line 2',
			'line 3',
			'line 4',
			'line 5',
		];
		const file2 = [
			'line 0', // insert line 0
			'line 1',
			'replace line 2', // replace line 2
			'line 3',
			// delete line 4
			'line 5',
		];
		assertComputeEdits(file1, file2);
	});

	test('maintains undo for same resource and same content', () => {
		const resource = URI.parse('file://test.txt');

		// create a model
		const model1 = modelService.createModel('text', null, resource);
		// make an edit
		model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
		assert.strictEqual(model1.getValue(), 'text1');
		// dispose it
		modelService.destroyModel(resource);

		// create a new model with the same content
		const model2 = modelService.createModel('text1', null, resource);
		// undo
		model2.undo();
		assert.strictEqual(model2.getValue(), 'text');
		// dispose it
		modelService.destroyModel(resource);
	});

	test('maintains version id and alternative version id for same resource and same content', () => {
		const resource = URI.parse('file://test.txt');

		// create a model
		const model1 = modelService.createModel('text', null, resource);
		// make an edit
		model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
		assert.strictEqual(model1.getValue(), 'text1');
		const versionId = model1.getVersionId();
		const alternativeVersionId = model1.getAlternativeVersionId();
		// dispose it
		modelService.destroyModel(resource);

		// create a new model with the same content
		const model2 = modelService.createModel('text1', null, resource);
		assert.strictEqual(model2.getVersionId(), versionId);
		assert.strictEqual(model2.getAlternativeVersionId(), alternativeVersionId);
		// dispose it
		modelService.destroyModel(resource);
	});

	test('does not maintain undo for same resource and different content', () => {
		const resource = URI.parse('file://test.txt');

		// create a model
		const model1 = modelService.createModel('text', null, resource);
		// make an edit
		model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
		assert.strictEqual(model1.getValue(), 'text1');
		// dispose it
		modelService.destroyModel(resource);

		// create a new model with the same content
		const model2 = modelService.createModel('text2', null, resource);
		// undo
		model2.undo();
		assert.strictEqual(model2.getValue(), 'text2');
		// dispose it
		modelService.destroyModel(resource);
	});

	test('setValue should clear undo stack', () => {
		const resource = URI.parse('file://test.txt');

		const model = modelService.createModel('text', null, resource);
		model.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
		assert.strictEqual(model.getValue(), 'text1');

		model.setValue('text2');
		model.undo();
		assert.strictEqual(model.getValue(), 'text2');
		// dispose it
		modelService.destroyModel(resource);
	});
});

function assertComputeEdits(lines1: string[], lines2: string[]): void {
	const model = createTextModel(lines1.join('\n'));
	const { disposable, textBuffer } = createTextBuffer(lines2.join('\n'), DefaultEndOfLine.LF);

	// compute required edits
	// let start = Date.now();
	const edits = ModelService._computeEdits(model, textBuffer);
	// console.log(`took ${Date.now() - start} ms.`);

	// apply edits
	model.pushEditOperations([], edits, null);

	assert.strictEqual(model.getValue(), lines2.join('\n'));
	disposable.dispose();
	model.dispose();
}

function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomString(minLength: number, maxLength: number): string {
	const length = getRandomInt(minLength, maxLength);
	const t = new StringBuilder(length);
	for (let i = 0; i < length; i++) {
		t.appendASCIICharCode(getRandomInt(CharCode.a, CharCode.z));
	}
	return t.build();
}

function generateFile(small: boolean): string[] {
	const lineCount = getRandomInt(1, small ? 3 : 10000);
	const lines: string[] = [];
	for (let i = 0; i < lineCount; i++) {
		lines.push(getRandomString(0, small ? 3 : 10000));
	}
	return lines;
}

if (GENERATE_TESTS) {
	let number = 1;
	while (true) {

		console.log('------TEST: ' + number++);

		const file1 = generateFile(true);
		const file2 = generateFile(true);

		console.log('------TEST GENERATED');

		try {
			assertComputeEdits(file1, file2);
		} catch (err) {
			console.log(err);
			console.log(`
const file1 = ${JSON.stringify(file1).replace(/"/g, '\'')};
const file2 = ${JSON.stringify(file2).replace(/"/g, '\'')};
assertComputeEdits(file1, file2);
`);
			break;
		}
	}
}

function createAndRegisterTextBuffer(store: DisposableStore, value: string | ITextBufferFactory | ITextSnapshot, defaultEOL: DefaultEndOfLine): ITextBuffer {
	const { disposable, textBuffer } = createTextBuffer(value, defaultEOL);
	store.add(disposable);
	return textBuffer;
}
