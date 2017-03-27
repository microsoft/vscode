/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { chain } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import { domEvent } from 'vs/base/browser/event';
import { IDisposable, dispose, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
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
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IListService } from 'vs/platform/list/browser/listService';
import { IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IAction, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { createActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { SCMMenus } from './scmMenus';
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from "vs/platform/theme/common/themeService";
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IModelService } from 'vs/editor/common/services/modelService';
import { comparePaths } from 'vs/base/common/comparers';
import URI from 'vs/base/common/uri';
import { isSCMResource } from './scmUtil';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';

function getElementId(element: ISCMResourceGroup | ISCMResource) {
	if (isSCMResource(element)) {
		return `${element.resourceGroupId}:${element.sourceUri.toString()}`;
	} else {
		return `${element.id}`;
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
}

class ResourceGroupRenderer implements IRenderer<ISCMResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private scmMenus: SCMMenus,
		private actionItemProvider: IActionItemProvider
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);

		return { name, count, actionBar };
	}

	renderElement(group: ISCMResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.name.textContent = group.label;
		template.count.setCount(group.resources.length);
		template.actionBar.clear();
		template.actionBar.push(this.scmMenus.getResourceGroupActions(group));
	}

	disposeTemplate(template: ResourceGroupTemplate): void {

	}
}

interface ResourceTemplate {
	name: HTMLElement;
	fileLabel: FileLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => URI[]) {
		super();
	}

	/**
	 * Calls the action.run method with the current selection. Note
	 * that these actions already have the current scm resource context
	 * within, so we don't want to pass in the selection if there is only
	 * one selected element. The user should be able to select a single
	 * item and run an action on another element and only the latter should
	 * be influenced.
	 */
	runAction(action: IAction, context?: any): TPromise<any> {
		if (action instanceof MenuItemAction) {
			const selection = this.getSelectedResources();
			return selection.length > 1 ? action.run(...selection) : action.run();
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
		private getSelectedResources: () => URI[],
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

		return { name, fileLabel, decorationIcon, actionBar };
	}

	renderElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.sourceUri);
		template.actionBar.clear();
		template.actionBar.push(this.scmMenus.getResourceActions(resource));
		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);

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

export class SCMViewlet extends Viewlet {

	private cachedDimension: Dimension;
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private menus: SCMMenus;
	private activeProviderId: string | undefined;
	private providerChangeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService private scmService: ISCMService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMessageService private messageService: IMessageService,
		@IListService private listService: IListService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IThemeService protected themeService: IThemeService,
		@IMenuService private menuService: IMenuService,
		@IModelService private modelService: IModelService
	) {
		super(VIEWLET_ID, telemetryService, themeService);

		this.menus = this.instantiationService.createInstance(SCMMenus);
		this.menus.onDidChangeTitle(this.updateTitleArea, this, this.disposables);
		this.disposables.push(this.menus);
	}

	private setActiveProvider(activeProvider: ISCMProvider | undefined): void {
		this.providerChangeDisposable.dispose();
		this.activeProviderId = activeProvider ? activeProvider.id : undefined;

		if (activeProvider) {
			this.providerChangeDisposable = activeProvider.onDidChange(this.update, this);
		} else {
			this.providerChangeDisposable = EmptyDisposable;
		}

		this.updateTitleArea();
		this.update();
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('scm-viewlet');

		const root = parent.getHTMLElement();
		this.inputBoxContainer = append(root, $('.scm-editor'));

		this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, {
			placeholder: localize('commitMessage', "Message (press {0} to commit)", platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter'),
			flexibleHeight: true
		});
		this.disposables.push(attachInputBoxStyler(this.inputBox, this.themeService));
		this.disposables.push(this.inputBox);

		this.inputBox.value = this.scmService.input.value;
		this.inputBox.onDidChange(value => this.scmService.input.value = value, null, this.disposables);
		this.scmService.input.onDidChange(value => this.inputBox.value = value, null, this.disposables);
		this.disposables.push(this.inputBox.onDidHeightChange(() => this.layout()));

		chain(domEvent(this.inputBox.inputElement, 'keydown'))
			.map(e => new StandardKeyboardEvent(e))
			.filter(e => e.equals(KeyMod.CtrlCmd | KeyCode.Enter) || e.equals(KeyMod.CtrlCmd | KeyCode.KEY_S))
			.on(this.scmService.input.acceptChanges, this.scmService.input, this.disposables);

		this.listContainer = append(root, $('.scm-status.show-file-icons'));
		const delegate = new Delegate();

		const actionItemProvider = action => this.getActionItem(action);

		const renderers = [
			new ResourceGroupRenderer(this.menus, actionItemProvider),
			this.instantiationService.createInstance(ResourceRenderer, this.menus, actionItemProvider, () => this.getSelectedResources()),
		];

		this.list = new List(this.listContainer, delegate, renderers, {
			identityProvider: e => getElementId(e),
			keyboardSupport: false
		});

		this.disposables.push(this.listService.register(this.list));

		chain(this.list.onOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && isSCMResource(e))
			.on(this.open, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.disposables.push(this.list);

		this.setActiveProvider(this.scmService.activeProvider);
		this.scmService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
		this.themeService.onThemeChange(this.update, this, this.disposables);

		return TPromise.as(null);
	}

	private update(): void {
		const provider = this.scmService.activeProvider;

		if (!provider) {
			this.list.splice(0, this.list.length);
			return;
		}

		const elements = provider.resources
			.reduce<(ISCMResourceGroup | ISCMResource)[]>((r, g) => [...r, g, ...g.resources.sort(resourceSorter)], []);

		this.list.splice(0, this.list.length, elements);
	}

	layout(dimension: Dimension = this.cachedDimension): void {
		if (!dimension) {
			return;
		}

		this.cachedDimension = dimension;
		this.inputBox.layout();

		const editorHeight = this.inputBox.height;
		const listHeight = dimension.height - (editorHeight + 12 /* margin */);
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight);

		toggleClass(this.inputBoxContainer, 'scroll', editorHeight >= 134);
	}

	getOptimalWidth(): number {
		return 400;
	}

	focus(): void {
		super.focus();
		this.inputBox.focus();
	}

	private open(e: ISCMResource): void {
		this.scmService.activeProvider.open(e);
	}

	getActions(): IAction[] {
		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionItem(action: IAction): IActionItem {
		return createActionItem(action, this.keybindingService, this.messageService);
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
			actionRunner: new MultipleSelectionActionRunner(() => this.getSelectedResources())
		});
	}

	private getSelectedResources(): URI[] {
		return this.list.getSelectedElements().map(r => r.uri);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
