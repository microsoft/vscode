/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scmViewlet';
import { Event } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { basename } from 'vs/base/common/resources';
import { IDisposable, Disposable, DisposableStore, combinedDisposable } from 'vs/base/common/lifecycle';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus, removeClass } from 'vs/base/browser/dom';
import { IListVirtualDelegate, IKeyboardNavigationLabelProvider, IIdentityProvider } from 'vs/base/browser/ui/list/list';
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
import { IAction, IActionViewItem, ActionRunner } from 'vs/base/common/actions';
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
import { ThrottledDelayer } from 'vs/base/common/async';
import { INotificationService } from 'vs/platform/notification/common/notification';
import * as platform from 'vs/base/common/platform';
import { ITreeNode, ITreeFilter, ITreeSorter, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { ISequence, ISplice } from 'vs/base/common/sequence';
import { ResourceTree, IBranchNode, INode } from 'vs/base/common/resourceTree';
import { ObjectTree, ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { Iterator } from 'vs/base/common/iterator';
import { ICompressedTreeNode, ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { URI } from 'vs/base/common/uri';
import { FileKind } from 'vs/platform/files/common/files';
import { compareFileNames } from 'vs/base/common/comparers';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IViewDescriptor } from 'vs/workbench/common/views';

type TreeElement = ISCMResourceGroup | IBranchNode<ISCMResource> | ISCMResource;

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	elementDisposable: IDisposable;
	dispose: () => void;
}

class ResourceGroupRenderer implements ICompressibleTreeRenderer<ISCMResourceGroup, FuzzyScore, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private actionViewItemProvider: IActionViewItemProvider,
		private themeService: IThemeService,
		private menus: SCMMenus
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);
		const elementDisposable = Disposable.None;

		return {
			name, count, actionBar, elementDisposable, dispose: () => {
				actionBar.dispose();
				styler.dispose();
			}
		};
	}

	renderElement(node: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposable.dispose();

		const group = node.element;
		template.name.textContent = group.label;
		template.actionBar.clear();
		template.actionBar.context = group;

		const disposables = new DisposableStore();
		disposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceGroupMenu(group), template.actionBar));

		const updateCount = () => template.count.setCount(group.elements.length);
		disposables.add(group.onDidSplice(updateCount, null));
		updateCount();

		template.elementDisposable = disposables;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResourceGroup>, FuzzyScore>, index: number, templateData: ResourceGroupTemplate, height: number | undefined): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposable.dispose();
	}

	disposeTemplate(template: ResourceGroupTemplate): void {
		template.dispose();
	}
}

interface ResourceTemplate {
	element: HTMLElement;
	name: HTMLElement;
	fileLabel: IResourceLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: IDisposable;
	dispose: () => void;
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => ISCMResource[]) {
		super();
	}

	runAction(action: IAction, context: ISCMResource): Promise<any> {
		if (action instanceof MenuItemAction) {
			const selection = this.getSelectedResources();
			const filteredSelection = selection.filter(s => s !== context);

			if (selection.length === filteredSelection.length || selection.length === 1) {
				return action.run(context);
			}

			return action.run(context, ...filteredSelection);
		}

		return super.runAction(action, context);
	}
}

class ResourceRenderer implements ICompressibleTreeRenderer<ISCMResource | IBranchNode<ISCMResource>, FuzzyScore, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private getSelectedResources: () => ISCMResource[],
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

		return {
			element, name, fileLabel, decorationIcon, actionBar, elementDisposable: Disposable.None, dispose: () => {
				actionBar.dispose();
				fileLabel.dispose();
			}
		};
	}

	renderElement(node: ITreeNode<ISCMResource, FuzzyScore> | ITreeNode<IBranchNode<ISCMResource>, FuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposable.dispose();

		const resource = node.element;
		const theme = this.themeService.getTheme();
		const icon = ResourceTree.isBranchNode(resource) ? undefined : (theme.type === LIGHT ? resource.decorations.icon : resource.decorations.iconDark);

		const uri = ResourceTree.isBranchNode(resource) ? URI.file(resource.path) : resource.sourceUri;
		const fileKind = ResourceTree.isBranchNode(resource) ? FileKind.FOLDER : FileKind.FILE;
		template.fileLabel.setFile(uri, {
			fileDecorations: { colors: false, badges: !icon },
			hidePath: true,
			fileKind,
			matches: createMatches(node.filterData)
		});
		template.actionBar.clear();
		template.actionBar.context = resource;

		const disposables = new DisposableStore();

		if (!ResourceTree.isBranchNode(resource)) {
			disposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceMenu(resource.resourceGroup), template.actionBar));
			toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);
			toggleClass(template.element, 'faded', resource.decorations.faded);
		}

		const tooltip = (ResourceTree.isBranchNode(resource) ? resource.path : resource.decorations.tooltip) || '';

		if (icon) {
			template.decorationIcon.style.display = '';
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = tooltip;
		} else {
			template.decorationIcon.style.display = 'none';
			template.decorationIcon.style.backgroundImage = '';
		}

		template.element.setAttribute('data-tooltip', tooltip);
		template.elementDisposable = disposables;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IBranchNode<ISCMResource>>, FuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		template.elementDisposable.dispose();

		const compressed = node.element as ICompressedTreeNode<IBranchNode<ISCMResource>>;
		const resource = compressed.elements[compressed.elements.length - 1];

		const label = compressed.elements.map(e => e.name).join('/');
		const uri = URI.file(resource.path);
		const fileKind = FileKind.FOLDER;
		template.fileLabel.setResource({ resource: uri, name: label }, {
			fileDecorations: { colors: false, badges: true },
			fileKind,
			matches: createMatches(node.filterData)
		});
		template.actionBar.clear();
		template.actionBar.context = resource;

		const disposables = new DisposableStore();

		template.decorationIcon.style.display = 'none';
		template.decorationIcon.style.backgroundImage = '';

		template.element.setAttribute('data-tooltip', resource.path);
		template.elementDisposable = disposables;

	}

	disposeElement(resource: ITreeNode<ISCMResource, FuzzyScore> | ITreeNode<IBranchNode<ISCMResource>, FuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposable.dispose();
	}

	disposeTemplate(template: ResourceTemplate): void {
		template.elementDisposable.dispose();
		template.dispose();
	}
}

class ProviderListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight() { return 22; }

	getTemplateId(element: TreeElement) {
		if (ResourceTree.isBranchNode(element) || isSCMResource(element)) {
			return ResourceRenderer.TEMPLATE_ID;
		} else {
			return ResourceGroupRenderer.TEMPLATE_ID;
		}
	}
}

class SCMTreeFilter implements ITreeFilter<TreeElement> {

	filter(element: TreeElement): boolean {
		if (ResourceTree.isBranchNode(element)) {
			return true;
		} else if (isSCMResourceGroup(element)) {
			return element.elements.length > 0 || !element.hideWhenEmpty;
		} else {
			return true;
		}
	}
}

export class SCMTreeSorter implements ITreeSorter<TreeElement> {

	compare(one: TreeElement, other: TreeElement): number {
		if (isSCMResourceGroup(one) && isSCMResourceGroup(other)) {
			return 0;
		}

		const oneIsDirectory = ResourceTree.isBranchNode(one);
		const otherIsDirectory = ResourceTree.isBranchNode(other);

		if (oneIsDirectory !== otherIsDirectory) {
			return oneIsDirectory ? -1 : 1;
		}

		const oneName = ResourceTree.isBranchNode(one) ? one.name : basename((one as ISCMResource).sourceUri);
		const otherName = ResourceTree.isBranchNode(other) ? other.name : basename((other as ISCMResource).sourceUri);

		return compareFileNames(oneName, otherName);
	}
}

export class SCMTreeKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TreeElement> {

	getKeyboardNavigationLabel(element: TreeElement): { toString(): string; } | undefined {
		if (isSCMResourceGroup(element)) {
			return element.label;
		}

		if (isSCMResource(element)) {
			return basename(element.sourceUri);
		}

		return '';
	}
}

const scmResourceIdentityProvider = new class implements IIdentityProvider<TreeElement> {
	getId(e: TreeElement): string {
		if (ResourceTree.isBranchNode(e)) {
			return e.path;
		} else if (isSCMResource(e)) {
			const group = e.resourceGroup;
			const provider = group.provider;
			return `${provider.contextValue}/${group.id}/${e.sourceUri.toString()}`;
		} else {
			const provider = e.provider;
			return `${provider.contextValue}/${e.id}`;
		}
	}
};

interface IGroupItem {
	readonly group: ISCMResourceGroup;
	readonly resources: ISCMResource[];
	readonly tree: ResourceTree<ISCMResource>;
	readonly disposable: IDisposable;
}

function groupItemAsTreeElement(item: IGroupItem, flat: boolean): ICompressedTreeElement<TreeElement> {
	const children = flat
		? Iterator.map(Iterator.fromArray(item.resources), element => ({ element, incompressible: true }))
		: Iterator.map(item.tree.root.children, node => asTreeElement(node, true));

	return { element: item.group, children, incompressible: true };
}

function asTreeElement(node: INode<ISCMResource>, incompressible: boolean): ICompressedTreeElement<TreeElement> {
	if (ResourceTree.isBranchNode(node)) {
		return {
			element: node,
			children: Iterator.map(node.children, node => asTreeElement(node, false)),
			incompressible,
			collapsed: false
		};
	}

	return { element: node.element, incompressible: true };
}

// TODO: cache tree scrollTop
class ViewModel {

	private flat = false;
	private items: IGroupItem[] = [];
	private visibilityDisposables = new DisposableStore();
	private disposables = new DisposableStore();

	constructor(
		private groups: ISequence<ISCMResourceGroup>,
		private tree: ObjectTree<TreeElement, FuzzyScore>
	) { }

	private onDidSpliceGroups({ start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		const itemsToInsert: IGroupItem[] = [];

		for (const group of toInsert) {
			const tree = new ResourceTree<ISCMResource>(group.provider.rootUri || URI.file('/'));
			const resources: ISCMResource[] = [...group.elements];
			const disposable = combinedDisposable(
				group.onDidChange(() => this.tree.refilter()),
				group.onDidSplice(splice => this.onDidSpliceGroup(item, splice))
			);

			const item = { group, resources, tree, disposable };

			for (const resource of resources) {
				item.tree.add(resource.sourceUri, resource);
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
		for (const resource of toInsert) {
			item.tree.add(resource.sourceUri, resource);
		}

		const deleted = item.resources.splice(start, deleteCount, ...toInsert);

		for (const resource of deleted) {
			item.tree.delete(resource.sourceUri);
		}

		this.refresh(item);
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this.visibilityDisposables = new DisposableStore();
			this.groups.onDidSplice(this.onDidSpliceGroups, this, this.visibilityDisposables);
			this.onDidSpliceGroups({ start: 0, deleteCount: this.items.length, toInsert: this.groups.elements });
		} else {
			this.visibilityDisposables.dispose();
			this.onDidSpliceGroups({ start: 0, deleteCount: this.items.length, toInsert: [] });
		}
	}

	private refresh(item?: IGroupItem): void {
		if (item) {
			this.tree.setChildren(item.group, groupItemAsTreeElement(item, this.flat).children);
		} else {
			this.tree.setChildren(null, this.items.map(item => groupItemAsTreeElement(item, this.flat)));
		}
	}

	dispose(): void {
		this.visibilityDisposables.dispose();
		this.disposables.dispose();
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
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private listContainer: HTMLElement;
	private tree: ObjectTree<TreeElement, FuzzyScore>;
	private viewModel: ViewModel;
	private listLabels: ResourceLabels;
	private menus: SCMMenus;
	protected contextKeyService: IContextKeyService;

	constructor(
		readonly repository: ISCMRepository,
		options: IViewletPanelOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IThemeService protected themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@ICommandService protected commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService protected editorService: IEditorService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService protected menuService: IMenuService
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
			this._register(this.repository.provider.onDidChangeCommitTemplate(this.updateInputBox, this));
		}

		this.updateInputBox();

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
			new ResourceRenderer(this.listLabels, actionViewItemProvider, () => this.getSelectedResources(), this.themeService, this.menus)
		];

		const filter = new SCMTreeFilter();
		const sorter = new SCMTreeSorter();
		const keyboardNavigationLabelProvider = new SCMTreeKeyboardNavigationLabelProvider();

		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'SCM Tree Repo',
			this.listContainer,
			delegate,
			renderers,
			{
				identityProvider: scmResourceIdentityProvider,
				horizontalScrolling: false,
				filter,
				sorter,
				keyboardNavigationLabelProvider
			});

		this._register(Event.chain(this.tree.onDidOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && !ResourceTree.isBranchNode(e) && isSCMResource(e))
			.on(this.open, this));

		this._register(Event.chain(this.tree.onDidPin)
			.map(e => e.elements[0])
			.filter(e => !!e && !ResourceTree.isBranchNode(e) && isSCMResource(e))
			.on(this.pin, this));

		this._register(this.tree.onContextMenu(this.onListContextMenu, this));
		this._register(this.tree);

		this.viewModel = new ViewModel(this.repository.provider.groups, this.tree);
		this._register(this.viewModel);

		this._register(this.onDidChangeBodyVisibility(this._onDidChangeVisibility, this));
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
		return this.menus.getTitleActions();
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
		let actions: IAction[];

		if (ResourceTree.isBranchNode(element)) {
			actions = [];
		} else if (isSCMResource(element)) {
			actions = this.menus.getResourceContextActions(element);
		} else {
			actions = this.menus.getResourceGroupContextActions(element);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => element,
			actionRunner: new MultipleSelectionActionRunner(() => this.getSelectedResources())
		});
	}

	private getSelectedResources(): ISCMResource[] {
		return this.tree.getSelection()
			.filter(r => !!r && !ResourceTree.isBranchNode(r) && isSCMResource(r)) as ISCMResource[];
	}

	private updateInputBox(): void {
		if (typeof this.repository.provider.commitTemplate === 'undefined' || !this.repository.input.visible || this.inputBox.value) {
			return;
		}

		this.inputBox.value = this.repository.provider.commitTemplate;
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
