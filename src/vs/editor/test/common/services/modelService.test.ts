/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CharCode } from 'vs/base/common/charCode';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { DefaultEndOfLine, ITextModel } from 'vs/editor/common/model';
import { createTextBuffer } from 'vs/editor/common/model/textModel';
import { ModelSemanticColoring, ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestColorTheme, TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { NullLogService } from 'vs/platform/log/common/log';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { DocumentSemanticTokensProvider, DocumentSemanticTokensProviderRegistry, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from 'vs/editor/common/modes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Barrier, timeout } from 'vs/base/common/async';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { TestTextResourcePropertiesService } from 'vs/editor/test/common/services/testTextResourcePropertiesService';

const GENERATE_TESTS = false;

suite('ModelService', () => {
	let modelService: ModelServiceImpl;

	setup(() => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'eol': '\n' });
		configService.setUserConfiguration('files', { 'eol': '\r\n' }, URI.file(platform.isWindows ? 'c:\\myroot' : '/myroot'));

		const dialogService = new TestDialogService();
		modelService = new ModelServiceImpl(configService, new TestTextResourcePropertiesService(configService), new TestThemeService(), new NullLogService(), new UndoRedoService(dialogService, new TestNotificationService()));
	});

	teardown(() => {
		modelService.dispose();
	});

	test('EOL setting respected depending on root', () => {
		const model1 = modelService.createModel('farboo', null);
		const model2 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\myroot\\myfile.txt' : '/myroot/myfile.txt'));
		const model3 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\other\\myfile.txt' : '/other/myfile.txt'));

		assert.strictEqual(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
		assert.strictEqual(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
		assert.strictEqual(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);
	});

	test('_computeEdits no change', function () {

		const model = createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textBuffer = createTextBuffer(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		).textBuffer;

		const actual = ModelServiceImpl._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, []);
	});

	test('_computeEdits first line changed', function () {

		const model = createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textBuffer = createTextBuffer(
			[
				'This is line One', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		).textBuffer;

		const actual = ModelServiceImpl._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, [
			EditOperation.replaceMove(new Range(1, 1, 2, 1), 'This is line One\n')
		]);
	});

	test('_computeEdits EOL changed', function () {

		const model = createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textBuffer = createTextBuffer(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		).textBuffer;

		const actual = ModelServiceImpl._computeEdits(model, textBuffer);

		assert.deepStrictEqual(actual, []);
	});

	test('_computeEdits EOL and other change 1', function () {

		const model = createTextModel(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n')
		);

		const textBuffer = createTextBuffer(
			[
				'This is line One', //16
				'and this is line number two', //27
				'It is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		).textBuffer;

		const actual = ModelServiceImpl._computeEdits(model, textBuffer);

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

		const model = createTextModel(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}'				// 3
			].join('\n')
		);

		const textBuffer = createTextBuffer(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}',			// 3
				''
			].join('\r\n'),
			DefaultEndOfLine.LF
		).textBuffer;

		const actual = ModelServiceImpl._computeEdits(model, textBuffer);

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
	});

	test('setValue should clear undo stack', () => {
		const resource = URI.parse('file://test.txt');

		const model = modelService.createModel('text', null, resource);
		model.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
		assert.strictEqual(model.getValue(), 'text1');

		model.setValue('text2');
		model.undo();
		assert.strictEqual(model.getValue(), 'text2');
	});
});

suite('ModelSemanticColoring', () => {

	const disposables = new DisposableStore();
	const ORIGINAL_FETCH_DOCUMENT_SEMANTIC_TOKENS_DELAY = ModelSemanticColoring.FETCH_DOCUMENT_SEMANTIC_TOKENS_DELAY;
	let modelService: IModelService;
	let modeService: IModeService;

	setup(() => {
		ModelSemanticColoring.FETCH_DOCUMENT_SEMANTIC_TOKENS_DELAY = 0;

		const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
		const themeService = new TestThemeService();
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
		modelService = disposables.add(new ModelServiceImpl(
			configService,
			new TestTextResourcePropertiesService(configService),
			themeService,
			new NullLogService(),
			new UndoRedoService(new TestDialogService(), new TestNotificationService())
		));
		modeService = disposables.add(new ModeServiceImpl(false));
	});

	teardown(() => {
		disposables.clear();
		ModelSemanticColoring.FETCH_DOCUMENT_SEMANTIC_TOKENS_DELAY = ORIGINAL_FETCH_DOCUMENT_SEMANTIC_TOKENS_DELAY;
	});

	test('DocumentSemanticTokens should be fetched when the result is empty if there are pending changes', async () => {

		disposables.add(ModesRegistry.registerLanguage({ id: 'testMode' }));

		const inFirstCall = new Barrier();
		const delayFirstResult = new Barrier();
		const secondResultProvided = new Barrier();
		let callCount = 0;

		disposables.add(DocumentSemanticTokensProviderRegistry.register('testMode', new class implements DocumentSemanticTokensProvider {
			getLegend(): SemanticTokensLegend {
				return { tokenTypes: ['class'], tokenModifiers: [] };
			}
			async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
				callCount++;
				if (callCount === 1) {
					assert.ok('called once');
					inFirstCall.open();
					await delayFirstResult.wait();
					await timeout(0); // wait for the simple scheduler to fire to check that we do actually get rescheduled
					return null;
				}
				if (callCount === 2) {
					assert.ok('called twice');
					secondResultProvided.open();
					return null;
				}
				assert.fail('Unexpected call');
			}
			releaseDocumentSemanticTokens(resultId: string | undefined): void {
			}
		}));

		const textModel = disposables.add(modelService.createModel('Hello world', modeService.create('testMode')));

		// wait for the provider to be called
		await inFirstCall.wait();

		// the provider is now in the provide call
		// change the text buffer while the provider is running
		textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'x' }]);

		// let the provider finish its first result
		delayFirstResult.open();

		// we need to check that the provider is called again, even if it returns null
		await secondResultProvided.wait();

		// assert that it got called twice
		assert.strictEqual(callCount, 2);
	});
});

function assertComputeEdits(lines1: string[], lines2: string[]): void {
	const model = createTextModel(lines1.join('\n'));
	const textBuffer = createTextBuffer(lines2.join('\n'), DefaultEndOfLine.LF).textBuffer;

	// compute required edits
	// let start = Date.now();
	const edits = ModelServiceImpl._computeEdits(model, textBuffer);
	// console.log(`took ${Date.now() - start} ms.`);

	// apply edits
	model.pushEditOperations([], edits, null);

	assert.strictEqual(model.getValue(), lines2.join('\n'));
}

function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomString(minLength: number, maxLength: number): string {
	let length = getRandomInt(minLength, maxLength);
	let t = createStringBuilder(length);
	for (let i = 0; i < length; i++) {
		t.appendASCII(getRandomInt(CharCode.a, CharCode.z));
	}
	return t.build();
}

function generateFile(small: boolean): string[] {
	let lineCount = getRandomInt(1, small ? 3 : 10000);
	let lines: string[] = [];
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
