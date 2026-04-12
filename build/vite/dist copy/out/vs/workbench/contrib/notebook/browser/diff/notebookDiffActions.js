/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { SideBySideDiffElementViewModel } from './diffElementViewModel.js';
import { NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY, NOTEBOOK_DIFF_CELL_INPUT, NOTEBOOK_DIFF_CELL_PROPERTY, NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED, NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS, NOTEBOOK_DIFF_ITEM_DIFF_STATE, NOTEBOOK_DIFF_ITEM_KIND, NOTEBOOK_DIFF_METADATA, NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN } from './notebookDiffEditorBrowser.js';
import { NotebookTextDiffEditor } from './notebookDiffEditor.js';
import { nextChangeIcon, openAsTextIcon, previousChangeIcon, renderOutputIcon, revertIcon, toggleWhitespace } from '../notebookIcons.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { NOTEBOOK_DIFF_EDITOR_ID } from '../../common/notebookCommon.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { NotebookMultiTextDiffEditor } from './notebookMultiDiffEditor.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import product from '../../../../../platform/product/common/product.js';
import { ctxHasEditorModification, ctxHasRequestInProgress } from '../../../chat/browser/chatEditing/chatEditingEditorContextKeys.js';
// ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.openFile',
            icon: Codicon.goToFile,
            title: localize2('notebook.diff.openFile', 'Open File'),
            precondition: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
            menu: [{
                    id: MenuId.EditorTitle,
                    group: 'navigation',
                    when: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
                }]
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const activeEditor = editorService.activeEditorPane;
        if (!activeEditor) {
            return;
        }
        if (activeEditor instanceof NotebookTextDiffEditor || activeEditor instanceof NotebookMultiTextDiffEditor) {
            const diffEditorInput = activeEditor.input;
            const resource = diffEditorInput.modified.resource;
            await editorService.openEditor({ resource });
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.cell.toggleCollapseUnchangedRegions',
            title: localize2('notebook.diff.cell.toggleCollapseUnchangedRegions', 'Toggle Collapse Unchanged Regions'),
            icon: Codicon.map,
            toggled: ContextKeyExpr.has('config.diffEditor.hideUnchangedRegions.enabled'),
            precondition: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID),
            menu: {
                id: MenuId.EditorTitle,
                group: 'navigation',
                when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID),
            },
        });
    }
    run(accessor, ...args) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('diffEditor.hideUnchangedRegions.enabled');
        configurationService.updateValue('diffEditor.hideUnchangedRegions.enabled', newValue);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.switchToText',
            icon: openAsTextIcon,
            title: localize2('notebook.diff.switchToText', 'Open Text Diff Editor'),
            precondition: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
            menu: [{
                    id: MenuId.EditorTitle,
                    group: 'navigation',
                    when: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
                }]
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const activeEditor = editorService.activeEditorPane;
        if (!activeEditor) {
            return;
        }
        if (activeEditor instanceof NotebookTextDiffEditor || activeEditor instanceof NotebookMultiTextDiffEditor) {
            const diffEditorInput = activeEditor.input;
            await editorService.openEditor({
                original: { resource: diffEditorInput.original.resource },
                modified: { resource: diffEditorInput.resource },
                label: diffEditorInput.getName(),
                options: {
                    preserveFocus: false,
                    override: DEFAULT_EDITOR_ASSOCIATION.id
                }
            });
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diffEditor.showUnchangedCells',
            title: localize2('showUnchangedCells', 'Show Unchanged Cells'),
            icon: Codicon.unfold,
            precondition: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key)),
            menu: {
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key), ContextKeyExpr.equals(NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN.key, true)),
                id: MenuId.EditorTitle,
                order: 22,
                group: 'navigation',
            },
        });
    }
    run(accessor, ...args) {
        const activeEditor = accessor.get(IEditorService).activeEditorPane;
        if (!activeEditor) {
            return;
        }
        if (activeEditor instanceof NotebookMultiTextDiffEditor) {
            activeEditor.showUnchanged();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diffEditor.hideUnchangedCells',
            title: localize2('hideUnchangedCells', 'Hide Unchanged Cells'),
            icon: Codicon.fold,
            precondition: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key)),
            menu: {
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key), ContextKeyExpr.equals(NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN.key, false)),
                id: MenuId.EditorTitle,
                order: 22,
                group: 'navigation',
            },
        });
    }
    run(accessor, ...args) {
        const activeEditor = accessor.get(IEditorService).activeEditorPane;
        if (!activeEditor) {
            return;
        }
        if (activeEditor instanceof NotebookMultiTextDiffEditor) {
            activeEditor.hideUnchanged();
        }
    }
});
registerAction2(class GoToFileAction extends Action2 {
    constructor() {
        super({
            id: 'notebook.diffEditor.2.goToCell',
            title: localize2('goToCell', 'Go To Cell'),
            icon: Codicon.goToFile,
            menu: {
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, 'Cell'), ContextKeyExpr.notEquals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, 'delete')),
                id: MenuId.MultiDiffEditorFileToolbar,
                order: 0,
                group: 'navigation',
            },
        });
    }
    async run(accessor, ...args) {
        const uri = args[0];
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
            return;
        }
        await editorService.openEditor({
            resource: uri,
            options: {
                selectionRevealType: 1 /* TextEditorSelectionRevealType.CenterIfOutsideViewport */,
            },
        });
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.revertMetadata',
            title: localize('notebook.diff.revertMetadata', "Revert Notebook Metadata"),
            icon: revertIcon,
            f1: false,
            menu: {
                id: MenuId.NotebookDiffDocumentMetadata,
                when: NOTEBOOK_DIFF_METADATA,
            },
            precondition: NOTEBOOK_DIFF_METADATA
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!(activeEditorPane instanceof NotebookTextDiffEditor)) {
            return;
        }
        context.modifiedDocumentTextModel.applyEdits([{
                editType: 5 /* CellEditType.DocumentMetadata */,
                metadata: context.originalMetadata.metadata,
            }], true, undefined, () => undefined, undefined, true);
    }
});
const revertInput = localize('notebook.diff.cell.revertInput', "Revert Input");
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diffEditor.2.cell.revertInput',
            title: revertInput,
            icon: revertIcon,
            menu: {
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, 'Cell'), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, 'modified')),
                id: MenuId.MultiDiffEditorFileToolbar,
                order: 2,
                group: 'navigation',
            },
        });
    }
    async run(accessor, ...args) {
        const uri = args[0];
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
            return;
        }
        const item = activeEditorPane.getDiffElementViewModel(uri);
        if (item && item instanceof SideBySideDiffElementViewModel) {
            const modified = item.modified;
            const original = item.original;
            if (!original || !modified) {
                return;
            }
            const bulkEditService = accessor.get(IBulkEditService);
            await bulkEditService.apply([
                new ResourceTextEdit(modified.uri, { range: modified.textModel.getFullModelRange(), text: original.textModel.getValue() }),
            ], { quotableLabel: 'Revert Notebook Cell Content Change' });
        }
    }
});
const revertOutputs = localize('notebook.diff.cell.revertOutputs', "Revert Outputs");
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diffEditor.2.cell.revertOutputs',
            title: revertOutputs,
            icon: revertIcon,
            f1: false,
            menu: {
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, 'Output'), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, 'modified')),
                id: MenuId.MultiDiffEditorFileToolbar,
                order: 2,
                group: 'navigation',
            },
        });
    }
    async run(accessor, ...args) {
        const uri = args[0];
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
            return;
        }
        const item = activeEditorPane.getDiffElementViewModel(uri);
        if (item && item instanceof SideBySideDiffElementViewModel) {
            const original = item.original;
            const modifiedCellIndex = item.modifiedDocument.cells.findIndex(cell => cell.handle === item.modified.handle);
            if (modifiedCellIndex === -1) {
                return;
            }
            item.mainDocumentTextModel.applyEdits([{
                    editType: 2 /* CellEditType.Output */, index: modifiedCellIndex, outputs: original.outputs
                }], true, undefined, () => undefined, undefined, true);
        }
    }
});
const revertMetadata = localize('notebook.diff.cell.revertMetadata', "Revert Metadata");
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diffEditor.2.cell.revertMetadata',
            title: revertMetadata,
            icon: revertIcon,
            f1: false,
            menu: {
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, 'Metadata'), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, 'modified')),
                id: MenuId.MultiDiffEditorFileToolbar,
                order: 2,
                group: 'navigation',
            },
        });
    }
    async run(accessor, ...args) {
        const uri = args[0];
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
            return;
        }
        const item = activeEditorPane.getDiffElementViewModel(uri);
        if (item && item instanceof SideBySideDiffElementViewModel) {
            const original = item.original;
            const modifiedCellIndex = item.modifiedDocument.cells.findIndex(cell => cell.handle === item.modified.handle);
            if (modifiedCellIndex === -1) {
                return;
            }
            item.mainDocumentTextModel.applyEdits([{
                    editType: 3 /* CellEditType.Metadata */, index: modifiedCellIndex, metadata: original.metadata
                }], true, undefined, () => undefined, undefined, true);
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.cell.revertMetadata',
            title: revertMetadata,
            icon: revertIcon,
            f1: false,
            menu: {
                id: MenuId.NotebookDiffCellMetadataTitle,
                when: NOTEBOOK_DIFF_CELL_PROPERTY
            },
            precondition: NOTEBOOK_DIFF_CELL_PROPERTY
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        if (!(context instanceof SideBySideDiffElementViewModel)) {
            return;
        }
        const original = context.original;
        const modified = context.modified;
        const modifiedCellIndex = context.mainDocumentTextModel.cells.indexOf(modified.textModel);
        if (modifiedCellIndex === -1) {
            return;
        }
        const rawEdits = [{ editType: 3 /* CellEditType.Metadata */, index: modifiedCellIndex, metadata: original.metadata }];
        if (context.original.language && context.modified.language !== context.original.language) {
            rawEdits.push({ editType: 4 /* CellEditType.CellLanguage */, index: modifiedCellIndex, language: context.original.language });
        }
        context.modifiedDocument.applyEdits(rawEdits, true, undefined, () => undefined, undefined, true);
    }
});
// registerAction2(class extends Action2 {
// 	constructor() {
// 		super(
// 			{
// 				id: 'notebook.diff.cell.switchOutputRenderingStyle',
// 				title: localize('notebook.diff.cell.switchOutputRenderingStyle', "Switch Outputs Rendering"),
// 				icon: renderOutputIcon,
// 				f1: false,
// 				menu: {
// 					id: MenuId.NotebookDiffCellOutputsTitle
// 				}
// 			}
// 		);
// 	}
// 	run(accessor: ServicesAccessor, context?: DiffElementViewModelBase) {
// 		if (!context) {
// 			return;
// 		}
// 		context.renderOutput = true;
// 	}
// });
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.cell.switchOutputRenderingStyleToText',
            title: localize('notebook.diff.cell.switchOutputRenderingStyleToText', "Switch Output Rendering"),
            icon: renderOutputIcon,
            f1: false,
            menu: {
                id: MenuId.NotebookDiffCellOutputsTitle,
                when: NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED
            }
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        context.renderOutput = !context.renderOutput;
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.cell.revertOutputs',
            title: localize('notebook.diff.cell.revertOutputs', "Revert Outputs"),
            icon: revertIcon,
            f1: false,
            menu: {
                id: MenuId.NotebookDiffCellOutputsTitle,
                when: NOTEBOOK_DIFF_CELL_PROPERTY
            },
            precondition: NOTEBOOK_DIFF_CELL_PROPERTY
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        if (!(context instanceof SideBySideDiffElementViewModel)) {
            return;
        }
        const original = context.original;
        const modified = context.modified;
        const modifiedCellIndex = context.mainDocumentTextModel.cells.indexOf(modified.textModel);
        if (modifiedCellIndex === -1) {
            return;
        }
        context.mainDocumentTextModel.applyEdits([{
                editType: 2 /* CellEditType.Output */, index: modifiedCellIndex, outputs: original.outputs
            }], true, undefined, () => undefined, undefined, true);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.toggle.diff.cell.ignoreTrimWhitespace',
            title: localize('ignoreTrimWhitespace.label', "Show Leading/Trailing Whitespace Differences"),
            icon: toggleWhitespace,
            f1: false,
            menu: {
                id: MenuId.NotebookDiffCellInputTitle,
                when: NOTEBOOK_DIFF_CELL_INPUT,
                order: 1,
            },
            precondition: NOTEBOOK_DIFF_CELL_INPUT,
            toggled: ContextKeyExpr.equals(NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY, false),
        });
    }
    run(accessor, context) {
        const cell = context;
        if (!cell?.modified) {
            return;
        }
        const uri = cell.modified.uri;
        const configService = accessor.get(ITextResourceConfigurationService);
        const key = 'diffEditor.ignoreTrimWhitespace';
        const val = configService.getValue(uri, key);
        configService.updateValue(uri, key, !val);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.cell.revertInput',
            title: revertInput,
            icon: revertIcon,
            f1: false,
            menu: {
                id: MenuId.NotebookDiffCellInputTitle,
                when: NOTEBOOK_DIFF_CELL_INPUT,
                order: 2
            },
            precondition: NOTEBOOK_DIFF_CELL_INPUT
        });
    }
    run(accessor, context) {
        if (!context) {
            return;
        }
        const original = context.original;
        const modified = context.modified;
        if (!original || !modified) {
            return;
        }
        const bulkEditService = accessor.get(IBulkEditService);
        return bulkEditService.apply([
            new ResourceTextEdit(modified.uri, { range: modified.textModel.getFullModelRange(), text: original.textModel.getValue() }),
        ], { quotableLabel: 'Revert Notebook Cell Content Change' });
    }
});
class ToggleRenderAction extends Action2 {
    constructor(id, title, precondition, toggled, order, toggleOutputs, toggleMetadata) {
        super({
            id: id,
            title,
            precondition: precondition,
            menu: [{
                    id: MenuId.EditorTitle,
                    group: 'notebook',
                    when: precondition,
                    order: order,
                }],
            toggled: toggled
        });
        this.toggleOutputs = toggleOutputs;
        this.toggleMetadata = toggleMetadata;
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        if (this.toggleOutputs !== undefined) {
            const oldValue = configurationService.getValue('notebook.diff.ignoreOutputs');
            configurationService.updateValue('notebook.diff.ignoreOutputs', !oldValue);
        }
        if (this.toggleMetadata !== undefined) {
            const oldValue = configurationService.getValue('notebook.diff.ignoreMetadata');
            configurationService.updateValue('notebook.diff.ignoreMetadata', !oldValue);
        }
    }
}
registerAction2(class extends ToggleRenderAction {
    constructor() {
        super('notebook.diff.showOutputs', localize2('notebook.diff.showOutputs', 'Show Outputs Differences'), ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)), ContextKeyExpr.notEquals('config.notebook.diff.ignoreOutputs', true), 2, true, undefined);
    }
});
registerAction2(class extends ToggleRenderAction {
    constructor() {
        super('notebook.diff.showMetadata', localize2('notebook.diff.showMetadata', 'Show Metadata Differences'), ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)), ContextKeyExpr.notEquals('config.notebook.diff.ignoreMetadata', true), 1, undefined, true);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.action.previous',
            title: localize('notebook.diff.action.previous.title', "Show Previous Change"),
            icon: previousChangeIcon,
            f1: false,
            keybinding: {
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 61 /* KeyCode.F3 */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
            },
            menu: {
                id: MenuId.EditorTitle,
                group: 'navigation',
                when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
            }
        });
    }
    run(accessor) {
        const editorService = accessor.get(IEditorService);
        if (editorService.activeEditorPane?.getId() !== NOTEBOOK_DIFF_EDITOR_ID) {
            return;
        }
        const editor = editorService.activeEditorPane.getControl();
        editor?.previousChange();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.action.next',
            title: localize('notebook.diff.action.next.title', "Show Next Change"),
            icon: nextChangeIcon,
            f1: false,
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 61 /* KeyCode.F3 */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
            },
            menu: {
                id: MenuId.EditorTitle,
                group: 'navigation',
                when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
            }
        });
    }
    run(accessor) {
        const editorService = accessor.get(IEditorService);
        if (editorService.activeEditorPane?.getId() !== NOTEBOOK_DIFF_EDITOR_ID) {
            return;
        }
        const editor = editorService.activeEditorPane.getControl();
        editor?.nextChange();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.diff.inline.toggle',
            title: localize('notebook.diff.inline.toggle.title', "Toggle Inline View"),
            menu: {
                id: MenuId.EditorTitle,
                group: '1_diff',
                order: 10,
                when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ContextKeyExpr.equals('config.notebook.diff.experimental.toggleInline', true), ctxHasEditorModification.negate(), ctxHasRequestInProgress.negate())
            }
        });
    }
    run(accessor) {
        const editorService = accessor.get(IEditorService);
        if (editorService.activeEditorPane?.getId() !== NOTEBOOK_DIFF_EDITOR_ID) {
            return;
        }
        const editor = editorService.activeEditorPane.getControl();
        editor?.toggleInlineView();
    }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'notebook',
    order: 100,
    type: 'object',
    'properties': {
        'notebook.diff.ignoreMetadata': {
            type: 'boolean',
            default: false,
            markdownDescription: localize('notebook.diff.ignoreMetadata', "Hide Metadata Differences")
        },
        'notebook.diff.ignoreOutputs': {
            type: 'boolean',
            default: false,
            markdownDescription: localize('notebook.diff.ignoreOutputs', "Hide Outputs Differences")
        },
        'notebook.diff.experimental.toggleInline': {
            type: 'boolean',
            default: typeof product.quality === 'string' && product.quality !== 'stable', // only enable as default in insiders
            markdownDescription: localize('notebook.diff.toggleInline', "Enable the command to toggle the experimental notebook inline diff editor.")
        },
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmZBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGNBQWMsRUFBd0IsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RSxPQUFPLEVBQW1FLDhCQUE4QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDNUksT0FBTyxFQUEyQix3Q0FBd0MsRUFBRSx3QkFBd0IsRUFBRSwyQkFBMkIsRUFBRSxvQ0FBb0MsRUFBRSxpQ0FBaUMsRUFBRSw2QkFBNkIsRUFBRSx1QkFBdUIsRUFBRSxzQkFBc0IsRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3pXLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRWpFLE9BQU8sRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3pJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztB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