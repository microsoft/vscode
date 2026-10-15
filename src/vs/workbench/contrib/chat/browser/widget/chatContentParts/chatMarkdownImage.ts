/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdownImage } from '../../../../../../base/browser/markdownRenderer.js';
import { raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Event } from '../../../../../../base/common/event.js';
import { readImageDimensions } from '../../../../../../base/common/image.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../../../base/common/mime.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableFromEvent, waitForState } from '../../../../../../base/common/observable.js';
import { addTrailingPathSeparator, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { getSessionChatResource, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ByteSize, IFileService } from '../../../../../../platform/files/common/files.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { getAttachableImageExtension } from '../../../common/model/chatModel.js';

const maxImageBytes = 5 * ByteSize.MB;
const maxImagePixels = 40_000_000;

export class ChatMarkdownImage extends Disposable implements IRenderedMarkdownImage {
	readonly image = dom.$<HTMLImageElement>('img');
	private readonly status = dom.$('span', { role: 'status' });
	readonly element = dom.$('span.chat-markdown-image', undefined, this.image, this.status);

	private readonly loadStore = this._register(new MutableDisposable<DisposableStore>());
	private connection: IAgentConnection | undefined;
	private loaded = false;

	constructor(
		private readonly sessionResource: URI,
		private readonly href: string,
		private readonly onDidChangeHeight: () => void,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._register(connectionsService.onDidChangeSessionResolution(() => {
			if (!this.loaded && this.getConnection() !== this.connection) {
				this.load();
			}
		}));
		this.load();
	}

	private getConnection(): IAgentConnection | undefined {
		return this.connectionsService.resolveSessionResource(this.sessionResource)?.connection;
	}

	private load(): void {
		const store = new DisposableStore();
		this.loadStore.value = store;
		const resolution = this.connectionsService.resolveSessionResource(this.sessionResource);
		this.connection = resolution?.connection;
		dom.hide(this.image);
		dom.show(this.status);
		this.status.textContent = localize('chat.markdownImageLoading', "Loading image...");
		this.element.setAttribute('aria-busy', 'true');

		store.add(dom.addDisposableListener(this.image, dom.EventType.LOAD, () => {
			if (this.image.naturalWidth === 0 || this.image.naturalHeight === 0) {
				this.showError(store, new Error(localize('chat.markdownImageDecodeError', "The file could not be decoded as an image.")));
				return;
			}
			if (this.image.naturalWidth * this.image.naturalHeight > maxImagePixels) {
				this.showError(store, new Error(localize('chat.markdownImagePixelLimit', "The image exceeds the 40 megapixel limit.")));
				return;
			}
			this.loaded = true;
			this.element.setAttribute('aria-busy', 'false');
			dom.hide(this.status);
			dom.show(this.image);
			this.onDidChangeHeight();
		}));
		store.add(dom.addDisposableListener(this.image, dom.EventType.ERROR, () => {
			this.showError(store, new Error(localize('chat.markdownImageDecodeError', "The file could not be decoded as an image.")));
		}));
		store.add(toDisposable(() => this.image.removeAttribute('src')));
		void this.loadImage(resolution, store, cancelOnDispose(store)).catch(error => this.showError(store, error));
	}

	private async loadImage(resolution: IAgentHostSessionResolution | undefined, store: DisposableStore, token: CancellationToken): Promise<void> {
		if (!resolution) {
			throw new Error(localize('chat.markdownImageDisconnected', "Connect to this session's Agent Host to load the image."));
		}

		const { connection } = resolution;
		const resource = URL.canParse(this.href)
			? URI.parse(this.href, true)
			: await this.resolveRelativeResource(resolution, store, token);
		if (store.isDisposed) {
			return;
		}
		this.checkConnection(connection);
		const hostResource = this.toHostFileUri(resource, connection);

		const mediaMime = getMediaMime(hostResource.path);
		const mimeType = mediaMime === 'image/jpg' ? 'image/jpeg' : mediaMime;
		const isSvg = mimeType === 'image/svg+xml';
		if (!mimeType || (!isSvg && !getAttachableImageExtension(mimeType))) {
			throw new Error(localize('chat.markdownImageUnsupportedType', "Supported image formats are PNG, JPEG, GIF, WebP, and SVG."));
		}

		// FileService can read in parallel with stat, so check the size before starting a remote read.
		const stat = await raceCancellationError(this.fileService.resolve(resource, { resolveMetadata: true }), token);
		if (!stat.isFile || stat.size > maxImageBytes) {
			throw new Error(localize('chat.markdownImageSizeLimit', "The image must be a file no larger than 5 MB."));
		}
		this.checkConnection(connection);
		const content = await raceCancellationError(this.fileService.readFile(resource, { limits: { size: maxImageBytes } }, token), token);
		this.checkConnection(connection);
		if (content.value.byteLength > maxImageBytes) {
			throw new Error(localize('chat.markdownImageSizeLimit', "The image must be a file no larger than 5 MB."));
		}

		if (!isSvg) {
			const dimensions = readImageDimensions(content.value);
			if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
				throw new Error(localize('chat.markdownImageDecodeError', "The file could not be decoded as an image."));
			}
			if (dimensions.width * dimensions.height > maxImagePixels) {
				throw new Error(localize('chat.markdownImagePixelLimit', "The image exceeds the 40 megapixel limit."));
			}
		}

		// SVG stays in an image document, where scripts and external resources are disabled, never inline DOM.
		const url = URL.createObjectURL(new Blob([content.value.buffer.slice()], { type: mimeType }));
		store.add(toDisposable(() => URL.revokeObjectURL(url)));
		this.image.src = url;
	}

	private async resolveRelativeResource(resolution: IAgentHostSessionResolution, store: DisposableStore, token: CancellationToken): Promise<URI> {
		const { connection, backendSession } = resolution;
		const ref = store.add(connection.getSubscription(StateComponents.Session, backendSession, 'ChatMarkdownImage'));
		const subscription = ref.object;
		const state = await waitForState(
			observableFromEvent(this, Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None), () => subscription.value),
			(value): value is SessionState => !!value && !(value instanceof Error),
			value => value instanceof Error ? value : undefined,
			token,
		);
		const chatId = new URLSearchParams(this.sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM) || this.sessionResource.fragment;
		const chatResource = chatId ? getSessionChatResource(state, chatId, state.defaultChat) : state.defaultChat;
		const chat = state.chats.find(summary => summary.resource === chatResource);
		const workingDirectory = (chat?.workingDirectories ?? state.workingDirectories)?.[0];
		if (!workingDirectory || (chatId && !chat)) {
			throw new Error(localize('chat.markdownImageWorkingDirectoryUnavailable', "The session's working directory is unavailable."));
		}
		const directory = typeof workingDirectory === 'string' ? URI.parse(workingDirectory) : workingDirectory;
		const directoryResource = directory.scheme === Schemas.file ? connection.resourceUris.fromAgentHost(directory) : directory;
		const hostDirectory = this.toHostFileUri(directoryResource, connection);
		return connection.resourceUris.fromAgentHost(URI.parse(new URL(this.href, addTrailingPathSeparator(hostDirectory).toString()).href));
	}

	private toHostFileUri(resource: URI, connection: IAgentConnection): URI {
		const hostResource = connection.resourceUris.toAgentHost(resource);
		if (hostResource.scheme !== Schemas.file || hostResource.authority || hostResource.query
			|| !hostResource.path.startsWith('/') || /^[/\\]{2}/.test(hostResource.path)
			|| !isEqual(connection.resourceUris.fromAgentHost(hostResource), resource)) {
			throw new Error(localize('chat.markdownImageInvalidResource', "Only files on this session's Agent Host can be displayed."));
		}
		return hostResource;
	}

	private checkConnection(connection: IAgentConnection): void {
		if (this.getConnection() !== connection) {
			throw new Error(localize('chat.markdownImageDisconnected', "Connect to this session's Agent Host to load the image."));
		}
	}

	private showError(store: DisposableStore, error: Error): void {
		if (store.isDisposed) {
			return;
		}
		store.dispose();
		dom.hide(this.image);
		dom.show(this.status);
		this.element.setAttribute('aria-busy', 'false');
		this.status.textContent = this.image.alt
			? localize('chat.markdownImageErrorWithAlt', "Unable to load image \"{0}\": {1}", this.image.alt, toErrorMessage(error))
			: localize('chat.markdownImageError', "Unable to load image: {0}", toErrorMessage(error));
		this.onDidChangeHeight();
	}
}
