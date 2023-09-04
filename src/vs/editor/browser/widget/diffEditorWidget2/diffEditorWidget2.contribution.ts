/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { findFocusedDiffEditor } from 'vs/editor/browser/widget/diffEditor.contribution';
import { DiffEditorWidget2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorWidget2';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class ToggleCollapseUnchangedRegions extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleCollapseUnchangedRegions',
			title: { value: localize('toggleCollapseUnchangedRegions', "Toggle Collapse Unchanged Regions"), original: 'Toggle Collapse Unchanged Regions' },
			icon: Codicon.map,
			precondition: ContextKeyEqualsExpr.create('diffEditorVersion', 2),
			toggled: ContextKeyExpr.has('config.diffEditor.hideUnchangedRegions.enabled'),
			menu: {
				id: MenuId.EditorTitle,
				order: 22,
				group: 'navigation',
				when: ContextKeyEqualsExpr.create('diffEditorVersion', 2),
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
			precondition: ContextKeyEqualsExpr.create('diffEditorVersion', 2),
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
			precondition: ContextKeyEqualsExpr.create('diffEditorVersion', 2),
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
	when: ContextKeyExpr.and(
		EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached,
		ContextKeyEqualsExpr.create('diffEditorVersion', 2)
	)
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
	when: ContextKeyEqualsExpr.create('diffEditorVersion', 2)
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
			precondition: ContextKeyExpr.and(ContextKeyEqualsExpr.create('diffEditorVersion', 2), ContextKeyExpr.has('isInDiffEditor')),
			f1: true,
			category: diffEditorCategory,
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, arg?: { dryRun: boolean }): unknown {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget2) {
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
		if (diffEditor instanceof DiffEditorWidget2) {
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
			precondition: ContextKeyExpr.and(ContextKeyEqualsExpr.create('diffEditorVersion', 2), ContextKeyExpr.has('isInDiffEditor')),
			f1: true,
			category: diffEditorCategory,
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget2) {
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
			precondition: ContextKeyExpr.and(ContextKeyEqualsExpr.create('diffEditorVersion', 2), ContextKeyExpr.has('isInDiffEditor')),
			f1: true,
			category: diffEditorCategory,
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]): void {
		const diffEditor = findFocusedDiffEditor(accessor);
		if (diffEditor instanceof DiffEditorWidget2) {
			diffEditor.showAllUnchangedRegions();
		}
	}
}

registerAction2(ShowAllUnchangedRegions);
