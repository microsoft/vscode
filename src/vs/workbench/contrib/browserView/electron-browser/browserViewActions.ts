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
import { BrowserEditor, CONTEXT_BROWSER_CAN_GO_BACK, CONTEXT_BROWSER_CAN_GO_FORWARD, CONTEXT_BROWSER_DEVTOOLS_OPEN, CONTEXT_BROWSER_FOCUSED, CONTEXT_BROWSER_STORAGE_SCOPE } from './browserEditor.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';

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
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
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
				when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD)
			},
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
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
			precondition: BROWSER_EDITOR_ACTIVE,
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED, // Keybinding is only active when focus is within the browser editor
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

class ToggleDevToolsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.toggleDevTools';

	constructor() {
		super({
			id: ToggleDevToolsAction.ID,
			title: localize2('browser.toggleDevToolsAction', 'Toggle Developer Tools'),
			category: BrowserCategory,
			icon: Codicon.tools,
			f1: false,
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_DEVTOOLS_OPEN.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 1,
				when: BROWSER_EDITOR_ACTIVE
			},
			precondition: BROWSER_EDITOR_ACTIVE
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.toggleDevTools();
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
				group: 'storage',
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
				group: 'storage',
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

// Register actions
registerAction2(OpenIntegratedBrowserAction);
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(ToggleDevToolsAction);
registerAction2(ClearGlobalBrowserStorageAction);
registerAction2(ClearWorkspaceBrowserStorageAction);
