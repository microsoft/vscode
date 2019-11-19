/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scmViewlet';
import { Event, Emitter } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { basename, isEqual } from 'vs/base/common/resources';
import { IDisposable, Disposable, DisposableStore, combinedDisposable } from 'vs/base/common/lifecycle';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus, removeClass } from 'vs/base/browser/dom';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ISCMRepository, ISCMResourceGroup, ISCMResource, InputValidationType } from 'vs/workbench/contrib/scm/common/scm';
import { ResourceLabels, IResourceLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction, IMenuService } from 'vs/platform/actions/common/actions';
import { IAction, IActionViewItem, ActionRunner, Action } from 'vs/base/common/actions';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { SCMMenus } from './menus';
import { ActionBar, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isSCMResource, isSCMResourceGroup, connectPrimaryMenuToInlineActionBar } from './util';
import { attachBadgeStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { format } from 'vs/base/common/strings';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ThrottledDelayer, disposableTimeout } from 'vs/base/common/async';
import { INotificationService } from 'vs/platform/notification/common/notification';
import * as platform from 'vs/base/common/platform';
import { ITreeNode, ITreeFilter, ITreeSorter, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { ResourceTree, IResourceNode } from 'vs/base/common/resourceTree';
import { ISequence, ISplice } from 'vs/base/common/sequence';
import { ICompressibleTreeRenderer, ICompressibleKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/tree/objectTree';
import { Iterator } from 'vs/base/common/iterator';
import { ICompressedTreeNode, ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { URI } from 'vs/base/common/uri';
import { FileKind } from 'vs/platform/files/common/files';
import { compareFileNames } from 'vs/base/common/comparers';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IViewDescriptor } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { flatten, find } from 'vs/base/common/arrays';
import { memoize } from 'vs/base/common/decorators';
import { IWorkbenchThemeService, IFileIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';

type TreeElement = ISCMResourceGroup | IResourceNode<ISCMResource, ISCMResourceGroup> | ISCMResource;

interface ResourceGroupTemplate {
	readonly name: HTMLElement;
	readonly count: CountBadge;
	readonly actionBar: ActionBar;
	elementDisposables: IDisposable;
	readonly disposables: IDisposable;
}

class ResourceGroupRenderer implements ICompressibleTreeRenderer<ISCMResourceGroup, FuzzyScore, ResourceGroupTemplate> {

	static readonly TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private actionViewItemProvider: IActionViewItemProvider,
		private themeService: IThemeService,
		private menus: SCMMenus
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		// hack
		addClass(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement, 'force-twistie');

		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);
		const elementDisposables = Disposable.None;
		const disposables = combinedDisposable(actionBar, styler);

		return { name, count, actionBar, elementDisposables, disposables };
	}

	renderElement(node: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposables.dispose();

		const group = node.element;
		template.name.textContent = group.label;
		template.actionBar.clear();
		template.actionBar.context = group;
		template.count.setCount(group.elements.length);

		const disposables = new DisposableStore();
		disposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceGroupMenu(group), template.actionBar));

		template.elementDisposables = disposables;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResourceGroup>, FuzzyScore>, index: number, templateData: ResourceGroupTemplate, height: number | undefined): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposables.dispose();
	}

	disposeTemplate(template: ResourceGroupTemplate): void {
		template.elementDisposables.dispose();
		template.disposables.dispose();
	}
}

interface ResourceTemplate {
	element: HTMLElement;
	name: HTMLElement;
	fileLabel: IResourceLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
	elementDisposables: IDisposable;
	disposables: IDisposable;
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[]) {
		super();
	}

	runAction(action: IAction, context: ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>): Promise<any> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const selection = this.getSelectedResources();
		const contextIsSelected = selection.some(s => s === context);
		const actualContext = contextIsSelected ? selection : [context];
		const args = flatten(actualContext.map(e => ResourceTree.isResourceNode(e) ? ResourceTree.collect(e) : [e]));
		return action.run(...args);
	}
}

class ResourceRenderer implements ICompressibleTreeRenderer<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore, ResourceTemplate> {

	static readonly TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private viewModelProvider: () => ViewModel,
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private getSelectedResources: () => (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[],
		private themeService: IThemeService,
		private menus: SCMMenus
	) { }

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.labels.create(name, { supportHighlights: true });
		const actionsContainer = append(fileLabel.element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: this.actionViewItemProvider,
			actionRunner: new MultipleSelectionActionRunner(this.getSelectedResources)
		});

		const decorationIcon = append(element, $('.decoration-icon'));
		const disposables = combinedDisposable(actionBar, fileLabel);

		return { element, name, fileLabel, decorationIcon, actionBar, elementDisposables: Disposable.None, disposables };
	}

	renderElement(node: ITreeNode<ISCMResource, FuzzyScore> | ITreeNode<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposables.dispose();

		const elementDisposables = new DisposableStore();
		const resourceOrFolder = node.element;
		const theme = this.themeService.getTheme();
		const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
		const icon = iconResource && (theme.type === LIGHT ? iconResource.decorations.icon : iconResource.decorations.iconDark);

		const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
		const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
		const viewModel = this.viewModelProvider();

		template.fileLabel.setFile(uri, {
			fileDecorations: { colors: false, badges: !icon },
			hidePath: viewModel.mode === ViewModelMode.Tree,
			fileKind,
			matches: createMatches(node.filterData)
		});

		template.actionBar.clear();
		template.actionBar.context = resourceOrFolder;

		if (ResourceTree.isResourceNode(resourceOrFolder)) {
			if (resourceOrFolder.element) {
				elementDisposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceMenu(resourceOrFolder.element.resourceGroup), template.actionBar));
				toggleClass(template.name, 'strike-through', resourceOrFolder.element.decorations.strikeThrough);
				toggleClass(template.element, 'faded', resourceOrFolder.element.decorations.faded);
			} else {
				elementDisposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceFolderMenu(resourceOrFolder.context), template.actionBar));
				removeClass(template.name, 'strike-through');
				removeClass(template.element, 'faded');
			}
		} else {
			elementDisposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceMenu(resourceOrFolder.resourceGroup), template.actionBar));
			toggleClass(template.name, 'strike-through', resourceOrFolder.decorations.strikeThrough);
			toggleClass(template.element, 'faded', resourceOrFolder.decorations.faded);
		}

		const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || '';

		if (icon) {
			template.decorationIcon.style.display = '';
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = tooltip;
		} else {
			template.decorationIcon.style.display = 'none';
			template.decorationIcon.style.backgroundImage = '';
			template.decorationIcon.title = '';
		}

		template.element.setAttribute('data-tooltip', tooltip);
		template.elementDisposables = elementDisposables;
	}

	disposeElement(resource: ITreeNode<ISCMResource, FuzzyScore> | ITreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposables.dispose();
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>, FuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		template.elementDisposables.dispose();

		const elementDisposables = new DisposableStore();
		const compressed = node.element as ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>;
		const folder = compressed.elements[compressed.elements.length - 1];

		const label = compressed.elements.map(e => e.name).join('/');
		const fileKind = FileKind.FOLDER;

		template.fileLabel.setResource({ resource: folder.uri, name: label }, {
			fileDecorations: { colors: false, badges: true },
			fileKind,
			matches: createMatches(node.filterData)
		});

		template.actionBar.clear();
		template.actionBar.context = folder;

		elementDisposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceFolderMenu(folder.context), template.actionBar));

		removeClass(template.name, 'strike-through');
		removeClass(template.element, 'faded');
		template.decorationIcon.style.display = 'none';
		template.decorationIcon.style.backgroundImage = '';

		template.element.setAttribute('data-tooltip', '');
		template.elementDisposables = elementDisposables;
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>, FuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		template.elementDisposables.dispose();
	}

	disposeTemplate(template: ResourceTemplate): void {
		template.elementDisposables.dispose();
		template.disposables.dispose();
	}
}

class ProviderListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight() { return 22; }

	getTemplateId(element: TreeElement) {
		if (ResourceTree.isResourceNode(element) || isSCMResource(element)) {
			return ResourceRenderer.TEMPLATE_ID;
		} else {
			return ResourceGroupRenderer.TEMPLATE_ID;
		}
	}
}

class SCMTreeFilter implements ITreeFilter<TreeElement> {

	filter(element: TreeElement): boolean {
		if (ResourceTree.isResourceNode(element)) {
			return true;
		} else if (isSCMResourceGroup(element)) {
			return element.elements.length > 0 || !element.hideWhenEmpty;
		} else {
			return true;
		}
	}
}

export class SCMTreeSorter implements ITreeSorter<TreeElement> {

	@memoize
	private get viewModel(): ViewModel { return this.viewModelProvider(); }

	constructor(private viewModelProvider: () => ViewModel) { }

	compare(one: TreeElement, other: TreeElement): number {
		if (this.viewModel.mode === ViewModelMode.List) {
			return 0;
		}

		if (isSCMResourceGroup(one) && isSCMResourceGroup(other)) {
			return 0;
		}

		const oneIsDirectory = ResourceTree.isResourceNode(one);
		const otherIsDirectory = ResourceTree.isResourceNode(other);

		if (oneIsDirectory !== otherIsDirectory) {
			return oneIsDirectory ? -1 : 1;
		}

		const oneName = ResourceTree.isResourceNode(one) ? one.name : basename((one as ISCMResource).sourceUri);
		const otherName = ResourceTree.isResourceNode(other) ? other.name : basename((other as ISCMResource).sourceUri);

		return compareFileNames(oneName, otherName);
	}
}

export class SCMTreeKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<TreeElement> {

	getKeyboardNavigationLabel(element: TreeElement): { toString(): string; } | undefined {
		if (ResourceTree.isResourceNode(element)) {
			return element.name;
		} else if (isSCMResourceGroup(element)) {
			return element.label;
		} else {
			return basename(element.sourceUri);
		}
	}

	getCompressedNodeKeyboardNavigationLabel(elements: TreeElement[]): { toString(): string | undefined; } | undefined {
		const folders = elements as IResourceNode<ISCMResource, ISCMResourceGroup>[];
		return folders.map(e => e.name).join('/');
	}
}

class SCMResourceIdentityProvider implements IIdentityProvider<TreeElement> {

	getId(element: TreeElement): string {
		if (ResourceTree.isResourceNode(element)) {
			const group = element.context;
			return `${group.provider.contextValue}/${group.id}/$FOLDER/${element.uri.toString()}`;
		} else if (isSCMResource(element)) {
			const group = element.resourceGroup;
			const provider = group.provider;
			return `${provider.contextValue}/${group.id}/${element.sourceUri.toString()}`;
		} else {
			const provider = element.provider;
			return `${provider.contextValue}/${element.id}`;
		}
	}
}

interface IGroupItem {
	readonly group: ISCMResourceGroup;
	readonly resources: ISCMResource[];
	readonly tree: ResourceTree<ISCMResource, ISCMResourceGroup>;
	readonly disposable: IDisposable;
}

function groupItemAsTreeElement(item: IGroupItem, mode: ViewModelMode): ICompressedTreeElement<TreeElement> {
	const children = mode === ViewModelMode.List
		? Iterator.map(Iterator.fromArray(item.resources), element => ({ element, incompressible: true }))
		: Iterator.map(item.tree.root.children, node => asTreeElement(node, true));

	return { element: item.group, children, incompressible: true, collapsible: true };
}

function asTreeElement(node: IResourceNode<ISCMResource, ISCMResourceGroup>, forceIncompressible: boolean): ICompressedTreeElement<TreeElement> {
	return {
		element: (node.childrenCount === 0 && node.element) ? node.element : node,
		children: Iterator.map(node.children, node => asTreeElement(node, false)),
		incompressible: !!node.element || forceIncompressible
	};
}

const enum ViewModelMode {
	List = 'list',
	Tree = 'tree'
}

class ViewModel {

	private readonly _onDidChangeMode = new Emitter<ViewModelMode>();
	readonly onDidChangeMode = this._onDidChangeMode.event;

	get mode(): ViewModelMode { return this._mode; }
	set mode(mode: ViewModelMode) {
		this._mode = mode;

		for (const item of this.items) {
			item.tree.clear();

			if (mode === ViewModelMode.Tree) {
				for (const resource of item.resources) {
					item.tree.add(resource.sourceUri, resource);
				}
			}
		}

		this.refresh();
		this._onDidChangeMode.fire(mode);
	}

	private items: IGroupItem[] = [];
	private visibilityDisposables = new DisposableStore();
	private scrollTop: number | undefined;
	private firstVisible = true;
	private disposables = new DisposableStore();

	constructor(
		private groups: ISequence<ISCMResourceGroup>,
		private tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>,
		private _mode: ViewModelMode,
		@IEditorService protected editorService: IEditorService,
		@IConfigurationService protected configurationService: IConfigurationService,
	) { }

	private onDidSpliceGroups({ start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		const itemsToInsert: IGroupItem[] = [];

		for (const group of toInsert) {
			const tree = new ResourceTree<ISCMResource, ISCMResourceGroup>(group, group.provider.rootUri || URI.file('/'));
			const resources: ISCMResource[] = [...group.elements];
			const disposable = combinedDisposable(
				group.onDidChange(() => this.tree.refilter()),
				group.onDidSplice(splice => this.onDidSpliceGroup(item, splice))
			);

			const item: IGroupItem = { group, resources, tree, disposable };

			if (this._mode === ViewModelMode.Tree) {
				for (const resource of resources) {
					item.tree.add(resource.sourceUri, resource);
				}
			}

			itemsToInsert.push(item);
		}

		const itemsToDispose = this.items.splice(start, deleteCount, ...itemsToInsert);

		for (const item of itemsToDispose) {
			item.disposable.dispose();
		}

		this.refresh();
	}

	private onDidSpliceGroup(item: IGroupItem, { start, deleteCount, toInsert }: ISplice<ISCMResource>): void {
		const deleted = item.resources.splice(start, deleteCount, ...toInsert);

		if (this._mode === ViewModelMode.Tree) {
			for (const resource of deleted) {
				item.tree.delete(resource.sourceUri);
			}

			for (const resource of toInsert) {
				item.tree.add(resource.sourceUri, resource);
			}
		}

		this.refresh(item);
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this.visibilityDisposables = new DisposableStore();
			this.groups.onDidSplice(this.onDidSpliceGroups, this, this.visibilityDisposables);
			this.onDidSpliceGroups({ start: 0, deleteCount: this.items.length, toInsert: this.groups.elements });

			if (typeof this.scrollTop === 'number') {
				this.tree.scrollTop = this.scrollTop;
				this.scrollTop = undefined;
			}

			this.editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.visibilityDisposables);
			this.onDidActiveEditorChange();
		} else {
			this.visibilityDisposables.dispose();
			this.onDidSpliceGroups({ start: 0, deleteCount: this.items.length, toInsert: [] });
			this.scrollTop = this.tree.scrollTop;
		}
	}

	private refresh(item?: IGroupItem): void {
		if (item) {
			this.tree.setChildren(item.group, groupItemAsTreeElement(item, this.mode).children);
		} else {
			this.tree.setChildren(null, this.items.map(item => groupItemAsTreeElement(item, this.mode)));
		}
	}

	private onDidActiveEditorChange(): void {
		if (!this.configurationService.getValue<boolean>('scm.autoReveal')) {
			return;
		}

		if (this.firstVisible) {
			this.firstVisible = false;
			this.visibilityDisposables.add(disposableTimeout(() => this.onDidActiveEditorChange(), 250));
			return;
		}

		const editor = this.editorService.activeEditor;

		if (!editor) {
			return;
		}

		const uri = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });

		if (!uri) {
			return;
		}

		// go backwards from last group
		for (let i = this.items.length - 1; i >= 0; i--) {
			const item = this.items[i];
			const resource = this.mode === ViewModelMode.Tree
				? item.tree.getNode(uri)?.element
				: find(item.resources, r => isEqual(r.sourceUri, uri));

			if (resource) {
				this.tree.reveal(resource);
				this.tree.setSelection([resource]);
				this.tree.setFocus([resource]);
				return;
			}
		}
	}

	dispose(): void {
		this.visibilityDisposables.dispose();
		this.disposables.dispose();
	}
}

export class ToggleViewModeAction extends Action {

	static readonly ID = 'workbench.scm.action.toggleViewMode';
	static readonly LABEL = localize('toggleViewMode', "Toggle View Mode");

	constructor(private viewModel: ViewModel) {
		super(ToggleViewModeAction.ID, ToggleViewModeAction.LABEL);

		this._register(this.viewModel.onDidChangeMode(this.onDidChangeMode, this));
		this.onDidChangeMode(this.viewModel.mode);
	}

	async run(): Promise<void> {
		this.viewModel.mode = this.viewModel.mode === ViewModelMode.List ? ViewModelMode.Tree : ViewModelMode.List;
	}

	private onDidChangeMode(mode: ViewModelMode): void {
		const iconClass = mode === ViewModelMode.List ? 'codicon-list-tree' : 'codicon-list-flat';
		this.class = `scm-action toggle-view-mode ${iconClass}`;
	}
}

function convertValidationType(type: InputValidationType): MessageType {
	switch (type) {
		case InputValidationType.Information: return MessageType.INFO;
		case InputValidationType.Warning: return MessageType.WARNING;
		case InputValidationType.Error: return MessageType.ERROR;
	}
}

export class RepositoryPanel extends ViewletPanel {

	private cachedHeight: number | undefined = undefined;
	private cachedWidth: number | undefined = undefined;
	private inputBoxContainer!: HTMLElement;
	private inputBox!: InputBox;
	private listContainer!: HTMLElement;
	private tree!: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private viewModel!: ViewModel;
	private listLabels!: ResourceLabels;
	private menus: SCMMenus;
	private toggleViewModelModeAction: ToggleViewModeAction | undefined;
	protected contextKeyService: IContextKeyService;
	private commitTemplate = '';

	constructor(
		readonly repository: ISCMRepository,
		options: IViewletPanelOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IWorkbenchThemeService protected themeService: IWorkbenchThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@ICommandService protected commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService protected editorService: IEditorService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService protected menuService: IMenuService,
		@IStorageService private storageService: IStorageService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService);

		this.menus = instantiationService.createInstance(SCMMenus, this.repository.provider);
		this._register(this.menus);
		this._register(this.menus.onDidChangeTitle(this._onDidChangeTitleArea.fire, this._onDidChangeTitleArea));

		this.contextKeyService = contextKeyService.createScoped(this.element);
		this.contextKeyService.createKey('scmRepository', this.repository);
	}

	render(): void {
		super.render();
		this._register(this.menus.onDidChangeTitle(this.updateActions, this));
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		let title: string;
		let type: string;

		if (this.repository.provider.rootUri) {
			title = basename(this.repository.provider.rootUri);
			type = this.repository.provider.label;
		} else {
			title = this.repository.provider.label;
			type = '';
		}

		super.renderHeaderTitle(container, title);
		addClass(container, 'scm-provider');
		append(container, $('span.type', undefined, type));
	}

	protected renderBody(container: HTMLElement): void {
		const focusTracker = trackFocus(container);
		this._register(focusTracker.onDidFocus(() => this.repository.focus()));
		this._register(focusTracker);

		// Input
		this.inputBoxContainer = append(container, $('.scm-editor'));

		const updatePlaceholder = () => {
			const binding = this.keybindingService.lookupKeybinding('scm.acceptInput');
			const label = binding ? binding.getLabel() : (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
			const placeholder = format(this.repository.input.placeholder, label);

			this.inputBox.setPlaceHolder(placeholder);
		};

		const validationDelayer = new ThrottledDelayer<any>(200);
		const validate = () => {
			return this.repository.input.validateInput(this.inputBox.value, this.inputBox.inputElement.selectionStart || 0).then(result => {
				if (!result) {
					this.inputBox.inputElement.removeAttribute('aria-invalid');
					this.inputBox.hideMessage();
				} else {
					this.inputBox.inputElement.setAttribute('aria-invalid', 'true');
					this.inputBox.showMessage({ content: result.message, type: convertValidationType(result.type) });
				}
			});
		};

		const triggerValidation = () => validationDelayer.trigger(validate);

		this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, { flexibleHeight: true, flexibleMaxHeight: 134 });
		this.inputBox.setEnabled(this.isBodyVisible());
		this._register(attachInputBoxStyler(this.inputBox, this.themeService));
		this._register(this.inputBox);

		this._register(this.inputBox.onDidChange(triggerValidation, null));

		const onKeyUp = domEvent(this.inputBox.inputElement, 'keyup');
		const onMouseUp = domEvent(this.inputBox.inputElement, 'mouseup');
		this._register(Event.any<any>(onKeyUp, onMouseUp)(triggerValidation, null));

		this.inputBox.value = this.repository.input.value;
		this._register(this.inputBox.onDidChange(value => this.repository.input.value = value, null));
		this._register(this.repository.input.onDidChange(value => this.inputBox.value = value, null));

		updatePlaceholder();
		this._register(this.repository.input.onDidChangePlaceholder(updatePlaceholder, null));
		this._register(this.keybindingService.onDidUpdateKeybindings(updatePlaceholder, null));

		this._register(this.inputBox.onDidHeightChange(() => this.layoutBody()));

		if (this.repository.provider.onDidChangeCommitTemplate) {
			this._register(this.repository.provider.onDidChangeCommitTemplate(this.onDidChangeCommitTemplate, this));
		}

		this.onDidChangeCommitTemplate();

		// Input box visibility
		this._register(this.repository.input.onDidChangeVisibility(this.updateInputBoxVisibility, this));
		this.updateInputBoxVisibility();

		// List
		this.listContainer = append(container, $('.scm-status.show-file-icons'));

		const updateActionsVisibility = () => toggleClass(this.listContainer, 'show-actions', this.configurationService.getValue<boolean>('scm.alwaysShowActions'));
		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowActions'))(updateActionsVisibility);
		updateActionsVisibility();

		const delegate = new ProviderListDelegate();

		const actionViewItemProvider = (action: IAction) => this.getActionViewItem(action);

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.listLabels);

		const renderers = [
			new ResourceGroupRenderer(actionViewItemProvider, this.themeService, this.menus),
			new ResourceRenderer(() => this.viewModel, this.listLabels, actionViewItemProvider, () => this.getSelectedResources(), this.themeService, this.menus)
		];

		const filter = new SCMTreeFilter();
		const sorter = new SCMTreeSorter(() => this.viewModel);
		const keyboardNavigationLabelProvider = new SCMTreeKeyboardNavigationLabelProvider();
		const identityProvider = new SCMResourceIdentityProvider();

		this.tree = this.instantiationService.createInstance<typeof WorkbenchCompressibleObjectTree, WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>>(
			WorkbenchCompressibleObjectTree,
			'SCM Tree Repo',
			this.listContainer,
			delegate,
			renderers,
			{
				identityProvider,
				horizontalScrolling: false,
				filter,
				sorter,
				keyboardNavigationLabelProvider,
				overrideStyles: {
					listBackground: SIDE_BAR_BACKGROUND
				}
			});

		this._register(Event.chain(this.tree.onDidOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && !isSCMResourceGroup(e) && !ResourceTree.isResourceNode(e))
			.on(this.open, this));

		this._register(Event.chain(this.tree.onDidPin)
			.map(e => e.elements[0])
			.filter(e => !!e && !isSCMResourceGroup(e) && !ResourceTree.isResourceNode(e))
			.on(this.pin, this));

		this._register(this.tree.onContextMenu(this.onListContextMenu, this));
		this._register(this.tree);

		let mode = this.configurationService.getValue<'tree' | 'list'>('scm.defaultViewMode') === 'list' ? ViewModelMode.List : ViewModelMode.Tree;

		const rootUri = this.repository.provider.rootUri;

		if (typeof rootUri !== 'undefined') {
			const storageMode = this.storageService.get(`scm.repository.viewMode:${rootUri.toString()}`, StorageScope.WORKSPACE) as ViewModelMode;

			if (typeof storageMode === 'string') {
				mode = storageMode;
			}
		}

		this.viewModel = this.instantiationService.createInstance(ViewModel, this.repository.provider.groups, this.tree, mode);
		this._register(this.viewModel);

		addClass(this.listContainer, 'file-icon-themable-tree');
		addClass(this.listContainer, 'show-file-icons');

		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
		this._register(this.viewModel.onDidChangeMode(this.onDidChangeMode, this));

		this.toggleViewModelModeAction = new ToggleViewModeAction(this.viewModel);
		this._register(this.toggleViewModelModeAction);

		this._register(this.onDidChangeBodyVisibility(this._onDidChangeVisibility, this));

		this.updateActions();
	}

	private updateIndentStyles(theme: IFileIconTheme): void {
		toggleClass(this.listContainer, 'list-view-mode', this.viewModel.mode === ViewModelMode.List);
		toggleClass(this.listContainer, 'tree-view-mode', this.viewModel.mode === ViewModelMode.Tree);
		toggleClass(this.listContainer, 'align-icons-and-twisties', this.viewModel.mode === ViewModelMode.Tree && theme.hasFileIcons && !theme.hasFolderIcons);
		toggleClass(this.listContainer, 'hide-arrows', this.viewModel.mode === ViewModelMode.Tree && theme.hidesExplorerArrows === true);
	}

	private onDidChangeMode(): void {
		this.updateIndentStyles(this.themeService.getFileIconTheme());

		const rootUri = this.repository.provider.rootUri;

		if (typeof rootUri === 'undefined') {
			return;
		}

		this.storageService.store(`scm.repository.viewMode:${rootUri.toString()}`, this.viewModel.mode, StorageScope.WORKSPACE);
	}

	layoutBody(height: number | undefined = this.cachedHeight, width: number | undefined = this.cachedWidth): void {
		if (height === undefined) {
			return;
		}

		this.cachedHeight = height;

		if (this.repository.input.visible) {
			removeClass(this.inputBoxContainer, 'hidden');
			this.inputBox.layout();

			const editorHeight = this.inputBox.height;
			const listHeight = height - (editorHeight + 12 /* margin */);
			this.listContainer.style.height = `${listHeight}px`;
			this.tree.layout(listHeight, width);
		} else {
			addClass(this.inputBoxContainer, 'hidden');

			this.listContainer.style.height = `${height}px`;
			this.tree.layout(height, width);
		}
	}

	focus(): void {
		super.focus();

		if (this.isExpanded()) {
			if (this.repository.input.visible) {
				this.inputBox.focus();
			} else {
				this.tree.domFocus();
			}

			this.repository.focus();
		}
	}

	private _onDidChangeVisibility(visible: boolean): void {
		this.inputBox.setEnabled(visible);
		this.viewModel.setVisible(visible);
	}

	getActions(): IAction[] {
		if (this.toggleViewModelModeAction) {

			return [
				this.toggleViewModelModeAction,
				...this.menus.getTitleActions()
			];
		} else {
			return this.menus.getTitleActions();
		}
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
	}

	getActionsContext(): any {
		return this.repository.provider;
	}

	private open(e: ISCMResource): void {
		e.open();
	}

	private pin(): void {
		const activeControl = this.editorService.activeControl;

		if (activeControl) {
			activeControl.group.pinEditor(activeControl.input);
		}
	}

	private onListContextMenu(e: ITreeContextMenuEvent<TreeElement>): void {
		if (!e.element) {
			return;
		}

		const element = e.element;
		let actions: IAction[] = [];

		if (isSCMResourceGroup(element)) {
			actions = this.menus.getResourceGroupContextActions(element);
		} else if (ResourceTree.isResourceNode(element)) {
			if (element.element) {
				actions = this.menus.getResourceContextActions(element.element);
			} else {
				actions = this.menus.getResourceFolderContextActions(element.context);
			}
		} else {
			actions = this.menus.getResourceContextActions(element);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => element,
			actionRunner: new MultipleSelectionActionRunner(() => this.getSelectedResources())
		});
	}

	private getSelectedResources(): (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[] {
		return this.tree.getSelection()
			.filter(r => !!r && !isSCMResourceGroup(r))! as any;
	}

	private onDidChangeCommitTemplate(): void {
		if (typeof this.repository.provider.commitTemplate === 'undefined' || !this.repository.input.visible) {
			return;
		}

		const oldCommitTemplate = this.commitTemplate;
		this.commitTemplate = this.repository.provider.commitTemplate;

		if (this.inputBox.value && this.inputBox.value !== oldCommitTemplate) {
			return;
		}

		this.inputBox.value = this.commitTemplate;
	}

	private updateInputBoxVisibility(): void {
		if (this.cachedHeight) {
			this.layoutBody(this.cachedHeight);
		}
	}
}

export class RepositoryViewDescriptor implements IViewDescriptor {

	private static counter = 0;

	readonly id: string;
	readonly name: string;
	readonly ctorDescriptor: { ctor: any, arguments?: any[] };
	readonly canToggleVisibility = true;
	readonly order = -500;
	readonly workspace = true;

	constructor(readonly repository: ISCMRepository, readonly hideByDefault: boolean) {
		const repoId = repository.provider.rootUri ? repository.provider.rootUri.toString() : `#${RepositoryViewDescriptor.counter++}`;
		this.id = `scm:repository:${repository.provider.label}:${repoId}`;
		this.name = repository.provider.rootUri ? basename(repository.provider.rootUri) : repository.provider.label;

		this.ctorDescriptor = { ctor: RepositoryPanel, arguments: [repository] };
	}
}
