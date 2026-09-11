/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { inQuickInputContext } from '../../../../platform/quickinput/browser/quickInput.js';
import { IQuickInputService, QuickInputCommandId } from '../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';

/** Provides keyboard navigation and resize guidance for quick inputs. */
export class QuickInputAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'quickInput';
	readonly type = AccessibleViewType.Help;
	readonly when = inQuickInputContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const quickInputService = accessor.get(IQuickInputService);
		const quickInput = quickInputService.currentQuickInput;
		if (!quickInput) {
			return undefined;
		}

		const previousIgnoreFocusOut = quickInput.ignoreFocusOut;
		return new AccessibleContentProvider(
			AccessibleViewProviderId.QuickInputHelp,
			{ type: AccessibleViewType.Help },
			() => {
				const content = [
					localize('quickInput.header', "Accessibility Help: Quick Input"),
					localize('quickInput.navigation', "Type to filter available items, use the Up and Down Arrow keys to navigate, press Enter to accept the active item, and press Escape to close the quick input."),
					''
				];

				if (quickInput.anchor) {
					content.push(localize('quickInput.anchored', "This quick input is anchored and cannot be resized."));
				} else {
					content.push(localize('quickInput.resize', "Use the following commands to resize this quick input. Assign keybindings to any commands that are currently unassigned:"));
					content.push(localize('quickInput.increaseWidth', "- Increase width: {0}", `<keybinding:${QuickInputCommandId.IncreaseWidth}>`));
					content.push(localize('quickInput.decreaseWidth', "- Decrease width: {0}", `<keybinding:${QuickInputCommandId.DecreaseWidth}>`));
					content.push(localize('quickInput.increaseHeight', "- Increase height: {0}", `<keybinding:${QuickInputCommandId.IncreaseHeight}>`));
					content.push(localize('quickInput.decreaseHeight', "- Decrease height: {0}", `<keybinding:${QuickInputCommandId.DecreaseHeight}>`));
					content.push(localize('quickInput.resetSize', "- Reset size: {0}", `<keybinding:${QuickInputCommandId.ResetSize}>`));
				}

				return content.join('\n');
			},
			() => {
				quickInput.ignoreFocusOut = previousIgnoreFocusOut;
				quickInputService.focus();
			},
			AccessibilityVerbositySettingId.QuickInput,
			() => quickInput.ignoreFocusOut = true
		);
	}
}
