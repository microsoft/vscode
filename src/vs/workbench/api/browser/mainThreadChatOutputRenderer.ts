/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { IChatOutputItemRendererService } from '../../contrib/chat/browser/chatOutputItemRenderer.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatOutputRendererShape, ExtHostContext, MainThreadChatOutputRendererShape } from '../common/extHost.protocol.js';
import { MainThreadWebviews } from './mainThreadWebviews.js';

export class MainThreadChatOutputRenderer extends Disposable implements MainThreadChatOutputRendererShape {

	private readonly _proxy: ExtHostChatOutputRendererShape;

	private _webviewHandlePool = 0;

	private readonly registeredRenderers = new Map<string, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		private readonly _mainThreadWebview: MainThreadWebviews,
		@IChatOutputItemRendererService private readonly _rendererService: IChatOutputItemRendererService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatOutputRenderer);
	}

	override dispose(): void {
		super.dispose();

		this.registeredRenderers.forEach(disposable => disposable.dispose());
		this.registeredRenderers.clear();
	}

	$registerChatOutputRenderer(mime: string): void {
		this._rendererService.registerRenderer(mime, {
			renderOutputPart: async (mime, data, webview, token) => {
				const webviewHandle = `chat-output-${++this._webviewHandlePool}`;

				this._mainThreadWebview.addWebview(webviewHandle, webview, {
					serializeBuffersForPostMessage: true,
				});

				this._proxy.$renderChatPart(mime, VSBuffer.wrap(data), webviewHandle, token);
			},
		});
	}

	$unregisterChatOutputRenderer(mime: string): void {
		this.registeredRenderers.get(mime)?.dispose();
	}
}
