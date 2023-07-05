/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./accessibility';
import * as nls from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { accessibilityHelpIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
class ToggleScreenReaderMode extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleScreenReaderAccessibilityMode',
			title: { value: nls.localize('toggleScreenReaderMode', "Toggle Screen Reader Accessibility Mode"), original: 'Toggle Screen Reader Accessibility Mode' },
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyE,
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: accessibilityHelpIsShown
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const accessibiiltyService = accessor.get(IAccessibilityService);
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue('editor.accessibilitySupport', accessibiiltyService.isScreenReaderOptimized() ? 'off' : 'on', ConfigurationTarget.USER);
	}
}

registerAction2(ToggleScreenReaderMode);
