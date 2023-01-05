/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Schemas } from 'vs/base/common/network';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { localize } from 'vs/nls';
import { ActionListItemKind, IListMenuItem } from 'vs/platform/actionWidget/browser/actionList';
import { IActionItem } from 'vs/platform/actionWidget/common/actionWidget';
import { TerminalQuickFixType } from 'vs/platform/terminal/common/xterm/terminalQuickFix';
import { ITerminalAction } from 'vs/workbench/contrib/terminal/browser/xterm/quickFixAddon';

export class TerminalQuickFix implements IActionItem {
	action: ITerminalAction;
	type: TerminalQuickFixType;
	disabled?: boolean;
	title?: string;
	source: string;
	constructor(action: ITerminalAction, type: TerminalQuickFixType, source: string, title?: string, disabled?: boolean) {
		this.action = action;
		this.disabled = disabled;
		this.title = title;
		this.source = source;
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
			if ('uri' in quickFix.action && quickFix.action.uri) {
				const isUrl = (quickFix.action.uri.scheme === Schemas.http || quickFix.action.uri.scheme === Schemas.https);
				return { codicon: isUrl ? Codicon.linkExternal : Codicon.goToFile };
			}
		case TerminalQuickFixType.Command:
			return { codicon: Codicon.run };
		case TerminalQuickFixType.Port:
			return { codicon: Codicon.debugDisconnect };
	}
}
