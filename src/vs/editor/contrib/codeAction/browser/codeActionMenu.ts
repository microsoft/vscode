/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { CodeAction } from 'vs/editor/common/languages';
import { CodeActionItem, CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import 'vs/editor/contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from 'vs/nls';
import { ActionListItemKind, IActionListItem } from 'vs/platform/actionWidget/browser/actionList';

interface ActionGroup {
	readonly kind: CodeActionKind;
	readonly title: string;
	readonly icon?: ThemeIcon;
}

const uncategorizedCodeActionGroup = Object.freeze<ActionGroup>({ kind: CodeActionKind.Empty, title: localize('codeAction.widget.id.more', 'More Actions...') });

const codeActionGroups = Object.freeze<ActionGroup[]>([
	{ kind: CodeActionKind.QuickFix, title: localize('codeAction.widget.id.quickfix', 'Quick Fix') },
	{ kind: CodeActionKind.RefactorExtract, title: localize('codeAction.widget.id.extract', 'Extract'), icon: Codicon.wrench },
	{ kind: CodeActionKind.RefactorInline, title: localize('codeAction.widget.id.inline', 'Inline'), icon: Codicon.wrench },
	{ kind: CodeActionKind.RefactorRewrite, title: localize('codeAction.widget.id.convert', 'Rewrite'), icon: Codicon.wrench },
	{ kind: CodeActionKind.RefactorMove, title: localize('codeAction.widget.id.move', 'Move'), icon: Codicon.wrench },
	{ kind: CodeActionKind.SurroundWith, title: localize('codeAction.widget.id.surround', 'Surround With'), icon: Codicon.symbolSnippet },
	{ kind: CodeActionKind.Source, title: localize('codeAction.widget.id.source', 'Source Action'), icon: Codicon.symbolFile },
	uncategorizedCodeActionGroup,
]);

export function toMenuItems(
	inputCodeActions: readonly CodeActionItem[],
	showHeaders: boolean,
	keybindingResolver: (action: CodeAction) => ResolvedKeybinding | undefined
): IActionListItem<CodeActionItem>[] {
	if (!showHeaders) {
		return inputCodeActions.map((action): IActionListItem<CodeActionItem> => {
			return {
				kind: ActionListItemKind.Action,
				item: action,
				group: uncategorizedCodeActionGroup,
				disabled: !!action.action.disabled,
				label: action.action.disabled || action.action.title,
				canPreview: !!action.action.edit?.edits.length,
			};
		});
	}

	// Group code actions
	const menuEntries = codeActionGroups.map(group => ({ group, actions: [] as CodeActionItem[] }));

	for (const action of inputCodeActions) {
		const kind = action.action.kind ? new CodeActionKind(action.action.kind) : CodeActionKind.None;
		for (const menuEntry of menuEntries) {
			if (menuEntry.group.kind.contains(kind)) {
				menuEntry.actions.push(action);
				break;
			}
		}
	}

	const allMenuItems: IActionListItem<CodeActionItem>[] = [];
	for (const menuEntry of menuEntries) {
		if (menuEntry.actions.length) {
			allMenuItems.push({ kind: ActionListItemKind.Header, group: menuEntry.group });
			for (const action of menuEntry.actions) {
				allMenuItems.push({
					kind: ActionListItemKind.Action,
					item: action,
					group: menuEntry.group,
					label: action.action.title,
					disabled: !!action.action.disabled,
					keybinding: keybindingResolver(action.action),
				});
			}
		}
	}
	return allMenuItems;
}
