/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IChatOutputRendererService } from '../../contrib/chat/browser/chatOutputItemRenderer.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatOutputRendererShape, ExtHostContext, MainThreadChatOutputRendererShape } from '../common/extHost.protocol.js';
import { MainThreadWebviews } from './mainThreadWebviews.js';

export class MainThreadChatOutputRenderer extends Disposable implements MainThreadChatOutputRendererShape {

	private readonly _proxy: ExtHostChatOutputRendererShape;

	private _webviewHandlePool = 0;

	private readonly registeredRenderers = new Map</* viewType */ string, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		private readonly _mainThreadWebview: MainThreadWebviews,
		@IChatOutputRendererService private readonly _rendererService: IChatOutputRendererService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatOutputRenderer);
	}

	override dispose(): void {
		super.dispose();

		this.registeredRenderers.forEach(disposable => disposable.dispose());
		this.registeredRenderers.clear();
	}

	$registerChatOutputRenderer(viewType: string, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): void {
		this._rendererService.registerRenderer(viewType, {
			renderOutputPart: async (mime, data, webview, token) => {
				const webviewHandle = `chat-output-${++this._webviewHandlePool}`;

				this._mainThreadWebview.addWebview(webviewHandle, webview, {
					serializeBuffersForPostMessage: true,
				});

				this._proxy.$renderChatOutput(viewType, mime, VSBuffer.wrap(data), webviewHandle, token);
			},
		}, {
			extension: { id: extensionId, location: URI.revive(extensionLocation) }
		});
	}

	$unregisterChatOutputRenderer(viewType: string): void {
		this.registeredRenderers.get(viewType)?.dispose();
	}
}
