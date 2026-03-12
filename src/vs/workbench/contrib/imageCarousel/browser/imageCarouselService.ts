/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICarouselImage, IImageCarouselCollection } from './imageCarouselTypes.js';
import { IChatResponseViewModel } from '../../chat/common/model/chatViewModel.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from '../../chat/common/chatService/chatService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, IToolResultOutputDetails } from '../../chat/common/tools/languageModelToolsService.js';

export const IImageCarouselService = createDecorator<IImageCarouselService>('imageCarouselService');

export interface IImageCarouselService {
	readonly _serviceBrand: undefined;

	/**
	 * Extract images from a chat response's tool invocations.
	 */
	extractImagesFromResponse(response: IChatResponseViewModel): Promise<IImageCarouselCollection | undefined>;
}

export class ImageCarouselService extends Disposable implements IImageCarouselService {
	readonly _serviceBrand: undefined;

	async extractImagesFromResponse(response: IChatResponseViewModel): Promise<IImageCarouselCollection | undefined> {
		const images: ICarouselImage[] = [];

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
			id: response.sessionResource.toString() + '_' + response.id,
			title: localize('imageCarousel.title', "Image Carousel"),
			images
		};
	}

	private extractImagesFromToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): ICarouselImage[] {
		const images: ICarouselImage[] = [];

		const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);

		const pushImage = (mimeType: string, data: VSBuffer) => {
			images.push({
				id: `${toolInvocation.toolCallId}_${images.length}`,
				name: localize('imageCarousel.imageName', "Image {0}", images.length + 1),
				mimeType,
				data,
				source: localize('imageCarousel.toolSource', "Tool: {0}", toolInvocation.toolId)
			});
		};

		if (isToolResultInputOutputDetails(resultDetails)) {
			for (const outputItem of resultDetails.output) {
				if (outputItem.type === 'embed' && outputItem.mimeType?.startsWith('image/') && !outputItem.isText) {
					pushImage(outputItem.mimeType, decodeBase64(outputItem.value));
				}
			}
		}
		else if (isToolResultOutputDetails(resultDetails)) {
			const output = resultDetails.output;
			if (output.mimeType?.startsWith('image/')) {
				const data = this.getImageDataFromOutputDetails(resultDetails, toolInvocation);
				if (data) {
					pushImage(output.mimeType, data);
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
}
