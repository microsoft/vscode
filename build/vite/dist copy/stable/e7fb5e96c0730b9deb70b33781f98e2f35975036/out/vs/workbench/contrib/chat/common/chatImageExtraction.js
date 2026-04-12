/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { getExtensionForMimeType, getMediaMime } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { isRequestVM } from './model/chatViewModel.js';
import { ChatResponseResource } from './model/chatModel.js';
import { IChatToolInvocation } from './chatService/chatService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails } from './tools/languageModelToolsService.js';
import { isImageVariableEntry } from './attachments/chatVariableEntries.js';
/**
 * Extract all images from a chat response's tool invocations and inline references.
 * Tool invocation images are extracted from output details and message URIs.
 * Inline reference images (file URIs) are read via the provided {@link readFile} callback.
 */
export async function extractImagesFromChatResponse(response, readFile) {
    const allImages = [];
    for (const item of response.response.value) {
        if (item.kind === 'toolInvocation' || item.kind === 'toolInvocationSerialized') {
            const images = extractImagesFromToolInvocationOutputDetails(item, response.sessionResource);
            allImages.push(...images);
            const messageImages = await extractImagesFromToolInvocationMessages(item, readFile);
            allImages.push(...messageImages);
        }
        else if (item.kind === 'inlineReference') {
            const image = await extractImageFromInlineReference(item, readFile);
            if (image) {
                allImages.push(image);
            }
        }
    }
    // Use the corresponding user request as the carousel title
    const request = response.session.getItems().find((item) => isRequestVM(item) && item.id === response.requestId);
    const title = request ? request.messageText : localize('chatImageExtraction.defaultTitle', "Images");
    return {
        id: response.sessionResource.toString() + '_' + response.id,
        title,
        images: allImages,
    };
}
export function extractImagesFromToolInvocationOutputDetails(toolInvocation, sessionResource) {
    const images = [];
    const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);
    const msg = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
    const caption = msg ? (typeof msg === 'string' ? msg : msg.value) : undefined;
    const pushImage = (mimeType, data, outputIndex) => {
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
export async function extractImagesFromToolInvocationMessages(toolInvocation, readFile) {
    // Use pastTenseMessage if available, otherwise fall back to invocationMessage.
    // When pastTenseMessage exists it visually replaces invocationMessage in the UI,
    // so we only look at its URIs — we don't fall back to invocationMessage URIs.
    const message = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
    if (!message || typeof message === 'string' || !message.uris || Object.keys(message.uris).length === 0) {
        return [];
    }
    const images = [];
    for (const uriComponents of Object.values(message.uris)) {
        const uri = URI.revive(uriComponents);
        const mimeType = getMediaMime(uri.path);
        if (mimeType?.startsWith('image/')) {
            let data;
            try {
                data = await readFile(uri);
            }
            catch {
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
function getImageDataFromOutputDetails(resultDetails, toolInvocation) {
    if (toolInvocation.kind === 'toolInvocationSerialized') {
        const serializedDetails = resultDetails;
        if (serializedDetails.output.base64Data) {
            return decodeBase64(serializedDetails.output.base64Data);
        }
        return undefined;
    }
    else {
        return resultDetails.output.value;
    }
}
async function extractImageFromInlineReference(part, readFile) {
    const ref = part.inlineReference;
    const refUri = URI.isUri(ref) ? ref : isLocation(ref) ? ref.uri : ref.location.uri;
    const mime = getMediaMime(refUri.path);
    if (!mime?.startsWith('image/')) {
        return undefined;
    }
    let data;
    try {
        data = await readFile(refUri);
    }
    catch {
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
export function coerceImageBuffer(value) {
    return value instanceof Uint8Array
        ? value
        : value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : (value && typeof value === 'object' && !Array.isArray(value))
                ? new Uint8Array(Object.keys(value)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(key => value[key]))
                : undefined;
}
/**
 * Extract images from a chat request's variable attachments (user-attached images).
 */
export function extractImagesFromChatRequest(request) {
    const images = [];
    for (const variable of request.variables) {
        if (!isImageVariableEntry(variable)) {
            continue;
        }
        const buffer = coerceImageBuffer(variable.value);
        if (!buffer) {
            continue;
        }
        const mimeType = variable.mimeType ?? getMediaMime(variable.name) ?? 'image/png';
        const uri = variable.references?.[0]?.reference;
        const imageUri = URI.isUri(uri) ? uri : URI.from({ scheme: 'data', path: variable.name });
        images.push({
            id: imageUri.toString(),
            uri: imageUri,
            name: variable.name,
            mimeType,
            data: VSBuffer.wrap(buffer),
            source: localize('chatImageExtraction.userAttachment', "Attachment"),
            caption: undefined,
        });
    }
    return images;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltYWdlRXh0cmFjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRJbWFnZUV4dHJhY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDeEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDcEUsT0FBTyxFQUFpRCxXQUFXLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN0RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM1RCxPQUFPLEVBQStCLG1CQUFtQixFQUFxRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25LLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSx5QkFBeUIsRUFBNEIsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQWtCNUU7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsNkJBQTZCLENBQ2xELFFBQWdDLEVBQ2hDLFFBQXlDO0lBRXpDLE1BQU0sU0FBUyxHQUEwQixFQUFFLENBQUM7SUFFNUMsS0FBSyxNQUFNLElBQUksSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVDLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMs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