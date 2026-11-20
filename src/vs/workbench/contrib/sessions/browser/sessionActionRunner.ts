/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../services/sessions/browser/sessionHost.js';
import { ISessionsService } from './sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';

type IPaneActivator = Pick<ISessionsService, 'gridHost' | 'getPaneOfHost' | 'activatePane' | 'panes'>;

/** The chat an action acts on, with its session. */
export interface IActionTarget {
	readonly session: ISession | undefined;
	readonly chatResource: URI | undefined;
}

/** Activates the pane of the grid that the originating host is in before running a session-scoped action. */
export class SessionActivatingActionRunner extends ActionRunner {

	constructor(
		private readonly _host: ISessionHost,
		private readonly _sessionsService: IPaneActivator,
		private readonly _getTarget?: () => IActionTarget,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		activateHostPane(this._sessionsService, this._host, this._getTarget?.());
		await super.runAction(action, context);
	}
}

/**
 * Makes a pane of the grid the active pane before an action of `host` on `target`:
 * - the pane of `host`, or of the host it is nested in, such as a pane's composer;
 * - for a host of the main window outside its panes, such as the Inbox's, the pane of the main window's grid that shows
 *   the target: the detached pane of its chat, else its session's slot, as acting on a session there selects it;
 * - nothing for a host of another window, such as a chat window's: an action there leaves the grid as it is.
 */
export function activateHostPane(sessionsService: IPaneActivator, host: ISessionHost, target?: IActionTarget): void {
	let candidate: ISessionHost | undefined = host;
	for (; candidate && candidate !== sessionsService.gridHost; candidate = candidate.parent) {
		const pane = sessionsService.getPaneOfHost(candidate);
		if (pane) {
			sessionsService.activatePane(pane);
			return;
		}
	}
	const pane = candidate && candidate === sessionsService.gridHost && target?.session ? paneOfTarget(sessionsService.panes.get(), target.session, target.chatResource) : undefined;
	if (pane) {
		sessionsService.activatePane(pane);
	}
}

function paneOfTarget(panes: readonly ISessionGridPane[], session: ISession, chatResource: URI | undefined): ISessionGridPane | undefined {
	const ofSession = panes.filter(pane => pane.session.get()?.sessionId === session.sessionId);
	return ofSession.find(pane => pane.kind === SessionGridPaneKind.Detached && isEqual(pane.chat.get()?.resource, chatResource))
		?? ofSession.find(pane => pane.kind === SessionGridPaneKind.Slot);
}
