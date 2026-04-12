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
var TypeHierarchyTreePeekWidget_1;
import './media/typeHierarchy.css';
import { Dimension, isKeyboardEvent } from '../../../../base/browser/dom.js';
import { Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { TreeMouseEventTarget } from '../../../../base/browser/ui/tree/tree.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { Range } from '../../../../editor/common/core/range.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import * as peekView from '../../../../editor/contrib/peekView/browser/peekView.js';
import { localize } from '../../../../nls.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService, themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import * as typeHTree from './typeHierarchyTree.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
// Todo: copied from call hierarchy, to extract
var State;
(function (State) {
    State["Loading"] = "loading";
    State["Message"] = "message";
    State["Data"] = "data";
})(State || (State = {}));
class LayoutInfo {
    static store(info, storageService) {
        storageService.store('typeHierarchyPeekLayout', JSON.stringify(info), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    static retrieve(storageService) {
        const value = storageService.get('typeHierarchyPeekLayout', 0 /* StorageScope.PROFILE */, '{}');
        const defaultInfo = { ratio: 0.7, height: 17 };
        try {
            return { ...defaultInfo, ...JSON.parse(value) };
        }
        catch {
            return defaultInfo;
        }
    }
    constructor(ratio, height) {
        this.ratio = ratio;
        this.height = height;
    }
}
class TypeHierarchyTree extends WorkbenchAsyncDataTree {
}
let TypeHierarchyTreePeekWidget = class TypeHierarchyTreePeekWidget extends peekView.PeekViewWidget {
    static { TypeHierarchyTreePeekWidget_1 = this; }
    static { this.TitleMenu = new MenuId('typehierarchy/title'); }
    constructor(editor, _where, _direction, themeService, _peekViewService, _editorService, _textModelService, _storageService, _menuService, _contextKeyService, _instantiationService) {
        super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true }, _instantiationService);
        this._where = _where;
        this._direction = _direction;
        this._peekViewService = _peekViewService;
        this._editorService = _editorService;
        this._textModelService = _textModelService;
        this._storageService = _storageService;
        this._menuService = _menuService;
        this._contextKeyService = _contextKeyService;
        this._instantiationService = _instantiationService;
        this._treeViewStates = new Map();
        this._previewDisposable = new DisposableStore();
        this.create();
        this._peekViewService.addExclusiveWidget(editor, this);
        this._applyTheme(themeService.getColorTheme());
        this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
        this._disposables.add(this._previewDisposable);
    }
    dispose() {
        LayoutInfo.store(this._layoutInfo, this._storageService);
        this._splitView.dispose();
        this._tree.dispose();
        this._editor.dispose();
        super.dispose();
    }
    get direction() {
        return this._direction;
    }
    _applyTheme(theme) {
        const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
        this.style({
            arrowColor: borderColor,
            frameColor: borderColor,
            headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
            primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
            secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
        });
    }
    _fillHead(container) {
        super._fillHead(container, true);
        const menu = this._menuService.createMenu(TypeHierarchyTreePeekWidget_1.TitleMenu, this._contextKeyService);
        const updateToolbar = () => {
            const actions = getFlatActionBarActions(menu.getActions());
            this._actionbarWidget.clear();
            this._actionbarWidget.push(actions, { label: false, icon: true });
        };
        this._disposables.add(menu);
        this._disposables.add(menu.onDidChange(updateToolbar));
        updateToolbar();
    }
    _fillBody(parent) {
        this._layoutInfo = LayoutInfo.retrieve(this._storageService);
        this._dim = new Dimension(0, 0);
        this._parent = parent;
        parent.classList.add('type-hierarchy');
        const message = document.createElement('div');
        message.classList.add('message');
        parent.appendChild(message);
        this._message = message;
        this._message.tabIndex = 0;
        const container = document.createElement('div');
        container.classList.add('results');
        parent.appendChild(container);
        this._splitView = new SplitView(container, { orientation: 1 /* Orientation.HORIZONTAL */ });
        // editor stuff
        const editorContainer = document.createElement('div');
        editorContainer.classList.add('editor');
        container.appendChild(editorContainer);
        const editorOptions = {
            scrollBeyondLastLine: false,
            scrollbar: {
                verticalScrollbarSize: 14,
                horizontal: 'auto',
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                alwaysConsumeMouseWheel: false
            },
            overviewRulerLanes: 2,
            fixedOverflowWidgets: true,
            minimap: {
                enabled: false
            }
        };
        this._editor = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, editorContainer, editorOptions, {}, this.editor);
        // tree stuff
        const treeContainer = document.createElement('div');
        treeContainer.classList.add('tree');
        container.appendChild(treeContainer);
        const options = {
            sorter: new typeHTree.Sorter(),
            accessibilityProvider: new typeHTree.AccessibilityProvider(() => this._direction),
            identityProvider: new typeHTree.IdentityProvider(() => this._direction),
            expandOnlyOnTwistieClick: true,
            overrideStyles: {
                listBackground: peekView.peekViewResultsBackground
            }
        };
        this._tree = this._instantiationService.createInstance(TypeHierarchyTree, 'TypeHierarchyPeek', treeContainer, new typeHTree.VirtualDelegate(), [this._instantiationService.createInstance(typeHTree.TypeRenderer)], this._instantiationService.createInstance(typeHTree.DataSource, () => this._direction), options);
        // split stuff
        this._splitView.addView({
            onDidChange: Event.None,
            element: editorContainer,
            minimumSize: 200,
            maximumSize: Number.MAX_VALUE,
            layout: (width) => {
                if (this._dim.height) {
                    this._editor.layout({ height: this._dim.height, width });
                }
            }
        }, Sizing.Distribute);
        this._splitView.addView({
            onDidChange: Event.None,
            element: treeContainer,
            minimumSize: 100,
            maximumSize: Number.MAX_VALUE,
            layout: (width) => {
                if (this._dim.height) {
                    this._tree.layout(this._dim.height, width);
                }
            }
        }, Sizing.Distribute);
        this._disposables.add(this._splitView.onDidSashChange(() => {
            if (this._dim.width) {
                this._layoutInfo.ratio = this._splitView.getViewSize(0) / this._dim.width;
            }
        }));
        // update editor
        this._disposables.add(this._tree.onDidChangeFocus(this._updatePreview, this));
        this._disposables.add(this._editor.onMouseDown(e => {
            const { event, target } = e;
            if (event.detail !== 2) {
                return;
            }
            const [focus] = this._tree.getFocus();
            if (!focus) {
                return;
            }
            this.dispose();
            this._editorService.openEditor({
                resource: focus.item.uri,
                options: { selection: target.range }
            });
        }));
        this._disposables.add(this._tree.onMouseDblClick(e => {
            if (e.target === TreeMouseEventTarget.Twistie) {
                return;
            }
            if (e.element) {
                this.dispose();
                this._editorService.openEditor({
                    resource: e.element.item.uri,
                    options: { selection: e.element.item.selectionRange, pinned: true }
                });
            }
        }));
        this._disposables.add(this._tree.onDidChangeSelection(e => {
            const [element] = e.elements;
            // don't close on click
            if (element && isKeyboardEvent(e.browserEvent)) {
                this.dispose();
                this._editorService.openEditor({
                    resource: element.item.uri,
                    options: { selection: element.item.selectionRange, pinned: true }
                });
            }
        }));
    }
    async _updatePreview() {
        const [element] = this._tree.getFocus();
        if (!element) {
            return;
        }
        this._previewDisposable.clear();
        // update: editor and editor highlights
        const options = {
            description: 'type-hierarchy-decoration',
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
            className: 'type-decoration',
            overviewRuler: {
                color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
                position: OverviewRulerLane.Center
            },
        };
        let previewUri;
        if (this._direction === "supertypes" /* TypeHierarchyDirection.Supertypes */) {
            // supertypes: show super types and highlight focused type
            previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;
        }
        else {
            // subtypes: show sub types and highlight focused type
            previewUri = element.item.uri;
        }
        const value = await this._textModelService.createModelReference(previewUri);
        this._editor.setModel(value.object.textEditorModel);
        // set decorations for type ranges
        const decorations = [];
        let fullRange;
        const loc = { uri: element.item.uri, range: element.item.selectionRange };
        if (loc.uri.toString() === previewUri.toString()) {
            decorations.push({ range: loc.range, options });
            fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
        }
        if (fullRange) {
            this._editor.revealRangeInCenter(fullRange, 1 /* ScrollType.Immediate */);
            const decorationsCollection = this._editor.createDecorationsCollection(decorations);
            this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
        }
        this._previewDisposable.add(value);
        // update: title
        const title = this._direction === "supertypes" /* TypeHierarchyDirection.Supertypes */
            ? localize('supertypes', "Supertypes of '{0}'", element.model.root.name)
            : localize('subtypes', "Subtypes of '{0}'", element.model.root.name);
        this.setTitle(title);
    }
    showLoading() {
        this._parent.dataset['state'] = "loading" /* State.Loading */;
        this.setTitle(localize('title.loading', "Loading..."));
        this._show();
    }
    showMessage(message) {
        this._parent.dataset['state'] = "message" /* State.Message */;
        this.setTitle('');
        this.setMetaTitle('');
        this._message.innerText = message;
        this._show();
        this._message.focus();
    }
    async showModel(model) {
        this._show();
        const viewState = this._treeViewStates.get(this._direction);
        await this._tree.setInput(model, viewState);
        const root = this._tree.getNode(model).children[0];
        await this._tree.expand(root.element);
        if (root.children.length === 0) {
            this.showMessage(this._direction === "supertypes" /* TypeHierarchyDirection.Supertypes */
                ? localize('empt.supertypes', "No supertypes of '{0}'", model.root.name)
                : localize('empt.subtypes', "No subtypes of '{0}'", model.root.name));
        }
        else {
            this._parent.dataset['state'] = "data" /* State.Data */;
            if (!viewState || this._tree.getFocus().length === 0) {
                this._tree.setFocus([root.children[0].element]);
            }
            this._tree.domFocus();
            this._updatePreview();
        }
    }
    getModel() {
        return this._tree.getInput();
    }
    getFocused() {
        return this._tree.getFocus()[0];
    }
    async updateDirection(newDirection) {
        const model = this._tree.getInput();
        if (model && newDirection !== this._direction) {
            this._treeViewStates.set(this._direction, this._tree.getViewState());
            this._direction = newDirection;
            await this.showModel(model);
        }
    }
    _show() {
        if (!this._isShowing) {
            this.editor.revealLineInCenterIfOutsideViewport(this._where.lineNumber, 0 /* ScrollType.Smooth */);
            super.show(Range.fromPositions(this._where), this._layoutInfo.height);
        }
    }
    _onWidth(width) {
        if (this._dim) {
            this._doLayoutBody(this._dim.height, width);
        }
    }
    _doLayoutBody(height, width) {
        if (this._dim.height !== height || this._dim.width !== width) {
            super._doLayoutBody(height, width);
            this._dim = new Dimension(width, height);
            this._layoutInfo.height = this._viewZone ? this._viewZone.heightInLines : this._layoutInfo.height;
            this._splitView.layout(width);
            this._splitView.resizeView(0, width * this._layoutInfo.ratio);
        }
    }
};
TypeHierarchyTreePeekWidget = TypeHierarchyTreePeekWidget_1 = __decorate([
    __param(3, IThemeService),
    __param(4, peekView.IPeekViewService),
    __param(5, IEditorService),
    __param(6, ITextModelService),
    __param(7, IStorageService),
    __param(8, IMenuService),
    __param(9, IContextKeyService),
    __param(10, IInstantiationService)
], TypeHierarchyTreePeekWidget);
export { TypeHierarchyTreePeekWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZUhpZXJhcmNoeVBlZWsuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90eXBlSGllcmFyY2h5L2Jyb3dzZXIvdHlwZUhpZXJhcmNoeVBlZWsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sMkJBQTJCLENBQUM7QUFDbkMsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RSxPQUFPLEVBQWUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRXBHLE9BQU8sRUFBYSxvQkFBb0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdyRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUdwSCxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFeEUsT0FBTyxFQUEwRSxpQkFBaUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sS0FBSyxRQUFRLE1BQU0seURBQXlELENBQUM7QUFDcEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdEYs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