/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { MOUSE_BACK_FORWARD_NAVIGATION_SETTING } from '../../../../workbench/services/history/common/history.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

export class SessionsMouseNavigationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsMouseNavigation';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super();

		const mouseNavigationListeners = this._register(new DisposableStore());
		this._register(Event.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
			const eventDisposables = disposables.add(new DisposableStore());
			eventDisposables.add(addDisposableListener(container, EventType.MOUSE_DOWN, event => this.handleMouseNavigation(event, true), true));
			eventDisposables.add(addDisposableListener(container, EventType.MOUSE_UP, event => this.handleMouseNavigation(event, false), true));
			mouseNavigationListeners.add(eventDisposables);
		}, { container: this.layoutService.mainContainer, disposables: this._store }));
	}

	private handleMouseNavigation(event: MouseEvent, isMouseDown: boolean): void {
		if (!this.configurationService.getValue(MOUSE_BACK_FORWARD_NAVIGATION_SETTING) || this.layoutService.hasFocus(Parts.EDITOR_PART)) {
			return;
		}

		if (event.button !== 3 && event.button !== 4) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		if (!isMouseDown) {
			return;
		}

		if (event.button === 3) {
			void this.sessionsService.openPreviousSession();
		} else {
			void this.sessionsService.openNextSession();
		}
	}
}
