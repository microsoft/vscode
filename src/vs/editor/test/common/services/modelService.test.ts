/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CharCode } from 'vs/base/common/charCode';
import { Emitter, Event } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { DefaultEndOfLine, ITextModel } from 'vs/editor/common/model';
import { createTextBuffer } from 'vs/editor/common/model/textModel';
import { ModelService } from 'vs/editor/common/services/modelService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestColorTheme, TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { NullLogService } from 'vs/platform/log/common/log';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { createModelServices, createTextModel } from 'vs/editor/test/common/testTextModel';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { DocumentSemanticTokensProvider, SemanticTokens, SemanticTokensEdits, SemanticTokensLegend } from 'vs/editor/common/languages';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Barrier, timeout } from 'vs/base/common/async';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { TestTextResourcePropertiesService } from 'vs/editor/test/common/services/testTextResourcePropertiesService';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { getDocumentSemanticTokens, isSemanticTokens } from 'vs/editor/common/services/getSemanticTokens';
import { LanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

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

	test('EOL setting respected depending on root', () => {
		const model1 = modelService.createModel('farboo', null);
		const model2 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\myroot\\myfile.txt' : '/myroot/myfile.txt'));
		const model3 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\other\\myfile.txt' : '/other/myfile.txt'));

		assert.strictEqual(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
		assert.strictEqual(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
		assert.strictEqual(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);
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

		const textBuffer = createTextBuffer(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		).textBuffer;

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

		const textBuffer = createTextBuffer(
			[
				'This is line One', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\n'),
			DefaultEndOfLine.LF
		).textBuffer;

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

		const textBuffer = createTextBuffer(
			[
				'This is line one', //16
				'and this is line number two', //27
				'it is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		).textBuffer;

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

		const textBuffer = createTextBuffer(
			[
				'This is line One', //16
				'and this is line number two', //27
				'It is followed by #3', //20
				'and finished with the fourth.', //29
			].join('\r\n'),
			DefaultEndOfLine.LF
		).textBuffer;

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

		const textBuffer = createTextBuffer(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}',			// 3
				''
			].join('\r\n'),
			DefaultEndOfLine.LF
		).textBuffer;

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

suite('ModelSemanticColoring', () => {

	const disposables = new DisposableStore();
	let modelService: IModelService;
	let languageService: ILanguageService;
	let languageFeaturesService: ILanguageFeaturesService;

	setup(() => {
		const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
		const themeService = new TestThemeService();
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
		const logService = new NullLogService();
		languageFeaturesService = new LanguageFeaturesService();
		modelService = disposables.add(new ModelService(
			configService,
			new TestTextResourcePropertiesService(configService),
			themeService,
			logService,
			new UndoRedoService(new TestDialogService(), new TestNotificationService()),
			disposables.add(new LanguageService()),
			new TestLanguageConfigurationService(),
			new LanguageFeatureDebounceService(logService),
			languageFeaturesService
		));
		languageService = disposables.add(new LanguageService(false));
	});

	teardown(() => {
		disposables.clear();
	});

	test('DocumentSemanticTokens should be fetched when the result is empty if there are pending changes', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const inFirstCall = new Barrier();
			const delayFirstResult = new Barrier();
			const secondResultProvided = new Barrier();
			let callCount = 0;

			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
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

			const textModel = disposables.add(modelService.createModel('Hello world', languageService.createById('testMode')));

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

	test('issue #149412: VS Code hangs when bad semantic token data is received', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			let lastResult: SemanticTokens | SemanticTokensEdits | null = null;

			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					if (!lastResultId) {
						// this is the first call
						lastResult = {
							resultId: '1',
							data: new Uint32Array([4294967293, 0, 7, 16, 0, 1, 4, 3, 11, 1])
						};
					} else {
						// this is the second call
						lastResult = {
							resultId: '2',
							edits: [{
								start: 4294967276,
								deleteCount: 0,
								data: new Uint32Array([2, 0, 3, 11, 0])
							}]
						};
					}
					return lastResult;
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			const textModel = disposables.add(modelService.createModel('', languageService.createById('testMode')));

			// wait for the semantic tokens to be fetched
			await Event.toPromise(textModel.onDidChangeTokens);
			assert.strictEqual(lastResult!.resultId, '1');

			// edit the text
			textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'foo' }]);

			// wait for the semantic tokens to be fetched again
			await Event.toPromise(textModel.onDidChangeTokens);
			assert.strictEqual(lastResult!.resultId, '2');
		});
	});

	test('issue #161573: onDidChangeSemanticTokens doesn\'t consistently trigger provideDocumentSemanticTokens', async () => {
		await runWithFakedTimers({}, async () => {

			disposables.add(languageService.registerLanguage({ id: 'testMode' }));

			const emitter = new Emitter<void>();
			let requestCount = 0;
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode', new class implements DocumentSemanticTokensProvider {
				onDidChange = emitter.event;
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					requestCount++;
					if (requestCount === 1) {
						await timeout(1000);
						// send a change event
						emitter.fire();
						await timeout(1000);
						return null;
					}
					return null;
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			disposables.add(modelService.createModel('', languageService.createById('testMode')));

			await timeout(5000);
			assert.deepStrictEqual(requestCount, 2);
		});
	});

	test('DocumentSemanticTokens should be pick the token provider with actual items', async () => {
		await runWithFakedTimers({}, async () => {

			let callCount = 0;
			disposables.add(languageService.registerLanguage({ id: 'testMode2' }));
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode2', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class1'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					callCount++;
					// For a secondary request return a different value
					if (lastResultId) {
						return {
							data: new Uint32Array([2, 1, 1, 1, 1, 0, 2, 1, 1, 1])
						};
					}
					return {
						resultId: '1',
						data: new Uint32Array([0, 1, 1, 1, 1, 0, 2, 1, 1, 1])
					};
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));
			disposables.add(languageFeaturesService.documentSemanticTokensProvider.register('testMode2', new class implements DocumentSemanticTokensProvider {
				getLegend(): SemanticTokensLegend {
					return { tokenTypes: ['class2'], tokenModifiers: [] };
				}
				async provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): Promise<SemanticTokens | SemanticTokensEdits | null> {
					callCount++;
					return null;
				}
				releaseDocumentSemanticTokens(resultId: string | undefined): void {
				}
			}));

			function toArr(arr: Uint32Array): number[] {
				const result: number[] = [];
				for (let i = 0; i < arr.length; i++) {
					result[i] = arr[i];
				}
				return result;
			}

			const textModel = modelService.createModel('Hello world 2', languageService.createById('testMode2'));
			try {
				let result = await getDocumentSemanticTokens(languageFeaturesService.documentSemanticTokensProvider, textModel, null, null, CancellationToken.None);
				assert.ok(result, `We should have tokens (1)`);
				assert.ok(result.tokens, `Tokens are found from multiple providers (1)`);
				assert.ok(isSemanticTokens(result.tokens), `Tokens are full (1)`);
				assert.ok(result.tokens.resultId, `Token result id found from multiple providers (1)`);
				assert.deepStrictEqual(toArr(result.tokens.data), [0, 1, 1, 1, 1, 0, 2, 1, 1, 1], `Token data returned for multiple providers (1)`);
				assert.deepStrictEqual(callCount, 2, `Called both token providers (1)`);
				assert.deepStrictEqual(result.provider.getLegend(), { tokenTypes: ['class1'], tokenModifiers: [] }, `Legend matches the tokens (1)`);

				// Make a second request. Make sure we get the secondary value
				result = await getDocumentSemanticTokens(languageFeaturesService.documentSemanticTokensProvider, textModel, result.provider, result.tokens.resultId, CancellationToken.None);
				assert.ok(result, `We should have tokens (2)`);
				assert.ok(result.tokens, `Tokens are found from multiple providers (2)`);
				assert.ok(isSemanticTokens(result.tokens), `Tokens are full (2)`);
				assert.ok(!result.tokens.resultId, `Token result id found from multiple providers (2)`);
				assert.deepStrictEqual(toArr(result.tokens.data), [2, 1, 1, 1, 1, 0, 2, 1, 1, 1], `Token data returned for multiple providers (2)`);
				assert.deepStrictEqual(callCount, 4, `Called both token providers (2)`);
				assert.deepStrictEqual(result.provider.getLegend(), { tokenTypes: ['class1'], tokenModifiers: [] }, `Legend matches the tokens (2)`);
			} finally {
				disposables.clear();

				// Wait for scheduler to finish
				await timeout(0);

				// Now dispose the text model
				textModel.dispose();
			}
		});
	});
});

function assertComputeEdits(lines1: string[], lines2: string[]): void {
	const model = createTextModel(lines1.join('\n'));
	const textBuffer = createTextBuffer(lines2.join('\n'), DefaultEndOfLine.LF).textBuffer;

	// compute required edits
	// let start = Date.now();
	const edits = ModelService._computeEdits(model, textBuffer);
	// console.log(`took ${Date.now() - start} ms.`);

	// apply edits
	model.pushEditOperations([], edits, null);

	assert.strictEqual(model.getValue(), lines2.join('\n'));
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
