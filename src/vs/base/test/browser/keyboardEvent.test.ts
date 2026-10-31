/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StandardKeyboardEvent } from '../../browser/keyboardEvent.js';
import { KeyCode, KeyMod } from '../../common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

function keydown(init: KeyboardEventInit & { keyCode: number }): StandardKeyboardEvent {
	// `keyCode` is legacy but is what `StandardKeyboardEvent` reads, so it has to be set explicitly.
	const event = new KeyboardEvent('keydown', init);
	Object.defineProperty(event, 'keyCode', { get: () => init.keyCode });
	return new StandardKeyboardEvent(event);
}

suite('StandardKeyboardEvent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the pressed key when no composition is in progress', () => {
		const event = keydown({ keyCode: 13, isComposing: false });
		assert.deepStrictEqual(
			[event.keyCode === KeyCode.Enter, event.equals(KeyCode.Enter)],
			[true, true]
		);
	});

	test('normalizes the key code to KEY_IN_COMPOSITION while composing', () => {
		// Some platform/IME combinations report the real key code (rather than 229) for the Enter
		// that commits a composition. Normalizing means both `equals()` callers and the many
		// handlers that compare `keyCode` directly stop seeing a key the user never aimed at them.
		const event = keydown({ keyCode: 13, isComposing: true });
		assert.deepStrictEqual(
			[event.keyCode === KeyCode.KEY_IN_COMPOSITION, event.equals(KeyCode.Enter)],
			[true, false]
		);
	});

	test('normalizes modified keybindings while composing too', () => {
		const event = keydown({ keyCode: 13, ctrlKey: true, isComposing: true });
		assert.strictEqual(event.equals(KeyMod.CtrlCmd | KeyCode.Enter), false);
	});

	test('keeps matching KEY_IN_COMPOSITION while composing', () => {
		// Composition-aware callers ask about KEY_IN_COMPOSITION explicitly; the editor relies on
		// this to detect IME input, so it has to keep working for both key code shapes.
		for (const keyCode of [229, 13]) {
			const event = keydown({ keyCode, isComposing: true });
			assert.deepStrictEqual(
				[keyCode, event.equals(KeyCode.KEY_IN_COMPOSITION)],
				[keyCode, true]
			);
		}
	});

	test('resolves to a chord that matches no keybinding while composing', () => {
		// Keybinding resolution goes through `toKeyCodeChord()` rather than `equals()`, so it needs
		// the same normalization to avoid running commands mid-composition.
		const event = keydown({ keyCode: 13, isComposing: true });
		assert.strictEqual(event.toKeyCodeChord().keyCode, KeyCode.KEY_IN_COMPOSITION);
	});
});
