/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatImageSlideshow.css';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ChatImageSlideshowEditor } from './chatImageSlideshowEditor.js';
import { ChatImageSlideshowEditorInput } from './chatImageSlideshowEditorInput.js';
import { ChatImageSlideshowService, IChatImageSlideshowService } from './chatImageSlideshowService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IChatResponseViewModel, isResponseVM } from '../../chat/common/model/chatViewModel.js';

registerSingleton(IChatImageSlideshowService, ChatImageSlideshowService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatImageSlideshowEditor,
		ChatImageSlideshowEditor.ID,
		localize('chatImageSlideshowEditor', "Chat Image Slideshow")
	),
	[
		new SyncDescriptor(ChatImageSlideshowEditorInput)
	]
);

class ChatImageSlideshowEditorInputSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return false;

	serialize(): string | undefined {
		return undefined;
	}

	deserialize(): ChatImageSlideshowEditorInput | undefined {
		return undefined;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(ChatImageSlideshowEditorInput.ID, ChatImageSlideshowEditorInputSerializer);

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

		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const viewModel = widget.viewModel;
		if (!viewModel) {
			return;
		}

		const responses = viewModel.getItems().filter((item): item is IChatResponseViewModel => isResponseVM(item));
		if (responses.length === 0) {
			return;
		}

		const lastResponse = responses[responses.length - 1];
		const collection = await slideshowService.extractImagesFromResponse(lastResponse);

		if (!collection || collection.images.length === 0) {
			return;
		}

		const input = new ChatImageSlideshowEditorInput(collection);
		await editorService.openEditor(input, { pinned: true });
	}
}

registerAction2(OpenChatImagesInSlideshowAction);
