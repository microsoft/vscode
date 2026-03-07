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

export interface IChatImageSlideshowService {
	readonly _serviceBrand: undefined;
	extractImagesFromResponse(response: IChatResponseViewModel): Promise<ISlideshowImageCollection | undefined>;
	openSlideshow(collection: ISlideshowImageCollection): Promise<void>;
}

export class ChatImageSlideshowService extends Disposable implements IChatImageSlideshowService {
	readonly _serviceBrand: undefined;

	async extractImagesFromResponse(response: IChatResponseViewModel): Promise<ISlideshowImageCollection | undefined> {
		const images: ISlideshowImage[] = [];

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

	private extractImagesFromToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): ISlideshowImage[] {
		const images: ISlideshowImage[] = [];

		const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);

		if (isToolResultInputOutputDetails(resultDetails)) {
			for (const outputItem of resultDetails.output) {
				if (outputItem.type === 'embed' && outputItem.mimeType?.startsWith('image/') && !outputItem.isText) {
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

	private getImageDataFromOutputDetails(resultDetails: IToolResultOutputDetails, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): VSBuffer | undefined {
		if (toolInvocation.kind === 'toolInvocationSerialized') {
			const serializedDetails = resultDetails as unknown as IToolResultOutputDetailsSerialized;
			if (serializedDetails.output.base64Data) {
				return decodeBase64(serializedDetails.output.base64Data);
			}
			return undefined;
		} else {
			return resultDetails.output.value;
		}
	}

	async openSlideshow(collection: ISlideshowImageCollection): Promise<void> {
		console.log('Opening slideshow with', collection.images.length, 'images');
	}
}
