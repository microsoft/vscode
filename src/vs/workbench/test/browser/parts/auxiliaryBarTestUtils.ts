/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IToolBarResponsiveBehaviorOptions } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IMenuCreateOptions, IMenuService, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AuxiliaryBarPart } from '../../../browser/parts/auxiliarybar/auxiliaryBarPart.js';
import { IComposite } from '../../../common/composite.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ViewDescriptorService } from '../../../services/views/browser/viewDescriptorService.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';

const newChatMenu = MenuId.for('test.auxiliaryBar.newChat');
const globalActionsMenu = MenuId.for('test.auxiliaryBar.title');

class TestAuxiliaryBarMenuService extends MenuService {
	override createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions) {
		return super.createMenu(id === MenuId.AuxiliaryBarTitle ? globalActionsMenu : id, contextKeyService, options);
	}
}

export function createTestAuxiliaryBarPart(container: HTMLElement, store: Pick<DisposableStore, 'add'>): TestAuxiliaryBarPart {
	const instantiationService = workbenchInstantiationService({}, store);
	instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
	instantiationService.stub(IViewDescriptorService, store.add(instantiationService.createInstance(ViewDescriptorService)));
	instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(TestAuxiliaryBarMenuService)));
	for (const [order, [id, title, icon]] of ([
		['test.maximize', 'Maximize Secondary Side Bar', Codicon.screenFull],
		['test.close', 'Hide Secondary Side Bar', Codicon.close],
	] as const).entries()) {
		store.add(MenuRegistry.appendMenuItem(globalActionsMenu, { command: { id, title, icon }, group: 'navigation', order }));
	}
	const part = store.add(instantiationService.createInstance(TestAuxiliaryBarPart));
	part.create(container);
	const newChat = instantiationService.createInstance(MenuItemAction, { id: 'new', title: 'New Chat', icon: Codicon.plus }, undefined, undefined, undefined, undefined);
	const newWindow = instantiationService.createInstance(MenuItemAction, { id: 'window', title: 'New Chat in New Window' }, undefined, undefined, undefined, undefined);
	part.setTitleActions('Chat', [
		new SubmenuItemAction({ submenu: newChatMenu, title: 'New Chat', icon: Codicon.plus, isSplitButton: true }, undefined, [newChat, newWindow]),
		instantiationService.createInstance(MenuItemAction, { id: 'settings', title: 'Open Customizations', icon: Codicon.gear }, undefined, undefined, undefined, undefined),
	], [store.add(new Action('history', 'History'))]);
	return part;
}

export class TestAuxiliaryBarPart extends AuxiliaryBarPart {

	private toolbarAvailableWidth: number | undefined;

	protected override getActiveComposite(): IComposite {
		return {
			onDidFocus: Event.None,
			onDidBlur: Event.None,
			hasFocus: () => false,
			getId: () => 'test.chat',
			getTitle: () => 'Chat',
			getControl: () => undefined,
			focus: () => { },
		};
	}

	protected override getToolbarResponsiveBehavior(): IToolBarResponsiveBehaviorOptions {
		return {
			...super.getToolbarResponsiveBehavior(),
			getAvailableWidth: () => this.toolbarAvailableWidth ?? this.toolBar?.getElement().getBoundingClientRect().width ?? 0,
		};
	}

	protected override shouldShowCompositeBar(): boolean {
		return false;
	}

	setToolbarAvailableWidth(width: number): void {
		this.toolbarAvailableWidth = width;
	}

	setTitleActions(title: string, primary: IAction[], secondary: IAction[]): void {
		this.titleLabel?.updateTitle('test.chat', title, '');
		this.toolBar?.setAriaLabel(`${title} actions`);
		this.toolBar?.setActions(primary, secondary);
	}

	get toolbar() {
		return this.toolBar!;
	}
}
