/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { matchesMimeType } from '../../../../base/common/dataTransfer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebview, IWebviewService, WebviewContentPurpose } from '../../../contrib/webview/browser/webview.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';

export interface IChatOutputItemRenderer {
	renderOutputPart(mime: string, data: Uint8Array, webview: IWebview, token: CancellationToken): Promise<void>;
}

interface RegisterOptions {
	readonly extension?: {
		readonly id: ExtensionIdentifier;
		readonly location: URI;
	};
}

export const IChatOutputRendererService = createDecorator<IChatOutputRendererService>('chatOutputRendererService');

export interface IChatOutputRendererService {
	readonly _serviceBrand: undefined;

	registerRenderer(mime: string, renderer: IChatOutputItemRenderer, options: RegisterOptions): IDisposable;

	renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart>;
}

export interface RenderedOutputPart extends IDisposable {
	readonly onDidChangeHeight: Event<number>;
	readonly webview: IWebview;

	reinitialize(): void;
}

interface RenderOutputPartWebviewOptions {
	readonly origin?: string;
}


interface RendererEntry {
	readonly renderer: IChatOutputItemRenderer;
	readonly options: RegisterOptions;
}

export class ChatOutputRendererService extends Disposable implements IChatOutputRendererService {
	_serviceBrand: undefined;

	private readonly _contributions = new Map</*viewType*/ string, {
		readonly mimes: readonly string[];
	}>();

	private readonly _renderers = new Map</*viewType*/ string, RendererEntry>();

	constructor(
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super();

		this._register(chatOutputRenderContributionPoint.setHandler(extensions => {
			this.updateContributions(extensions);
		}));
	}

	registerRenderer(viewType: string, renderer: IChatOutputItemRenderer, options: RegisterOptions): IDisposable {
		this._renderers.set(viewType, { renderer, options });
		return {
			dispose: () => {
				this._renderers.delete(viewType);
			}
		};
	}

	async renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart> {
		const rendererData = await this.getRenderer(mime, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		if (!rendererData) {
			throw new Error(`No renderer registered found for mime type: ${mime}`);
		}

		const store = new DisposableStore();

		const webview = store.add(this._webviewService.createWebviewElement({
			title: '',
			origin: webviewOptions.origin ?? generateUuid(),
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
			get webview() { return webview; },
			onDidChangeHeight: onDidChangeHeight.event,
			dispose: () => {
				store.dispose();
			},
			reinitialize: () => {
				webview.reinitializeAfterDismount();
			},
		};
	}

	private async getRenderer(mime: string, token: CancellationToken): Promise<RendererEntry | undefined> {
		await raceCancellationError(this._extensionService.whenInstalledExtensionsRegistered(), token);
		for (const [id, value] of this._contributions) {
			if (value.mimes.some(m => matchesMimeType(m, [mime]))) {
				await raceCancellationError(this._extensionService.activateByEvent(`onChatOutputRenderer:${id}`), token);
				const rendererData = this._renderers.get(id);
				if (rendererData) {
					return rendererData;
				}
			}
		}

		return undefined;
	}

	private updateContributions(extensions: readonly IExtensionPointUser<readonly IChatOutputRendererContribution[]>[]) {
		this._contributions.clear();
		for (const extension of extensions) {
			if (!isProposedApiEnabled(extension.description, 'chatOutputRenderer')) {
				continue;
			}

			for (const contribution of extension.value) {
				if (this._contributions.has(contribution.viewType)) {
					extension.collector.error(`Chat output renderer with view type '${contribution.viewType}' already registered`);
					continue;
				}

				this._contributions.set(contribution.viewType, {
					mimes: contribution.mimeTypes,
				});
			}
		}
	}
}

const chatOutputRendererContributionSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['viewType', 'mimeTypes'],
	properties: {
		viewType: {
			type: 'string',
			description: nls.localize('chatOutputRenderer.viewType', 'Unique identifier for the renderer.'),
		},
		mimeTypes: {
			type: 'array',
			description: nls.localize('chatOutputRenderer.mimeTypes', 'MIME types that this renderer can handle'),
			items: {
				type: 'string'
			}
		}
	}
} as const satisfies IJSONSchema;

type IChatOutputRendererContribution = TypeFromJsonSchema<typeof chatOutputRendererContributionSchema>;

const chatOutputRenderContributionPoint = ExtensionsRegistry.registerExtensionPoint<IChatOutputRendererContribution[]>({
	extensionPoint: 'chatOutputRenderers',
	activationEventsGenerator: function* (contributions) {
		for (const contrib of contributions) {
			yield `onChatOutputRenderer:${contrib.viewType}`;
		}
	},
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.chatOutputRenderer', 'Contributes a renderer for specific MIME types in chat outputs'),
		type: 'array',
		items: chatOutputRendererContributionSchema,
	}
});

