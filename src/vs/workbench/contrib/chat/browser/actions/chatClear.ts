/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IViewsService } from 'vs/workbench/common/views';
import { IChatWidgetService, type IChatViewPane, type IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export async function clearChatSession(accessor: ServicesAccessor, widget: IChatWidget): Promise<void> {
	const viewsService = accessor.get(IViewsService);

	if ('viewId' in widget.viewContext) {
		// This cast is to break a circular dependency- ideally this would not be called directly for `/clear`
		// from the widget class, but from some contribution.
		const view = viewsService.getViewWithId(widget.viewContext.viewId);
		if (!view || !(view as any as IChatViewPane).clear) {
			return;
		}

		(view as any as IChatViewPane).clear();
	} else {
		await clearChatEditor(accessor, widget);
	}
}

export async function clearChatEditor(accessor: ServicesAccessor, widget: IChatWidget): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const editorGroupsService = accessor.get(IEditorGroupsService);
	const widgetService = accessor.get(IChatWidgetService);

	await editorService.replaceEditors([{
		editor: editorService.activeEditor!,
		replacement: { resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { providerId: widgetService.lastFocusedWidget!.providerId, pinned: true } } }
	}], editorGroupsService.activeGroup);
}
