/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './accessibility.css';
import * as nls from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { accessibilityHelpIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { AccessibilityHelpNLS } from '../../../../../editor/common/standaloneStrings.js';

class ToggleScreenReaderMode extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleScreenReaderAccessibilityMode',
			title: nls.localize2('toggleScreenReaderMode', "Toggle Screen Reader Accessibility Mode"),
			metadata: {
				description: nls.localize2('toggleScreenReaderModeDescription', "Toggles an optimized mode for usage with screen readers, braille devices, and other assistive technologies."),
			},
			f1: true,
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyCode.KeyE,
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: accessibilityHelpIsShown
			},
			{
				primary: KeyMod.Alt | KeyCode.F1 | KeyMod.Shift,
				linux: { primary: KeyMod.Alt | KeyCode.F4 | KeyMod.Shift },
				weight: KeybindingWeight.WorkbenchContrib + 10,
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const accessibiiltyService = accessor.get(IAccessibilityService);
		const configurationService = accessor.get(IConfigurationService);
		const isScreenReaderOptimized = accessibiiltyService.isScreenReaderOptimized();
		configurationService.updateValue('editor.accessibilitySupport', isScreenReaderOptimized ? 'off' : 'on', ConfigurationTarget.USER);
		alert(isScreenReaderOptimized ? AccessibilityHelpNLS.screenReaderModeDisabled : AccessibilityHelpNLS.screenReaderModeEnabled);
	}
}

registerAction2(ToggleScreenReaderMode);
