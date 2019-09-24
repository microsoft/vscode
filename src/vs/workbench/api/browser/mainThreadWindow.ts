/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, IOpenUriOptions, MainContext, MainThreadWindowShape } from '../common/extHost.protocol';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private readonly disposables = new DisposableStore();
	private readonly resolved = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IWindowService private readonly windowService: IWindowService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(windowService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	dispose(): void {
		this.disposables.dispose();

		for (const value of this.resolved.values()) {
			value.dispose();
		}
		this.resolved.clear();
	}

	$getWindowVisibility(): Promise<boolean> {
		return this.windowService.isFocused();
	}

	async $openUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<boolean> {
		const uri = URI.from(uriComponents);
		return this.openerService.open(uri, { openExternal: true, allowTunneling: options.allowTunneling });
	}

	async $resolveExternalUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<UriComponents> {
		const uri = URI.revive(uriComponents);
		const result = await this.openerService.resolveExternalUri(uri, options);
		return result.resolved;
	}
}
