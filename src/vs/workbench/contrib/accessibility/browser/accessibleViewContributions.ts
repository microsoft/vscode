/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { accessibleViewIsShown } from './accessibilityConfiguration.js';
import { AccessibilityHelpAction, AccessibleViewAction } from './accessibleViewActions.js';
import { AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

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
				const provider: AccessibleContentProvider | ExtensionContentProvider | undefined = impl.getProvider(accessor);
				if (!provider) {
					return false;
				}
				try {
					accessor.get(IAccessibleViewService).show(provider);
					return true;
				} catch {
					provider.dispose();
					return false;
				}
			};
			if (impl.type === AccessibleViewType.View) {
				this._register(AccessibleViewAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
			} else {
				this._register(AccessibilityHelpAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
			}
		});
	}
}
