/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, ResourceContextKey } from '../../../../workbench/common/contextkeys.js';
import { CANVAS_INPUT_SCHEME, CanvasInput, getCanvasInstanceLabels, ICanvasContextService, ICanvasReference } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { CanvasesPinnedToSidebarContext, IPinnedCanvas, IPinnedCanvasService, PINNED_CANVAS_PAGE_ID, PinnedCanvasConnectedContext } from '../browser/pinnedCanvases.js';

export const TOGGLE_CANVAS_PINNED_TO_SIDEBAR_COMMAND_ID = 'workbench.action.agentSessions.toggleCanvasPinnedToSidebar';
export const ADD_CANVAS_TO_SIDEBAR_COMMAND_ID = 'workbench.action.agentSessions.addCanvasToSidebar';
export const PICK_CANVAS_TO_ADD_TO_SIDEBAR_COMMAND_ID = 'workbench.action.agentSessions.pickCanvasToAddToSidebar';
export const REMOVE_CANVAS_FROM_SIDEBAR_COMMAND_ID = 'workbench.action.agentSessions.removeCanvasFromSidebar';
export const GO_TO_PINNED_CANVAS_CHAT_COMMAND_ID = 'workbench.action.agentSessions.goToPinnedCanvasChat';
export const CLOSE_PINNED_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.closePinnedCanvas';

/** Canvases can be pinned in the Agents window while chat and canvases are enabled. */
export const pinnedCanvasesAvailable = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	ContextKeyExpr.equals(`config.${CanvasesEnabledSettingId}`, true),
);

/** Whether the editor in context, the active one or a tab's, is a pinned canvas. */
const canvasPinnedToSidebar = ContextKeyExpr.in(ResourceContextKey.Resource.key, CanvasesPinnedToSidebarContext.key);
const canvasTab = ContextKeyExpr.and(pinnedCanvasesAvailable, ResourceContextKey.Scheme.isEqualTo(CANVAS_INPUT_SCHEME));
const activeCanvasEditor = ContextKeyExpr.and(pinnedCanvasesAvailable, ActiveEditorContext.isEqualTo(CanvasInput.EDITOR_ID));

/** Resolves the canvas editor an editor action targets: the tab it was invoked on, or the active editor. */
function getCanvasEditorReference(accessor: ServicesAccessor, arg: unknown): ICanvasReference | undefined {
	const editorService = accessor.get(IEditorService);
	if (URI.isUri(arg)) {
		const editor = arg.scheme === CANVAS_INPUT_SCHEME
			? editorService.findEditors(arg).map(identifier => identifier.editor).find(editor => editor instanceof CanvasInput)
			: undefined;
		return editor instanceof CanvasInput ? editor.reference : undefined;
	}
	const active = editorService.activeEditor;
	return active instanceof CanvasInput ? active.reference : undefined;
}

/**
 * Resolves the pin a pin action targets: a sidebar row passes its pin ID, a canvas
 * tab passes its editor resource, and the canvas page passes nothing.
 */
function getPinnedCanvas(accessor: ServicesAccessor, arg: unknown): IPinnedCanvas | undefined {
	const pinnedCanvasService = accessor.get(IPinnedCanvasService);
	if (typeof arg === 'string') {
		return pinnedCanvasService.entries.get().find(entry => entry.id === arg);
	}
	if (URI.isUri(arg)) {
		const reference = getCanvasEditorReference(accessor, arg);
		return reference && pinnedCanvasService.getEntry(reference);
	}
	if (accessor.get(ICustomViewService).activeCustomView.get()?.id === PINNED_CANVAS_PAGE_ID) {
		return pinnedCanvasService.selected.get();
	}
	const reference = getCanvasEditorReference(accessor, undefined);
	return reference && pinnedCanvasService.getEntry(reference);
}

class ToggleCanvasPinnedToSidebarAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CANVAS_PINNED_TO_SIDEBAR_COMMAND_ID,
			title: localize2('addCanvasToSidebar', "Add to Sidebar"),
			icon: Codicon.pin,
			toggled: {
				condition: canvasPinnedToSidebar,
				title: localize('removeCanvasFromSidebar', "Remove from Sidebar"),
				icon: Codicon.unpin,
			},
			precondition: pinnedCanvasesAvailable,
			menu: [{
				id: Menus.SessionsEditorTitle,
				group: 'navigation',
				order: 50,
				when: activeCanvasEditor,
			}],
		});
	}

	run(accessor: ServicesAccessor, arg?: unknown): void {
		const reference = getCanvasEditorReference(accessor, arg);
		if (!reference) {
			return;
		}
		const pinnedCanvasService = accessor.get(IPinnedCanvasService);
		if (pinnedCanvasService.isPinned(reference)) {
			pinnedCanvasService.unpin(reference);
		} else {
			pinnedCanvasService.pin(reference);
		}
	}
}

class AddCanvasToSidebarAction extends Action2 {
	constructor() {
		super({
			id: ADD_CANVAS_TO_SIDEBAR_COMMAND_ID,
			title: localize2('addCanvasToSidebar', "Add to Sidebar"),
			icon: Codicon.pin,
			precondition: pinnedCanvasesAvailable,
			menu: [{
				id: MenuId.EditorTitleContext,
				group: '4_canvas',
				order: 10,
				when: ContextKeyExpr.and(canvasTab, canvasPinnedToSidebar.negate()),
			}],
		});
	}

	run(accessor: ServicesAccessor, arg?: unknown): void {
		const reference = getCanvasEditorReference(accessor, arg);
		if (reference) {
			accessor.get(IPinnedCanvasService).pin(reference);
		}
	}
}

class RemoveCanvasFromSidebarAction extends Action2 {
	constructor() {
		super({
			id: REMOVE_CANVAS_FROM_SIDEBAR_COMMAND_ID,
			title: localize2('removeCanvasFromSidebar', "Remove from Sidebar"),
			icon: Codicon.unpin,
			precondition: pinnedCanvasesAvailable,
			menu: [{
				id: MenuId.EditorTitleContext,
				group: '4_canvas',
				order: 10,
				when: ContextKeyExpr.and(canvasTab, canvasPinnedToSidebar),
			}, {
				id: Menus.SidebarCanvasContext,
				group: '2_organize',
				order: 10,
				when: pinnedCanvasesAvailable,
			}, {
				id: Menus.SidebarCanvasToolbar,
				group: 'navigation',
				order: 10,
				when: pinnedCanvasesAvailable,
			}, {
				id: Menus.CustomViewCanvas,
				group: '2_organize',
				order: 10,
				when: pinnedCanvasesAvailable,
			}],
		});
	}

	run(accessor: ServicesAccessor, arg?: unknown): void {
		const entry = getPinnedCanvas(accessor, arg);
		if (entry) {
			accessor.get(IPinnedCanvasService).unpin(entry);
		}
	}
}

class GoToPinnedCanvasChatAction extends Action2 {
	constructor() {
		super({
			id: GO_TO_PINNED_CANVAS_CHAT_COMMAND_ID,
			title: localize2('goToPinnedCanvasChat', "Go to Chat"),
			icon: Codicon.commentDiscussion,
			precondition: pinnedCanvasesAvailable,
			menu: [{
				id: Menus.SidebarCanvasContext,
				group: 'navigation',
				order: 10,
				when: pinnedCanvasesAvailable,
			}, {
				id: Menus.CustomViewCanvas,
				group: 'navigation',
				order: 10,
				when: pinnedCanvasesAvailable,
			}],
		});
	}

	async run(accessor: ServicesAccessor, arg?: unknown): Promise<void> {
		const entry = getPinnedCanvas(accessor, arg);
		if (entry) {
			await accessor.get(IPinnedCanvasService).goToChat(entry);
		}
	}
}

class ClosePinnedCanvasAction extends Action2 {
	constructor() {
		super({
			id: CLOSE_PINNED_CANVAS_COMMAND_ID,
			title: localize2('closePinnedCanvas', "Close Canvas"),
			icon: Codicon.close,
			precondition: ContextKeyExpr.and(pinnedCanvasesAvailable, PinnedCanvasConnectedContext),
			menu: [{
				id: Menus.SidebarCanvasContext,
				group: '4_manage',
				order: 10,
				when: pinnedCanvasesAvailable,
			}, {
				id: Menus.CustomViewCanvas,
				group: '4_manage',
				order: 10,
				when: pinnedCanvasesAvailable,
			}],
		});
	}

	async run(accessor: ServicesAccessor, arg?: unknown): Promise<void> {
		const entry = getPinnedCanvas(accessor, arg);
		if (entry) {
			await accessor.get(IPinnedCanvasService).closeCanvas(entry);
		}
	}
}

interface ICanvasPickItem extends IQuickPickItem {
	readonly reference: ICanvasReference;
}

class PickCanvasToAddToSidebarAction extends Action2 {
	constructor() {
		super({
			id: PICK_CANVAS_TO_ADD_TO_SIDEBAR_COMMAND_ID,
			title: localize2('pickCanvasToAddToSidebar', "Add Canvas to Sidebar..."),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: pinnedCanvasesAvailable,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const pinnedCanvasService = accessor.get(IPinnedCanvasService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const targets = accessor.get(ICanvasContextService).contexts.get().flatMap(context => (context.canvases.get() ?? [])
			.filter(canvas => canvas.instanceId !== undefined)
			.map(canvas => ({ reference: { ...context.owner, canvas: canvas.resource }, canvas })));
		const labels = getCanvasInstanceLabels(targets.map(target => target.canvas));
		const items: ICanvasPickItem[] = targets.flatMap((target, index) => pinnedCanvasService.isPinned(target.reference) ? [] : [{
			reference: target.reference,
			label: labels[index],
			description: target.canvas.status,
		}]);
		if (items.length === 0) {
			notificationService.info(targets.length === 0
				? localize('pickCanvasToAddToSidebar.none', "This chat has no open canvases to add to the sidebar.")
				: localize('pickCanvasToAddToSidebar.allPinned', "Every open canvas of this chat is already in the sidebar."));
			return;
		}
		const picked = await quickInputService.pick(items, {
			placeHolder: localize('pickCanvasToAddToSidebar.placeholder', "Select a canvas of this chat to add to the sidebar"),
		});
		if (picked) {
			pinnedCanvasService.pin(picked.reference);
		}
	}
}

registerAction2(ToggleCanvasPinnedToSidebarAction);
registerAction2(AddCanvasToSidebarAction);
registerAction2(RemoveCanvasFromSidebarAction);
registerAction2(GoToPinnedCanvasChatAction);
registerAction2(ClosePinnedCanvasAction);
registerAction2(PickCanvasToAddToSidebarAction);
