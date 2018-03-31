/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Event, Emitter, chain, mapEvent, anyEvent, filterEvent } from 'vs/base/common/event';
import { domEvent, stop } from 'vs/base/browser/event';
import { basename } from 'vs/base/common/paths';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose, combinedDisposable, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { PanelViewlet, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus, Dimension } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent, IListEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMRepository, ISCMResourceGroup, ISCMResource, InputValidationType } from 'vs/workbench/services/scm/common/scm';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction, Action, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { fillInActions, ContextAwareMenuItemActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { SCMMenus } from './scmMenus';
import { ActionBar, IActionItemProvider, Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isSCMResource, getSCMResourceContextKey } from './scmUtil';
import { attachBadgeStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Command } from 'vs/editor/common/modes';
import { renderOcticons } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import * as platform from 'vs/base/common/platform';
import { format } from 'vs/base/common/strings';
import { ISpliceable, ISequence, ISplice } from 'vs/base/common/sequence';
import { firstIndex } from 'vs/base/common/arrays';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ThrottledDelayer } from 'vs/base/common/async';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IPartService } from 'vs/workbench/services/part/common/partService';

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

class ProvidersListDelegate implements IDelegate<ISCMRepository> {

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

	run(): TPromise<void> {
		return this.commandService.executeCommand(this.command.id, ...this.command.arguments);
	}
}

class StatusBarActionItem extends ActionItem {

	constructor(action: StatusBarAction) {
		super(null, action, {});
	}

	_updateLabel(): void {
		if (this.options.label) {
			this.$e.innerHtml(renderOcticons(this.getAction().label));
		}
	}
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

class ProviderRenderer implements IRenderer<ISCMRepository, RepositoryTemplateData> {

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
		const disposable = EmptyDisposable;
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
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(localize('scm providers', "Source Control Providers"), {}, keybindingService, contextMenuService, configurationService);
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

		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [renderer], {
			identityProvider: repository => repository.provider.id
		}) as WorkbenchList<ISCMRepository>;

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
		const repository = e.element;

		const contextKeyService = this.contextKeyService.createScoped();
		const scmProviderKey = contextKeyService.createKey<string | undefined>('scmProvider', void 0);
		scmProviderKey.set(repository.provider.contextValue);

		const menu = this.menuService.createMenu(MenuId.SCMSourceControl, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		fillInActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		if (secondary.length === 0) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => TPromise.as(secondary),
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
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	elementDisposable: IDisposable;
	dispose: () => void;
}

class ResourceGroupRenderer implements IRenderer<ISCMResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private actionItemProvider: IActionItemProvider,
		private themeService: IThemeService,
		private contextKeyService: IContextKeyService,
		private contextMenuService: IContextMenuService,
		private menuService: IMenuService
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);
		const elementDisposable = EmptyDisposable;

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

		const contextKeyService = this.contextKeyService.createScoped();
		disposables.push(contextKeyService);

		contextKeyService.createKey('scmProvider', group.provider.contextValue);
		contextKeyService.createKey('scmResourceGroup', getSCMResourceContextKey(group));

		const menu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, contextKeyService);
		disposables.push(menu);

		const updateActions = () => {
			const primary: IAction[] = [];
			const secondary: IAction[] = [];
			const result = { primary, secondary };
			fillInActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

			template.actionBar.clear();
			template.actionBar.push(primary, { icon: true, label: false });
		};

		menu.onDidChange(updateActions, null, disposables);
		updateActions();

		const updateCount = () => template.count.setCount(group.elements.length);
		group.onDidSplice(updateCount, null, disposables);
		updateCount();

		template.elementDisposable = combinedDisposable(disposables);
	}

	disposeTemplate(template: ResourceGroupTemplate): void {
		template.dispose();
	}
}

interface ResourceTemplate {
	element: HTMLElement;
	name: HTMLElement;
	fileLabel: FileLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: IDisposable;
	dispose: () => void;
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => ISCMResource[]) {
		super();
	}

	runAction(action: IAction, context: ISCMResource): TPromise<any> {
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

class ResourceRenderer implements IRenderer<ISCMResource, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private actionItemProvider: IActionItemProvider,
		private getSelectedResources: () => ISCMResource[],
		private themeService: IThemeService,
		private instantiationService: IInstantiationService,
		private contextKeyService: IContextKeyService,
		private contextMenuService: IContextMenuService,
		private menuService: IMenuService
	) { }

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.instantiationService.createInstance(FileLabel, name, void 0);
		const actionsContainer = append(fileLabel.element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(this.getSelectedResources)
		});

		const decorationIcon = append(element, $('.decoration-icon'));

		return {
			element, name, fileLabel, decorationIcon, actionBar, elementDisposable: EmptyDisposable, dispose: () => {
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

		const contextKeyService = this.contextKeyService.createScoped();
		disposables.push(contextKeyService);

		contextKeyService.createKey('scmProvider', resource.resourceGroup.provider.contextValue);
		contextKeyService.createKey('scmResourceGroup', getSCMResourceContextKey(resource.resourceGroup));

		const menu = this.menuService.createMenu(MenuId.SCMResourceContext, contextKeyService);
		disposables.push(menu);

		const updateActions = () => {
			const primary: IAction[] = [];
			const secondary: IAction[] = [];
			const result = { primary, secondary };
			fillInActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

			template.actionBar.clear();
			template.actionBar.push(primary, { icon: true, label: false });
		};

		menu.onDidChange(updateActions, null, disposables);
		updateActions();

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

	disposeTemplate(template: ResourceTemplate): void {
		template.elementDisposable.dispose();
		template.dispose();
	}
}

class ProviderListDelegate implements IDelegate<ISCMResourceGroup | ISCMResource> {

	getHeight() { return 22; }

	getTemplateId(element: ISCMResourceGroup | ISCMResource) {
		return isSCMResource(element) ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

function scmResourceIdentityProvider(r: ISCMResourceGroup | ISCMResource): string {
	if (isSCMResource(r)) {
		const group = r.resourceGroup;
		const provider = group.provider;
		return `${provider.contextValue}/${group.id}/${r.sourceUri.toString()}`;
	} else {
		const provider = r.provider;
		return `${provider.contextValue}/${r.id}`;
	}
}

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
		const absoluteToInsert: (ISCMResourceGroup | ISCMResource)[] = [];

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
	private menus: SCMMenus;
	private visibilityDisposables: IDisposable[] = [];

	get onDidChangeTitle(): Event<void> {
		return this.menus.onDidChangeTitle;
	}

	constructor(
		readonly repository: ISCMRepository,
		private viewModel: IViewModel,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IThemeService protected themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@ICommandService protected commandService: ICommandService,
		@INotificationService private notificationService: INotificationService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IMenuService protected menuService: IMenuService
	) {
		super(repository.provider.label, {}, keybindingService, contextMenuService, configurationService);
		this.menus = instantiationService.createInstance(SCMMenus, repository.provider);
	}

	render(container: HTMLElement): void {
		super.render(container);
		this.menus.onDidChangeTitle(this.updateActions, this, this.disposables);
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		const header = append(container, $('.title.scm-provider'));
		const name = append(header, $('.name'));
		const title = append(name, $('span.title'));
		const type = append(name, $('span.type'));

		if (this.repository.provider.rootUri) {
			title.textContent = basename(this.repository.provider.rootUri.fsPath);
			type.textContent = this.repository.provider.label;
		} else {
			title.textContent = this.repository.provider.label;
			type.textContent = '';
		}

		const onContextMenu = mapEvent(stop(domEvent(container, 'contextmenu')), e => new StandardMouseEvent(e));
		onContextMenu(this.onContextMenu, this, this.disposables);
	}

	private onContextMenu(event: StandardMouseEvent): void {
		if (this.viewModel.selectedRepositories.length <= 1) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: event.posx, y: event.posy }),
			getActions: () => TPromise.as([<IAction>{
				id: `scm.hideRepository`,
				label: localize('hideRepository', "Hide"),
				enabled: true,
				run: () => this.viewModel.hide(this.repository)
			}]),
		});
	}

	protected renderBody(container: HTMLElement): void {
		const focusTracker = trackFocus(container);
		this.disposables.push(focusTracker.onDidFocus(() => this.repository.focus()));
		this.disposables.push(focusTracker);

		// Input
		this.inputBoxContainer = append(container, $('.scm-editor'));

		const updatePlaceholder = () => {
			const placeholder = format(this.repository.input.placeholder, platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
			this.inputBox.setPlaceHolder(placeholder);
		};

		const validationDelayer = new ThrottledDelayer(200);

		const validate = () => {
			validationDelayer.trigger(async (): TPromise<any> => {
				const result = await this.repository.input.validateInput(this.inputBox.value, this.inputBox.inputElement.selectionStart);

				if (!result) {
					this.inputBox.inputElement.removeAttribute('aria-invalid');
					this.inputBox.hideMessage();
				} else {
					this.inputBox.inputElement.setAttribute('aria-invalid', 'true');
					this.inputBox.showMessage({ content: result.message, type: convertValidationType(result.type) });
				}
			});
		};

		this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, { flexibleHeight: true });
		this.disposables.push(attachInputBoxStyler(this.inputBox, this.themeService));
		this.disposables.push(this.inputBox);

		this.inputBox.onDidChange(validate, null, this.disposables);

		const onKeyUp = domEvent(this.inputBox.inputElement, 'keyup');
		const onMouseUp = domEvent(this.inputBox.inputElement, 'mouseup');
		anyEvent<any>(onKeyUp, onMouseUp)(() => validate(), null, this.disposables);

		this.inputBox.value = this.repository.input.value;
		this.inputBox.onDidChange(value => this.repository.input.value = value, null, this.disposables);
		this.repository.input.onDidChange(value => this.inputBox.value = value, null, this.disposables);

		updatePlaceholder();
		this.repository.input.onDidChangePlaceholder(updatePlaceholder, null, this.disposables);

		this.disposables.push(this.inputBox.onDidHeightChange(() => this.layoutBody()));

		chain(domEvent(this.inputBox.inputElement, 'keydown'))
			.map(e => new StandardKeyboardEvent(e))
			.filter(e => e.equals(KeyMod.CtrlCmd | KeyCode.Enter) || e.equals(KeyMod.CtrlCmd | KeyCode.KEY_S))
			.on(this.onDidAcceptInput, this, this.disposables);

		if (this.repository.provider.onDidChangeCommitTemplate) {
			this.repository.provider.onDidChangeCommitTemplate(this.updateInputBox, this, this.disposables);
		}

		this.updateInputBox();

		// List

		this.listContainer = append(container, $('.scm-status.show-file-icons'));
		const delegate = new ProviderListDelegate();

		const actionItemProvider = (action: IAction) => this.getActionItem(action);

		const renderers = [
			new ResourceGroupRenderer(actionItemProvider, this.themeService, this.contextKeyService, this.contextMenuService, this.menuService),
			new ResourceRenderer(actionItemProvider, () => this.getSelectedResources(), this.themeService, this.instantiationService, this.contextKeyService, this.contextMenuService, this.menuService)
		];

		this.list = this.instantiationService.createInstance(WorkbenchList, this.listContainer, delegate, renderers, {
			identityProvider: scmResourceIdentityProvider
		}) as WorkbenchList<ISCMResourceGroup | ISCMResource>;

		chain(this.list.onOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.open, this, this.disposables);

		chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.pin, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.disposables.push(this.list);

		this.viewModel.onDidChangeVisibility(this.onDidChangeVisibility, this, this.disposables);
		this.onDidChangeVisibility(this.viewModel.isVisible());
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
		this.inputBox.layout();

		const editorHeight = this.inputBox.height;
		const listHeight = height - (editorHeight + 12 /* margin */);
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight);

		toggleClass(this.inputBoxContainer, 'scroll', editorHeight >= 134);
	}

	focus(): void {
		super.focus();

		if (this.isExpanded()) {
			this.inputBox.focus();
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
		e.open().done(undefined, onUnexpectedError);
	}

	private pin(): void {
		const activeEditor = this.editorService.getActiveEditor();
		const activeEditorInput = this.editorService.getActiveEditorInput();

		if (!activeEditor) {
			return;
		}

		this.editorGroupService.pinEditor(activeEditor.position, activeEditorInput);
		activeEditor.focus();
	}

	private onListContextMenu(e: IListContextMenuEvent<ISCMResourceGroup | ISCMResource>): void {
		const element = e.element;
		let actions: IAction[];

		if (isSCMResource(element)) {
			actions = this.menus.getResourceContextActions(element);
		} else {
			actions = this.menus.getResourceGroupContextActions(element);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => TPromise.as(actions),
			getActionsContext: () => element,
			actionRunner: new MultipleSelectionActionRunner(() => this.getSelectedResources())
		});
	}

	private getSelectedResources(): ISCMResource[] {
		return this.list.getSelectedElements()
			.filter(r => isSCMResource(r)) as ISCMResource[];
	}

	private updateInputBox(): void {
		if (typeof this.repository.provider.commitTemplate === 'undefined') {
			return;
		}

		this.inputBox.value = this.repository.provider.commitTemplate;
	}

	private onDidAcceptInput(): void {
		if (!this.repository.provider.acceptInputCommand) {
			return;
		}

		const id = this.repository.provider.acceptInputCommand.id;
		const args = this.repository.provider.acceptInputCommand.arguments;

		this.commandService.executeCommand(id, ...args)
			.done(undefined, onUnexpectedError);
	}

	dispose(): void {
		this.visibilityDisposables = dispose(this.visibilityDisposables);
		super.dispose();
	}
}

class InstallAdditionalSCMProvidersAction extends Action {

	constructor(@IViewletService private viewletService: IViewletService) {
		super('scm.installAdditionalSCMProviders', localize('installAdditionalSCMProviders', "Install Additional SCM Providers..."), '', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true).then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('category:"SCM Providers" @sort:installs');
				viewlet.focus();
			});
	}
}

export class SCMViewlet extends PanelViewlet implements IViewModel {

	private el: HTMLElement;
	private menus: SCMMenus;
	private mainPanel: MainPanel | null = null;
	private cachedMainPanelHeight: number | undefined;
	private mainPanelDisposable: IDisposable = EmptyDisposable;
	private _repositories: ISCMRepository[] = [];
	private repositoryPanels: RepositoryPanel[] = [];
	private singleRepositoryPanelTitleActionsDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	private _onDidSplice = new Emitter<ISpliceEvent<ISCMRepository>>();
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>> = this._onDidSplice.event;

	private _onDidChangeVisibility = new Emitter<boolean>();
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private _height: number | undefined = undefined;
	get height(): number | undefined { return this._height; }

	get repositories(): ISCMRepository[] { return this._repositories; }
	get selectedRepositories(): ISCMRepository[] { return this.repositoryPanels.map(p => p.repository); }

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
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super(VIEWLET_ID, { showHeaderInTitleWhenSingleView: true }, partService, contextMenuService, telemetryService, themeService);

		this.menus = instantiationService.createInstance(SCMMenus, undefined);
		this.menus.onDidChangeTitle(this.updateTitleArea, this, this.disposables);
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);

		this.el = parent.getHTMLElement();
		addClass(this.el, 'scm-viewlet');
		addClass(this.el, 'empty');
		append(parent.getHTMLElement(), $('div.empty-message', null, localize('no open repo', "There are no active source control providers.")));

		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
		this.scmService.repositories.forEach(r => this.onDidAddRepository(r));

		const onDidUpdateConfiguration = filterEvent(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowProviders'));
		onDidUpdateConfiguration(this.onDidChangeRepositories, this, this.disposables);

		this.onDidChangeRepositories();
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

		const shouldMainPanelAlwaysBeVisible = this.configurationService.getValue('scm.alwaysShowProviders');
		const shouldMainPanelBeVisible = shouldMainPanelAlwaysBeVisible || this.scmService.repositories.length > 1;

		if (!!this.mainPanel === shouldMainPanelBeVisible) {
			return;
		}

		if (shouldMainPanelBeVisible) {
			this.mainPanel = this.instantiationService.createInstance(MainPanel, this);
			this.addPanel(this.mainPanel, this.mainPanel.minimumSize, 0);

			const selectionChangeDisposable = this.mainPanel.onSelectionChange(this.onSelectionChange, this);
			this.onSelectionChange(this.mainPanel.getSelection());

			this.mainPanelDisposable = toDisposable(() => {
				this.removePanel(this.mainPanel);
				selectionChangeDisposable.dispose();
				this.mainPanel.dispose();
			});
		} else {
			this.mainPanelDisposable.dispose();
			this.mainPanelDisposable = EmptyDisposable;
			this.mainPanel = null;
		}
	}

	setVisible(visible: boolean): TPromise<void> {
		const result = super.setVisible(visible);

		if (!visible) {
			this.cachedMainPanelHeight = this.getPanelSize(this.mainPanel);
		}

		this._onDidChangeVisibility.fire(visible);
		return result;
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
			const [panel] = this.repositoryPanels;
			return panel.getActions();
		}

		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		let result: IAction[];

		if (this.isSingleView()) {
			const [panel] = this.repositoryPanels;

			result = [
				...panel.getSecondaryActions(),
				new Separator()
			];
		} else {
			result = [...this.menus.getTitleSecondaryActions()];

			if (result.length > 0) {
				result.push(new Separator());
			}
		}

		result.push(this.instantiationService.createInstance(InstallAdditionalSCMProvidersAction));

		return result;
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ContextAwareMenuItemActionItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
	}

	layout(dimension: Dimension): void {
		super.layout(dimension);
		this._height = dimension.height;
	}

	private onSelectionChange(repositories: ISCMRepository[]): void {
		const wasSingleView = this.isSingleView();

		// Collect unselected panels
		const panelsToRemove = this.repositoryPanels
			.filter(p => repositories.every(r => p.repository !== r));

		// Collect panels still selected
		const repositoryPanels = this.repositoryPanels
			.filter(p => repositories.some(r => p.repository === r));

		// Collect new selected panels
		const newRepositoryPanels = repositories
			.filter(r => this.repositoryPanels.every(p => p.repository !== r))
			.map(r => this.instantiationService.createInstance(RepositoryPanel, r, this));

		// Add new selected panels
		this.repositoryPanels = [...repositoryPanels, ...newRepositoryPanels];
		newRepositoryPanels.forEach(panel => {
			this.addPanel(panel, panel.minimumSize, this.length);
			panel.repository.focus();
		});

		// Remove unselected panels
		panelsToRemove.forEach(panel => this.removePanel(panel));

		// Restore main panel height
		if (this.isVisible() && typeof this.cachedMainPanelHeight === 'number') {
			this.resizePanel(this.mainPanel, this.cachedMainPanelHeight);
			this.cachedMainPanelHeight = undefined;
		}

		// Resize all panels equally
		const height = typeof this.height === 'number' ? this.height : 1000;
		const mainPanelHeight = this.getPanelSize(this.mainPanel);
		const size = (height - mainPanelHeight) / repositories.length;
		for (const panel of this.repositoryPanels) {
			this.resizePanel(panel, size);
		}

		// React to menu changes for single view mode
		if (wasSingleView !== this.isSingleView()) {
			this.singleRepositoryPanelTitleActionsDisposable.dispose();

			if (this.isSingleView()) {
				this.singleRepositoryPanelTitleActionsDisposable = this.repositoryPanels[0].onDidChangeTitle(this.updateTitleArea, this);
			}

			this.updateTitleArea();
		}
	}

	protected isSingleView(): boolean {
		return super.isSingleView() && this.repositoryPanels.length === 1;
	}

	hide(repository: ISCMRepository): void {
		if (!this.mainPanel) {
			return;
		}

		this.mainPanel.hide(repository);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.mainPanelDisposable.dispose();
		super.dispose();
	}
}
