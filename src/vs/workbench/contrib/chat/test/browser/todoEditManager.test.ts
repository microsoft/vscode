/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TodoEditManager } from '../../browser/todoEditManager.js';
import { IChatTodo } from '../../common/chatTodoListService.js';

suite('TodoEditManager', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let editManager: TodoEditManager;

	const sampleTodo: IChatTodo = {
		id: 1,
		title: 'Test todo',
		description: 'Test description',
		status: 'not-started'
	};

	setup(() => {
		editManager = store.add(new TodoEditManager(500)); // Short delay for tests
	});

	test('startEdit creates a new edit session', () => {
		const session = editManager.startEdit(sampleTodo, 'title');

		assert.strictEqual(session.todoId, sampleTodo.id);
		assert.strictEqual(session.field, 'title');
		assert.strictEqual(session.originalValue, sampleTodo.title);
		assert.strictEqual(session.currentValue, sampleTodo.title);
		assert.strictEqual(session.isModified, false);
	});

	test('startEdit returns existing session if already editing', () => {
		const session1 = editManager.startEdit(sampleTodo, 'title');
		const session2 = editManager.startEdit(sampleTodo, 'title');

		assert.strictEqual(session1, session2);
	});

	test('isEditing returns true for active session', () => {
		assert.strictEqual(editManager.isEditing(sampleTodo.id, 'title'), false);

		editManager.startEdit(sampleTodo, 'title');

		assert.strictEqual(editManager.isEditing(sampleTodo.id, 'title'), true);
	});

	test('updateEditValue updates the current value', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.updateEditValue(sampleTodo.id, 'title', 'New title');

		const session = editManager.getEditSession(sampleTodo.id, 'title');
		assert.strictEqual(session?.currentValue, 'New title');
		assert.strictEqual(session?.isModified, true);
	});

	test('updateEditValue marks session as modified when value changes', () => {
		editManager.startEdit(sampleTodo, 'title');
		
		let session = editManager.getEditSession(sampleTodo.id, 'title');
		assert.strictEqual(session?.isModified, false);

		editManager.updateEditValue(sampleTodo.id, 'title', 'Changed title');
		
		session = editManager.getEditSession(sampleTodo.id, 'title');
		assert.strictEqual(session?.isModified, true);
	});

	test('validateEdit returns valid for correct title', () => {
		const result = editManager.validateEdit('title', 'Valid title');

		assert.strictEqual(result.isValid, true);
		assert.strictEqual(result.errorMessage, undefined);
	});

	test('validateEdit returns invalid for empty title', () => {
		const result = editManager.validateEdit('title', '   ');

		assert.strictEqual(result.isValid, false);
		assert.ok(result.errorMessage?.includes('empty'));
	});

	test('validateEdit returns invalid for title exceeding 200 characters', () => {
		const longTitle = 'a'.repeat(201);
		const result = editManager.validateEdit('title', longTitle);

		assert.strictEqual(result.isValid, false);
		assert.ok(result.errorMessage?.includes('200'));
	});

	test('validateEdit returns invalid for description exceeding 500 characters', () => {
		const longDescription = 'a'.repeat(501);
		const result = editManager.validateEdit('description', longDescription);

		assert.strictEqual(result.isValid, false);
		assert.ok(result.errorMessage?.includes('500'));
	});

	test('validateEdit allows empty description', () => {
		const result = editManager.validateEdit('description', '');

		assert.strictEqual(result.isValid, true);
	});

	test('saveEdit returns the trimmed new value', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.updateEditValue(sampleTodo.id, 'title', '  New title  ');

		const newValue = editManager.saveEdit(sampleTodo.id, 'title');

		assert.strictEqual(newValue, 'New title');
	});

	test('saveEdit removes the edit session', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.saveEdit(sampleTodo.id, 'title');

		assert.strictEqual(editManager.isEditing(sampleTodo.id, 'title'), false);
	});

	test('cancelEdit removes the edit session', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.cancelEdit(sampleTodo, 'title');

		assert.strictEqual(editManager.isEditing(sampleTodo.id, 'title'), false);
	});

	test('handleConflict accepts AI update when user has not modified', () => {
		editManager.startEdit(sampleTodo, 'title');

		const result = editManager.handleConflict(sampleTodo, 'title', 'AI updated title');

		assert.strictEqual(result, 'accept-ai');
		assert.strictEqual(editManager.isEditing(sampleTodo.id, 'title'), false);
	});

	test('handleConflict keeps edit when user has modified', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.updateEditValue(sampleTodo.id, 'title', 'User modified title');

		const result = editManager.handleConflict(sampleTodo, 'title', 'AI updated title');

		assert.strictEqual(result, 'keep-edit');
		assert.strictEqual(editManager.isEditing(sampleTodo.id, 'title'), true);
	});

	test('getActiveEditSessions returns all active sessions', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.startEdit({ ...sampleTodo, id: 2 }, 'description');

		const sessions = editManager.getActiveEditSessions();

		assert.strictEqual(sessions.length, 2);
	});

	test('cancelAllEdits removes all sessions', () => {
		editManager.startEdit(sampleTodo, 'title');
		editManager.startEdit({ ...sampleTodo, id: 2 }, 'description');

		editManager.cancelAllEdits();

		assert.strictEqual(editManager.getActiveEditSessions().length, 0);
	});

	test('onDidStartEdit event fires when edit starts', (done) => {
		editManager.onDidStartEdit(({ todo, field }) => {
			assert.strictEqual(todo.id, sampleTodo.id);
			assert.strictEqual(field, 'title');
			done();
		});

		editManager.startEdit(sampleTodo, 'title');
	});

	test('onDidCancelEdit event fires when edit is cancelled', (done) => {
		editManager.onDidCancelEdit(({ todo, field }) => {
			assert.strictEqual(todo.id, sampleTodo.id);
			assert.strictEqual(field, 'title');
			done();
		});

		editManager.startEdit(sampleTodo, 'title');
		editManager.cancelEdit(sampleTodo, 'title');
	});
});
