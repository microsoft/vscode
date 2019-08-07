/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { normalize, isAbsolute, posix } from 'vs/base/common/path';
import { IViewletPanelOptions, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { renderViewTree } from 'vs/workbench/contrib/debug/browser/baseDebugView';
import { IDebugSession, IDebugService, IDebugModel, CONTEXT_LOADED_SCRIPTS_ITEM_TYPE } from 'vs/workbench/contrib/debug/common/debug';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { tildify } from 'vs/base/common/labels';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ltrim } from 'vs/base/common/strings';
import { RunOnceScheduler } from 'vs/base/common/async';
import { ResourceLabels, IResourceLabelProps, IResourceLabelOptions, IResourceLabel } from 'vs/workbench/browser/labels';
import { FileKind } from 'vs/platform/files/common/files';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, ITreeFilter, TreeVisibility, TreeFilterResult, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WorkbenchAsyncDataTree, TreeResourceNavigator2 } from 'vs/platform/list/browser/listService';
import { dispose } from 'vs/base/common/lifecycle';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { DebugContentProvider } from 'vs/workbench/contrib/debug/common/debugContentProvider';
import { ILabelService } from 'vs/platform/label/common/label';

const SMART = true;

// RFC 2396, Appendix A: https://www.ietf.org/rfc/rfc2396.txt
const URI_SCHEMA_PATTERN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;

type LoadedScriptsItem = BaseTreeItem;

class BaseTreeItem {

	private _showedMoreThanOne: boolean;
	private _children = new Map<string, BaseTreeItem>();
	private _source: Source | undefined;

	constructor(private _parent: BaseTreeItem | undefined, private _label: string) {
		this._showedMoreThanOne = false;
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
		return parent ? `${parent.getId()}/${this._label}` : this._label;
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
	getChildren(): Promise<BaseTreeItem[]> {
		const child = this.oneChild();
		if (child) {
			return child.getChildren();
		}
		const array: BaseTreeItem[] = [];
		for (let child of this._children.values()) {
			array.push(child);
		}
		return Promise.resolve(array.sort((a, b) => this.compare(a, b)));
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
		let label = this.getLabel(false);
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
		if (SMART && !this._source && !this._showedMoreThanOne && !(this instanceof RootFolderTreeItem) && !(this instanceof SessionTreeItem)) {
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
}

class RootFolderTreeItem extends BaseTreeItem {

	constructor(parent: BaseTreeItem, public folder: IWorkspaceFolder) {
		super(parent, folder.name);
	}
}

class RootTreeItem extends BaseTreeItem {

	constructor(private _debugModel: IDebugModel, private _environmentService: IEnvironmentService, private _contextService: IWorkspaceContextService, private _labelService: ILabelService) {
		super(undefined, 'Root');
		this._debugModel.getSessions().forEach(session => {
			this.add(session);
		});
	}

	add(session: IDebugSession): SessionTreeItem {
		return this.createIfNeeded(session.getId(), () => new SessionTreeItem(this._labelService, this, session, this._environmentService, this._contextService));
	}

	find(session: IDebugSession): SessionTreeItem {
		return <SessionTreeItem>this.getChild(session.getId());
	}
}

class SessionTreeItem extends BaseTreeItem {

	private static URL_REGEXP = /^(https?:\/\/[^/]+)(\/.*)$/;

	private _session: IDebugSession;
	private _initialized: boolean;
	private _map = new Map<string, BaseTreeItem>();
	private _labelService: ILabelService;

	constructor(labelService: ILabelService, parent: BaseTreeItem, session: IDebugSession, private _environmentService: IEnvironmentService, private rootProvider: IWorkspaceContextService) {
		super(parent, session.getLabel());
		this._labelService = labelService;
		this._initialized = false;
		this._session = session;
	}

	getSession(): IDebugSession {
		return this._session;
	}

	getHoverLabel(): string | undefined {
		return undefined;
	}

	hasChildren(): boolean {
		return true;
	}

	getChildren(): Promise<BaseTreeItem[]> {

		if (!this._initialized) {
			this._initialized = true;
			return this._session.getLoadedSources().then(paths => {
				paths.forEach(path => this.addPath(path));
				return super.getChildren();
			});
		}

		return super.getChildren();
	}

	protected compare(a: BaseTreeItem, b: BaseTreeItem): number {
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

	addPath(source: Source): void {

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
					path = normalize(ltrim(resource.path.substr(folder.uri.path.length), posix.sep));
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
					if (!isWindows) {
						path = tildify(path, this._environmentService.userHome);
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

export class LoadedScriptsView extends ViewletPanel {

	private treeContainer!: HTMLElement;
	private loadedScriptsItemType: IContextKey<string>;
	private tree!: WorkbenchAsyncDataTree<LoadedScriptsItem, LoadedScriptsItem, FuzzyScore>;
	private treeLabels!: ResourceLabels;
	private changeScheduler!: RunOnceScheduler;
	private treeNeedsRefreshOnVisible = false;
	private filter!: LoadedScriptsFilter;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IDebugService private readonly debugService: IDebugService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('loadedScriptsSection', "Loaded Scripts Section") }, keybindingService, contextMenuService, configurationService, contextKeyService);
		this.loadedScriptsItemType = CONTEXT_LOADED_SCRIPTS_ITEM_TYPE.bindTo(contextKeyService);
	}

	renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-loaded-scripts');
		dom.addClass(container, 'show-file-icons');

		this.treeContainer = renderViewTree(container);

		this.filter = new LoadedScriptsFilter();

		const root = new RootTreeItem(this.debugService.getModel(), this.environmentService, this.contextService, this.labelService);

		this.treeLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.treeLabels);

		this.tree = this.instantiationService.createInstance(WorkbenchAsyncDataTree, this.treeContainer, new LoadedScriptsDelegate(),
			[new LoadedScriptsRenderer(this.treeLabels)],
			new LoadedScriptsDataSource(),
			{
				identityProvider: {
					getId: (element: LoadedScriptsItem) => element.getId()
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (element: LoadedScriptsItem) => element.getLabel()
				},
				filter: this.filter,
				accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'loadedScriptsAriaLabel' }, "Debug Loaded Scripts"),
			}
		);

		this.tree.setInput(root);

		this.changeScheduler = new RunOnceScheduler(() => {
			this.treeNeedsRefreshOnVisible = false;
			if (this.tree) {
				this.tree.updateChildren();
			}
		}, 300);
		this._register(this.changeScheduler);

		const loadedScriptsNavigator = new TreeResourceNavigator2(this.tree);
		this._register(loadedScriptsNavigator);
		this._register(loadedScriptsNavigator.onDidOpenResource(e => {
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

		const registerLoadedSourceListener = (session: IDebugSession) => {
			this._register(session.onDidLoadedSource(event => {
				let sessionRoot: SessionTreeItem;
				switch (event.reason) {
					case 'new':
					case 'changed':
						sessionRoot = root.add(session);
						sessionRoot.addPath(event.source);
						if (this.isBodyVisible()) {
							this.changeScheduler.schedule();
						} else {
							this.treeNeedsRefreshOnVisible = true;
						}
						if (event.reason === 'changed') {
							DebugContentProvider.refreshDebugContent(event.source.uri);
						}
						break;
					case 'removed':
						sessionRoot = root.find(session);
						if (sessionRoot && sessionRoot.removePath(event.source)) {
							if (this.isBodyVisible()) {
								this.changeScheduler.schedule();
							} else {
								this.treeNeedsRefreshOnVisible = true;
							}
						}
						break;
					default:
						this.filter.setFilter(event.source.name);
						this.tree.refilter();
						break;
				}
			}));
		};

		this._register(this.debugService.onDidNewSession(registerLoadedSourceListener));
		this.debugService.getModel().getSessions().forEach(registerLoadedSourceListener);

		this._register(this.debugService.onDidEndSession(session => {
			root.remove(session.getId());
			this.changeScheduler.schedule();
		}));

		this.changeScheduler.schedule(0);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.treeNeedsRefreshOnVisible) {
				this.changeScheduler.schedule();
			}
		}));
	}

	layoutBody(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	dispose(): void {
		this.tree = dispose(this.tree);
		this.treeLabels = dispose(this.treeLabels);
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

class LoadedScriptsDataSource implements IAsyncDataSource<LoadedScriptsItem, LoadedScriptsItem> {

	hasChildren(element: LoadedScriptsItem): boolean {
		return element.hasChildren();
	}

	getChildren(element: LoadedScriptsItem): Promise<LoadedScriptsItem[]> {
		return element.getChildren();
	}
}

interface ILoadedScriptsItemTemplateData {
	label: IResourceLabel;
}

class LoadedScriptsRenderer implements ITreeRenderer<BaseTreeItem, FuzzyScore, ILoadedScriptsItemTemplateData> {

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

		const label: IResourceLabelProps = {
			name: element.getLabel()
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
		options.matches = createMatches(node.filterData);

		data.label.setResource(label, options);
	}

	disposeTemplate(templateData: ILoadedScriptsItemTemplateData): void {
		templateData.label.dispose();
	}
}

class LoadedSciptsAccessibilityProvider implements IAccessibilityProvider<LoadedScriptsItem> {

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
