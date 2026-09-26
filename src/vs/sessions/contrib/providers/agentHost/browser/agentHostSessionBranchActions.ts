/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildExternalOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { SessionProviderIdContext } from '../../../../common/contextkeys.js';
import { COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID, COPY_AGENT_HOST_SESSION_LINK_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { Menus } from '../../../../browser/menus.js';

interface ISessionChatLinkContext {
	readonly session: ISession;
	readonly chat: IChat;
}

function getSession(context: ISession | ISession[] | undefined): ISession | undefined {
	return Array.isArray(context) ? context[0] : context;
}

function buildExternalLink(accessor: ServicesAccessor, session: ISession, chatId?: string): string {
	const identity = accessor.get(IAgentHostConnectionsService).resolveSessionResourceIdentity(session.resource);
	if (!identity) {
		throw new Error(`Cannot resolve Agent Host session resource ${session.resource.toString()}`);
	}
	return buildExternalOpenSessionLinkUri(accessor.get(IProductService).urlProtocol, identity.backendSession, chatId);
}

registerAction2(class CopyAgentHostSessionLinkAction extends Action2 {
	constructor() {
		super({
			id: COPY_AGENT_HOST_SESSION_LINK_COMMAND_ID,
			title: localize2('copyAgentHostSessionLink', "Copy Link"),
			menu: [{
				id: Menus.SessionItemContextMenu,
				group: '2_open',
				order: 2,
				when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}, {
				id: Menus.SessionHeaderContext,
				group: '2_edit',
				order: 2,
				when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = getSession(context);
		if (!session) {
			return;
		}
		await accessor.get(IClipboardService).writeText(buildExternalLink(accessor, session));
	}
});

registerAction2(class CopyAgentHostChatLinkAction extends Action2 {
	constructor() {
		super({
			id: COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID,
			title: localize2('copyAgentHostChatLink', "Copy Link"),
			menu: [{
				id: Menus.SessionChatItemContext,
				group: '3_copy',
				order: 1,
				when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISessionChatLinkContext): Promise<void> {
		if (!context) {
			return;
		}
		await accessor.get(IClipboardService).writeText(buildExternalLink(accessor, context.session, context.chat.resource.fragment || undefined));
	}
});
