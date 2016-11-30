/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { chain } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { createActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { SCMMenus } from './scmMenus';

// TODO@Joao remove
import { GitSCMProvider } from 'vs/workbench/parts/git/browser/gitSCMProvider';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
}

class ResourceGroupRenderer implements IRenderer<ISCMResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const countContainer = append(element, $('div'));
		const count = new CountBadge(countContainer);

		return { name, count };
	}

	renderElement(group: ISCMResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.name.textContent = group.label;
		template.count.setCount(group.get().length);
	}

	disposeTemplate(template: ResourceGroupTemplate): void {

	}
}

interface ResourceTemplate {
	fileLabel: FileLabel;
}

class ResourceRenderer implements IRenderer<ISCMResource, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {

	}

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const fileLabel = this.instantiationService.createInstance(FileLabel, container, void 0);

		return { fileLabel };
	}

	renderElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.uri);
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

	private static ACCEPT_KEYBINDING = platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter';

	private cachedDimension: Dimension;
	private inputBoxContainer: HTMLElement;
	private inputBox: InputBox;
	private listContainer: HTMLElement;
	private list: List<ISCMResourceGroup | ISCMResource>;
	private menus: SCMMenus;
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
		@IMenuService private menuService: IMenuService
	) {
		super(VIEWLET_ID, telemetryService);

		// TODO@Joao
		const provider = instantiationService.createInstance(GitSCMProvider);
		scmService.registerSCMProvider(provider);

		this.menus = this.instantiationService.createInstance(SCMMenus);
		this.disposables.push(this.menus);

		this.menus.onDidChangeTitleMenu(this.updateTitleArea, this, this.disposables);
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('scm-viewlet');

		const root = parent.getHTMLElement();
		this.inputBoxContainer = append(root, $('.scm-commit-box'));

		this.inputBox = new InputBox(this.inputBoxContainer, this.contextViewService, {
			placeholder: localize('accept', "Message (press {0} to submit)", SCMViewlet.ACCEPT_KEYBINDING),
			ariaLabel: localize('acceptAria', "Changes: Type message and press {0} to accept the changes", SCMViewlet.ACCEPT_KEYBINDING),
			flexibleHeight: true
		});

		chain(domEvent(this.inputBox.inputElement, 'keydown'))
			.map(e => new StandardKeyboardEvent(e))
			.filter(e => e.equals(KeyMod.CtrlCmd | KeyCode.Enter) || e.equals(KeyMod.CtrlCmd | KeyCode.KEY_S))
			.on(this.accept, this, this.disposables);

		chain(this.inputBox.onDidHeightChange)
			.map(() => this.cachedDimension)
			.on(this.layout, this, this.disposables);

		this.listContainer = append(root, $('.scm-status.show-file-icons'));
		const delegate = new Delegate();

		this.list = new List(this.listContainer, delegate, [
			new ResourceGroupRenderer(),
			this.instantiationService.createInstance(ResourceRenderer)
		]);

		chain(this.list.onSelectionChange)
			.map(e => e.elements[0])
			.filter(e => !!e && !!(e as ISCMResource).uri)
			.on(this.open, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);

		this.update();
		this.scmService.activeProvider.onChange(this.update, this, this.disposables);
		this.disposables.push(this.inputBox, this.list);

		return TPromise.as(null);
	}

	private update(): void {
		const provider = this.scmService.activeProvider;
		const groups = provider.resourceGroups;
		const elements = groups.reduce<(ISCMResourceGroup | ISCMResource)[]>((result, group) => {
			const resources = group.get();

			if (resources.length === 0) {
				return result;
			}

			return [...result, group, ...group.get()];
		}, []);

		this.list.splice(0, this.list.length, ...elements);
	}

	layout(dimension: Dimension = this.cachedDimension): void {
		if (!dimension) {
			return;
		}

		this.cachedDimension = dimension;
		this.inputBox.layout();

		const listHeight = dimension.height - (this.inputBox.height + 12 /* margin */);
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight);

		toggleClass(this.inputBoxContainer, 'scroll', this.inputBox.height >= 134);
	}

	getOptimalWidth(): number {
		return 400;
	}

	private accept(): void {
		this.scmService.activeProvider.commit(this.inputBox.value);
	}

	private open(e: ISCMResource): void {
		this.scmService.activeProvider.open(e);
	}

	getActions(): IAction[] {
		return this.menus.title;
	}

	getSecondaryActions(): IAction[] {
		return this.menus.titleSecondary;
	}

	getActionItem(action: IAction): IActionItem {
		return createActionItem(action, this.keybindingService, this.messageService);
	}

	private onListContextMenu(e: IListMouseEvent<ISCMResourceGroup | ISCMResource>): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.clientX + 1, y: e.clientY }),
			getActions: () => TPromise.as(this.menus.context)
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
