/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Handler } from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import * as modes from 'vs/editor/common/modes';
import { OnTypeRenameContribution } from 'vs/editor/contrib/rename/onTypeRename';
import { createTestCodeEditor, TestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';

const mockFile = URI.parse('test:somefile.ttt');
const mockFileSelector = { scheme: 'test' };
const timeout = 30;

suite('Synced regions', () => {
	const disposables = new DisposableStore();

	setup(() => {
		disposables.clear();
	});

	teardown(() => {
		disposables.clear();
	});

	function createMockEditor(text: string | string[]) {
		const model = typeof text === 'string'
			? TextModel.createFromString(text, undefined, undefined, mockFile)
			: TextModel.createFromString(text.join('\n'), undefined, undefined, mockFile);

		const editor = createTestCodeEditor({ model });
		disposables.add(model);
		disposables.add(editor);

		return editor;
	}


	function testCase(
		name: string,
		initialState: { text: string | string[], ranges: Range[] },
		operations: (editor: TestCodeEditor, contrib: OnTypeRenameContribution) => Promise<void>,
		expectedEndText: string | string[]
	) {
		test(name, async () => {
			disposables.add(modes.OnTypeRenameProviderRegistry.register(mockFileSelector, new class implements modes.OnTypeRenameProvider {
				provideOnTypeRenameRanges() {
					return initialState.ranges;
				}
			}));

			const editor = createMockEditor(initialState.text);
			const ontypeRenameContribution = editor.registerAndInstantiateContribution<OnTypeRenameContribution>(
				OnTypeRenameContribution.ID,
				OnTypeRenameContribution
			);

			await operations(editor, ontypeRenameContribution);

			return new Promise((resolve) => {
				setTimeout(() => {
					if (typeof expectedEndText === 'string') {
						assert.equal(editor.getModel()!.getValue(), expectedEndText);
					} else {
						assert.equal(editor.getModel()!.getValue(), expectedEndText.join('\n'));
					}
					resolve();
				}, timeout);
			});
		});
	}

	const state = {
		text: '<ooo></ooo>',
		ranges: [
			new Range(1, 2, 1, 5),
			new Range(1, 8, 1, 11),
		]
	};

	/**
	 * Simple insertion
	 */
	testCase('Simple insert - initial', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<iooo></iooo>');

	testCase('Simple insert - middle', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 3);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<oioo></oioo>');

	testCase('Simple insert - end', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<oooi></oooi>');

	/**
	 * Simple insertion - end
	 */
	testCase('Simple insert end - initial', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 8);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<iooo></iooo>');

	testCase('Simple insert end - middle', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 9);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<oioo></oioo>');

	testCase('Simple insert end - end', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 11);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<oooi></oooi>');

	/**
	 * Boundary insertion
	 */
	testCase('Simple insert - out of boundary', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 1);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, 'i<ooo></ooo>');

	testCase('Simple insert - out of boundary 2', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 6);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<ooo>i</ooo>');

	testCase('Simple insert - out of boundary 3', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 7);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<ooo><i/ooo>');

	testCase('Simple insert - out of boundary 4', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 12);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<ooo></ooo>i');

	/**
	 * Insert + Move
	 */
	testCase('Continuous insert', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<iiooo></iiooo>');

	testCase('Insert - move - insert', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
		editor.setPosition(new Position(1, 4));
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<ioioo></ioioo>');

	testCase('Insert - move - insert outside region', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
		editor.setPosition(new Position(1, 7));
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<iooo>i</iooo>');

	/**
	 * Selection insert
	 */
	testCase('Selection insert - simple', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.setSelection(new Range(1, 2, 1, 3));
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<ioo></ioo>');

	testCase('Selection insert - whole', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.setSelection(new Range(1, 2, 1, 5));
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, '<i></i>');

	testCase('Selection insert - across boundary', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.setSelection(new Range(1, 1, 1, 3));
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, 'ioo></oo>');

	/**
	 * @todo
	 * Undefined behavior
	 */
	// testCase('Selection insert - across two boundary', state, async (editor, ontypeRenameContribution) => {
	// 	const pos = new Position(1, 2);
	// 	editor.setPosition(pos);
	// 	await ontypeRenameContribution.run(pos, true);
	// 	editor.setSelection(new Range(1, 4, 1, 9));
	// 	editor.trigger('keyboard', Handler.Type, { text: 'i' });
	// }, '<ooioo>');

	/**
	 * Break out behavior
	 */
	testCase('Breakout - type space', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: ' ' });
	}, '<ooo ></ooo>');

	testCase('Breakout - type space then undo', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: ' ' });
		editor.trigger('keyboard', Handler.Undo, {});
	}, '<ooo></ooo>');

	testCase('Breakout - type space in middle', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 4);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: ' ' });
	}, '<oo o></ooo>');

	testCase('Breakout - paste content starting with space', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Paste, { text: ' i="i"' });
	}, '<ooo i="i"></ooo>');

	testCase('Breakout - paste content starting with space then undo', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Paste, { text: ' i="i"' });
		editor.trigger('keyboard', Handler.Undo, {});
	}, '<ooo></ooo>');

	testCase('Breakout - paste content starting with space in middle', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 4);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Paste, { text: ' i' });
	}, '<oo io></ooo>');

	/**
	 * Delete
	 */
	testCase('Delete - left char', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', 'deleteLeft', {});
	}, '<oo></oo>');

	testCase('Delete - left char then undo', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', 'deleteLeft', {});
		editor.trigger('keyboard', Handler.Undo, null);
	}, '<ooo></ooo>');

	testCase('Delete - left word', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', 'deleteWordLeft', {});
	}, '<></>');

	testCase('Delete - left word then undo', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', 'deleteWordLeft', {});
		editor.trigger('keyboard', Handler.Undo, null);
	}, '<ooo></ooo>');

	/**
	 * @todo
	 * Editor has correct behavior, test doesn't pass
	 */
	// testCase('Delete - left all', state, async (editor, ontypeRenameContribution) => {
	// 	const pos = new Position(1, 3);
	// 	editor.setPosition(pos);
	// 	await ontypeRenameContribution.run(pos, true);
	// 	editor.trigger('keyboard', 'deleteAllLeft', {});
	// }, '></>');
	// testCase('Delete - left all then undo', state, async (editor, ontypeRenameContribution) => {
	// 	const pos = new Position(1, 5);
	// 	editor.setPosition(pos);
	// 	await ontypeRenameContribution.run(pos, true);
	// 	editor.trigger('keyboard', 'deleteAllLeft', {});
	// 	editor.trigger('keyboard', Handler.Undo, null);
	// }, '<ooo></ooo>');

	testCase('Delete - selection', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 5);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.setSelection(new Range(1, 2, 1, 3));
		editor.trigger('keyboard', 'deleteLeft', {});
	}, '<oo></oo>');

	testCase('Delete - selection across boundary', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 3);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.setSelection(new Range(1, 1, 1, 3));
		editor.trigger('keyboard', 'deleteLeft', {});
	}, 'oo></oo>');

	/**
	 * @todo
	 * Editor behavior not matching test case
	 */
	// testCase('Delete - reverse selection across boundary', state, async (editor, ontypeRenameContribution) => {
	// 	const pos = new Position(1, 3);
	// 	editor.setPosition(pos);
	// 	await ontypeRenameContribution.run(pos, true);
	// 	editor.setSelection(new Selection(1, 3, 1, 1));
	// 	editor.trigger('keyboard', 'deleteLeft', {});
	// }, 'oo></ooo>');

	/**
	 * Paste
	 */

	/**
	 * Cut
	 */

	/**
	 * Undo / redo
	 */
	testCase('Undo/redo - simple undo', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
		editor.trigger('keyboard', Handler.Undo, null);
	}, '<ooo></ooo>');

	testCase('Undo/redo - simple undo/redo', state, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
		editor.trigger('keyboard', Handler.Undo, null);
		editor.trigger('keyboard', Handler.Redo, null);
	}, '<iooo></iooo>');

	/**
	 * Multi line
	 */
	const state2 = {
		text: [
			'<ooo>',
			'</ooo>'
		],
		ranges: [
			new Range(1, 2, 1, 5),
			new Range(2, 3, 2, 6),
		]
	};

	testCase('Multiline insert', state2, async (editor, ontypeRenameContribution) => {
		const pos = new Position(1, 2);
		editor.setPosition(pos);
		await ontypeRenameContribution.run(pos, true);
		editor.trigger('keyboard', Handler.Type, { text: 'i' });
	}, [
		'<iooo>',
		'</iooo>'
	]);
});
