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
import { TreeFindMode } from '../../../../base/browser/ui/tree/abstractTree.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { createMatches } from '../../../../base/common/filters.js';
import { normalizeDriveLetter, tildify } from '../../../../base/common/labels.js';
import { dispose, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isAbsolute, normalize, posix } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ltrim } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { CONTEXT_LOADED_SCRIPTS_ITEM_TYPE, IDebugService, LOADED_SCRIPTS_VIEW_ID } from '../common/debug.js';
import { DebugContentProvider } from '../common/debugContentProvider.js';
import { renderViewTree } from './baseDebugView.js';
const NEW_STYLE_COMPRESS = true;
// RFC 2396, Appendix A: https://www.ietf.org/rfc/rfc2396.txt
const URI_SCHEMA_PATTERN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;
class BaseTreeItem {
    constructor(_parent, _label, isIncompressible = false) {
        this._parent = _parent;
        this._label = _label;
        this.isIncompressible = isIncompressible;
        this._children = new Map();
        this._showedMoreThanOne = false;
    }
    updateLabel(label) {
        this._label = label;
    }
    isLeaf() {
        return this._children.size === 0;
    }
    getSession() {
        if (this._parent) {
            return this._parent.getSession();
        }
        return undefined;
    }
    setSource(session, source) {
        this._source = source;
        this._children.clear();
        if (source.raw && source.raw.sources) {
            for (const src of source.raw.sources) {
                if (src.name && src.path) {
                    const s = new BaseTreeItem(this, src.name);
                    this._children.set(src.path, s);
                    const ss = session.getSource(src);
                    s.setSource(session, ss);
                }
            }
        }
    }
    createIfNeeded(key, factory) {
        let child = this._children.get(key);
        if (!child) {
            child = factory(this, key);
            this._children.set(key, child);
        }
        return child;
    }
    getChild(key) {
        return this._children.get(key);
    }
    remove(key) {
        this._children.delete(key);
    }
    removeFromParent() {
        if (this._parent) {
            this._parent.remove(this._label);
            if (this._parent._children.size === 0) {
                this._parent.removeFromParent();
            }
        }
    }
    getTemplateId() {
        return 'id';
    }
    // a dynamic ID based on the parent chain; required for reparenting (see #55448)
    getId() {
        const parent = this.getParent();
        return parent ? `${parent.getId()}/${this.getInternalId()}` : this.getInternalId();
    }
    getInternalId() {
        return this._label;
    }
    // skips intermediate single-child nodes
    getParent() {
        if (this._parent) {
            if (this._parent.isSkipped()) {
                return this._parent.getParent();
            }
            return this._parent;
        }
        return undefined;
    }
    isSkipped() {
        if (this._parent) {
            if (this._parent.oneChild()) {
                return true; // skipped if I'm the only child of my parents
            }
            return false;
        }
        return true; // roots are never skipped
    }
    // skips intermediate single-child nodes
    hasChildren() {
        const child = this.oneChild();
        if (child) {
            return child.hasChildren();
        }
        return this._children.size > 0;
    }
    // skips intermediate single-child nodes
    getChildren() {
        const child = this.oneChild();
        if (child) {
            return child.getChildren();
        }
        const array = [];
        for (const child of this._children.values()) {
            array.push(child);
        }
        return array.sort((a, b) => this.compare(a, b));
    }
    // skips intermediate single-child nodes
    getLabel(separateRootFolder = true) {
        const child = this.oneChild();
        if (child) {
            const sep = (this instanceof RootFolderTreeItem && separateRootFolder) ? ' • ' : posix.sep;
            return `${this._label}${sep}${child.getLabel()}`;
        }
        return this._label;
    }
    // skips intermediate single-child nodes
    getHoverLabel() {
        if (this._source && this._parent && this._parent._source) {
            return this._source.raw.path || this._source.raw.name;
        }
        const label = this.getLabel(false);
        const parent = this.getParent();
        if (parent) {
            const hover = parent.getHoverLabel();
            if (hover) {
                return `${hover}/${label}`;
            }
        }
        return label;
    }
    // skips intermediate single-child nodes
    getSource() {
        const child = this.oneChild();
        if (child) {
            return child.getSource();
        }
        return this._source;
    }
    compare(a, b) {
        if (a._label && b._label) {
            return a._label.localeCompare(b._label);
        }
        return 0;
    }
    oneChild() {
        if (!this._source && !this._showedMoreThanOne && this.skipOneChild()) {
            if (this._children.size === 1) {
                return this._children.values().next().value;
            }
            // if a node had more than one child once, it will never be skipped again
            if (this._children.size > 1) {
                this._showedMoreThanOne = true;
            }
        }
        return undefined;
    }
    skipOneChild() {
        if (NEW_STYLE_COMPRESS) {
            // if the root node has only one Session, don't show the session
            return this instanceof RootTreeItem;
        }
        else {
            return !(this instanceof RootFolderTreeItem) && !(this instanceof SessionTreeItem);
        }
    }
}
class RootFolderTreeItem extends BaseTreeItem {
    constructor(parent, folder) {
        super(parent, folder.name, true);
        this.folder = folder;
    }
}
class RootTreeItem extends BaseTreeItem {
    constructor(_pathService, _contextService, _labelService) {
        super(undefined, 'Root');
        this._pathService = _pathService;
        this._contextService = _contextService;
        this._labelService = _labelService;
    }
    add(session) {
        return this.createIfNeeded(session.getId(), () => new SessionTreeItem(this._labelService, this, session, this._pathService, this._contextService));
    }
    find(session) {
        return this.getChild(session.getId());
    }
}
class SessionTreeItem extends BaseTreeItem {
    static { this.URL_REGEXP = /^(https?:\/\/[^/]+)(\/.*)$/; }
    constructor(labelService, parent, session, _pathService, rootProvider) {
        super(parent, session.getLabel(), true);
        this._pathService = _pathService;
        this.rootProvider = rootProvider;
        this._map = new Map();
        this._labelService = labelService;
        this._session = session;
    }
    getInternalId() {
        return this._session.getId();
    }
    getSession() {
        return this._session;
    }
    getHoverLabel() {
        return undefined;
    }
    hasChildren() {
        return true;
    }
    compare(a, b) {
        const acat = this.category(a);
        const bcat = this.category(b);
        if (acat !== bcat) {
            return acat - bcat;
        }
        return super.compare(a, b);
    }
    category(item) {
        // workspace scripts come at the beginning in "folder" order
        if (item instanceof RootFolderTreeItem) {
            return item.folder.index;
        }
        // <...> come at the very end
        const l = item.getLabel();
        if (l && /^<.+>$/.test(l)) {
            return 1000;
        }
        // everything else in between
        return 999;
    }
    async addPath(source) {
        let folder;
        let url;
        let path = source.raw.path;
        if (!path) {
            return;
        }
        if (this._labelService && URI_SCHEMA_PATTERN.test(path)) {
            path = this._labelService.getUriLabel(URI.parse(path));
        }
        const match = SessionTreeItem.URL_REGEXP.exec(path);
        if (match && match.length === 3) {
            url = match[1];
            path = decodeURI(match[2]);
        }
        else {
            if (isAbsolute(path)) {
                const resource = URI.file(path);
                // return early if we can resolve a relative path label from the root folder
                folder = this.rootProvider ? this.rootProvider.getWorkspaceFolder(resource) : null;
                if (folder) {
                    // strip off the root folder path
                    path = normalize(ltrim(resource.path.substring(folder.uri.path.length), posix.sep));
                    const hasMultipleRoots = this.rootProvider.getWorkspace().folders.length > 1;
                    if (hasMultipleRoots) {
                        path = posix.sep + path;
                    }
                    else {
                        // don't show root folder
                        folder = null;
                    }
                }
                else {
                    // on unix try to tildify absolute paths
                    path = normalize(path);
                    if (isWindows) {
                        path = normalizeDriveLetter(path);
                    }
                    else {
                        path = tildify(path, (await this._pathService.userHome()).fsPath);
                    }
                }
            }
        }
        let leaf = this;
        path.split(/[\/\\]/).forEach((segment, i) => {
            if (i === 0 && folder) {
                const f = folder;
                leaf = leaf.createIfNeeded(folder.name, parent => new RootFolderTreeItem(parent, f));
            }
            else if (i === 0 && url) {
                leaf = leaf.createIfNeeded(url, parent => new BaseTreeItem(parent, url));
            }
            else {
                leaf = leaf.createIfNeeded(segment, parent => new BaseTreeItem(parent, segment));
            }
        });
        leaf.setSource(this._session, source);
        if (source.raw.path) {
            this._map.set(source.raw.path, leaf);
        }
    }
    removePath(source) {
        if (source.raw.path) {
            const leaf = this._map.get(source.raw.path);
            if (leaf) {
                leaf.removeFromParent();
                return true;
            }
        }
        return false;
    }
}
/**
 * This maps a model item into a view model item.
 */
function asTreeElement(item, viewState) {
    const children = item.getChildren();
    const collapsed = viewState ? !viewState.expanded.has(item.getId()) : !(item instanceof SessionTreeItem);
    return {
        element: item,
        collapsed,
        collapsible: item.hasChildren(),
        children: children.map(i => asTreeElement(i, viewState))
    };
}
let LoadedScriptsView = class LoadedScriptsView extends ViewPane {
    constructor(options, contextMenuService, keybindingService, instantiationService, viewDescriptorService, configurationService, editorService, contextKeyService, contextService, debugService, labelService, pathService, openerService, themeService, hoverService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.editorService = editorService;
        this.contextService = contextService;
        this.debugService = debugService;
        this.labelService = labelService;
        this.pathService = pathService;
        this.treeNeedsRefreshOnVisible = false;
        this.loadedScriptsItemType = CONTEXT_LOADED_SCRIPTS_ITEM_TYPE.bindTo(contextKeyService);
    }
    renderBody(container) {
        super.renderBody(container);
        this.element.classList.add('debug-pane');
        container.classList.add('debug-loaded-scripts', 'show-file-icons');
        this.treeContainer = renderViewTree(container);
        this.filter = new LoadedScriptsFilter();
        const root = new RootTreeItem(this.pathService, this.contextService, this.labelService);
        this.treeLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
        this._register(this.treeLabels);
        const onFileIconThemeChange = (fileIconTheme) => {
            this.treeContainer.classList.toggle('align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
            this.treeContainer.classList.toggle('hide-arrows', fileIconTheme.hidesExplorerArrows === true);
        };
        this._register(this.themeService.onDidFileIconThemeChange(onFileIconThemeChange));
        onFileIconThemeChange(this.themeService.getFileIconTheme());
        this.tree = this.instantiationService.createInstance((WorkbenchCompressibleObjectTree), 'LoadedScriptsView', this.treeContainer, new LoadedScriptsDelegate(), [new LoadedScriptsRenderer(this.treeLabels)], {
            compressionEnabled: NEW_STYLE_COMPRESS,
            collapseByDefault: true,
            hideTwistiesOfChildlessElements: true,
            identityProvider: {
                getId: (element) => element.getId()
            },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (element) => {
                    return element.getLabel();
                },
                getCompressedNodeKeyboardNavigationLabel: (elements) => {
                    return elements.map(e => e.getLabel()).join('/');
                }
            },
            filter: this.filter,
            accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
            overrideStyles: this.getLocationBasedColors().listOverrideStyles
        });
        const updateView = (viewState) => this.tree.setChildren(null, asTreeElement(root, viewState).children);
        updateView();
        this.changeScheduler = new RunOnceScheduler(() => {
            this.treeNeedsRefreshOnVisible = false;
            if (this.tree) {
                updateView();
            }
        }, 300);
        this._register(this.changeScheduler);
        this._register(this.tree.onDidOpen(e => {
            if (e.element instanceof BaseTreeItem) {
                const source = e.element.getSource();
                if (source && source.available) {
                    const nullRange = { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 };
                    source.openInEditor(this.editorService, nullRange, e.editorOptions.preserveFocus, e.sideBySide, e.editorOptions.pinned);
                }
            }
        }));
        this._register(this.tree.onDidChangeFocus(() => {
            const focus = this.tree.getFocus();
            if (focus instanceof SessionTreeItem) {
                this.loadedScriptsItemType.set('session');
            }
            else {
                this.loadedScriptsItemType.reset();
            }
        }));
        const scheduleRefreshOnVisible = () => {
            if (this.isBodyVisible()) {
                this.changeScheduler.schedule();
            }
            else {
                this.treeNeedsRefreshOnVisible = true;
            }
        };
        const addSourcePathsToSession = async (session) => {
            if (session.capabilities.supportsLoadedSourcesRequest) {
                const sessionNode = root.add(session);
                const paths = await session.getLoadedSources();
                for (const path of paths) {
                    await sessionNode.addPath(path);
                }
                scheduleRefreshOnVisible();
            }
        };
        // Track listeners per session to avoid leaking disposables
        const sessionListeners = this._register(new DisposableMap());
        const registerSessionListeners = (session) => {
            const store = new DisposableStore();
            sessionListeners.set(session.getId(), store);
            store.add(session.onDidChangeName(async () => {
                const sessionRoot = root.find(session);
                if (sessionRoot) {
                    sessionRoot.updateLabel(session.getLabel());
                    scheduleRefreshOnVisible();
                }
            }));
            store.add(session.onDidLoadedSource(async (event) => {
                let sessionRoot;
                switch (event.reason) {
                    case 'new':
                    case 'changed':
                        sessionRoot = root.add(session);
                        await sessionRoot.addPath(event.source);
                        scheduleRefreshOnVisible();
                        if (event.reason === 'changed') {
                            DebugContentProvider.refreshDebugContent(event.source.uri);
                        }
                        break;
                    case 'removed':
                        sessionRoot = root.find(session);
                        if (sessionRoot && sessionRoot.removePath(event.source)) {
                            scheduleRefreshOnVisible();
                        }
                        break;
                    default:
                        this.filter.setFilter(event.source.name);
                        this.tree.refilter();
                        break;
                }
            }));
        };
        this._register(this.debugService.onDidNewSession(registerSessionListeners));
        this.debugService.getModel().getSessions().forEach(registerSessionListeners);
        this._register(this.debugService.onDidEndSession(({ session }) => {
            sessionListeners.deleteAndDispose(session.getId());
            root.remove(session.getId());
            this.changeScheduler.schedule();
        }));
        this.changeScheduler.schedule(0);
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible && this.treeNeedsRefreshOnVisible) {
                this.changeScheduler.schedule();
            }
        }));
        // feature: expand all nodes when filtering (not when finding)
        let viewState;
        this._register(this.tree.onDidChangeFindPattern(pattern => {
            if (this.tree.findMode === TreeFindMode.Highlight) {
                return;
            }
            if (!viewState && pattern) {
                const expanded = new Set();
                const visit = (node) => {
                    if (node.element && !node.collapsed) {
                        expanded.add(node.element.getId());
                    }
                    for (const child of node.children) {
                        visit(child);
                    }
                };
                visit(this.tree.getNode());
                viewState = { expanded };
                this.tree.expandAll();
            }
            else if (!pattern && viewState) {
                this.tree.setFocus([]);
                updateView(viewState);
                viewState = undefined;
            }
        }));
        // populate tree model with source paths from all debug sessions
        this.debugService.getModel().getSessions().forEach(session => addSourcePathsToSession(session));
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.tree.layout(height, width);
    }
    collapseAll() {
        this.tree.collapseAll();
    }
    dispose() {
        dispose(this.tree);
        dispose(this.treeLabels);
        super.dispose();
    }
};
LoadedScriptsView = __decorate([
    __param(1, IContextMenuService),
    __param(2, IKeybindingService),
    __param(3, IInstantiationService),
    __param(4, IViewDescriptorService),
    __param(5, IConfigurationService),
    __param(6, IEditorService),
    __param(7, IContextKeyService),
    __param(8, IWorkspaceContextService),
    __param(9, IDebugService),
    __param(10, ILabelService),
    __param(11, IPathService),
    __param(12, IOpenerService),
    __param(13, IThemeService),
    __param(14, IHoverService)
], LoadedScriptsView);
export { LoadedScriptsView };
class LoadedScriptsDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId(element) {
        return LoadedScriptsRenderer.ID;
    }
}
class LoadedScriptsRenderer {
    static { this.ID = 'lsrenderer'; }
    constructor(labels) {
        this.labels = labels;
    }
    get templateId() {
        return LoadedScriptsRenderer.ID;
    }
    renderTemplate(container) {
        const label = this.labels.create(container, { supportHighlights: true });
        return { label };
    }
    renderElement(node, index, data) {
        const element = node.element;
        const label = element.getLabel();
        this.render(element, label, data, node.filterData);
    }
    renderCompressedElements(node, index, data) {
        const element = node.element.elements[node.element.elements.length - 1];
        const labels = node.element.elements.map(e => e.getLabel());
        this.render(element, labels, data, node.filterData);
    }
    render(element, labels, data, filterData) {
        const label = {
            name: labels
        };
        const options = {
            title: element.getHoverLabel()
        };
        if (element instanceof RootFolderTreeItem) {
            options.fileKind = FileKind.ROOT_FOLDER;
        }
        else if (element instanceof SessionTreeItem) {
            options.title = nls.localize('loadedScriptsSession', "Debug Session");
            options.hideIcon = true;
        }
        else if (element instanceof BaseTreeItem) {
            const src = element.getSource();
            if (src && src.uri) {
                label.resource = src.uri;
                options.fileKind = FileKind.FILE;
            }
            else {
                options.fileKind = FileKind.FOLDER;
            }
        }
        options.matches = createMatches(filterData);
        data.label.setResource(label, options);
    }
    disposeTemplate(templateData) {
        templateData.label.dispose();
    }
}
class LoadedSciptsAccessibilityProvider {
    getWidgetAriaLabel() {
        return nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'loadedScriptsAriaLabel' }, "Debug Loaded Scripts");
    }
    getAriaLabel(element) {
        if (element instanceof RootFolderTreeItem) {
            return nls.localize('loadedScriptsRootFolderAriaLabel', "Workspace folder {0}, loaded script, debug", element.getLabel());
        }
        if (element instanceof SessionTreeItem) {
            return nls.localize('loadedScriptsSessionAriaLabel', "Session {0}, loaded script, debug", element.getLabel());
        }
        if (element.hasChildren()) {
            return nls.localize('loadedScriptsFolderAriaLabel', "Folder {0}, loaded script, debug", element.getLabel());
        }
        else {
            return nls.localize('loadedScriptsSourceAriaLabel', "{0}, loaded script, debug", element.getLabel());
        }
    }
}
class LoadedScriptsFilter {
    setFilter(filterText) {
        this.filterText = filterText;
    }
    filter(element, parentVisibility) {
        if (!this.filterText) {
            return 1 /* TreeVisibility.Visible */;
        }
        if (element.isLeaf()) {
            const name = element.getLabel();
            if (name.indexOf(this.filterText) >= 0) {
                return 1 /* TreeVisibility.Visible */;
            }
            return 0 /* TreeVisibility.Hidden */;
        }
        return 2 /* TreeVisibility.Recurse */;
    }
}
registerAction2(class Collapse extends ViewAction {
    constructor() {
        super({
            id: 'loadedScripts.collapse',
            viewId: LOADED_SCRIPTS_VIEW_ID,
            title: nls.localize('collapse', "Collapse All"),
            f1: false,
            icon: Codicon.collapseAll,
            menu: {
                id: MenuId.ViewTitle,
                order: 30,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', LOADED_SCRIPTS_VIEW_ID)
            }
        });
    }
    runInView(_accessor, view) {
        view.collapseAll();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZGVkU2NyaXB0c1ZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2xvYWRlZFNjcmlwdHNWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUloRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGFBQWEsRUFBYyxNQUFNLG9DQUFvQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRixPQUFPLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFrQixhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQW9CLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUE4RCxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN4SCxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRWhGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLGFBQWEsRUFBaUIsc0JBQXNCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM1SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFcEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUM7QUFFaEMsNkRBQTZEO0FBQzdELE1BQU0sa0JBQWtCLEdBQUcsOEJBQThCLENBQUM7QUFJMUQsTUFBTSxZQUFZO0lBTWpCLFlBQW9CLE9BQWlDLEVBQVUsTUFBYyxFQUFrQixtQkFBbUIsS0FBSztRQUFuRyxZQUFPLEdBQVAsT0FBTyxDQUEwQjtRQUFVLFdBQU0sR0FBTixNQUFNLENBQVE7UUFBa0IscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFRO1FBSC9HLGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBd0IsQ0FBQztRQUluRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxXQUFXLENBQUMsS0FBYTtRQUN4QixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBRUQsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxVQUFVO1FBQ1QsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2xDLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsU0FBUyxDQUFDLE9BQXNCLEVBQUUsTUFBYztRQUMvQyxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUN0QixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3ZCLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RDLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDMUIsTUFBTSxDQUFDLEdBQUcsSUFBSSxZQUFZLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDM0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDaEMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbEMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzFCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxjQUFjLENBQXlCLEdBQVcsRUFBRSxPQUFtRDtRQUN0RyxJQUFJLEtBQUssR0FBTSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMzQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELFFBQVEsQ0FBQyxHQUFXO1FBQ25CLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVELE1BQU0sQ0FBQyxHQUFXO1FBQ2pCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzVCLENBQUM7SUFFRCxnQkFBZ0I7UUFDZixJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxhQUFhO1FBQ1osT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsZ0ZBQWdGO0lBQ2hGLEtBQUs7UUFDSixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEMsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssRUFBRSxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDcEYsQ0FBQztJQUVELGFBQWE7UUFDWixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELHdDQUF3QztJQUN4QyxTQUFTO1FBQ1IsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQ3JCLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsU0FBUztRQUNSLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO2dCQUM3QixPQUFPLElBQUksQ0FBQyxDQUFDLDhDQUE4QztZQUM1RCxDQUFDO1lBQ0QsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsQ0FBQywwQkFBMEI7SUFDeEMsQ0FBQztJQUVELHdDQUF3QztJQUN4QyxXQUFXO1FBQ1YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzlCLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUM1QixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVELHdDQUF3QztJQUN4QyxXQUFXO1FBQ1YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzlCLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUM1QixDQUFDO1FBQ0QsTUFBTSxLQUFLLEdBQW1CLEVBQUUsQ0FBQztRQUNqQyxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUM3QyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25CLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFRCx3Q0FBd0M7SUFDeEMsUUFBUSxDQUFDLGtCQUFrQixHQUFHLElBQUk7UUFDakMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzlCLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQUksWUFBWSxrQkFBa0IsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7WUFDM0YsT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxHQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQ2xELENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELHdDQUF3QztJQUN4QyxhQUFhO1FBQ1osSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDdkQsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDckMsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDWCxPQUFPLEdBQUcsS0FBSyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsd0NBQXdDO0lBQ3hDLFNBQVM7UUFDUixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDOUIsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE9BQU8sS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzFCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztJQUVTLE9BQU8sQ0FBQyxDQUFlLEVBQUUsQ0FBZTtRQUNqRCxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFCLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFDRCxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFTyxRQUFRO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUM7WUFDdEUsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDL0IsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQztZQUM3QyxDQUFDO1lBQ0QseUVBQXlFO1lBQ3pFLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sWUFBWTtRQUNuQixJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDeEIsZ0VBQWdFO1lBQ2hFLE9BQU8sSUFBSSxZQUFZLFlBQVksQ0FBQztRQUNyQyxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sQ0FBQyxDQUFDLElBQUksWUFBWSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksZUFBZSxDQUFDLENBQUM7UUFDcEYsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sa0JBQW1CLFNBQVEsWUFBWTtJQUU1QyxZQUFZLE1BQW9CLEVBQVMsTUFBd0I7UUFDaEUsS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRE8sV0FBTSxHQUFOLE1BQU0sQ0FBa0I7SUFFakUsQ0FBQztDQUNEO0FBRUQsTUFBTSxZQUFhLFNBQVEsWUFBWTtJQUV0QyxZQUFvQixZQUEwQixFQUFVLGVBQXlDLEVBQVUsYUFBNEI7UUFDdEksS0FBSyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUROLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQVUsb0JBQWUsR0FBZixlQUFlLENBQTBCO1FBQVUsa0JBQWEsR0FBYixhQUFhLENBQWU7SUFFdkksQ0FBQztJQUVELEdBQUcsQ0FBQyxPQUFzQjtRQUN6QixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0lBQ3BKLENBQUM7SUFFRCxJQUFJLENBQUMsT0FBc0I7UUFDMUIsT0FBd0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN4RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGVBQWdCLFNBQVEsWUFBWTthQUVqQixlQUFVLEdBQUcsNEJBQTRCLEFBQS9CLENBQWdDO0lBTWxFLFlBQVksWUFBMkIsRUFBRSxNQUFvQixFQUFFLE9BQXNCLEVBQVUsWUFBMEIsRUFBVSxZQUFzQztRQUN4SyxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQURzRCxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUFVLGlCQUFZLEdBQVosWUFBWSxDQUEwQjtRQUhqSyxTQUFJLEdBQUcsSUFBSSxHQUFHLEVBQXdCLENBQUM7UUFLOUMsSUFBSSxDQUFDLGFBQWEsR0FBRyxZQUFZLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDekIsQ0FBQztJQUVRLGFBQWE7UUFDckIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFUSxVQUFVO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRVEsYUFBYTtRQUNyQixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRVEsV0FBVztRQUNuQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFa0IsT0FBTyxDQUFDLENBQWUsRUFBRSxDQUFlO1FBQzFELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5QixJQUFJLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNuQixPQUFPLElBQUksR0FBRyxJQUFJLENBQUM7UUFDcEIsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVPLFFBQVEsQ0FBQyxJQUFrQjtRQUVsQyw0REFBNEQ7UUFDNUQsSUFBSSxJQUFJLFlBQVksa0JBQWtCLEVBQUUsQ0FBQztZQUN4QyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQzFCLENBQUM7UUFFRCw2QkFBNkI7UUFDN0IsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUMzQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCw2QkFBNkI7UUFDN0IsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFjO1FBRTNCLElBQUksTUFBK0IsQ0FBQztRQUNwQyxJQUFJLEdBQVcsQ0FBQztRQUVoQixJQUFJLElBQUksR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztRQUMzQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLGFBQWEsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN6RCxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLEdBQUcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZixJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVCLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFaEMsNEVBQTRFO2dCQUM1RSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUNuRixJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNaLGlDQUFpQztvQkFDakMsSUFBSSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ3BGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztvQkFDN0UsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO3dCQUN0QixJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUM7b0JBQ3pCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCx5QkFBeUI7d0JBQ3pCLE1BQU0sR0FBRyxJQUFJLENBQUM7b0JBQ2YsQ0FBQztnQkFDRixDQUFDO3FCQUFNLENBQUM7b0JBQ1Asd0NBQXdDO29CQUN4QyxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN2QixJQUFJLFNBQVMsRUFBRSxDQUFDO3dCQUNmLElBQUksR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDbkMsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ25FLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxJQUFJLEdBQWlCLElBQUksQ0FBQztRQUM5QixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUMzQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQztnQkFDakIsSUFBSSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEYsQ0FBQztpQkFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQzNCLElBQUksR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksWUFBWSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzFFLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNsRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdEMsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3RDLENBQUM7SUFDRixDQUFDO0lBRUQsVUFBVSxDQUFDLE1BQWM7UUFDeEIsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3JCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDNUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDeEIsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQzs7QUFPRjs7R0FFRztBQUNILFNBQVMsYUFBYSxDQUFDLElBQWtCLEVBQUUsU0FBc0I7SUFDaEUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksWUFBWSxlQUFlLENBQUMsQ0FBQztJQUV6RyxPQUFPO1FBQ04sT0FBTyxFQUFFLElBQUk7UUFDYixTQUFTO1FBQ1QsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUU7UUFDL0IsUUFBUSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0tBQ3hELENBQUM7QUFDSCxDQUFDO0FBRU0sSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBa0IsU0FBUSxRQUFRO0lBVTlDLFlBQ0MsT0FBNEIsRUFDUCxrQkFBdUMsRUFDeEMsaUJBQXFDLEVBQ2xDLG9CQUEyQyxFQUMxQyxxQkFBNkMsRUFDOUMsb0JBQTJDLEVBQ2xELGFBQThDLEVBQzFDLGlCQUFxQyxFQUMvQixjQUF5RCxFQUNwRSxZQUE0QyxFQUM1QyxZQUE0QyxFQUM3QyxXQUEwQyxFQUN4QyxhQUE2QixFQUM5QixZQUEyQixFQUMzQixZQUEyQjtRQUUxQyxLQUFLLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLG9CQUFvQixFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFWdEosa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBRW5CLG1CQUFjLEdBQWQsY0FBYyxDQUEwQjtRQUNuRCxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUMzQixpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUM1QixnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQWZqRCw4QkFBeUIsR0FBRyxLQUFLLENBQUM7UUFxQnpDLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxnQ0FBZ0MsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUN6RixDQUFDO0lBRWtCLFVBQVUsQ0FBQyxTQUFzQjtRQUNuRCxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTVCLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN6QyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRW5FLElBQUksQ0FBQyxhQUFhLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO1FBRXhDLE1BQU0sSUFBSSxHQUFHLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFeEYsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGNBQWMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLENBQUM7UUFDdEksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFaEMsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLGFBQTZCLEVBQUUsRUFBRTtZQUMvRCxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsYUFBYSxDQUFDLFlBQVksSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM3SCxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxtQkFBbUIsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUNoRyxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLHFCQUFxQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBRTVELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxDQUFBLCtCQUE4RCxDQUFBLEVBQ2xILG1CQUFtQixFQUNuQixJQUFJLENBQUMsYUFBYSxFQUNsQixJQUFJLHFCQUFxQixFQUFFLEVBQzNCLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsRUFDNUM7WUFDQyxrQkFBa0IsRUFBRSxrQkFBa0I7WUFDdEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QiwrQkFBK0IsRUFBRSxJQUFJO1lBQ3JDLGdCQUFnQixFQUFFO2dCQUNqQixLQUFLLEVBQUUsQ0FBQyxPQUEwQixFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFO2FBQ3REO1lBQ0QsK0JBQStCLEVBQUU7Z0JBQ2hDLDBCQUEwQixFQUFFLENBQUMsT0FBMEIsRUFBRSxFQUFFO29CQUMxRCxPQUFPLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDM0IsQ0FBQztnQkFDRCx3Q0FBd0MsRUFBRSxDQUFDLFFBQTZCLEVBQUUsRUFBRTtvQkFDM0UsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO2FBQ0Q7WUFDRCxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIscUJBQXFCLEVBQUUsSUFBSSxpQ0FBaUMsRUFBRTtZQUM5RCxjQUFjLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUMsa0JBQWtCO1NBQ2hFLENBQ0QsQ0FBQztRQUVGLE1BQU0sVUFBVSxHQUFHLENBQUMsU0FBc0IsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFcEgsVUFBVSxFQUFFLENBQUM7UUFFYixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFO1lBQ2hELElBQUksQ0FBQyx5QkFBeUIsR0FBRyxLQUFLLENBQUM7WUFDdkMsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2YsVUFBVSxFQUFFLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ1IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFckMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN0QyxJQUFJLENBQUMsQ0FBQyxPQUFPLFlBQVksWUFBWSxFQUFFLENBQUM7Z0JBQ3ZDLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3JDLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxTQUFTLEdBQUcsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0JBQ3pGLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN6SCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFO1lBQzlDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkMsSUFBSSxLQUFLLFlBQVksZUFBZSxFQUFFLENBQUM7Z0JBQ3RDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDM0MsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNwQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sd0JBQXdCLEdBQUcsR0FBRyxFQUFFO1lBQ3JDLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDakMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxJQUFJLENBQUM7WUFDdkMsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLE1BQU0sdUJBQXVCLEdBQUcsS0FBSyxFQUFFLE9BQXNCLEVBQUUsRUFBRTtZQUNoRSxJQUFJLE9BQU8sQ0FBQyxZQUFZLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztnQkFDdkQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDdEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDL0MsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDMUIsTUFBTSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNqQyxDQUFDO2dCQUNELHdCQUF3QixFQUFFLENBQUM7WUFDNUIsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLDJEQUEyRDtRQUMzRCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQTJCLENBQUMsQ0FBQztRQUV0RixNQUFNLHdCQUF3QixHQUFHLENBQUMsT0FBc0IsRUFBRSxFQUFFO1lBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7WUFDcEMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUU3QyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsS0FBSyxJQUFJLEVBQUU7Z0JBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksV0FBVyxFQUFFLENBQUM7b0JBQ2pCLFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBQzVDLHdCQUF3QixFQUFFLENBQUM7Z0JBQzVCLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0osS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFO2dCQUNqRCxJQUFJLFdBQTRCLENBQUM7Z0JBQ2pDLFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN0QixLQUFLLEtBQUssQ0FBQztvQkFDWCxLQUFLLFNBQVM7d0JBQ2IsV0FBVyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQ2hDLE1BQU0sV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQ3hDLHdCQUF3QixFQUFFLENBQUM7d0JBQzNCLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQzs0QkFDaEMsb0JBQW9CLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDNUQsQ0FBQzt3QkFDRCxNQUFNO29CQUNQLEtBQUssU0FBUzt3QkFDYixXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDakMsSUFBSSxXQUFXLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQzs0QkFDekQsd0JBQXdCLEVBQUUsQ0FBQzt3QkFDNUIsQ0FBQzt3QkFDRCxNQUFNO29CQUNQO3dCQUNDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7d0JBQ3JCLE1BQU07Z0JBQ1IsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztRQUM1RSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBRTdFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7WUFDaEUsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN2RCxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztnQkFDL0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLDhEQUE4RDtRQUM5RCxJQUFJLFNBQWlDLENBQUM7UUFDdEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ3pELElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssWUFBWSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNuRCxPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksQ0FBQyxTQUFTLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQzNCLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7Z0JBQ25DLE1BQU0sS0FBSyxHQUFHLENBQUMsSUFBZ0QsRUFBRSxFQUFFO29CQUNsRSxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7d0JBQ3JDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUNwQyxDQUFDO29CQUVELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUNuQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ2QsQ0FBQztnQkFDRixDQUFDLENBQUM7Z0JBRUYsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDM0IsU0FBUyxHQUFHLEVBQUUsUUFBUSxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdkIsQ0FBQztpQkFBTSxJQUFJLENBQUMsT0FBTyxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDdkIsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN0QixTQUFTLEdBQUcsU0FBUyxDQUFDO1lBQ3ZCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosZ0VBQWdFO1FBQ2hFLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBRWtCLFVBQVUsQ0FBQyxNQUFjLEVBQUUsS0FBYTtRQUMxRCxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELFdBQVc7UUFDVixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFUSxPQUFPO1FBQ2YsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQixPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0NBQ0QsQ0FBQTtBQTFPWSxpQkFBaUI7SUFZM0IsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxzQkFBc0IsQ0FBQTtJQUN0QixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsWUFBQSxhQUFhLENBQUE7SUFDYixZQUFBLFlBQVksQ0FBQTtJQUNaLFlBQUEsY0FBYyxDQUFBO0lBQ2QsWUFBQSxhQUFhLENBQUE7SUFDYixZQUFBLGFBQWEsQ0FBQTtHQXpCSCxpQkFBaUIsQ0EwTzdCOztBQUVELE1BQU0scUJBQXFCO0lBRTFCLFNBQVMsQ0FBQyxPQUEwQjtRQUNuQyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBMEI7UUFDdkMsT0FBTyxxQkFBcUIsQ0FBQyxFQUFFLENBQUM7SUFDakMsQ0FBQztDQUNEO0FBTUQsTUFBTSxxQkFBcUI7YUFFVixPQUFFLEdBQUcsWUFBWSxDQUFDO0lBRWxDLFlBQ1MsTUFBc0I7UUFBdEIsV0FBTSxHQUFOLE1BQU0sQ0FBZ0I7SUFFL0IsQ0FBQztJQUVELElBQUksVUFBVTtRQUNiLE9BQU8scUJBQXFCLENBQUMsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxjQUFjLENBQUMsU0FBc0I7UUFDcEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUVELGFBQWEsQ0FBQyxJQUF5QyxFQUFFLEtBQWEsRUFBRSxJQUFvQztRQUUzRyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzdCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVqQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsd0JBQXdCLENBQUMsSUFBOEQsRUFBRSxLQUFhLEVBQUUsSUFBb0M7UUFFM0ksTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRTVELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFTyxNQUFNLENBQUMsT0FBcUIsRUFBRSxNQUF5QixFQUFFLElBQW9DLEVBQUUsVUFBa0M7UUFFeEksTUFBTSxLQUFLLEdBQXdCO1lBQ2xDLElBQUksRUFBRSxNQUFNO1NBQ1osQ0FBQztRQUNGLE1BQU0sT0FBTyxHQUEwQjtZQUN0QyxLQUFLLEVBQUUsT0FBTyxDQUFDLGFBQWEsRUFBRTtTQUM5QixDQUFDO1FBRUYsSUFBSSxPQUFPLFlBQVksa0JBQWtCLEVBQUUsQ0FBQztZQUUzQyxPQUFPLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxXQUFXLENBQUM7UUFFekMsQ0FBQzthQUFNLElBQUksT0FBTyxZQUFZLGVBQWUsRUFBRSxDQUFDO1lBRS9DLE9BQU8sQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUN0RSxPQUFPLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUV6QixDQUFDO2FBQU0sSUFBSSxPQUFPLFlBQVksWUFBWSxFQUFFLENBQUM7WUFFNUMsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hDLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDcEIsS0FBSyxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO2dCQUN6QixPQUFPLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDbEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUNwQyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sQ0FBQyxPQUFPLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsZUFBZSxDQUFDLFlBQTRDO1FBQzNELFlBQVksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDOUIsQ0FBQzs7QUFHRixNQUFNLGlDQUFpQztJQUV0QyxrQkFBa0I7UUFDakIsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsOENBQThDLENBQUMsRUFBRSxHQUFHLEVBQUUsd0JBQXdCLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO0lBQzNJLENBQUM7SUFFRCxZQUFZLENBQUMsT0FBMEI7UUFFdEMsSUFBSSxPQUFPLFlBQVksa0JBQWtCLEVBQUUsQ0FBQztZQUMzQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsa0NBQWtDLEVBQUUsNENBQTRDLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0gsQ0FBQztRQUVELElBQUksT0FBTyxZQUFZLGVBQWUsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxtQ0FBbUMsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMvRyxDQUFDO1FBRUQsSUFBSSxPQUFPLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQztZQUMzQixPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsa0NBQWtDLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDN0csQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsMkJBQTJCLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdEcsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sbUJBQW1CO0lBSXhCLFNBQVMsQ0FBQyxVQUFrQjtRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUM5QixDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQXFCLEVBQUUsZ0JBQWdDO1FBRTdELElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdEIsc0NBQThCO1FBQy9CLENBQUM7UUFFRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNoQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxzQ0FBOEI7WUFDL0IsQ0FBQztZQUNELHFDQUE2QjtRQUM5QixDQUFDO1FBQ0Qsc0NBQThCO0lBQy9CLENBQUM7Q0FDRDtBQUNELGVBQWUsQ0FBQyxNQUFNLFFBQVMsU0FBUSxVQUE2QjtJQUNuRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSx3QkFBd0I7WUFDNUIsTUFBTSxFQUFFLHNCQUFzQjtZQUM5QixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDO1lBQy9DLEVBQUUsRUFBRSxLQUFLO1lBQ1QsSUFBSSxFQUFFLE9BQU8sQ0FBQyxXQUFXO1lBQ3pCLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7Z0JBQ3BCLEtBQUssRUFBRSxFQUFFO2dCQUNULEtBQUssRUFBRSxZQUFZO2dCQUNuQixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsc0JBQXNCLENBQUM7YUFDM0Q7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsU0FBUyxDQUFDLFNBQTJCLEVBQUUsSUFBdUI7UUFDN0QsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BCLENBQUM7Q0FDRCxDQUFDLENBQUMifQ==