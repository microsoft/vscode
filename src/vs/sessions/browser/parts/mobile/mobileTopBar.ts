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

/**
 * Mobile top bar component — a simple DOM element prepended to the
 * workbench container on phone viewports. Replaces the desktop titlebar
 * with a native-feeling mobile app bar.
 *
 * Layout: [hamburger] [session title] [+ new]
 */
export class MobileTopBar extends Disposable {

	readonly element: HTMLElement;

	private readonly sessionTitleElement: HTMLElement;

	private readonly _onDidClickHamburger = this._register(new Emitter<void>());
	readonly onDidClickHamburger: Event<void> = this._onDidClickHamburger.event;

	private readonly _onDidClickNewSession = this._register(new Emitter<void>());
	readonly onDidClickNewSession: Event<void> = this._onDidClickNewSession.event;

	private readonly _onDidClickTitle = this._register(new Emitter<void>());
	readonly onDidClickTitle: Event<void> = this._onDidClickTitle.event;

	constructor(parent: HTMLElement) {
		super();

		this.element = document.createElement('div');
		this.element.className = 'mobile-top-bar';

		// Register DOM removal before appending so that any exception
		// between this point and the end of the constructor still cleans
		// up the element via disposal.
		this._register(toDisposable(() => this.element.remove()));
		parent.prepend(this.element);

		// Hamburger button
		const hamburger = append(this.element, $('button.mobile-top-bar-button'));
		hamburger.setAttribute('aria-label', 'Open sessions');
		const hamburgerIcon = append(hamburger, $('span'));
		hamburgerIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.menu));
		this._register(addDisposableListener(hamburger, EventType.CLICK, () => this._onDidClickHamburger.fire()));

		// Session title
		this.sessionTitleElement = append(this.element, $('div.mobile-session-title'));
		this.sessionTitleElement.textContent = localize('mobileTopBar.newSession', "New Session");
		this._register(addDisposableListener(this.sessionTitleElement, EventType.CLICK, () => this._onDidClickTitle.fire()));

		// New session button (+)
		const newSession = append(this.element, $('button.mobile-top-bar-button'));
		newSession.setAttribute('aria-label', 'New session');
		const newSessionIcon = append(newSession, $('span'));
		newSessionIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plus));
		this._register(addDisposableListener(newSession, EventType.CLICK, () => this._onDidClickNewSession.fire()));
	}

	setTitle(title: string): void {
		this.sessionTitleElement.textContent = title;
	}
}
