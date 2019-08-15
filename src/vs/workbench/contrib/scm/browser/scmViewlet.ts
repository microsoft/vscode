/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { basename } from 'vs/base/common/resources';
import { IDisposable, dispose, Disposable, DisposableStore, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus, removeClass, addClasses } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent, IListEvent, IKeyboardNavigationLabelProvider, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID, ISCMService, ISCMRepository, ISCMResourceGroup, ISCMResource, InputValidationType, VIEW_CONTAINER } from 'vs/workbench/contrib/scm/common/scm';
import { ResourceLabels, IResourceLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction, IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction, Action, IActionViewItem, ActionRunner } from 'vs/base/common/actions';
import { createAndFillInContextMenuActions, ContextAwareMenuEntryActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { SCMMenus } from './scmMenus';
import { ActionBar, IActionViewItemProvider, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isSCMResource } from './scmUtil';
import { attachBadgeStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { Command } from 'vs/editor/common/modes';
import { renderOcticons } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { format } from 'vs/base/common/strings';
import { ISpliceable, ISequence, ISplice } from 'vs/base/common/sequence';
import { firstIndex, equals } from 'vs/base/common/arrays';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ThrottledDelayer } from 'vs/base/common/async';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import * as platform from 'vs/base/common/platform';
import { ViewContainerViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IViewsRegistry, IViewDescriptor, Extensions } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { nextTick } from 'vs/base/common/process';

export interface ISpliceEvent<T> {
	index: number;
	deleteCount: number;
	elements: T[];
}

export interface IViewModel {
	readonly repositories: ISCMRepository[];
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>>;

	readonly visibleRepositories: ISCMRepository[];
	readonly onDidChangeVisibleRepositories: Event<ISCMRepository[]>;
	setVisibleRepositories(repositories: ISCMRepository[]): void;

	isVisible(): boolean;
	readonly onDidChangeVisibility: Event<boolean>;
}

class ProvidersListDelegate implements IListVirtualDelegate<ISCMRepository> {

	getHeight(element: ISCMRepository): number {
		return 22;
	}

	getTemplateId(element: ISCMRepository): string {
		return 'provider';
	}
}

class StatusBarAction extends Action {

	constructor(
		private command: Command,
		private commandService: ICommandService
	) {
		super(`statusbaraction{${command.id}}`, command.title, '', true);
		this.tooltip = command.tooltip || '';
	}

	run(): Promise<void> {
		return this.commandService.executeCommand(this.command.id, ...(this.command.arguments || []));
	}
}

class StatusBarActionViewItem extends ActionViewItem {

	constructor(action: StatusBarAction) {
		super(null, action, {});
	}

	updateLabel(): void {
		if (this.options.label) {
			this.label.innerHTML = renderOcticons(this.getAction().label);
		}
	}
}

function connectPrimaryMenuToInlineActionBar(menu: IMenu, actionBar: ActionBar): IDisposable {
	let cachedDisposable: IDisposable = Disposable.None;
	let cachedPrimary: IAction[] = [];

	const updateActions = () => {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		const disposable = createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, { primary, secondary }, g => /^inline/.test(g));

		if (equals(cachedPrimary, primary, (a, b) => a.id === b.id)) {
			disposable.dispose();
			return;
		}

		cachedDisposable = disposable;
		cachedPrimary = primary;

		actionBar.clear();
		actionBar.push(primary, { icon: true, label: false });
	};

	updateActions();

	return combinedDisposable(menu.onDidChange(updateActions), toDisposable(() => {
		cachedDisposable.dispose();
	}));
}

interface RepositoryTemplateData {
	title: HTMLElement;
	type: HTMLElement;
	countContainer: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	disposable: IDisposable;
	templateDisposable: IDisposable;
}

class ProviderRenderer implements IListRenderer<ISCMRepository, RepositoryTemplateData> {

	readonly templateId = 'provider';

	private _onDidRenderElement = new Emitter<ISCMRepository>();
	readonly onDidRenderElement = this._onDidRenderElement.event;

	constructor(
		@ICommandService protected commandService: ICommandService,
		@IThemeService protected themeService: IThemeService
	) { }

	renderTemplate(container: HTMLElement): RepositoryTemplateData {
		const provider = append(container, $('.scm-provider'));
		const name = append(provider, $('.name'));
		const title = append(name, $('span.title'));
		const type = append(name, $('span.type'));
		const countContainer = append(provider, $('.count'));
		const count = new CountBadge(countContainer);
		const badgeStyler = attachBadgeStyler(count, this.themeService);
		const actionBar = new ActionBar(provider, { actionViewItemProvider: a => new StatusBarActionViewItem(a as StatusBarAction) });
		const disposable = Disposable.None;
		const templateDisposable = combinedDisposable(actionBar, badgeStyler);

		return { title, type, countContainer, count, actionBar, disposable, templateDisposable };
	}

	renderElement(repository: ISCMRepository, index: number, templateData: RepositoryTemplateData): void {
		templateData.disposable.dispose();
		const disposables = new DisposableStore();

		if (repository.provider.rootUri) {
			templateData.title.textContent = basename(repository.provider.rootUri);
			templateData.type.textContent = repository.provider.label;
		} else {
			templateData.title.textContent = repository.provider.label;
			templateData.type.textContent = '';
		}

		const actions: IAction[] = [];
		const disposeActions = () => dispose(actions);
		disposables.add({ dispose: disposeActions });

		const update = () => {
			disposeActions();

			const commands = repository.provider.statusBarCommands || [];
			actions.splice(0, actions.length, ...commands.map(c => new StatusBarAction(c, this.commandService)));
			templateData.actionBar.clear();
			templateData.actionBar.push(actions);

			const count = repository.provider.count || 0;
			toggleClass(templateData.countContainer, 'hidden', count === 0);
			templateData.count.setCount(count);

			this._onDidRenderElement.fire(repository);
		};

		disposables.add(repository.provider.onDidChange(update, null));
		update();

		templateData.disposable = disposables;
	}

	disposeTemplate(templateData: RepositoryTemplateData): void {
		templateData.disposable.dispose();
		templateData.templateDisposable.dispose();
	}
}

export class MainPanel extends ViewletPanel {

	static readonly ID = 'scm.mainPanel';
	static readonly TITLE = localize('scm providers', "Source Control Providers");

	private list: List<ISCMRepository>;

	constructor(
		protected viewModel: IViewModel,
		options: IViewletPanelOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService);
	}

	protected renderBody(container: HTMLElement): void {
		const delegate = new ProvidersListDelegate();
		const renderer = this.instantiationService.createInstance(ProviderRenderer);
		const identityProvider = { getId: (r: ISCMRepository) => r.provider.id };

		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [renderer], {
			identityProvider,
			horizontalScrolling: false
		});

		this._register(renderer.onDidRenderElement(e => this.list.updateWidth(this.viewModel.repositories.indexOf(e)), null));
		this._register(this.list.onSelectionChange(this.onListSelectionChange, this));
		this._register(this.list.onFocusChange(this.onListFocusChange, this));
		this._register(this.list.onContextMenu(this.onListContextMenu, this));

		this._register(this.viewModel.onDidChangeVisibleRepositories(this.updateListSelection, this));

		this._register(this.viewModel.onDidSplice(({ index, deleteCount, elements }) => this.splice(index, deleteCount, elements), null));
		this.splice(0, 0, this.viewModel.repositories);

		this._register(this.list);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('scm.providers.visible')) {
				this.updateBodySize();
			}
		}));

		this.updateListSelection();
	}

	private splice(index: number, deleteCount: number, repositories: ISCMRepository[] = []): void {
		this.list.splice(index, deleteCount, repositories);

		const empty = this.list.length === 0;
		toggleClass(this.element, 'empty', empty);

		this.updateBodySize();
	}

	protected layoutBody(height: number, width: number): void {
		this.list.layout(height, width);
	}

	private updateBodySize(): void {
		const visibleCount = this.configurationService.getValue<number>('scm.providers.visible');
		const empty = this.list.length === 0;
		const size = Math.min(this.viewModel.repositories.length, visibleCount) * 22;

		this.minimumBodySize = visibleCount === 0 ? 22 : size;
		this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
	}

	private onListContextMenu(e: IListContextMenuEvent<ISCMRepository>): void {
		if (!e.element) {
			return;
		}

		const repository = e.element;
		const contextKeyService = this.contextKeyService.createScoped();
		const scmProviderKey = contextKeyService.createKey<string | undefined>('scmProvider', undefined);
		scmProviderKey.set(repository.provider.contextValue);

		const menu = this.menuService.createMenu(MenuId.SCMSourceControl, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		const disposable = createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		if (secondary.length === 0) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => secondary,
			getActionsContext: () => repository.provider
		});

		disposable.dispose();
	}

	private onListSelectionChange(e: IListEvent<ISCMRepository>): void {
		if (e.browserEvent && e.elements.length > 0) {
			const scrollTop = this.list.scrollTop;
			this.viewModel.setVisibleRepositories(e.elements);
			this.list.scrollTop = scrollTop;
		}
	}

	private onListFocusChange(e: IListEvent<ISCMRepository>): void {
		if (e.browserEvent && e.elements.length > 0) {
			e.elements[0].focus();
		}
	}

	private updateListSelection(): void {
		const set = new Set();

		for (const repository of this.viewModel.visibleRepositories) {
			set.add(repository);
		}

		const selection: number[] = [];

		for (let i = 0; i < this.list.length; i++) {
			if (set.has(this.list.element(i))) {
				selection.push(i);
			}
		}

		this.list.setSelection(selection);

		if (selection.length > 0) {
			this.list.setFocus([selection[0]]);
		}
	}
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	elementDisposable: IDisposable;
	dispose: () => void;
}

class ResourceGroupRenderer implements IListRenderer<ISCMResourceGroup, ResourceGroupTemplate> {

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

	renderElement(group: ISCMResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposable.dispose();

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

	disposeElement(group: ISCMResourceGroup, index: number, template: ResourceGroupTemplate): void {
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

class ResourceRenderer implements IListRenderer<ISCMResource, ResourceTemplate> {

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
		const fileLabel = this.labels.create(name);
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

	renderElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.elementDisposable.dispose();

		const theme = this.themeService.getTheme();
		const icon = theme.type === LIGHT ? resource.decorations.icon : resource.decorations.iconDark;

		template.fileLabel.setFile(resource.sourceUri, { fileDecorations: { colors: false, badges: !icon, data: resource.decorations } });
		template.actionBar.clear();
		template.actionBar.context = resource;

		const disposables = new DisposableStore();
		disposables.add(connectPrimaryMenuToInlineActionBar(this.menus.getResourceMenu(resource.resourceGroup), template.actionBar));

		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);
		toggleClass(template.element, 'faded', resource.decorations.faded);

		if (icon) {
			template.decorationIcon.style.display = '';
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = resource.decorations.tooltip || '';
		} else {
			template.decorationIcon.style.display = 'none';
			template.decorationIcon.style.backgroundImage = '';
		}

		template.element.setAttribute('data-tooltip', resource.decorations.tooltip || '');
		template.elementDisposable = disposables;
	}

	disposeElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.elementDisposable.dispose();
	}

	disposeTemplate(template: ResourceTemplate): void {
		template.elementDisposable.dispose();
		template.dispose();
	}
}

class ProviderListDelegate implements IListVirtualDelegate<ISCMResourceGroup | ISCMResource> {

	getHeight() { return 22; }

	getTemplateId(element: ISCMResourceGroup | ISCMResource) {
		return isSCMResource(element) ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

const scmResourceIdentityProvider = new class implements IIdentityProvider<ISCMResourceGroup | ISCMResource> {
	getId(r: ISCMResourceGroup | ISCMResource): string {
		if (isSCMResource(r)) {
			const group = r.resourceGroup;
			const provider = group.provider;
			return `${provider.contextValue}/${group.id}/${r.sourceUri.toString()}`;
		} else {
			const provider = r.provider;
			return `${provider.contextValue}/${r.id}`;
		}
	}
};

const scmKeyboardNavigationLabelProvider = new class implements IKeyboardNavigationLabelProvider<ISCMResourceGroup | ISCMResource> {
	getKeyboardNavigationLabel(e: ISCMResourceGroup | ISCMResource) {
		if (isSCMResource(e)) {
			return basename(e.sourceUri);
		} else {
			return e.label;
		}
	}
};

function isGroupVisible(group: ISCMResourceGroup) {
	return group.elements.length > 0 || !group.hideWhenEmpty;
}

interface IGroupItem {
	readonly group: ISCMResourceGroup;
	visible: boolean;
	readonly disposable: IDisposable;
}

class ResourceGroupSplicer {

	private items: IGroupItem[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		groupSequence: ISequence<ISCMResourceGroup>,
		private spliceable: ISpliceable<ISCMResourceGroup | ISCMResource>
	) {
		groupSequence.onDidSplice(this.onDidSpliceGroups, this, this.disposables);
		this.onDidSpliceGroups({ start: 0, deleteCount: 0, toInsert: groupSequence.elements });
	}

	private onDidSpliceGroups({ start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		let absoluteStart = 0;

		for (let i = 0; i < start; i++) {
			const item = this.items[i];
			absoluteStart += (item.visible ? 1 : 0) + item.group.elements.length;
		}

		let absoluteDeleteCount = 0;

		for (let i = 0; i < deleteCount; i++) {
			const item = this.items[start + i];
			absoluteDeleteCount += (item.visible ? 1 : 0) + item.group.elements.length;
		}

		const itemsToInsert: IGroupItem[] = [];
		const absoluteToInsert: Array<ISCMResourceGroup | ISCMResource> = [];

		for (const group of toInsert) {
			const visible = isGroupVisible(group);

			if (visible) {
				absoluteToInsert.push(group);
			}

			for (const element of group.elements) {
				absoluteToInsert.push(element);
			}

			const disposable = combinedDisposable(
				group.onDidChange(() => this.onDidChangeGroup(group)),
				group.onDidSplice(splice => this.onDidSpliceGroup(group, splice))
			);

			itemsToInsert.push({ group, visible, disposable });
		}

		const itemsToDispose = this.items.splice(start, deleteCount, ...itemsToInsert);

		for (const item of itemsToDispose) {
			item.disposable.dispose();
		}

		this.spliceable.splice(absoluteStart, absoluteDeleteCount, absoluteToInsert);
	}

	private onDidChangeGroup(group: ISCMResourceGroup): void {
		const itemIndex = firstIndex(this.items, item => item.group === group);

		if (itemIndex < 0) {
			return;
		}

		const item = this.items[itemIndex];
		const visible = isGroupVisible(group);

		if (item.visible === visible) {
			return;
		}

		let absoluteStart = 0;

		for (let i = 0; i < itemIndex; i++) {
			const item = this.items[i];
			absoluteStart += (item.visible ? 1 : 0) + item.group.elements.length;
		}

		if (visible) {
			this.spliceable.splice(absoluteStart, 0, [group, ...group.elements]);
		} else {
			this.spliceable.splice(absoluteStart, 1 + group.elements.length, []);
		}

		item.visible = visible;
	}

	private onDidSpliceGroup(group: ISCMResourceGroup, { start, deleteCount, toInsert }: ISplice<ISCMResource>): void {
		const itemIndex = firstIndex(this.items, item => item.group === group);

		if (itemIndex < 0) {
			return;
		}

		const item = this.items[itemIndex];
		const visible = isGroupVisible(group);

		if (!item.visible && !visible) {
			return;
		}

		let absoluteStart = start;

		for (let i = 0; i < itemIndex; i++) {
			const item = this.items[i];
			absoluteStart += (item.visible ? 1 : 0) + item.group.elements.length;
		}

		if (item.visible && !visible) {
			this.spliceable.splice(absoluteStart, 1 + deleteCount, toInsert);
		} else if (!item.visible && visible) {
			this.spliceable.splice(absoluteStart, deleteCount, [group, ...toInsert]);
		} else {
			this.spliceable.splice(absoluteStart + 1, deleteCount, toInsert);
		}

		item.visible = visible;
	}

	dispose(): void {
		this.onDidSpliceGroups({ start: 0, deleteCount: this.items.length, toInsert: [] });
		this.disposables = dispose(this.disposables);
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
	private cachedScrollTop: number | undefined = undefined;
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private listLabels: ResourceLabels;
	private menus: SCMMenus;
	private visibilityDisposables: IDisposable[] = [];
	protected contextKeyService: IContextKeyService;

	constructor(
		readonly repository: ISCMRepository,
		private readonly viewModel: IViewModel,
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

		this.list = this.instantiationService.createInstance(WorkbenchList, this.listContainer, delegate, renderers, {
			identityProvider: scmResourceIdentityProvider,
			keyboardNavigationLabelProvider: scmKeyboardNavigationLabelProvider,
			horizontalScrolling: false
		});

		this._register(Event.chain(this.list.onDidOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.open, this));

		this._register(Event.chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.pin, this));

		this._register(this.list.onContextMenu(this.onListContextMenu, this));
		this._register(this.list);

		this._register(this.viewModel.onDidChangeVisibility(this.onDidChangeVisibility, this));
		this.onDidChangeVisibility(this.viewModel.isVisible());
		this.onDidChangeBodyVisibility(visible => this.inputBox.setEnabled(visible));
	}

	private onDidChangeVisibility(visible: boolean): void {
		if (visible) {
			const listSplicer = new ResourceGroupSplicer(this.repository.provider.groups, this.list);
			this.visibilityDisposables.push(listSplicer);
		} else {
			this.cachedScrollTop = this.list.scrollTop;
			this.visibilityDisposables = dispose(this.visibilityDisposables);
		}
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
			this.list.layout(listHeight, width);
		} else {
			addClass(this.inputBoxContainer, 'hidden');

			this.listContainer.style.height = `${height}px`;
			this.list.layout(height, width);
		}

		if (this.cachedScrollTop !== undefined && this.list.scrollTop !== this.cachedScrollTop) {
			this.list.scrollTop = Math.min(this.cachedScrollTop, this.list.scrollHeight);
			// Applying the cached scroll position just once until the next leave.
			// This, also, avoids the scrollbar to flicker when resizing the sidebar.
			this.cachedScrollTop = undefined;
		}
	}

	focus(): void {
		super.focus();

		if (this.isExpanded()) {
			if (this.repository.input.visible) {
				this.inputBox.focus();
			} else {
				this.list.domFocus();
			}

			this.repository.focus();
		}
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

	private onListContextMenu(e: IListContextMenuEvent<ISCMResourceGroup | ISCMResource>): void {
		if (!e.element) {
			return;
		}

		const element = e.element;
		let actions: IAction[];

		if (isSCMResource(element)) {
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
		return this.list.getSelectedElements()
			.filter(r => isSCMResource(r)) as ISCMResource[];
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

	dispose(): void {
		this.visibilityDisposables = dispose(this.visibilityDisposables);
		super.dispose();
	}
}

class RepositoryViewDescriptor implements IViewDescriptor {

	private static counter = 0;

	readonly id: string;
	readonly name: string;
	readonly ctorDescriptor: { ctor: any, arguments?: any[] };
	readonly canToggleVisibility = true;
	readonly order = -500;
	readonly workspace = true;

	constructor(readonly repository: ISCMRepository, viewModel: IViewModel, readonly hideByDefault: boolean) {
		const repoId = repository.provider.rootUri ? repository.provider.rootUri.toString() : `#${RepositoryViewDescriptor.counter++}`;
		this.id = `scm:repository:${repository.provider.label}:${repoId}`;
		this.name = repository.provider.rootUri ? basename(repository.provider.rootUri) : repository.provider.label;

		this.ctorDescriptor = { ctor: RepositoryPanel, arguments: [repository, viewModel] };
	}
}

class MainPanelDescriptor implements IViewDescriptor {

	readonly id = MainPanel.ID;
	readonly name = MainPanel.TITLE;
	readonly ctorDescriptor: { ctor: any, arguments?: any[] };
	readonly canToggleVisibility = true;
	readonly hideByDefault = true;
	readonly order = -1000;
	readonly workspace = true;

	constructor(viewModel: IViewModel) {
		this.ctorDescriptor = { ctor: MainPanel, arguments: [viewModel] };
	}
}

export class SCMViewlet extends ViewContainerViewlet implements IViewModel {

	private static readonly STATE_KEY = 'workbench.scm.views.state';

	private repositoryCount = 0;
	private el: HTMLElement;
	private message: HTMLElement;
	private menus: SCMMenus;
	private _repositories: ISCMRepository[] = [];

	private mainPanelDescriptor = new MainPanelDescriptor(this);
	private viewDescriptors: RepositoryViewDescriptor[] = [];

	private _onDidSplice = new Emitter<ISpliceEvent<ISCMRepository>>();
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>> = this._onDidSplice.event;

	private _height: number | undefined = undefined;
	get height(): number | undefined { return this._height; }

	get repositories(): ISCMRepository[] {
		return this._repositories;
	}

	get visibleRepositories(): ISCMRepository[] {
		return this.panels.filter(panel => panel instanceof RepositoryPanel)
			.map(panel => (panel as RepositoryPanel).repository);
	}

	get onDidChangeVisibleRepositories(): Event<ISCMRepository[]> {
		const modificationEvent = Event.debounce(Event.any(this.viewsModel.onDidAdd, this.viewsModel.onDidRemove), () => null, 0);
		return Event.map(modificationEvent, () => this.visibleRepositories);
	}

	setVisibleRepositories(repositories: ISCMRepository[]): void {
		const visibleViewDescriptors = this.viewsModel.visibleViewDescriptors;

		const toSetVisible = this.viewsModel.viewDescriptors
			.filter((d): d is RepositoryViewDescriptor => d instanceof RepositoryViewDescriptor && repositories.indexOf(d.repository) > -1 && visibleViewDescriptors.indexOf(d) === -1);

		const toSetInvisible = visibleViewDescriptors
			.filter((d): d is RepositoryViewDescriptor => d instanceof RepositoryViewDescriptor && repositories.indexOf(d.repository) === -1);

		let size: number | undefined;
		const oneToOne = toSetVisible.length === 1 && toSetInvisible.length === 1;

		for (const viewDescriptor of toSetInvisible) {
			if (oneToOne) {
				const panel = this.panels.filter(panel => panel.id === viewDescriptor.id)[0];

				if (panel) {
					size = this.getPanelSize(panel);
				}
			}

			viewDescriptor.repository.setSelected(false);
			this.viewsModel.setVisible(viewDescriptor.id, false);
		}

		for (const viewDescriptor of toSetVisible) {
			viewDescriptor.repository.setSelected(true);
			this.viewsModel.setVisible(viewDescriptor.id, true, size);
		}
	}

	private readonly _onDidChangeRepositories = new Emitter<void>();
	private readonly onDidFinishStartup = Event.once(Event.debounce(this._onDidChangeRepositories.event, () => null, 1000));

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@INotificationService protected notificationService: INotificationService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IThemeService protected themeService: IThemeService,
		@ICommandService protected commandService: ICommandService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
	) {
		super(VIEWLET_ID, SCMViewlet.STATE_KEY, true, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);

		this.menus = instantiationService.createInstance(SCMMenus, undefined);
		this._register(this.menus.onDidChangeTitle(this.updateTitleArea, this));

		this.message = $('.empty-message', { tabIndex: 0 }, localize('no open repo', "No source control providers registered."));

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('scm.alwaysShowProviders')) {
				this.onDidChangeRepositories();
			}
		}));

		this._register(this.onDidFinishStartup(this.onAfterStartup, this));
		this._register(this.viewsModel.onDidRemove(this.onDidHideView, this));
	}

	create(parent: HTMLElement): void {
		super.create(parent);

		this.el = parent;
		addClasses(parent, 'scm-viewlet', 'empty');
		append(parent, this.message);

		this._register(this.scmService.onDidAddRepository(this.onDidAddRepository, this));
		this._register(this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this));
		this.scmService.repositories.forEach(r => this.onDidAddRepository(r));
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const index = this._repositories.length;
		this._repositories.push(repository);

		const viewDescriptor = new RepositoryViewDescriptor(repository, this, false);
		Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);
		this.viewDescriptors.push(viewDescriptor);

		this._onDidSplice.fire({ index, deleteCount: 0, elements: [repository] });
		this.updateTitleArea();

		this.onDidChangeRepositories();
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		const index = this._repositories.indexOf(repository);

		if (index === -1) {
			return;
		}

		Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews([this.viewDescriptors[index]], VIEW_CONTAINER);

		this._repositories.splice(index, 1);
		this.viewDescriptors.splice(index, 1);

		this._onDidSplice.fire({ index, deleteCount: 1, elements: [] });
		this.updateTitleArea();

		this.onDidChangeRepositories();
	}

	private onDidChangeRepositories(): void {
		const repositoryCount = this.repositories.length;

		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		if (this.repositoryCount === 0 && repositoryCount !== 0) {
			viewsRegistry.registerViews([this.mainPanelDescriptor], VIEW_CONTAINER);
		} else if (this.repositoryCount !== 0 && repositoryCount === 0) {
			viewsRegistry.deregisterViews([this.mainPanelDescriptor], VIEW_CONTAINER);
		}

		const alwaysShowProviders = this.configurationService.getValue<boolean>('scm.alwaysShowProviders') || false;

		if (alwaysShowProviders && repositoryCount > 0) {
			this.viewsModel.setVisible(MainPanel.ID, true);
		}

		toggleClass(this.el, 'empty', repositoryCount === 0);
		this.repositoryCount = repositoryCount;

		this._onDidChangeRepositories.fire();
	}

	private onAfterStartup(): void {
		if (this.repositoryCount > 0 && this.viewDescriptors.every(d => !this.viewsModel.isVisible(d.id))) {
			this.viewsModel.setVisible(this.viewDescriptors[0].id, true);
		}
	}

	private onDidHideView(): void {
		nextTick(() => {
			if (this.repositoryCount > 0 && this.viewDescriptors.every(d => !this.viewsModel.isVisible(d.id))) {
				const alwaysShowProviders = this.configurationService.getValue<boolean>('scm.alwaysShowProviders') || false;
				this.viewsModel.setVisible(MainPanel.ID, alwaysShowProviders || this.repositoryCount > 1);
				this.viewsModel.setVisible(this.viewDescriptors[0].id, true);
			}
		});
	}

	focus(): void {
		if (this.repositoryCount === 0) {
			this.message.focus();
		} else {
			const repository = this.visibleRepositories[0];

			if (repository) {
				const panel = this.panels
					.filter(panel => panel instanceof RepositoryPanel && panel.repository === repository)[0] as RepositoryPanel | undefined;

				if (panel) {
					panel.focus();
				} else {
					super.focus();
				}
			} else {
				super.focus();
			}
		}
	}

	getOptimalWidth(): number {
		return 400;
	}

	getTitle(): string {
		const title = localize('source control', "Source Control");

		if (this.visibleRepositories.length === 1) {
			const [repository] = this.repositories;
			return localize('viewletTitle', "{0}: {1}", title, repository.provider.label);
		} else {
			return title;
		}
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
	}

	getActions(): IAction[] {
		if (this.repositories.length > 0) {
			return super.getActions();
		}

		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		if (this.repositories.length > 0) {
			return super.getSecondaryActions();
		}

		return this.menus.getTitleSecondaryActions();
	}

	getActionsContext(): any {
		if (this.visibleRepositories.length === 1) {
			return this.repositories[0].provider;
		}
	}
}
