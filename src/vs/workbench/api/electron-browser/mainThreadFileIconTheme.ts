/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IExtHostContext, MainContext, MainThreadFileIconThemeShape } from '../node/extHost.protocol';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';

@extHostNamedCustomer(MainContext.MainThreadFileIconTheme)
export class MainThreadFileIconTheme implements MainThreadFileIconThemeShape {
	constructor(
		extHostContext: IExtHostContext,
		@IWorkbenchThemeService private readonly _workbenchThemeService: WorkbenchThemeService
	) {
	}

	public dispose(): void {
	}

	public $reloadFileIconTheme(): Thenable<void> {
		return this._workbenchThemeService.reloadFileIconTheme();
	}
}