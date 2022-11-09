/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import { ActionItemRenderer, ActionList, ActionListItemKind, ListMenuItem } from 'vs/platform/actionWidget/browser/actionWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

const acceptSelectedTerminalQuickFixCommand = 'acceptSelectedTerminalQuickFixCommand';
export const previewSelectedTerminalQuickFixCommand = 'previewSelectedTerminalQuickFixCommand';

export class TerminalQuickFix extends Disposable {
	action?: IAction;
	disabled?: boolean;
	title?: string;
	constructor(action?: IAction, title?: string, disabled?: boolean) {
		super();
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
		super(
			'quickFixWidget',
			[new ActionItemRenderer<TerminalQuickFix>(acceptSelectedTerminalQuickFixCommand, previewSelectedTerminalQuickFixCommand, keybindingService)],
			fixes, showHeaders, previewSelectedTerminalQuickFixCommand, acceptSelectedTerminalQuickFixCommand, onDidSelect, contextViewService
		);
	}

	public toMenuItems(inputActions: readonly TerminalQuickFix[], showHeaders: boolean): ListMenuItem<TerminalQuickFix>[] {
		const menuItems: TerminalQuickFixListItem[] = [];
		menuItems.push({
			kind: ActionListItemKind.Header,
			group: {
				kind: CodeActionKind.QuickFix,
				title: 'Quick fix...',
				icon: { codicon: Codicon.lightBulb }
			}
		});
		for (const action of showHeaders ? inputActions : inputActions.filter(i => !!i.action)) {
			if (!action.disabled && action.action) {
				menuItems.push({
					kind: ActionListItemKind.Action,
					item: action,
					group: {
						kind: CodeActionKind.QuickFix,
						icon: { codicon: action.action.id === 'quickFix.opener' ? Codicon.link : Codicon.run },
						title: action.action!.label
					},
					disabled: false,
					label: action.title
				});
			}
		}
		return menuItems;
	}
}

interface TerminalQuickFixListItem extends ListMenuItem<TerminalQuickFix> {
	readonly item?: TerminalQuickFix;
}
