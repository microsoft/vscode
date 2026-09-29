/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { PromptTemplatePlaceholderController, REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID } from '../../browser/promptTemplatePlaceholder.js';

suite('PromptTemplatePlaceholderController', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('highlights a late-inserted placeholder and replaces it at the clicked position', () => {
		withTestCodeEditor('', {}, editor => {
			const disposables = new DisposableStore();
			try {
				let beforeReplaceCount = 0;
				const placeholder = '[describe the coding task]';
				const partialPrompt = `Help me complete ${placeholder}`;
				const prompt = `${partialPrompt} in this project. First, inspect the relevant files.`;
				const controller = disposables.add(new PromptTemplatePlaceholderController(editor, () => {
					beforeReplaceCount++;
					editor.setValue(prompt);
				}));
				controller.setPlaceholder(placeholder);
				editor.setValue(partialPrompt);

				const placeholderOffset = prompt.indexOf(placeholder);
				const decorationsBefore = editor.getModel()!.getAllDecorations()
					.filter(decoration => decoration.options.inlineClassName === 'sessions-prompt-template-placeholder')
					.map(decoration => decoration.range.toString());
				const ignoredOutside = controller.replaceAt(new Position(1, 1));
				const replaced = controller.replaceAt(new Position(1, placeholderOffset + 2));
				const decorationsAfter = editor.getModel()!.getAllDecorations()
					.filter(decoration => decoration.options.inlineClassName === 'sessions-prompt-template-placeholder');

				assert.deepStrictEqual({
					decorationsBefore,
					ignoredOutside,
					replaced,
					beforeReplaceCount,
					value: editor.getValue(),
					position: editor.getPosition(),
					decorationsAfter: decorationsAfter.length,
				}, {
					decorationsBefore: [`[1,${placeholderOffset + 1} -> 1,${placeholderOffset + placeholder.length + 1}]`],
					ignoredOutside: false,
					replaced: true,
					beforeReplaceCount: 1,
					value: 'Help me complete  in this project. First, inspect the relevant files.',
					position: new Position(1, placeholderOffset + 1),
					decorationsAfter: 0,
				});
			} finally {
				disposables.dispose();
			}
		});
	});

	test('replaces the placeholder through the Enter command when the caret is inside', () => {
		withTestCodeEditor('Help me complete [describe the coding task] in this project.', {}, editor => {
			const disposables = new DisposableStore();
			try {
				const placeholder = '[describe the coding task]';
				const controller = disposables.add(new PromptTemplatePlaceholderController(editor, () => undefined));
				controller.setPlaceholder(placeholder);
				const placeholderOffset = editor.getValue().indexOf(placeholder);
				editor.setPosition(new Position(1, placeholderOffset + 2));

				CommandsRegistry.getCommand(REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID)!.handler(undefined as never);

				assert.deepStrictEqual({ value: editor.getValue(), position: editor.getPosition() }, {
					value: 'Help me complete  in this project.',
					position: new Position(1, placeholderOffset + 1),
				});
			} finally {
				disposables.dispose();
			}
		});
	});
});
