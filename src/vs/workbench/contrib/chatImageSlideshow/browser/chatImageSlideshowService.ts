/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISlideshowImage, ISlideshowImageCollection } from './chatImageSlideshowTypes.js';
import { IChatResponseViewModel } from '../../chat/common/model/chatViewModel.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from '../../chat/common/chatService/chatService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, IToolResultOutputDetails } from '../../chat/common/tools/languageModelToolsService.js';

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
				const toolImages = this.extractImagesFromToolInvocation(item);
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
	 * Extract images from a tool invocation (active or serialized)
	 */
	private extractImagesFromToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): ISlideshowImage[] {
		const images: ISlideshowImage[] = [];

		// Use the namespace helper to get resultDetails - works for both active and serialized
		const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);

		// Check for IToolResultInputOutputDetails (MCP tools like XcodeBuildMCP)
		// This type has an output array with embedded or reference items
		if (isToolResultInputOutputDetails(resultDetails)) {
			for (const outputItem of resultDetails.output) {
				if (outputItem.type === 'embed' && outputItem.mimeType?.startsWith('image/') && !outputItem.isText) {
					// For embedded images, value is base64 encoded
					const data = decodeBase64(outputItem.value);
					images.push({
						id: `${toolInvocation.toolCallId}_${images.length}`,
						name: `Image ${images.length + 1}`,
						mimeType: outputItem.mimeType,
						data,
						source: `Tool: ${toolInvocation.toolId}`
					});
				}
			}
		}
		// Check for IToolResultOutputDetails (simple data output)
		else if (isToolResultOutputDetails(resultDetails)) {
			const output = resultDetails.output;
			if (output.mimeType?.startsWith('image/')) {
				const data = this.getImageDataFromOutputDetails(resultDetails, toolInvocation);
				if (data) {
					images.push({
						id: `${toolInvocation.toolCallId}_${images.length}`,
						name: `Image ${images.length + 1}`,
						mimeType: output.mimeType,
						data,
						source: `Tool: ${toolInvocation.toolId}`
					});
				}
			}
		}

		return images;
	}

	/**
	 * Get the image data buffer from simple output details.
	 * Handles the difference between active (VSBuffer) and serialized (base64 string) invocations.
	 */
	private getImageDataFromOutputDetails(resultDetails: IToolResultOutputDetails, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): VSBuffer | undefined {
		if (toolInvocation.kind === 'toolInvocationSerialized') {
			// For serialized invocations, the data is stored as base64
			const serializedDetails = resultDetails as unknown as IToolResultOutputDetailsSerialized;
			if (serializedDetails.output.base64Data) {
				return decodeBase64(serializedDetails.output.base64Data);
			}
			return undefined;
		} else {
			// For active invocations, the data is already a VSBuffer
			return resultDetails.output.value;
		}
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
