/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowService } from 'vs/platform/windows/common/windows';
import { MainThreadWindowShape, ExtHostWindowShape, ExtHostContext, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { Event } from 'vs/base/common/event';
import { UriComponents, URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IWindowService private readonly windowService: IWindowService,
		@ICommandService private readonly commandService: ICommandService,
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

	$openUri(uri: UriComponents): Promise<any> {
		// todo@joh turn this around and let the command work with
		// the proper implementation
		return this.commandService.executeCommand('_workbench.open', URI.revive(uri));
	}
}
