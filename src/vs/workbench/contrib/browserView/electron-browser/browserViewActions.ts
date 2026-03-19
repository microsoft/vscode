/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BrowserEditor, CONTEXT_BROWSER_CAN_GO_BACK, CONTEXT_BROWSER_CAN_GO_FORWARD, CONTEXT_BROWSER_DEVTOOLS_OPEN, CONTEXT_BROWSER_FOCUSED, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_STORAGE_SCOPE, CONTEXT_BROWSER_FIND_WIDGET_FOCUSED, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE } from './browserEditor.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewCommandId, BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';

// Context key expression to check if browser editor is active
export const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditorInput.EDITOR_ID);

export const BrowserActionCategory = localize2('browserCategory', "Browser");
export enum BrowserActionGroup {
	Tabs = '1_tabs',
	Zoom = '2_zoom',
	Page = '3_page',
	Settings = '4_settings'
}

class GoBackAction extends Action2 {
	static readonly ID = BrowserViewCommandId.GoBack;

	constructor() {
		super({
			id: GoBackAction.ID,
			title: localize2('browser.goBackAction', 'Go Back'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.GoForward;

	constructor() {
		super({
			id: GoForwardAction.ID,
			title: localize2('browser.goForwardAction', 'Go Forward'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.Reload;

	constructor() {
		super({
			id: ReloadAction.ID,
			title: localize2('browser.reloadAction', 'Reload'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.HardReload;

	constructor() {
		super({
			id: HardReloadAction.ID,
			title: localize2('browser.hardReloadAction', 'Hard Reload'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.FocusUrlInput;

	constructor() {
		super({
			id: FocusUrlInputAction.ID,
			title: localize2('browser.focusUrlInputAction', 'Focus URL Input'),
			category: BrowserActionCategory,
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

class ToggleDevToolsAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ToggleDevTools;

	constructor() {
		super({
			id: ToggleDevToolsAction.ID,
			title: localize2('browser.toggleDevToolsAction', 'Toggle Developer Tools'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.OpenExternal;

	constructor() {
		super({
			id: OpenInExternalBrowserAction.ID,
			title: localize2('browser.openExternalAction', 'Open in External Browser'),
			category: BrowserActionCategory,
			icon: Codicon.linkExternal,
			f1: true,
			// Note: We do allow opening in an external browser even if there is an error page shown
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Page,
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
	static readonly ID = BrowserViewCommandId.ClearGlobalStorage;

	constructor() {
		super({
			id: ClearGlobalBrowserStorageAction.ID,
			title: localize2('browser.clearGlobalStorageAction', 'Clear Storage (Global)'),
			category: BrowserActionCategory,
			icon: Codicon.clearAll,
			f1: true,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Settings,
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
	static readonly ID = BrowserViewCommandId.ClearWorkspaceStorage;

	constructor() {
		super({
			id: ClearWorkspaceBrowserStorageAction.ID,
			title: localize2('browser.clearWorkspaceStorageAction', 'Clear Storage (Workspace)'),
			category: BrowserActionCategory,
			icon: Codicon.clearAll,
			f1: true,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Settings,
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
	static readonly ID = BrowserViewCommandId.ClearEphemeralStorage;

	constructor() {
		super({
			id: ClearEphemeralBrowserStorageAction.ID,
			title: localize2('browser.clearEphemeralStorageAction', 'Clear Storage (Ephemeral)'),
			category: BrowserActionCategory,
			icon: Codicon.clearAll,
			f1: true,
			precondition: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Settings,
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
	static readonly ID = BrowserViewCommandId.OpenSettings;

	constructor() {
		super({
			id: OpenBrowserSettingsAction.ID,
			title: localize2('browser.openSettingsAction', 'Open Browser Settings'),
			category: BrowserActionCategory,
			icon: Codicon.settingsGear,
			f1: false,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Settings,
				order: 2
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const preferencesService = accessor.get(IPreferencesService);
		await preferencesService.openSettings({ query: '@id:workbench.browser.*,chat.sendElementsToChat.*' });
	}
}

// Find actions

class ShowBrowserFindAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ShowFind;

	constructor() {
		super({
			id: ShowBrowserFindAction.ID,
			title: localize2('browser.showFindAction', 'Find in Page'),
			category: BrowserActionCategory,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Page,
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
	static readonly ID = BrowserViewCommandId.HideFind;

	constructor() {
		super({
			id: HideBrowserFindAction.ID,
			title: localize2('browser.hideFindAction', 'Close Find Widget'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.FindNext;

	constructor() {
		super({
			id: BrowserFindNextAction.ID,
			title: localize2('browser.findNextAction', 'Find Next'),
			category: BrowserActionCategory,
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
	static readonly ID = BrowserViewCommandId.FindPrevious;

	constructor() {
		super({
			id: BrowserFindPreviousAction.ID,
			title: localize2('browser.findPreviousAction', 'Find Previous'),
			category: BrowserActionCategory,
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
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);
registerAction2(ToggleDevToolsAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(ClearGlobalBrowserStorageAction);
registerAction2(ClearWorkspaceBrowserStorageAction);
registerAction2(ClearEphemeralBrowserStorageAction);
registerAction2(OpenBrowserSettingsAction);
registerAction2(ShowBrowserFindAction);
registerAction2(HideBrowserFindAction);
registerAction2(BrowserFindNextAction);
registerAction2(BrowserFindPreviousAction);
