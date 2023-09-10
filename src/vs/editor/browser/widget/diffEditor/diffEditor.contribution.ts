/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ToggleCollapseUnchangedRegions extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleCollapseUnchangedRegions',
			title: { value: localize('toggleCollapseUnchangedRegions', "Toggle Collapse Unchanged Regions"), original: 'Toggle Collapse Unchanged Regions' },
			icon: Codicon.map,
			toggled: ContextKeyExpr.has('config.diffEditor.hideUnchangedRegions.enabled'),
			menu: {
				id: MenuId.EditorTitle,
				order: 22,
				group: 'navigation',
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('diffEditor.hideUnchangedRegions.enabled');
		configurationService.updateValue('diffEditor.hideUnchangedRegions.enabled', newValue);
	}
}

registerAction2(ToggleCollapseUnchangedRegions);

export class ToggleShowMovedCodeBlocks extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleShowMovedCodeBlocks',
			title: { value: localize('toggleShowMovedCodeBlocks', "Toggle Show Moved Code Blocks"), original: 'Toggle Show Moved Code Blocks' },
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('diffEditor.experimental.showMoves');
		configurationService.updateValue('diffEditor.experimental.showMoves', newValue);
	}
}

registerAction2(ToggleShowMovedCodeBlocks);

export class ToggleUseInlineViewWhenSpaceIsLimited extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleUseInlineViewWhenSpaceIsLimited',
			title: { value: localize('toggleUseInlineViewWhenSpaceIsLimited', "Toggle Use Inline View When Space Is Limited"), original: 'Toggle Use Inline View When Space Is Limited' },
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('diffEditor.useInlineViewWhenSpaceIsLimited');
		configurationService.updateValue('diffEditor.useInlineViewWhenSpaceIsLimited', newValue);
	}
}

registerAction2(ToggleUseInlineViewWhenSpaceIsLimited);

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: new ToggleUseInlineViewWhenSpaceIsLimited().desc.id,
		title: localize('useInlineViewWhenSpaceIsLimited', "Use Inline View When Space Is Limited"),
		toggled: ContextKeyExpr.has('config.diffEditor.useInlineViewWhenSpaceIsLimited'),
	},
	order: 11,
	group: '1_diff',
	when: EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached,
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: new ToggleShowMovedCodeBlocks().desc.id,
		title: localize('showMoves', "Show Moved Code Blocks"),
		icon: Codicon.move,
		toggled: ContextKeyEqualsExpr.create('config.diffEditor.experimental.showMoves', true),
	},
	order: 10,
	group: '1_diff',
});

const diffEditorCategory: ILocalizedString = {
	value: localize('diffEditor', 'Diff Editor'),
	original: 'Diff Editor',
};

export class SwitchSide extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.switchSide',
			title: { value: localize('switchSide', "Switch Side"), original: 'Switch Side' },
			icon: Codicon.arrowSwap,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			f1: true,
			category: diffEditorCategory,
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, arg?: { dryRun: boolean }): unknown {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget) {
			if (arg && arg.dryRun) {
				return { destinationSelection: diffEditor.mapToOtherSide().destinationSelection };
			} else {
				diffEditor.switchSide();
			}
		}
		return undefined;
	}
}

registerAction2(SwitchSide);

export class ExitCompareMove extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.exitCompareMove',
			title: { value: localize('exitCompareMove', "Exit Compare Move"), original: 'Exit Compare Move' },
			icon: Codicon.close,
			precondition: EditorContextKeys.comparingMovedCode,
			f1: false,
			category: diffEditorCategory,
			keybinding: {
				weight: 10000,
				primary: KeyCode.Escape,
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget) {
			diffEditor.exitCompareMove();
		}
	}
}

registerAction2(ExitCompareMove);

export class CollapseAllUnchangedRegions extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.collapseAllUnchangedRegions',
			title: { value: localize('collapseAllUnchangedRegions', "Collapse All Unchanged Regions"), original: 'Collapse All Unchanged Regions' },
			icon: Codicon.fold,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			f1: true,
			category: diffEditorCategory,
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget) {
			diffEditor.collapseAllUnchangedRegions();
		}
	}
}

registerAction2(CollapseAllUnchangedRegions);

export class ShowAllUnchangedRegions extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.showAllUnchangedRegions',
			title: { value: localize('showAllUnchangedRegions', "Show All Unchanged Regions"), original: 'Show All Unchanged Regions' },
			icon: Codicon.unfold,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			f1: true,
			category: diffEditorCategory,
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget) {
			diffEditor.showAllUnchangedRegions();
		}
	}
}

registerAction2(ShowAllUnchangedRegions);

const accessibleDiffViewerCategory: ILocalizedString = {
	value: localize('accessibleDiffViewer', 'Accessible Diff Viewer'),
	original: 'Accessible Diff Viewer',
};

export class AccessibleDiffViewerNext extends Action2 {
	public static id = 'editor.action.accessibleDiffViewer.next';

	constructor() {
		super({
			id: AccessibleDiffViewerNext.id,
			title: { value: localize('editor.action.accessibleDiffViewer.next', "Go to Next Difference"), original: 'Go to Next Difference' },
			category: accessibleDiffViewerCategory,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			keybinding: {
				primary: KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			},
			f1: true,
		});
	}

	public override run(accessor: ServicesAccessor): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		diffEditor?.accessibleDiffViewerNext();
	}
}

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: AccessibleDiffViewerNext.id,
		title: localize('Open Accessible Diff Viewer', "Open Accessible Diff Viewer"),
	},
	order: 10,
	group: '2_diff',
	when: ContextKeyExpr.and(
		EditorContextKeys.accessibleDiffViewerVisible.negate(),
		ContextKeyExpr.has('isInDiffEditor'),
	),
});

export class AccessibleDiffViewerPrev extends Action2 {
	public static id = 'editor.action.accessibleDiffViewer.prev';

	constructor() {
		super({
			id: AccessibleDiffViewerPrev.id,
			title: { value: localize('editor.action.accessibleDiffViewer.prev', "Go to Previous Difference"), original: 'Go to Previous Difference' },
			category: accessibleDiffViewerCategory,
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			keybinding: {
				primary: KeyMod.Shift | KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			},
			f1: true,
		});
	}

	public override run(accessor: ServicesAccessor): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		diffEditor?.accessibleDiffViewerPrev();
	}
}

export function findFocusedDiffEditor(accessor: ServicesAccessor): IDiffEditor | null {
	const codeEditorService = accessor.get(ICodeEditorService);
	const diffEditors = codeEditorService.listDiffEditors();
	const activeCodeEditor = codeEditorService.getFocusedCodeEditor() ?? codeEditorService.getActiveCodeEditor();
	if (!activeCodeEditor) {
		return null;
	}

	for (let i = 0, len = diffEditors.length; i < len; i++) {
		const diffEditor = <IDiffEditor>diffEditors[i];
		if (diffEditor.getModifiedEditor().getId() === activeCodeEditor.getId() || diffEditor.getOriginalEditor().getId() === activeCodeEditor.getId()) {
			return diffEditor;
		}
	}

	if (document.activeElement) {
		for (const d of diffEditors) {
			const container = d.getContainerDomNode();
			if (isElementOrParentOf(container, document.activeElement)) {
				return d;
			}
		}
	}

	return null;
}

function isElementOrParentOf(elementOrParent: Element, element: Element): boolean {
	let e: Element | null = element;
	while (e) {
		if (e === elementOrParent) {
			return true;
		}
		e = e.parentElement;
	}
	return false;
}

CommandsRegistry.registerCommandAlias('editor.action.diffReview.next', AccessibleDiffViewerNext.id);
registerAction2(AccessibleDiffViewerNext);

CommandsRegistry.registerCommandAlias('editor.action.diffReview.prev', AccessibleDiffViewerPrev.id);
registerAction2(AccessibleDiffViewerPrev);
