/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { OpenEditorCommandId } from '../../../../workbench/contrib/searchEditor/browser/constants.js';

KeybindingsRegistry.registerKeybindingRule({
	id: OpenEditorCommandId,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
	weight: KeybindingWeight.WorkbenchContrib,
});
