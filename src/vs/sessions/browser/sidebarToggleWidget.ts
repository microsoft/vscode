/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { createInstantHoverDelegate } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../base/common/actions.js';
import { Codicon } from '../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { localize } from '../../nls.js';
import { MenuRegistry } from '../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, SideBarVisibleContext } from '../../workbench/common/contextkeys.js';
import { IAgentSessionsService } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { countUnreadSessions } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { Menus } from './menus.js';
import { ToggleSidebarVisibilityAction } from './layoutActions.js';

/**
 * Action view item that renders the session status toggle with an unread badge
 * in the sidebar title area. Shows [tasklist icon] {unread count}.
 * Clicking toggles the sidebar visibility.
 */
class SessionStatusToggleViewItem extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private _badge: HTMLElement | undefined;
	private readonly _indicatorDisposables = this._register(new DisposableStore());
	private readonly _hoverDelegate = this._register(createInstantHoverDelegate());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		super(undefined, action, options);

		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._updateBadge();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('session-status-toggle');

		append(container, $(ThemeIcon.asCSSSelector(Codicon.tasklist)));
		this._badge = append(container, $('span.session-status-toggle-badge'));

		this._updateBadge();
	}

	override onClick(): void {
		this._action.run();
	}

	private _updateBadge(): void {
		if (!this._container || !this._badge) {
			return;
		}

		this._indicatorDisposables.clear();

		const unread = countUnreadSessions(this.agentSessionsService.model.sessions);
		this._badge.textContent = unread > 0 ? `${unread}` : '';
		this._badge.style.display = unread > 0 ? '' : 'none';

		const hoverText = unread > 0
			? localize('hideSidebarUnread', "Hide Side Bar, {0} unread session(s)", unread)
			: localize('hideSidebar', "Hide Side Bar");

		this._indicatorDisposables.add(this.hoverService.setupManagedHover(
			this._hoverDelegate, this._container, hoverText
		));

		this._container.setAttribute('aria-label', hoverText);
	}
}

/**
 * Registers the session status toggle in the sidebar's left toolbar
 * (`SidebarTitleLeft`) and provides a custom action view item to render
 * the tasklist icon with an unread badge.
 */
class SessionStatusToggleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionStatusToggle';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(MenuRegistry.appendMenuItem(Menus.SidebarTitleLeft, {
			command: {
				id: ToggleSidebarVisibilityAction.ID,
				title: localize('hideSidebar', "Hide Side Bar"),
				icon: Codicon.tasklist,
				toggled: SideBarVisibleContext,
			},
			group: 'navigation',
			order: 0,
			when: IsAuxiliaryWindowContext.toNegated(),
		}));

		this._register(actionViewItemService.register(Menus.SidebarTitleLeft, ToggleSidebarVisibilityAction.ID, (action, options) => {
			return instantiationService.createInstance(SessionStatusToggleViewItem, action, options);
		}));
	}
}

registerWorkbenchContribution2(SessionStatusToggleContribution.ID, SessionStatusToggleContribution, WorkbenchPhase.AfterRestored);
