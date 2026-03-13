/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { getExtensionForMimeType, getMediaMime } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { IChatResponseViewModel, IChatRequestViewModel, isRequestVM } from './model/chatViewModel.js';
import { ChatResponseResource } from './model/chatModel.js';
import { IChatContentInlineReference, IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from './chatService/chatService.js';
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
 * Extract all images from a chat response's tool invocations and inline references.
 * Tool invocation images are extracted from output details and message URIs.
 * Inline reference images (file URIs) are read via the provided {@link readFile} callback.
 */
export async function extractImagesFromChatResponse(
	response: IChatResponseViewModel,
	readFile: (uri: URI) => Promise<VSBuffer>,
): Promise<IChatExtractedImageCollection> {
	const allImages: IChatExtractedImage[] = [];

	for (const item of response.response.value) {
		if (item.kind === 'toolInvocation' || item.kind === 'toolInvocationSerialized') {
			const images = extractImagesFromToolInvocationOutputDetails(item, response.sessionResource);
			allImages.push(...images);
			const messageImages = await extractImagesFromToolInvocationMessages(item, readFile);
			allImages.push(...messageImages);
		} else if (item.kind === 'inlineReference') {
			const image = await extractImageFromInlineReference(item, readFile);
			if (image) {
				allImages.push(image);
			}
		}
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

export function extractImagesFromToolInvocationOutputDetails(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, sessionResource: URI): IChatExtractedImage[] {
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

export async function extractImagesFromToolInvocationMessages(
	toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
	readFile: (uri: URI) => Promise<VSBuffer>
): Promise<IChatExtractedImage[]> {
	// Use pastTenseMessage if available, otherwise fall back to invocationMessage.
	// When pastTenseMessage exists it visually replaces invocationMessage in the UI,
	// so we only look at its URIs — we don't fall back to invocationMessage URIs.
	const message = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
	if (!message || typeof message === 'string' || !message.uris || Object.keys(message.uris).length === 0) {
		return [];
	}

	const images: IChatExtractedImage[] = [];
	for (const uriComponents of Object.values(message.uris)) {
		const uri = URI.revive(uriComponents);
		const mimeType = getMediaMime(uri.path);
		if (mimeType?.startsWith('image/')) {
			let data: VSBuffer;
			try {
				data = await readFile(uri);
			} catch {
				continue;
			}
			const name = uri.path.split('/').pop() ?? 'image';
			images.push({
				id: uri.toString(),
				uri,
				name,
				mimeType,
				data,
				source: localize('chatImageExtraction.toolSource', "Tool: {0}", toolInvocation.toolId),
				caption: message.value,
			});
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

async function extractImageFromInlineReference(
	part: IChatContentInlineReference,
	readFile: (uri: URI) => Promise<VSBuffer>,
): Promise<IChatExtractedImage | undefined> {
	const ref = part.inlineReference;
	const refUri = URI.isUri(ref) ? ref : isLocation(ref) ? ref.uri : ref.location.uri;
	const mime = getMediaMime(refUri.path);
	if (!mime?.startsWith('image/')) {
		return undefined;
	}

	let data: VSBuffer;
	try {
		data = await readFile(refUri);
	} catch {
		return undefined;
	}
	const name = part.name ?? refUri.path.split('/').pop() ?? 'image';
	return {
		id: refUri.toString(),
		uri: refUri,
		name,
		mimeType: mime,
		data,
		source: localize('chatImageExtraction.inlineReference', "File"),
		caption: undefined,
	};
}
