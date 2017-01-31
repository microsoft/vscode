/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { TPromise } from 'vs/base/common/winjs.base';
import { chain } from 'vs/base/common/event';
import { IDisposable, dispose, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMProvider, ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { createActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { SCMMenus } from './scmMenus';
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { isDarkTheme } from 'vs/platform/theme/common/themes';
import { SCMEditor } from './scmEditor';
import { IModelService } from 'vs/editor/common/services/modelService';

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

class ResourceRenderer implements IRenderer<ISCMResource, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private scmMenus: SCMMenus,
		private actionItemProvider: IActionItemProvider,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {

	}

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.instantiationService.createInstance(FileLabel, name, void 0);
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const decorationIcon = append(element, $('.decoration-icon'));

		return { name, fileLabel, decorationIcon, actionBar };
	}

	renderElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.uri);
		template.actionBar.clear();
		template.actionBar.push(this.scmMenus.getResourceActions(resource));
		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);

		const theme = this.themeService.getColorTheme();
		const icon = isDarkTheme(theme.id) ? resource.decorations.iconDark : resource.decorations.icon;

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
		return (element as ISCMResource).uri ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

export class SCMViewlet extends Viewlet {

	private cachedDimension: Dimension;
	private editor: SCMEditor;
	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private menus: SCMMenus;
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
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IThemeService private themeService: IThemeService,
		@IMenuService private menuService: IMenuService,
		@IModelService private modelService: IModelService
	) {
		super(VIEWLET_ID, telemetryService);

		this.menus = this.instantiationService.createInstance(SCMMenus);
		this.disposables.push(this.menus);
	}

	private setActiveProvider(activeProvider: ISCMProvider | undefined): void {
		this.providerChangeDisposable.dispose();

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
		const editorContainer = append(root, $('.scm-editor'));

		this.editor = this.instantiationService.createInstance(SCMEditor, editorContainer);
		this.editor.onDidChangeContent(() => this.layout(), null, this.disposables);
		this.disposables.push(this.editor);

		// this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, {
		// 	placeholder: localize('accept', "Message (press {0} to submit)", SCMViewlet.ACCEPT_KEYBINDING),
		// 	ariaLabel: localize('acceptAria', "Changes: Type message and press {0} to accept the changes", SCMViewlet.ACCEPT_KEYBINDING),
		// 	flexibleHeight: true
		// });

		// chain(domEvent(this.inputBox.inputElement, 'keydown'))
		// 	.map(e => new StandardKeyboardEvent(e))
		// 	.filter(e => e.equals(KeyMod.CtrlCmd | KeyCode.Enter) || e.equals(KeyMod.CtrlCmd | KeyCode.KEY_S))
		// 	.on(this.accept, this, this.disposables);

		this.listContainer = append(root, $('.scm-status.show-file-icons'));
		const delegate = new Delegate();

		const actionItemProvider = action => this.getActionItem(action);

		this.list = new List(this.listContainer, delegate, [
			new ResourceGroupRenderer(this.menus, actionItemProvider),
			this.instantiationService.createInstance(ResourceRenderer, this.menus, actionItemProvider)
		]);

		chain(this.list.onSelectionChange)
			.map(e => e.elements[0])
			.filter(e => !!e && !!(e as ISCMResource).uri)
			.on(this.open, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.disposables.push(this.list);

		this.setActiveProvider(this.scmService.activeProvider);
		this.scmService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
		this.themeService.onDidColorThemeChange(this.update, this, this.disposables);

		return TPromise.as(null);
	}

	private update(): void {
		const provider = this.scmService.activeProvider;

		if (!provider) {
			this.list.splice(0, this.list.length);
			return;
		}

		const elements = provider.resources
			.reduce<(ISCMResourceGroup | ISCMResource)[]>((r, g) => [...r, g, ...g.resources], []);

		this.list.splice(0, this.list.length, elements);
	}

	layout(dimension: Dimension = this.cachedDimension): void {
		if (!dimension) {
			return;
		}

		this.cachedDimension = dimension;

		const editorHeight = Math.min(this.editor.lineCount, 8) * this.editor.lineHeight;
		this.editor.layout({ width: dimension.width - 25, height: editorHeight });

		const listHeight = dimension.height - (editorHeight + 12 /* margin */);
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight);
	}

	getOptimalWidth(): number {
		return 400;
	}

	focus(): void {
		super.focus();
		this.editor.focus();
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

	private onListContextMenu(e: IListMouseEvent<ISCMResourceGroup | ISCMResource>): void {
		const element = e.element;
		let actions: IAction[];

		if ((element as ISCMResource).uri) {
			const resource = element as ISCMResource;
			actions = this.menus.getResourceContextActions(resource);
		} else {
			const resourceGroup = element as ISCMResourceGroup;
			actions = this.menus.getResourceGroupContextActions(resourceGroup);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.clientX + 1, y: e.clientY }),
			getActions: () => TPromise.as(actions)
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
