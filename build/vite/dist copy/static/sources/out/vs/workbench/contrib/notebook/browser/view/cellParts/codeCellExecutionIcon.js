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
import * as DOM from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from '../../notebookIcons.js';
import { NotebookCellExecutionState } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../../common/notebookExecutionStateService.js';
let CollapsedCodeCellExecutionIcon = class CollapsedCodeCellExecutionIcon extends Disposable {
    constructor(_notebookEditor, _cell, _element, _executionStateService) {
        super();
        this._cell = _cell;
        this._element = _element;
        this._executionStateService = _executionStateService;
        this._visible = false;
        this._update();
        this._register(this._executionStateService.onDidChangeExecution(e => {
            if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
                this._update();
            }
        }));
        this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
    }
    setVisibility(visible) {
        this._visible = visible;
        this._update();
    }
    _update() {
        if (!this._visible) {
            return;
        }
        const runState = this._executionStateService.getCellExecution(this._cell.uri);
        const item = this._getItemForState(runState, this._cell.model.internalMetadata);
        if (item) {
            this._element.style.display = '';
            DOM.reset(this._element, ...renderLabelWithIcons(item.text));
            this._element.title = item.tooltip ?? '';
        }
        else {
            this._element.style.display = 'none';
            DOM.reset(this._element);
        }
    }
    _getItemForState(runState, internalMetadata) {
        const state = runState?.state;
        const { lastRunSuccess } = internalMetadata;
        if (!state && lastRunSuccess) {
            return {
                text: `$(${successStateIcon.id})`,
                tooltip: localize('notebook.cell.status.success', "Success"),
            };
        }
        else if (!state && lastRunSuccess === false) {
            return {
                text: `$(${errorStateIcon.id})`,
                tooltip: localize('notebook.cell.status.failure', "Failure"),
            };
        }
        else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
            return {
                text: `$(${pendingStateIcon.id})`,
                tooltip: localize('notebook.cell.status.pending', "Pending"),
            };
        }
        else if (state === NotebookCellExecutionState.Executing) {
            const icon = ThemeIcon.modify(executingStateIcon, 'spin');
            return {
                text: `$(${icon.id})`,
                tooltip: localize('notebook.cell.status.executing', "Executing"),
            };
        }
        return;
    }
};
CollapsedCodeCellExecutionIcon = __decorate([
    __param(3, INotebookExecutionStateService)
], CollapsedCodeCellExecutionIcon);
export { CollapsedCodeCellExecutionIcon };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNlbGxFeGVjdXRpb25JY29uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L2NlbGxQYXJ0cy9jb2RlQ2VsbEV4ZWN1dGlvbkljb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDaEgsT0FBTyxFQUFFLDBCQUEwQixFQUFnQyxNQUFNLG1DQUFtQyxDQUFDO0FBQzdHLE9BQU8sRUFBMEIsOEJBQThCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQU8xSSxJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUErQixTQUFRLFVBQVU7SUFHN0QsWUFDQyxlQUF3QyxFQUN2QixLQUFxQixFQUNyQixRQUFxQixFQUNOLHNCQUE4RDtRQUU5RixLQUFLLEVBQUUsQ0FBQztRQUpTLFVBQUssR0FBTCxLQUFLLENBQWdCO1FBQ3JCLGFBQVEsR0FBUixRQUFRLENBQWE7UUFDRSwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQWdDO1FBTnZGLGFBQVEsR0FBRyxLQUFLLENBQUM7UUFVeEIsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2Ys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