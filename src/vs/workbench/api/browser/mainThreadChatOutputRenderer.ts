/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IChatOutputRendererService } from '../../contrib/chat/browser/chatOutputItemRenderer.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatOutputRendererShape, ExtHostContext, MainThreadChatOutputRendererShape } from '../common/extHost.protocol.js';
import { MainThreadWebviews } from './mainThreadWebviews.js';

export class MainThreadChatOutputRenderer extends Disposable implements MainThreadChatOutputRendererShape {

	private readonly _proxy: ExtHostChatOutputRendererShape;

	private _webviewHandlePool = 0;

	private readonly registeredRenderers = new Map</* viewType */ string, IDisposable>();
	private readonly modalOpeners = this._register(new DisposableMap<string, IChatOutputModalOpener>());

	constructor(
		extHostContext: IExtHostContext,
		private readonly _mainThreadWebview: MainThreadWebviews,
		@IChatOutputRendererService private readonly _rendererService: IChatOutputRendererService,
		@ILogService private readonly _logService: ILogService,
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
		const existingRegistration = this.registeredRenderers.get(viewType);
		if (existingRegistration) {
			this._logService.warn(`Re-registering chat output renderer for view type '${viewType}' from extension '${extensionId.value}'.`);
			existingRegistration.dispose();
		}

		const disposable = this._rendererService.registerRenderer(viewType, {
			renderOutputPart: async (mime, data, webview, context, token) => {
				const webviewHandle = `chat-output-${++this._webviewHandlePool}`;

				this._mainThreadWebview.addWebview(webviewHandle, webview, {
					serializeBuffersForPostMessage: true,
				});
				const store = new DisposableStore();
				store.add(webview.onDidDispose(() => this.modalOpeners.deleteAndDispose(webviewHandle)));
				this.modalOpeners.set(webviewHandle, {
					open: title => this._rendererService.openOutputInModal(viewType, mime, data, context, title),
					dispose: () => store.dispose(),
				});

				return this._proxy.$renderChatOutput(viewType, mime, VSBuffer.wrap(data), webviewHandle, context, token);
			},
		}, {
			extension: { id: extensionId, location: URI.revive(extensionLocation) }
		});
		this.registeredRenderers.set(viewType, disposable);
	}

	$unregisterChatOutputRenderer(viewType: string): void {
		this.registeredRenderers.get(viewType)?.dispose();
		this.registeredRenderers.delete(viewType);
	}

	$openChatOutputInModal(webviewHandle: string, title: string | undefined): Promise<void> {
		const opener = this.modalOpeners.get(webviewHandle);
		if (!opener) {
			throw new Error(`No chat output found for webview '${webviewHandle}'.`);
		}
		return opener.open(title);
	}
}

interface IChatOutputModalOpener extends IDisposable {
	open(title: string | undefined): Promise<void>;
}
