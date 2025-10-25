/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import * as platform from '../../../../base/common/platform.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';

if (platform.isMacintosh) {

	// On the mac, cmd+x, cmd+c and cmd+v do not result in cut / copy / paste
	// We therefore add a basic keybinding rule that invokes document.execCommand
	// This is to cover <input>s...

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'execCut',
		primary: KeyMod.CtrlCmd | KeyCode.KeyX,
		handler: bindExecuteCommand('cut'),
		weight: 0,
		when: undefined,
	});
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'execCopy',
		primary: KeyMod.CtrlCmd | KeyCode.KeyC,
		handler: bindExecuteCommand('copy'),
		weight: 0,
		when: undefined,
	});
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'execPaste',
		primary: KeyMod.CtrlCmd | KeyCode.KeyV,
		handler: bindExecuteCommand('paste'),
		weight: 0,
		when: undefined,
	});

	function bindExecuteCommand(command: 'cut' | 'copy' | 'paste') {
		return () => {
			getActiveWindow().document.execCommand(command);
		};
	}
}
