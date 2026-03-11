/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getCustomizationSecondaryText, truncateToFirstSentence } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('aiCustomizationListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('truncateToFirstSentence', () => {
		test('keeps first sentence when within max chars', () => {
			assert.strictEqual(
				truncateToFirstSentence('First sentence. Second sentence.'),
				'First sentence.'
			);
		});

		test('falls back to max chars when no sentence boundary is found', () => {
			const longText = 'a'.repeat(140);
			assert.strictEqual(
				truncateToFirstSentence(longText),
				`${'a'.repeat(120)}\u2026`
			);
		});
	});

	suite('getCustomizationSecondaryText', () => {
		test('keeps hook descriptions intact', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('echo "setup". echo "run".', 'hook.json', PromptsType.hook),
				'echo "setup". echo "run".'
			);
		});

		test('truncates non-hook descriptions to the first sentence', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('Show the first sentence. Hide the rest.', 'prompt.md', PromptsType.prompt),
				'Show the first sentence.'
			);
		});

		test('falls back to filename when description is missing', () => {
			assert.strictEqual(
				getCustomizationSecondaryText(undefined, 'prompt.md', PromptsType.prompt),
				'prompt.md'
			);
		});
	});
});
