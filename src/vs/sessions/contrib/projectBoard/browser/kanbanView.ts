/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ChatPillActionViewItem } from '../../../../workbench/browser/chatPills.js';
import { Menus } from '../../../browser/menus.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { KanbanCustomViewFocusContext } from '../../../common/contextkeys.js';
import { KANBAN_CUSTOM_VIEW_ID, KANBAN_NEW_SESSION_COMMAND_ID } from '../../../common/projectBoard.js';
import { IProjectBoardService, IProjectBoardView } from './projectBoardService.js';
import './kanbanAccessibility.js';

export class KanbanCustomView extends AbstractCustomView {

	readonly title: IObservable<string> = constObservable(localize('kanbanTitle', "Kanban"));
	override readonly description: IObservable<string | undefined> = constObservable(
		localize('kanbanDescription', "Arrange live chats by area and priority."));
	override readonly maxWidth = Number.POSITIVE_INFINITY;

	private view: IProjectBoardView | undefined;

	constructor(
		@IProjectBoardService private readonly projectBoardService: IProjectBoardService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	render(container: HTMLElement): void {
		container.classList.add('kanban-custom-view');
		const focusContext = KanbanCustomViewFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(container));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register({ dispose: () => focusContext.reset() });
		this.view = this._register(this.projectBoardService.createView(container));
	}

	layout(width: number, height: number): void {
		this.view?.layout(width, height);
	}

	override focus(): void {
		this.view?.focus();
	}
}

export class KanbanCustomViewContribution extends Disposable {

	static readonly ID = 'sessions.contrib.kanbanCustomView';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		this._register(customViewService.registerCustomView({
			id: KANBAN_CUSTOM_VIEW_ID,
			ctor: new SyncDescriptor(KanbanCustomView),
			actions: { style: 'buttonBar', menuId: Menus.CustomViewKanban },
			horizontalScrolling: true,
		}));
		this._register(actionViewItemService.register(Menus.CustomViewKanban, KANBAN_NEW_SESSION_COMMAND_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChatPillActionViewItem, undefined, action, options, false);
		}));
	}
}
