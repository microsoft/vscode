/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { getMediaMime } from '../../../../base/common/mime.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { extractImagesFromChatRequest, extractImagesFromChatResponse } from '../common/chatImageExtraction.js';
import { isRequestVM, isResponseVM } from '../common/model/chatViewModel.js';
import { IChatWidgetService } from './chat.js';
export const IChatImageCarouselService = createDecorator('chatImageCarouselService');
//#endregion
//#region Testable helper functions
/**
 * Collects all carousel image sections from chat items.
 * Each request/response pair with images becomes one section containing
 * user attachment images, tool invocation images, and inline reference images.
 */
export async function collectCarouselSections(items, readFile) {
    const sections = [];
    // Build a map from request id to request VM for pairing
    const requestMap = new Map();
    for (const item of items) {
        if (isRequestVM(item)) {
            requestMap.set(item.id, item);
        }
    }
    for (const item of items) {
        if (!isResponseVM(item)) {
            continue;
        }
        const { title: extractedTitle, images: responseImages } = await extractImagesFromChatResponse(item, async (uri) => VSBuffer.wrap(await readFile(uri)));
        // Also collect images from the corresponding user request
        const request = requestMap.get(item.requestId);
        const requestImages = request ? extractImagesFromChatRequest(request) : [];
        const allImages = [...requestImages, ...responseImages];
        const dedupedImages = deduplicateConsecutiveImages(allImages);
        if (dedupedImages.length > 0) {
            sections.push({
                title: request?.messageText ?? extractedTitle,
                images: dedupedImages.map(({ uri, name, mimeType, data, caption }) => ({ id: uri.toString(), name, mimeType, data: data.buffer, caption }))
            });
        }
    }
    // Handle requests that have no response yet (e.g. pending requests with image attachments)
    const respondedRequestIds = new Set(items.filter(isResponseVM).map(r => r.requestId));
    for (const item of items) {
        if (!isRequestVM(item) || respondedRequestIds.has(item.id)) {
            continue;
        }
        const requestImages = extractImagesFromChatRequest(item);
        const dedupedImages = deduplicateConsecutiveImages(requestImages);
        if (dedupedImages.length > 0) {
            sections.push({
                title: item.messageText,
                images: dedupedImages.map(({ uri, name, mimeType, data, caption }) => ({ id: uri.toString(), name, mimeType, data: data.buffer, caption }))
            });
        }
    }
    return sections;
}
/**
 * Removes consecutive images with the same URI, keeping only the first occurrence
 * of each run of duplicates.
 */
function deduplicateConsecutiveImages(images) {
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
export function findClickedImageIndex(sections, resource, data) {
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
function findImageInListByUri(images, resource) {
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
        }
        catch {
            return false;
        }
    });
    if (byParsedUri >= 0) {
        return byParsedUri;
    }
    return -1;
}
function findImageInListByData(images, data) {
    const wrapped = VSBuffer.wrap(data);
    return images.findIndex(img => VSBuffer.wrap(img.data).equals(wrapped));
}
/**
 * Builds the collection arguments for the carousel command.
 */
export function buildCollectionArgs(sections, clickedGlobalIndex, sessionResource) {
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
export function buildSingleImageArgs(resource, data) {
    const name = resource.path.split('/').pop() ?? 'image';
    const mimeType = getMediaMime(resource.path) ?? getMediaMime(name) ?? 'image/png';
    return { name, mimeType, data, title: name };
}
//#endregion
const CAROUSEL_COMMAND = 'workbench.action.chat.openImageInCarousel';
let ChatImageCarouselService = class ChatImageCarouselService {
    constructor(chatWidgetService, commandService, fileService) {
        this.chatWidgetService = chatWidgetService;
        this.commandService = commandService;
        this.fileService = fileService;
    }
    async openCarouselAtResource(resource, data) {
        const widget = this.chatWidgetService.lastFocusedWidget;
        if (!widget?.viewModel) {
            await this.openSingleImage(resource, data);
            return;
        }
        const items = widget.viewModel.getItems().filter((item) => isRequestVM(item) || isResponseVM(item));
        const readFile = async (uri) => (await this.fileService.readFile(uri)).value.buffer;
        const sections = await collectCarouselSections(items, readFile);
        const clickedGlobalIndex = findClickedImageIndex(sections, resource, data);
        if (clickedGlobalIndex === -1 || sections.length === 0) {
            await this.openSingleImage(resource, data);
            return;
        }
        const args = buildCollectionArgs(sections, clickedGlobalIndex, widget.viewModel.sessionResource);
        await this.commandService.executeCommand(CAROUSEL_COMMAND, args);
    }
    async openSingleImage(resource, data) {
        if (!data) {
            const content = await this.fileService.readFile(resource);
            data = content.value.buffer;
        }
        const args = buildSingleImageArgs(resource, data);
        await this.commandService.executeCommand(CAROUSEL_COMMAND, args);
    }
};
ChatImageCarouselService = __decorate([
    __param(0, IChatWidgetService),
    __param(1, ICommandService),
    __param(2, IFileService)
], ChatImageCarouselService);
export { ChatImageCarouselService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSw2QkFBNkIsRUFBdUIsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwSSxPQUFPLEVBQWlELFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFFL0MsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUE0QiwwQkFBMEIsQ0FBQyxDQUFDO0FBOENoSCxZQUFZO0FBRVosbUNBQW1DO0FBRW5DOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHVCQUF1QixDQUM1QyxLQUF5RCxFQUN6RCxRQUEyQztJQUUzQyxNQUFNLFFBQVEsR0FB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