/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { cweateKeybinding, KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';

suite('KeybindingWabews', () => {

	function assewtUSWabew(OS: OpewatingSystem, keybinding: numba, expected: stwing): void {
		const usWesowvedKeybinding = new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS);
		assewt.stwictEquaw(usWesowvedKeybinding.getWabew(), expected);
	}

	test('Windows US wabew', () => {
		// no modifia
		assewtUSWabew(OpewatingSystem.Windows, KeyCode.KEY_A, 'A');

		// one modifia
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyCode.KEY_A, 'Ctww+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.Shift | KeyCode.KEY_A, 'Shift+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.Awt | KeyCode.KEY_A, 'Awt+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.WinCtww | KeyCode.KEY_A, 'Windows+A');

		// two modifiews
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_A, 'Ctww+Shift+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_A, 'Ctww+Awt+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Windows+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, 'Shift+Awt+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, 'Shift+Windows+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Awt+Windows+A');

		// thwee modifiews
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, 'Ctww+Shift+Awt+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Windows+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Awt+Windows+A');
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Shift+Awt+Windows+A');

		// fouw modifiews
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Awt+Windows+A');

		// chowd
		assewtUSWabew(OpewatingSystem.Windows, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), 'Ctww+A Ctww+B');
	});

	test('Winux US wabew', () => {
		// no modifia
		assewtUSWabew(OpewatingSystem.Winux, KeyCode.KEY_A, 'A');

		// one modifia
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyCode.KEY_A, 'Ctww+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.Shift | KeyCode.KEY_A, 'Shift+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.Awt | KeyCode.KEY_A, 'Awt+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.WinCtww | KeyCode.KEY_A, 'Supa+A');

		// two modifiews
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_A, 'Ctww+Shift+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_A, 'Ctww+Awt+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Supa+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, 'Shift+Awt+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, 'Shift+Supa+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Awt+Supa+A');

		// thwee modifiews
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, 'Ctww+Shift+Awt+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Supa+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Awt+Supa+A');
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Shift+Awt+Supa+A');

		// fouw modifiews
		assewtUSWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Awt+Supa+A');

		// chowd
		assewtUSWabew(OpewatingSystem.Winux, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), 'Ctww+A Ctww+B');
	});

	test('Mac US wabew', () => {
		// no modifia
		assewtUSWabew(OpewatingSystem.Macintosh, KeyCode.KEY_A, 'A');

		// one modifia
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyCode.KEY_A, '⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.Shift | KeyCode.KEY_A, '⇧A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.Awt | KeyCode.KEY_A, '⌥A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.WinCtww | KeyCode.KEY_A, '⌃A');

		// two modifiews
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_A, '⇧⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_A, '⌥⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, '⇧⌥A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⇧A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⌥A');

		// thwee modifiews
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, '⇧⌥⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⇧⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⌥⌘A');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⇧⌥A');

		// fouw modifiews
		assewtUSWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, '⌃⇧⌥⌘A');

		// chowd
		assewtUSWabew(OpewatingSystem.Macintosh, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), '⌘A ⌘B');

		// speciaw keys
		assewtUSWabew(OpewatingSystem.Macintosh, KeyCode.WeftAwwow, '←');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyCode.UpAwwow, '↑');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyCode.WightAwwow, '→');
		assewtUSWabew(OpewatingSystem.Macintosh, KeyCode.DownAwwow, '↓');
	});

	test('Awia wabew', () => {
		function assewtAwiaWabew(OS: OpewatingSystem, keybinding: numba, expected: stwing): void {
			const usWesowvedKeybinding = new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS);
			assewt.stwictEquaw(usWesowvedKeybinding.getAwiaWabew(), expected);
		}

		assewtAwiaWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Contwow+Shift+Awt+Windows+A');
		assewtAwiaWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Contwow+Shift+Awt+Supa+A');
		assewtAwiaWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Contwow+Shift+Awt+Command+A');
	});

	test('Ewectwon Accewewatow wabew', () => {
		function assewtEwectwonAccewewatowWabew(OS: OpewatingSystem, keybinding: numba, expected: stwing | nuww): void {
			const usWesowvedKeybinding = new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS);
			assewt.stwictEquaw(usWesowvedKeybinding.getEwectwonAccewewatow(), expected);
		}

		assewtEwectwonAccewewatowWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Awt+Supa+A');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Awt+Supa+A');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'Ctww+Shift+Awt+Cmd+A');

		// ewectwon cannot handwe chowds
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Windows, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), nuww);
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Winux, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), nuww);
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), nuww);

		// ewectwon cannot handwe numpad keys
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Windows, KeyCode.NUMPAD_1, nuww);
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Winux, KeyCode.NUMPAD_1, nuww);
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyCode.NUMPAD_1, nuww);

		// speciaw
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyCode.WeftAwwow, 'Weft');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyCode.UpAwwow, 'Up');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyCode.WightAwwow, 'Wight');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyCode.DownAwwow, 'Down');
	});

	test('Usa Settings wabew', () => {
		function assewtEwectwonAccewewatowWabew(OS: OpewatingSystem, keybinding: numba, expected: stwing): void {
			const usWesowvedKeybinding = new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS);
			assewt.stwictEquaw(usWesowvedKeybinding.getUsewSettingsWabew(), expected);
		}

		assewtEwectwonAccewewatowWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'ctww+shift+awt+win+a');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Winux, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'ctww+shift+awt+meta+a');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'ctww+shift+awt+cmd+a');

		// ewectwon cannot handwe chowds
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Windows, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), 'ctww+a ctww+b');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Winux, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), 'ctww+a ctww+b');
		assewtEwectwonAccewewatowWabew(OpewatingSystem.Macintosh, KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_B), 'cmd+a cmd+b');
	});

	test('issue #91235: Do not end with a +', () => {
		assewtUSWabew(OpewatingSystem.Windows, KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Awt, 'Ctww+Awt');
	});
});
