/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/imageCarousel.css';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { IEditorService, MODAL_GROUP } from '../../../services/editor/common/editorService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatResponseViewModel, isResponseVM } from '../../chat/common/model/chatViewModel.js';
import { ImageCarouselEditor } from './imageCarouselEditor.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { IImageCarouselService, ImageCarouselService } from './imageCarouselService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';

// --- Service Registration ---

registerSingleton(IImageCarouselService, ImageCarouselService, InstantiationType.Delayed);

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

// --- Actions ---

class OpenImageInCarouselAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.openImageInCarousel',
			title: localize2('openImageInCarousel', "Open Image in Carousel"),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, args: { name: string; mimeType: string; data: Uint8Array }): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const carouselService = accessor.get(IImageCarouselService);

		const clickedData = VSBuffer.wrap(args.data);

		// Try to find all images from the focused chat widget's responses
		const widget = chatWidgetService.lastFocusedWidget;
		if (widget?.viewModel) {
			const responses = widget.viewModel.getItems().filter((item): item is IChatResponseViewModel => isResponseVM(item));
			// Search responses in reverse to find the one containing the clicked image
			for (let i = responses.length - 1; i >= 0; i--) {
				const collection = await carouselService.extractImagesFromResponse(responses[i]);
				if (collection && collection.images.length > 0) {
					// Only use this collection if it actually contains the clicked image
					const startIndex = collection.images.findIndex(img => img.data.equals(clickedData));
					if (startIndex !== -1) {
						const input = new ImageCarouselEditorInput(collection, startIndex);
						await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
						return;
					}
				}
			}
		}

		// Fallback: open just the single clicked image
		const collection = {
			id: generateUuid(),
			title: localize('imageCarousel.title', "Image Carousel"),
			images: [{
				id: generateUuid(),
				name: args.name,
				mimeType: args.mimeType,
				data: VSBuffer.wrap(args.data),
			}],
		};

		const input = new ImageCarouselEditorInput(collection);
		await editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
	}
}

registerAction2(OpenImageInCarouselAction);
