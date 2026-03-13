/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { getExtensionForMimeType } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IChatResponseViewModel, IChatRequestViewModel, isRequestVM } from './model/chatViewModel.js';
import { ChatResponseResource } from './model/chatModel.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from './chatService/chatService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, IToolResultOutputDetails } from './tools/languageModelToolsService.js';

export interface IChatExtractedImage {
	readonly id: string;
	readonly uri: URI;
	readonly name: string;
	readonly mimeType: string;
	readonly data: VSBuffer;
	readonly source: string;
	readonly caption: string | undefined;
}

export interface IChatExtractedImageCollection {
	readonly id: string;
	readonly title: string;
	readonly images: IChatExtractedImage[];
}

/**
 * Extract all images from a chat response's tool invocations.
 */
export function extractImagesFromChatResponse(response: IChatResponseViewModel): IChatExtractedImageCollection | undefined {
	const allImages: IChatExtractedImage[] = [];

	for (const item of response.response.value) {
		if (item.kind === 'toolInvocation' || item.kind === 'toolInvocationSerialized') {
			const images = extractImagesFromToolInvocation(item, response.sessionResource);
			allImages.push(...images);
		}
	}

	if (allImages.length === 0) {
		return undefined;
	}

	// Use the corresponding user request as the carousel title
	const request = response.session.getItems().find((item): item is IChatRequestViewModel => isRequestVM(item) && item.id === response.requestId);
	const title = request ? request.messageText : localize('chatImageExtraction.defaultTitle', "Images");

	return {
		id: response.sessionResource.toString() + '_' + response.id,
		title,
		images: allImages,
	};
}

function extractImagesFromToolInvocation(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, sessionResource: URI): IChatExtractedImage[] {
	const images: IChatExtractedImage[] = [];

	const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);

	const msg = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
	const caption = msg ? (typeof msg === 'string' ? msg : msg.value) : undefined;
	const pushImage = (mimeType: string, data: VSBuffer, outputIndex: number) => {
		const ext = getExtensionForMimeType(mimeType);
		const permalinkBasename = ext ? `file${ext}` : 'file.bin';
		const uri = ChatResponseResource.createUri(sessionResource, toolInvocation.toolCallId, outputIndex, permalinkBasename);
		images.push({
			id: `${toolInvocation.toolCallId}_${outputIndex}`,
			uri,
			name: localize('chatImageExtraction.imageName', "Image {0}", images.length + 1),
			mimeType,
			data,
			source: localize('chatImageExtraction.toolSource', "Tool: {0}", toolInvocation.toolId),
			caption,
		});
	};

	if (isToolResultInputOutputDetails(resultDetails)) {
		for (let i = 0; i < resultDetails.output.length; i++) {
			const outputItem = resultDetails.output[i];
			if (outputItem.type === 'embed' && outputItem.mimeType?.startsWith('image/') && !outputItem.isText) {
				pushImage(outputItem.mimeType, decodeBase64(outputItem.value), i);
			}
		}
	}
	else if (isToolResultOutputDetails(resultDetails)) {
		const output = resultDetails.output;
		if (output.mimeType?.startsWith('image/')) {
			const data = getImageDataFromOutputDetails(resultDetails, toolInvocation);
			if (data) {
				pushImage(output.mimeType, data, 0);
			}
		}
	}

	return images;
}

function getImageDataFromOutputDetails(resultDetails: IToolResultOutputDetails, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): VSBuffer | undefined {
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
