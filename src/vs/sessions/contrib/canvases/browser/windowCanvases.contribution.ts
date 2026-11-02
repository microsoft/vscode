/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { IWindowCanvasService, WindowCanvasInput, WindowCanvasService } from '../../../services/canvas/browser/windowCanvasService.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { WindowCanvasesAvailableContext } from '../common/sessionCanvas.js';
import { WindowCanvasEditor } from './windowCanvasEditor.js';

registerSingleton(IWindowCanvasService, WindowCanvasService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(WindowCanvasEditor, WindowCanvasInput.EDITOR_ID, localize('windowCanvas.editor', "Canvas")),
	[new SyncDescriptor(WindowCanvasInput)],
);

class WindowCanvasesContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.windowCanvases';

	constructor(
		@IWindowCanvasService canvasService: IWindowCanvasService,
		@ISessionEditorWorkingSetService workingSetService: ISessionEditorWorkingSetService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._register(canvasService.connectWorkingSets({
			state: workingSetService.restoreState,
			registerEditorToRetain: input => workingSetService.registerEditorToRetain(input),
			suppressEditorPartAutoVisibility: () => layoutService.suppressEditorPartAutoVisibility(),
		}));
		const available = WindowCanvasesAvailableContext.bindTo(contextKeyService);
		const registrations = this._register(new DisposableStore());
		this._register(autorun(reader => {
			registrations.clear();
			const canvases = canvasService.canvases.read(reader);
			available.set(canvases.length > 0);
			for (const canvas of canvases) {
				const command = { id: `sessions.windowCanvas.open.${canvas.id}`, title: canvas.title, icon: canvas.icon };
				registrations.add(CommandsRegistry.registerCommand(command.id, () => canvasService.openCanvas(canvas.id)));
				for (const menu of [Menus.SessionsEditorTabsBarAddTabCanvas, Menus.SessionActivityBarCanvas]) {
					registrations.add(MenuRegistry.appendMenuItem(menu, { command, group: '1_available', when: ChatContextKeys.enabled }));
				}
			}
		}));
		const when = ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext, IsAuxiliaryWindowContext.toNegated(), WindowCanvasesAvailableContext);
		for (const menu of [Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab, Menus.SessionActivityBar]) {
			const activityBar = menu === Menus.SessionActivityBar;
			this._register(MenuRegistry.appendMenuItem(menu, {
				submenu: activityBar ? Menus.SessionActivityBarCanvas : Menus.SessionsEditorTabsBarAddTabCanvas,
				title: localize('windowCanvas.submenu', "Canvas"),
				icon: Codicon.preview,
				group: activityBar ? SessionActivityBarGroup.SidePanel : 'navigation',
				order: 4,
				when: activityBar ? when : ContextKeyExpr.and(when, IsTopRightEditorGroupContext),
			}));
		}
	}
}

registerWorkbenchContribution2(WindowCanvasesContribution.ID, WindowCanvasesContribution, WorkbenchPhase.BlockRestore);
