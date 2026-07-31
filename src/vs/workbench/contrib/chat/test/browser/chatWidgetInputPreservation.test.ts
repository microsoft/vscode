/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatWidget, setModelPreservingInputTypedWhileLoading } from '../../browser/chat.js';

suite('setModelPreservingInputTypedWhileLoading', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A minimal fake that models just the input editor of a chat widget. `bind`
	 * simulates the model binding resetting the editor to the session's own draft
	 * (mirroring `_syncFromModel` calling `setValue(state.inputText || '')`).
	 */
	class FakeInputWidget {
		constructor(private input: string, private readonly boundDraft: string) { }
		getInput(): string { return this.input; }
		setInput(query?: string): void { this.input = query ?? ''; }
		bind(): void { this.input = this.boundDraft; }
		asWidget(): IChatWidget { return this as unknown as IChatWidget; }
	}

	test('restores text typed during load onto an empty session', () => {
		const widget = new FakeInputWidget(/* initial */ '', /* boundDraft */ '');
		const inputBeforeLoad = widget.getInput(); // '' - editor was empty when load started
		widget.setInput('the'); // user types while loading

		setModelPreservingInputTypedWhileLoading(widget.asWidget(), inputBeforeLoad, () => widget.bind());

		assert.strictEqual(widget.getInput(), 'the');
	});

	test('does not clobber the loaded session\'s own persisted draft', () => {
		const widget = new FakeInputWidget('', 'session draft');
		const inputBeforeLoad = widget.getInput();
		widget.setInput('the'); // user types while loading

		setModelPreservingInputTypedWhileLoading(widget.asWidget(), inputBeforeLoad, () => widget.bind());

		assert.strictEqual(widget.getInput(), 'session draft');
	});

	test('does not carry a previous session\'s leftover draft over on a plain switch', () => {
		// Editor still holds the previous session's draft and the user did NOT type.
		const widget = new FakeInputWidget('previous draft', '');
		const inputBeforeLoad = widget.getInput(); // 'previous draft' == current input (no typing)

		setModelPreservingInputTypedWhileLoading(widget.asWidget(), inputBeforeLoad, () => widget.bind());

		assert.strictEqual(widget.getInput(), '');
	});

});
