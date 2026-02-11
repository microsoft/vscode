/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { addDisposableListener } from '../../../../../../base/browser/dom.js';
import { ITreeRenderer, ITreeNode, IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../../base/browser/ui/tree/tree.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { comparePaths } from '../../../../../../base/common/comparers.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { matchesSomeScheme, Schemas } from '../../../../../../base/common/network.js';
import { basename } from '../../../../../../base/common/path.js';
import { basenameOrAuthority, dirname, isEqual, isEqualAuthority, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenEvent, WorkbenchList, WorkbenchObjectTree } from '../../../../../../platform/list/browser/listService.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { isDark } from '../../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { SETTINGS_AUTHORITY } from '../../../../../services/preferences/common/preferences.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatResponseReferencePartStatusKind, IChatContentReference } from '../../../common/chatService/chatService.js';
import { chatEditingWidgetFileStateContextKey, IChatEditingSession } from '../../../common/editing/chatEditingService.js';
import { CHAT_EDITS_VIEW_MODE_STORAGE_KEY } from '../../chatEditing/chatEditingActions.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { CollapsibleListPool, IChatCollapsibleListItem, ICollapsibleListTemplate } from '../chatContentParts/chatReferencesContentPart.js';
import { IDisposableReference } from '../chatContentParts/chatCollections.js';

const $ = dom.$;

/**
 * Represents a folder node in the tree view.
 */
export interface IChatEditsFolderElement {
	readonly kind: 'folder';
	readonly uri: URI;
	readonly children: IChatCollapsibleListItem[];
}

/**
 * Union type for elements in the chat edits tree.
 */
export type IChatEditsTreeElement = IChatCollapsibleListItem | IChatEditsFolderElement;

/**
 * Find the common ancestor directory among a set of URIs.
 * Returns undefined if the URIs have no common ancestor (different schemes/authorities).
 */
function findCommonAncestorUri(uris: readonly URI[]): URI | undefined {
	if (uris.length === 0) {
		return undefined;
	}
	let common = uris[0];
	for (let i = 1; i < uris.length; i++) {
		while (!isEqualOrParent(uris[i], common)) {
			const parent = dirname(common);
			if (isEqual(parent, common)) {
				return undefined; // reached filesystem root
			}
			common = parent;
		}
	}
	return common;
}

/**
 * Convert a flat list of chat edits items into a tree grouped by directory.
 * Files at the common ancestor directory are shown at the root level without a folder row.
 */
export function buildEditsTree(items: readonly IChatCollapsibleListItem[]): IObjectTreeElement<IChatEditsTreeElement>[] {
	// Group files by their directory
	const folderMap = new Map<string, { uri: URI; items: IChatCollapsibleListItem[] }>();
	const itemsWithoutUri: IChatCollapsibleListItem[] = [];

	for (const item of items) {
		if (item.kind === 'reference' && URI.isUri(item.reference)) {
			const folderUri = dirname(item.reference);
			const key = folderUri.toString();
			let group = folderMap.get(key);
			if (!group) {
				group = { uri: folderUri, items: [] };
				folderMap.set(key, group);
			}
			group.items.push(item);
		} else {
			itemsWithoutUri.push(item);
		}
	}

	const result: IObjectTreeElement<IChatEditsTreeElement>[] = [];

	// Add items without URIs as top-level items (e.g., warnings)
	for (const item of itemsWithoutUri) {
		result.push({ element: item });
	}

	if (folderMap.size === 0) {
		return result;
	}

	// Find common ancestor so we can flatten files at the root level
	const folderUris = [...folderMap.values()].map(f => f.uri);
	const commonAncestor = findCommonAncestorUri(folderUris);

	// Sort folders by path
	const sortedFolders = [...folderMap.values()].sort((a, b) =>
		comparePaths(a.uri.fsPath, b.uri.fsPath)
	);

	// Emit folders first, then root-level files (matching search tree behavior)
	const rootFiles: IObjectTreeElement<IChatEditsTreeElement>[] = [];
	for (const folder of sortedFolders) {
		const isAtCommonAncestor = commonAncestor && isEqual(folder.uri, commonAncestor);
		if (isAtCommonAncestor) {
			// Files at the common ancestor go at the root level, after all folders
			for (const item of folder.items) {
				rootFiles.push({ element: item });
			}
		} else {
			const folderElement: IChatEditsFolderElement = {
				kind: 'folder',
				uri: folder.uri,
				children: folder.items,
			};
			result.push({
				element: folderElement,
				children: folder.items.map(item => ({ element: item as IChatEditsTreeElement })),
				collapsible: true,
				collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded,
			});
		}
	}

	// Root-level files come after folders
	result.push(...rootFiles);

	return result;
}

/**
 * Convert a flat list into tree elements without grouping (list mode).
 */
export function buildEditsList(items: readonly IChatCollapsibleListItem[]): IObjectTreeElement<IChatEditsTreeElement>[] {
	return items.map(item => ({ element: item as IChatEditsTreeElement }));
}

/**
 * Delegate for the chat edits tree that returns element heights and template IDs.
 */
export class ChatEditsTreeDelegate implements IListVirtualDelegate<IChatEditsTreeElement> {
	getHeight(_element: IChatEditsTreeElement): number {
		return 22;
	}

	getTemplateId(element: IChatEditsTreeElement): string {
		if (element.kind === 'folder') {
			return ChatEditsFolderRenderer.TEMPLATE_ID;
		}
		return ChatEditsFileTreeRenderer.TEMPLATE_ID;
	}
}

/**
 * Identity provider for the chat edits tree.
 * Provides stable string IDs so the tree can preserve collapse/selection state across updates.
 */
export class ChatEditsTreeIdentityProvider implements IIdentityProvider<IChatEditsTreeElement> {
	getId(element: IChatEditsTreeElement): string {
		if (element.kind === 'folder') {
			return `folder:${element.uri.toString()}`;
		}
		if (element.kind === 'warning') {
			return `warning:${element.content.value}`;
		}
		const ref = element.reference;
		if (typeof ref === 'string') {
			return `ref:${ref}`;
		} else if (URI.isUri(ref)) {
			return `file:${ref.toString()}`;
		} else {
			// eslint-disable-next-line local/code-no-in-operator
			return `file:${'uri' in ref ? ref.uri.toString() : String(ref)}`;
		}
	}
}

interface IChatEditsFolderTemplate {
	readonly label: IResourceLabel;
	readonly templateDisposables: DisposableStore;
}

/**
 * Renderer for folder elements in the chat edits tree.
 */
export class ChatEditsFolderRenderer implements ITreeRenderer<IChatEditsTreeElement, void, IChatEditsFolderTemplate> {
	static readonly TEMPLATE_ID = 'chatEditsFolderRenderer';
	readonly templateId = ChatEditsFolderRenderer.TEMPLATE_ID;

	constructor(
		private readonly labels: ResourceLabels,
		private readonly labelService: ILabelService,
	) { }

	renderTemplate(container: HTMLElement): IChatEditsFolderTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
		return { label, templateDisposables };
	}

	renderElement(node: ITreeNode<IChatEditsTreeElement, void>, _index: number, templateData: IChatEditsFolderTemplate): void {
		const element = node.element;
		if (element.kind !== 'folder') {
			return;
		}
		const relativeLabel = this.labelService.getUriLabel(element.uri, { relative: true });
		templateData.label.setResource(
			{ resource: element.uri, name: relativeLabel || basename(element.uri.path) },
			{ fileKind: FileKind.FOLDER, fileDecorations: undefined }
		);
	}

	disposeTemplate(templateData: IChatEditsFolderTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

/**
 * Tree renderer for file elements in the chat edits tree.
 * Adapted from CollapsibleListRenderer to work with ITreeNode.
 */
export class ChatEditsFileTreeRenderer implements ITreeRenderer<IChatEditsTreeElement, void, ICollapsibleListTemplate> {
	static readonly TEMPLATE_ID = 'chatEditsFileRenderer';
	readonly templateId = ChatEditsFileTreeRenderer.TEMPLATE_ID;

	constructor(
		private readonly labels: ResourceLabels,
		private readonly menuId: MenuId | undefined,
		@IThemeService private readonly themeService: IThemeService,
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): ICollapsibleListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));

		const fileDiffsContainer = $('.working-set-line-counts');
		const addedSpan = dom.$('.working-set-lines-added');
		const removedSpan = dom.$('.working-set-lines-removed');
		fileDiffsContainer.appendChild(addedSpan);
		fileDiffsContainer.appendChild(removedSpan);
		label.element.appendChild(fileDiffsContainer);

		let toolbar;
		let actionBarContainer;
		let contextKeyService;
		if (this.menuId) {
			actionBarContainer = $('.chat-collapsible-list-action-bar');
			contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
			const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
			toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, this.menuId, { menuOptions: { shouldForwardArgs: true, arg: undefined } }));
			label.element.appendChild(actionBarContainer);
		}

		return { templateDisposables, label, toolbar, actionBarContainer, contextKeyService, fileDiffsContainer, addedSpan, removedSpan };
	}

	private getReferenceIcon(data: IChatContentReference): URI | ThemeIcon | undefined {
		if (ThemeIcon.isThemeIcon(data.iconPath)) {
			return data.iconPath;
		} else {
			return isDark(this.themeService.getColorTheme().type) && data.iconPath?.dark
				? data.iconPath?.dark
				: data.iconPath?.light;
		}
	}

	renderElement(node: ITreeNode<IChatEditsTreeElement, void>, _index: number, templateData: ICollapsibleListTemplate): void {
		const data = node.element;
		if (data.kind === 'folder') {
			return;
		}

		if (data.kind === 'warning') {
			templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
			return;
		}

		const reference = data.reference;
		const icon = this.getReferenceIcon(data);
		templateData.label.element.style.display = 'flex';
		let arg: URI | undefined;
		// eslint-disable-next-line local/code-no-in-operator
		if (typeof reference === 'object' && 'variableName' in reference) {
			if (reference.value) {
				const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
				templateData.label.setResource(
					{
						resource: uri,
						name: basenameOrAuthority(uri),
						description: `#${reference.variableName}`,
						// eslint-disable-next-line local/code-no-in-operator
						range: 'range' in reference.value ? reference.value.range : undefined,
					}, { icon, title: data.options?.status?.description ?? data.title });
			} else if (reference.variableName.startsWith('kernelVariable')) {
				const variable = reference.variableName.split(':')[1];
				const asVariableName = `${variable}`;
				const label = `Kernel variable`;
				templateData.label.setLabel(label, asVariableName, { title: data.options?.status?.description });
			} else {
				templateData.label.setLabel('Unknown variable type: ' + reference.variableName);
			}
		} else if (typeof reference === 'string') {
			templateData.label.setLabel(reference, undefined, { iconPath: URI.isUri(icon) ? icon : undefined, title: data.options?.status?.description ?? data.title });
		} else {
			// eslint-disable-next-line local/code-no-in-operator
			const uri = 'uri' in reference ? reference.uri : reference;
			arg = uri;
			if (uri.scheme === 'https' && isEqualAuthority(uri.authority, 'github.com') && uri.path.includes('/tree/')) {
				templateData.label.setResource({ resource: uri, name: basename(uri.path) }, { icon: Codicon.github, title: data.title });
			} else if (uri.scheme === this.productService.urlProtocol && isEqualAuthority(uri.authority, SETTINGS_AUTHORITY)) {
				const settingId = uri.path.substring(1);
				templateData.label.setResource({ resource: uri, name: settingId }, { icon: Codicon.settingsGear, title: localize('setting.hover', "Open setting '{0}'", settingId) });
			} else if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
				templateData.label.setResource({ resource: uri, name: uri.toString(true) }, { icon: icon ?? Codicon.globe, title: data.options?.status?.description ?? data.title ?? uri.toString(true) });
			} else {
				templateData.label.setFile(uri, {
					fileKind: FileKind.FILE,
					fileDecorations: undefined,
					// eslint-disable-next-line local/code-no-in-operator
					range: 'range' in reference ? reference.range : undefined,
					title: data.options?.status?.description ?? data.title,
				});
			}
		}

		for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
			// eslint-disable-next-line no-restricted-syntax
			const element = templateData.label.element.querySelector(selector);
			if (element) {
				if (data.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted || data.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial) {
					element.classList.add('warning');
				} else {
					element.classList.remove('warning');
				}
			}
		}

		if (data.state !== undefined) {
			if (templateData.actionBarContainer) {
				const diffMeta = data?.options?.diffMeta;
				if (diffMeta) {
					if (!templateData.fileDiffsContainer || !templateData.addedSpan || !templateData.removedSpan) {
						return;
					}
					templateData.addedSpan.textContent = `+${diffMeta.added}`;
					templateData.removedSpan.textContent = `-${diffMeta.removed}`;
					templateData.fileDiffsContainer.setAttribute('aria-label', localize('chatEditingSession.fileCounts', '{0} lines added, {1} lines removed', diffMeta.added, diffMeta.removed));
				}
				// eslint-disable-next-line no-restricted-syntax
				templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.add('modified');
			}
			if (templateData.toolbar) {
				templateData.toolbar.context = arg;
			}
			if (templateData.contextKeyService) {
				chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
			}
		}
	}

	disposeTemplate(templateData: ICollapsibleListTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

/**
 * Widget that renders the chat edits file list, supporting both flat list and tree views.
 * Manages the lifecycle of the underlying tree or list widget, and handles toggling between modes.
 */
export class ChatEditsListWidget extends Disposable {
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _onDidOpen = this._register(new Emitter<IOpenEvent<IChatEditsTreeElement | undefined>>());
	readonly onDidOpen: Event<IOpenEvent<IChatEditsTreeElement | undefined>> = this._onDidOpen.event;

	private _tree: WorkbenchObjectTree<IChatEditsTreeElement> | undefined;
	private _list: IDisposableReference<WorkbenchList<IChatCollapsibleListItem>> | undefined;

	private readonly _listPool: CollapsibleListPool;
	private readonly _widgetDisposables = this._register(new DisposableStore());
	private readonly _chatEditsInTreeView: IContextKey<boolean>;

	private _currentContainer: HTMLElement | undefined;
	private _currentSession: IChatEditingSession | null = null;
	private _lastEntries: readonly IChatCollapsibleListItem[] = [];

	get currentSession(): IChatEditingSession | null {
		return this._currentSession;
	}

	get selectedElements(): URI[] {
		const edits: URI[] = [];
		if (this._tree) {
			for (const element of this._tree.getSelection()) {
				if (element && element.kind === 'reference' && URI.isUri(element.reference)) {
					edits.push(element.reference);
				}
			}
		} else if (this._list) {
			for (const element of this._list.object.getSelectedElements()) {
				if (element.kind === 'reference' && URI.isUri(element.reference)) {
					edits.push(element.reference);
				}
			}
		}
		return edits;
	}

	constructor(
		private readonly onDidChangeVisibility: Event<boolean>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService private readonly themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this._listPool = this._register(this.instantiationService.createInstance(
			CollapsibleListPool,
			this.onDidChangeVisibility,
			MenuId.ChatEditingWidgetModifiedFilesToolbar,
			{ verticalScrollMode: ScrollbarVisibility.Visible },
		));

		this._chatEditsInTreeView = ChatContextKeys.chatEditsInTreeView.bindTo(contextKeyService);
		this._chatEditsInTreeView.set(this._isTreeMode);

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, CHAT_EDITS_VIEW_MODE_STORAGE_KEY, this._store)(() => {
			const isTree = this._isTreeMode;
			this._chatEditsInTreeView.set(isTree);
			if (this._currentContainer) {
				this.create(this._currentContainer, this._currentSession);
				this.setEntries(this._lastEntries);
			}
		}));
	}

	private get _isTreeMode(): boolean {
		return this.storageService.get(CHAT_EDITS_VIEW_MODE_STORAGE_KEY, StorageScope.PROFILE, 'list') === 'tree';
	}

	/**
	 * Creates the appropriate widget (tree or list) inside the given container.
	 * Must be called before {@link setEntries}.
	 */
	create(container: HTMLElement, chatEditingSession: IChatEditingSession | null): void {
		this._currentContainer = container;
		this._currentSession = chatEditingSession;
		this.clear();
		dom.clearNode(container);

		if (this._isTreeMode) {
			this._createTree(container, chatEditingSession);
		} else {
			this._createList(container, chatEditingSession);
		}
	}

	/**
	 * Rebuild the widget (e.g. after a view mode toggle).
	 */
	rebuild(container: HTMLElement, chatEditingSession: IChatEditingSession | null): void {
		this.create(container, chatEditingSession);
	}

	/**
	 * Whether the current view mode has changed since the widget was last created.
	 */
	get needsRebuild(): boolean {
		if (this._isTreeMode) {
			return !this._tree;
		}
		return !this._list;
	}

	/**
	 * Update the displayed entries.
	 */
	setEntries(entries: readonly IChatCollapsibleListItem[]): void {
		this._lastEntries = entries;
		if (this._tree) {
			const treeElements = this._isTreeMode
				? buildEditsTree(entries)
				: buildEditsList(entries);

			// Use the file entry count for height, not the tree-expanded count,
			// so height stays consistent when toggling between tree and list modes
			const maxItemsShown = 6;
			const itemsShown = Math.min(entries.length, maxItemsShown);
			const height = itemsShown * 22;
			this._tree.layout(height);
			this._tree.getHTMLElement().style.height = `${height}px`;
			this._tree.setChildren(null, treeElements);
		} else if (this._list) {
			const maxItemsShown = 6;
			const itemsShown = Math.min(entries.length, maxItemsShown);
			const height = itemsShown * 22;
			const list = this._list.object;
			list.layout(height);
			list.getHTMLElement().style.height = `${height}px`;
			list.splice(0, list.length, entries);
		}
	}

	/**
	 * Dispose the current tree or list widget without disposing the outer widget.
	 */
	clear(): void {
		this._widgetDisposables.clear();
		this._tree = undefined;
		this._list = undefined;
	}

	private _createTree(container: HTMLElement, chatEditingSession: IChatEditingSession | null): void {
		const resourceLabels = this._widgetDisposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
		const treeContainer = dom.$('.chat-used-context-list');
		this._widgetDisposables.add(createFileIconThemableTreeContainerScope(treeContainer, this.themeService));

		const tree = this._widgetDisposables.add(this.instantiationService.createInstance(
			WorkbenchObjectTree<IChatEditsTreeElement>,
			'ChatEditsTree',
			treeContainer,
			new ChatEditsTreeDelegate(),
			[
				new ChatEditsFolderRenderer(resourceLabels, this.labelService),
				this.instantiationService.createInstance(ChatEditsFileTreeRenderer, resourceLabels, MenuId.ChatEditingWidgetModifiedFilesToolbar),
			],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IChatEditsTreeElement) => {
						if (element.kind === 'folder') {
							return this.labelService.getUriLabel(element.uri, { relative: true });
						}
						if (element.kind === 'warning') {
							return element.content.value;
						}
						const reference = element.reference;
						if (typeof reference === 'string') {
							return reference;
						} else if (URI.isUri(reference)) {
							return this.labelService.getUriBasenameLabel(reference);
							// eslint-disable-next-line local/code-no-in-operator
						} else if ('uri' in reference) {
							return this.labelService.getUriBasenameLabel(reference.uri);
						} else {
							return '';
						}
					},
					getWidgetAriaLabel: () => localize('chatEditsTree', "Changed Files"),
				},
				identityProvider: new ChatEditsTreeIdentityProvider(),
				verticalScrollMode: ScrollbarVisibility.Visible,
				hideTwistiesOfChildlessElements: true,
			}
		));

		tree.updateOptions({ enableStickyScroll: false });

		this._tree = tree;

		this._widgetDisposables.add(tree.onDidChangeFocus(() => {
			this._onDidFocus.fire();
		}));

		this._widgetDisposables.add(tree.onDidOpen(e => {
			this._onDidOpen.fire(e);
		}));

		this._widgetDisposables.add(addDisposableListener(tree.getHTMLElement(), 'click', () => {
			this._onDidFocus.fire();
		}, true));

		dom.append(container, tree.getHTMLElement());
	}

	private _createList(container: HTMLElement, chatEditingSession: IChatEditingSession | null): void {
		this._list = this._listPool.get();
		const list = this._list.object;
		this._widgetDisposables.add(this._list);

		this._widgetDisposables.add(list.onDidFocus(() => {
			this._onDidFocus.fire();
		}));

		this._widgetDisposables.add(list.onDidOpen(async (e) => {
			if (e.element) {
				this._onDidOpen.fire({
					element: e.element as IChatEditsTreeElement,
					editorOptions: e.editorOptions,
					sideBySide: e.sideBySide,
					browserEvent: e.browserEvent,
				});
			}
		}));

		this._widgetDisposables.add(addDisposableListener(list.getHTMLElement(), 'click', () => {
			this._onDidFocus.fire();
		}, true));

		dom.append(container, list.getHTMLElement());
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}
}
