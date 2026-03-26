/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory } from '../browserViewActions.js';

const CONTEXT_BROWSER_DEVTOOLS_OPEN = new RawContextKey<boolean>('browserDevToolsOpen', false, localize('browser.devToolsOpen', "Whether developer tools are open for the current browser view"));

class BrowserEditorDevToolsContribution extends BrowserEditorContribution {
	private readonly _devToolsOpenContext: IContextKey<boolean>;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor);
		this._devToolsOpenContext = CONTEXT_BROWSER_DEVTOOLS_OPEN.bindTo(contextKeyService);
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		this._devToolsOpenContext.set(model.isDevToolsOpen);
		store.add(model.onDidChangeDevToolsState(e => {
			this._devToolsOpenContext.set(e.isDevToolsOpen);
		}));
	}

	override clear(): void {
		this._devToolsOpenContext.reset();
	}
}

BrowserEditor.registerContribution(BrowserEditorDevToolsContribution);

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

registerAction2(ToggleDevToolsAction);
