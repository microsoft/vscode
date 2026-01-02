/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISlideshowImage, ISlideshowImageCollection } from './chatImageSlideshowTypes.js';
import { IChatResponseViewModel } from '../../chat/common/chatViewModel.js';
import { IChatToolInvocation } from '../../chat/common/chatService/chatService.js';

export const IChatImageSlideshowService = createDecorator<IChatImageSlideshowService>('chatImageSlideshowService');

/**
 * Service for extracting and managing images from chat responses for slideshow display
 */
export interface IChatImageSlideshowService {
	readonly _serviceBrand: undefined;

	/**
	 * Extract all images from a chat response
	 * @param response The chat response to extract images from
	 * @returns A collection of images if any are found, undefined otherwise
	 */
	extractImagesFromResponse(response: IChatResponseViewModel): Promise<ISlideshowImageCollection | undefined>;

	/**
	 * Open a slideshow with the given images
	 * @param collection The image collection to display
	 */
	openSlideshow(collection: ISlideshowImageCollection): Promise<void>;
}

export class ChatImageSlideshowService extends Disposable implements IChatImageSlideshowService {
	readonly _serviceBrand: undefined;

	/**
	 * Extract images from tool invocation parts in the response
	 */
	async extractImagesFromResponse(response: IChatResponseViewModel): Promise<ISlideshowImageCollection | undefined> {
		const images: ISlideshowImage[] = [];
		
		// Iterate through response items to find tool invocations
		for (const item of response.response.value) {
			if (item.kind === 'toolInvocation' || item.kind === 'toolInvocationSerialized') {
				const toolInvocation = item as IChatToolInvocation;
				const toolImages = this.extractImagesFromToolInvocation(toolInvocation);
				images.push(...toolImages);
			}
		}

		if (images.length === 0) {
			return undefined;
		}

		return {
			id: response.sessionId + '_' + response.id,
			title: `Images from Chat Response`,
			images
		};
	}

	/**
	 * Extract images from a single tool invocation
	 */
	private extractImagesFromToolInvocation(toolInvocation: IChatToolInvocation): ISlideshowImage[] {
		const images: ISlideshowImage[] = [];
		const state = toolInvocation.state.get();

		// Check if there's content for the model that contains data parts
		if (state.type === 'completed' || state.type === 'waitingForPostApproval') {
			const contentForModel = state.type === 'waitingForPostApproval' 
				? state.contentForModel 
				: state.type === 'completed' && 'contentForModel' in state 
					? (state as any).contentForModel 
					: undefined;

			if (contentForModel) {
				for (const part of contentForModel) {
					if (part.kind === 'data' && part.value.mimeType?.startsWith('image/')) {
						images.push({
							id: `${toolInvocation.toolCallId}_${images.length}`,
							name: `Image ${images.length + 1}`,
							mimeType: part.value.mimeType,
							data: part.value.data,
							source: `Tool: ${toolInvocation.toolId}`
						});
					}
				}
			}
		}

		return images;
	}

	/**
	 * Open a slideshow with the given images
	 */
	async openSlideshow(collection: ISlideshowImageCollection): Promise<void> {
		// This will be implemented to open the custom editor
		// For now, just a placeholder
		console.log('Opening slideshow with', collection.images.length, 'images');
	}
}
