/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/imageCarousel.css';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ImageCarouselEditor } from './imageCarouselEditor.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ExplorerFolderContext } from '../../files/common/files.js';
import { IExplorerService } from '../../files/browser/files.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, dirname, extname } from '../../../../base/common/resources.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
// --- Configuration ---
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'imageCarousel',
    title: localize('imageCarouselConfigurationTitle', "Images Preview"),
    type: 'object',
    properties: {
        'imageCarousel.explorerContextMenu.enabled': {
            type: 'boolean',
            default: true,
            markdownDescription: localize('imageCarousel.explorerContextMenu.enabled', "Controls whether the **Open in Images Preview** option appears in the Explorer context menu."),
            tags: ['experimental'],
        },
        'imageCarousel.chat.enabled': {
            type: 'boolean',
            default: true,
            description: localize('imageCarousel.chat.enabled', "Controls whether clicking an image attachment in chat opens the Images Preview viewer."),
            tags: ['experimental'],
        },
    }
});
// --- Editor Pane Registration ---
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ImageCarouselEditor, ImageCarouselEditor.ID, localize('imageCarouselEditor', "Images Preview")), [
    new SyncDescriptor(ImageCarouselEditorInput)
]);
// --- Serializer ---
class ImageCarouselEditorInputSerializer {
    canSerialize() {
        return false;
    }
    serialize() {
        return undefined;
    }
    deserialize() {
        return undefined;
    }
}
Registry.as(EditorExtensions.EditorFactory)
    .registerEditorSerializer(ImageCarouselEditorInput.ID, ImageCarouselEditorInputSerializer);
function isCollectionArgs(args) {
    return typeof args === 'object' && args !== null
        && typeof args.collection === 'object'
        && typeof args.startIndex === 'number';
}
function isSingleImageArgs(args) {
    return typeof args === 'object' && args !== null
        && typeof args.name === 'string'
        && typeof args.mimeType === 'string'
        && args.data instanceof Uint8Array;
}
// --- Actions ---
class OpenImageInCarouselAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.openImageInCarousel',
            title: localize2('openImageInCarousel', "Open in Images Preview"),
            f1: false
        });
    }
    async run(accessor, args) {
        const editorService = accessor.get(IEditorService);
        let collection;
        let startIndex;
        if (isCollectionArgs(args)) {
            collection = args.collection;
            startIndex = args.startIndex;
        }
        else if (isSingleImageArgs(args)) {
            collection = {
                id: generateUuid(),
                title: args.title ?? localize('imageCarousel.title', "Images Preview"),
                sections: [{
                        title: '',
                        images: [{
                                id: generateUuid(),
                                name: args.name,
                                mimeType: args.mimeType,
                                data: VSBuffer.wrap(args.data),
                            }],
                    }],
            };
            startIndex = 0;
        }
        else {
            return;
        }
        const input = new ImageCarouselEditorInput(collection, startIndex);
        await editorService.openEditor(input, { pinned: true });
    }
}
registerAction2(OpenImageInCarouselAction);
// --- Explorer Context Menu Integration ---
/** Supported media (image + video) extensions for the carousel explorer context menu. */
const MEDIA_EXTENSION_REGEX = /^\.(png|jpg|jpeg|jpe|gif|webp|svg|bmp|ico|mp4|webm|mov)$/i;
function isMediaResource(uri) {
    return MEDIA_EXTENSION_REGEX.test(extname(uri));
}
async function collectImageFilesFromFolder(fileService, folderUri) {
    const stat = await fileService.resolve(folderUri);
    const imageUris = [];
    if (stat.children) {
        for (const child of stat.children) {
            if (child.isFile && isMediaResource(child.resource)) {
                imageUris.push(child.resource);
            }
        }
    }
    imageUris.sort((a, b) => basename(a).localeCompare(basename(b)));
    return imageUris;
}
function createImageEntries(uris) {
    return uris.map(uri => ({
        id: generateUuid(),
        name: basename(uri),
        mimeType: getMediaMime(uri.path) ?? 'image/png',
        uri,
    }));
}
class OpenImagesInCarouselFromExplorerAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openImagesInCarousel',
            title: localize2('openImagesInCarousel', "Open in Images Preview"),
            f1: false,
            menu: [{
                    id: MenuId.ExplorerContext,
                    group: 'navigation',
                    order: 25,
                    when: ContextKeyExpr.and(ContextKeyExpr.has('config.imageCarousel.explorerContextMenu.enabled'), ContextKeyExpr.or(ExplorerFolderContext, ContextKeyExpr.regex(ResourceContextKey.Extension.key, MEDIA_EXTENSION_REGEX))),
                }],
        });
    }
    async run(accessor, resource) {
        const explorerService = accessor.get(IExplorerService);
        const fileService = accessor.get(IFileService);
        const editorService = accessor.get(IEditorService);
        const notificationService = accessor.get(INotificationService);
        const contextService = accessor.get(IWorkspaceContextService);
        const context = explorerService.getContext(true);
        let imageUris = [];
        let startUri;
        try {
            if (context.length === 0) {
                // Empty-space right-click: the explorer passes the workspace root
                // as the resource argument. Fall back to the first workspace folder
                // when no resource is available.
                let folderUri;
                if (URI.isUri(resource)) {
                    folderUri = resource;
                }
                else {
                    const folders = contextService.getWorkspace().folders;
                    if (folders.length > 0) {
                        folderUri = folders[0].uri;
                    }
                }
                if (folderUri) {
                    imageUris = await collectImageFilesFromFolder(fileService, folderUri);
                }
            }
            else {
                const hasSingleImageFile = context.length === 1 && !context[0].isDirectory && isMediaResource(context[0].resource);
                if (hasSingleImageFile) {
                    // Single image: show all sibling images in the same folder with
                    // the selected image focused
                    startUri = context[0].resource;
                    const parentUri = dirname(context[0].resource);
                    imageUris = await collectImageFilesFromFolder(fileService, parentUri);
                }
                else {
                    // Multiple items or a folder: collect images from selection,
                    // deduplicating in case a folder and its children are both selected
                    const seen = new ResourceSet();
                    for (const item of context) {
                        if (item.isDirectory) {
                            const folderImages = await collectImageFilesFromFolder(fileService, item.resource);
                            for (const uri of folderImages) {
                                if (!seen.has(uri)) {
                                    seen.add(uri);
                                    imageUris.push(uri);
                                }
                            }
                        }
                        else if (isMediaResource(item.resource)) {
                            if (!seen.has(item.resource)) {
                                seen.add(item.resource);
                                imageUris.push(item.resource);
                                if (!startUri) {
                                    startUri = item.resource;
                                }
                            }
                        }
                    }
                }
            }
        }
        catch {
            notificationService.error(localize('folderReadError', "Could not read folder contents."));
            return;
        }
        if (imageUris.length === 0) {
            notificationService.info(localize('noImagesFound', "No images found in this folder."));
            return;
        }
        const images = createImageEntries(imageUris);
        let startIndex = 0;
        if (startUri) {
            const idx = images.findIndex(img => img.uri?.toString() === startUri.toString());
            if (idx >= 0) {
                startIndex = idx;
            }
        }
        const collection = {
            id: generateUuid(),
            title: localize('imageCarousel.explorerTitle', "Images Preview"),
            sections: [{
                    title: '',
                    images,
                }],
        };
        const input = new ImageCarouselEditorInput(collection, startIndex);
        await editorService.openEditor(input, { pinned: true });
    }
}
registerAction2(OpenImagesInCarouselFromExplorerAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VDYXJvdXNlbC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbWFnZUNhcm91c2VsL2Jyb3dzZXIvaW1hZ2VDYXJvdXNlbC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTywyQkFBMkIsQ0FBQztBQUNuQyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUUxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG9CQUFvQixFQUF1QixNQUFNLDRCQUE0QixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBNkMsTUFBTSwyQkFBMkIsQ0FBQztBQUN4RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7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