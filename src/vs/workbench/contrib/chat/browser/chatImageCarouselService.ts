/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getMediaMime } from '../../../../base/common/mime.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { extractImagesFromChatRequest, extractImagesFromChatResponse, IChatExtractedImage } from '../common/chatImageExtraction.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../common/model/chatViewModel.js';
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
				images: dedupedImages.map(({ id, name, mimeType, data }) => ({ id, name, mimeType, data: data.buffer }))
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
				images: dedupedImages.map(({ id, name, mimeType, data }) => ({ id, name, mimeType, data: data.buffer }))
			});
		}
	}

	return sections;
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
		const localIndex = findImageInList(section.images, resource, data);
		if (localIndex >= 0) {
			return globalOffset + localIndex;
		}
		globalOffset += section.images.length;
	}

	return -1;
}

function findImageInList(
	images: ICarouselImage[],
	resource: URI,
	data?: Uint8Array,
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

	// Fall back to matching by data buffer equality
	if (data) {
		const wrapped = VSBuffer.wrap(data);
		return images.findIndex(img => VSBuffer.wrap(img.data).equals(wrapped));
	}

	return -1;
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
	const name = resource.path.split('/').pop() ?? 'image';
	const mimeType = getMediaMime(resource.path) ?? getMediaMime(name) ?? 'image/png';
	return { name, mimeType, data, title: name };
}

//#endregion

const CAROUSEL_COMMAND = 'workbench.action.chat.openImageInCarousel';

export class ChatImageCarouselService implements IChatImageCarouselService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
	) { }

	async openCarouselAtResource(resource: URI, data?: Uint8Array): Promise<void> {
		const widget = this.chatWidgetService.lastFocusedWidget;
		if (!widget?.viewModel) {
			await this.openSingleImage(resource, data);
			return;
		}

		const items = widget.viewModel.getItems().filter(
			(item): item is IChatRequestViewModel | IChatResponseViewModel => isRequestVM(item) || isResponseVM(item)
		);
		const readFile = async (uri: URI) => (await this.fileService.readFile(uri)).value.buffer;
		const sections = await collectCarouselSections(items, readFile);
		const clickedGlobalIndex = findClickedImageIndex(sections, resource, data);

		if (clickedGlobalIndex === -1 || sections.length === 0) {
			await this.openSingleImage(resource, data);
			return;
		}

		const args = buildCollectionArgs(sections, clickedGlobalIndex, widget.viewModel.sessionResource);
		await this.commandService.executeCommand(CAROUSEL_COMMAND, args);
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
