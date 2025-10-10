/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TodoTitleValidator, MAX_TITLE_LENGTH, DEFAULT_TODO_TITLE } from '../../common/chatTodoTitleValidation.js';

suite('TodoTitleValidator', () => {
	
	suite('validation', () => {
		test('should accept valid title', () => {
			const result = TodoTitleValidator.validate('My Tasks');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'My Tasks');
		});

		test('should trim whitespace from title', () => {
			const result = TodoTitleValidator.validate('  My Tasks  ');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'My Tasks');
		});

		test('should reject empty string', () => {
			const result = TodoTitleValidator.validate('');
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.message, 'Title cannot be empty');
			assert.strictEqual(result.sanitizedValue, DEFAULT_TODO_TITLE);
		});

		test('should reject whitespace-only string', () => {
			const result = TodoTitleValidator.validate('   ');
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.message, 'Title cannot be empty');
			assert.strictEqual(result.sanitizedValue, DEFAULT_TODO_TITLE);
		});

		test('should reject title exceeding max length', () => {
			const longTitle = 'a'.repeat(MAX_TITLE_LENGTH + 1);
			const result = TodoTitleValidator.validate(longTitle);
			assert.strictEqual(result.valid, false);
			assert.ok(result.message?.includes('cannot exceed'));
			assert.strictEqual(result.sanitizedValue?.length, MAX_TITLE_LENGTH);
		});

		test('should accept title at max length', () => {
			const maxTitle = 'a'.repeat(MAX_TITLE_LENGTH);
			const result = TodoTitleValidator.validate(maxTitle);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue?.length, MAX_TITLE_LENGTH);
		});

		test('should accept unicode characters', () => {
			const result = TodoTitleValidator.validate('Tasks 日本語 🎉');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'Tasks 日本語 🎉');
		});

		test('should accept emoji', () => {
			const result = TodoTitleValidator.validate('📝 My Tasks 🚀');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, '📝 My Tasks 🚀');
		});

		test('should sanitize control characters', () => {
			const result = TodoTitleValidator.validate('My\x00Tasks\x1F');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'MyTasks');
		});

		test('should accept common punctuation', () => {
			const result = TodoTitleValidator.validate('Tasks: Sprint #1 (Q4)!');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'Tasks: Sprint #1 (Q4)!');
		});

		test('should handle mixed case titles', () => {
			const result = TodoTitleValidator.validate('MyTasks123');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'MyTasks123');
		});
	});

	suite('suggestions', () => {
		test('should return array of suggestions', () => {
			const suggestions = TodoTitleValidator.getSuggestions();
			assert.ok(Array.isArray(suggestions));
			assert.ok(suggestions.length > 0);
		});

		test('should include common task titles', () => {
			const suggestions = TodoTitleValidator.getSuggestions();
			assert.ok(suggestions.includes('My Tasks'));
			assert.ok(suggestions.includes('Sprint Goals'));
			assert.ok(suggestions.includes('Action Items'));
		});

		test('all suggestions should be valid', () => {
			const suggestions = TodoTitleValidator.getSuggestions();
			suggestions.forEach(suggestion => {
				const result = TodoTitleValidator.validate(suggestion);
				assert.strictEqual(result.valid, true, `Suggestion "${suggestion}" should be valid`);
			});
		});
	});

	suite('edge cases', () => {
		test('should handle single character', () => {
			const result = TodoTitleValidator.validate('a');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'a');
		});

		test('should handle special characters only', () => {
			const result = TodoTitleValidator.validate('!!!');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, '!!!');
		});

		test('should handle numbers only', () => {
			const result = TodoTitleValidator.validate('12345');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, '12345');
		});

		test('should handle title with newlines', () => {
			const result = TodoTitleValidator.validate('Line1\nLine2');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'Line1\nLine2');
		});

		test('should handle title with tabs', () => {
			const result = TodoTitleValidator.validate('Task\t1');
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedValue, 'Task\t1');
		});
	});
});
