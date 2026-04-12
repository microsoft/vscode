/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveElement } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { EditorAction2 } from '../../editorExtensions.js';
import { ICodeEditorService } from '../../services/codeEditorService.js';
import { DiffEditorWidget } from './diffEditorWidget.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import './registrations.contribution.js';
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
    run(accessor, ...args) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('diffEditor.hideUnchangedRegions.enabled');
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
    run(accessor, ...args) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('diffEditor.experimental.showMoves');
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
    run(accessor, ...args) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('diffEditor.useInlineViewWhenSpaceIsLimited');
        configurationService.updateValue('diffEditor.useInlineViewWhenSpaceIsLimited', newValue);
    }
}
const diffEditorCategory = localize2('diffEditor', "Diff Editor");
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
    runEditorCommand(accessor, editor, arg) {
        const diffEditor = findFocusedDiffEditor(accessor);
        if (diffEditor instanceof DiffEditorWidget) {
            if (arg && arg.dryRun) {
                return { destinationSelection: diffEditor.mapToOtherSide().destinationSelection };
            }
            else {
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
                primary: 9 /* KeyCode.Escape */,
            }
        });
    }
    runEditorCommand(accessor, editor, ...args) {
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
    runEditorCommand(accessor, editor, ...args) {
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
    runEditorCommand(accessor, editor, ...args) {
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
            f1: true,
            category: diffEditorCategory,
            precondition: ContextKeyExpr.has('isInDiffEditor'),
        });
    }
    run(accessor, arg) {
        return arg ? this.runViaToolbarContext(accessor, arg) : this.runViaCursorOrSelection(accessor);
    }
    runViaCursorOrSelection(accessor) {
        const diffEditor = findFocusedDiffEditor(accessor);
        if (diffEditor instanceof DiffEditorWidget) {
            diffEditor.revertFocusedRangeMappings();
        }
        return undefined;
    }
    runViaToolbarContext(accessor, arg) {
        const diffEditor = findDiffEditor(accessor, arg.originalUri, arg.modifiedUri);
        if (diffEditor instanceof DiffEditorWidget) {
            diffEditor.revertRangeMappings(arg.mapping.innerChanges ?? []);
        }
        return undefined;
    }
}
const accessibleDiffViewerCategory = localize2('accessibleDiffViewer', "Accessible Diff Viewer");
export class AccessibleDiffViewerNext extends Action2 {
    static { this.id = 'editor.action.accessibleDiffViewer.next'; }
    constructor() {
        super({
            id: AccessibleDiffViewerNext.id,
            title: localize2('editor.action.accessibleDiffViewer.next', 'Go to Next Difference'),
            category: accessibleDiffViewerCategory,
            precondition: ContextKeyExpr.has('isInDiffEditor'),
            keybinding: {
                primary: 65 /* KeyCode.F7 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            f1: true,
        });
    }
    run(accessor) {
        const diffEditor = findFocusedDiffEditor(accessor);
        diffEditor?.accessibleDiffViewerNext();
    }
}
export class AccessibleDiffViewerPrev extends Action2 {
    static { this.id = 'editor.action.accessibleDiffViewer.prev'; }
    constructor() {
        super({
            id: AccessibleDiffViewerPrev.id,
            title: localize2('editor.action.accessibleDiffViewer.prev', 'Go to Previous Difference'),
            category: accessibleDiffViewerCategory,
            precondition: ContextKeyExpr.has('isInDiffEditor'),
            keybinding: {
                primary: 1024 /* KeyMod.Shift */ | 65 /* KeyCode.F7 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            f1: true,
        });
    }
    run(accessor) {
        const diffEditor = findFocusedDiffEditor(accessor);
        diffEditor?.accessibleDiffViewerPrev();
    }
}
export function findDiffEditor(accessor, originalUri, modifiedUri) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const diffEditors = codeEditorService.listDiffEditors();
    return diffEditors.find(diffEditor => {
        const modified = diffEditor.getModifiedEditor();
        const original = diffEditor.getOriginalEditor();
        return modified && modified.getModel()?.uri.toString() === modifiedUri.toString()
            && original && original.getModel()?.uri.toString() === originalUri.toString();
    }) || null;
}
export function findFocusedDiffEditor(accessor) {
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
export function findDiffEditorContainingCodeEditor(accessor, editor) {
    if (!editor.getOption(70 /* EditorOption.inDiffEditor */)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9jb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsT0FBTyxFQUFFLGFBQWEsRUFBb0IsTUFBTSwyQkFBMkIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFL0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEYsT0FBTyxpQ0FBaUMsQ0FBQztBQUt6QyxNQUFNLE9BQU8sOEJBQStCLFNBQVEsT0FBTztJQUMxRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwyQ0FBMkM7WUFDL0MsS0FBSyxFQUFFLFNBQVMsQ0FBQyxnQ0FBZ0MsRUFBRSxtQ0FBbUMsQ0FBQztZQUN2RixJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUc7WUFDakIsT0FBTyxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsZ0RBQWdELENBQUM7WUFDN0UsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENB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