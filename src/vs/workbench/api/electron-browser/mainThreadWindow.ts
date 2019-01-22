/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, MainContext, MainThreadWindowShape } from '../node/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IWindowService private readonly windowService: IWindowService,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(windowService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}

	$getWindowVisibility(): Promise<boolean> {
		return this.windowService.isFocused();
	}

	$openUri(uri: UriComponents): Promise<boolean> {
		return this.windowsService.openExternal(URI.revive(uri).toString(true));
	}
}
