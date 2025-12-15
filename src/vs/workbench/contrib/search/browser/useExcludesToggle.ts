/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { InQuickInputContextKey } from '../../../../platform/quickinput/browser/quickInput.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import * as Constants from '../common/constants.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

/**
 * Toggle widget for controlling whether exclude settings and ignore files are used in quick access searches.
 * When checked (default), exclude settings and ignore files are used. When unchecked, they are disregarded.
 */
export class UseExcludesToggle extends Toggle {
	constructor(@IKeybindingService keybindingService?: IKeybindingService) {
		const keyBinding = keybindingService?.lookupKeybinding(Constants.SearchCommandIds.ToggleQuickAccessExcludesAndIgnoreFiles)?.getLabel();
		const localizedTitle = localize('useExcludesDescription', "Use Exclude Settings and Ignore Files");
		const title = keyBinding ? `${localizedTitle} (${keyBinding})` : localizedTitle;

		super({
			icon: Codicon.exclude,
			title,
			isChecked: true,
			...defaultToggleStyles
		});
	}
}

export function useExcludesToggleContributions(): void {
	registerAction2(class QuickAccessToggleExcludesAction extends Action2 {
		constructor() {
			super({
				id: Constants.SearchCommandIds.ToggleQuickAccessExcludesAndIgnoreFiles,
				title: localize('toggleUseExcludesAndIgnoreFiles', "Toggle Use Exclude Settings and Ignore Files"),
				keybinding: {
					when: InQuickInputContextKey,
					primary: KeyMod.CtrlCmd | KeyCode.Period,
					weight: KeybindingWeight.WorkbenchContrib,
				}
			});
		}

		run(accessor: ServicesAccessor): void {
			const quickInputService = accessor.get(IQuickInputService);
			const currentQuickInput = quickInputService.currentQuickInput;

			currentQuickInput
				?.toggles
				?.find(toggle => toggle instanceof UseExcludesToggle)
				?.toggle();
		}
	});
}
