/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

class FakeEditor {
	content: string[];
	cursors: number[];
	constructor(text: string) {
		this.content = text.split('\n');
		this.cursors = [0]; // start at first line
	}

	setPosition(pos: number) {
		this.cursors = [pos];
	}

	getLine(line: number) {
		return this.content[line];
	}
}

class FakeMultiCursorSession {
	editor: FakeEditor;
	searchText: string;
	selections: number[];
	constructor(editor: FakeEditor, searchText: string) {
		this.editor = editor;
		this.searchText = searchText;
		this.selections = [...editor.cursors];
	}

	addSelectionToNextFindMatch() {
		const nextLine = this.selections[this.selections.length - 1] + 1;
		if (
			nextLine < this.editor.content.length &&
			this.editor.getLine(nextLine).match(new RegExp(this.searchText))
		) {
			this.selections.push(nextLine);
			return this.selections;
		}
		return null;
	}
}

describe('MultiCursorSession (mock)', () => {
	it('adds selections to next regex match', () => {
		const editor = new FakeEditor('abc123\nabc456\nabc789');
		const session = new FakeMultiCursorSession(editor, 'abc[0-9]{3}');

		editor.setPosition(0);

		const next1 = session.addSelectionToNextFindMatch();
		assert.deepStrictEqual(next1, [0, 1]);

		const next2 = session.addSelectionToNextFindMatch();
		assert.deepStrictEqual(next2, [0, 1, 2]);
	});

	it('returns null when no next match', () => {
		const editor = new FakeEditor('abc123\nabc456\nxyz789');
		const session = new FakeMultiCursorSession(editor, 'abc[0-9]{3}');

		editor.setPosition(0);
		session.addSelectionToNextFindMatch(); // adds 1
		const next2 = session.addSelectionToNextFindMatch(); // tries to add 2
		assert.strictEqual(next2, null);
	});
});


