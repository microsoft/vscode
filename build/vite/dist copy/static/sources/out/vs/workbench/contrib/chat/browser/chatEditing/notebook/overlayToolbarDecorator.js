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
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { CellEditState } from '../../../../notebook/browser/notebookBrowser.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
let OverlayToolbarDecorator = class OverlayToolbarDecorator extends Disposable {
    constructor(notebookEditor, notebookModel, instantiationService, accessibilitySignalService) {
        super();
        this.notebookEditor = notebookEditor;
        this.notebookModel = notebookModel;
        this.instantiationService = instantiationService;
        this.accessibilitySignalService = accessibilitySignalService;
        this._timeout = undefined;
        this.overlayDisposables = this._register(new DisposableStore());
    }
    decorate(changes) {
        if (this._timeout !== undefined) {
            clearTimeout(this._timeout);
        }
        this._timeout = setTimeout(() => {
            this._timeout = undefined;
            this.createMarkdownPreviewToolbars(changes);
        }, 100);
    }
    createMarkdownPreviewToolbars(changes) {
        this.overlayDisposables.clear();
        const accessibilitySignalService = this.accessibilitySignalService;
        const editor = this.notebookEditor;
        for (const change of changes) {
            const cellViewModel = this.getCellViewModel(change);
            if (!cellViewModel || cellViewModel.cellKind !== CellKind.Markup) {
                continue;
            }
            const toolbarContainer = document.createElement('div');
            let overlayId = undefined;
            editor.changeCellOverlays((accessor) => {
                toolbarContainer.style.right = '44px';
                overlayId = accessor.addOverlay({
                    cell: cellViewModel,
                    domNode: toolbarContainer,
                });
            });
            const removeOverlay = () => {
                editor.changeCellOverlays(accessor => {
                    if (overlayId) {
                        accessor.removeOverlay(overlayId);
                    }
                });
            };
            this.overlayDisposables.add({ dispose: removeOverlay });
            const toolbar = document.createElement('div');
            toolbarContainer.appendChild(toolbar);
            toolbar.className = 'chat-diff-change-content-widget';
            toolbar.classList.add('hover'); // Show by default
            toolbar.style.position = 'relative';
            toolbar.style.top = '18px';
            toolbar.style.zIndex = '10';
            toolbar.style.display = cellViewModel.getEditState() === CellEditState.Editing ? 'none' : 'block';
            this.overlayDisposables.add(cellViewModel.onDidChangeState((e) => {
                if (e.editStateChanged) {
                    if (cellViewModel.getEditState() === CellEditState.Editing) {
                        toolbar.style.display = 'none';
                    }
                    else {
                        toolbar.style.display = 'block';
                    }
                }
            }));
            const scopedInstaService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.notebookEditor.scopedContextKeyService])));
            const toolbarWidget = scopedInstaService.createInstance(MenuWorkbenchToolBar, toolbar, MenuId.ChatEditingEditorHunk, {
                telemetrySource: 'chatEditingNotebookHunk',
                hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
                toolbarOptions: { primaryGroup: () => true },
                menuOptions: {
                    renderShortTitle: true,
                    arg: {
                        async accept() {
                            accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
                            removeOverlay();
                            toolbarWidget.dispose();
                            for (const singleChange of change.diff.get().changes) {
                                await change.keep(singleChange);
                            }
                            return true;
                        },
                        async reject() {
                            accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
                            removeOverlay();
                            toolbarWidget.dispose();
                            for (const singleChange of change.diff.get().changes) {
                                await change.undo(singleChange);
                            }
                            return true;
                        }
                    },
                },
                actionViewItemProvider: (action, options) => {
                    if (!action.class) {
                        return new class extends ActionViewItem {
                            constructor() {
                                super(undefined, action, { ...options, keybindingNotRenderedWithLabel: true /* hide keybinding for actions without icon */, icon: false, label: true });
                            }
                        };
                    }
                    return undefined;
                }
            });
            this.overlayDisposables.add(toolbarWidget);
        }
    }
    getCellViewModel(change) {
        if (change.type === 'delete' || change.modifiedCellIndex === undefined) {
            return undefined;
        }
        const cell = this.notebookModel.cells[change.modifiedCellIndex];
        const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
        return cellViewModel;
    }
    dispose() {
        super.dispose();
        if (this._timeout !== undefined) {
            clearTimeout(this._timeout);
        }
    }
};
OverlayToolbarDecorator = __decorate([
    __param(2, IInstantiationService),
    __param(3, IAccessibilitySignalService)
], OverlayToolbarDecorator);
export { OverlayToolbarDecorator };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvbm90ZWJvb2svb3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDJCQUEyQixFQUFFLE1BQU0sc0ZBQXNGLENBQUM7QUFDeEosT0FBTyxFQUFFLG9CQUFvQixFQUFzQixNQUFNLHVEQUF1RCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxFQUFtQixNQUFNLGlEQUFpRCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUtsRSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLFVBQVU7SUFLdEQsWUFDa0IsY0FBK0IsRUFDL0IsYUFBZ0MsRUFDMUIsb0JBQTRELEVBQ3RELDBCQUF3RTtRQUVyRyxLQUFLLEVBQUUsQ0FBQztRQUxTLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUMvQixrQkFBYSxHQUFiLGFBQWEsQ0FBbUI7UUFDVCx5QkFBb0Is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