/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import { append, $, prepend } from 'vs/base/browser/dom';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IAsyncDataSource, ITreeNode, ITreeRenderer, ITreeSorter } from 'vs/base/browser/ui/tree/tree';
import { DisposableStore, IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { defaultCountBadgeStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IViewPaneOptions, ViewAction, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { RepositoryRenderer } from 'vs/workbench/contrib/scm/browser/scmRepositoryRenderer';
import { ActionButtonRenderer } from 'vs/workbench/contrib/scm/browser/scmViewPane';
import { getActionViewItemProvider, isSCMActionButton, isSCMRepository, isSCMRepositoryArray } from 'vs/workbench/contrib/scm/browser/util';
import { ISCMActionButton, ISCMRepository, ISCMViewService, ISCMViewVisibleRepositoryChangeEvent, SYNC_VIEW_PANE_ID } from 'vs/workbench/contrib/scm/common/scm';
import { comparePaths } from 'vs/base/common/comparers';
import { ISCMHistoryItem, ISCMHistoryItemChange, ISCMHistoryItemGroup } from 'vs/workbench/contrib/scm/common/history';
import { localize } from 'vs/nls';
import { Iterable } from 'vs/base/common/iterator';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { basename, dirname } from 'vs/base/common/resources';
import { ILabelService } from 'vs/platform/label/common/label';
import { stripIcons } from 'vs/base/common/iconLabels';
import { FileKind } from 'vs/platform/files/common/files';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Emitter } from 'vs/base/common/event';
import { ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { IResourceNode, ResourceTree } from 'vs/base/common/resourceTree';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

type SCMHistoryItemChangeResourceTreeNode = IResourceNode<SCMHistoryItemChangeTreeElement, SCMHistoryItemTreeElement>;
type TreeElement = ISCMRepository[] | ISCMRepository | ISCMActionButton | SCMHistoryItemGroupTreeElement | SCMHistoryItemTreeElement | SCMHistoryItemChangeTreeElement | SCMHistoryItemChangeResourceTreeNode;

function isSCMHistoryItemGroupTreeElement(obj: any): obj is SCMHistoryItemGroupTreeElement {
	return (obj as SCMHistoryItemGroupTreeElement).type === 'historyItemGroup';
}

function isSCMHistoryItemTreeElement(obj: any): obj is SCMHistoryItemTreeElement {
	return (obj as SCMHistoryItemTreeElement).type === 'historyItem';
}

function isSCMHistoryItemChangeTreeElement(obj: any): obj is SCMHistoryItemChangeTreeElement {
	return (obj as SCMHistoryItemChangeTreeElement).type === 'historyItemChange';
}

function toDiffEditorArguments(uri: URI, originalUri: URI, modifiedUri: URI): unknown[] {
	const basename = path.basename(uri.fsPath);
	const originalQuery = JSON.parse(originalUri.query) as { path: string; ref: string };
	const modifiedQuery = JSON.parse(modifiedUri.query) as { path: string; ref: string };

	const originalShortRef = originalQuery.ref.substring(0, 8).concat(originalQuery.ref.endsWith('^') ? '^' : '');
	const modifiedShortRef = modifiedQuery.ref.substring(0, 8).concat(modifiedQuery.ref.endsWith('^') ? '^' : '');

	return [originalUri, modifiedUri, `${basename} (${originalShortRef}) ↔ ${basename} (${modifiedShortRef})`, null];
}

function getSCMResourceId(element: TreeElement): string {
	if (isSCMRepository(element)) {
		const provider = element.provider;
		return `repo:${provider.id}`;
	} else if (isSCMActionButton(element)) {
		const provider = element.repository.provider;
		return `actionButton:${provider.id}`;
	} else if (isSCMHistoryItemGroupTreeElement(element)) {
		const provider = element.repository.provider;
		return `historyItemGroup:${provider.id}/${element.id}`;
	} else if (isSCMHistoryItemTreeElement(element)) {
		const historyItemGroup = element.historyItemGroup;
		const provider = historyItemGroup.repository.provider;
		return `historyItem:${provider.id}/${historyItemGroup.id}/${element.id}`;
	} else if (isSCMHistoryItemChangeTreeElement(element)) {
		const historyItem = element.historyItem;
		const historyItemGroup = historyItem.historyItemGroup;
		const provider = historyItemGroup.repository.provider;
		return `historyItemChange:${provider.id}/${historyItemGroup.id}/${historyItem.id}/${element.uri.toString()}`;
	} else if (ResourceTree.isResourceNode(element)) {
		const historyItem = element.context;
		const historyItemGroup = historyItem.historyItemGroup;
		const provider = historyItemGroup.repository.provider;
		return element.childrenCount === 0 && element.element ?
			`historyItemChange:${provider.id}/${historyItemGroup.id}/${historyItem.id}/${element.element.uri.toString()}` :
			`folder:${provider.id}/${historyItemGroup.id}/${historyItem.id}/$FOLDER/${element.uri.toString()}`;
	} else {
		throw new Error('Invalid tree element');
	}
}

const enum ViewMode {
	List = 'list',
	Tree = 'tree'
}

const ContextKeys = {
	ViewMode: new RawContextKey<ViewMode>('scmSyncViewMode', ViewMode.List),
};

interface SCMHistoryItemGroupTreeElement extends ISCMHistoryItemGroup {
	readonly description?: string;
	readonly ancestor?: string;
	readonly count?: number;
	readonly repository: ISCMRepository;
	readonly type: 'historyItemGroup';
}

interface SCMHistoryItemTreeElement extends ISCMHistoryItem {
	readonly historyItemGroup: SCMHistoryItemGroupTreeElement;
	readonly type: 'historyItem';
}

interface SCMHistoryItemChangeTreeElement extends ISCMHistoryItemChange {
	readonly historyItem: SCMHistoryItemTreeElement;
	readonly type: 'historyItemChange';
}

class ListDelegate implements IListVirtualDelegate<any> {

	getHeight(element: any): number {
		if (isSCMActionButton(element)) {
			return ActionButtonRenderer.DEFAULT_HEIGHT + 10;
		} else {
			return 22;
		}
	}

	getTemplateId(element: any): string {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
		} else if (isSCMActionButton(element)) {
			return ActionButtonRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemGroupTreeElement(element)) {
			return HistoryItemGroupRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemTreeElement(element)) {
			return HistoryItemRenderer.TEMPLATE_ID;
		} else if (isSCMHistoryItemChangeTreeElement(element)) {
			return HistoryItemChangeRenderer.TEMPLATE_ID;
		} else if (ResourceTree.isResourceNode(element)) {
			return HistoryItemChangeRenderer.TEMPLATE_ID;
		} else {
			throw new Error('Invalid tree element');
		}
	}
}

class CompressionDelegate implements ITreeCompressionDelegate<TreeElement> {

	isIncompressible(element: TreeElement): boolean {
		if (ResourceTree.isResourceNode(element)) {
			return element.childrenCount === 0 || !element.parent || !element.parent.parent;
		}

		return true;
	}

}

interface HistoryItemGroupTemplate {
	readonly label: IconLabel;
	readonly count: CountBadge;
	readonly disposables: IDisposable;
}

class HistoryItemGroupRenderer implements ITreeRenderer<SCMHistoryItemGroupTreeElement, void, HistoryItemGroupTemplate> {

	static readonly TEMPLATE_ID = 'history-item-group';
	get templateId(): string { return HistoryItemGroupRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement) {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-twistie');

		const element = append(container, $('.history-item-group'));
		const label = new IconLabel(element, { supportIcons: true });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);

		return { label, count, disposables: new DisposableStore() };
	}

	renderElement(node: ITreeNode<SCMHistoryItemGroupTreeElement>, index: number, templateData: HistoryItemGroupTemplate, height: number | undefined): void {
		const historyItemGroup = node.element;
		templateData.label.setLabel(historyItemGroup.label, historyItemGroup.description);
		templateData.count.setCount(historyItemGroup.count ?? 0);
	}

	disposeTemplate(templateData: HistoryItemGroupTemplate): void {
		templateData.disposables.dispose();
	}
}

interface HistoryItemTemplate {
	readonly iconContainer: HTMLElement;
	// readonly avatarImg: HTMLImageElement;
	readonly iconLabel: IconLabel;
	// readonly timestampContainer: HTMLElement;
	// readonly timestamp: HTMLSpanElement;
	readonly disposables: IDisposable;
}

class HistoryItemRenderer implements ITreeRenderer<SCMHistoryItemTreeElement, void, HistoryItemTemplate> {

	static readonly TEMPLATE_ID = 'history-item';
	get templateId(): string { return HistoryItemRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): HistoryItemTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-twistie');

		const element = append(container, $('.history-item'));
		const iconLabel = new IconLabel(element, { supportIcons: true });

		const iconContainer = prepend(iconLabel.element, $('.icon-container'));
		// const avatarImg = append(iconContainer, $('img.avatar')) as HTMLImageElement;

		// const timestampContainer = append(iconLabel.element, $('.timestamp-container'));
		// const timestamp = append(timestampContainer, $('span.timestamp'));

		return { iconContainer, iconLabel, disposables: new DisposableStore() };
	}

	renderElement(node: ITreeNode<SCMHistoryItemTreeElement, void>, index: number, templateData: HistoryItemTemplate, height: number | undefined): void {
		const historyItem = node.element;

		templateData.iconContainer.className = 'icon-container';
		if (historyItem.icon && ThemeIcon.isThemeIcon(historyItem.icon)) {
			templateData.iconContainer.classList.add(...ThemeIcon.asClassNameArray(historyItem.icon));
		}

		// if (commit.authorAvatar) {
		// 	templateData.avatarImg.src = commit.authorAvatar;
		// 	templateData.avatarImg.style.display = 'block';
		// 	templateData.iconContainer.classList.remove(...ThemeIcon.asClassNameArray(Codicon.account));
		// } else {
		// 	templateData.avatarImg.style.display = 'none';
		// 	templateData.iconContainer.classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
		// }

		templateData.iconLabel.setLabel(historyItem.label, historyItem.description);

		// templateData.timestampContainer.classList.toggle('timestamp-duplicate', commit.hideTimestamp === true);
		// templateData.timestamp.textContent = fromNow(commit.timestamp);
	}

	disposeTemplate(templateData: HistoryItemTemplate): void {
		templateData.disposables.dispose();
	}
}

interface HistoryItemChangeTemplate {
	readonly element: HTMLElement;
	readonly name: HTMLElement;
	readonly fileLabel: IResourceLabel;
	readonly decorationIcon: HTMLElement;
	readonly disposables: IDisposable;
}

class HistoryItemChangeRenderer implements ICompressibleTreeRenderer<SCMHistoryItemChangeTreeElement | SCMHistoryItemChangeResourceTreeNode, void, HistoryItemChangeTemplate> {

	static readonly TEMPLATE_ID = 'historyItemChange';
	get templateId(): string { return HistoryItemChangeRenderer.TEMPLATE_ID; }

	constructor(
		private readonly viewMode: () => ViewMode,
		private readonly labels: ResourceLabels,
		@ILabelService private labelService: ILabelService) { }

	renderTemplate(container: HTMLElement): HistoryItemChangeTemplate {
		const element = append(container, $('.change'));
		const name = append(element, $('.name'));
		const fileLabel = this.labels.create(name, { supportDescriptionHighlights: true, supportHighlights: true });
		const decorationIcon = append(element, $('.decoration-icon'));

		return { element, name, fileLabel, decorationIcon, disposables: new DisposableStore() };
	}

	renderElement(node: ITreeNode<SCMHistoryItemChangeTreeElement | SCMHistoryItemChangeResourceTreeNode, void>, index: number, templateData: HistoryItemChangeTemplate, height: number | undefined): void {
		const historyItemChangeOrFolder = node.element;
		const uri = ResourceTree.isResourceNode(historyItemChangeOrFolder) ? historyItemChangeOrFolder.element?.uri ?? historyItemChangeOrFolder.uri : historyItemChangeOrFolder.uri;
		const fileKind = ResourceTree.isResourceNode(historyItemChangeOrFolder) && historyItemChangeOrFolder.childrenCount > 0 ? FileKind.FOLDER : FileKind.FILE;

		templateData.fileLabel.setFile(uri, {
			fileDecorations: { colors: false, badges: true },
			fileKind,
			hidePath: this.viewMode() === ViewMode.Tree,
		});
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<SCMHistoryItemChangeTreeElement | SCMHistoryItemChangeResourceTreeNode>, void>, index: number, templateData: HistoryItemChangeTemplate, height: number | undefined): void {
		const compressed = node.element as ICompressedTreeNode<SCMHistoryItemChangeResourceTreeNode>;

		const folder = compressed.elements[compressed.elements.length - 1];
		const label = compressed.elements.map(e => e.name);

		templateData.fileLabel.setResource({ resource: folder.uri, name: label }, {
			fileDecorations: { colors: false, badges: true },
			fileKind: FileKind.FOLDER,
			separator: this.labelService.getSeparator(folder.uri.scheme)
		});
	}

	disposeTemplate(templateData: HistoryItemChangeTemplate): void {
		templateData.disposables.dispose();
	}
}

class SCMSyncViewPaneAccessibilityProvider implements IListAccessibilityProvider<TreeElement> {

	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) { }

	getAriaLabel(element: TreeElement): string {
		if (isSCMRepository(element)) {
			let folderName = '';
			if (element.provider.rootUri) {
				const folder = this.workspaceContextService.getWorkspaceFolder(element.provider.rootUri);

				if (folder?.uri.toString() === element.provider.rootUri.toString()) {
					folderName = folder.name;
				} else {
					folderName = basename(element.provider.rootUri);
				}
			}
			return `${folderName} ${element.provider.label}`;
		} else if (isSCMHistoryItemGroupTreeElement(element)) {
			return `${stripIcons(element.label).trim()}${element.description ? `, ${element.description}` : ''}`;
		} else if (isSCMActionButton(element)) {
			return element.button?.command.title ?? '';
		} else if (isSCMHistoryItemTreeElement(element)) {
			return `${stripIcons(element.label).trim()}${element.description ? `, ${element.description}` : ''}`;
		} else if (isSCMHistoryItemChangeTreeElement(element)) {
			const result = [basename(element.uri)];
			const path = this.labelService.getUriLabel(dirname(element.uri), { relative: true, noPrefix: true });

			if (path) {
				result.push(path);
			}

			return result.join(', ');
		}

		return '';
	}
	getWidgetAriaLabel(): string {
		return localize('scmSync', 'Source Control Sync');
	}

}

class SCMSyncViewPaneTreeIdentityProvider implements IIdentityProvider<TreeElement> {

	getId(element: TreeElement): string {
		return getSCMResourceId(element);
	}

}

class SCMSyncViewPaneTreeSorter implements ITreeSorter<TreeElement> {

	compare(element: TreeElement, otherElement: TreeElement): number {
		// Repository
		if (isSCMRepository(element)) {
			if (!isSCMRepository(otherElement)) {
				throw new Error('Invalid comparison');
			}

			return 0;
		}

		// Action button
		if (isSCMActionButton(element)) {
			return -1;
		} else if (isSCMActionButton(otherElement)) {
			return 1;
		}

		// History item group
		if (isSCMHistoryItemGroupTreeElement(element)) {
			if (!isSCMHistoryItemGroupTreeElement(otherElement)) {
				throw new Error('Invalid comparison');
			}

			return 0;
		}

		// History item
		if (isSCMHistoryItemTreeElement(element)) {
			if (!isSCMHistoryItemTreeElement(otherElement)) {
				throw new Error('Invalid comparison');
			}

			return 0;
		}

		// History item change
		const elementPath = (element as SCMHistoryItemChangeTreeElement).uri.fsPath;
		const otherElementPath = (otherElement as SCMHistoryItemChangeTreeElement).uri.fsPath;

		return comparePaths(elementPath, otherElementPath);
	}
}

export class SCMSyncViewPane extends ViewPane {

	private listLabels!: ResourceLabels;
	private treeContainer!: HTMLElement;
	private _tree!: WorkbenchCompressibleAsyncDataTree<TreeElement, TreeElement>;

	private _viewModel!: SCMSyncPaneViewModel;
	get viewModel(): SCMSyncPaneViewModel { return this._viewModel; }

	private readonly disposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions,
		@ICommandService private commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.treeContainer = append(container, $('.scm-view.scm-sync-view'));

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.listLabels);

		this._tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
			'SCM Sync View',
			this.treeContainer,
			new ListDelegate(),
			new CompressionDelegate(),
			[
				this.instantiationService.createInstance(RepositoryRenderer, getActionViewItemProvider(this.instantiationService)),
				this.instantiationService.createInstance(ActionButtonRenderer),
				this.instantiationService.createInstance(HistoryItemGroupRenderer),
				this.instantiationService.createInstance(HistoryItemRenderer),
				this.instantiationService.createInstance(HistoryItemChangeRenderer, () => this.viewModel.mode, this.listLabels),
			],
			this.instantiationService.createInstance(SCMSyncDataSource, () => this.viewModel.mode),
			{
				compressionEnabled: true,
				horizontalScrolling: false,
				autoExpandSingleChildren: true,
				multipleSelectionSupport: false,
				collapseByDefault: (e) => !ResourceTree.isResourceNode(e),
				accessibilityProvider: this.instantiationService.createInstance(SCMSyncViewPaneAccessibilityProvider),
				identityProvider: this.instantiationService.createInstance(SCMSyncViewPaneTreeIdentityProvider),
				sorter: this.instantiationService.createInstance(SCMSyncViewPaneTreeSorter),
			}) as WorkbenchCompressibleAsyncDataTree<TreeElement, TreeElement>;

		this._register(this._tree);
		this._register(this._tree.onDidOpen(this.onDidOpen, this));

		this._viewModel = this.instantiationService.createInstance(SCMSyncPaneViewModel, this._tree);

		this.treeContainer.classList.add('file-icon-themable-tree');
		this.treeContainer.classList.add('show-file-icons');

		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
		this._register(this._viewModel.onDidChangeMode(this.onDidChangeMode, this));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._tree.layout(height, width);
	}

	private onDidChangeMode(): void {
		this.updateIndentStyles(this.themeService.getFileIconTheme());
	}

	private async onDidOpen(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		}

		if (isSCMHistoryItemChangeTreeElement(e.element)) {
			if (e.element.originalUri && e.element.modifiedUri) {
				await this.commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(e.element.uri, e.element.originalUri, e.element.modifiedUri), e);
			}
		} else if (ResourceTree.isResourceNode(e.element) && e.element.childrenCount === 0) {
			if (e.element.element?.originalUri && e.element.element?.modifiedUri) {
				await this.commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(e.element.element.uri, e.element.element.originalUri, e.element.element.modifiedUri), e);
			}
		}
	}

	private updateIndentStyles(theme: any): void {
		this.treeContainer.classList.toggle('list-view-mode', this._viewModel.mode === ViewMode.List);
		this.treeContainer.classList.toggle('tree-view-mode', this._viewModel.mode === ViewMode.Tree);
		this.treeContainer.classList.toggle('align-icons-and-twisties', (this._viewModel.mode === ViewMode.List && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
	}

	override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}

class SCMSyncPaneViewModel {

	private readonly _onDidChangeMode = new Emitter<ViewMode>();
	readonly onDidChangeMode = this._onDidChangeMode.event;

	private _mode: ViewMode;
	get mode(): ViewMode { return this._mode; }
	set mode(mode: ViewMode) {
		if (this._mode === mode) {
			return;
		}

		this._mode = mode;

		this.refresh();
		this.modeContextKey.set(mode);
		this._onDidChangeMode.fire(mode);

		this.storageService.store(`scm.syncViewMode`, mode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private modeContextKey: IContextKey<ViewMode>;
	private repositories = new Map<ISCMRepository, IDisposable>();
	private historyProviders = new Map<ISCMRepository, IDisposable>();

	private alwaysShowRepositories = false;

	private readonly disposables = new DisposableStore();

	constructor(
		private readonly tree: WorkbenchCompressibleAsyncDataTree<TreeElement, TreeElement>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISCMViewService scmViewService: ISCMViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		configurationService.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this.disposables);
		this._onDidChangeConfiguration();

		scmViewService.onDidChangeVisibleRepositories(this._onDidChangeVisibleRepositories, this, this.disposables);
		this._onDidChangeVisibleRepositories({ added: scmViewService.visibleRepositories, removed: [] });

		this._mode = this.getViewMode();

		this.modeContextKey = ContextKeys.ViewMode.bindTo(contextKeyService);
		this.modeContextKey.set(this._mode);
	}

	private _onDidChangeConfiguration(e?: IConfigurationChangeEvent): void {
		if (!e || e.affectsConfiguration('scm.alwaysShowRepositories')) {
			this.alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories');
			this.refresh();
		}
	}

	private _onDidChangeVisibleRepositories({ added, removed }: ISCMViewVisibleRepositoryChangeEvent): void {
		for (const repository of added) {
			const repositoryDisposable = repository.provider.onDidChangeHistoryProvider(() => this._onDidChangeHistoryProvider(repository));
			this._onDidChangeHistoryProvider(repository);

			this.repositories.set(repository, repositoryDisposable);
		}

		for (const repository of removed) {
			this.historyProviders.get(repository)?.dispose();
			this.historyProviders.delete(repository);

			this.repositories.get(repository)?.dispose();
			this.repositories.delete(repository);
		}

		this.refresh();
	}

	private _onDidChangeHistoryProvider(repository: ISCMRepository): void {
		if (repository.provider.historyProvider) {
			const historyProviderDisposable = combinedDisposable(
				repository.provider.historyProvider.onDidChangeActionButton(() => this.refresh(repository)),
				repository.provider.historyProvider.onDidChangeCurrentHistoryItemGroup(() => this.refresh(repository)));

			this.historyProviders.set(repository, historyProviderDisposable);
		} else {
			this.historyProviders.get(repository)?.dispose();
			this.historyProviders.delete(repository);
		}
	}

	private getViewMode(): ViewMode {
		let mode = this.configurationService.getValue<'tree' | 'list'>('scm.defaultViewMode') === 'list' ? ViewMode.List : ViewMode.Tree;
		const storageMode = this.storageService.get(`scm.syncViewMode`, StorageScope.WORKSPACE) as ViewMode;
		if (typeof storageMode === 'string') {
			mode = storageMode;
		}

		return mode;
	}

	async refresh(repository?: ISCMRepository): Promise<void> {
		if (this.repositories.size === 0) {
			return;
		}

		if (repository) {
			// Particular repository
			await this.tree.updateChildren(repository);
		} else if (this.repositories.size === 1 && !this.alwaysShowRepositories) {
			// Single repository and not always show repositories
			await this.tree.setInput(Iterable.first(this.repositories.keys())!);
		} else {
			// Expand repository nodes
			const expanded = Array.from(this.repositories.keys())
				.map(repository => `repo:${repository.provider.id}`);

			// Multiple repositories or always show repositories
			await this.tree.setInput([...this.repositories.keys()], { expanded });
		}
	}
}

class SCMSyncDataSource implements IAsyncDataSource<TreeElement, TreeElement> {

	constructor(
		private readonly viewMode: () => ViewMode,
		@IUriIdentityService private uriIdentityService: IUriIdentityService) { }

	hasChildren(element: TreeElement): boolean {
		if (isSCMRepositoryArray(element)) {
			return true;
		} else if (isSCMRepository(element)) {
			return true;
		} else if (isSCMActionButton(element)) {
			return false;
		} else if (isSCMHistoryItemGroupTreeElement(element)) {
			return true;
		} else if (isSCMHistoryItemTreeElement(element)) {
			return true;
		} else if (isSCMHistoryItemChangeTreeElement(element)) {
			return false;
		} else if (ResourceTree.isResourceNode(element)) {
			return element.childrenCount > 0;
		} else {
			throw new Error('hasChildren not implemented.');
		}
	}

	async getChildren(element: TreeElement): Promise<TreeElement[]> {
		const children: TreeElement[] = [];

		if (isSCMRepositoryArray(element)) {
			children.push(...element);
		} else if (isSCMRepository(element)) {
			const scmProvider = element.provider;
			const historyProvider = scmProvider.historyProvider;
			const historyItemGroup = historyProvider?.currentHistoryItemGroup;

			if (!historyProvider || !historyItemGroup) {
				return [];
			}

			// Action Button
			const actionButton = historyProvider.actionButton;
			if (actionButton) {
				children.push({
					type: 'actionButton',
					repository: element,
					button: actionButton
				} as ISCMActionButton);
			}

			// History item groups
			children.push(...await this.getHistoryItemGroups(element));
		} else if (isSCMHistoryItemGroupTreeElement(element)) {
			children.push(...await this.getHistoryItems(element));
		} else if (isSCMHistoryItemTreeElement(element)) {
			children.push(...await this.getHistoryItemChanges(element));
		} else if (ResourceTree.isResourceNode(element)) {
			children.push(...element.children);
		} else {
			throw new Error('getChildren Method not implemented.');
		}

		return children;
	}

	private async getHistoryItemGroups(element: ISCMRepository): Promise<SCMHistoryItemGroupTreeElement[]> {
		const scmProvider = element.provider;
		const historyProvider = scmProvider.historyProvider;
		const currentHistoryItemGroup = historyProvider?.currentHistoryItemGroup;

		if (!historyProvider || !currentHistoryItemGroup) {
			return [];
		}

		// History item group base
		const historyItemGroupBase = await historyProvider.resolveHistoryItemGroupBase(currentHistoryItemGroup.id);
		if (!historyItemGroupBase) {
			return [];
		}

		// Common ancestor, ahead, behind
		const ancestor = await historyProvider.resolveHistoryItemGroupCommonAncestor(currentHistoryItemGroup.id, historyItemGroupBase.id);

		const children: SCMHistoryItemGroupTreeElement[] = [];
		// Incoming
		if (historyItemGroupBase) {
			children.push({
				id: historyItemGroupBase.id,
				label: `$(cloud-download) ${historyItemGroupBase.label}`,
				description: localize('incoming', "Incoming Changes"),
				ancestor: ancestor?.id,
				count: ancestor?.behind ?? 0,
				repository: element,
				type: 'historyItemGroup'
			} as SCMHistoryItemGroupTreeElement);
		}

		// Outgoing
		children.push({
			id: currentHistoryItemGroup.id,
			label: `$(cloud-upload) ${currentHistoryItemGroup.label}`,
			description: localize('outgoing', "Outgoing Changes"),
			ancestor: ancestor?.id,
			count: ancestor?.ahead ?? 0,
			repository: element,
			type: 'historyItemGroup'
		} as SCMHistoryItemGroupTreeElement);

		return children;
	}

	private async getHistoryItems(element: SCMHistoryItemGroupTreeElement): Promise<SCMHistoryItemTreeElement[]> {
		const scmProvider = element.repository.provider;
		const historyProvider = scmProvider.historyProvider;

		if (!historyProvider) {
			return [];
		}

		const historyItems = await historyProvider.provideHistoryItems(element.id, { limit: { id: element.ancestor } }) ?? [];
		return historyItems.map(historyItem => ({
			id: historyItem.id,
			label: historyItem.label,
			description: historyItem.description,
			icon: historyItem.icon,
			historyItemGroup: element,
			type: 'historyItem'
		} as SCMHistoryItemTreeElement));
	}

	private async getHistoryItemChanges(element: SCMHistoryItemTreeElement): Promise<(SCMHistoryItemChangeTreeElement | SCMHistoryItemChangeResourceTreeNode)[]> {
		const repository = element.historyItemGroup.repository;
		const historyProvider = repository.provider.historyProvider;

		if (!historyProvider) {
			return [];
		}

		// History Item Changes
		const changes = await historyProvider.provideHistoryItemChanges(element.id) ?? [];

		if (this.viewMode() === ViewMode.List) {
			// List
			return changes.map(change => ({
				uri: change.uri,
				originalUri: change.originalUri,
				modifiedUri: change.modifiedUri,
				renameUri: change.renameUri,
				historyItem: element,
				type: 'historyItemChange'
			} as SCMHistoryItemChangeTreeElement));
		}

		// Tree
		const tree = new ResourceTree<SCMHistoryItemChangeTreeElement, SCMHistoryItemTreeElement>(element, repository.provider.rootUri ?? URI.file('/'), this.uriIdentityService.extUri);
		for (const change of changes) {
			tree.add(change.uri, {
				uri: change.uri,
				originalUri: change.originalUri,
				modifiedUri: change.modifiedUri,
				renameUri: change.renameUri,
				historyItem: element,
				type: 'historyItemChange'
			} as SCMHistoryItemChangeTreeElement);
		}

		return [...tree.root.children];
	}

}

class RefreshAction extends ViewAction<SCMSyncViewPane> {
	constructor() {
		super({
			id: 'workbench.scm.sync.action.refresh',
			title: localize('refresh', "Refresh"),
			viewId: SYNC_VIEW_PANE_ID,
			f1: false,
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', SYNC_VIEW_PANE_ID),
				group: 'navigation'
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMSyncViewPane): Promise<void> {
		view.viewModel.refresh();
	}
}

class SetListViewModeAction extends ViewAction<SCMSyncViewPane> {

	constructor() {
		super({
			id: 'workbench.scm.sync.action.setListViewMode',
			title: localize('setListViewMode', "View as List"),
			viewId: SYNC_VIEW_PANE_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: ContextKeys.ViewMode.isEqualTo(ViewMode.List),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', SYNC_VIEW_PANE_ID),
				group: '1_viewmode'
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMSyncViewPane): Promise<void> {
		view.viewModel.mode = ViewMode.List;
	}
}

class SetTreeViewModeAction extends ViewAction<SCMSyncViewPane>  {

	constructor() {
		super({
			id: 'workbench.scm.sync.action.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: SYNC_VIEW_PANE_ID,
			f1: false,
			icon: Codicon.listFlat,
			toggled: ContextKeys.ViewMode.isEqualTo(ViewMode.Tree),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', SYNC_VIEW_PANE_ID),
				group: '1_viewmode'
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMSyncViewPane): Promise<void> {
		view.viewModel.mode = ViewMode.Tree;
	}
}

registerAction2(RefreshAction);
registerAction2(SetListViewModeAction);
registerAction2(SetTreeViewModeAction);
