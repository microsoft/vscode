/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { domEvent, stop } from 'vs/base/browser/event';
import { basename } from 'vs/base/common/paths';
import { IDisposable, dispose, combinedDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { PanelViewlet, ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus, Dimension, addDisposableListener, removeClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer, IListContextMenuEvent, IListEvent, IKeyboardNavigationLabelProvider, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID, VIEW_CONTAINER } from 'vs/workbench/parts/scm/common/scm';
import { ResourceLabels, IResourceLabel, IResourceLabelsContainer } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMRepository, ISCMResourceGroup, ISCMResource, InputValidationType } from 'vs/workbench/services/scm/common/scm';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction, IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction, Action, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { fillInContextMenuActions, ContextAwareMenuItemActionItem, fillInActionBarActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { SCMMenus } from './scmMenus';
import { ActionBar, IActionItemProvider, Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isSCMResource } from './scmUtil';
import { attachBadgeStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { Command } from 'vs/editor/common/modes';
import { renderOcticons } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { format } from 'vs/base/common/strings';
import { ISpliceable, ISequence, ISplice } from 'vs/base/common/sequence';
import { firstIndex, equals } from 'vs/base/common/arrays';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ThrottledDelayer } from 'vs/base/common/async';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IViewDescriptorRef, PersistentContributableViewsModel, IAddedViewDescriptorRef } from 'vs/workbench/browser/parts/views/views';
import { IViewDescriptor, IViewsViewlet, IView } from 'vs/workbench/common/views';
import { IPanelDndController, Panel } from 'vs/base/browser/ui/splitview/panelview';
import * as platform from 'vs/base/common/platform';

export interface ISpliceEvent<T> {
	index: number;
	deleteCount: number;
	elements: T[];
}

export interface IViewModel {
	readonly repositories: ISCMRepository[];
	readonly selectedRepositories: ISCMRepository[];
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>>;

	isVisible(): boolean;
	readonly onDidChangeVisibility: Event<boolean>;

	hide(repository: ISCMRepository): void;
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
		this.tooltip = command.tooltip;
	}

	run(): Promise<void> {
		return this.commandService.executeCommand(this.command.id, ...this.command.arguments);
	}
}

class StatusBarActionItem extends ActionItem {

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
	let cachedPrimary: IAction[] = [];

	const updateActions = () => {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		fillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		if (equals(cachedPrimary, primary, (a, b) => a.id === b.id)) {
			return;
		}

		cachedPrimary = primary;
		actionBar.clear();
		actionBar.push(primary, { icon: true, label: false });
	};

	updateActions();
	return menu.onDidChange(updateActions);
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
		const actionBar = new ActionBar(provider, { actionItemProvider: a => new StatusBarActionItem(a as StatusBarAction) });
		const disposable = Disposable.None;
		const templateDisposable = combinedDisposable([actionBar, badgeStyler]);

		return { title, type, countContainer, count, actionBar, disposable, templateDisposable };
	}

	renderElement(repository: ISCMRepository, index: number, templateData: RepositoryTemplateData): void {
		templateData.disposable.dispose();
		const disposables: IDisposable[] = [];

		if (repository.provider.rootUri) {
			templateData.title.textContent = basename(repository.provider.rootUri.fsPath);
			templateData.type.textContent = repository.provider.label;
		} else {
			templateData.title.textContent = repository.provider.label;
			templateData.type.textContent = '';
		}

		// const disposables = commands.map(c => this.statusbarService.addEntry({
		// 	text: c.title,
		// 	tooltip: `${repository.provider.label} - ${c.tooltip}`,
		// 	command: c.id,
		// 	arguments: c.arguments
		// }, MainThreadStatusBarAlignment.LEFT, 10000));

		const actions: IAction[] = [];
		const disposeActions = () => dispose(actions);
		disposables.push({ dispose: disposeActions });

		const update = () => {
			disposeActions();

			const commands = repository.provider.statusBarCommands || [];
			actions.splice(0, actions.length, ...commands.map(c => new StatusBarAction(c, this.commandService)));
			templateData.actionBar.clear();
			templateData.actionBar.push(actions);

			const count = repository.provider.count || 0;
			toggleClass(templateData.countContainer, 'hidden', count === 0);
			templateData.count.setCount(repository.provider.count);
		};

		repository.provider.onDidChange(update, null, disposables);
		update();

		templateData.disposable = combinedDisposable(disposables);
	}

	disposeTemplate(templateData: RepositoryTemplateData): void {
		templateData.disposable.dispose();
		templateData.templateDisposable.dispose();
	}
}

class MainPanel extends ViewletPanel {

	private list: List<ISCMRepository>;
	private visibilityDisposables: IDisposable[] = [];

	private previousSelection: ISCMRepository[] | undefined = undefined;
	private _onSelectionChange = new Emitter<ISCMRepository[]>();
	readonly onSelectionChange: Event<ISCMRepository[]> = this._onSelectionChange.event;

	constructor(
		protected viewModel: IViewModel,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ id: 'scm.mainPanel', title: localize('scm providers', "Source Control Providers") }, keybindingService, contextMenuService, configurationService);
		this.updateBodySize();
	}

	focus(): void {
		super.focus();
		this.list.domFocus();
	}

	hide(repository: ISCMRepository): void {
		const selectedElements = this.list.getSelectedElements();
		const index = selectedElements.indexOf(repository);

		if (index === -1) {
			return;
		}

		const selection = this.list.getSelection();
		this.list.setSelection([...selection.slice(0, index), ...selection.slice(index + 1)]);
	}

	getSelection(): ISCMRepository[] {
		return this.list.getSelectedElements();
	}

	protected renderBody(container: HTMLElement): void {
		const delegate = new ProvidersListDelegate();
		const renderer = this.instantiationService.createInstance(ProviderRenderer);
		const identityProvider = { getId: r => r.provider.id };

		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [renderer], { identityProvider }) as WorkbenchList<ISCMRepository>;

		this.list.onSelectionChange(this.onListSelectionChange, this, this.disposables);
		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);

		this.viewModel.onDidChangeVisibility(this.onDidChangeVisibility, this, this.disposables);
		this.onDidChangeVisibility(this.viewModel.isVisible());

		this.disposables.push(this.list);
	}

	private onDidChangeVisibility(visible: boolean): void {
		if (visible) {
			this.viewModel.onDidSplice(({ index, deleteCount, elements }) => this.splice(index, deleteCount, elements), null, this.visibilityDisposables);
			this.splice(0, 0, this.viewModel.repositories);
		} else {
			this.visibilityDisposables = dispose(this.visibilityDisposables);
			this.splice(0, this.list.length);
		}
	}

	private splice(index: number, deleteCount: number, repositories: ISCMRepository[] = []): void {
		const wasEmpty = this.list.length === 0;

		this.list.splice(index, deleteCount, repositories);
		this.updateBodySize();

		// Automatically select the first one
		if (wasEmpty && this.list.length > 0) {
			this.restoreSelection();
		}
	}

	protected layoutBody(size: number): void {
		this.list.layout(size);
	}

	private updateBodySize(): void {
		const count = this.viewModel.repositories.length;

		if (count <= 5) {
			const size = count * 22;
			this.minimumBodySize = size;
			this.maximumBodySize = size;
		} else {
			this.minimumBodySize = 5 * 22;
			this.maximumBodySize = Number.POSITIVE_INFINITY;
		}
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

		fillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => g === 'inline');

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
	}

	private onListSelectionChange(e: IListEvent<ISCMRepository>): void {
		// select one repository if the selected one is gone
		if (e.elements.length === 0 && this.list.length > 0) {
			this.restoreSelection();
			return;
		}

		if (e.elements.length > 0) {
			this.previousSelection = e.elements;
		}

		this._onSelectionChange.fire(e.elements);
	}

	private restoreSelection(): void {
		let selection: number[];

		if (this.previousSelection) {
			selection = this.previousSelection
				.map(r => this.viewModel.repositories.indexOf(r))
				.filter(i => i > -1);
		}

		if (!selection || selection.length === 0) {
			selection = [0];
		}

		this.list.setSelection(selection);
		this.list.setFocus([selection[0]]);
	}

	dispose(): void {
		this.visibilityDisposables = dispose(this.visibilityDisposables);
		super.dispose();
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
		private actionItemProvider: IActionItemProvider,
		private themeService: IThemeService,
		private menus: SCMMenus
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
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

		const disposables: IDisposable[] = [];
		disposables.push(connectPrimaryMenuToInlineActionBar(this.menus.getResourceGroupMenu(group), template.actionBar));

		const updateCount = () => template.count.setCount(group.elements.length);
		group.onDidSplice(updateCount, null, disposables);
		updateCount();

		template.elementDisposable = combinedDisposable(disposables);
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
		private actionItemProvider: IActionItemProvider,
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
			actionItemProvider: this.actionItemProvider,
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
		template.actionBar.context = resource;

		const disposables: IDisposable[] = [];
		disposables.push(connectPrimaryMenuToInlineActionBar(this.menus.getResourceMenu(resource.resourceGroup), template.actionBar));

		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);
		toggleClass(template.element, 'faded', resource.decorations.faded);

		if (icon) {
			template.decorationIcon.style.display = '';
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = resource.decorations.tooltip;
		} else {
			template.decorationIcon.style.display = 'none';
			template.decorationIcon.style.backgroundImage = '';
		}

		template.element.setAttribute('data-tooltip', resource.decorations.tooltip);
		template.elementDisposable = combinedDisposable(disposables);
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
			return basename(e.sourceUri.fsPath);
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

			const disposable = combinedDisposable([
				group.onDidChange(() => this.onDidChangeGroup(group)),
				group.onDidSplice(splice => this.onDidSpliceGroup(group, splice))
			]);

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
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private listLabels: ResourceLabels;
	private menus: SCMMenus;
	private visibilityDisposables: IDisposable[] = [];
	protected contextKeyService: IContextKeyService;

	constructor(
		id: string,
		readonly repository: ISCMRepository,
		private viewModel: IViewModel,
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
		super({ id, title: repository.provider.label }, keybindingService, contextMenuService, configurationService);
		this.menus = instantiationService.createInstance(SCMMenus, repository.provider);
		this.menus.onDidChangeTitle(this._onDidChangeTitleArea.fire, this._onDidChangeTitleArea, this.disposables);

		this.contextKeyService = contextKeyService.createScoped(this.element);
		this.contextKeyService.createKey('scmRepository', repository);
	}

	render(): void {
		super.render();
		this.menus.onDidChangeTitle(this.updateActions, this, this.disposables);
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		let title: string;
		let type: string;

		if (this.repository.provider.rootUri) {
			title = basename(this.repository.provider.rootUri.fsPath);
			type = this.repository.provider.label;
		} else {
			title = this.repository.provider.label;
			type = '';
		}

		super.renderHeaderTitle(container, title);
		addClass(container, 'scm-provider');
		append(container, $('span.type', null, type));
		const onContextMenu = Event.map(stop(domEvent(container, 'contextmenu')), e => new StandardMouseEvent(e));
		onContextMenu(this.onContextMenu, this, this.disposables);
	}

	private onContextMenu(event: StandardMouseEvent): void {
		if (this.viewModel.selectedRepositories.length <= 1) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: event.posx, y: event.posy }),
			getActions: () => [<IAction>{
				id: `scm.hideRepository`,
				label: localize('hideRepository', "Hide"),
				enabled: true,
				run: () => this.viewModel.hide(this.repository)
			}],
		});
	}

	protected renderBody(container: HTMLElement): void {
		const focusTracker = trackFocus(container);
		this.disposables.push(focusTracker.onDidFocus(() => this.repository.focus()));
		this.disposables.push(focusTracker);

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
			return this.repository.input.validateInput(this.inputBox.value, this.inputBox.inputElement.selectionStart).then(result => {
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

		this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, { flexibleHeight: true });
		this.inputBox.setEnabled(this.isBodyVisible());
		this.disposables.push(attachInputBoxStyler(this.inputBox, this.themeService));
		this.disposables.push(this.inputBox);

		this.inputBox.onDidChange(triggerValidation, null, this.disposables);

		const onKeyUp = domEvent(this.inputBox.inputElement, 'keyup');
		const onMouseUp = domEvent(this.inputBox.inputElement, 'mouseup');
		Event.any<any>(onKeyUp, onMouseUp)(triggerValidation, null, this.disposables);

		this.inputBox.value = this.repository.input.value;
		this.inputBox.onDidChange(value => this.repository.input.value = value, null, this.disposables);
		this.repository.input.onDidChange(value => this.inputBox.value = value, null, this.disposables);

		updatePlaceholder();
		this.repository.input.onDidChangePlaceholder(updatePlaceholder, null, this.disposables);
		this.keybindingService.onDidUpdateKeybindings(updatePlaceholder, null, this.disposables);

		this.disposables.push(this.inputBox.onDidHeightChange(() => this.layoutBody()));

		if (this.repository.provider.onDidChangeCommitTemplate) {
			this.repository.provider.onDidChangeCommitTemplate(this.updateInputBox, this, this.disposables);
		}

		this.updateInputBox();

		// Input box visibility
		this.repository.input.onDidChangeVisibility(this.updateInputBoxVisibility, this, this.disposables);
		this.updateInputBoxVisibility();

		// List
		this.listContainer = append(container, $('.scm-status.show-file-icons'));

		const updateActionsVisibility = () => toggleClass(this.listContainer, 'show-actions', this.configurationService.getValue<boolean>('scm.alwaysShowActions'));
		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowActions'))(updateActionsVisibility);
		updateActionsVisibility();

		const delegate = new ProviderListDelegate();

		const actionItemProvider = (action: IAction) => this.getActionItem(action);

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility } as IResourceLabelsContainer);
		this.disposables.push(this.listLabels);

		const renderers = [
			new ResourceGroupRenderer(actionItemProvider, this.themeService, this.menus),
			new ResourceRenderer(this.listLabels, actionItemProvider, () => this.getSelectedResources(), this.themeService, this.menus)
		];

		this.list = this.instantiationService.createInstance(WorkbenchList, this.listContainer, delegate, renderers, {
			identityProvider: scmResourceIdentityProvider,
			keyboardNavigationLabelProvider: scmKeyboardNavigationLabelProvider
		}) as WorkbenchList<ISCMResourceGroup | ISCMResource>;

		Event.chain(this.list.onDidOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.open, this, this.disposables);

		Event.chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.pin, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.disposables.push(this.list);

		this.viewModel.onDidChangeVisibility(this.onDidChangeVisibility, this, this.disposables);
		this.onDidChangeVisibility(this.viewModel.isVisible());
		this.onDidChangeBodyVisibility(visible => this.inputBox.setEnabled(visible));
	}

	private onDidChangeVisibility(visible: boolean): void {
		if (visible) {
			const listSplicer = new ResourceGroupSplicer(this.repository.provider.groups, this.list);
			this.visibilityDisposables.push(listSplicer);
		} else {
			this.visibilityDisposables = dispose(this.visibilityDisposables);
		}
	}

	layoutBody(height: number = this.cachedHeight): void {
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
			this.list.layout(listHeight);

			toggleClass(this.inputBoxContainer, 'scroll', editorHeight >= 134);
		} else {
			addClass(this.inputBoxContainer, 'hidden');
			removeClass(this.inputBoxContainer, 'scroll');

			this.listContainer.style.height = `${height}px`;
			this.list.layout(height);
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
		}
	}

	getActions(): IAction[] {
		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ContextAwareMenuItemActionItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
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

class SCMPanelDndController implements IPanelDndController {

	canDrag(panel: Panel): boolean {
		return !(panel instanceof MainPanel) && !(panel instanceof RepositoryPanel);
	}

	canDrop(panel: Panel, overPanel: Panel): boolean {
		return !(overPanel instanceof MainPanel) && !(overPanel instanceof RepositoryPanel);
	}
}

export class SCMViewlet extends PanelViewlet implements IViewModel, IViewsViewlet {

	private el: HTMLElement;
	private menus: SCMMenus;
	private mainPanel: MainPanel | null = null;
	private cachedMainPanelHeight: number | undefined;
	private mainPanelDisposable: IDisposable = Disposable.None;
	private _repositories: ISCMRepository[] = [];
	private repositoryPanels: RepositoryPanel[] = [];
	private singlePanelTitleActionsDisposable: IDisposable = Disposable.None;
	private disposables: IDisposable[] = [];
	private lastFocusedRepository: ISCMRepository | undefined;

	private _onDidSplice = new Emitter<ISpliceEvent<ISCMRepository>>();
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>> = this._onDidSplice.event;

	private _height: number | undefined = undefined;
	get height(): number | undefined { return this._height; }

	get repositories(): ISCMRepository[] { return this._repositories; }
	get selectedRepositories(): ISCMRepository[] { return this.repositoryPanels.map(p => p.repository); }

	private contributedViews: PersistentContributableViewsModel;
	private contributedViewDisposables: IDisposable[] = [];

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@INotificationService protected notificationService: INotificationService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IThemeService protected themeService: IThemeService,
		@ICommandService protected commandService: ICommandService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(VIEWLET_ID, { showHeaderInTitleWhenSingleView: true, dnd: new SCMPanelDndController() }, configurationService, partService, contextMenuService, telemetryService, themeService, storageService);

		this.menus = instantiationService.createInstance(SCMMenus, undefined);
		this.menus.onDidChangeTitle(this.updateTitleArea, this, this.disposables);

		this.contributedViews = instantiationService.createInstance(PersistentContributableViewsModel, VIEW_CONTAINER, 'scm.views');
		this.disposables.push(this.contributedViews);
	}

	create(parent: HTMLElement): void {
		super.create(parent);
		this.el = parent;
		addClass(this.el, 'scm-viewlet');
		addClass(this.el, 'empty');
		append(parent, $('div.empty-message', null, localize('no open repo', "No source control providers registered.")));

		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
		this.scmService.repositories.forEach(r => this.onDidAddRepository(r));

		const onDidUpdateConfiguration = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowProviders'));
		onDidUpdateConfiguration(this.onDidChangeRepositories, this, this.disposables);

		this.onDidChangeRepositories();

		this.contributedViews.onDidAdd(this.onDidAddContributedViews, this, this.disposables);
		this.contributedViews.onDidRemove(this.onDidRemoveContributedViews, this, this.disposables);

		let index = this.getContributedViewsStartIndex();
		const contributedViews: IAddedViewDescriptorRef[] = this.contributedViews.visibleViewDescriptors.map(viewDescriptor => {
			const size = this.contributedViews.getSize(viewDescriptor.id);
			const collapsed = this.contributedViews.isCollapsed(viewDescriptor.id);
			return { viewDescriptor, index: index++, size, collapsed };
		});
		if (contributedViews.length) {
			this.onDidAddContributedViews(contributedViews);
		}

		this.onDidSashChange(this.saveContributedViewSizes, this, this.disposables);
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const index = this._repositories.length;
		this._repositories.push(repository);
		this._onDidSplice.fire({ index, deleteCount: 0, elements: [repository] });
		this.onDidChangeRepositories();

		if (!this.mainPanel) {
			this.onSelectionChange(this.repositories);
		}
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		const index = this._repositories.indexOf(repository);

		if (index === -1) {
			return;
		}

		this._repositories.splice(index, 1);
		this._onDidSplice.fire({ index, deleteCount: 1, elements: [] });
		this.onDidChangeRepositories();

		if (!this.mainPanel) {
			this.onSelectionChange(this.repositories);
		}
	}

	private onDidChangeRepositories(): void {
		toggleClass(this.el, 'empty', this.scmService.repositories.length === 0);

		if (this.scmService.repositories.length === 0) {
			this.el.tabIndex = 0;
		} else {
			this.el.removeAttribute('tabIndex');
		}

		const shouldMainPanelAlwaysBeVisible = this.configurationService.getValue('scm.alwaysShowProviders');
		const shouldMainPanelBeVisible = shouldMainPanelAlwaysBeVisible || this.scmService.repositories.length > 1;

		if (!!this.mainPanel === shouldMainPanelBeVisible) {
			return;
		}

		if (shouldMainPanelBeVisible) {
			this.mainPanel = this.instantiationService.createInstance(MainPanel, this);
			this.mainPanel.render();
			this.addPanels([{ panel: this.mainPanel, size: this.mainPanel.minimumSize, index: 0 }]);

			const selectionChangeDisposable = this.mainPanel.onSelectionChange(this.onSelectionChange, this);
			this.onSelectionChange(this.mainPanel.getSelection());

			this.mainPanelDisposable = toDisposable(() => {
				this.removePanels([this.mainPanel]);
				selectionChangeDisposable.dispose();
				this.mainPanel.dispose();
			});
		} else {
			this.mainPanelDisposable.dispose();
			this.mainPanelDisposable = Disposable.None;
			this.mainPanel = null;
		}
	}

	private getContributedViewsStartIndex(): number {
		return (this.mainPanel ? 1 : 0) + this.repositoryPanels.length;
	}

	focus(): void {
		if (this.scmService.repositories.length === 0) {
			this.el.focus();
		} else {
			super.focus();
		}
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);

		if (!visible) {
			this.cachedMainPanelHeight = this.getPanelSize(this.mainPanel);
		}

		const start = this.getContributedViewsStartIndex();

		for (let i = 0; i < this.contributedViews.visibleViewDescriptors.length; i++) {
			const panel = this.panels[start + i] as ViewletPanel;
			panel.setVisible(visible);
		}

		this.repositoryPanels.forEach(panel => panel.setVisible(visible));
	}

	getOptimalWidth(): number {
		return 400;
	}

	getTitle(): string {
		const title = localize('source control', "Source Control");

		if (this.repositories.length === 1) {
			const [repository] = this.repositories;
			return localize('viewletTitle', "{0}: {1}", title, repository.provider.label);
		} else {
			return title;
		}
	}

	getActions(): IAction[] {
		if (this.isSingleView()) {
			return this.panels[0].getActions();
		}

		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		if (this.isSingleView()) {
			return this.panels[0].getSecondaryActions();
		} else {
			return this.menus.getTitleSecondaryActions();
		}
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ContextAwareMenuItemActionItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
	}

	private didLayout = false;
	layout(dimension: Dimension): void {
		super.layout(dimension);
		this._height = dimension.height;

		if (this.didLayout) {
			// 	this.saveViewSizes();
		} else {
			this.didLayout = true;
			this.restoreContributedViewSizes();
		}
	}

	movePanel(from: ViewletPanel, to: ViewletPanel): void {
		const start = this.getContributedViewsStartIndex();
		const fromIndex = firstIndex(this.panels, panel => panel === from) - start;
		const toIndex = firstIndex(this.panels, panel => panel === to) - start;
		const fromViewDescriptor = this.contributedViews.viewDescriptors[fromIndex];
		const toViewDescriptor = this.contributedViews.viewDescriptors[toIndex];

		super.movePanel(from, to);
		this.contributedViews.move(fromViewDescriptor.id, toViewDescriptor.id);
	}

	private onSelectionChange(repositories: ISCMRepository[]): void {
		const wasSingleView = this.isSingleView();
		const contributableViewsHeight = this.getContributableViewsSize();

		// Collect unselected panels
		const panelsToRemove = this.repositoryPanels
			.filter(p => repositories.every(r => p.repository !== r));

		// Collect panels still selected
		const repositoryPanels = this.repositoryPanels
			.filter(p => repositories.some(r => p.repository === r));

		// Collect new selected panels
		const newRepositoryPanels = repositories
			.filter(r => this.repositoryPanels.every(p => p.repository !== r))
			.map((r, index) => {
				const panel = this.instantiationService.createInstance(RepositoryPanel, `scm.repository.${r.provider.label}.${index}`, r, this);
				panel.render();
				panel.setVisible(true);
				return panel;
			});

		// Add new selected panels
		let index = repositoryPanels.length + (this.mainPanel ? 1 : 0);
		this.repositoryPanels = [...repositoryPanels, ...newRepositoryPanels];
		newRepositoryPanels.forEach(panel => {
			this.addPanels([{ panel, size: panel.minimumSize, index: index++ }]);
			panel.repository.focus();
			panel.onDidFocus(() => this.lastFocusedRepository = panel.repository);

			if (this.lastFocusedRepository === panel.repository) {
				panel.focus();
			}
		});

		// Remove unselected panels
		this.removePanels(panelsToRemove);

		// Restore main panel height
		if (this.isVisible() && typeof this.cachedMainPanelHeight === 'number') {
			this.resizePanel(this.mainPanel, this.cachedMainPanelHeight);
			this.cachedMainPanelHeight = undefined;
		}

		// Resize all panels equally
		const height = typeof this.height === 'number' ? this.height : 1000;
		const mainPanelHeight = this.getPanelSize(this.mainPanel);
		const size = (height - mainPanelHeight - contributableViewsHeight) / repositories.length;
		for (const panel of this.repositoryPanels) {
			this.resizePanel(panel, size);
		}

		// Resize contributed view sizes
		this.restoreContributedViewSizes();

		// React to menu changes for single view mode
		if (wasSingleView !== this.isSingleView()) {
			this.singlePanelTitleActionsDisposable.dispose();

			if (this.isSingleView()) {
				this.singlePanelTitleActionsDisposable = this.panels[0].onDidChangeTitleArea(this.updateTitleArea, this);
			}

			this.updateTitleArea();
		}

		if (this.isVisible()) {
			panelsToRemove.forEach(p => p.repository.setSelected(false));
			newRepositoryPanels.forEach(p => p.repository.setSelected(true));
		}
	}

	private getContributableViewsSize(): number {
		let value = 0;

		for (let i = this.getContributedViewsStartIndex(); i < this.length; i++) {
			value += this.getPanelSize(this.panels[i]);
		}

		return value;
	}

	onDidAddContributedViews(added: IAddedViewDescriptorRef[]): void {
		const start = this.getContributedViewsStartIndex();
		const panelsToAdd: { panel: ViewletPanel, size: number, index: number }[] = [];

		for (const { viewDescriptor, collapsed, index, size } of added) {
			const panel = this.instantiationService.createInstance(viewDescriptor.ctor, <IViewletPanelOptions>{
				id: viewDescriptor.id,
				title: viewDescriptor.name,
				actionRunner: this.getActionRunner(),
				expanded: !collapsed
			}) as ViewletPanel;
			panel.render();
			panel.setVisible(true);
			const contextMenuDisposable = addDisposableListener(panel.draggableElement, 'contextmenu', e => {
				e.stopPropagation();
				e.preventDefault();
				this.onViewHeaderContextMenu(new StandardMouseEvent(e), viewDescriptor);
			});

			const collapseDisposable = Event.latch(Event.map(panel.onDidChange, () => !panel.isExpanded()))(collapsed => {
				this.contributedViews.setCollapsed(viewDescriptor.id, collapsed);
			});

			this.contributedViewDisposables.splice(index, 0, combinedDisposable([contextMenuDisposable, collapseDisposable]));
			panelsToAdd.push({ panel, size: size || panel.minimumSize, index: start + index });
		}

		this.addPanels(panelsToAdd);
	}

	private onViewHeaderContextMenu(event: StandardMouseEvent, viewDescriptor: IViewDescriptor): void {
		const actions: IAction[] = [];
		actions.push(<IAction>{
			id: `${viewDescriptor.id}.removeView`,
			label: localize('hideView', "Hide"),
			enabled: viewDescriptor.canToggleVisibility,
			run: () => this.contributedViews.setVisible(viewDescriptor.id, !this.contributedViews.isVisible(viewDescriptor.id))
		});

		const otherActions = this.getContextMenuActions();
		if (otherActions.length) {
			actions.push(...[new Separator(), ...otherActions]);
		}

		let anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions
		});
	}

	getContextMenuActions(): IAction[] {
		const result: IAction[] = [];
		const viewToggleActions = this.contributedViews.viewDescriptors.map(viewDescriptor => (<IAction>{
			id: `${viewDescriptor.id}.toggleVisibility`,
			label: viewDescriptor.name,
			checked: this.contributedViews.isVisible(viewDescriptor.id),
			enabled: viewDescriptor.canToggleVisibility,
			run: () => this.contributedViews.setVisible(viewDescriptor.id, !this.contributedViews.isVisible(viewDescriptor.id))
		}));

		result.push(...viewToggleActions);
		const parentActions = super.getContextMenuActions();
		if (viewToggleActions.length && parentActions.length) {
			result.push(new Separator());
		}
		result.push(...parentActions);
		return result;
	}

	onDidRemoveContributedViews(removed: IViewDescriptorRef[]): void {
		removed = removed.sort((a, b) => b.index - a.index);
		const start = this.getContributedViewsStartIndex();
		const panelsToRemove: ViewletPanel[] = [];

		for (const { index } of removed) {
			const [disposable] = this.contributedViewDisposables.splice(index, 1);
			disposable.dispose();
			panelsToRemove.push(this.panels[start + index]);
		}

		this.removePanels(panelsToRemove);
		dispose(panelsToRemove);
	}

	private saveContributedViewSizes(): void {
		const start = this.getContributedViewsStartIndex();

		for (let i = 0; i < this.contributedViews.viewDescriptors.length; i++) {
			const viewDescriptor = this.contributedViews.viewDescriptors[i];
			const size = this.getPanelSize(this.panels[start + i]);

			this.contributedViews.setSize(viewDescriptor.id, size);
		}
	}

	private restoreContributedViewSizes(): void {
		if (!this.didLayout) {
			return;
		}

		const start = this.getContributedViewsStartIndex();

		for (let i = 0; i < this.contributedViews.viewDescriptors.length; i++) {
			const panel = this.panels[start + i];
			const viewDescriptor = this.contributedViews.viewDescriptors[i];
			const size = this.contributedViews.getSize(viewDescriptor.id);

			if (typeof size === 'number') {
				this.resizePanel(panel, size);
			}
		}
	}

	protected isSingleView(): boolean {
		return super.isSingleView() && this.repositoryPanels.length + this.contributedViews.visibleViewDescriptors.length === 1;
	}

	openView(id: string, focus?: boolean): IView {
		if (focus) {
			this.focus();
		}
		let panel = this.panels.filter(panel => panel instanceof ViewletPanel && panel.id === id)[0];
		if (!panel) {
			this.contributedViews.setVisible(id, true);
		}
		panel = this.panels.filter(panel => panel instanceof ViewletPanel && panel.id === id)[0];
		panel.setExpanded(true);
		if (focus) {
			panel.focus();
		}
		return panel;
	}

	hide(repository: ISCMRepository): void {
		if (!this.mainPanel) {
			return;
		}

		this.mainPanel.hide(repository);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.contributedViewDisposables = dispose(this.contributedViewDisposables);
		this.mainPanelDisposable.dispose();
		super.dispose();
	}
}
