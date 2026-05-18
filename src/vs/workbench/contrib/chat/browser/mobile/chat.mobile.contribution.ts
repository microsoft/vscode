/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chat.mobile.css';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatMobileBootstrap } from './chatMobileBootstrap.js';
import { isMobileWebPhone } from './isMobileWebPhone.js';

/**
 * Workbench contribution that opts the chat surfaces into mobile-friendly
 * behaviours when running on a mobile web phone.
 *
 * Everything mobile-specific in the chat codebase is gated behind this single
 * contribution: it adds a body-level class for CSS scoping and, for each chat
 * widget that gets created, calls into {@link ChatMobileBootstrap} to flip the
 * runtime overrides.
 *
 * On non-mobile devices the contribution short-circuits in the constructor and
 * is effectively a no-op — there is zero overhead and no behaviour change on
 * desktop, Electron, tablets, or touch laptops.
 */
export class ChatMobileContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatMobile';

	private static readonly BODY_CLASS = 'chat-mobile-web';

	private readonly _widgetDisposables = this._register(new DisposableMap<IChatWidget, IDisposable>());

	constructor(
		@ILayoutService layoutService: ILayoutService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		if (!isMobileWebPhone()) {
			return;
		}

		// Body-level class so chat.mobile.css overrides target a stable scope.
		const root = layoutService.mainContainer;
		root.classList.add(ChatMobileContribution.BODY_CLASS);
		this._register({ dispose: () => root.classList.remove(ChatMobileContribution.BODY_CLASS) });

		// Apply to any chat widgets already constructed before this contribution started.
		for (const widget of chatWidgetService.getAllWidgets()) {
			this._enable(widget);
		}
		// Apply to widgets created later.
		this._register(chatWidgetService.onDidAddWidget(widget => this._enable(widget)));
		// Release per-widget resources promptly so disposed widgets don't accumulate.
		this._register(chatWidgetService.onDidRemoveWidget(widget => this._widgetDisposables.deleteAndDispose(widget)));
	}

	private _enable(widget: IChatWidget): void {
		if (this._widgetDisposables.has(widget)) {
			return;
		}
		this._widgetDisposables.set(widget, ChatMobileBootstrap.enable(widget));
	}
}
