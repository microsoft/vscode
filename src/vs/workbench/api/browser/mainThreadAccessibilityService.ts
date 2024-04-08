/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadAccessibilityServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAccessibilityHelpProviderService } from 'vs/workbench/contrib/accessibility/browser/accessibilityHelpProviderService';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { AccessibilityHelpProvider } from 'vscode';

@extHostNamedCustomer(MainContext.MainThreadAccessibilityService)
export class MainThreadAccessibilityService implements MainThreadAccessibilityServiceShape {
	constructor(extHostContext: IExtHostContext, @IAccessibilityHelpProviderService private readonly _accessibilityHelpProviderService: IAccessibilityHelpProviderService) {
	}
	dispose(): void {
		throw new Error('Method not implemented.');
	}
	$unregisterAccessibilityHelpProvider(id: string): void {
		throw new Error('Method not implemented.');
	}
	$registerAccessibilityHelpProvider(provider: AccessibilityHelpProvider): void {
		this._accessibilityHelpProviderService.registerAccessibilityHelpProvider(provider);
	}
}
