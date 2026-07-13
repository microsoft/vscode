/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/openSubagentChat.css';
import { $ } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { parseChatUri, parseSubagentSessionUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';

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

/**
 * Finds the surfaced peer chat (and its owning session) for a subagent chat
 * resource across the active + visible sessions, constrained to the owning
 * session when derivable so a `chatId` that collides across visible sessions
 * can't match the wrong tab. Reactive when a {@link IReader} is provided.
 */
function findSubagentChat(sessionsService: ISessionsService, resource: string, reader: IReader | undefined): { readonly session: IActiveSession; readonly chat: IChat } | undefined {
	const chatId = chatIdFromResource(resource);
	const ownerPath = ownerSessionPath(resource);
	const allSessions = [sessionsService.activeSession.read(reader), ...sessionsService.visibleSessions.read(reader)]
		.filter((s): s is IActiveSession => !!s);
	const candidates = ownerPath
		? allSessions.filter(s => s.resource.path === ownerPath)
		: allSessions;
	for (const session of candidates) {
		const chat = session.chats.read(reader).find(c => matchesResource(c, resource, chatId));
		if (chat) {
			return { session, chat };
		}
	}
	return undefined;
}

/**
 * Toolbar context forwarded by the subagent header (`ChatSubagentContentPart`):
 * the subagent's chat resource plus its agent name (shown as the pill prefix).
 * A bare resource string is also accepted for backwards compatibility.
 */
interface IOpenSubagentChatContext {
	readonly chatResource: string;
	readonly agentName?: string;
}

function contextChatResource(context: unknown): string | undefined {
	if (typeof context === 'string') {
		return context;
	}
	if (context && typeof context === 'object' && typeof (context as IOpenSubagentChatContext).chatResource === 'string') {
		return (context as IOpenSubagentChatContext).chatResource;
	}
	return undefined;
}

function contextAgentName(context: unknown): string | undefined {
	if (context && typeof context === 'object') {
		const agentName = (context as IOpenSubagentChatContext).agentName;
		return typeof agentName === 'string' && agentName ? agentName : undefined;
	}
	return undefined;
}

class OpenSubagentChatAction extends Action2 {
	constructor() {
		super({
			id: OPEN_SUBAGENT_CHAT_ACTION_ID,
			title: localize2('chat.subagent.openChat', "Open Subagent"),
			icon: Codicon.commentDiscussion,
			// Contextual: invoked from a specific subagent's header toolbar, which
			// forwards that subagent's chat resource. Not a palette command.
			f1: false,
			menu: { id: MenuId.ChatSubagentContent, group: 'navigation' },
		});
	}

	override async run(accessor: ServicesAccessor, context?: string | IOpenSubagentChatContext): Promise<void> {
		const resource = contextChatResource(context);
		if (!resource) {
			return;
		}
		const logService = accessor.get(ILogService);
		const sessionsService = accessor.get(ISessionsService);

		// The pill is clicked from within the lead chat's transcript, so the
		// subagent peer normally lives in the currently active session; the finder
		// falls back to scanning all visible sessions in case the active slot
		// differs.
		const match = findSubagentChat(sessionsService, resource, undefined);
		if (match) {
			await sessionsService.openChat(match.session, match.chat.resource);
			return;
		}

		const active = sessionsService.activeSession.get();
		const available = active?.chats.get().map(c => c.resource.toString()).join(', ') ?? '(none)';
		logService.warn(`[Sessions] Cannot open subagent chat for resource '${resource}' (chatId='${chatIdFromResource(resource)}'). Available chats: ${available}`);
	}
}
registerAction2(OpenSubagentChatAction);

/**
 * Renders the "Open Subagent" pill as a standalone chip (styled like the chat
 * file/diff pill). See SESSIONS.md and `./media/openSubagentChat.css` for details.
 */
class OpenSubagentChatActionViewItem extends BaseActionViewItem {

	private _resolvedTitle: string | undefined;
	private readonly _titleTracker = this._register(new MutableDisposable());
	private _prefixElement: HTMLElement | undefined;
	private _labelElement: HTMLElement | undefined;

	constructor(
		context: unknown,
		action: IAction,
		options: IActionViewItemOptions,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		// Base render wires mouse click on the container; the actionbar wires
		// keyboard (Enter/Space) via `doTrigger`, so both dispatch the action.
		super.render(container);
		container.classList.add('chat-subagent-pill-widget');
		// The ActionBar creates the `<li>` with role="presentation"; mark it as an
		// actionable control for screen readers.
		container.setAttribute('role', 'button');

		const icon = $('span.chat-subagent-pill-icon');
		icon.appendChild($('span.chat-subagent-pill-spinner.codicon.codicon-loading.codicon-modifier-spin'));
		icon.appendChild($(`span.chat-subagent-pill-open-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`));
		this._labelElement = $('span.chat-subagent-pill-label');
		container.append(icon, this._labelElement);
		this._labelElement.textContent = this._labelText();

		this._updatePrefix();
		this._updateTitleTracker();
		this.updateTooltip();
		this.updateEnabled();
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);
		this._updatePrefix();
		this._updateTitleTracker();
	}

	/**
	 * Renders the pill prefix (the subagent's agent name, falling back to
	 * "Subagent") before the chip, within the enclosing toolbar container.
	 */
	private _updatePrefix(): void {
		const toolbar = this.element?.closest('.chat-subagent-open-chat-toolbar');
		if (!toolbar) {
			return;
		}
		if (!this._prefixElement) {
			this._prefixElement = $('span.chat-subagent-pill-prefix');
			toolbar.insertBefore(this._prefixElement, toolbar.firstChild);
			this._register(toDisposable(() => {
				this._prefixElement?.remove();
				this._prefixElement = undefined;
			}));
		}
		const agentName = contextAgentName(this._context);
		this._prefixElement.textContent = agentName
			? agentName.charAt(0).toUpperCase() + agentName.slice(1)
			: localize('chat.subagent.prefix', "Subagent");
	}

	/**
	 * Tracks the resolved subagent chat's title and running state. The pill's
	 * spinner reflects the subagent chat's **own** {@link SessionStatus.InProgress}
	 * status rather than the parent `.chat-subagent-part`'s `chat-thinking-active`
	 * class: the spawning tool call completes as soon as the subagent is
	 * dispatched, so that class stops early while the worker keeps running.
	 */
	private _updateTitleTracker(): void {
		const resource = contextChatResource(this._context);
		if (!resource) {
			this._titleTracker.clear();
			this._setResolvedTitle(undefined);
			this._setRunning(false);
			return;
		}
		this._titleTracker.value = autorun(reader => {
			const chat = findSubagentChat(this.sessionsService, resource, reader)?.chat;
			this._setResolvedTitle(chat?.title.read(reader) || undefined);
			this._setRunning(chat?.status.read(reader) === SessionStatus.InProgress);
		});
	}

	private _setRunning(running: boolean): void {
		this.element?.classList.toggle('chat-subagent-running', running);
	}

	private _setResolvedTitle(title: string | undefined): void {
		if (title !== this._resolvedTitle) {
			this._resolvedTitle = title;
			if (this._labelElement) {
				this._labelElement.textContent = this._labelText();
			}
			this.updateTooltip();
		}
	}

	private _labelText(): string {
		return this._resolvedTitle || this._action.label;
	}

	protected override getTooltip(): string | undefined {
		return this._action.tooltip || this._action.label || undefined;
	}

	protected override updateEnabled(): void {
		if (!this.element) {
			return;
		}
		const enabled = this._action.enabled;
		this.element.classList.toggle('disabled', !enabled);
		this.element.setAttribute('aria-disabled', String(!enabled));
	}

	protected override updateAriaLabel(): void {
		if (!this.element) {
			return;
		}
		const ariaLabel = this._resolvedTitle
			? localize('chat.subagent.openChat.aria', "Open subagent chat: {0}", this._resolvedTitle)
			: this.getTooltip();
		if (ariaLabel) {
			this.element.setAttribute('aria-label', ariaLabel);
		} else {
			this.element.removeAttribute('aria-label');
		}
	}
}

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
			return instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}
registerWorkbenchContribution2(OpenSubagentChatActionViewItemContribution.ID, OpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockRestore);
