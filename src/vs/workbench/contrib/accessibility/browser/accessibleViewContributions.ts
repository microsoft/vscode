/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import * as strings from 'vs/base/common/strings';
import { AccessibilityHelpAction, AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { AccessibleViewType, AdvancedContentProvider, ExtensionContentProvider, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return strings.format(msg, kb.getAriaLabel());
	}
	return strings.format(noKbMsg, commandId);
}


export class AccesibleViewHelpContribution extends Disposable {
	static ID: 'accesibleViewHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(115, 'accessible-view-help', accessor => {
			accessor.get(IAccessibleViewService).showAccessibleViewHelp();
			return true;
		}, accessibleViewIsShown));
	}
}

export class AccesibleViewContributions extends Disposable {
	static ID: 'accesibleViewContributions';
	constructor() {
		super();
		AccessibleViewRegistry.getImplementations().forEach(impl => {
			const implementation = (accessor: ServicesAccessor) => {
				const provider: AdvancedContentProvider | ExtensionContentProvider | undefined = impl.getProvider(accessor);
				if (provider) {
					accessor.get(IAccessibleViewService).show(provider);
					return true;
				}
				return false;
			};
			if (impl.type === AccessibleViewType.View) {
				this._register(AccessibleViewAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
			} else {
				this._register(AccessibilityHelpAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
			}
		});
	}
}
