/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { parseChatUri, parseSubagentSessionUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { SessionHeaderMetaActionViewItem } from '../../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat } from '../../../../services/sessions/common/session.js';

// "Open Subagent" affordance for agent host worker (subagent) chats.
//
// The chat widget renders the inline subagent block in the lead chat's
// transcript and anchors the `MenuId.ChatSubagentContent` menu in its header,
// forwarding the subagent's chat resource (a URI string) as the action context.
// The widget is provider-agnostic and lives in a lower layer, so it cannot
// resolve that resource to an Agents-window tab itself. This action is
// contributed by the AGENT HOST PROVIDER — which owns the subagent chat URI
// format (see `parseChatUri`/`parseSubagentSessionUri`) — so parsing those URIs
// and mapping them to a surfaced peer chat is a natural provider concern. It is
// rendered as a pill and activates the matching tab in the active session.

const OPEN_SUBAGENT_CHAT_ACTION_ID = 'workbench.action.chat.openAgentHostChat';

/**
 * Recovers the surfaced peer chat's chatId (e.g. `subagent/<toolCallId>`) from a
 * subagent's backend chat resource. The resource arrives in one of two canonical
 * forms — a live AHP chat URI or a restored subagent session URI — each with its
 * own inverse parser; the surfaced tab's chatId is `subagent/<toolCallId>` in
 * both cases.
 */
function chatIdFromResource(resource: string): string | undefined {
	// Live AHP chat URI: `ahp-chat://subagent/<base64-session>/<toolCallId>`.
	const fromChatUri = parseChatUri(resource)?.chatId;
	if (fromChatUri) {
		return fromChatUri;
	}
	// Restored subagent session URI: `<scheme>:/<parentPath>/subagent/<toolCallId>`.
	const fromSessionUri = parseSubagentSessionUri(resource);
	return fromSessionUri ? `subagent/${fromSessionUri.toolCallId}` : undefined;
}

function matchesResource(chat: IChat, resource: string, chatId: string | undefined): boolean {
	if (chat.resource.toString() === resource) {
		return true;
	}
	return !!chatId && chat.resource.fragment === chatId;
}

/**
 * The owning session's id path (e.g. `/<sessionId>`) for a subagent chat
 * resource, recovered from whichever canonical form it takes. The UI session
 * resource and the backend session URI differ only in scheme (e.g.
 * `agent-host-copilotcli:/<id>` vs `copilotcli:/<id>`), so the path is a stable
 * cross-form session key. Used to constrain matching to the owning session so a
 * `subagent/<toolCallId>` chatId that collides across visible sessions can't
 * open the wrong tab.
 */
function ownerSessionPath(resource: string): string | undefined {
	const fromChatUri = parseChatUri(resource)?.session;
	if (fromChatUri) {
		try {
			return URI.parse(fromChatUri).path;
		} catch {
			return undefined;
		}
	}
	return parseSubagentSessionUri(resource)?.parentSession.path;
}

class OpenSubagentChatAction extends Action2 {
	constructor() {
		super({
			id: OPEN_SUBAGENT_CHAT_ACTION_ID,
			title: localize2('chat.subagent.openChat', "Open Subagent"),
			icon: Codicon.linkExternal,
			// Contextual: invoked from a specific subagent's header toolbar, which
			// forwards that subagent's chat resource. Not a palette command.
			f1: false,
			menu: { id: MenuId.ChatSubagentContent, group: 'navigation' },
		});
	}

	override async run(accessor: ServicesAccessor, resource?: string): Promise<void> {
		if (!resource) {
			return;
		}
		const logService = accessor.get(ILogService);
		const sessionsService = accessor.get(ISessionsService);
		const chatId = chatIdFromResource(resource);
		const ownerPath = ownerSessionPath(resource);

		// The pill is clicked from within the lead chat's transcript, so the
		// subagent peer normally lives in the currently active session; fall back
		// to scanning all visible sessions in case the active slot differs. When
		// the owning session is derivable, constrain to it so a `chatId` that
		// collides across visible sessions can't open the wrong tab.
		const allSessions = [sessionsService.activeSession.get(), ...sessionsService.visibleSessions.get()]
			.filter((s): s is NonNullable<typeof s> => !!s);
		const candidates = ownerPath
			? allSessions.filter(s => s.resource.path === ownerPath)
			: allSessions;

		for (const session of candidates) {
			const chat = session.chats.get().find(c => matchesResource(c, resource, chatId));
			if (chat) {
				await sessionsService.openChat(session, chat.resource);
				return;
			}
		}

		const active = sessionsService.activeSession.get();
		const available = active?.chats.get().map(c => c.resource.toString()).join(', ') ?? '(none)';
		logService.warn(`[Sessions] Cannot open subagent chat for resource '${resource}' (chatId='${chatId}'). Available chats: ${available}`);
	}
}
registerAction2(OpenSubagentChatAction);

/**
 * Renders the "Open Subagent" action contributed into the subagent header
 * ({@link MenuId.ChatSubagentContent}) as the same compact secondary-button pill
 * used in the session header meta row. Registered for every agent host session
 * (local and remote): the file is imported for side effect by both the desktop
 * and web Agents-window entry points. Because it is contributed only in the
 * Agents window, the regular chat view's subagent header stays empty.
 */
class OpenSubagentChatActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openSubagentChatActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The action view item service only notifies toolbars of a factory via
		// the event passed to register(), not on registration itself. Announce
		// the factory once right after registering so any subagent header toolbar
		// created earlier re-renders and picks up the pill.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(MenuId.ChatSubagentContent, OPEN_SUBAGENT_CHAT_ACTION_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SessionHeaderMetaActionViewItem, undefined, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}
registerWorkbenchContribution2(OpenSubagentChatActionViewItemContribution.ID, OpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockRestore);
