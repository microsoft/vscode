/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action } from '../../../../../base/common/actions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { NOTEBOOK_ACTIONS_CATEGORY, SELECT_KERNEL_ID } from '../controller/coreActions.js';
import { getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import { selectKernelIcon } from '../notebookIcons.js';
import { KernelPickerMRUStrategy } from './notebookKernelQuickPickStrategy.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT } from '../../common/notebookContextKeys.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../../common/notebookKernelService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
function getEditorFromContext(editorService, context) {
    let editor;
    if (context !== undefined && 'notebookEditorId' in context) {
        const editorId = context.notebookEditorId;
        const matchingEditor = editorService.visibleEditorPanes.find((editorPane) => {
            const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
            return notebookEditor?.getId() === editorId;
        });
        editor = getNotebookEditorFromEditorPane(matchingEditor);
    }
    else if (context !== undefined && 'notebookEditor' in context) {
        editor = context?.notebookEditor;
    }
    else {
        editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    }
    return editor;
}
function shouldSkip(selected, controllerId, extensionId, context) {
    return !!(selected && ((context && 'skipIfAlreadySelected' in context && context.skipIfAlreadySelected) ||
        // target kernel is already selected
        (controllerId && selected.id === controllerId && ExtensionIdentifier.equals(selected.extension, extensionId))));
}
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SELECT_KERNEL_ID,
            category: NOTEBOOK_ACTIONS_CATEGORY,
            title: localize2('notebookActions.selectKernel', 'Select Notebook Kernel'),
            icon: selectKernelIcon,
            f1: true,
            precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
            menu: [{
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)),
                    group: 'navigation',
                    order: -10
                }, {
                    id: MenuId.NotebookToolbar,
                    when: ContextKeyExpr.equals('config.notebook.globalToolbar', true),
                    group: 'status',
                    order: -10
                }, {
                    id: MenuId.InteractiveToolbar,
                    when: NOTEBOOK_KERNEL_COUNT.notEqualsTo(0),
                    group: 'status',
                    order: -10
                }],
            metadata: {
                description: localize('notebookActions.selectKernel.args', "Notebook Kernel Args"),
                args: [
                    {
                        name: 'kernelInfo',
                        description: 'The kernel info',
                        schema: {
                            'type': 'object',
                            'required': ['id', 'extension'],
                            'properties': {
                                'id': {
                                    'type': 'string'
                                },
                                'extension': {
                                    'type': 'string'
                                },
                                'notebookEditorId': {
                                    'type': 'string'
                                }
                            }
                        }
                    }
                ]
            },
        });
    }
    async run(accessor, context) {
        const instantiationService = accessor.get(IInstantiationService);
        const editorService = accessor.get(IEditorService);
        const editor = getEditorFromContext(editorService, context);
        if (!editor || !editor.hasModel()) {
            return false;
        }
        let controllerId = context && 'id' in context ? context.id : undefined;
        let extensionId = context && 'extension' in context ? context.extension : undefined;
        if (controllerId && (typeof controllerId !== 'string' || typeof extensionId !== 'string')) {
            // validate context: id & extension MUST be strings
            controllerId = undefined;
            extensionId = undefined;
        }
        const notebook = editor.textModel;
        const notebookKernelService = accessor.get(INotebookKernelService);
        const { selected } = notebookKernelService.getMatchingKernel(notebook);
        if (shouldSkip(selected, controllerId, extensionId, context)) {
            return true;
        }
        const wantedKernelId = controllerId ? `${extensionId}/${controllerId}` : undefined;
        const strategy = instantiationService.createInstance(KernelPickerMRUStrategy);
        return strategy.showQuickPick(editor, wantedKernelId);
    }
});
let NotebooKernelActionViewItem = class NotebooKernelActionViewItem extends ActionViewItem {
    constructor(actualAction, _editor, options, _notebookKernelService, _notebookKernelHistoryService) {
        const action = new Action('fakeAction', undefined, ThemeIcon.asClassName(selectKernelIcon), true, (event) => actualAction.run(event));
        super(undefined, action, { ...options, label: false, icon: true });
        this._editor = _editor;
        this._notebookKernelService = _notebookKernelService;
        this._notebookKernelHistoryService = _notebookKernelHistoryService;
        this._register(action);
        this._register(_editor.onDidChangeModel(this._update, this));
        this._register(_notebookKernelService.onDidAddKernel(this._update, this));
        this._register(_notebookKernelService.onDidRemoveKernel(this._update, this));
        this._register(_notebookKernelService.onDidChangeNotebookAffinity(this._update, this));
        this._register(_notebookKernelService.onDidChangeSelectedNotebooks(this._update, this));
        this._register(_notebookKernelService.onDidChangeSourceActions(this._update, this));
        this._register(_notebookKernelService.onDidChangeKernelDetectionTasks(this._update, this));
    }
    render(container) {
        this._update();
        super.render(container);
        container.classList.add('kernel-action-view-item');
        this._kernelLabel = document.createElement('a');
        container.appendChild(this._kernelLabel);
        this.updateLabel();
    }
    updateLabel() {
        if (this._kernelLabel) {
            this._kernelLabel.classList.add('kernel-label');
            this._kernelLabel.innerText = this._action.label;
        }
    }
    _update() {
        const notebook = this._editor.textModel;
        if (!notebook) {
            this._resetAction();
            return;
        }
        KernelPickerMRUStrategy.updateKernelStatusAction(notebook, this._action, this._notebookKernelService, this._notebookKernelHistoryService);
        this.updateClass();
    }
    _resetAction() {
        this._action.enabled = false;
        this._action.label = '';
        this._action.class = '';
    }
};
NotebooKernelActionViewItem = __decorate([
    __param(3, INotebookKernelService),
    __param(4, INotebookKernelHistoryService)
], NotebooKernelActionViewItem);
export { NotebooKernelActionViewItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tLZXJuZWxWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3UGFydHMvbm90ZWJvb2tLZXJuZWxWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQTBCLE1BQU0sNkRBQTZELENBQUM7QUFDckgsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLHVDQUF1QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckcsT0FBTyxFQUFFLGNBQWMsRUFBc0IsTUFBTSx5REFBeUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDeEgsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNGLE9BQU8sRUFBRSwrQkFBK0IsRUFBbUIsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsdUJBQXVCLEVBQTBCLE1BQU0sc0NBQXNDLENBQUM7QUFFdkcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLHFCQUFxQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkcsT0FBTyxFQUFtQiw2QkFBNkIsRUFBRSxzQkFBc0IsRUFB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