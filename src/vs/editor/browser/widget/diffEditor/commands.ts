/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor, IDiffEditor } from '../../editorBrowser.js';
import { EditorAction2, ServicesAccessor } from '../../editorExtensions.js';
import { ICodeEditorService } from '../../services/codeEditorService.js';
import { DiffEditorWidget } from './diffEditorWidget.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import './registrations.contribution.js';
import { DiffEditorSelectionHunkToolbarContext } from './features/gutterFeature.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorOption } from '../../../common/config/editorOptions.js';

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
			if (container.contains(activeElement)) {
				return d;
			}
		}
	}

	return null;
}


/**
 * If `editor` is the original or modified editor of a diff editor, it returns it.
 * It returns null otherwise.
 */
export function findDiffEditorContainingCodeEditor(accessor: ServicesAccessor, editor: ICodeEditor): IDiffEditor | null {
	if (!editor.getOption(EditorOption.inDiffEditor)) {
		return null;
	}

	const codeEditorService = accessor.get(ICodeEditorService);

	for (const diffEditor of codeEditorService.listDiffEditors()) {
		const originalEditor = diffEditor.getOriginalEditor();
		const modifiedEditor = diffEditor.getModifiedEditor();
		if (originalEditor === editor || modifiedEditor === editor) {
			return diffEditor;
		}
	}
	return null;
}
