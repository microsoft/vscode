/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import '../media/sessionsListNotice.css';

export interface ISessionsListNoticeHost {
	readonly container: HTMLElement;
	readonly onDidChangeVisibility: Event<boolean>;
	readonly onDidOpenSession: Event<URI>;
	revealSession(resource: URI): IDisposable & { readonly targetId: string; open(token: CancellationToken): Promise<boolean> };
	isVisible(): boolean;
	focusSessionsList(): void;
	announce(message: string): void;
}

type NoticeFactory = (instantiation: IInstantiationService, host: ISessionsListNoticeHost) => IDisposable;
const factories: NoticeFactory[] = [];

/** Provider-owned notices contribute through this slot without provider imports in the list. */
export function registerSessionsListNotice(factory: NoticeFactory): void {
	factories.push(factory);
}

export function createSessionsListNotices(instantiation: IInstantiationService, host: ISessionsListNoticeHost): IDisposable[] {
	return factories.map(factory => factory(instantiation, host));
}

export interface ISessionsListNoticeOptions {
	readonly description: string;
	readonly label: string;
	readonly disableLabel: string;
	readonly dismiss: () => void;
	readonly run: () => void;
	readonly disable: () => void;
	readonly focusSessionsList: () => void;
}

/** A quiet, keyboard-accessible notice below the Sessions tree. */
export class SessionsListNotice extends Disposable {
	readonly domNode: HTMLElement;
	constructor(options: ISessionsListNoticeOptions) {
		super();
		this.domNode = DOM.$('.agent-sessions-list-notice', { role: 'region', 'aria-label': options.label });
		const content = DOM.append(this.domNode, DOM.$('.agent-sessions-list-notice-content'));
		DOM.append(content, DOM.$('.agent-sessions-list-notice-description')).textContent = options.description;
		const dismissLabel = localize('sessionsListNotice.dismiss', "Dismiss Suggestion");
		const dismiss = this._register(new Button(content, { ...defaultButtonStyles, secondary: true, title: dismissLabel, ariaLabel: dismissLabel }));
		dismiss.element.classList.add('agent-sessions-list-notice-dismiss');
		dismiss.icon = Codicon.close;
		const close = () => { options.dismiss(); options.focusSessionsList(); };
		this._register(dismiss.onDidClick(close));
		this._register(dismiss.onDidEscape(close));
		const actions = DOM.append(this.domNode, DOM.$('.agent-sessions-list-notice-actions'));
		const primary = this._register(new Button(actions, defaultButtonStyles));
		primary.label = options.label;
		this._register(primary.onDidClick(options.run));
		this._register(primary.onDidEscape(close));
		const secondary = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		secondary.label = options.disableLabel;
		this._register(secondary.onDidClick(() => { options.disable(); options.focusSessionsList(); }));
		this._register(secondary.onDidEscape(close));
		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') { DOM.EventHelper.stop(event, true); close(); }
		}));
	}
}
