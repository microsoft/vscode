/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebview, IWebviewService, WebviewContentPurpose } from '../../../contrib/webview/browser/webview.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';

export interface IChatOutputItemRenderer {
	renderOutputPart(mime: string, data: Uint8Array, webview: IWebview, token: CancellationToken): Promise<void>;
}

export const IChatOutputRendererService = createDecorator<IChatOutputRendererService>('chatOutputRendererService');

interface RegisterOptions {
	readonly extension?: {
		readonly id: ExtensionIdentifier;
		readonly location: URI;
	};
}

export interface RenderedOutputPart extends IDisposable {
	readonly onDidChangeHeight: Event<number>;
}

export interface IChatOutputRendererService {
	readonly _serviceBrand: undefined;

	registerRenderer(mime: string, renderer: IChatOutputItemRenderer, options: RegisterOptions): IDisposable;

	renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, token: CancellationToken): Promise<RenderedOutputPart>;
}

export class ChatOutputRendererService extends Disposable implements IChatOutputRendererService {
	_serviceBrand: undefined;

	private readonly _renderers = new Map<string, {
		readonly renderer: IChatOutputItemRenderer;
		readonly options: RegisterOptions;
	}>();

	constructor(
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super();
	}

	registerRenderer(mime: string, renderer: IChatOutputItemRenderer, options: RegisterOptions): IDisposable {
		this._renderers.set(mime, { renderer, options });
		return {
			dispose: () => {
				this._renderers.delete(mime);
			}
		};
	}

	async renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, token: CancellationToken): Promise<RenderedOutputPart> {
		// Activate extensions that contribute to chatOutputRenderer for this mime type
		await this._extensionService.activateByEvent(`onChatOutputRenderer:${mime}`);

		const rendererData = this._renderers.get(mime);
		if (!rendererData) {
			throw new Error(`No renderer registered for mime type: ${mime}`);
		}

		const store = new DisposableStore();

		const webview = store.add(this._webviewService.createWebviewElement({
			title: '',
			origin: generateUuid(),
			options: {
				enableFindWidget: false,
				purpose: WebviewContentPurpose.ChatOutputItem,
				tryRestoreScrollPosition: false,
			},
			contentOptions: {},
			extension: rendererData.options.extension ? rendererData.options.extension : undefined,
		}));

		const onDidChangeHeight = store.add(new Emitter<number>());
		store.add(autorun(reader => {
			const height = reader.readObservable(webview.intrinsicContentSize);
			if (height) {
				onDidChangeHeight.fire(height.height);
				parent.style.height = `${height.height}px`;
			}
		}));

		webview.mountTo(parent, getWindow(parent));
		await rendererData.renderer.renderOutputPart(mime, data, webview, token);

		return {
			onDidChangeHeight: onDidChangeHeight.event,
			dispose: () => {
				store.dispose();
			}
		};
	}
}

interface IChatOutputRendererContribution {
	readonly mimeTypes: readonly string[];
}

ExtensionsRegistry.registerExtensionPoint<IChatOutputRendererContribution[]>({
	extensionPoint: 'chatOutputRenderer',
	activationEventsGenerator: (contributions: IChatOutputRendererContribution[], result) => {
		for (const contrib of contributions) {
			for (const mime of contrib.mimeTypes) {
				result.push(`onChatOutputRenderer:${mime}`);
			}
		}
	},
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.chatOutputRenderer', 'Contributes a renderer for specific MIME types in chat outputs'),
		type: 'array',
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['mimeTypes'],
			properties: {
				mimeTypes: {
					description: nls.localize('chatOutputRenderer.mimeTypes', 'MIME types that this renderer can handle'),
					type: 'array',
					items: {
						type: 'string'
					}
				}
			}
		}
	}
});
