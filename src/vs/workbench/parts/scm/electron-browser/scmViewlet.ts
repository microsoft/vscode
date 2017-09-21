/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { basename } from 'vs/base/common/paths';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose, combinedDisposable, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { PanelViewlet, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMRepository, ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IListService } from 'vs/platform/list/browser/listService';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IAction, Action, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { MenuItemActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { SCMMenus } from './scmMenus';
import { ActionBar, IActionItemProvider, Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isSCMResource } from './scmUtil';
import { attachListStyler, attachBadgeStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import Severity from 'vs/base/common/severity';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import * as platform from 'vs/base/common/platform';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Command } from 'vs/editor/common/modes';
import { render as renderOcticons } from 'vs/base/browser/ui/octiconLabel/octiconLabel';

// TODO@Joao
// Need to subclass MenuItemActionItem in order to respect
// the action context coming from any action bar, without breaking
// existing users
class SCMMenuItemActionItem extends MenuItemActionItem {

	onClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.actionRunner.run(this._commandAction, this._context)
			.done(undefined, err => this._messageService.show(Severity.Error, err));
	}
}

export interface ISpliceEvent<T> {
	index: number;
	deleteCount: number;
	elements: T[];
}

export interface IViewModel {
	readonly repositories: ISCMRepository[];
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>>;
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

		append(provider, $('.spacer'));

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

		const actions = [];
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

	private _onSelectionChange = new Emitter<ISCMRepository[]>();
	readonly onSelectionChange: Event<ISCMRepository[]> = this._onSelectionChange.event;

	constructor(
		protected viewModel: IViewModel,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
	) {
		super(localize('scm providers', "Source Control Providers"), {}, keybindingService, contextMenuService);
		this.updateBodySize();
	}

	private splice(index: number, deleteCount: number, repositories: ISCMRepository[] = []): void {
		const wasEmpty = this.list.length === 0;

		this.list.splice(index, deleteCount, repositories);
		this.updateBodySize();

		// Automatically select the first one
		if (wasEmpty && this.list.length > 0) {
			this.list.setSelection([0]);
		}
	}

	protected renderBody(container: HTMLElement): void {
		const delegate = new ProvidersListDelegate();
		const renderer = this.instantiationService.createInstance(ProviderRenderer);

		this.list = new List<ISCMRepository>(container, delegate, [renderer], {
			identityProvider: repository => repository.provider.id
		});

		this.disposables.push(this.list);
		this.disposables.push(attachListStyler(this.list, this.themeService));
		this.list.onSelectionChange(e => this._onSelectionChange.fire(e.elements), null, this.disposables);
		this.viewModel.onDidSplice(({ index, deleteCount, elements }) => this.splice(index, deleteCount, elements), null, this.disposables);
		this.splice(0, 0, this.viewModel.repositories);
	}

	protected layoutBody(size: number): void {
		this.list.layout(size);
	}

	private updateBodySize(): void {
		const size = Math.min(5, this.viewModel.repositories.length) * 22;
		this.minimumBodySize = size;
		this.maximumBodySize = size;
	}
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	dispose: () => void;
}

class ResourceGroupRenderer implements IRenderer<ISCMResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private scmMenus: SCMMenus,
		private actionItemProvider: IActionItemProvider,
		private themeService: IThemeService
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);

		return {
			name, count, actionBar, dispose: () => {
				actionBar.dispose();
				styler.dispose();
			}
		};
	}

	renderElement(group: ISCMResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.name.textContent = group.label;
		template.count.setCount(group.resourceCollection.resources.length);
		template.actionBar.clear();
		template.actionBar.context = group;
		template.actionBar.push(this.scmMenus.getResourceGroupActions(group), { icon: true, label: false });
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
		private scmMenus: SCMMenus,
		private actionItemProvider: IActionItemProvider,
		private getSelectedResources: () => ISCMResource[],
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.instantiationService.createInstance(FileLabel, name, void 0);
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(this.getSelectedResources)
		});

		const decorationIcon = append(element, $('.decoration-icon'));

		return {
			element, name, fileLabel, decorationIcon, actionBar, dispose: () => {
				actionBar.dispose();
				fileLabel.dispose();
			}
		};
	}

	renderElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.sourceUri);
		template.actionBar.clear();
		template.actionBar.context = resource;
		template.actionBar.push(this.scmMenus.getResourceActions(resource), { icon: true, label: false });
		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);
		toggleClass(template.element, 'faded', resource.decorations.faded);

		const theme = this.themeService.getTheme();
		const icon = theme.type === LIGHT ? resource.decorations.icon : resource.decorations.iconDark;

		if (icon) {
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = resource.decorations.tooltip;
		} else {
			template.decorationIcon.style.backgroundImage = '';
		}
	}

	disposeTemplate(template: ResourceTemplate): void {
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

export class RepositoryPanel extends ViewletPanel {

	private cachedHeight: number | undefined = undefined;
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private menus: SCMMenus;

	constructor(
		readonly repository: ISCMRepository,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IThemeService protected themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IListService protected listService: IListService,
		@ICommandService protected commandService: ICommandService,
		@IMessageService protected messageService: IMessageService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(repository.provider.label, {}, keybindingService, contextMenuService);
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
	}

	protected renderBody(container: HTMLElement): void {
		const focusTracker = trackFocus(container);
		this.disposables.push(focusTracker.addFocusListener(() => this.repository.focus()));
		this.disposables.push(focusTracker);

		// Input
		this.inputBoxContainer = append(container, $('.scm-editor'));

		this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, {
			placeholder: localize('commitMessage', "Message (press {0} to commit)", platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter'),
			flexibleHeight: true
		});
		this.disposables.push(attachInputBoxStyler(this.inputBox, this.themeService));
		this.disposables.push(this.inputBox);

		this.inputBox.value = this.repository.input.value;
		this.inputBox.onDidChange(value => this.repository.input.value = value, null, this.disposables);
		this.repository.input.onDidChange(value => this.inputBox.value = value, null, this.disposables);
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
			new ResourceGroupRenderer(this.menus, actionItemProvider, this.themeService),
			this.instantiationService.createInstance(ResourceRenderer, this.menus, actionItemProvider, () => this.getSelectedResources()),
		];

		this.list = new List(this.listContainer, delegate, renderers, {
			identityProvider: scmResourceIdentityProvider,
			keyboardSupport: false
		});

		this.disposables.push(attachListStyler(this.list, this.themeService));
		this.disposables.push(this.listService.register(this.list));

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

		this.repository.provider.onDidChangeResources(this.updateList, this, this.disposables);
		this.updateList();
	}

	layoutBody(height: number = this.cachedHeight): void {
		if (height === undefined) {
			return;
		}

		this.list.layout(height);
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

		if (this.expanded) {
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

		return new SCMMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	getActionsContext(): any {
		return this.repository.provider;
	}

	private updateList(): void {
		const elements = this.repository.provider.resources
			.reduce<(ISCMResourceGroup | ISCMResource)[]>((r, g) => {
				if (g.resourceCollection.resources.length === 0 && g.hideWhenEmpty) {
					return r;
				}

				return [...r, g, ...g.resourceCollection.resources];
			}, []);

		this.list.splice(0, this.list.length, elements);
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
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

class InstallAdditionalSCMProvidersAction extends Action {

	constructor( @IViewletService private viewletService: IViewletService) {
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
	private mainPanelDisposable: IDisposable = EmptyDisposable;
	private _repositories: ISCMRepository[] = [];
	private repositoryPanels: RepositoryPanel[] = [];
	private disposables: IDisposable[] = [];

	private _onDidSplice = new Emitter<ISpliceEvent<ISCMRepository>>();
	readonly onDidSplice: Event<ISpliceEvent<ISCMRepository>> = this._onDidSplice.event;

	private _height: number | undefined = undefined;
	get height(): number | undefined { return this._height; }

	get repositories(): ISCMRepository[] { return this._repositories; }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IMessageService protected messageService: IMessageService,
		@IListService protected listService: IListService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService protected themeService: IThemeService,
		@ICommandService protected commandService: ICommandService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, { showHeaderInTitleWhenSingleView: true }, telemetryService, themeService);

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
		this.onDidChangeRepositories();
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		this.onDidChangeRepositories();

		const index = this._repositories.length;
		this._repositories.push(repository);
		this._onDidSplice.fire({ index, deleteCount: 0, elements: [repository] });

		if (!this.mainPanel) {
			this.onSelectionChange(this.repositories);
		}
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		this.onDidChangeRepositories();

		const index = this._repositories.indexOf(repository);

		if (index === -1) {
			return;
		}

		this._repositories.splice(index, 1);
		this._onDidSplice.fire({ index, deleteCount: 1, elements: [] });

		if (!this.mainPanel) {
			this.onSelectionChange(this.repositories);
		}
	}

	private onDidChangeRepositories(): void {
		toggleClass(this.el, 'empty', this.scmService.repositories.length === 0);

		const shouldMainPanelBeVisible = this.scmService.repositories.length > 1;

		if (!!this.mainPanel === shouldMainPanelBeVisible) {
			return;
		}

		if (shouldMainPanelBeVisible) {
			this.mainPanel = this.instantiationService.createInstance(MainPanel, this);
			const selectionChangeDisposable = this.mainPanel.onSelectionChange(this.onSelectionChange, this);
			this.addPanel(this.mainPanel, this.mainPanel.minimumSize, 0);

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
			result = this.menus.getTitleSecondaryActions();

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

		return new SCMMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	layout(dimension: Dimension): void {
		super.layout(dimension);
		this._height = dimension.height;
	}

	private onSelectionChange(repositories: ISCMRepository[]): void {
		// Remove unselected panels
		this.repositoryPanels
			.filter(p => repositories.every(r => p.repository !== r))
			.forEach(panel => this.removePanel(panel));

		// Collect panels still selected
		const repositoryPanels = this.repositoryPanels
			.filter(p => repositories.some(r => p.repository === r));

		// Collect new selected panels
		const newRepositoryPanels = repositories
			.filter(r => this.repositoryPanels.every(p => p.repository !== r))
			.map(r => this.instantiationService.createInstance(RepositoryPanel, r));

		// Add new selected panels
		this.repositoryPanels = [...repositoryPanels, ...newRepositoryPanels];
		newRepositoryPanels.forEach(panel => {
			this.addPanel(panel, panel.minimumSize, this.length);
			panel.repository.focus();
		});

		// Resize all panels equally
		const height = typeof this.height === 'number' ? this.height : 1000;
		const mainPanelHeight = this.mainPanel ? this.mainPanel.minimumSize : 0;
		const size = (height - mainPanelHeight) / repositories.length;

		for (const panel of this.repositoryPanels) {
			this.resizePanel(panel, size);
		}
	}

	protected isSingleView(): boolean {
		return super.isSingleView() && this.repositories.length === 1;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.mainPanelDisposable.dispose();
		super.dispose();
	}
}
