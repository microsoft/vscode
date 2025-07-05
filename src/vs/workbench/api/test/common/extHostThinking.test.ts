/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { LanguageModelThinkingPart } from '../../common/extHostTypes.js';

suite('LanguageModelThinkingPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should create thinking part with value only', () => {
		const part = new LanguageModelThinkingPart('This is my thinking...');
		assert.strictEqual(part.value, 'This is my thinking...');
		assert.strictEqual(part.id, undefined);
		assert.strictEqual(part.metadata, undefined);
	});

	test('should create thinking part with value and id', () => {
		const part = new LanguageModelThinkingPart('This is my thinking...', 'thinking-123');
		assert.strictEqual(part.value, 'This is my thinking...');
		assert.strictEqual(part.id, 'thinking-123');
		assert.strictEqual(part.metadata, undefined);
	});

	test('should create thinking part with all properties', () => {
		const part = new LanguageModelThinkingPart('This is my thinking...', 'thinking-123', 'step=1');
		assert.strictEqual(part.value, 'This is my thinking...');
		assert.strictEqual(part.id, 'thinking-123');
		assert.strictEqual(part.metadata, 'step=1');
	});

	test('should serialize to JSON correctly', () => {
		const part = new LanguageModelThinkingPart('This is my thinking...', 'thinking-123', 'step=1');
		const json = part.toJSON();

		assert.strictEqual(json.$mid, MarshalledId.LanguageModelThinkingPart);
		assert.strictEqual(json.value, 'This is my thinking...');
		assert.strictEqual(json.id, 'thinking-123');
		assert.strictEqual(json.metadata, 'step=1');
	});

	test('should serialize partial data correctly', () => {
		const part = new LanguageModelThinkingPart('This is my thinking...');
		const json = part.toJSON();

		assert.strictEqual(json.$mid, MarshalledId.LanguageModelThinkingPart);
		assert.strictEqual(json.value, 'This is my thinking...');
		assert.strictEqual(json.id, undefined);
		assert.strictEqual(json.metadata, undefined);
	});
});
