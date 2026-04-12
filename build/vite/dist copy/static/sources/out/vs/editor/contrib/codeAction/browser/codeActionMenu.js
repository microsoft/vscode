/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../../../../base/browser/ui/codicons/codiconStyles.js'; // The codicon symbol styles are defined here and must be loaded
import { Codicon } from '../../../../base/common/codicons.js';
import { CodeActionKind } from '../common/types.js';
import '../../symbolIcons/browser/symbolIcons.js'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from '../../../../nls.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
const uncategorizedCodeActionGroup = Object.freeze({ kind: HierarchicalKind.Empty, title: localize('codeAction.widget.id.more', 'More Actions...') });
const codeActionGroups = Object.freeze([
    { kind: CodeActionKind.QuickFix, title: localize('codeAction.widget.id.quickfix', 'Quick Fix') },
    { kind: CodeActionKind.RefactorExtract, title: localize('codeAction.widget.id.extract', 'Extract'), icon: Codicon.wrench },
    { kind: CodeActionKind.RefactorInline, title: localize('codeAction.widget.id.inline', 'Inline'), icon: Codicon.wrench },
    { kind: CodeActionKind.RefactorRewrite, title: localize('codeAction.widget.id.convert', 'Rewrite'), icon: Codicon.wrench },
    { kind: CodeActionKind.RefactorMove, title: localize('codeAction.widget.id.move', 'Move'), icon: Codicon.wrench },
    { kind: CodeActionKind.SurroundWith, title: localize('codeAction.widget.id.surround', 'Surround With'), icon: Codicon.surroundWith },
    { kind: CodeActionKind.Source, title: localize('codeAction.widget.id.source', 'Source Action'), icon: Codicon.symbolFile },
    uncategorizedCodeActionGroup,
]);
export function toMenuItems(inputCodeActions, showHeaders, keybindingResolver) {
    if (!showHeaders) {
        return inputCodeActions.map((action) => {
            return {
                kind: "action" /* ActionListItemKind.Action */,
                item: action,
                group: uncategorizedCodeActionGroup,
                disabled: !!action.action.disabled,
                label: action.action.disabled || action.action.title,
                canPreview: !!action.action.edit?.edits.length,
            };
        });
    }
    // Group code actions
    const menuEntries = codeActionGroups.map(group => ({ group, actions: [] }));
    for (const action of inputCodeActions) {
        const kind = action.action.kind ? new HierarchicalKind(action.action.kind) : HierarchicalKind.None;
        for (const menuEntry of menuEntries) {
            if (menuEntry.group.kind.contains(kind)) {
                menuEntry.actions.push(action);
                break;
            }
        }
    }
    const allMenuItems = [];
    for (const menuEntry of menuEntries) {
        if (menuEntry.actions.length) {
            allMenuItems.push({ kind: "header" /* ActionListItemKind.Header */, group: menuEntry.group });
            for (const action of menuEntry.actions) {
                const group = menuEntry.group;
                allMenuItems.push({
                    kind: "action" /* ActionListItemKind.Action */,
                    item: action,
                    group: action.action.isAI ? { title: group.title, kind: group.kind, icon: Codicon.sparkle } : group,
                    label: action.action.title,
                    disabled: !!action.action.disabled,
                    keybinding: keybindingResolver(action.action),
                });
            }
        }
    }
    return allMenuItems;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbk1lbnUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbk1lbnUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyx1REFBdUQsQ0FBQyxDQUFDLGdFQUFnRTtBQUNoSSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFJOUQsT0FBTyxFQUFrQixjQUFjLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNwRSxPQUFPLDBDQUEwQyxDQUFDLENBQUMsOEVBQThFO0FBQ2pJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQVEvRSxNQUFNLDRCQUE0QixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQWMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFbkssTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFnQjtJQUNyRCxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsV0FBVyxDQUFDLEVBQUU7SUFDaEcsRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLGVBQWUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFO0lBQzFILEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxjQUFjLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyw2QkFB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