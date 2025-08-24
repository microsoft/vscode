/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CommentGlyphWidget } from '../../browser/commentGlyphWidget.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('CommentGlyphWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockEditor: ICodeEditor;

	setup(() => {
		instantiationService = new TestInstantiationService();
		
		// Mock ICodeEditor
		mockEditor = {
			getOption: (option: EditorOption) => {
				if (option === EditorOption.wordWrap) {
					return 'off'; // Default to off
				}
				return undefined;
			},
			createDecorationsCollection: () => ({
				length: 0,
				getRange: () => null,
				set: () => {},
				onDidChange: () => ({ dispose: () => {} }),
				clear: () => {}
			}),
			onDidChangeConfiguration: () => ({ dispose: () => {} }),
		} as any;
	});

	test('should use linesDecorationsClassName when word wrap is disabled', () => {
		// Set word wrap to off
		mockEditor.getOption = (option: EditorOption) => {
			if (option === EditorOption.wordWrap) {
				return 'off';
			}
			return undefined;
		};

		const widget = store.add(new CommentGlyphWidget(mockEditor, 1));
		
		// Access the private _commentsOptions field via reflection
		const commentsOptions = (widget as any)._commentsOptions;
		assert.strictEqual(commentsOptions.isWholeLine, true, 'isWholeLine should be true');
		assert.strictEqual(typeof commentsOptions.linesDecorationsClassName, 'string', 'linesDecorationsClassName should be set when word wrap is disabled');
		assert.strictEqual(commentsOptions.firstLineDecorationClassName, undefined, 'firstLineDecorationClassName should be undefined when word wrap is disabled');
	});

	test('should use firstLineDecorationClassName for all word wrap modes', () => {
		const wordWrapModes = ['on', 'wordWrapColumn', 'bounded'];
		
		for (const mode of wordWrapModes) {
			mockEditor.getOption = (option: EditorOption) => {
				if (option === EditorOption.wordWrap) {
					return mode;
				}
				return undefined;
			};

			const widget = store.add(new CommentGlyphWidget(mockEditor, 1));
			
			// Access the private _commentsOptions field via reflection
			const commentsOptions = (widget as any)._commentsOptions;
			assert.strictEqual(commentsOptions.isWholeLine, true, `isWholeLine should be true for mode ${mode}`);
			assert.strictEqual(typeof commentsOptions.firstLineDecorationClassName, 'string', `firstLineDecorationClassName should be set for mode ${mode}`);
			assert.strictEqual(commentsOptions.linesDecorationsClassName, undefined, `linesDecorationsClassName should be undefined for mode ${mode}`);
			
			widget.dispose();
		}
	});

	test('should use firstLineDecorationClassName when word wrap is enabled', () => {
		// Set word wrap to on
		mockEditor.getOption = (option: EditorOption) => {
			if (option === EditorOption.wordWrap) {
				return 'on';
			}
			return undefined;
		};

		const widget = store.add(new CommentGlyphWidget(mockEditor, 1));
		
		// Access the private _commentsOptions field via reflection
		const commentsOptions = (widget as any)._commentsOptions;
		assert.strictEqual(commentsOptions.isWholeLine, true, 'isWholeLine should be true');
		assert.strictEqual(typeof commentsOptions.firstLineDecorationClassName, 'string', 'firstLineDecorationClassName should be set when word wrap is enabled');
		assert.strictEqual(commentsOptions.linesDecorationsClassName, undefined, 'linesDecorationsClassName should be undefined when word wrap is enabled');
	});

	test('should use linesDecorationsClassName when word wrap is disabled', () => {
		// Set word wrap to off
		mockEditor.getOption = (option: EditorOption) => {
			if (option === EditorOption.wordWrap) {
				return 'off';
			}
			return undefined;
		};

		const widget = store.add(new CommentGlyphWidget(mockEditor, 1));
		
		// Access the private _commentsOptions field via reflection
		const commentsOptions = (widget as any)._commentsOptions;
		assert.strictEqual(commentsOptions.isWholeLine, true, 'isWholeLine should be true');
		assert.strictEqual(typeof commentsOptions.linesDecorationsClassName, 'string', 'linesDecorationsClassName should be set when word wrap is disabled');
		assert.strictEqual(commentsOptions.firstLineDecorationClassName, undefined, 'firstLineDecorationClassName should be undefined when word wrap is disabled');
	});
});