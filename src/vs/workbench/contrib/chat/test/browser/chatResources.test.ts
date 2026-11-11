/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getShownChatResource } from '../../browser/chatResources/chatResourcesControl.js';
import { defaultChatEmbeddedResourceSize, getChatEmbeddedResourceHeight, IChatEmbeddedResourceSize, resizeChatEmbeddedResource } from '../../browser/chatResources/chatResourceSizing.js';

suite('ChatResources', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('embedded size', () => {
		const automatic = (maxAutomaticHeight: number): IChatEmbeddedResourceSize => ({ fixedHeight: undefined, maxAutomaticHeight });

		test('follows the content height up to the maximum, within the available space', () => {
			assert.deepStrictEqual([
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 200, 1000),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 600, 1000),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 600, 250),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 10, 1000),
				getChatEmbeddedResourceHeight({ fixedHeight: 500, maxAutomaticHeight: 320 }, 100, 1000),
			], [200, 320, 250, 40, 500]);
		});

		test('leaves the transcript its room even below the minimum height', () => {
			assert.deepStrictEqual([
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 10, 24),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 200, -5),
			], [24, 0]);
		});

		test('dragging to another height fixes it', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 200, 260, 200), { fixedHeight: 260, maxAutomaticHeight: 320 });
		});

		test('dragging back to the automatic height follows the content again', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource({ fixedHeight: 100, maxAutomaticHeight: 320 }, 320, 315, 600), automatic(320));
		});

		test('dragging to the content height follows it and remembers it as the maximum', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 320, 605, 600), automatic(600));
		});

		test('the remembered maximum is never below the default', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource(automatic(600), 200, 205, 200), automatic(320));
		});

		test('heights are clamped', () => {
			assert.deepStrictEqual([
				resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 200, 5, undefined),
				resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 200, 5000, undefined),
			], [{ fixedHeight: 40, maxAutomaticHeight: 320 }, { fixedHeight: 1000, maxAutomaticHeight: 320 }]);
		});
	});

	test('an area shows its first resource until the user chooses, then only the chosen one', () => {
		const resources = [{ id: 'todos' }, { id: 'plan' }];
		assert.deepStrictEqual([
			getShownChatResource(resources, undefined)?.id,
			getShownChatResource(resources, 'plan')?.id,
			getShownChatResource(resources, null)?.id,
			// The chosen resource left the area, for example because the user showed it at the top: no other one takes its place.
			getShownChatResource(resources, 'notes')?.id,
		], ['todos', 'plan', undefined, undefined]);
	});
});
