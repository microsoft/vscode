/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWebview, IWebviewService } from '../../../contrib/webview/browser/webview.js';

export interface IChatOutputItemRenderer {
	renderOutputPart(mime: string, data: Uint8Array, webivew: IWebview, token: CancellationToken): Promise<void>;
}

export const IChatOutputItemRendererService = createDecorator<IChatOutputItemRendererService>('chatOutputItemRendererService');

/**
 * Service for rendering chat output items with special MIME types using registered renderers from extensions.
 */
export interface IChatOutputItemRendererService {
	readonly _serviceBrand: undefined;

	registerRenderer(mime: string, renderer: IChatOutputItemRenderer): IDisposable;

	renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, token: CancellationToken): Promise<IDisposable>;
}

/**
 * Implementation of the IChatOutputItemRendererService.
 * This service connects with the MainThreadChatResponseOutputRenderer to render output parts
 * in chat responses using extension-provided renderers.
 */
export class ChatOutputItemRendererService extends Disposable implements IChatOutputItemRendererService {
	_serviceBrand: undefined;

	private readonly _renderers = new Map<string, IChatOutputItemRenderer>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super();
		this._logService.debug('ChatOutputItemRendererService: Created');
	}

	registerRenderer(mime: string, renderer: IChatOutputItemRenderer): IDisposable {
		this._renderers.set(mime, renderer);
		this._logService.debug(`ChatOutputItemRendererService: Registered renderer for MIME type ${mime}`);
		return {
			dispose: () => {
				this._renderers.delete(mime);
			}
		};
	}

	async renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, token: CancellationToken): Promise<IDisposable> {
		const renderer = this._renderers.get(mime);
		if (!renderer) {
			throw new Error(`No renderer registered for mime type: ${mime}`);
		}

		const webview = this._webviewService.createWebviewElement({
			title: 'My fancy chat renderer',
			origin: generateUuid(),
			options: {

			},
			contentOptions: {
				localResourceRoots: [],
				allowScripts: true,
			},
			extension: { id: new ExtensionIdentifier('xxx.yyy'), location: URI.file('/') }
		});

		parent.style = 'max-height: 80vh; width: 100%;';
		webview.mountTo(parent, getWindow(parent));

		await renderer.renderOutputPart(mime, data, webview, token);

		return {
			dispose: () => { }
		};
	}
}

// Register the service
registerSingleton(IChatOutputItemRendererService, ChatOutputItemRendererService, InstantiationType.Delayed);

