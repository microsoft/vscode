/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatImageSlideshow.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorInputSerializer } from '../../../common/editor.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ChatImageSlideshowEditor } from './chatImageSlideshowEditor.js';
import { ChatImageSlideshowEditorInput } from './chatImageSlideshowEditorInput.js';
import { ChatImageSlideshowService, IChatImageSlideshowService } from './chatImageSlideshowService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';

// Register the service
registerSingleton(IChatImageSlideshowService, ChatImageSlideshowService, InstantiationType.Delayed);

// Register the editor pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.Editorpane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatImageSlideshowEditor,
		ChatImageSlideshowEditor.ID,
		localize('chatImageSlideshowEditor', "Chat Image Slideshow")
	),
	[
		new SyncDescriptor(ChatImageSlideshowEditorInput)
	]
);

// Register the editor input serializer (non-persistent)
class ChatImageSlideshowEditorInputSerializer implements IEditorInputSerializer {
	canSerialize(): boolean {
		return false; // We don't persist these editors
	}

	serialize(): string | undefined {
		return undefined;
	}

	deserialize(): ChatImageSlideshowEditorInput | undefined {
		return undefined;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(ChatImageSlideshowEditorInput.ID, ChatImageSlideshowEditorInputSerializer);

// Register command to open images from chat response in slideshow
class OpenChatImagesInSlideshowAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.openImagesInSlideshow',
			title: localize2('openChatImagesInSlideshow', 'Open Images in Slideshow'),
			category: Categories.View,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const slideshowService = accessor.get(IChatImageSlideshowService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const editorService = accessor.get(IEditorService);

		// Get the last focused chat widget
		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		// Get the current view model
		const viewModel = widget.viewModel;
		if (!viewModel) {
			return;
		}

		// Try to extract images from the last response
		const responses = viewModel.getItems().filter(item => item.kind === 'response');
		if (responses.length === 0) {
			return;
		}

		const lastResponse = responses[responses.length - 1];
		const collection = await slideshowService.extractImagesFromResponse(lastResponse);
		
		if (!collection || collection.images.length === 0) {
			// TODO: Show a notification that no images were found
			return;
		}

		// Open the slideshow
		const input = new ChatImageSlideshowEditorInput(collection);
		await editorService.openEditor(input, { pinned: true });
	}
}

registerAction2(OpenChatImagesInSlideshowAction);
