/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { extractExtensionIdFromPath, getCustomizationSecondaryText, truncateToFirstLine } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
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

	suite('extractExtensionIdFromPath', () => {
		test('extracts extension ID from copilot-chat extension path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/agent-customization/SKILL.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from PR extension path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/extensions/github.vscode-pull-request-github-0.135.2026040604/src/lm/skills/SKILL.md'),
				'github.vscode-pull-request-github'
			);
		});

		test('extracts extension ID from Code OSS dev path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-oss-dev/extensions/github.copilot-chat-0.43.2026040602/assets/prompts/skills/troubleshoot/SKILL.md'),
				'github.copilot-chat'
			);
		});

		test('extracts extension ID from Windows-style path', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('C:/Users/dev/.vscode/extensions/ms-python.python-2024.1.1/skills/SKILL.md'),
				'ms-python.python'
			);
		});

		test('returns undefined for workspace paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/git/vscode/.github/skills/accessibility/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for user home paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.copilot/skills/ios-project-setup/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for plugin paths', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/Users/josh/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council/skills/council-review/SKILL.md'),
				undefined
			);
		});

		test('returns undefined for bare extensions folder without version', () => {
			assert.strictEqual(
				extractExtensionIdFromPath('/workspace/extensions/my-extension/SKILL.md'),
				undefined
			);
		});
	});
});
