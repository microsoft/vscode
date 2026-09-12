/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, type IDisposable } from '../../../../base/common/lifecycle.js';
import { accessibleViewIsShown } from './accessibilityConfiguration.js';
import { AccessibilityHelpAction, AccessibleViewAction } from './accessibleViewActions.js';
import { AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, type IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export class AccesibleViewHelpContribution extends Disposable {
	static readonly ID = 'accesibleViewHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(115, 'accessible-view-help', accessor => {
			accessor.get(IAccessibleViewService).showAccessibleViewHelp();
			return true;
		}, accessibleViewIsShown));
	}
}

export class AccesibleViewContributions extends Disposable {
	static readonly ID = 'accesibleViewContributions';
	private readonly _implementations = this._register(new DisposableMap<IAccessibleViewImplementation, IDisposable>());

	constructor() {
		super();
		this._register(AccessibleViewRegistry.onDidChange(() => this._updateImplementations()));
		this._updateImplementations();
	}

	private _updateImplementations(): void {
		const implementations = new Set(AccessibleViewRegistry.getImplementations());
		for (const implementation of this._implementations.keys()) {
			if (!implementations.has(implementation)) {
				this._implementations.deleteAndDispose(implementation);
			}
		}
		for (const impl of implementations) {
			if (this._implementations.has(impl)) {
				continue;
			}
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
				this._implementations.set(impl, AccessibleViewAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
			} else {
				this._implementations.set(impl, AccessibilityHelpAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
			}
		}
	}
}
