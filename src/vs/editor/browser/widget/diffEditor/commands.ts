/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from 'vs/base/browser/dom';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize2 } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import './registrations.contribution';
import { DiffEditorSelectionHunkToolbarContext } from 'vs/editor/browser/widget/diffEditor/features/gutterFeature';
import { URI } from 'vs/base/common/uri';

export class ToggleCollapseUnchangedRegions extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleCollapseUnchangedRegions',
			title: localize2('toggleCollapseUnchangedRegions', 'Toggle Collapse Unchanged Regions'),
			icon: Codicon.map,
			toggled: ContextKeyExpr.has('config.diffEditor.hideUnchangedRegions.enabled'),
			precondition: ContextKeyExpr.has('isInDiffEditor'),
			menu: {
				when: ContextKeyExpr.has('isInDiffEditor'),
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

export class ToggleShowMovedCodeBlocks extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleShowMovedCodeBlocks',
			title: localize2('toggleShowMovedCodeBlocks', 'Toggle Show Moved Code Blocks'),
			precondition: ContextKeyExpr.has('isInDiffEditor'),
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('diffEditor.experimental.showMoves');
		configurationService.updateValue('diffEditor.experimental.showMoves', newValue);
	}
}

export class ToggleUseInlineViewWhenSpaceIsLimited extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleUseInlineViewWhenSpaceIsLimited',
			title: localize2('toggleUseInlineViewWhenSpaceIsLimited', 'Toggle Use Inline View When Space Is Limited'),
			precondition: ContextKeyExpr.has('isInDiffEditor'),
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('diffEditor.useInlineViewWhenSpaceIsLimited');
		configurationService.updateValue('diffEditor.useInlineViewWhenSpaceIsLimited', newValue);
	}
}

const diffEditorCategory: ILocalizedString = localize2('diffEditor', "Diff Editor");

export class SwitchSide extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.switchSide',
			title: localize2('switchSide', 'Switch Side'),
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
export class ExitCompareMove extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.exitCompareMove',
			title: localize2('exitCompareMove', 'Exit Compare Move'),
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

export class CollapseAllUnchangedRegions extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.collapseAllUnchangedRegions',
			title: localize2('collapseAllUnchangedRegions', 'Collapse All Unchanged Regions'),
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

export class ShowAllUnchangedRegions extends EditorAction2 {
	constructor() {
		super({
			id: 'diffEditor.showAllUnchangedRegions',
			title: localize2('showAllUnchangedRegions', 'Show All Unchanged Regions'),
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

export class RevertHunkOrSelection extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.revert',
			title: localize2('revert', 'Revert'),
			f1: false,
			category: diffEditorCategory,
		});
	}

	run(accessor: ServicesAccessor, arg: DiffEditorSelectionHunkToolbarContext): unknown {
		const diffEditor = findDiffEditor(accessor, arg.originalUri, arg.modifiedUri);
		if (diffEditor instanceof DiffEditorWidget) {
			diffEditor.revertRangeMappings(arg.mapping.innerChanges ?? []);
		}
		return undefined;
	}
}

const accessibleDiffViewerCategory: ILocalizedString = localize2('accessibleDiffViewer', "Accessible Diff Viewer");

export class AccessibleDiffViewerNext extends Action2 {
	public static id = 'editor.action.accessibleDiffViewer.next';

	constructor() {
		super({
			id: AccessibleDiffViewerNext.id,
			title: localize2('editor.action.accessibleDiffViewer.next', 'Go to Next Difference'),
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

export class AccessibleDiffViewerPrev extends Action2 {
	public static id = 'editor.action.accessibleDiffViewer.prev';

	constructor() {
		super({
			id: AccessibleDiffViewerPrev.id,
			title: localize2('editor.action.accessibleDiffViewer.prev', 'Go to Previous Difference'),
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

export function findDiffEditor(accessor: ServicesAccessor, originalUri: URI, modifiedUri: URI): IDiffEditor | null {
	const codeEditorService = accessor.get(ICodeEditorService);
	const diffEditors = codeEditorService.listDiffEditors();

	return diffEditors.find(diffEditor => {
		const modified = diffEditor.getModifiedEditor();
		const original = diffEditor.getOriginalEditor();

		return modified && modified.getModel()?.uri.toString() === modifiedUri.toString()
			&& original && original.getModel()?.uri.toString() === originalUri.toString();
	}) || null;
}

export function findFocusedDiffEditor(accessor: ServicesAccessor): IDiffEditor | null {
	const codeEditorService = accessor.get(ICodeEditorService);
	const diffEditors = codeEditorService.listDiffEditors();

	const activeElement = getActiveElement();
	if (activeElement) {
		for (const d of diffEditors) {
			const container = d.getContainerDomNode();
			if (isElementOrParentOf(container, activeElement)) {
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
