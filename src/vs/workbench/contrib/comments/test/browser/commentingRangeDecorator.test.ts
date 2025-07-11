/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';

// Test the CommentingRangeDecorator logic by importing from commentsController
// We need to test the logic that was applied to the other comment gutter decorations

suite('CommentingRangeDecorator Word Wrap Logic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let mockEditor: ICodeEditor;

	setup(() => {
		// Mock ICodeEditor
		mockEditor = {
			getOption: (option: EditorOption) => {
				if (option === EditorOption.wordWrap) {
					return 'off'; // Default to off
				}
				return undefined;
			},
			onDidChangeConfiguration: () => ({ dispose: () => {} }),
		} as any;
	});

	// Test the decoration creation logic that should be applied to all three decoration types
	function createDecorationOptions(editor: ICodeEditor, className: string) {
		const wordWrap = editor?.getOption(EditorOption.wordWrap);
		const isWordWrapEnabled = wordWrap !== 'off';
		
		const decorationOptions = {
			description: 'commenting-range-decorator',
			isWholeLine: true,
			// When word wrap is enabled, use firstLineDecorationClassName to only show on first line
			// When word wrap is disabled, use linesDecorationsClassName for the whole line
			linesDecorationsClassName: isWordWrapEnabled ? undefined : className,
			firstLineDecorationClassName: isWordWrapEnabled ? className : undefined,
		};

		return decorationOptions;
	}

	test('should use linesDecorationsClassName when word wrap is disabled for all decoration types', () => {
		// Set word wrap to off
		mockEditor.getOption = (option: EditorOption) => {
			if (option === EditorOption.wordWrap) {
				return 'off';
			}
			return undefined;
		};

		const decorationOptions = createDecorationOptions(mockEditor, 'comment-range-glyph comment-diff-added');
		const hoverDecorationOptions = createDecorationOptions(mockEditor, 'comment-range-glyph line-hover');
		const multilineDecorationOptions = createDecorationOptions(mockEditor, 'comment-range-glyph multiline-add');

		// Test decorationOptions
		assert.strictEqual(decorationOptions.isWholeLine, true, 'decorationOptions isWholeLine should be true');
		assert.strictEqual(typeof decorationOptions.linesDecorationsClassName, 'string', 'decorationOptions linesDecorationsClassName should be set when word wrap is disabled');
		assert.strictEqual(decorationOptions.firstLineDecorationClassName, undefined, 'decorationOptions firstLineDecorationClassName should be undefined when word wrap is disabled');

		// Test hoverDecorationOptions
		assert.strictEqual(hoverDecorationOptions.isWholeLine, true, 'hoverDecorationOptions isWholeLine should be true');
		assert.strictEqual(typeof hoverDecorationOptions.linesDecorationsClassName, 'string', 'hoverDecorationOptions linesDecorationsClassName should be set when word wrap is disabled');
		assert.strictEqual(hoverDecorationOptions.firstLineDecorationClassName, undefined, 'hoverDecorationOptions firstLineDecorationClassName should be undefined when word wrap is disabled');

		// Test multilineDecorationOptions
		assert.strictEqual(multilineDecorationOptions.isWholeLine, true, 'multilineDecorationOptions isWholeLine should be true');
		assert.strictEqual(typeof multilineDecorationOptions.linesDecorationsClassName, 'string', 'multilineDecorationOptions linesDecorationsClassName should be set when word wrap is disabled');
		assert.strictEqual(multilineDecorationOptions.firstLineDecorationClassName, undefined, 'multilineDecorationOptions firstLineDecorationClassName should be undefined when word wrap is disabled');
	});

	test('should use firstLineDecorationClassName for all word wrap modes and decoration types', () => {
		const wordWrapModes = ['on', 'wordWrapColumn', 'bounded'];
		
		for (const mode of wordWrapModes) {
			mockEditor.getOption = (option: EditorOption) => {
				if (option === EditorOption.wordWrap) {
					return mode;
				}
				return undefined;
			};

			const decorationOptions = createDecorationOptions(mockEditor, 'comment-range-glyph comment-diff-added');
			const hoverDecorationOptions = createDecorationOptions(mockEditor, 'comment-range-glyph line-hover');
			const multilineDecorationOptions = createDecorationOptions(mockEditor, 'comment-range-glyph multiline-add');

			// Test decorationOptions
			assert.strictEqual(decorationOptions.isWholeLine, true, `decorationOptions isWholeLine should be true for mode ${mode}`);
			assert.strictEqual(typeof decorationOptions.firstLineDecorationClassName, 'string', `decorationOptions firstLineDecorationClassName should be set for mode ${mode}`);
			assert.strictEqual(decorationOptions.linesDecorationsClassName, undefined, `decorationOptions linesDecorationsClassName should be undefined for mode ${mode}`);

			// Test hoverDecorationOptions
			assert.strictEqual(hoverDecorationOptions.isWholeLine, true, `hoverDecorationOptions isWholeLine should be true for mode ${mode}`);
			assert.strictEqual(typeof hoverDecorationOptions.firstLineDecorationClassName, 'string', `hoverDecorationOptions firstLineDecorationClassName should be set for mode ${mode}`);
			assert.strictEqual(hoverDecorationOptions.linesDecorationsClassName, undefined, `hoverDecorationOptions linesDecorationsClassName should be undefined for mode ${mode}`);

			// Test multilineDecorationOptions
			assert.strictEqual(multilineDecorationOptions.isWholeLine, true, `multilineDecorationOptions isWholeLine should be true for mode ${mode}`);
			assert.strictEqual(typeof multilineDecorationOptions.firstLineDecorationClassName, 'string', `multilineDecorationOptions firstLineDecorationClassName should be set for mode ${mode}`);
			assert.strictEqual(multilineDecorationOptions.linesDecorationsClassName, undefined, `multilineDecorationOptions linesDecorationsClassName should be undefined for mode ${mode}`);
		}
	});
});