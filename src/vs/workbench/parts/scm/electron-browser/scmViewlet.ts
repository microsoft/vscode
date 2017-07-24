/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { chain } from 'vs/base/common/event';
import { memoize } from 'vs/base/common/decorators';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { ComposedViewsViewlet, CollapsibleView, ICollapsibleViewOptions, IViewletViewOptions, IView, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMProvider, ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
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
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { comparePaths } from 'vs/base/common/comparers';
import { isSCMResource } from './scmUtil';
import { attachInputBoxStyler, attachListStyler, attachBadgeStyler } from 'vs/platform/theme/common/styler';
import Severity from 'vs/base/common/severity';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ViewLocation, ViewsRegistry, IViewDescriptor } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';

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

function identityProvider(r: ISCMResourceGroup | ISCMResource): string {
	if (isSCMResource(r)) {
		const group = r.resourceGroup;
		const provider = group.provider;
		return `${provider.id}/${group.id}/${r.sourceUri.toString()}`;
	} else {
		const provider = r.provider;
		return `${provider.id}/${r.id}`;
	}
}

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
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
		template.count.setCount(group.resources.length);
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

		return { element, name, fileLabel, decorationIcon, actionBar };
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
		} else {
			template.decorationIcon.style.backgroundImage = '';
		}
	}

	disposeTemplate(template: ResourceTemplate): void {
		// noop
	}
}

class Delegate implements IDelegate<ISCMResourceGroup | ISCMResource> {

	getHeight() { return 22; }

	getTemplateId(element: ISCMResourceGroup | ISCMResource) {
		return isSCMResource(element) ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

function resourceSorter(a: ISCMResource, b: ISCMResource): number {
	return comparePaths(a.sourceUri.fsPath, b.sourceUri.fsPath);
}

class SourceControlViewDescriptor implements IViewDescriptor {

	get provider(): ISCMProvider { return this._provider; }
	get id(): string { return this._provider.id; }
	get name(): string { return this._provider.label; }
	get ctor(): any { return null; }
	get location(): ViewLocation { return ViewLocation.SCM; }

	constructor(private _provider: ISCMProvider) {

	}
}

class SourceControlView extends CollapsibleView {

	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private menus: SCMMenus;
	private disposables: IDisposable[] = [];

	constructor(
		private provider: ISCMProvider,
		options: IViewletViewOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IThemeService protected themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IListService protected listService: IListService,
		@ICommandService protected commandService: ICommandService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super({ ...(options as IViewOptions), sizing: ViewSizing.Flexible }, keybindingService, contextMenuService);

		this.menus = instantiationService.createInstance(SCMMenus, provider);
		this.menus.onDidChangeTitle(this.updateActions, this, this.disposables);
	}

	renderHeader(container: HTMLElement): void {
		const title = append(container, $('div.title'));
		title.textContent = this.name;

		super.renderHeader(container);
	}

	renderBody(container: HTMLElement): void {
		this.listContainer = append(container, $('.scm-status.show-file-icons'));
		const delegate = new Delegate();

		const actionItemProvider = action => this.getActionItem(action);

		const renderers = [
			new ResourceGroupRenderer(this.menus, actionItemProvider, this.themeService),
			this.instantiationService.createInstance(ResourceRenderer, this.menus, actionItemProvider, () => this.getSelectedResources()),
		];

		this.list = new List(this.listContainer, delegate, renderers, {
			identityProvider,
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

		this.provider.onDidChange(this.updateList, this, this.disposables);
	}

	layoutBody(size: number): void {
		this.list.layout(size);
	}

	getActions(): IAction[] {
		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	private updateList(): void {
		const elements = this.provider.resources
			.reduce<(ISCMResourceGroup | ISCMResource)[]>((r, g) => [...r, g, ...g.resources.sort(resourceSorter)], []);

		this.list.splice(0, this.list.length, elements);
	}

	private open(e: ISCMResource): void {
		if (!e.command) {
			return;
		}

		this.commandService.executeCommand(e.command.id, ...e.command.arguments)
			.done(undefined, onUnexpectedError);
	}

	private pin(): void {
		const activeEditor = this.editorService.getActiveEditor();
		const activeEditorInput = this.editorService.getActiveEditorInput();
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

export class SCMViewlet extends ComposedViewsViewlet {

	private activeProvider: ISCMProvider | undefined;
	private cachedDimension: Dimension;
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private providerChangeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService protected scmService: ISCMService,
		@IInstantiationService instantiationService: IInstantiationService,
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
		super(VIEWLET_ID, ViewLocation.SCM, `${VIEWLET_ID}.state`, false,
			telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);
	}

	private setActiveProvider(activeProvider: ISCMProvider | undefined): void {
		this.providerChangeDisposable.dispose();
		this.activeProvider = activeProvider;

		if (activeProvider) {
			const disposables = [];

			// if (activeProvider.onDidChangeCommitTemplate) {
			// 	disposables.push(activeProvider.onDidChangeCommitTemplate(this.updateInputBox, this));
			// }

			const id = activeProvider.id;
			ViewsRegistry.registerViews([new SourceControlViewDescriptor(activeProvider)]);

			disposables.push({
				dispose: () => {
					ViewsRegistry.deregisterViews([id], ViewLocation.SCM);
				}
			});

			this.providerChangeDisposable = combinedDisposable(disposables);
		} else {
			this.providerChangeDisposable = EmptyDisposable;
		}

		// this.updateInputBox();
		// this.updateTitleArea();
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);

		parent.addClass('scm-viewlet');

		// const root = parent.getHTMLElement();
		// this.inputBoxContainer = append(root, $('.scm-editor'));

		// this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, {
		// 	placeholder: localize('commitMessage', "Message (press {0} to commit)", platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter'),
		// 	flexibleHeight: true
		// });
		// this.disposables.push(attachInputBoxStyler(this.inputBox, this.themeService));
		// this.disposables.push(this.inputBox);

		// this.inputBox.value = this.scmService.input.value;
		// this.inputBox.onDidChange(value => this.scmService.input.value = value, null, this.disposables);
		// this.scmService.input.onDidChange(value => this.inputBox.value = value, null, this.disposables);
		// this.disposables.push(this.inputBox.onDidHeightChange(() => this.layout()));

		// chain(domEvent(this.inputBox.inputElement, 'keydown'))
		// 	.map(e => new StandardKeyboardEvent(e))
		// 	.filter(e => e.equals(KeyMod.CtrlCmd | KeyCode.Enter) || e.equals(KeyMod.CtrlCmd | KeyCode.KEY_S))
		// 	.on(this.onDidAcceptInput, this, this.disposables);


		this.setActiveProvider(this.scmService.activeProvider);
		this.scmService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
		// this.themeService.onThemeChange(this.update, this, this.disposables);

		// return TPromise.as(null);
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): IView {
		if (viewDescriptor instanceof SourceControlViewDescriptor) {
			return this.instantiationService.createInstance(SourceControlView, viewDescriptor.provider, options);
		}

		return this.instantiationService.createInstance(viewDescriptor.ctor, options);
	}

	private onDidAcceptInput(): void {
		if (!this.activeProvider) {
			return;
		}

		if (!this.activeProvider.acceptInputCommand) {
			return;
		}

		const id = this.activeProvider.acceptInputCommand.id;
		const args = this.activeProvider.acceptInputCommand.arguments;

		this.commandService.executeCommand(id, ...args)
			.done(undefined, onUnexpectedError);
	}

	private updateInputBox(): void {
		if (!this.activeProvider) {
			return;
		}

		if (typeof this.activeProvider.commitTemplate === 'undefined') {
			return;
		}

		this.inputBox.value = this.activeProvider.commitTemplate;
	}

	// layout(dimension: Dimension = this.cachedDimension): void {
	// 	if (!dimension) {
	// 		return;
	// 	}

	// 	this.cachedDimension = dimension;
	// 	this.inputBox.layout();

	// 	const editorHeight = this.inputBox.height;
	// 	const listHeight = dimension.height - (editorHeight + 12 /* margin */);
	// 	this.listContainer.style.height = `${listHeight}px`;
	// 	this.list.layout(listHeight);

	// 	toggleClass(this.inputBoxContainer, 'scroll', editorHeight >= 134);
	// }

	getOptimalWidth(): number {
		return 400;
	}

	focus(): void {
		super.focus();
		// this.inputBox.focus();
	}

	getTitle(): string {
		const title = localize('source control', "Source Control");
		const providerLabel = this.scmService.activeProvider && this.scmService.activeProvider.label;

		if (providerLabel) {
			return localize('viewletTitle', "{0}: {1}", title, providerLabel);
		} else {
			return title;
		}
	}

	@memoize
	getSecondaryActions(): IAction[] {
		return [
			this.instantiationService.createInstance(InstallAdditionalSCMProvidersAction)
		];
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new SCMMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
