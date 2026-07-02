/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ChatOriginKind, IChat } from '../../../services/sessions/common/session.js';
import './media/sessionAgentsControl.css';

/**
 * A "Subagents" dropdown shown above the chat input that lists the subagent
 * (worker) chats spawned by the currently-viewed chat. Activating it opens a
 * menu of those subagents; selecting one reveals its read-only chat. The control
 * hides when the viewed chat has no subagents.
 */
export class SessionAgentsControl extends Disposable {

	readonly element: HTMLElement;
	private readonly _button: Button;

	private readonly _disposables = this._register(new MutableDisposable<DisposableStore>());
	private _session: IActiveSession | undefined;
	private _agents: readonly IChat[] = [];

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		this.element = $('.session-agents-control');
		this._button = this._register(new Button(this.element, { secondary: true, supportIcons: true, ...defaultButtonStyles }));
		this._button.element.classList.add('session-agents-control-button');
		this._button.label = `$(${Codicon.commentDiscussion.id}) ${localize('sessionAgents.label', "Subagents")} $(${Codicon.chevronDown.id})`;
		this._register(this._button.onDidClick(() => this._showMenu()));
		this._setVisible(false);
	}

	/** Track the currently-viewed chat; the dropdown lists its subagents. */
	setChat(chatResource: URI | undefined): void {
		const store = new DisposableStore();
		this._disposables.value = store;

		if (!chatResource) {
			this._update(undefined, []);
			return;
		}

		store.add(autorun(reader => {
			const session = this.sessionsService.activeSession.read(reader);
			const chats = session?.chats.read(reader) ?? [];
			const agents = chats.filter(c =>
				c.origin?.kind === ChatOriginKind.Tool &&
				!!c.origin.parentChat &&
				isEqual(c.origin.parentChat, chatResource));
			this._update(session, agents);
		}));
	}

	private _update(session: IActiveSession | undefined, agents: readonly IChat[]): void {
		this._session = session;
		this._agents = agents;
		this._setVisible(agents.length > 0);
	}

	private _showMenu(): void {
		const session = this._session;
		if (!session || this._agents.length === 0) {
			return;
		}
		const actions = this._agents.map(agent => toAction({
			id: `sessionAgents.open.${agent.resource.toString()}`,
			label: agent.title.get(),
			run: () => this.sessionsService.openChat(session, agent.resource),
		}));
		this.contextMenuService.showContextMenu({
			getAnchor: () => this._button.element,
			getActions: () => actions,
		});
	}

	private _setVisible(visible: boolean): void {
		this.element.classList.toggle('hidden', !visible);
	}
}
