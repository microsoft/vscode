/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './mobileChatShell.css';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { autorun } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { Menus } from '../../menus.js';

/**
 * Mobile titlebar — prepended above the workbench grid on phone viewports
 * in place of the desktop titlebar.
 *
 * Layout:
 *
 *   `[menu]  [session title | host widget]  [+]`
 *
 * The center slot switches content based on whether the sessions welcome
 * (home/empty) screen is visible:
 *
 *  - **Welcome hidden** → shows the active session title (live, from
 *    {@link ISessionsManagementService.activeSession}).
 *  - **Welcome visible** → shows whatever is contributed to the
 *    {@link Menus.MobileTitleBarCenter} menu. On web, the host filter
 *    contribution appends its host dropdown + connection button there.
 *
 * The switch is driven entirely by the menu: when the toolbar has no
 * items the title is shown; as soon as it has items the title is hidden
 * and the toolbar fills the slot.
 */
export class MobileTitlebarPart extends Disposable {

	readonly element: HTMLElement;

	private readonly sessionTitleElement: HTMLElement;
	private readonly actionsContainer: HTMLElement;

	private readonly _onDidClickHamburger = this._register(new Emitter<void>());
	readonly onDidClickHamburger: Event<void> = this._onDidClickHamburger.event;

	private readonly _onDidClickNewSession = this._register(new Emitter<void>());
	readonly onDidClickNewSession: Event<void> = this._onDidClickNewSession.event;

	private readonly _onDidClickTitle = this._register(new Emitter<void>());
	readonly onDidClickTitle: Event<void> = this._onDidClickTitle.event;

	constructor(
		parent: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.element = document.createElement('div');
		this.element.className = 'mobile-top-bar';

		// Register DOM removal before appending so that any exception
		// between this point and the end of the constructor still cleans
		// up the element via disposal.
		this._register(toDisposable(() => this.element.remove()));
		parent.prepend(this.element);

		// Sidebar toggle button. Uses the same icon as the desktop/web
		// agents-app sidebar toggle and reflects open/closed state via the
		// SideBarVisibleContext key.
		const hamburger = append(this.element, $('button.mobile-top-bar-button'));
		hamburger.setAttribute('aria-label', localize('mobileTopBar.openSessions', "Open sessions"));
		const hamburgerIcon = append(hamburger, $('span'));
		const closedIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff);
		const openIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft);
		hamburgerIcon.classList.add(...closedIconClasses);
		this._register(addDisposableListener(hamburger, EventType.CLICK, () => this._onDidClickHamburger.fire()));

		const sidebarVisibleKeySet = new Set([SideBarVisibleContext.key]);
		const updateSidebarIcon = () => {
			const isOpen = !!SideBarVisibleContext.getValue(contextKeyService);
			hamburgerIcon.classList.remove(...closedIconClasses, ...openIconClasses);
			hamburgerIcon.classList.add(...(isOpen ? openIconClasses : closedIconClasses));
			hamburger.setAttribute('aria-label', isOpen
				? localize('mobileTopBar.closeSessions', "Close sessions")
				: localize('mobileTopBar.openSessions', "Open sessions"));
		};
		updateSidebarIcon();

		// Center slot: title and/or actions container (mutually exclusive)
		const center = append(this.element, $('div.mobile-top-bar-center'));

		this.sessionTitleElement = append(center, $('button.mobile-session-title'));
		this.sessionTitleElement.setAttribute('type', 'button');
		this.sessionTitleElement.textContent = localize('mobileTopBar.newSession', "New Session");
		this._register(addDisposableListener(this.sessionTitleElement, EventType.CLICK, () => this._onDidClickTitle.fire()));

		this.actionsContainer = append(center, $('div.mobile-top-bar-actions'));

		// New session button (+)
		const newSession = append(this.element, $('button.mobile-top-bar-button'));
		newSession.setAttribute('aria-label', localize('mobileTopBar.newSessionAria', "New session"));
		const newSessionIcon = append(newSession, $('span'));
		newSessionIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plus));
		this._register(addDisposableListener(newSession, EventType.CLICK, () => this._onDidClickNewSession.fire()));

		// Keep the title in sync with the active session
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			const title = session?.title.read(reader);
			this.sessionTitleElement.textContent = title || localize('mobileTopBar.newSession', "New Session");
		}));

		// Mount the center toolbar (host filter widget on web welcome, etc.)
		const toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.actionsContainer, Menus.MobileTitleBarCenter, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'mobileTitlebar.center',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Switch between title and toolbar based on whether a new (empty)
		// chat session is active AND whether the toolbar has anything to
		// show. The latter is important because on desktop/electron or
		// when no agent hosts are configured the toolbar can be empty —
		// in that case we keep the title visible.
		const newChatKeySet = new Set([IsNewChatSessionContext.key]);
		const updateCenterMode = () => {
			const isNewChat = !!IsNewChatSessionContext.getValue(contextKeyService);
			const hasActions = toolbar.getItemsLength() > 0;
			this.element.classList.toggle('show-actions', isNewChat && hasActions);
		};
		updateCenterMode();
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(newChatKeySet)) {
				updateCenterMode();
			}
			if (e.affectsSome(sidebarVisibleKeySet)) {
				updateSidebarIcon();
			}
		}));
		this._register(toolbar.onDidChangeMenuItems(() => updateCenterMode()));
	}

	/**
	 * Explicitly set the title shown in the center slot. Called only when
	 * overriding the live session title (tests, placeholders). The live
	 * subscription will overwrite this on the next session change.
	 */
	setTitle(title: string): void {
		this.sessionTitleElement.textContent = title;
	}
}
