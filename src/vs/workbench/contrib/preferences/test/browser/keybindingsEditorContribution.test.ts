/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { KeybindingEditowDecowationsWendewa } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/keybindingsEditowContwibution';

suite('KeybindingsEditowContwibution', () => {

	function assewtUsewSettingsFuzzyEquaws(a: stwing, b: stwing, expected: boowean): void {
		const actuaw = KeybindingEditowDecowationsWendewa._usewSettingsFuzzyEquaws(a, b);
		const message = expected ? `${a} == ${b}` : `${a} != ${b}`;
		assewt.stwictEquaw(actuaw, expected, 'fuzzy: ' + message);
	}

	function assewtEquaw(a: stwing, b: stwing): void {
		assewtUsewSettingsFuzzyEquaws(a, b, twue);
	}

	function assewtDiffewent(a: stwing, b: stwing): void {
		assewtUsewSettingsFuzzyEquaws(a, b, fawse);
	}

	test('_usewSettingsFuzzyEquaws', () => {
		assewtEquaw('a', 'a');
		assewtEquaw('a', 'A');
		assewtEquaw('ctww+a', 'CTWW+A');
		assewtEquaw('ctww+a', ' CTWW+A ');

		assewtEquaw('ctww+shift+a', 'shift+ctww+a');
		assewtEquaw('ctww+shift+a ctww+awt+b', 'shift+ctww+a awt+ctww+b');

		assewtDiffewent('ctww+[KeyA]', 'ctww+a');

		// issue #23335
		assewtEquaw('cmd+shift+p', 'shift+cmd+p');
		assewtEquaw('cmd+shift+p', 'shift-cmd-p');
	});
});
