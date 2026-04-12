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
var CallHierarchyTreePeekWidget_1;
import './media/callHierarchy.css';
import * as peekView from '../../../../editor/contrib/peekView/browser/peekView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import * as callHTree from './callHierarchyTree.js';
import { localize } from '../../../../nls.js';
import { Range } from '../../../../editor/common/core/range.js';
import { SplitView, Sizing } from '../../../../base/browser/ui/splitview/splitview.js';
import { Dimension, isKeyboardEvent } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Color } from '../../../../base/common/color.js';
import { TreeMouseEventTarget } from '../../../../base/browser/ui/tree/tree.js';
import { MenuId, IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
var State;
(function (State) {
    State["Loading"] = "loading";
    State["Message"] = "message";
    State["Data"] = "data";
})(State || (State = {}));
class LayoutInfo {
    static store(info, storageService) {
        storageService.store('callHierarchyPeekLayout', JSON.stringify(info), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    static retrieve(storageService) {
        const value = storageService.get('callHierarchyPeekLayout', 0 /* StorageScope.PROFILE */, '{}');
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
class CallHierarchyTree extends WorkbenchAsyncDataTree {
}
let CallHierarchyTreePeekWidget = class CallHierarchyTreePeekWidget extends peekView.PeekViewWidget {
    static { CallHierarchyTreePeekWidget_1 = this; }
    static { this.TitleMenu = new MenuId('callhierarchy/title'); }
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
        const menu = this._menuService.createMenu(CallHierarchyTreePeekWidget_1.TitleMenu, this._contextKeyService);
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
        parent.classList.add('call-hierarchy');
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
            sorter: new callHTree.Sorter(),
            accessibilityProvider: new callHTree.AccessibilityProvider(() => this._direction),
            identityProvider: new callHTree.IdentityProvider(() => this._direction),
            expandOnlyOnTwistieClick: true,
            overrideStyles: {
                listBackground: peekView.peekViewResultsBackground
            }
        };
        this._tree = this._instantiationService.createInstance(CallHierarchyTree, 'CallHierarchyPeek', treeContainer, new callHTree.VirtualDelegate(), [this._instantiationService.createInstance(callHTree.CallRenderer)], this._instantiationService.createInstance(callHTree.DataSource, () => this._direction), options);
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
            description: 'call-hierarchy-decoration',
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
            className: 'call-decoration',
            overviewRuler: {
                color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
                position: OverviewRulerLane.Center
            },
        };
        let previewUri;
        if (this._direction === "outgoingCalls" /* CallHierarchyDirection.CallsFrom */) {
            // outgoing calls: show caller and highlight focused calls
            previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;
        }
        else {
            // incoming calls: show caller and highlight focused calls
            previewUri = element.item.uri;
        }
        const value = await this._textModelService.createModelReference(previewUri);
        this._editor.setModel(value.object.textEditorModel);
        // set decorations for caller ranges (if in the same file)
        const decorations = [];
        let fullRange;
        let locations = element.locations;
        if (!locations) {
            locations = [{ uri: element.item.uri, range: element.item.selectionRange }];
        }
        for (const loc of locations) {
            if (loc.uri.toString() === previewUri.toString()) {
                decorations.push({ range: loc.range, options });
                fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
            }
        }
        if (fullRange) {
            this._editor.revealRangeInCenter(fullRange, 1 /* ScrollType.Immediate */);
            const decorationsCollection = this._editor.createDecorationsCollection(decorations);
            this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
        }
        this._previewDisposable.add(value);
        // update: title
        const title = this._direction === "outgoingCalls" /* CallHierarchyDirection.CallsFrom */
            ? localize('callFrom', "Calls from '{0}'", element.model.root.name)
            : localize('callsTo', "Callers of '{0}'", element.model.root.name);
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
            //
            this.showMessage(this._direction === "outgoingCalls" /* CallHierarchyDirection.CallsFrom */
                ? localize('empt.callsFrom', "No calls from '{0}'", model.root.name)
                : localize('empt.callsTo', "No callers of '{0}'", model.root.name));
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
CallHierarchyTreePeekWidget = CallHierarchyTreePeekWidget_1 = __decorate([
    __param(3, IThemeService),
    __param(4, peekView.IPeekViewService),
    __param(5, IEditorService),
    __param(6, ITextModelService),
    __param(7, IStorageService),
    __param(8, IMenuService),
    __param(9, IContextKeyService),
    __param(10, IInstantiationService)
], CallHierarchyTreePeekWidget);
export { CallHierarchyTreePeekWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbEhpZXJhcmNoeVBlZWsuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jYWxsSGllcmFyY2h5L2Jyb3dzZXIvY2FsbEhpZXJhcmNoeVBlZWsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sMkJBQTJCLENBQUM7QUFDbkMsT0FBTyxLQUFLLFFBQVEsTUFBTSx5REFBeUQsQ0FBQztBQUVwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQWtDLE1BQU0sa0RBQWtELENBQUM7QUFFMUgsT0FBTyxLQUFLLFNBQVMsTUFBTSx3QkFBd0IsQ0FBQztBQUVwRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxTQUFTLEVBQWUsTUFBTSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBRXBILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUEwRSxpQkFBaUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxnQkFB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