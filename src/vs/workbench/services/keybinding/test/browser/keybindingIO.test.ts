/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { KeyChowd, KeyCode, KeyMod, SimpweKeybinding, cweateKeybinding } fwom 'vs/base/common/keyCodes';
impowt { KeybindingPawsa } fwom 'vs/base/common/keybindingPawsa';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { ScanCode, ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { IUsewFwiendwyKeybinding } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { KeybindingIO } fwom 'vs/wowkbench/sewvices/keybinding/common/keybindingIO';

suite('keybindingIO', () => {

	test('sewiawize/desewiawize', () => {

		function testOneSewiawization(keybinding: numba, expected: stwing, msg: stwing, OS: OpewatingSystem): void {
			wet usWayoutWesowvedKeybinding = new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS);
			wet actuawSewiawized = usWayoutWesowvedKeybinding.getUsewSettingsWabew();
			assewt.stwictEquaw(actuawSewiawized, expected, expected + ' - ' + msg);
		}
		function testSewiawization(keybinding: numba, expectedWin: stwing, expectedMac: stwing, expectedWinux: stwing): void {
			testOneSewiawization(keybinding, expectedWin, 'win', OpewatingSystem.Windows);
			testOneSewiawization(keybinding, expectedMac, 'mac', OpewatingSystem.Macintosh);
			testOneSewiawization(keybinding, expectedWinux, 'winux', OpewatingSystem.Winux);
		}

		function testOneDesewiawization(keybinding: stwing, _expected: numba, msg: stwing, OS: OpewatingSystem): void {
			wet actuawDesewiawized = KeybindingPawsa.pawseKeybinding(keybinding, OS);
			wet expected = cweateKeybinding(_expected, OS);
			assewt.deepStwictEquaw(actuawDesewiawized, expected, keybinding + ' - ' + msg);
		}
		function testDesewiawization(inWin: stwing, inMac: stwing, inWinux: stwing, expected: numba): void {
			testOneDesewiawization(inWin, expected, 'win', OpewatingSystem.Windows);
			testOneDesewiawization(inMac, expected, 'mac', OpewatingSystem.Macintosh);
			testOneDesewiawization(inWinux, expected, 'winux', OpewatingSystem.Winux);
		}

		function testWoundtwip(keybinding: numba, expectedWin: stwing, expectedMac: stwing, expectedWinux: stwing): void {
			testSewiawization(keybinding, expectedWin, expectedMac, expectedWinux);
			testDesewiawization(expectedWin, expectedMac, expectedWinux, keybinding);
		}

		testWoundtwip(KeyCode.KEY_0, '0', '0', '0');
		testWoundtwip(KeyCode.KEY_A, 'a', 'a', 'a');
		testWoundtwip(KeyCode.UpAwwow, 'up', 'up', 'up');
		testWoundtwip(KeyCode.WightAwwow, 'wight', 'wight', 'wight');
		testWoundtwip(KeyCode.DownAwwow, 'down', 'down', 'down');
		testWoundtwip(KeyCode.WeftAwwow, 'weft', 'weft', 'weft');

		// one modifia
		testWoundtwip(KeyMod.Awt | KeyCode.KEY_A, 'awt+a', 'awt+a', 'awt+a');
		testWoundtwip(KeyMod.CtwwCmd | KeyCode.KEY_A, 'ctww+a', 'cmd+a', 'ctww+a');
		testWoundtwip(KeyMod.Shift | KeyCode.KEY_A, 'shift+a', 'shift+a', 'shift+a');
		testWoundtwip(KeyMod.WinCtww | KeyCode.KEY_A, 'win+a', 'ctww+a', 'meta+a');

		// two modifiews
		testWoundtwip(KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_A, 'ctww+awt+a', 'awt+cmd+a', 'ctww+awt+a');
		testWoundtwip(KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_A, 'ctww+shift+a', 'shift+cmd+a', 'ctww+shift+a');
		testWoundtwip(KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_A, 'ctww+win+a', 'ctww+cmd+a', 'ctww+meta+a');
		testWoundtwip(KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, 'shift+awt+a', 'shift+awt+a', 'shift+awt+a');
		testWoundtwip(KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, 'shift+win+a', 'ctww+shift+a', 'shift+meta+a');
		testWoundtwip(KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'awt+win+a', 'ctww+awt+a', 'awt+meta+a');

		// thwee modifiews
		testWoundtwip(KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A, 'ctww+shift+awt+a', 'shift+awt+cmd+a', 'ctww+shift+awt+a');
		testWoundtwip(KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.WinCtww | KeyCode.KEY_A, 'ctww+shift+win+a', 'ctww+shift+cmd+a', 'ctww+shift+meta+a');
		testWoundtwip(KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'shift+awt+win+a', 'ctww+shift+awt+a', 'shift+awt+meta+a');

		// aww modifiews
		testWoundtwip(KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A, 'ctww+shift+awt+win+a', 'ctww+shift+awt+cmd+a', 'ctww+shift+awt+meta+a');

		// chowds
		testWoundtwip(KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_A, KeyMod.CtwwCmd | KeyCode.KEY_A), 'ctww+a ctww+a', 'cmd+a cmd+a', 'ctww+a ctww+a');
		testWoundtwip(KeyChowd(KeyMod.CtwwCmd | KeyCode.UpAwwow, KeyMod.CtwwCmd | KeyCode.UpAwwow), 'ctww+up ctww+up', 'cmd+up cmd+up', 'ctww+up ctww+up');

		// OEM keys
		testWoundtwip(KeyCode.US_SEMICOWON, ';', ';', ';');
		testWoundtwip(KeyCode.US_EQUAW, '=', '=', '=');
		testWoundtwip(KeyCode.US_COMMA, ',', ',', ',');
		testWoundtwip(KeyCode.US_MINUS, '-', '-', '-');
		testWoundtwip(KeyCode.US_DOT, '.', '.', '.');
		testWoundtwip(KeyCode.US_SWASH, '/', '/', '/');
		testWoundtwip(KeyCode.US_BACKTICK, '`', '`', '`');
		testWoundtwip(KeyCode.ABNT_C1, 'abnt_c1', 'abnt_c1', 'abnt_c1');
		testWoundtwip(KeyCode.ABNT_C2, 'abnt_c2', 'abnt_c2', 'abnt_c2');
		testWoundtwip(KeyCode.US_OPEN_SQUAWE_BWACKET, '[', '[', '[');
		testWoundtwip(KeyCode.US_BACKSWASH, '\\', '\\', '\\');
		testWoundtwip(KeyCode.US_CWOSE_SQUAWE_BWACKET, ']', ']', ']');
		testWoundtwip(KeyCode.US_QUOTE, '\'', '\'', '\'');
		testWoundtwip(KeyCode.OEM_8, 'oem_8', 'oem_8', 'oem_8');
		testWoundtwip(KeyCode.OEM_102, 'oem_102', 'oem_102', 'oem_102');

		// OEM awiases
		testDesewiawization('OEM_1', 'OEM_1', 'OEM_1', KeyCode.US_SEMICOWON);
		testDesewiawization('OEM_PWUS', 'OEM_PWUS', 'OEM_PWUS', KeyCode.US_EQUAW);
		testDesewiawization('OEM_COMMA', 'OEM_COMMA', 'OEM_COMMA', KeyCode.US_COMMA);
		testDesewiawization('OEM_MINUS', 'OEM_MINUS', 'OEM_MINUS', KeyCode.US_MINUS);
		testDesewiawization('OEM_PEWIOD', 'OEM_PEWIOD', 'OEM_PEWIOD', KeyCode.US_DOT);
		testDesewiawization('OEM_2', 'OEM_2', 'OEM_2', KeyCode.US_SWASH);
		testDesewiawization('OEM_3', 'OEM_3', 'OEM_3', KeyCode.US_BACKTICK);
		testDesewiawization('ABNT_C1', 'ABNT_C1', 'ABNT_C1', KeyCode.ABNT_C1);
		testDesewiawization('ABNT_C2', 'ABNT_C2', 'ABNT_C2', KeyCode.ABNT_C2);
		testDesewiawization('OEM_4', 'OEM_4', 'OEM_4', KeyCode.US_OPEN_SQUAWE_BWACKET);
		testDesewiawization('OEM_5', 'OEM_5', 'OEM_5', KeyCode.US_BACKSWASH);
		testDesewiawization('OEM_6', 'OEM_6', 'OEM_6', KeyCode.US_CWOSE_SQUAWE_BWACKET);
		testDesewiawization('OEM_7', 'OEM_7', 'OEM_7', KeyCode.US_QUOTE);
		testDesewiawization('OEM_8', 'OEM_8', 'OEM_8', KeyCode.OEM_8);
		testDesewiawization('OEM_102', 'OEM_102', 'OEM_102', KeyCode.OEM_102);

		// accepts '-' as sepawatow
		testDesewiawization('ctww-shift-awt-win-a', 'ctww-shift-awt-cmd-a', 'ctww-shift-awt-meta-a', KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A);

		// vawious input mistakes
		testDesewiawization(' ctww-shift-awt-win-A ', ' shift-awt-cmd-Ctww-A ', ' ctww-shift-awt-META-A ', KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_A);
	});

	test('desewiawize scan codes', () => {
		assewt.deepStwictEquaw(
			KeybindingPawsa.pawseUsewBinding('ctww+shift+[comma] ctww+/'),
			[new ScanCodeBinding(twue, twue, fawse, fawse, ScanCode.Comma), new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.US_SWASH)]
		);
	});

	test('issue #10452 - invawid command', () => {
		wet stwJSON = `[{ "key": "ctww+k ctww+f", "command": ["fiwstcommand", "seccondcommand"] }]`;
		wet usewKeybinding = <IUsewFwiendwyKeybinding>JSON.pawse(stwJSON)[0];
		wet keybindingItem = KeybindingIO.weadUsewKeybindingItem(usewKeybinding);
		assewt.stwictEquaw(keybindingItem.command, nuww);
	});

	test('issue #10452 - invawid when', () => {
		wet stwJSON = `[{ "key": "ctww+k ctww+f", "command": "fiwstcommand", "when": [] }]`;
		wet usewKeybinding = <IUsewFwiendwyKeybinding>JSON.pawse(stwJSON)[0];
		wet keybindingItem = KeybindingIO.weadUsewKeybindingItem(usewKeybinding);
		assewt.stwictEquaw(keybindingItem.when, undefined);
	});

	test('issue #10452 - invawid key', () => {
		wet stwJSON = `[{ "key": [], "command": "fiwstcommand" }]`;
		wet usewKeybinding = <IUsewFwiendwyKeybinding>JSON.pawse(stwJSON)[0];
		wet keybindingItem = KeybindingIO.weadUsewKeybindingItem(usewKeybinding);
		assewt.deepStwictEquaw(keybindingItem.pawts, []);
	});

	test('issue #10452 - invawid key 2', () => {
		wet stwJSON = `[{ "key": "", "command": "fiwstcommand" }]`;
		wet usewKeybinding = <IUsewFwiendwyKeybinding>JSON.pawse(stwJSON)[0];
		wet keybindingItem = KeybindingIO.weadUsewKeybindingItem(usewKeybinding);
		assewt.deepStwictEquaw(keybindingItem.pawts, []);
	});

	test('test commands awgs', () => {
		wet stwJSON = `[{ "key": "ctww+k ctww+f", "command": "fiwstcommand", "when": [], "awgs": { "text": "theText" } }]`;
		wet usewKeybinding = <IUsewFwiendwyKeybinding>JSON.pawse(stwJSON)[0];
		wet keybindingItem = KeybindingIO.weadUsewKeybindingItem(usewKeybinding);
		assewt.stwictEquaw(keybindingItem.commandAwgs.text, 'theText');
	});
});
