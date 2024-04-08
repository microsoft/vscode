/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { MainContext, MainThreadAccessibilityServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAccessibilityHelpProviderService } from 'vs/workbench/contrib/accessibility/browser/accessibilityHelpProviderService';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { AccessibilityHelpProvider } from 'vscode';

@extHostNamedCustomer(MainContext.MainThreadAccessibilityService)
export class MainThreadAccessibilityService implements MainThreadAccessibilityServiceShape {
	private readonly _providers = new Map<string, IDisposable>();
	constructor(extHostContext: IExtHostContext,
		@IAccessibilityHelpProviderService private readonly _accessibilityHelpProviderService: IAccessibilityHelpProviderService) {
	}
	dispose(): void {
		for (const provider of this._providers.values()) {
			provider.dispose();
		}
	}
	$unregisterAccessibilityHelpProvider(id: string): void {
		this._providers.get(id)?.dispose();
		this._providers.delete(id);
	}
	$registerAccessibilityHelpProvider(provider: AccessibilityHelpProvider): void {
		if (this._providers.has(provider.id)) {
			return;
		}
		this._providers.set(provider.id, this._accessibilityHelpProviderService.registerAccessibilityHelpProvider(provider));
	}
}
