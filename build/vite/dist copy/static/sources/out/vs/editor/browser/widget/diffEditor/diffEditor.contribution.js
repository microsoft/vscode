/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev, CollapseAllUnchangedRegions, ExitCompareMove, RevertHunkOrSelection, ShowAllUnchangedRegions, SwitchSide, ToggleCollapseUnchangedRegions, ToggleShowMovedCodeBlocks, ToggleUseInlineViewWhenSpaceIsLimited } from './commands.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyEqualsExpr, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import './registrations.contribution.js';
registerAction2(ToggleCollapseUnchangedRegions);
registerAction2(ToggleShowMovedCodeBlocks);
registerAction2(ToggleUseInlineViewWhenSpaceIsLimited);
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: new ToggleUseInlineViewWhenSpaceIsLimited().desc.id,
        title: localize('useInlineViewWhenSpaceIsLimited', "Use Inline View When Space Is Limited"),
        toggled: ContextKeyExpr.has('config.diffEditor.useInlineViewWhenSpaceIsLimited'),
        precondition: ContextKeyExpr.has('isInDiffEditor'),
    },
    order: 11,
    group: '1_diff',
    when: ContextKeyExpr.and(EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached, ContextKeyExpr.has('isInDiffEditor')),
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: new ToggleShowMovedCodeBlocks().desc.id,
        title: localize('showMoves', "Show Moved Code Blocks"),
        icon: Codicon.move,
        toggled: ContextKeyEqualsExpr.create('config.diffEditor.experimental.showMoves', true),
        precondition: ContextKeyExpr.has('isInDiffEditor'),
    },
    order: 10,
    group: '1_diff',
    when: ContextKeyExpr.has('isInDiffEditor'),
});
registerAction2(RevertHunkOrSelection);
for (const ctx of [
    { icon: Codicon.arrowRight, key: EditorContextKeys.diffEditorInlineMode.toNegated() },
    { icon: Codicon.discard, key: EditorContextKeys.diffEditorInlineMode }
]) {
    MenuRegistry.appendMenuItem(MenuId.DiffEditorHunkToolbar, {
        command: {
            id: new RevertHunkOrSelection().desc.id,
            title: localize('revertHunk', "Revert Block"),
            icon: ctx.icon,
        },
        when: ContextKeyExpr.and(EditorContextKeys.diffEditorModifiedWritable, ctx.key),
        order: 5,
        group: 'primary',
    });
    MenuRegistry.appendMenuItem(MenuId.DiffEditorSelectionToolbar, {
        command: {
            id: new RevertHunkOrSelection().desc.id,
            title: localize('revertSelection', "Revert Selection"),
            icon: ctx.icon,
        },
        when: ContextKeyExpr.and(EditorContextKeys.diffEditorModifiedWritable, ctx.key),
        order: 5,
        group: 'primary',
    });
}
registerAction2(SwitchSide);
registerAction2(ExitCompareMove);
registerAction2(CollapseAllUnchangedRegions);
registerAction2(ShowAllUnchangedRegions);
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: AccessibleDiffViewerNext.id,
        title: localize('Open Accessible Diff Viewer', "Open Accessible Diff Viewer"),
        precondition: ContextKeyExpr.has('isInDiffEditor'),
    },
    order: 10,
    group: '2_diff',
    when: ContextKeyExpr.and(EditorContextKeys.accessibleDiffViewerVisible.negate(), ContextKeyExpr.has('isInDiffEditor')),
});
CommandsRegistry.registerCommandAlias('editor.action.diffReview.next', AccessibleDiffViewerNext.id);
registerAction2(AccessibleDiffViewerNext);
CommandsRegistry.registerCommandAlias('editor.action.diffReview.prev', AccessibleDiffViewerPrev.id);
registerAction2(AccessibleDiffViewerPrev);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvci5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLGVBQWUsRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSxVQUFVLEVBQUUsOEJBQThCLEVBQUUseUJBQXlCLEVBQUUscUNBQXFDLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDL1IsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RyxPQUFPLGlDQUFpQyxDQUFDO0FBRXpDLGVBQWUsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQ2hELGVBQWUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBQzNDLGVBQWUsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO0FBRXZELFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRTtJQUMvQyxPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsSUFBSSxxQ0FBcUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3ZE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