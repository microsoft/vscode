/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { localize } from 'vs/nls';
import { ActionListItemKind, IListMenuItem } from 'vs/platform/actionWidget/browser/actionList';
import { IActionItem } from 'vs/platform/actionWidget/common/actionWidget';

export const enum TerminalQuickFixType {
	Command = 'command',
	Opener = 'opener',
	Port = 'port'
}

export class TerminalQuickFix implements IActionItem {
	action: IAction;
	type: string;
	disabled?: boolean;
	title?: string;
	constructor(action: IAction, type: string, title?: string, disabled?: boolean) {
		this.action = action;
		this.disabled = disabled;
		this.title = title;
		this.type = type;
	}
}


export function toMenuItems(inputQuickFixes: readonly TerminalQuickFix[], showHeaders: boolean): IListMenuItem<TerminalQuickFix>[] {
	const menuItems: IListMenuItem<TerminalQuickFix>[] = [];
	menuItems.push({
		kind: ActionListItemKind.Header,
		group: {
			kind: CodeActionKind.QuickFix,
			title: localize('codeAction.widget.id.quickfix', 'Quick Fix')
		}
	});
	for (const quickFix of showHeaders ? inputQuickFixes : inputQuickFixes.filter(i => !!i.action)) {
		if (!quickFix.disabled && quickFix.action) {
			menuItems.push({
				kind: ActionListItemKind.Action,
				item: quickFix,
				group: {
					kind: CodeActionKind.QuickFix,
					icon: getQuickFixIcon(quickFix),
					title: quickFix.action.label
				},
				disabled: false,
				label: quickFix.title
			});
		}
	}
	return menuItems;
}

function getQuickFixIcon(quickFix: TerminalQuickFix): { codicon: Codicon } {
	switch (quickFix.type) {
		case TerminalQuickFixType.Opener:
			// TODO: if it's a file link, use the open file icon
			return { codicon: Codicon.link };
		case TerminalQuickFixType.Command:
			return { codicon: Codicon.run };
		case TerminalQuickFixType.Port:
			return { codicon: Codicon.debugDisconnect };
	}
	return { codicon: Codicon.lightBulb };
}
