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
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebview, IWebviewService, WebviewContentPurpose } from '../../../contrib/webview/browser/webview.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';

export interface IChatOutputItemRenderer {
	renderOutputPart(mime: string, data: Uint8Array, webview: IWebview, context: IChatOutputRenderContext, token: CancellationToken): Promise<void>;
}

export interface IChatOutputRenderContext {
	readonly codeBlockContext?: {
		readonly languageIdentifier: string;
	};
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

	registerRenderer(viewType: string, renderer: IChatOutputItemRenderer, options: RegisterOptions): IDisposable;

	hasCodeBlockRenderer(languageIdentifier: string): boolean;

	renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart>;

	renderCodeBlock(languageIdentifier: string, data: Uint8Array, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart>;
}

export interface RenderedOutputPart extends IDisposable {
	readonly onDidChangeHeight: Event<number>;
	readonly webview: IWebview;

	reinitialize(): void;
}

interface RenderOutputPartWebviewOptions {
	readonly title?: string;
	readonly origin?: string;
	readonly webviewState?: string;
}

interface ContributionEntry {
	readonly mimes: readonly string[];
	readonly codeBlockLanguageIdentifiers: readonly string[];
}

interface RendererEntry {
	readonly viewType: string;
	readonly renderer: IChatOutputItemRenderer;
	readonly options: RegisterOptions;
}

export class ChatOutputRendererService extends Disposable implements IChatOutputRendererService {
	_serviceBrand: undefined;

	private readonly _contributions = new Map</*viewType*/ string, ContributionEntry>();

	private readonly _renderers = new Map</*viewType*/ string, RendererEntry>();

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super();

		this._register(chatOutputRenderContributionPoint.setHandler(extensions => {
			this.updateContributions(extensions);
		}));
	}

	registerRenderer(viewType: string, renderer: IChatOutputItemRenderer, options: RegisterOptions): IDisposable {
		this._renderers.set(viewType, { viewType, renderer, options });
		return {
			dispose: () => {
				this._renderers.delete(viewType);
			}
		};
	}

	hasCodeBlockRenderer(languageIdentifier: string): boolean {
		return Array.from(this._contributions.values()).some(value => value.codeBlockLanguageIdentifiers.some(identifier => equalsIgnoreCase(identifier, languageIdentifier)));
	}

	async renderOutputPart(mime: string, data: Uint8Array, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart> {
		const rendererData = await this.getRendererForMime(mime, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		if (!rendererData) {
			throw new Error(`No renderer registered found for mime type: ${mime}`);
		}

		return this.doRenderOutputPart(rendererData, mime, data, {}, parent, webviewOptions, token);
	}

	async renderCodeBlock(languageIdentifier: string, data: Uint8Array, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart> {
		const rendererData = await this.getRendererForCodeBlock(languageIdentifier, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		if (!rendererData) {
			throw new Error(`No renderer registered found for code block language identifier: ${languageIdentifier}`);
		}

		return this.doRenderOutputPart(rendererData, 'text/x-vscode-chat-code-block', data, { codeBlockContext: { languageIdentifier } }, parent, webviewOptions, token);
	}

	private async doRenderOutputPart(rendererData: RendererEntry, mime: string, data: Uint8Array, context: IChatOutputRenderContext, parent: HTMLElement, webviewOptions: RenderOutputPartWebviewOptions, token: CancellationToken): Promise<RenderedOutputPart> {

		const store = new DisposableStore();

		const webview = store.add(this._webviewService.createWebviewElement({
			title: webviewOptions.title ?? '',
			origin: webviewOptions.origin ?? generateUuid(),
			providedViewType: rendererData.viewType,
			options: {
				enableFindWidget: false,
				purpose: WebviewContentPurpose.ChatOutputItem,
				tryRestoreScrollPosition: false,
			},
			contentOptions: {},
			extension: rendererData.options.extension ? rendererData.options.extension : undefined,
		}));
		webview.setContextKeyService(store.add(this._contextKeyService.createScoped(parent)));

		const onDidChangeHeight = store.add(new Emitter<number>());
		store.add(autorun(reader => {
			const height = reader.readObservable(webview.intrinsicContentSize);
			if (height) {
				onDidChangeHeight.fire(height.height);
				parent.style.height = `${height.height}px`;
			}
		}));

		if (webviewOptions.webviewState) {
			webview.state = webviewOptions.webviewState;
		}

		webview.mountTo(parent, getWindow(parent));
		await rendererData.renderer.renderOutputPart(mime, data, webview, context, token);

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

	private async getRendererForMime(mime: string, token: CancellationToken): Promise<RendererEntry | undefined> {
		return this.getRenderer(value => value.mimes.some(m => matchesMimeType(m, [mime])), token);
	}

	private async getRendererForCodeBlock(languageIdentifier: string, token: CancellationToken): Promise<RendererEntry | undefined> {
		return this.getRenderer(value => value.codeBlockLanguageIdentifiers.some(identifier => equalsIgnoreCase(identifier, languageIdentifier)), token);
	}

	private async getRenderer(matches: (value: ContributionEntry) => boolean, token: CancellationToken): Promise<RendererEntry | undefined> {
		await raceCancellationError(this._extensionService.whenInstalledExtensionsRegistered(), token);
		for (const [id, value] of this._contributions) {
			if (matches(value)) {
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

				const mimeTypes = contribution.mimeTypes ?? [];
				const codeBlockLanguageIdentifiers = contribution.codeBlockLanguageIdentifiers ?? [];
				if (!mimeTypes.length && !codeBlockLanguageIdentifiers.length) {
					extension.collector.error(`Chat output renderer with view type '${contribution.viewType}' must specify at least one mime type or code block language identifier`);
					continue;
				}

				this._contributions.set(contribution.viewType, {
					mimes: mimeTypes,
					codeBlockLanguageIdentifiers,
				});
			}
		}
	}
}

const chatOutputRendererContributionSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['viewType'],
	properties: {
		viewType: {
			type: 'string',
			description: nls.localize('chatOutputRenderer.viewType', 'Unique identifier for the renderer.'),
		},
		mimeTypes: {
			type: 'array',
			description: nls.localize('chatOutputRenderer.mimeTypes', 'MIME types that this renderer can handle'),
			uniqueItems: true,
			items: {
				type: 'string'
			}
		},
		codeBlockLanguageIdentifiers: {
			type: 'array',
			description: nls.localize('chatOutputRenderer.codeBlockLanguageIdentifiers', 'Code block language identifiers that this renderer can handle'),
			uniqueItems: true,
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
		description: nls.localize('vscode.extension.contributes.chatOutputRenderer', 'Contributes a renderer for specific MIME types and code block language identifiers in chat outputs'),
		type: 'array',
		items: chatOutputRendererContributionSchema,
	}
});

