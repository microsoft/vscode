/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { KeyCode, KeyMod, KeyChord, RuntimeKeybinding, createRuntimeKeybinding, SimpleRuntimeKeybinding, ChordRuntimeKeybinding } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';

suite('keyCodes', () => {

	function testBinaryEncoding(expected: RuntimeKeybinding, k: number, OS: OperatingSystem): void {
		assert.deepEqual(createRuntimeKeybinding(k, OS), expected);
	}

	test('MAC binary encoding', () => {

		function test(expected: RuntimeKeybinding, k: number): void {
			testBinaryEncoding(expected, k, OperatingSystem.Macintosh);
		}

		test(null, 0);
		test(new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.Enter), KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, false, false, false, KeyCode.Enter), KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, false, true, false, KeyCode.Enter), KeyMod.Alt | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, false, true, false, KeyCode.Enter), KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, true, false, false, KeyCode.Enter), KeyMod.Shift | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, true, false, false, KeyCode.Enter), KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, true, true, false, KeyCode.Enter), KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, true, true, false, KeyCode.Enter), KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, false, false, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, false, false, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, false, true, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, false, true, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, true, false, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, true, false, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(false, true, true, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
		test(new SimpleRuntimeKeybinding(true, true, true, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);

		test(
			new ChordRuntimeKeybinding(
				new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.Enter),
				new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.Tab)
			),
			KeyChord(KeyCode.Enter, KeyCode.Tab)
		);
		test(
			new ChordRuntimeKeybinding(
				new SimpleRuntimeKeybinding(false, false, false, true, KeyCode.KEY_Y),
				new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.KEY_Z)
			),
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)
		);
	});

	test('WINDOWS & LINUX binary encoding', () => {

		[OperatingSystem.Linux, OperatingSystem.Windows].forEach((OS) => {

			function test(expected: RuntimeKeybinding, k: number): void {
				testBinaryEncoding(expected, k, OS);
			}

			test(null, 0);
			test(new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.Enter), KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, false, false, true, KeyCode.Enter), KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, false, true, false, KeyCode.Enter), KeyMod.Alt | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, false, true, true, KeyCode.Enter), KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, true, false, false, KeyCode.Enter), KeyMod.Shift | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, true, false, true, KeyCode.Enter), KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, true, true, false, KeyCode.Enter), KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(false, true, true, true, KeyCode.Enter), KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, false, false, false, KeyCode.Enter), KeyMod.CtrlCmd | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, false, false, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, false, true, false, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, false, true, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, true, false, false, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, true, false, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, true, true, false, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
			test(new SimpleRuntimeKeybinding(true, true, true, true, KeyCode.Enter), KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);

			test(
				new ChordRuntimeKeybinding(
					new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.Enter),
					new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.Tab)
				),
				KeyChord(KeyCode.Enter, KeyCode.Tab)
			);
			test(
				new ChordRuntimeKeybinding(
					new SimpleRuntimeKeybinding(true, false, false, false, KeyCode.KEY_Y),
					new SimpleRuntimeKeybinding(false, false, false, false, KeyCode.KEY_Z)
				),
				KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)
			);

		});
	});
});
