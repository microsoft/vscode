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
 * Toggle widget for controlling whether to use exclude settings and ignore files in quick access searches.
 * This toggle is used in both the "Go to File" and "Quick Search" quick access providers.
 *
 * Primary reason was to be able to filter out the button in `QuickAccessToggleExcludesAction`,
 * but it also nicely encapsulates the toggle logic and presentation.
 */
export class UseExcludesAndIgnoreFilesToggle extends Toggle {
	constructor(@IKeybindingService keybindingService?: IKeybindingService) {
		// Configure exclude/ignore files toggle button with keybinding in title
		const excludeToggleKeybinding = keybindingService
			?.lookupKeybinding(Constants.SearchCommandIds.ToggleQuickAccessExcludesAndIgnoreFiles)?.getLabel();
		const localizedTitle = localize('useExcludesAndIgnoreFilesDescription', "Use Exclude Settings and Ignore Files");
		const title = excludeToggleKeybinding
			? `${localizedTitle} (${excludeToggleKeybinding})`
			: localizedTitle;

		super({
			icon: Codicon.exclude,
			title,
			// Always create the toggle as checked, so that quick access
			// searches apply "exclude settings and ignore files" by default.
			isChecked: true,
			...defaultToggleStyles
		});
	}

	/**
	 * Toggles the checked state and fires the onChange event.
	 */
	public toggle(): void {
		this.checked = !this.checked;
		this._onChange.fire(false);
	}
}

export function useExcludesAndIgnoreFilesToggleContributions(): void {
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
				?.find(toggle => toggle instanceof UseExcludesAndIgnoreFilesToggle)
				?.toggle();
		}
	});
}
