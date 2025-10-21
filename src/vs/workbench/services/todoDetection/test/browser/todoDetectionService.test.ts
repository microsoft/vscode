/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TodoDetectionService } from '../../browser/todoDetectionServiceImpl.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('TodoDetectionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let configService: TestConfigurationService;
	let languageConfigService: ILanguageConfigurationService;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = createModelServices(disposables);
		languageConfigService = instantiationService.get(ILanguageConfigurationService);

		configService = new TestConfigurationService({
			'chat.delegation.triggers': ['TODO', 'FIXME', 'BUG', 'HACK', 'NOTE', 'ISSUE'],
			'chat.delegation.caseSensitive': false
		});
	});

	test('Should detect TODO in JavaScript line comment', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// TODO: Implement this feature\nfunction test() {}', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect TODO comment');
		assert.strictEqual(todo?.text, 'TODO: Implement this feature');
		assert.strictEqual(todo?.trigger, 'TODO');
		assert.strictEqual(todo?.lineNumber, 1);
	});

	test('Should detect FIXME in JavaScript line comment', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// FIXME: Fix this bug\nfunction test() {}', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect FIXME comment');
		assert.strictEqual(todo?.text, 'FIXME: Fix this bug');
		assert.strictEqual(todo?.trigger, 'FIXME');
	});

	test('Should detect TODO in Python line comment', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '# TODO: Add error handling\ndef test():\n    pass', 'python', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect TODO in Python comment');
		assert.strictEqual(todo?.text, 'TODO: Add error handling');
		assert.strictEqual(todo?.trigger, 'TODO');
	});

	test('Should detect TODO in block comment', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '/* TODO: Refactor this code */\nfunction test() {}', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect TODO in block comment');
		assert.strictEqual(todo?.text, 'TODO: Refactor this code');
		assert.strictEqual(todo?.trigger, 'TODO');
	});

	test('Should not detect TODO in regular code', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, 'const todo = "not a comment";', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.strictEqual(todo, undefined, 'Should not detect TODO in non-comment code');
	});

	test('Should detect case-insensitive TODO by default', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// todo: lowercase todo\nfunction test() {}', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect lowercase TODO');
		assert.strictEqual(todo?.trigger, 'TODO');
	});

	test('Should detect all TODOs in file', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const code = `// TODO: First task
function test1() {}
// FIXME: Second task
function test2() {}
// BUG: Third task
function test3() {}`;
		const model = disposables.add(instantiateTextModel(instantiationService, code, 'javascript', undefined));

		const todos = service.detectAllTodos(model);
		assert.strictEqual(todos.length, 3, 'Should detect all 3 TODOs');
		assert.strictEqual(todos[0].trigger, 'TODO');
		assert.strictEqual(todos[1].trigger, 'FIXME');
		assert.strictEqual(todos[2].trigger, 'BUG');
	});

	test('Should check if line has TODO', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// TODO: Test\nfunction test() {}', 'javascript', undefined));

		assert.strictEqual(service.hasTodoAtLine(model, 1), true, 'Line 1 should have TODO');
		assert.strictEqual(service.hasTodoAtLine(model, 2), false, 'Line 2 should not have TODO');
	});

	test('Should handle invalid line numbers', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// TODO: Test', 'javascript', undefined));

		assert.strictEqual(service.detectTodoAtLine(model, 0), undefined, 'Should return undefined for line 0');
		assert.strictEqual(service.detectTodoAtLine(model, 999), undefined, 'Should return undefined for line beyond model');
	});

	test('Should detect TODO with colon separator', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// TODO: with colon', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect TODO with colon');
		assert.strictEqual(todo?.text, 'TODO: with colon');
	});

	test('Should detect TODO with space separator', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// TODO with space', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect TODO with space');
		assert.strictEqual(todo?.text, 'TODO with space');
	});

	test('Should detect NOTE trigger', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// NOTE: Important note', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect NOTE comment');
		assert.strictEqual(todo?.trigger, 'NOTE');
	});

	test('Should detect HACK trigger', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// HACK: Temporary workaround', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect HACK comment');
		assert.strictEqual(todo?.trigger, 'HACK');
	});

	test('Should detect ISSUE trigger', () => {
		const service = new TodoDetectionService(configService, languageConfigService);
		const model = disposables.add(instantiateTextModel(instantiationService, '// ISSUE: Known problem', 'javascript', undefined));

		const todo = service.detectTodoAtLine(model, 1);
		assert.ok(todo, 'Should detect ISSUE comment');
		assert.strictEqual(todo?.trigger, 'ISSUE');
	});
});
