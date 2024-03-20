/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev, CollapseAllUnchangedRegions, ExitCompareMove, RevertHunkOrSelection, ShowAllUnchangedRegions, SwitchSide, ToggleCollapseUnchangedRegions, ToggleShowMovedCodeBlocks, ToggleUseInlineViewWhenSpaceIsLimited } from 'vs/editor/browser/widget/diffEditor/commands';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import './registrations.contribution';

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
	when: ContextKeyExpr.and(
		EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached,
		ContextKeyExpr.has('isInDiffEditor'),
	),
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
	when: ContextKeyExpr.and(
		EditorContextKeys.accessibleDiffViewerVisible.negate(),
		ContextKeyExpr.has('isInDiffEditor'),
	),
});


CommandsRegistry.registerCommandAlias('editor.action.diffReview.next', AccessibleDiffViewerNext.id);
registerAction2(AccessibleDiffViewerNext);

CommandsRegistry.registerCommandAlias('editor.action.diffReview.prev', AccessibleDiffViewerPrev.id);
registerAction2(AccessibleDiffViewerPrev);
