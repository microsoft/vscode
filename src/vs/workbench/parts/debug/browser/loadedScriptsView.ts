/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TreeViewsViewletPanel, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { normalize, isAbsolute, sep } from 'vs/base/common/paths';
import { IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkbenchTree, TreeResourceNavigator } from 'vs/platform/list/browser/listService';
import { renderViewTree, twistiePixels } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { IAccessibilityProvider, ITree, IRenderer, IDataSource } from 'vs/base/parts/tree/browser/tree';
import { ISession, IDebugService, IModel, CONTEXT_LOADED_SCRIPTS_ITEM_TYPE } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { tildify } from 'vs/base/common/labels';
import { isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { ltrim } from 'vs/base/common/strings';

const SMART = true;

const $ = dom.$;

const SESSION_TEMPLATE_ID = 'session';
const SOURCE_TEMPLATE_ID = 'source';
const ROOT_FOLDER_TEMPLATE_ID = 'node';

class BaseTreeItem {

	private _id: string;
	private _children: { [key: string]: BaseTreeItem; };
	private _source: Source;

	constructor(private _parent: BaseTreeItem, private _label: string) {
		this._id = this._parent ? `${this._parent._id}/${this._label}` : this._label;
		this._children = {};
	}

	getLabel() {
		const child = this.oneChild();
		if (child) {
			const sep = this instanceof RootFolderTreeItem ? ' • ' : '/';
			return `${this._label}${sep}${child.getLabel()}`;
		}
		return this._label;
	}

	getId(): string {
		return this._id;
	}

	getTemplateId(): string {
		return SOURCE_TEMPLATE_ID;
	}

	getChildren(): TPromise<BaseTreeItem[]> {
		const child = this.oneChild();
		if (child) {
			return child.getChildren();
		}
		const array = Object.keys(this._children).map(key => this._children[key]);
		return TPromise.as(array.sort((a, b) => this.compare(a, b)));
	}

	hasChildren(): boolean {
		const child = this.oneChild();
		if (child) {
			return child.hasChildren();
		}
		return Object.keys(this._children).length > 0;
	}

	getSource() {
		const child = this.oneChild();
		if (child) {
			return child.getSource();
		}
		return this._source;
	}

	setSource(session: ISession, source: Source): void {
		this._source = source;
	}

	createIfNeeded<T extends BaseTreeItem>(key: string, factory: (parent: BaseTreeItem, label: string) => T): T {
		let child = <T>this._children[key];
		if (!child) {
			child = factory(this, key);
			this._children[key] = child;
		}
		return child;
	}

	remove(key: string): void {
		delete this._children[key];
	}

	protected compare(a: BaseTreeItem, b: BaseTreeItem): number {
		if (a._label && b._label) {
			return a._label.localeCompare(b._label);
		}
		return 0;
	}

	private oneChild(): BaseTreeItem {
		if (SMART && !(this instanceof RootTreeItem)) {
			const keys = Object.keys(this._children);
			if (keys.length === 1) {
				return this._children[keys[0]];
			}
		}
		return undefined;
	}
}

class RootFolderTreeItem extends BaseTreeItem {

	constructor(parent: BaseTreeItem, public folder: IWorkspaceFolder) {
		super(parent, folder.name);
	}

	getTemplateId(): string {
		return ROOT_FOLDER_TEMPLATE_ID;
	}
}

class RootTreeItem extends BaseTreeItem {

	private _showedMoreThanOne: boolean;

	constructor(private _debugModel: IModel, private _environmentService: IEnvironmentService, private _contextService: IWorkspaceContextService) {
		super(undefined, 'Root');
		this._showedMoreThanOne = false;
		this._debugModel.getSessions().forEach(session => {
			this.add(session);
		});
	}

	hasChildren(): boolean {
		return true;
	}

	getChildren(): TPromise<BaseTreeItem[]> {
		return super.getChildren().then(children => {
			const size = children.length;
			if (!this._showedMoreThanOne && size === 1) {
				// skip session if there is only one
				return children[0].getChildren();
			}
			this._showedMoreThanOne = size > 1;
			return children;
		});
	}

	add(session: ISession): SessionTreeItem {
		return this.createIfNeeded(session.getId(), () => new SessionTreeItem(this, session, this._environmentService, this._contextService));
	}
}

class SessionTreeItem extends BaseTreeItem {

	private static URL_REGEXP = /^(https?:\/\/[^/]+)(\/.*)$/;

	private _session: ISession;
	private _initialized: boolean;

	constructor(parent: BaseTreeItem, session: ISession, private _environmentService: IEnvironmentService, private rootProvider: IWorkspaceContextService) {
		super(parent, session.getName(true));
		this._initialized = false;
		this._session = session;
	}

	getTemplateId(): string {
		return SESSION_TEMPLATE_ID;
	}

	hasChildren(): boolean {
		return true;
	}

	getChildren(): TPromise<BaseTreeItem[]> {

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

	/**
	 * Return an ordinal number for folders
	 */
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

		let folder: IWorkspaceFolder;
		let url: string;

		let path = source.raw.path;

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
					path = normalize(ltrim(resource.path.substr(folder.uri.path.length), sep), true);
					const hasMultipleRoots = this.rootProvider.getWorkspace().folders.length > 1;
					if (hasMultipleRoots) {
						path = '/' + path;
					} else {
						// don't show root folder
						folder = undefined;
					}
				} else {
					// on unix try to tildify absolute paths
					path = normalize(path, true);
					if (!isWindows) {
						path = tildify(path, this._environmentService.userHome);
					}
				}
			}
		}

		let x: BaseTreeItem = this;
		path.split(/[\/\\]/).forEach((segment, i) => {
			if (segment.length === 0) {	// macOS or unix path
				segment = '/';
			}
			if (i === 0 && folder) {
				x = x.createIfNeeded(folder.name, parent => new RootFolderTreeItem(parent, folder));
			} else if (i === 0 && url) {
				x = x.createIfNeeded(url, parent => new BaseTreeItem(parent, url));
			} else {
				x = x.createIfNeeded(segment, parent => new BaseTreeItem(parent, segment));
			}
		});

		x.setSource(this._session, source);
	}
}

export class LoadedScriptsView extends TreeViewsViewletPanel {

	private static readonly MEMENTO = 'loadedscriptsview.memento';

	private treeContainer: HTMLElement;
	private loadedScriptsItemType: IContextKey<string>;
	private settings: any;


	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService private editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IDebugService private debugService: IDebugService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('loadedScriptsSection', "Loaded Scripts Section") }, keybindingService, contextMenuService, configurationService);
		this.settings = options.viewletSettings;
		this.loadedScriptsItemType = CONTEXT_LOADED_SCRIPTS_ITEM_TYPE.bindTo(contextKeyService);
	}

	protected renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-loaded-scripts');

		this.treeContainer = renderViewTree(container);

		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer,
			{
				dataSource: new LoadedScriptsDataSource(),
				renderer: this.instantiationService.createInstance(LoadedScriptsRenderer),
				accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
			},
			{
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'loadedScriptsAriaLabel' }, "Debug Loaded Scripts"),
				twistiePixels
			}
		);

		const callstackNavigator = new TreeResourceNavigator(this.tree);
		this.disposables.push(callstackNavigator);
		this.disposables.push(callstackNavigator.openResource(e => {

			const element = e.element;

			if (element instanceof BaseTreeItem) {
				const source = element.getSource();
				if (source && source.available) {
					const nullRange = { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 };
					source.openInEditor(this.editorService, nullRange, e.editorOptions.preserveFocus, e.sideBySide, e.editorOptions.pinned).done(undefined, errors.onUnexpectedError);
				}
			}
		}));

		this.disposables.push(this.tree.onDidChangeFocus(() => {
			const focus = this.tree.getFocus();
			if (focus instanceof SessionTreeItem) {
				this.loadedScriptsItemType.set('session');
			} else {
				this.loadedScriptsItemType.reset();
			}
		}));

		const root = new RootTreeItem(this.debugService.getModel(), this.environmentService, this.contextService);
		this.tree.setInput(root);

		let timeout: number;

		this.disposables.push(this.debugService.onDidLoadedSource(event => {
			const sessionRoot = root.add(event.session);
			sessionRoot.addPath(event.source);

			clearTimeout(timeout);
			timeout = setTimeout(() => {
				this.tree.refresh(root, true);
			}, 300);
		}));

		this.disposables.push(this.debugService.onDidEndSession(session => {
			root.remove(session.getId());
			this.tree.refresh(root, false);
		}));
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}

	public shutdown(): void {
		this.settings[LoadedScriptsView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}

// A good example of data source, renderers, action providers and accessibilty providers can be found in the callStackView.ts

class LoadedScriptsDataSource implements IDataSource {

	getId(tree: ITree, element: any): string {
		return element.getId();
	}

	hasChildren(tree: ITree, element: any): boolean {
		return element.hasChildren();
	}

	getChildren(tree: ITree, element: any): TPromise<any> {
		return element.getChildren();
	}

	getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}

	shouldAutoexpand?(tree: ITree, element: any): boolean {
		return element instanceof RootTreeItem || element instanceof SessionTreeItem;
	}
}

interface ISessionTemplateData {
	session: HTMLElement;
}

interface ISourceTemplateData {
	source: HTMLElement;
}

interface INodeTemplateData {
	node: HTMLElement;
}

class LoadedScriptsRenderer implements IRenderer {

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		return element.getTemplateId();
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {

		if (templateId === SESSION_TEMPLATE_ID) {
			let data: ISessionTemplateData = Object.create(null);
			data.session = dom.append(container, $('.session'));
			return data;
		}

		if (templateId === SOURCE_TEMPLATE_ID) {
			let data: ISourceTemplateData = Object.create(null);
			data.source = dom.append(container, $('.source'));
			return data;
		}

		let data: INodeTemplateData = Object.create(null);
		data.node = dom.append(container, $('.node'));
		return data;
	}

	renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === SESSION_TEMPLATE_ID) {
			this.renderSession(element, templateData);
		} else if (templateId === SOURCE_TEMPLATE_ID) {
			this.renderSource(element, templateData);
		} else if (templateId === ROOT_FOLDER_TEMPLATE_ID) {
			this.renderNode(element, templateData);
		}
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}

	private renderSession(session: SessionTreeItem, data: ISessionTemplateData): void {
		data.session.title = 'session';
		data.session.textContent = session.getLabel();
	}

	private renderSource(source: BaseTreeItem, data: ISourceTemplateData): void {
		data.source.title = 'source';
		data.source.textContent = source.getLabel();
	}

	private renderNode(node: BaseTreeItem, data: INodeTemplateData): void {
		data.node.title = 'node';
		data.node.textContent = node.getLabel();
	}
}

class LoadedSciptsAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		return nls.localize('implement me', "implement me");
	}
}
