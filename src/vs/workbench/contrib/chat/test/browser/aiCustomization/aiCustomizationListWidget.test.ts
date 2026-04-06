/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getCustomizationSecondaryText, truncateToFirstLine } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('aiCustomizationListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('truncateToFirstLine', () => {
		test('keeps first line when text has multiple lines', () => {
			assert.strictEqual(
				truncateToFirstLine('First line\nSecond line'),
				'First line'
			);
		});

		test('returns full text when no newline is present', () => {
			assert.strictEqual(
				truncateToFirstLine('No newline here. Even with sentences.'),
				'No newline here. Even with sentences.'
			);
		});

		test('handles carriage return line endings', () => {
			assert.strictEqual(
				truncateToFirstLine('First line\r\nSecond line'),
				'First line'
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

		test('truncates non-hook descriptions to the first line', () => {
			assert.strictEqual(
				getCustomizationSecondaryText('Show the first line.\nHide the rest.', 'prompt.md', PromptsType.prompt),
				'Show the first line.'
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
