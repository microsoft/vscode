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
import { BrowserEditor, CONTEXT_BROWSER_CAN_GO_BACK, CONTEXT_BROWSER_CAN_GO_FORWARD, CONTEXT_BROWSER_DEVTOOLS_OPEN, CONTEXT_BROWSER_FOCUSED, CONTEXT_BROWSER_STORAGE_SCOPE, CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE } from './browserEditor.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';

// Context key expression to check if browser editor is active
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditor.ID);

const BrowserCategory = localize2('browserCategory', "Browser");

class OpenIntegratedBrowserAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.open',
			title: localize2('browser.openAction', "Open Integrated Browser"),
			category: BrowserCategory,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, url?: string): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const resource = BrowserViewUri.forUrl(url);

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
			f1: false,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 1,
			},
			precondition: CONTEXT_BROWSER_CAN_GO_BACK,
			keybinding: {
				when: BROWSER_EDITOR_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.LeftArrow,
				secondary: [KeyCode.BrowserBack],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.LeftArrow, secondary: [KeyCode.BrowserBack] }
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
			f1: false,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 2,
				when: CONTEXT_BROWSER_CAN_GO_FORWARD
			},
			precondition: CONTEXT_BROWSER_CAN_GO_FORWARD,
			keybinding: {
				when: BROWSER_EDITOR_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.RightArrow,
				secondary: [KeyCode.BrowserForward],
				mac: { primary: KeyMod.CtrlCmd | KeyCode.RightArrow, secondary: [KeyCode.BrowserForward] }
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
			f1: false,
			menu: {
				id: MenuId.BrowserNavigationToolbar,
				group: 'navigation',
				order: 3,
			},
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over debug
				primary: KeyCode.F5,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyR],
				mac: { primary: KeyCode.F5, secondary: [KeyMod.CtrlCmd | KeyCode.KeyR] }
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.reload();
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
			icon: Codicon.inspect,
			f1: false,
			precondition: enabled,
			toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 1,
				when: enabled
			},
			keybinding: [{
				when: BROWSER_EDITOR_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over terminal
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
			}, {
				when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE),
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

class ToggleDevToolsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.toggleDevTools';

	constructor() {
		super({
			id: ToggleDevToolsAction.ID,
			title: localize2('browser.toggleDevToolsAction', 'Toggle Developer Tools'),
			category: BrowserCategory,
			icon: Codicon.console,
			f1: false,
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_DEVTOOLS_OPEN.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: '1_developer',
				order: 1,
			},
			keybinding: {
				when: BROWSER_EDITOR_ACTIVE,
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
			f1: false,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: '2_export',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			const url = browserEditor.getUrl();
			if (url) {
				const openerService = accessor.get(IOpenerService);
				await openerService.open(url, { openExternal: true });
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
				group: '3_settings',
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
				group: '3_settings',
				order: 2,
				when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Workspace)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		await browserViewWorkbenchService.clearWorkspaceStorage();
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
				group: '3_settings',
				order: 3
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const preferencesService = accessor.get(IPreferencesService);
		await preferencesService.openSettings({ query: '@id:workbench.browser.*,chat.sendElementsToChat.*' });
	}
}

// Register actions
registerAction2(OpenIntegratedBrowserAction);
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(AddElementToChatAction);
registerAction2(ToggleDevToolsAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(ClearGlobalBrowserStorageAction);
registerAction2(ClearWorkspaceBrowserStorageAction);
registerAction2(OpenBrowserSettingsAction);
