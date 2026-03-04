/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BrowserEditor, CONTEXT_BROWSER_CAN_GO_BACK, CONTEXT_BROWSER_CAN_GO_FORWARD, CONTEXT_BROWSER_CAN_ZOOM_IN, CONTEXT_BROWSER_CAN_ZOOM_OUT, CONTEXT_BROWSER_DEVTOOLS_OPEN, CONTEXT_BROWSER_FOCUSED, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_STORAGE_SCOPE, CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE, CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE } from './browserEditor.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';

// Context key expression to check if browser editor is active
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditor.ID);

const BrowserCategory = localize2('browserCategory', "Browser");
const ActionGroupTabs = '1_tabs';
const ActionGroupZoom = '2_zoom';
const ActionGroupPage = '3_page';
const ActionGroupSettings = '4_settings';

interface IOpenBrowserOptions {
	url?: string;
	openToSide?: boolean;
}

class OpenIntegratedBrowserAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.open',
			title: localize2('browser.openAction', "Open Integrated Browser"),
			category: BrowserCategory,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, urlOrOptions?: string | IOpenBrowserOptions): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);

		// Parse arguments
		const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : (urlOrOptions ?? {});
		const resource = BrowserViewUri.forUrl(options.url);
		const group = options.openToSide ? SIDE_GROUP : ACTIVE_GROUP;

		logBrowserOpen(telemetryService, options.url ? 'commandWithUrl' : 'commandWithoutUrl');

		const editorPane = await editorService.openEditor({ resource }, group);

		// Lock the group when opening to the side
		if (options.openToSide && editorPane?.group) {
			editorPane.group.lock(true);
		}
	}
}

class NewTabAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.newTab',
			title: localize2('browser.newTabAction', "New Tab"),
			category: BrowserCategory,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupTabs,
				order: 1,
			},
			// When already in a browser, Ctrl/Cmd + T opens a new tab
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over search actions
				primary: KeyMod.CtrlCmd | KeyCode.KeyT,
			}
		});
	}

	async run(accessor: ServicesAccessor, _browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);
		const resource = BrowserViewUri.forUrl(undefined);

		logBrowserOpen(telemetryService, 'newTabCommand');

		await editorService.openEditor({ resource });
	}
}

class GoBackAction extends Action2 {
	static readonly ID = 'workbench.action.browser.goBack';

	constructor() {
		super({
			id: GoBackAction.ID,
			title: localize2('browser.goBackAction', 'Go Back'),
			category: BrowserCategory,
			icon: Codicon.arrowLeft,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 1,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over editor navigation
				primary: KeyMod.Alt | KeyCode.LeftArrow,
				secondary: [KeyCode.BrowserBack],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketLeft, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyCode.LeftArrow] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.goBack();
		}
	}
}

class GoForwardAction extends Action2 {
	static readonly ID = 'workbench.action.browser.goForward';

	constructor() {
		super({
			id: GoForwardAction.ID,
			title: localize2('browser.goForwardAction', 'Go Forward'),
			category: BrowserCategory,
			icon: Codicon.arrowRight,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 2,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over editor navigation
				primary: KeyMod.Alt | KeyCode.RightArrow,
				secondary: [KeyCode.BrowserForward],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketRight, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.RightArrow] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.goForward();
		}
	}
}

class ReloadAction extends Action2 {
	static readonly ID = 'workbench.action.browser.reload';

	constructor() {
		super({
			id: ReloadAction.ID,
			title: localize2('browser.reloadAction', 'Reload'),
			category: BrowserCategory,
			icon: Codicon.refresh,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 3,
				alt: {
					id: HardReloadAction.ID,
					title: localize2('browser.hardReloadAction', 'Hard Reload'),
					icon: Codicon.refresh,
				}
			},
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75, // Priority over debug and reload workbench
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				secondary: [KeyCode.F5],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyR, secondary: [] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.reload();
		}
	}
}

class HardReloadAction extends Action2 {
	static readonly ID = 'workbench.action.browser.hardReload';

	constructor() {
		super({
			id: HardReloadAction.ID,
			title: localize2('browser.hardReloadAction', 'Hard Reload'),
			category: BrowserCategory,
			icon: Codicon.refresh,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75, // Priority over debug and reload workbench
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				secondary: [KeyMod.CtrlCmd | KeyCode.F5],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR, secondary: [] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.reload(true);
		}
	}
}

class FocusUrlInputAction extends Action2 {
	static readonly ID = 'workbench.action.browser.focusUrlInput';

	constructor() {
		super({
			id: FocusUrlInputAction.ID,
			title: localize2('browser.focusUrlInputAction', 'Focus URL Input'),
			category: BrowserCategory,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.focusUrlInput();
		}
	}
}

class AddElementToChatAction extends Action2 {
	static readonly ID = 'workbench.action.browser.addElementToChat';

	constructor() {
		const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true));
		super({
			id: AddElementToChatAction.ID,
			title: localize2('browser.addElementToChatAction', 'Add Element to Chat'),
			category: BrowserCategory,
			icon: Codicon.inspect,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
			toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 1,
				when: enabled
			},
			keybinding: [{
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over terminal
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
			}, {
				when: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape
			}]
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.addElementToChat();
		}
	}
}

class AddConsoleLogsToChatAction extends Action2 {
	static readonly ID = 'workbench.action.browser.addConsoleLogsToChat';

	constructor() {
		const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true));
		super({
			id: AddConsoleLogsToChatAction.ID,
			title: localize2('browser.addConsoleLogsToChatAction', 'Add Console Logs to Chat'),
			category: BrowserCategory,
			icon: Codicon.output,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 2,
				when: enabled
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.addConsoleLogsToChat();
		}
	}
}

class ToggleDevToolsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.toggleDevTools';

	constructor() {
		super({
			id: ToggleDevToolsAction.ID,
			title: localize2('browser.toggleDevToolsAction', 'Toggle Developer Tools'),
			category: BrowserCategory,
			icon: Codicon.terminal,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_DEVTOOLS_OPEN.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 3,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F12
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.toggleDevTools();
		}
	}
}

class OpenInExternalBrowserAction extends Action2 {
	static readonly ID = 'workbench.action.browser.openExternal';

	constructor() {
		super({
			id: OpenInExternalBrowserAction.ID,
			title: localize2('browser.openExternalAction', 'Open in External Browser'),
			category: BrowserCategory,
			icon: Codicon.linkExternal,
			f1: true,
			// Note: We do allow opening in an external browser even if there is an error page shown
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupPage,
				order: 10
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			const url = browserEditor.getUrl();
			if (url) {
				const openerService = accessor.get(IOpenerService);
				await openerService.open(url, {
					// ensures that VS Code itself doesn't try to open the URL, even for non-"http(s):" scheme URLs.
					openExternal: true,
					// ensures that the link isn't opened in Integrated Browser or other contributed external openers. False is the default, but just being explicit here.
					allowContributedOpeners: false
				});
			}
		}
	}
}

class ClearGlobalBrowserStorageAction extends Action2 {
	static readonly ID = 'workbench.action.browser.clearGlobalStorage';

	constructor() {
		super({
			id: ClearGlobalBrowserStorageAction.ID,
			title: localize2('browser.clearGlobalStorageAction', 'Clear Storage (Global)'),
			category: BrowserCategory,
			icon: Codicon.clearAll,
			f1: true,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupSettings,
				order: 1,
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Global)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		await browserViewWorkbenchService.clearGlobalStorage();
	}
}

class ClearWorkspaceBrowserStorageAction extends Action2 {
	static readonly ID = 'workbench.action.browser.clearWorkspaceStorage';

	constructor() {
		super({
			id: ClearWorkspaceBrowserStorageAction.ID,
			title: localize2('browser.clearWorkspaceStorageAction', 'Clear Storage (Workspace)'),
			category: BrowserCategory,
			icon: Codicon.clearAll,
			f1: true,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupSettings,
				order: 1,
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Workspace)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		await browserViewWorkbenchService.clearWorkspaceStorage();
	}
}

class ClearEphemeralBrowserStorageAction extends Action2 {
	static readonly ID = 'workbench.action.browser.clearEphemeralStorage';

	constructor() {
		super({
			id: ClearEphemeralBrowserStorageAction.ID,
			title: localize2('browser.clearEphemeralStorageAction', 'Clear Storage (Ephemeral)'),
			category: BrowserCategory,
			icon: Codicon.clearAll,
			f1: true,
			precondition: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupSettings,
				order: 1,
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral)
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.clearStorage();
		}
	}
}

class OpenBrowserSettingsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.openSettings';

	constructor() {
		super({
			id: OpenBrowserSettingsAction.ID,
			title: localize2('browser.openSettingsAction', 'Open Browser Settings'),
			category: BrowserCategory,
			icon: Codicon.settingsGear,
			f1: false,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupSettings,
				order: 2
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const preferencesService = accessor.get(IPreferencesService);
		await preferencesService.openSettings({ query: '@id:workbench.browser.*,chat.sendElementsToChat.*' });
	}
}

// Zoom actions

// Zoom keybindings registered separately from the Action2 precondition so they
// always fire when the browser is focused, preventing VS Code's own zoom from
// triggering even when the browser is at its min/max zoom level.
const zoomInKeybindingRule = {
	id: 'workbench.action.browser.zoomIn',
	when: CONTEXT_BROWSER_FOCUSED,
	weight: KeybindingWeight.WorkbenchContrib + 75,
	primary: KeyMod.CtrlCmd | KeyCode.Equal,
	secondary: [KeyMod.CtrlCmd | KeyCode.NumpadAdd],
};
const zoomOutKeybindingRule = {
	id: 'workbench.action.browser.zoomOut',
	when: CONTEXT_BROWSER_FOCUSED,
	weight: KeybindingWeight.WorkbenchContrib + 75,
	primary: KeyMod.CtrlCmd | KeyCode.Minus,
	secondary: [KeyMod.CtrlCmd | KeyCode.NumpadSubtract],
};
const resetZoomKeybindingRule = {
	id: 'workbench.action.browser.resetZoom',
	when: CONTEXT_BROWSER_FOCUSED,
	weight: KeybindingWeight.WorkbenchContrib + 75,
	primary: KeyMod.CtrlCmd | KeyCode.Numpad0,
};

class ZoomInAction extends Action2 {
	static readonly ID = 'workbench.action.browser.zoomIn';

	constructor() {
		super({
			id: ZoomInAction.ID,
			title: localize2('browser.zoomInAction', 'Zoom In'),
			category: BrowserCategory,
			icon: Codicon.zoomIn,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), CONTEXT_BROWSER_CAN_ZOOM_IN),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupZoom,
				order: 1,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.zoomIn();
		}
	}
}

class ZoomOutAction extends Action2 {
	static readonly ID = 'workbench.action.browser.zoomOut';

	constructor() {
		super({
			id: ZoomOutAction.ID,
			title: localize2('browser.zoomOutAction', 'Zoom Out'),
			category: BrowserCategory,
			icon: Codicon.zoomOut,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), CONTEXT_BROWSER_CAN_ZOOM_OUT),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupZoom,
				order: 2,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.zoomOut();
		}
	}
}

class ResetZoomAction extends Action2 {
	static readonly ID = 'workbench.action.browser.resetZoom';

	constructor() {
		super({
			id: ResetZoomAction.ID,
			title: localize2('browser.resetZoomAction', 'Reset Zoom'),
			category: BrowserCategory,
			icon: Codicon.screenNormal,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupZoom,
				order: 3,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.resetZoom();
		}
	}
}

// Find actions

class ShowBrowserFindAction extends Action2 {
	static readonly ID = 'workbench.action.browser.showFind';

	constructor() {
		super({
			id: ShowBrowserFindAction.ID,
			title: localize2('browser.showFindAction', 'Find in Page'),
			category: BrowserCategory,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: ActionGroupPage,
				order: 1,
			},
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF
			}
		});
	}

	run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): void {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.showFind();
		}
	}
}

class HideBrowserFindAction extends Action2 {
	static readonly ID = 'workbench.action.browser.hideFind';

	constructor() {
		super({
			id: HideBrowserFindAction.ID,
			title: localize2('browser.hideFindAction', 'Close Find Widget'),
			category: BrowserCategory,
			f1: false,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE),
			keybinding: {
				weight: KeybindingWeight.EditorContrib + 5,
				primary: KeyCode.Escape
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.hideFind();
		}
	}
}

class BrowserFindNextAction extends Action2 {
	static readonly ID = 'workbench.action.browser.findNext';

	constructor() {
		super({
			id: BrowserFindNextAction.ID,
			title: localize2('browser.findNextAction', 'Find Next'),
			category: BrowserCategory,
			f1: false,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: [{
				when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Enter
			}, {
				when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG }
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.findNext();
		}
	}
}

class BrowserFindPreviousAction extends Action2 {
	static readonly ID = 'workbench.action.browser.findPrevious';

	constructor() {
		super({
			id: BrowserFindPreviousAction.ID,
			title: localize2('browser.findPreviousAction', 'Find Previous'),
			category: BrowserCategory,
			f1: false,
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: [{
				when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.Shift | KeyCode.Enter
			}, {
				when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.Shift | KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG }
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.findPrevious();
		}
	}
}

// Register actions
registerAction2(OpenIntegratedBrowserAction);
registerAction2(NewTabAction);
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);
registerAction2(AddElementToChatAction);
registerAction2(AddConsoleLogsToChatAction);
registerAction2(ToggleDevToolsAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(ClearGlobalBrowserStorageAction);
registerAction2(ClearWorkspaceBrowserStorageAction);
registerAction2(ClearEphemeralBrowserStorageAction);
registerAction2(OpenBrowserSettingsAction);
registerAction2(ZoomInAction);
registerAction2(ZoomOutAction);
registerAction2(ResetZoomAction);
KeybindingsRegistry.registerKeybindingRule(zoomInKeybindingRule);
KeybindingsRegistry.registerKeybindingRule(zoomOutKeybindingRule);
KeybindingsRegistry.registerKeybindingRule(resetZoomKeybindingRule);
registerAction2(ShowBrowserFindAction);
registerAction2(HideBrowserFindAction);
registerAction2(BrowserFindNextAction);
registerAction2(BrowserFindPreviousAction);
