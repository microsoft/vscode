/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../common/chatSessionsService.js';

suite('ChatSessionPickerActionItem', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('option items can have locked property', function () {
		const optionItem: IChatSessionProviderOptionItem = {
			id: 'model-1',
			name: 'Model 1',
			locked: true
		};

		assert.strictEqual(optionItem.id, 'model-1');
		assert.strictEqual(optionItem.name, 'Model 1');
		assert.strictEqual(optionItem.locked, true);
	});

	test('option items locked property is optional', function () {
		const optionItem: IChatSessionProviderOptionItem = {
			id: 'model-2',
			name: 'Model 2'
		};

		assert.strictEqual(optionItem.id, 'model-2');
		assert.strictEqual(optionItem.name, 'Model 2');
		assert.strictEqual(optionItem.locked, undefined);
	});

	test('option group can contain items with mixed locked states', function () {
		const optionGroup: IChatSessionProviderOptionGroup = {
			id: 'models',
			name: 'Models',
			description: 'Available models',
			items: [
				{ id: 'model-1', name: 'Model 1', locked: false },
				{ id: 'model-2', name: 'Model 2', locked: true },
				{ id: 'model-3', name: 'Model 3' }
			]
		};

		assert.strictEqual(optionGroup.items.length, 3);
		assert.strictEqual(optionGroup.items[0].locked, false);
		assert.strictEqual(optionGroup.items[1].locked, true);
		assert.strictEqual(optionGroup.items[2].locked, undefined);
	});
});
