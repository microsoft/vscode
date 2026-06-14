/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import type { ImageCarouselEditorInput } from '../../imageCarousel/browser/imageCarouselEditorInput.js';
import type { IImageCarouselCollection } from '../../imageCarousel/browser/imageCarouselTypes.js';
import { extractImagesFromChatRequest, extractImagesFromChatResponse, IChatExtractedImage } from '../common/chatImageExtraction.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, isRequestVM, isResponseVM } from '../common/model/chatViewModel.js';
import { IChatWidgetService } from './chat.js';

export const IChatImageCarouselService = createDecorator<IChatImageCarouselService>('chatImageCarouselService');

export interface IChatImageCarouselService {
	readonly _serviceBrand: undefined;

	/**
	 * Opens the image carousel for the given resource URI, collecting all images
	 * from the focused chat widget's responses to populate the carousel.
	 *
	 * @param resource The URI of the clicked image to start the carousel at.
	 * @param data Optional raw image data (e.g. for input attachment images that are Uint8Arrays).
	 */
	openCarouselAtResource(resource: URI, data?: Uint8Array): Promise<void>;
}

//#region Carousel data types

export interface ICarouselImage {
	readonly id: string;
	readonly name: string;
	readonly mimeType: string;
	readonly data: Uint8Array;
	readonly caption?: string;
}

export interface ICarouselSection {
	readonly title: string;
	readonly images: ICarouselImage[];
}

export interface ICarouselCollectionArgs {
	readonly collection: {
		readonly id: string;
		readonly title: string;
		readonly sections: ICarouselSection[];
	};
	readonly startIndex: number;
}

export interface ICarouselSingleImageArgs {
	readonly name: string;
	readonly mimeType: string;
	readonly data: Uint8Array;
	readonly title: string;
}

//#endregion

//#region Testable helper functions

/**
 * Collects all carousel image sections from chat items.
 * Each request/response pair with images becomes one section containing
 * user attachment images, tool invocation images, and inline reference images.
 */
export async function collectCarouselSections(
	items: (IChatRequestViewModel | IChatResponseViewModel)[],
	readFile: (uri: URI) => Promise<Uint8Array>,
): Promise<ICarouselSection[]> {
	const sections: ICarouselSection[] = [];

	// Build a map from request id to request VM for pairing
	const requestMap = new Map<string, IChatRequestViewModel>();
	for (const item of items) {
		if (isRequestVM(item)) {
			requestMap.set(item.id, item);
		}
	}

	for (const item of items) {
		if (!isResponseVM(item)) {
			continue;
		}

		const { title: extractedTitle, images: responseImages } = await extractImagesFromChatResponse(item, async uri => VSBuffer.wrap(await readFile(uri)));

		// Also collect images from the corresponding user request
		const request = requestMap.get(item.requestId);
		const requestImages = request ? extractImagesFromChatRequest(request) : [];

		const allImages = [...requestImages, ...responseImages];
		const dedupedImages = deduplicateConsecutiveImages(allImages);
		if (dedupedImages.length > 0) {
			sections.push({
				title: request?.messageText ?? extractedTitle,
				images: dedupedImages.map(({ uri, name, mimeType, data, caption }) => ({ id: uri.toString(), name, mimeType, data: data.buffer, caption: toCaptionText(caption) }))
			});
		}
	}

	// Handle requests that have no response yet (e.g. pending requests with image attachments)
	const respondedRequestIds = new Set(
		items.filter(isResponseVM).map(r => r.requestId)
	);
	for (const item of items) {
		if (!isRequestVM(item) || respondedRequestIds.has(item.id)) {
			continue;
		}
		const requestImages = extractImagesFromChatRequest(item);
		const dedupedImages = deduplicateConsecutiveImages(requestImages);
		if (dedupedImages.length > 0) {
			sections.push({
				title: item.messageText,
				images: dedupedImages.map(({ uri, name, mimeType, data, caption }) => ({ id: uri.toString(), name, mimeType, data: data.buffer, caption: toCaptionText(caption) }))
			});
		}
	}

	return sections;
}

/**
 * Converts an extracted image caption to plain display text, stripping
 * Markdown syntax (e.g. "Viewed image [](file:///path/img.png)" becomes
 * "Viewed image img.png") the same way chat renders tool invocation messages.
 */
function toCaptionText(caption: string | IMarkdownString | undefined): string | undefined {
	if (caption === undefined) {
		return undefined;
	}
	return typeof caption === 'string' ? caption : stripIcons(renderAsPlaintext(caption, { useLinkFormatter: true }));
}

/**
 * Removes consecutive images with the same URI, keeping only the first occurrence
 * of each run of duplicates.
 */
function deduplicateConsecutiveImages(images: IChatExtractedImage[]): IChatExtractedImage[] {
	return images.filter((img, index) => {
		if (index === 0) {
			return true;
		}
		return !isEqual(images[index - 1].uri, img.uri);
	});
}

/**
 * Finds the global index of the clicked image across all carousel sections.
 * Tries URI string match, then parsed URI equality, then data buffer equality.
 */
export function findClickedImageIndex(
	sections: ICarouselSection[],
	resource: URI,
	data?: Uint8Array,
): number {
	let globalOffset = 0;

	for (const section of sections) {
		const localIndex = findImageInListByUri(section.images, resource);
		if (localIndex >= 0) {
			return globalOffset + localIndex;
		}
		globalOffset += section.images.length;
	}

	if (!data) {
		return -1;
	}

	globalOffset = 0;
	for (const section of sections) {
		const localIndex = findImageInListByData(section.images, data);
		if (localIndex >= 0) {
			return globalOffset + localIndex;
		}
		globalOffset += section.images.length;
	}

	return -1;
}

function findImageInListByUri(
	images: ICarouselImage[],
	resource: URI,
): number {
	// Try matching by URI string (for inline references and tool images with URIs)
	const uriStr = resource.toString();
	const byUri = images.findIndex(img => img.id === uriStr);
	if (byUri >= 0) {
		return byUri;
	}

	// Try matching by parsed URI equality (for tool invocation images with generated URIs)
	const byParsedUri = images.findIndex(img => {
		try {
			return isEqual(URI.parse(img.id), resource);
		} catch {
			return false;
		}
	});
	if (byParsedUri >= 0) {
		return byParsedUri;
	}

	return -1;
}

function findImageInListByData(images: ICarouselImage[], data: Uint8Array): number {
	const wrapped = VSBuffer.wrap(data);
	return images.findIndex(img => VSBuffer.wrap(img.data).equals(wrapped));
}

/**
 * Builds the collection arguments for the carousel command.
 */
export function buildCollectionArgs(
	sections: ICarouselSection[],
	clickedGlobalIndex: number,
	sessionResource: URI,
): ICarouselCollectionArgs {
	const collectionId = sessionResource.toString() + '_carousel';
	const defaultTitle = localize('chatImageCarousel.allImages', "Conversation Images");
	return {
		collection: {
			id: collectionId,
			title: sections.length === 1
				? (sections[0].title || defaultTitle)
				: defaultTitle,
			sections,
		},
		startIndex: clickedGlobalIndex,
	};
}

/**
 * Builds the single-image arguments for the carousel command.
 */
export function buildSingleImageArgs(resource: URI, data: Uint8Array): ICarouselSingleImageArgs {
	let name = resource.path.split('/').pop() ?? 'image';
	try {
		name = decodeURIComponent(name);
	} catch {
		// keep raw segment if it isn't valid percent-encoding
	}
	const mimeType = getMediaMime(resource.path) ?? getMediaMime(name) ?? 'image/png';
	return { name, mimeType, data, title: name };
}

/**
 * Wraps a `readFile`-style function with a cache keyed by URI, so repeated reads
 * of the same resource (e.g. across debounced live-refresh ticks) reuse the
 * previously-read bytes instead of hitting the file system again.
 */
export function createCachingReadFile(
	readFile: (uri: URI) => Promise<Uint8Array>,
	cache: Map<string, Uint8Array>,
): (uri: URI) => Promise<Uint8Array> {
	return async uri => {
		const key = uri.toString();
		const cached = cache.get(key);
		if (cached) {
			return cached;
		}
		const data = await readFile(uri);
		cache.set(key, data);
		return data;
	};
}

/**
 * Builds a stable signature of the carousel image set so the live refresh can
 * skip redundant updates when a chat change doesn't add or remove any image.
 */
function sectionsSignature(sections: ICarouselSection[]): string {
	return sections.flatMap(section => section.images.map(image => image.id)).join('\n');
}

/**
 * Converts the collected chat carousel collection (which carries raw
 * `Uint8Array` image data) into the editor's `IImageCarouselCollection` shape.
 */
function toCarouselCollection(collection: ICarouselCollectionArgs['collection']): IImageCarouselCollection {
	return {
		id: collection.id,
		title: collection.title,
		sections: collection.sections.map(section => ({
			title: section.title,
			images: section.images.map(image => ({
				id: image.id,
				name: image.name,
				mimeType: image.mimeType,
				data: VSBuffer.wrap(image.data),
				caption: image.caption,
			})),
		})),
	};
}

//#endregion

const CAROUSEL_COMMAND = 'workbench.action.chat.openImageInCarousel';

/** Debounce for re-collecting carousel images as the chat response streams. */
const CAROUSEL_REFRESH_DELAY = 300;

export class ChatImageCarouselService extends Disposable implements IChatImageCarouselService {

	declare readonly _serviceBrand: undefined;

	private readonly _liveRefresh = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
	}

	async openCarouselAtResource(resource: URI, data?: Uint8Array): Promise<void> {
		const widget = this.chatWidgetService.lastFocusedWidget;
		if (!widget?.viewModel) {
			await this.openSingleImage(resource, data);
			return;
		}

		const viewModel = widget.viewModel;
		const fileCache = new Map<string, Uint8Array>();
		const sections = await this.collectSections(viewModel, fileCache);
		const clickedGlobalIndex = findClickedImageIndex(sections, resource, data);

		if (clickedGlobalIndex === -1 || sections.length === 0) {
			await this.openSingleImage(resource, data);
			return;
		}

		const args = buildCollectionArgs(sections, clickedGlobalIndex, viewModel.sessionResource);
		const input = await this.commandService.executeCommand<ImageCarouselEditorInput>(CAROUSEL_COMMAND, args);
		if (input) {
			this.setupLiveRefresh(input, viewModel, sections, fileCache);
		}
	}

	private async collectSections(viewModel: IChatViewModel, fileCache: Map<string, Uint8Array>): Promise<ICarouselSection[]> {
		const items = viewModel.getItems().filter(
			(item): item is IChatRequestViewModel | IChatResponseViewModel => isRequestVM(item) || isResponseVM(item)
		);
		const readFile = createCachingReadFile(async (uri: URI) => (await this.fileService.readFile(uri)).value.buffer, fileCache);
		return collectCarouselSections(items, readFile);
	}

	/**
	 * Keeps the open carousel in sync with its originating chat session. While
	 * the modal is open the agent's response keeps streaming, so when new images
	 * are added we re-collect the sections (debounced) and update the carousel in
	 * place. The subscription is torn down when the carousel editor closes.
	 */
	private setupLiveRefresh(input: ImageCarouselEditorInput, viewModel: IChatViewModel, initialSections: ICarouselSection[], fileCache: Map<string, Uint8Array>): void {
		const store = new DisposableStore();
		let lastSignature = sectionsSignature(initialSections);

		const scheduler = store.add(new RunOnceScheduler(async () => {
			try {
				const sections = await this.collectSections(viewModel, fileCache);
				if (input.isDisposed()) {
					return;
				}
				const signature = sectionsSignature(sections);
				if (signature === lastSignature) {
					return;
				}
				lastSignature = signature;
				input.updateCollection(toCarouselCollection(buildCollectionArgs(sections, 0, viewModel.sessionResource).collection));
			} catch (error) {
				onUnexpectedError(error);
			}
		}, CAROUSEL_REFRESH_DELAY));

		store.add(viewModel.onDidChange(() => scheduler.schedule()));
		store.add(input.onWillDispose(() => this._liveRefresh.clear()));

		this._liveRefresh.value = store;
	}

	private async openSingleImage(resource: URI, data?: Uint8Array): Promise<void> {
		if (!data) {
			const content = await this.fileService.readFile(resource);
			data = content.value.buffer;
		}

		const args = buildSingleImageArgs(resource, data);
		await this.commandService.executeCommand(CAROUSEL_COMMAND, args);
	}
}
