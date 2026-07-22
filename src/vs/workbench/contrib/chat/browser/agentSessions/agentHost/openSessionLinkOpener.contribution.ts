/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { parseOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../chat.js';

/**
 * Editor-window counterpart to the Agents window's
 * `OpenSessionLinkOpenerContribution`: handles `agent-host-session://` links
 * (surfaced by the `create_session` / `create_chat` server tools and rendered as
 * the "Open Session" pill) so the pill's button also works in the regular
 * editor-window chat.
 *
 * The link carries the backend session URI (`<provider>:/<rawId>`); sessions
 * created from an editor-window chat run on the window's ambient/local host,
 * whose client scheme is `agent-host-<provider>`. We rebuild that client
 * resource and open it through {@link IChatWidgetService.openSession}.
 *
 * Registered only from the workbench's electron-browser chat contribution (never
 * loaded by the Agents window), so it never competes with the Agents-window
 * opener.
 */
export class AgentHostOpenSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.chat.agentHostOpenSessionLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
	}

	private async _open(resource: URI | string): Promise<boolean> {
		const backendSession = parseOpenSessionLinkUri(resource);
		if (!backendSession) {
			return false;
		}
		const provider = AgentSession.provider(backendSession);
		const rawId = AgentSession.id(backendSession);
		if (!provider || !rawId) {
			return false;
		}
		const clientResource = URI.from({ scheme: `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}`, path: `/${rawId}` });
		await this._chatSessionsService.activateChatSessionItemProvider(getChatSessionType(clientResource));
		const widget = await this._chatWidgetService.openSession(clientResource, ChatViewPaneTarget, { revealIfOpened: true });
		return !!widget;
	}
}
