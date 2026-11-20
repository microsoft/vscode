/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { getWindowId } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { ServicesAccessor } from '../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext } from '../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { EditorAreaFocusContext, IsAuxiliaryWindowContext, LayoutModeContext } from '../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../workbench/contrib/sessions/common/contextkeys.js';
import { logSessionsInteraction } from '../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { AgentsWindowMenus } from '../../browser/agentsWindowMenus.js';
import { resolveSessionCommandTarget } from '../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { OpenInVSCodeTitleBarWidget } from '../../browser/widget/openInVSCodeWidget.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IOpenedMainWindow } from '../../../platform/window/common/window.js';
import { EmbeddedEditorVisibleContext, IEmbeddedEditorService } from '../embeddedEditor.js';
import { EditorWindowTargetResolver } from '../editorWindowTarget.js';
import { OPEN_VSCODE_WINDOW_COMMAND_ID, RETURN_TO_VSCODE_EDITOR_COMMAND_ID, SHOULD_SHOW_RETURN_TO_VSCODE_EDITOR_COMMAND_ID } from '../../../workbench/contrib/sessions/common/sessionCommands.js';
import { IChat, ISession } from '../../../workbench/services/sessions/common/session.js';

export class OpenSessionInVSCodeAction extends Action2 {
	static readonly ID = 'agents.openSessionInVSCode';

	constructor() {
		super({
			id: OpenSessionInVSCodeAction.ID,
			title: localize2('openInVSCode', 'Open in Editor'),
			icon: Codicon.vscodeInsiders,
			toggled: { condition: EmbeddedEditorVisibleContext, title: localize('backToAgents', "Back to Agents") },
			precondition: ContextKeyExpr.and(ContextKeyExpr.or(IsAuxiliaryWindowContext.toNegated(), LayoutModeContext)!, SessionsWelcomeVisibleContext.toNegated()),
			menu: [{
				id: AgentsWindowMenus.TitleBarCenterRight,
				group: 'navigation',
				order: 7,
				when: ContextKeyExpr.and(ContextKeyExpr.or(IsAuxiliaryWindowContext.toNegated(), LayoutModeContext)!, SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, context?: { readonly session: ISession; readonly chat: IChat }): Promise<void> {
		const telemetryService = accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openInVSCode');

		const instantiationService = accessor.get(IInstantiationService);
		const embeddedEditorService = accessor.get(IEmbeddedEditorService);

		// Pressed again, the editor in the window gives way to the session
		if (embeddedEditorService.visible.get()) {
			return embeddedEditorService.hide();
		}

		// The session of the window it is invoked from, such as from the title row of a chat window, else of the focused window.
		const target = context?.session ? context : instantiationService.invokeFunction(accessor => resolveSessionCommandTarget(accessor, []));
		if (embeddedEditorService.enabled && target?.session && await embeddedEditorService.show(target.session, target.chat)) {
			return;
		}

		return instantiationService.invokeFunction(openSessionInVSCode, target?.session, target?.chat);
	}
}

export async function openSessionInVSCode(accessor: ServicesAccessor, session: ISession | undefined, chat?: IChat): Promise<void> {
	const nativeHostService = accessor.get(INativeHostService);
	const target = accessor.get(IInstantiationService).createInstance(EditorWindowTargetResolver).resolve(session, chat);
	if (target.kind === 'empty') {
		return nativeHostService.openWindow(target.options);
	}

	return nativeHostService.openWindow(target.folders, { forceNewWindow: true, chatSessionToOpen: target.chatSessionToOpen });
}

export class OpenVSCodeWindowAction extends Action2 {
	static readonly ID = OPEN_VSCODE_WINDOW_COMMAND_ID;

	constructor() {
		super({
			id: OpenVSCodeWindowAction.ID,
			title: localize2('openVSCodeWindow', 'Open VS Code Window'),
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				// On Linux, Ctrl+Shift+A is Toggle Block Comment, so defer to it in a focused writable editor.
				when: ContextKeyExpr.or(IsLinuxContext.toNegated(), EditorAreaFocusContext.toNegated(), EditorContextKeys.readOnly),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
		const currentWindowId = getWindowId(mainWindow);
		const vscodeWindow = windows.find(w => w.id !== currentWindowId);

		if (vscodeWindow) {
			await nativeHostService.focusWindow({ targetWindowId: vscodeWindow.id });
		} else {
			await nativeHostService.openWindow();
		}
	}
}

export class ReturnToVSCodeEditorAction extends Action2 {

	constructor() {
		super({
			id: RETURN_TO_VSCODE_EDITOR_COMMAND_ID,
			title: localize2('returnToVSCodeEditor', 'Return to VS Code Editor'),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		await returnToVSCodeEditor(nativeHostService, getWindowId(mainWindow));
	}
}

export class ShouldShowReturnToVSCodeEditorAction extends Action2 {

	constructor() {
		super({
			id: SHOULD_SHOW_RETURN_TO_VSCODE_EDITOR_COMMAND_ID,
			title: localize2('shouldShowReturnToVSCodeEditor', 'Check Whether to Show Return to VS Code Editor'),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<boolean> {
		const nativeHostService = accessor.get(INativeHostService);
		const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
		return shouldShowReturnToVSCodeEditor(windows, getWindowId(mainWindow));
	}
}

export function shouldShowReturnToVSCodeEditor(windows: readonly IOpenedMainWindow[], currentWindowId: number): boolean {
	return !windows.some(window => window.id !== currentWindowId);
}

export async function returnToVSCodeEditor(nativeHostService: INativeHostService, currentWindowId: number): Promise<void> {
	await nativeHostService.openWindow();
	await nativeHostService.closeWindow({ targetWindowId: currentWindowId });
}

export class OpenInVSCodeWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openInVSCode.widget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(AgentsWindowMenus.TitleBarCenterRight, OpenSessionInVSCodeAction.ID, (action, options) => {
			return instantiationService.createInstance(OpenInVSCodeTitleBarWidget, action, options, OpenVSCodeWindowAction.ID);
		}, undefined));
	}
}
