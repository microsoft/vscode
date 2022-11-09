/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { ActionList, ActionListItemKind, IListMenuItem } from 'vs/platform/actionWidget/browser/actionWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IActionItem } from 'vs/platform/actionWidget/common/actionWidget';

export class TerminalQuickFix implements IActionItem {
	action: IAction;
	disabled?: boolean;
	title?: string;
	constructor(action: IAction, title?: string, disabled?: boolean) {
		this.action = action;
		this.disabled = disabled;
		this.title = title;
	}
}

export class QuickFixList extends ActionList<TerminalQuickFix> {
	constructor(
		fixes: readonly TerminalQuickFix[],
		showHeaders: boolean,
		onDidSelect: (fix: TerminalQuickFix, preview?: boolean) => void,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super('quickFixWidget', fixes, showHeaders, onDidSelect, undefined, contextViewService, keybindingService);
	}

	public toMenuItems(inputQuickFixes: readonly TerminalQuickFix[], showHeaders: boolean): IListMenuItem<TerminalQuickFix>[] {
		const menuItems: IListMenuItem<TerminalQuickFix>[] = [];
		menuItems.push({
			kind: ActionListItemKind.Header,
			group: {
				kind: CodeActionKind.QuickFix,
				title: 'Quick fix...',
				icon: { codicon: Codicon.lightBulb }
			}
		});
		for (const quickFix of showHeaders ? inputQuickFixes : inputQuickFixes.filter(i => !!i.action)) {
			if (!quickFix.disabled && quickFix.action) {
				menuItems.push({
					kind: ActionListItemKind.Action,
					item: quickFix,
					group: {
						kind: CodeActionKind.QuickFix,
						icon: { codicon: quickFix.action.id === 'quickFix.opener' ? Codicon.link : Codicon.run },
						title: quickFix.action!.label
					},
					disabled: false,
					label: quickFix.title
				});
			}
		}
		return menuItems;
	}
}
