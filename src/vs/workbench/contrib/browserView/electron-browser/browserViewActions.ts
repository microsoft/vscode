/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BrowserEditor, CONTEXT_BROWSER_CAN_GO_BACK, CONTEXT_BROWSER_CAN_GO_FORWARD, CONTEXT_BROWSER_FOCUSED, CONTEXT_BROWSER_HAS_URL } from './browserEditor.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { AgentHostChatToolsEnabledSettingId } from './browserViewWorkbenchService.js';

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
		const contextKeyService = accessor.get(IContextKeyService);
		const ids = ['workbench.browser.*', 'chat.sendElementsToChat.*'];
		if (IsSessionsWindowContext.getValue(contextKeyService)) {
			ids.push(AgentHostChatToolsEnabledSettingId);
		}
		await preferencesService.openSettings({ query: `@id:${ids.join(',')}` });
	}
}

// Register actions
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);

registerAction2(FocusUrlInputAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(OpenBrowserSettingsAction);
