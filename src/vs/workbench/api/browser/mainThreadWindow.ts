/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IHostService } from '../../services/host/browser/host.js';
import { IUserActivityService } from '../../services/userActivity/common/userActivityService.js';
import { ExtHostContext, ExtHostWindowShape, IOpenUriOptions, MainContext, MainThreadWindowShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private readonly disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IHostService private readonly hostService: IHostService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IUserActivityService private readonly userActivityService: IUserActivityService,
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(hostService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
		userActivityService.onDidChangeIsActive(this.proxy.$onDidChangeWindowActive, this.proxy, this.disposables);
		this.registerNativeHandle();
	}

	dispose(): void {
		this.disposables.dispose();
	}

	registerNativeHandle(): void {
		Event.latch(this.hostService.onDidChangeActiveWindow)(
			async windowId => {
				const handle = await this.hostService.getNativeWindowHandle(windowId);
				this.proxy.$onDidChangeActiveNativeWindowHandle(handle ? encodeBase64(handle) : undefined);
			},
			this,
			this.disposables
		);
	}

	$getInitialState() {
		return Promise.resolve({
			isFocused: this.hostService.hasFocus,
			isActive: this.userActivityService.isActive,
		});
	}

	async $openUri(uriComponents: UriComponents, uriString: string | undefined, options: IOpenUriOptions): Promise<boolean> {
		const uri = URI.from(uriComponents);
		let target: URI | string;
		if (uriString && URI.parse(uriString).toString() === uri.toString()) {
			// called with string and no transformation happened -> keep string
			target = uriString;
		} else {
			// called with URI or transformed -> use uri
			target = uri;
		}
		return this.openerService.open(target, {
			openExternal: true,
			allowTunneling: options.allowTunneling,
			allowContributedOpeners: options.allowContributedOpeners,
		});
	}

	async $asExternalUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<UriComponents> {
		const uri = URI.revive(uriComponents);
		const result = await this.openerService.resolveExternalUri(uri, options);
		return result.resolved;
	}

	async $openChatSession(sessionType: string, id: string): Promise<void> {
		// TODO: should live in chat instead

		// Create a URI with the chat session scheme
		const chatSessionUri = URI.from({
			scheme: Schemas.vscodeChatSession,
			authority: sessionType,
			path: `/${id}`
		});


		// TODO: Integrate with the chat service to open the session in the chat view
		// For now, we'll just open the URI
		await this.openerService.open(chatSessionUri);
	}
}
