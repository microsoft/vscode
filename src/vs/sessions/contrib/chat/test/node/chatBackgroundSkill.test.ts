/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PromptFileParser } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptFileParser.js';

suite('Sessions - Generate Chat Background skill', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const skillUri = FileAccess.asFileUri('vs/sessions/skills/generate-chat-background/SKILL.md');
	let content: string;

	suiteSetup(async () => {
		content = await fs.readFile(skillUri.fsPath, 'utf8');
	});

	test('ships discoverable metadata for model and slash-command invocation', () => {
		const { header } = new PromptFileParser().parse(skillUri, content);
		assert.ok(header);

		assert.deepStrictEqual({
			errors: header.errors,
			name: header.name,
			matchesFolder: header.name === basename(dirname(skillUri)),
			discoverableForGeneration: /generate/i.test(header.description ?? '') && /chat background/i.test(header.description ?? ''),
			descriptionWithinLimit: (header.description?.length ?? 0) <= 1024,
			modelInvocable: header.disableModelInvocation !== true,
			userInvocable: header.userInvocable !== false,
		}, {
			errors: [],
			name: 'generate-chat-background',
			matchesFolder: true,
			discoverableForGeneration: true,
			descriptionWithinLimit: true,
			modelInvocable: true,
			userInvocable: true,
		});
	});

	test('keeps the user\'s request first and applies through the appearance tools', () => {
		assert.deepStrictEqual({
			userFirst: content.includes('user\'s requested subject, style, and colors take priority'),
			existingImagesBypassGeneration: content.includes('Do not generate an image unless asked'),
			unavailableToolsExplained: content.includes('explain that rather than generating an image you cannot apply'),
			paletteIsContext: content.includes('Call `getThemeColors` and use the palette as context'),
			appliesThroughTool: content.includes('pass its path to `setChatBackground`'),
		}, {
			userFirst: true,
			existingImagesBypassGeneration: true,
			unavailableToolsExplained: true,
			paletteIsContext: true,
			appliesThroughTool: true,
		});
	});

	test('verifies the applied background in a window screenshot', () => {
		assert.deepStrictEqual({
			capturesAfterApplying: content.includes('After `setChatBackground` succeeds, call `screenshotWindow`'),
			boundedRevisions: content.includes('for at most a couple of rounds'),
			noUnrelatedContent: content.includes('do not comment on unrelated content'),
			honestWithoutScreenshot: content.includes('say that the result was not visually verified'),
		}, {
			capturesAfterApplying: true,
			boundedRevisions: true,
			noUnrelatedContent: true,
			honestWithoutScreenshot: true,
		});
	});
});
