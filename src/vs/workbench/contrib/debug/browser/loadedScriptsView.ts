/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { TreeFindMode } from '../../../../base/browser/ui/tree/abstractTree.js';
import type { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import type { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ITreeElement, ITreeFilter, ITreeNode, TreeFilterResult, TreeVisibility } from '../../../../base/browser/ui/tree/tree.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { createMatches, FuzzyScore } from '../../../../base/common/filters.js';
import { normalizeDriveLetter, tildify } from '../../../../base/common/labels.js';
import { dispose } from '../../../../base/common/lifecycle.js';
import { isAbsolute, normalize, posix } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ltrim } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IFileIconTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IResourceLabel, IResourceLabelOptions, IResourceLabelProps, ResourceLabels } from '../../../browser/labels.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { CONTEXT_LOADED_SCRIPTS_ITEM_TYPE, IDebugService, IDebugSession, LOADED_SCRIPTS_VIEW_ID } from '../common/debug.js';
import { DebugContentProvider } from '../common/debugContentProvider.js';
import { Source } from '../common/debugSource.js';
import { renderViewTree } from './baseDebugView.js';

const NEW_STYLE_COMPRESS = true;

// RFC 2396, Appendix A: https://www.ietf.org/rfc/rfc2396.txt
const URI_SCHEMA_PATTERN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;

type LoadedScriptsItem = BaseTreeItem;

class BaseTreeItem {

	private _showedMoreThanOne: boolean;
	private _children = new Map<string, BaseTreeItem>();
	private _source: Source | undefined;

	constructor(private _parent: BaseTreeItem | undefined, private _label: string, public readonly isIncompressible = false) {
		this._showedMoreThanOne = false;
	}

	updateLabel(label: string) {
		this._label = label;
	}

	isLeaf(): boolean {
		return this._children.size === 0;
	}

	getSession(): IDebugSession | undefined {
		if (this._parent) {
			return this._parent.getSession();
		}
		return undefined;
	}

	setSource(session: IDebugSession, source: Source): void {
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

	createIfNeeded<T extends BaseTreeItem>(key: string, factory: (parent: BaseTreeItem, label: string) => T): T {
		let child = <T>this._children.get(key);
		if (!child) {
			child = factory(this, key);
			this._children.set(key, child);
		}
		return child;
	}

	getChild(key: string): BaseTreeItem | undefined {
		return this._children.get(key);
	}

	remove(key: string): void {
		this._children.delete(key);
	}

	removeFromParent(): void {
		if (this._parent) {
			this._parent.remove(this._label);
			if (this._parent._children.size === 0) {
				this._parent.removeFromParent();
			}
		}
	}

	getTemplateId(): string {
		return 'id';
	}

	// a dynamic ID based on the parent chain; required for reparenting (see #55448)
	getId(): string {
		const parent = this.getParent();
		return parent ? `${parent.getId()}/${this.getInternalId()}` : this.getInternalId();
	}

	getInternalId(): string {
		return this._label;
	}

	// skips intermediate single-child nodes
	getParent(): BaseTreeItem | undefined {
		if (this._parent) {
			if (this._parent.isSkipped()) {
				return this._parent.getParent();
			}
			return this._parent;
		}
		return undefined;
	}

	isSkipped(): boolean {
		if (this._parent) {
			if (this._parent.oneChild()) {
				return true;	// skipped if I'm the only child of my parents
			}
			return false;
		}
		return true;	// roots are never skipped
	}

	// skips intermediate single-child nodes
	hasChildren(): boolean {
		const child = this.oneChild();
		if (child) {
			return child.hasChildren();
		}
		return this._children.size > 0;
	}

	// skips intermediate single-child nodes
	getChildren(): BaseTreeItem[] {
		const child = this.oneChild();
		if (child) {
			return child.getChildren();
		}
		const array: BaseTreeItem[] = [];
		for (const child of this._children.values()) {
			array.push(child);
		}
		return array.sort((a, b) => this.compare(a, b));
	}

	// skips intermediate single-child nodes
	getLabel(separateRootFolder = true): string {
		const child = this.oneChild();
		if (child) {
			const sep = (this instanceof RootFolderTreeItem && separateRootFolder) ? ' • ' : posix.sep;
			return `${this._label}${sep}${child.getLabel()}`;
		}
		return this._label;
	}

	// skips intermediate single-child nodes
	getHoverLabel(): string | undefined {
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
	getSource(): Source | undefined {
		const child = this.oneChild();
		if (child) {
			return child.getSource();
		}
		return this._source;
	}

	protected compare(a: BaseTreeItem, b: BaseTreeItem): number {
		if (a._label && b._label) {
			return a._label.localeCompare(b._label);
		}
		return 0;
	}

	private oneChild(): BaseTreeItem | undefined {
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

	private skipOneChild(): boolean {
		if (NEW_STYLE_COMPRESS) {
			// if the root node has only one Session, don't show the session
			return this instanceof RootTreeItem;
		} else {
			return !(this instanceof RootFolderTreeItem) && !(this instanceof SessionTreeItem);
		}
	}
}

class RootFolderTreeItem extends BaseTreeItem {

	constructor(parent: BaseTreeItem, public folder: IWorkspaceFolder) {
		super(parent, folder.name, true);
	}
}

class RootTreeItem extends BaseTreeItem {

	constructor(private _pathService: IPathService, private _contextService: IWorkspaceContextService, private _labelService: ILabelService) {
		super(undefined, 'Root');
	}

	add(session: IDebugSession): SessionTreeItem {
		return this.createIfNeeded(session.getId(), () => new SessionTreeItem(this._labelService, this, session, this._pathService, this._contextService));
	}

	find(session: IDebugSession): SessionTreeItem {
		return <SessionTreeItem>this.getChild(session.getId());
	}
}

class SessionTreeItem extends BaseTreeItem {

	private static readonly URL_REGEXP = /^(https?:\/\/[^/]+)(\/.*)$/;

	private _session: IDebugSession;
	private _map = new Map<string, BaseTreeItem>();
	private _labelService: ILabelService;

	constructor(labelService: ILabelService, parent: BaseTreeItem, session: IDebugSession, private _pathService: IPathService, private rootProvider: IWorkspaceContextService) {
		super(parent, session.getLabel(), true);
		this._labelService = labelService;
		this._session = session;
	}

	override getInternalId(): string {
		return this._session.getId();
	}

	override getSession(): IDebugSession {
		return this._session;
	}

	override getHoverLabel(): string | undefined {
		return undefined;
	}

	override hasChildren(): boolean {
		return true;
	}

	protected override compare(a: BaseTreeItem, b: BaseTreeItem): number {
		const acat = this.category(a);
		const bcat = this.category(b);
		if (acat !== bcat) {
			return acat - bcat;
		}
		return super.compare(a, b);
	}

	private category(item: BaseTreeItem): number {

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

	async addPath(source: Source): Promise<void> {

		let folder: IWorkspaceFolder | null;
		let url: string;

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
		} else {
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
					} else {
						// don't show root folder
						folder = null;
					}
				} else {
					// on unix try to tildify absolute paths
					path = normalize(path);
					if (isWindows) {
						path = normalizeDriveLetter(path);
					} else {
						path = tildify(path, (await this._pathService.userHome()).fsPath);
					}
				}
			}
		}

		let leaf: BaseTreeItem = this;
		path.split(/[\/\\]/).forEach((segment, i) => {
			if (i === 0 && folder) {
				const f = folder;
				leaf = leaf.createIfNeeded(folder.name, parent => new RootFolderTreeItem(parent, f));
			} else if (i === 0 && url) {
				leaf = leaf.createIfNeeded(url, parent => new BaseTreeItem(parent, url));
			} else {
				leaf = leaf.createIfNeeded(segment, parent => new BaseTreeItem(parent, segment));
			}
		});

		leaf.setSource(this._session, source);
		if (source.raw.path) {
			this._map.set(source.raw.path, leaf);
		}
	}

	removePath(source: Source): boolean {
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

interface IViewState {
	readonly expanded: Set<string>;
}

/**
 * This maps a model item into a view model item.
 */
function asTreeElement(item: BaseTreeItem, viewState?: IViewState): ITreeElement<LoadedScriptsItem> {
	const children = item.getChildren();
	const collapsed = viewState ? !viewState.expanded.has(item.getId()) : !(item instanceof SessionTreeItem);

	return {
		element: item,
		collapsed,
		collapsible: item.hasChildren(),
		children: children.map(i => asTreeElement(i, viewState))
	};
}

export class LoadedScriptsView extends ViewPane {

	private treeContainer!: HTMLElement;
	private loadedScriptsItemType: IContextKey<string>;
	private tree!: WorkbenchCompressibleObjectTree<LoadedScriptsItem, FuzzyScore>;
	private treeLabels!: ResourceLabels;
	private changeScheduler!: RunOnceScheduler;
	private treeNeedsRefreshOnVisible = false;
	private filter!: LoadedScriptsFilter;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IDebugService private readonly debugService: IDebugService,
		@ILabelService private readonly labelService: ILabelService,
		@IPathService private readonly pathService: IPathService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.loadedScriptsItemType = CONTEXT_LOADED_SCRIPTS_ITEM_TYPE.bindTo(contextKeyService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.element.classList.add('debug-pane');
		container.classList.add('debug-loaded-scripts', 'show-file-icons');

		this.treeContainer = renderViewTree(container);

		this.filter = new LoadedScriptsFilter();

		const root = new RootTreeItem(this.pathService, this.contextService, this.labelService);

		this.treeLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.treeLabels);

		const onFileIconThemeChange = (fileIconTheme: IFileIconTheme) => {
			this.treeContainer.classList.toggle('align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
			this.treeContainer.classList.toggle('hide-arrows', fileIconTheme.hidesExplorerArrows === true);
		};

		this._register(this.themeService.onDidFileIconThemeChange(onFileIconThemeChange));
		onFileIconThemeChange(this.themeService.getFileIconTheme());

		this.tree = this.instantiationService.createInstance(WorkbenchCompressibleObjectTree<LoadedScriptsItem, FuzzyScore>,
			'LoadedScriptsView',
			this.treeContainer,
			new LoadedScriptsDelegate(),
			[new LoadedScriptsRenderer(this.treeLabels)],
			{
				compressionEnabled: NEW_STYLE_COMPRESS,
				collapseByDefault: true,
				hideTwistiesOfChildlessElements: true,
				identityProvider: {
					getId: (element: LoadedScriptsItem) => element.getId()
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (element: LoadedScriptsItem) => {
						return element.getLabel();
					},
					getCompressedNodeKeyboardNavigationLabel: (elements: LoadedScriptsItem[]) => {
						return elements.map(e => e.getLabel()).join('/');
					}
				},
				filter: this.filter,
				accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			}
		);

		const updateView = (viewState?: IViewState) => this.tree.setChildren(null, asTreeElement(root, viewState).children);

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
			} else {
				this.loadedScriptsItemType.reset();
			}
		}));

		const scheduleRefreshOnVisible = () => {
			if (this.isBodyVisible()) {
				this.changeScheduler.schedule();
			} else {
				this.treeNeedsRefreshOnVisible = true;
			}
		};

		const addSourcePathsToSession = async (session: IDebugSession) => {
			if (session.capabilities.supportsLoadedSourcesRequest) {
				const sessionNode = root.add(session);
				const paths = await session.getLoadedSources();
				for (const path of paths) {
					await sessionNode.addPath(path);
				}
				scheduleRefreshOnVisible();
			}
		};

		const registerSessionListeners = (session: IDebugSession) => {
			this._register(session.onDidChangeName(async () => {
				const sessionRoot = root.find(session);
				if (sessionRoot) {
					sessionRoot.updateLabel(session.getLabel());
					scheduleRefreshOnVisible();
				}
			}));
			this._register(session.onDidLoadedSource(async event => {
				let sessionRoot: SessionTreeItem;
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
		let viewState: IViewState | undefined;
		this._register(this.tree.onDidChangeFindPattern(pattern => {
			if (this.tree.findMode === TreeFindMode.Highlight) {
				return;
			}

			if (!viewState && pattern) {
				const expanded = new Set<string>();
				const visit = (node: ITreeNode<BaseTreeItem | null, FuzzyScore>) => {
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
			} else if (!pattern && viewState) {
				this.tree.setFocus([]);
				updateView(viewState);
				viewState = undefined;
			}
		}));

		// populate tree model with source paths from all debug sessions
		this.debugService.getModel().getSessions().forEach(session => addSourcePathsToSession(session));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.layout(height, width);
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	override dispose(): void {
		dispose(this.tree);
		dispose(this.treeLabels);
		super.dispose();
	}
}

class LoadedScriptsDelegate implements IListVirtualDelegate<LoadedScriptsItem> {

	getHeight(element: LoadedScriptsItem): number {
		return 22;
	}

	getTemplateId(element: LoadedScriptsItem): string {
		return LoadedScriptsRenderer.ID;
	}
}

interface ILoadedScriptsItemTemplateData {
	label: IResourceLabel;
}

class LoadedScriptsRenderer implements ICompressibleTreeRenderer<BaseTreeItem, FuzzyScore, ILoadedScriptsItemTemplateData> {

	static readonly ID = 'lsrenderer';

	constructor(
		private labels: ResourceLabels
	) {
	}

	get templateId(): string {
		return LoadedScriptsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ILoadedScriptsItemTemplateData {
		const label = this.labels.create(container, { supportHighlights: true });
		return { label };
	}

	renderElement(node: ITreeNode<BaseTreeItem, FuzzyScore>, index: number, data: ILoadedScriptsItemTemplateData): void {

		const element = node.element;
		const label = element.getLabel();

		this.render(element, label, data, node.filterData);
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<BaseTreeItem>, FuzzyScore>, index: number, data: ILoadedScriptsItemTemplateData): void {

		const element = node.element.elements[node.element.elements.length - 1];
		const labels = node.element.elements.map(e => e.getLabel());

		this.render(element, labels, data, node.filterData);
	}

	private render(element: BaseTreeItem, labels: string | string[], data: ILoadedScriptsItemTemplateData, filterData: FuzzyScore | undefined) {

		const label: IResourceLabelProps = {
			name: labels
		};
		const options: IResourceLabelOptions = {
			title: element.getHoverLabel()
		};

		if (element instanceof RootFolderTreeItem) {

			options.fileKind = FileKind.ROOT_FOLDER;

		} else if (element instanceof SessionTreeItem) {

			options.title = nls.localize('loadedScriptsSession', "Debug Session");
			options.hideIcon = true;

		} else if (element instanceof BaseTreeItem) {

			const src = element.getSource();
			if (src && src.uri) {
				label.resource = src.uri;
				options.fileKind = FileKind.FILE;
			} else {
				options.fileKind = FileKind.FOLDER;
			}
		}
		options.matches = createMatches(filterData);

		data.label.setResource(label, options);
	}

	disposeTemplate(templateData: ILoadedScriptsItemTemplateData): void {
		templateData.label.dispose();
	}
}

class LoadedSciptsAccessibilityProvider implements IListAccessibilityProvider<LoadedScriptsItem> {

	getWidgetAriaLabel(): string {
		return nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'loadedScriptsAriaLabel' }, "Debug Loaded Scripts");
	}

	getAriaLabel(element: LoadedScriptsItem): string {

		if (element instanceof RootFolderTreeItem) {
			return nls.localize('loadedScriptsRootFolderAriaLabel', "Workspace folder {0}, loaded script, debug", element.getLabel());
		}

		if (element instanceof SessionTreeItem) {
			return nls.localize('loadedScriptsSessionAriaLabel', "Session {0}, loaded script, debug", element.getLabel());
		}

		if (element.hasChildren()) {
			return nls.localize('loadedScriptsFolderAriaLabel', "Folder {0}, loaded script, debug", element.getLabel());
		} else {
			return nls.localize('loadedScriptsSourceAriaLabel', "{0}, loaded script, debug", element.getLabel());
		}
	}
}

class LoadedScriptsFilter implements ITreeFilter<BaseTreeItem, FuzzyScore> {

	private filterText: string | undefined;

	setFilter(filterText: string) {
		this.filterText = filterText;
	}

	filter(element: BaseTreeItem, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore> {

		if (!this.filterText) {
			return TreeVisibility.Visible;
		}

		if (element.isLeaf()) {
			const name = element.getLabel();
			if (name.indexOf(this.filterText) >= 0) {
				return TreeVisibility.Visible;
			}
			return TreeVisibility.Hidden;
		}
		return TreeVisibility.Recurse;
	}
}
registerAction2(class Collapse extends ViewAction<LoadedScriptsView> {
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

	runInView(_accessor: ServicesAccessor, view: LoadedScriptsView) {
		view.collapseAll();
	}
});
