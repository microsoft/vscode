/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, IOpenUriOptions, MainContext, MainThreadWindowShape } from '../common/extHost.protocol';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Schemas } from 'vs/base/common/network';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private readonly disposables = new DisposableStore();
	private readonly resolved = new Map<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IHostService private readonly hostService: IHostService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(hostService.onDidChangeFocus)
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
		return Promise.resolve(this.hostService.hasFocus);
	}

	async $openUri(stringOrComp: UriComponents | string, options: IOpenUriOptions): Promise<boolean> {

		const uri = typeof stringOrComp === 'string'
			? URI.parse(stringOrComp)
			: URI.revive(stringOrComp);

		// validate
		if (isFalsyOrWhitespace(uri.scheme)) {
			return Promise.reject('Invalid scheme - cannot be empty');
		} else if (uri.scheme === Schemas.command) {
			return Promise.reject(`Invalid scheme '${uri.scheme}'`);
		}

		// open AS-IS, keep string alive
		if (typeof stringOrComp === 'string') {
			return this.openerService.open(stringOrComp, { openExternal: true, allowTunneling: options.allowTunneling });
		} else {
			return this.openerService.open(uri, { openExternal: true, allowTunneling: options.allowTunneling });
		}
	}

	async $asExternalUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<UriComponents> {
		const uri = URI.revive(uriComponents);
		const result = await this.openerService.resolveExternalUri(uri, options);
		return result.resolved;
	}
}
