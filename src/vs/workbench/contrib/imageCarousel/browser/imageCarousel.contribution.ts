/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/imageCarousel.css';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ImageCarouselEditor } from './imageCarouselEditor.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { ICarouselImage, IImageCarouselCollection } from './imageCarouselTypes.js';
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
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Limiter } from '../../../../base/common/async.js';

// --- Configuration ---

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'imageCarousel',
	title: localize('imageCarouselConfigurationTitle', "Image Carousel"),
	type: 'object',
	properties: {
		'imageCarousel.explorerContextMenu.enabled': {
			type: 'boolean',
			default: false,
			markdownDescription: localize('imageCarousel.explorerContextMenu.enabled', "Controls whether the **Open in Image Carousel** option appears in the Explorer context menu. This is an experimental feature."),
			tags: ['experimental'],
		},
	}
});

// --- Editor Pane Registration ---

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ImageCarouselEditor,
		ImageCarouselEditor.ID,
		localize('imageCarouselEditor', "Image Carousel")
	),
	[
		new SyncDescriptor(ImageCarouselEditorInput)
	]
);

// --- Serializer ---

class ImageCarouselEditorInputSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return false;
	}

	serialize(): string | undefined {
		return undefined;
	}

	deserialize(): ImageCarouselEditorInput | undefined {
		return undefined;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(ImageCarouselEditorInput.ID, ImageCarouselEditorInputSerializer);

// --- Args Types ---

interface IOpenCarouselCollectionArgs {
	readonly collection: IImageCarouselCollection;
	readonly startIndex: number;
}

interface IOpenCarouselSingleImageArgs {
	readonly name: string;
	readonly mimeType: string;
	readonly data: Uint8Array;
	readonly title?: string;
}

function isCollectionArgs(args: unknown): args is IOpenCarouselCollectionArgs {
	return typeof args === 'object' && args !== null
		&& typeof (args as IOpenCarouselCollectionArgs).collection === 'object'
		&& typeof (args as IOpenCarouselCollectionArgs).startIndex === 'number';
}

function isSingleImageArgs(args: unknown): args is IOpenCarouselSingleImageArgs {
	return typeof args === 'object' && args !== null
		&& typeof (args as IOpenCarouselSingleImageArgs).name === 'string'
		&& typeof (args as IOpenCarouselSingleImageArgs).mimeType === 'string'
		&& (args as IOpenCarouselSingleImageArgs).data instanceof Uint8Array;
}

// --- Actions ---

class OpenImageInCarouselAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.openImageInCarousel',
			title: localize2('openImageInCarousel', "Open Image in Carousel"),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, args?: unknown): Promise<void> {
		const editorService = accessor.get(IEditorService);

		let collection: IImageCarouselCollection;
		let startIndex: number;

		if (isCollectionArgs(args)) {
			collection = args.collection;
			startIndex = args.startIndex;
		} else if (isSingleImageArgs(args)) {
			collection = {
				id: generateUuid(),
				title: args.title ?? localize('imageCarousel.title', "Image Carousel"),
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
		} else {
			return;
		}

		const input = new ImageCarouselEditorInput(collection, startIndex);
		await editorService.openEditor(input, { pinned: true });
	}
}

registerAction2(OpenImageInCarouselAction);

// --- Explorer Context Menu Integration ---

/** Supported image extensions for the carousel explorer context menu. */
const IMAGE_EXTENSION_REGEX = /^\.(png|jpg|jpeg|jpe|gif|webp|svg|bmp|ico)$/i;

function isImageResource(uri: URI): boolean {
	return IMAGE_EXTENSION_REGEX.test(extname(uri));
}

async function collectImageFilesFromFolder(fileService: IFileService, folderUri: URI): Promise<URI[]> {
	const stat = await fileService.resolve(folderUri);
	const imageUris: URI[] = [];
	if (stat.children) {
		for (const child of stat.children) {
			if (child.isFile && isImageResource(child.resource)) {
				imageUris.push(child.resource);
			}
		}
	}
	imageUris.sort((a, b) => basename(a).localeCompare(basename(b)));
	return imageUris;
}

async function readImageFiles(fileService: IFileService, uris: URI[]): Promise<ICarouselImage[]> {
	const limiter = new Limiter<ICarouselImage | undefined>(10);
	const results = await Promise.all(
		uris.map(uri => limiter.queue(async () => {
			try {
				const content = await fileService.readFile(uri);
				const mimeType = getMediaMime(uri.path) ?? 'image/png';
				return {
					id: generateUuid(),
					name: basename(uri),
					mimeType,
					data: content.value,
					uri,
				};
			} catch {
				return undefined;
			}
		}))
	);
	return results.filter((r): r is ICarouselImage => r !== undefined);
}

class OpenImagesInCarouselFromExplorerAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openImagesInCarousel',
			title: localize2('openImagesInCarousel', "Open in Image Carousel"),
			f1: false,
			menu: [{
				id: MenuId.ExplorerContext,
				group: 'navigation',
				order: 25,
				when: ContextKeyExpr.and(
					ContextKeyExpr.has('config.imageCarousel.explorerContextMenu.enabled'),
					ContextKeyExpr.or(
						ExplorerFolderContext,
						ContextKeyExpr.regex(ResourceContextKey.Extension.key, IMAGE_EXTENSION_REGEX),
					),
				),
			}],
		});
	}

	async run(accessor: ServicesAccessor, resource?: URI): Promise<void> {
		const explorerService = accessor.get(IExplorerService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const contextService = accessor.get(IWorkspaceContextService);

		const context = explorerService.getContext(true);

		let imageUris: URI[] = [];
		let startUri: URI | undefined;

		try {
			if (context.length === 0) {
				// Empty-space right-click: the explorer passes the workspace root
				// as the resource argument. Fall back to the first workspace folder
				// when no resource is available.
				let folderUri: URI | undefined;
				if (URI.isUri(resource)) {
					folderUri = resource;
				} else {
					const folders = contextService.getWorkspace().folders;
					if (folders.length > 0) {
						folderUri = folders[0].uri;
					}
				}

				if (folderUri) {
					imageUris = await collectImageFilesFromFolder(fileService, folderUri);
				}
			} else {
				const hasSingleImageFile = context.length === 1 && !context[0].isDirectory && isImageResource(context[0].resource);

				if (hasSingleImageFile) {
					// Single image: show all sibling images in the same folder with
					// the selected image focused
					startUri = context[0].resource;
					const parentUri = dirname(context[0].resource);
					imageUris = await collectImageFilesFromFolder(fileService, parentUri);
				} else {
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
						} else if (isImageResource(item.resource)) {
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
		} catch {
			notificationService.error(localize('folderReadError', "Could not read folder contents."));
			return;
		}

		if (imageUris.length === 0) {
			notificationService.info(localize('noImagesFound', "No images found in this folder."));
			return;
		}

		const images = await readImageFiles(fileService, imageUris);
		if (images.length === 0) {
			notificationService.error(localize('imageReadError', "Could not read the selected images."));
			return;
		}

		let startIndex = 0;
		if (startUri) {
			const idx = images.findIndex(img => img.uri?.toString() === startUri!.toString());
			if (idx >= 0) {
				startIndex = idx;
			}
		}

		const collection: IImageCarouselCollection = {
			id: generateUuid(),
			title: localize('imageCarousel.explorerTitle', "Image Carousel"),
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
