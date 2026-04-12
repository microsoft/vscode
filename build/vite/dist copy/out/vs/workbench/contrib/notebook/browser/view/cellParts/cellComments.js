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
import { coalesce } from '../../../../../../base/common/arrays.js';
import { DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ICommentService } from '../../../../comments/browser/commentService.js';
import { CommentThreadWidget } from '../../../../comments/browser/commentThreadWidget.js';
import { CellContentPart } from '../cellPart.js';
let CellComments = class CellComments extends CellContentPart {
    constructor(notebookEditor, container, contextKeyService, themeService, commentService, instantiationService) {
        super();
        this.notebookEditor = notebookEditor;
        this.container = container;
        this.contextKeyService = contextKeyService;
        this.themeService = themeService;
        this.commentService = commentService;
        this.instantiationService = instantiationService;
        this.container.classList.add('review-widget');
        this._register(this._commentThreadWidgets = new DisposableMap());
        this._register(this.themeService.onDidColorThemeChange(this._applyTheme, this));
        // TODO @rebornix onDidChangeLayout (font change)
        // this._register(this.notebookEditor.onDidchangeLa)
        this._applyTheme();
    }
    async initialize(element) {
        if (this.currentElement === element) {
            return;
        }
        this.currentElement = element;
        await this._updateThread();
    }
    async _createCommentTheadWidget(owner, commentThread) {
        const widgetDisposables = new DisposableStore();
        const widget = this.instantiationService.createInstance(CommentThreadWidget, this.container, this.notebookEditor, owner, this.notebookEditor.textModel.uri, this.contextKeyService, this.instantiationService, commentThread, undefined, undefined, {}, undefined, {
            actionRunner: () => {
            },
            collapse: async () => { return true; }
        });
        widgetDisposables.add(widget);
        this._commentThreadWidgets.set(commentThread.threadId, { widget, dispose: () => widgetDisposables.dispose() });
        const layoutInfo = this.notebookEditor.getLayoutInfo();
        await widget.display(layoutInfo.fontInfo.lineHeight, true);
        this._applyTheme();
        widgetDisposables.add(widget.onDidResize(() => {
            if (this.currentElement) {
                this.currentElement.commentHeight = this._calculateCommentThreadHeight(widget.getDimensions().height);
            }
        }));
    }
    _bindListeners() {
        this.cellDisposables.add(this.commentService.onDidUpdateCommentThreads(async () => this._updateThread()));
    }
    async _updateThread() {
        if (!this.currentElement) {
            return;
        }
        const infos = await this._getCommentThreadsForCell(this.currentElement);
        const widgetsToDelete = new Set(this._commentThreadWidgets.keys());
        const layoutInfo = this.currentElement.layoutInfo;
        this.container.style.top = `${layoutInfo.commentOffset}px`;
        for (const info of infos) {
            if (!info) {
                continue;
            }
            for (const thread of info.threads) {
                widgetsToDelete.delete(thread.threadId);
                const widget = this._commentThreadWidgets.get(thread.threadId)?.widget;
                if (widget) {
                    await widget.updateCommentThread(thread);
                }
                else {
                    await this._createCommentTheadWidget(info.uniqueOwner, thread);
                }
            }
        }
        for (const threadId of widgetsToDelete) {
            this._commentThreadWidgets.deleteAndDispose(threadId);
        }
        this._updateHeight();
    }
    _calculateCommentThreadHeight(bodyHeight) {
        const layoutInfo = this.notebookEditor.getLayoutInfo();
        const headHeight = Math.ceil(layoutInfo.fontInfo.lineHeight * 1.2);
        const lineHeight = layoutInfo.fontInfo.lineHeight;
        const arrowHeight = Math.round(lineHeight / 3);
        const frameThickness = Math.round(lineHeight / 9) * 2;
        const computedHeight = headHeight + bodyHeight + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */;
        return computedHeight;
    }
    _updateHeight() {
        if (!this.currentElement) {
            return;
        }
        let height = 0;
        for (const { widget } of this._commentThreadWidgets.values()) {
            height += this._calculateCommentThreadHeight(widget.getDimensions().height);
        }
        this.currentElement.commentHeight = height;
    }
    async _getCommentThreadsForCell(element) {
        if (this.notebookEditor.hasModel()) {
            return coalesce(await this.commentService.getNotebookComments(element.uri));
        }
        return [];
    }
    _applyTheme() {
        const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
        for (const { widget } of this._commentThreadWidgets.values()) {
            widget.applyTheme(fontInfo);
        }
    }
    didRenderCell(element) {
        this.initialize(element);
        this._bindListeners();
    }
    prepareLayout() {
        this._updateHeight();
    }
    updateInternalLayoutNow(element) {
        if (this.currentElement) {
            this.container.style.top = `${element.layoutInfo.commentOffset}px`;
        }
    }
};
CellComments = __decorate([
    __param(2, IContextKeyService),
    __param(3, IThemeService),
    __param(4, ICommentService),
    __param(5, IInstantiationService)
], CellComments);
export { CellComments };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbENvbW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L2NlbGxQYXJ0cy9jZWxsQ29tbWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQXdCLE1BQU0sZ0RBQWdELENBQUM7QUFDdkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRzFDLElBQU0sWUFBWSxHQUFsQixNQUFNLFlBQWEsU0FBUSxlQUFlO0lBS2hELFlBQ2tCLGNBQXVDLEVBQ3ZDLFNBQXNCLEVBQ0YsaUJBQXFDLEVBQzFDLFlBQTJCLEVBQ3pCLGNBQStCLEVBQ3pCLG9CQUEyQztRQUVuRixLQUFLLEVBQUUsQ0FBQztRQVBTLG1CQUFjLEdBQWQsY0FBYyxDQUF5QjtRQUN2QyxjQUFTLEdBQVQsU0FBUyxDQUFhO1FBQ0Ysc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUMxQyxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUN6QixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDekIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUdu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