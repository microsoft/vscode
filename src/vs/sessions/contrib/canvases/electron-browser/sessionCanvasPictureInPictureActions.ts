/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { resolveCommandsContext } from '../../../../workbench/browser/parts/editor/editorCommandsContext.js';
import { ActiveEditorContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { CanvasInput, CanvasPictureInPictureEnabledSettingId } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { CanvasPictureInPictureActive, ISessionCanvasPictureInPictureService } from './sessionCanvasPictureInPicture.js';

export const OPEN_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID = 'workbench.action.agentSessions.canvas.openPictureInPicture';
export const SHOW_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID = 'workbench.action.agentSessions.canvas.showPictureInPicture';
export const STASH_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID = 'workbench.action.agentSessions.canvas.stash';
export const DOCK_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID = 'workbench.action.agentSessions.canvas.returnToTab';
export const GO_TO_CANVAS_PICTURE_IN_PICTURE_CHAT_COMMAND_ID = 'workbench.action.agentSessions.canvas.goToPictureInPictureChat';

export function registerCanvasPictureInPictureActions(): IDisposable {
	const store = new DisposableStore();
	const category = localize2('canvas.category', "Canvas");
	const enabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${CanvasPictureInPictureEnabledSettingId}`, true));
	const canvasActive = ContextKeyExpr.and(enabled, ActiveEditorContext.isEqualTo(CanvasInput.EDITOR_ID));
	const floating = ContextKeyExpr.and(enabled, CanvasPictureInPictureActive);
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: OPEN_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID,
				title: localize2('canvas.pipOpen', "Open in Picture-in-Picture"),
				category, icon: Codicon.multipleWindows, f1: true,
				precondition: canvasActive,
				menu: [
					{ id: Menus.SessionsEditorTitle, when: canvasActive, group: 'navigation', order: 1 },
					{ id: Menus.SessionsEditorTabsBarContext, when: canvasActive, group: 'navigation', order: 1 },
					{ id: MenuId.EditorTitleContext, when: canvasActive, group: 'navigation', order: 1 },
				],
			});
		}
		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			const service = accessor.get(ISessionCanvasPictureInPictureService);
			if (!service.enabled) {
				return;
			}
			const context = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
			const canvas = context.groupedEditors.flatMap(({ group, editors }) => editors
				.filter((input): input is CanvasInput => input instanceof CanvasInput)
				.map(input => ({ input, group })))[0];
			if (canvas) {
				await service.open(canvas.input, canvas.group);
			}
		}
	}));
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: SHOW_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID,
				title: localize2('canvas.pipShow', "Show Floating Canvas"),
				category, f1: true,
				precondition: floating,
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(ISessionCanvasPictureInPictureService).reveal();
		}
	}));
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: STASH_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID,
				title: localize2('canvas.pipStash', "Hide Floating Canvas at Side"),
				category, f1: true,
				precondition: floating,
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(ISessionCanvasPictureInPictureService).stash();
		}
	}));
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: DOCK_CANVAS_PICTURE_IN_PICTURE_COMMAND_ID,
				title: localize2('canvas.pipDock', "Return Floating Canvas to Tab"),
				category, f1: true,
				precondition: floating,
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(ISessionCanvasPictureInPictureService).dock();
		}
	}));
	store.add(registerAction2(class extends Action2 {
		constructor() {
			super({
				id: GO_TO_CANVAS_PICTURE_IN_PICTURE_CHAT_COMMAND_ID,
				title: localize2('canvas.pipGoToChat', "Go to Floating Canvas Chat"),
				category, f1: true,
				precondition: floating,
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(ISessionCanvasPictureInPictureService).goToChat();
		}
	}));
	return store;
}
