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
import { IEditorService, MODAL_GROUP } from '../../../services/editor/common/editorService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ImageCarouselEditor } from './imageCarouselEditor.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { IImageCarouselCollection } from './imageCarouselTypes.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';

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
		await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
	}
}

registerAction2(OpenImageInCarouselAction);
