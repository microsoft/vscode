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

	test('owns theme-aware generation guidance without imposing either recipe', () => {
		assert.deepStrictEqual({
			userFirst: content.includes('user\'s requested subject, style, colors, and composition take priority'),
			optional: content.includes('suggestions, not requirements'),
			pattern: content.includes('### Pattern option'),
			atmospheric: content.includes('### Atmospheric option'),
			otherApproachesAllowed: content.includes('combine them, or use another approach'),
			unrestrictedPalette: content.includes('not an allowed palette'),
			currentColors: content.includes('call `getThemeColors` before generating'),
			appliesThroughTool: content.includes('apply it using `setChatBackground`'),
			existingImagesBypassGeneration: content.includes('Do not generate or restyle an image unless asked'),
		}, {
			userFirst: true,
			optional: true,
			pattern: true,
			atmospheric: true,
			otherApproachesAllowed: true,
			unrestrictedPalette: true,
			currentColors: true,
			appliesThroughTool: true,
			existingImagesBypassGeneration: true,
		});
	});
});
