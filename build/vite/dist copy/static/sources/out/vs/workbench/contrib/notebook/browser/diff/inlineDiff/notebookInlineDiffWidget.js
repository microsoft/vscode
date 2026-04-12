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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookInlineDiffDecorationContribution } from './notebookInlineDiff.js';
import { NotebookEditorExtensionsRegistry } from '../../notebookEditorExtensions.js';
import { INotebookEditorService } from '../../services/notebookEditorService.js';
let NotebookInlineDiffWidget = class NotebookInlineDiffWidget extends Disposable {
    get editorWidget() {
        return this.widget.value;
    }
    constructor(rootElement, groupId, window, options, dimension, instantiationService, widgetService) {
        super();
        this.rootElement = rootElement;
        this.groupId = groupId;
        this.window = window;
        this.options = options;
        this.dimension = dimension;
        this.instantiationService = instantiationService;
        this.widgetService = widgetService;
        this.widget = { value: undefined };
    }
    async show(input, model, previousModel, options) {
        if (!this.widget.value) {
            this.createNotebookWidget(input, this.groupId, this.rootElement);
        }
        if (this.dimension) {
            this.widget.value?.layout(this.dimension, this.rootElement, this.position);
        }
        if (model) {
            await this.widget.value?.setOptions({ ...options });
            this.widget.value?.notebookOptions.previousModelToCompare.set(previousModel, undefined);
            await this.widget.value.setModel(model, options?.viewState);
        }
    }
    hide() {
        if (this.widget.value) {
            this.widget.value.notebookOptions.previousModelToCompare.set(undefined, undefined);
            this.widget.value.onWillHide();
        }
    }
    setLayout(dimension, position) {
        this.dimension = dimension;
        this.position = position;
    }
    createNotebookWidget(input, groupId, rootElement) {
        const contributions = NotebookEditorExtensionsRegistry.getSomeEditorContributions([NotebookInlineDiffDecorationContribution.ID]);
        const menuIds = {
            notebookToolbar: MenuId.NotebookToolbar,
            cellTitleToolbar: MenuId.NotebookCellTitle,
            cellDeleteToolbar: MenuId.NotebookCellDelete,
            cellInsertToolbar: MenuId.NotebookCellBetween,
            cellTopInsertToolbar: MenuId.NotebookCellListTop,
            cellExecuteToolbar: MenuId.NotebookCellExecute,
            cellExecutePrimary: undefined,
        };
        const skipContributions = [
            'editor.contrib.review',
            'editor.contrib.floatingClickMenu',
            'editor.contrib.dirtydiff',
            'editor.contrib.testingOutputPeek',
            'editor.contrib.testingDecorations',
            'store.contrib.stickyScrollController',
            'editor.contrib.findController',
            'editor.contrib.emptyTextEditorHint',
        ];
        const cellEditorContributions = EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1);
        this.widget = this.instantiationService.invokeFunction(this.widgetService.retrieveWidget, groupId, input, { contributions, menuIds, cellEditorContributions, options: this.options }, this.dimension, this.window);
        if (this.rootElement && this.widget.value.getDomNode()) {
            this.rootElement.setAttribute('aria-flowto', this.widget.value.getDomNode().id || '');
            DOM.setParentFlowTo(this.widget.value.getDomNode(), this.rootElement);
        }
    }
    dispose() {
        super.dispose();
        if (this.widget.value) {
            this.widget.value.dispose();
        }
    }
};
NotebookInlineDiffWidget = __decorate([
    __param(5, IInstantiationService),
    __param(6, INotebookEditorService)
], NotebookInlineDiffWidget);
export { NotebookInlineDiffWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tJbmxpbmVEaWZmV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL2lubGluZURpZmYvbm90ZWJvb2tJbmxpbmVEaWZmV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFFN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUd6RyxPQUFPLEVBQUUsd0NBQXdDLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVuRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUdyRixPQUFPLEVBQWdCLHNCQUFzQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFeEYsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBS3ZELElBQUksWUFBWTtRQUNmLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDMUIsQ0FBQztJQUVELFlBQ2tCLFdBQXdCLEVBQ3hCLE9BQWUsRUFDZixNQUFrQixFQUNsQixPQUF3QixFQUNqQyxTQUFvQyxFQUNyQixvQkFBNEQsRUFDM0QsYUFBc0Q7UUFDOUUsS0FBSyxFQUFFLENBQUM7UUFQUyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUN4QixZQUFPLEdBQVAsT0FBTyxDQUFRO1FBQ2YsV0FBTSxHQUFOLE1BQU0sQ0FBWTtRQUNs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