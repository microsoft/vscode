/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CoreNavigationCommands } from '../../../browser/coreCommands.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { VerticalRevealType } from '../../../common/viewEvents.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { withTestCodeEditor } from '../testCodeEditor.js';

suite('Cursor Top Scroll Behavior', () => {

	test('cursorTop should use VerticalRevealType.Top when at beginning of buffer', () => {
		const text = 'First line\nSecond line\nThird line';
		
		withTestCodeEditor(text, { padding: { top: 8, bottom: 8 } }, (editor, viewModel) => {
			// Set up a spy to track revealRange calls
			const originalRevealRange = viewModel.revealRange;
			let revealRangeCalls: any[] = [];
			
			viewModel.revealRange = function(source: any, revealHorizontal: any, viewRange: any, verticalType: any, scrollType: any) {
				revealRangeCalls.push({ source, revealHorizontal, viewRange, verticalType, scrollType });
				return originalRevealRange.call(this, source, revealHorizontal, viewRange, verticalType, scrollType);
			};
			
			// Start from a position that's not at the beginning
			editor.setPosition(new Position(2, 5));
			
			// Execute cursorTop command
			CoreNavigationCommands.CursorTop.runCoreEditorCommand(viewModel, {});
			
			// Verify cursor moved to beginning
			const position = editor.getPosition();
			assert.strictEqual(position?.lineNumber, 1, 'Cursor should be at line 1');
			assert.strictEqual(position?.column, 1, 'Cursor should be at column 1');
			
			// Verify that revealRange was called with VerticalRevealType.Top
			assert.strictEqual(revealRangeCalls.length, 1, 'revealRange should be called once');
			const call = revealRangeCalls[0];
			assert.strictEqual(call.verticalType, VerticalRevealType.Top, 'Should use VerticalRevealType.Top for better padding handling');
			assert.strictEqual(call.scrollType, ScrollType.Smooth, 'Should use smooth scrolling');
			assert.strictEqual(call.revealHorizontal, true, 'Should reveal horizontally');
			
			// Verify the range is for position 1,1
			assert.strictEqual(call.viewRange.startLineNumber, 1, 'Range should start at line 1');
			assert.strictEqual(call.viewRange.startColumn, 1, 'Range should start at column 1');
		});
	});

	test('cursorTop should use default behavior when not at beginning', () => {
		const text = 'First line\nSecond line\nThird line';
		
		withTestCodeEditor(text, { padding: { top: 8, bottom: 8 } }, (editor, viewModel) => {
			// Set up spies to track method calls
			const originalRevealRange = viewModel.revealRange;
			const originalRevealAllCursors = viewModel.revealAllCursors;
			let revealRangeCalls: any[] = [];
			let revealAllCursorsCalls: any[] = [];
			
			viewModel.revealRange = function(...args: any[]) {
				revealRangeCalls.push(args);
				return originalRevealRange.apply(this, args);
			};
			
			viewModel.revealAllCursors = function(...args: any[]) {
				revealAllCursorsCalls.push(args);
				return originalRevealAllCursors.apply(this, args);
			};
			
			// Start from line 1, but not at column 1
			editor.setPosition(new Position(1, 5));
			
			// Execute cursorTop command (this should move to 1,1 but we start from 1,5)
			CoreNavigationCommands.CursorTop.runCoreEditorCommand(viewModel, {});
			
			// Since we start at line 1, the cursor should move to column 1
			const position = editor.getPosition();
			assert.strictEqual(position?.lineNumber, 1, 'Cursor should be at line 1');
			assert.strictEqual(position?.column, 1, 'Cursor should be at column 1');
			
			// This should trigger the special case (since we end up at 1,1)
			assert.strictEqual(revealRangeCalls.length, 1, 'revealRange should be called for position 1,1');
			assert.strictEqual(revealAllCursorsCalls.length, 0, 'revealAllCursors should not be called');
		});
	});
});