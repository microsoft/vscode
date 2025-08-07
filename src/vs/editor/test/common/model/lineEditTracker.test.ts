/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Range } from '../../../common/core/range.js';
import { EditSources } from '../../../common/textModelEditSource.js';
import { LineEditSource } from '../../../common/lineEditSource.js';
import { createTextModel } from '../testTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('LineEditTracker', () => {
	test('should track human edits', () => {
		const model = createTextModel('');

		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'Hello\nWorld'
		}], null, undefined, EditSources.cursor({ kind: 'type' }));

		assert.strictEqual(model.getLineEditSource(1), LineEditSource.Human);
		assert.strictEqual(model.getLineEditSource(2), LineEditSource.Human);

		model.dispose();
	});

	test('should track AI edits', () => {
		const model = createTextModel('');

		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'Hello\nWorld'
		}], null, undefined, EditSources.inlineCompletionAccept({
			nes: false,
			requestUuid: '123',
			providerId: undefined
		}));

		assert.strictEqual(model.getLineEditSource(1), LineEditSource.AI);
		assert.strictEqual(model.getLineEditSource(2), LineEditSource.AI);

		model.dispose();
	});

	test('should track mixed edits', () => {
		const model = createTextModel('');

		// First AI edit
		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'Hello\nWorld'
		}], null, undefined, EditSources.inlineCompletionAccept({
			nes: false,
			requestUuid: '123',
			providerId: undefined
		}));

		// Then human edit on line 1
		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 6),
			text: 'Hi'
		}], null, undefined, EditSources.cursor({ kind: 'type' }));

		assert.strictEqual(model.getLineEditSource(1), LineEditSource.Human);
		assert.strictEqual(model.getLineEditSource(2), LineEditSource.AI);

		model.dispose();
	});

	test('should handle complete line deletions as Undetermined', () => {
		const model = createTextModel('');

		// Create 3 AI lines
		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'One\nTwo\nThree'
		}], null, undefined, EditSources.inlineCompletionAccept({
			nes: false,
			requestUuid: '123',
			providerId: undefined
		}));

		// Delete line 2 completely (from line 2 start to line 3 start)
		model.pushEditOperations(null, [{
			range: new Range(2, 1, 3, 1),
			text: ''
		}], null, undefined, EditSources.cursor({ kind: 'type' }));

		// Line 1 should still be AI, line 2 should be AI (was line 3), deleted line should be gone
		assert.strictEqual(model.getLineEditSource(1), LineEditSource.AI);
		assert.strictEqual(model.getLineEditSource(2), LineEditSource.AI);
		assert.strictEqual(model.getAllLineEditSources().size, 2);

		model.dispose();
	});

	test('should handle partial line deletions with deletion source', () => {
		const model = createTextModel('');

		// Create an AI line
		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'Hello World'
		}], null, undefined, EditSources.inlineCompletionAccept({
			nes: false,
			requestUuid: '123',
			providerId: undefined
		}));

		assert.strictEqual(model.getLineEditSource(1), LineEditSource.AI);

		// Human deletes part of the line (delete "World")
		model.pushEditOperations(null, [{
			range: new Range(1, 7, 1, 11),
			text: ''
		}], null, undefined, EditSources.cursor({ kind: 'type' }));

		// Line should now be marked as Human since a human deleted part of it
		assert.strictEqual(model.getLineEditSource(1), LineEditSource.Human);

		model.dispose();
	});

	test('should handle AI partial line deletions', () => {
		const model = createTextModel('');

		// Create a human line
		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'Hello World'
		}], null, undefined, EditSources.cursor({ kind: 'type' }));

		assert.strictEqual(model.getLineEditSource(1), LineEditSource.Human);

		// AI deletes part of the line
		model.pushEditOperations(null, [{
			range: new Range(1, 7, 1, 11),
			text: ''
		}], null, undefined, EditSources.inlineCompletionAccept({
			nes: false,
			requestUuid: '456',
			providerId: undefined
		}));

		// Line should now be marked as AI since AI deleted part of it
		assert.strictEqual(model.getLineEditSource(1), LineEditSource.AI);

		model.dispose();
	});

	test('should handle line insertions', () => {
		const model = createTextModel('');

		// Create 2 AI lines
		model.pushEditOperations(null, [{
			range: new Range(1, 1, 1, 1),
			text: 'One\nTwo'
		}], null, undefined, EditSources.inlineCompletionAccept({
			nes: false,
			requestUuid: '123',
			providerId: undefined
		}));

		// Insert a human line between them
		model.pushEditOperations(null, [{
			range: new Range(2, 1, 2, 1),
			text: 'Middle\n'
		}], null, undefined, EditSources.cursor({ kind: 'type' }));

		assert.strictEqual(model.getLineEditSource(1), LineEditSource.AI);
		assert.strictEqual(model.getLineEditSource(2), LineEditSource.Human);
		assert.strictEqual(model.getLineEditSource(3), LineEditSource.AI);

		model.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
