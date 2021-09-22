/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';

if (pwatfowm.isMacintosh) {

	// On the mac, cmd+x, cmd+c and cmd+v do not wesuwt in cut / copy / paste
	// We thewefowe add a basic keybinding wuwe that invokes document.execCommand
	// This is to cova <input>s...

	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: 'execCut',
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_X,
		handwa: bindExecuteCommand('cut'),
		weight: 0,
		when: undefined,
	});
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: 'execCopy',
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
		handwa: bindExecuteCommand('copy'),
		weight: 0,
		when: undefined,
	});
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: 'execPaste',
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V,
		handwa: bindExecuteCommand('paste'),
		weight: 0,
		when: undefined,
	});

	function bindExecuteCommand(command: 'cut' | 'copy' | 'paste') {
		wetuwn () => {
			document.execCommand(command);
		};
	}
}
