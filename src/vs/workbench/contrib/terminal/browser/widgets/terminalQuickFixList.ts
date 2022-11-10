/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { IListMenuItem } from 'vs/platform/actionWidget/browser/actionWidget';
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


export function toMenuItems(inputQuickFixes: readonly TerminalQuickFix[], showHeaders: boolean): IListMenuItem<TerminalQuickFix>[] {
	const menuItems: IListMenuItem<TerminalQuickFix>[] = [];
	menuItems.push({
		group: {
			kind: 'header',
			title: localize('codeAction.widget.id.quickfix', 'Quick Fix...')
		},
		label: localize('codeAction.widget.id.quickfix', 'Quick Fix...')
	});
	for (const quickFix of showHeaders ? inputQuickFixes : inputQuickFixes.filter(i => !!i.action)) {
		if (!quickFix.disabled && quickFix.action) {
			menuItems.push({
				item: quickFix,
				group: {
					kind: 'quickfix',
					icon: getQuickFixIcon(quickFix),
					title: quickFix.action.label
				},
				disabled: false,
				label: quickFix.title || ''
			});
		}
	}
	return menuItems;
}

function getQuickFixIcon(quickFix: TerminalQuickFix): { codicon: Codicon } {
	switch (quickFix.action.id) {
		case 'quickFix.opener':
			// TODO: if it's a file link, use the open file icon
			return { codicon: Codicon.link };
		case 'quickFix.command':
			return { codicon: Codicon.run };
		case 'quickFix.freePort':
			return { codicon: Codicon.debugDisconnect };
	}
	return { codicon: Codicon.lightBulb };
}

