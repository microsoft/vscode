/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { tildify } from '../../../../../../base/common/labels.js';
import { IObservable, observableValueOpts } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_CHAT_LINK_PATTERN, AGENT_HOST_SESSION_LINK_SCHEME, AGENT_HOST_SESSION_ONLY_LINK_PATTERN, AgentSessionLinkStatus, buildAgentSessionLinkPresentation, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentation, ILinkPresentationService, ILinkPresentationWatcher } from '../../../../../../platform/dataChannel/common/dataChannel.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IChatRequestOriginService } from '../../../common/chatRequestOrigin.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../chat.js';
import { getAgentChangesSummary } from '../agentSessionsModel.js';
import { ISessionSummaryHoverData } from '../sessionSummaryHover.js';
import { ISessionSummaryHoverService } from '../sessionSummaryHoverService.js';

/**
 * Editor-window counterpart to the Agents window's
 * `OpenSessionLinkOpenerContribution`: handles `agent-host-session://` links
 * surfaced by the `create_session` / `create_chat` server tools, so the linked
 * session title also works in the regular editor-window chat.
 *
 * The link carries the backend session URI (`<provider>:/<rawId>`); sessions
 * created from an editor-window chat run on the window's ambient/local host,
 * whose client scheme is `agent-host-<provider>`. We rebuild that client
 * resource and open it through {@link IChatWidgetService.openSession}.
 *
 * Also registers an {@link IChatRequestOriginService} opener that reuses {@link _open} for delegated request-origin links (e.g. "Sent from another chat").
 *
 * Registered only from the workbench's electron-browser chat contribution (never
 * loaded by the Agents window), so it never competes with the Agents-window
 * opener.
 */
export class AgentHostOpenSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.chat.agentHostOpenSessionLinkOpener';
	private _sessionListRefresh: Promise<void> | undefined;

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatRequestOriginService requestOriginService: IChatRequestOriginService,
		@ILinkPresentationService linkPresentationService: ILinkPresentationService,
		@ILogService logService: ILogService,
		@ISessionSummaryHoverService sessionSummaryHoverService: ISessionSummaryHoverService,
		@IPathService pathService: IPathService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
		this._register(requestOriginService.registerOpener({
			open: async origin => origin.sourceSessionResource.scheme === AGENT_HOST_SESSION_LINK_SCHEME
				? this._open(origin.sourceSessionResource)
				: false,
		}));
		this._register(linkPresentationService.registerLinkPresentationProvider({
			id: 'workbench.agentSessionLinkPresentation',
			uriPattern: AGENT_HOST_SESSION_ONLY_LINK_PATTERN,
			kind: 'session',
		}, {
			createLinkPresentationWatcher: resource => {
				if (!parseOpenSessionLinkUri(resource)) {
					throw new Error(`Invalid agent session link: ${resource.toString(true)}`);
				}
				return new WorkbenchAgentSessionLinkPresentationWatcher(token => this._resolveClientSessionResource(resource, token), 'session', this._chatSessionsService, logService, this._connectionsService.onDidChangeSessionResolution);
			},
		}));
		this._register(linkPresentationService.registerLinkPresentationProvider({
			id: 'workbench.agentChatLinkPresentation',
			uriPattern: AGENT_HOST_CHAT_LINK_PATTERN,
			kind: 'chat',
		}, {
			createLinkPresentationWatcher: resource => {
				if (!parseOpenSessionLinkUri(resource)) {
					throw new Error(`Invalid agent chat link: ${resource.toString(true)}`);
				}
				return new WorkbenchAgentSessionLinkPresentationWatcher(token => this._resolveClientSessionResource(resource, token), 'chat', this._chatSessionsService, logService, this._connectionsService.onDidChangeSessionResolution);
			},
		}));
		// The editor window's adapter onto the shared session hover. It resolves
		// the same chat session item the pill's presentation comes from, so the
		// hover shows what this window knows — title, workspace, branch and
		// changes — while the worktree and pull requests, which only the Agents
		// window's session model carries, are simply absent.
		this._register(sessionSummaryHoverService.registerProvider({
			provideSessionSummaryHoverData: async (resource, token) => {
				const item = await this._findChatSessionItem(resource, token);
				return item ? toSessionSummaryHoverData(item, pathService.userHome({ preferLocal: true }).fsPath) : undefined;
			},
		}));
	}

	private async _findChatSessionItem(resource: URI, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		const clientResource = await this._resolveClientSessionResource(resource, token);
		if (!clientResource) {
			return undefined;
		}
		const chatSessionType = getChatSessionType(clientResource);
		await this._chatSessionsService.activateChatSessionItemProvider(chatSessionType);
		return (await findChatSessionItem(this._chatSessionsService, chatSessionType, clientResource, token))?.item;
	}

	private async _open(resource: URI | string): Promise<boolean> {
		const clientResource = await this._resolveClientSessionResource(resource, CancellationToken.None);
		if (!clientResource) {
			return false;
		}
		await this._chatSessionsService.activateChatSessionItemProvider(getChatSessionType(clientResource));
		const widget = await this._chatWidgetService.openSession(clientResource, ChatViewPaneTarget, { revealIfOpened: true });
		return !!widget;
	}

	private async _resolveClientSessionResource(resource: URI | string, token: CancellationToken): Promise<URI | undefined> {
		const cached = toClientSessionResource(resource, this._connectionsService);
		if (cached || !parseOpenSessionLinkUri(resource)) {
			return cached;
		}
		if (!this._sessionListRefresh) {
			const refresh = this._loadSessionIdentities().finally(() => {
				if (this._sessionListRefresh === refresh) {
					this._sessionListRefresh = undefined;
				}
			});
			this._sessionListRefresh = refresh;
		}
		await this._sessionListRefresh;
		return token.isCancellationRequested ? undefined : toClientSessionResource(resource, this._connectionsService);
	}

	private async _loadSessionIdentities(): Promise<void> {
		for (const metadata of await this._connectionsService.ambientConnection.listSessions()) {
			this._connectionsService.getSessionResource(metadata.session, undefined, metadata.provider);
		}
	}
}

class WorkbenchAgentSessionLinkPresentationWatcher extends Disposable implements ILinkPresentationWatcher {
	private readonly _data = observableValueOpts<ILinkPresentation | undefined>(
		{ owner: this, equalsFn: structuralEquals },
		undefined,
	);
	readonly presentation: IObservable<ILinkPresentation | undefined> = this._data;

	private _providerReady: Promise<void> | undefined;
	private _refreshCancellation: CancellationTokenSource | undefined;

	constructor(
		private readonly _resolveClientResource: (token: CancellationToken) => Promise<URI | undefined>,
		private readonly _kind: 'session' | 'chat',
		private readonly _chatSessionsService: IChatSessionsService,
		private readonly _logService: ILogService,
		onDidChangeSessionResolution: Event<void> = Event.None,
	) {
		super();
		this._register(Event.any(
			this._chatSessionsService.onDidChangeAvailability,
			this._chatSessionsService.onDidChangeInProgress,
			this._chatSessionsService.onDidChangeItemsProviders,
			this._chatSessionsService.onDidChangeSessionItems,
			onDidChangeSessionResolution,
		)(() => this._refresh()));
		this._refresh();
	}

	override dispose(): void {
		this._refreshCancellation?.cancel();
		this._refreshCancellation?.dispose();
		this._refreshCancellation = undefined;
		super.dispose();
	}

	private _refresh(): void {
		this._refreshCancellation?.cancel();
		this._refreshCancellation?.dispose();
		const cancellation = new CancellationTokenSource();
		this._refreshCancellation = cancellation;
		void this._resolve(cancellation.token).then(data => {
			if (!cancellation.token.isCancellationRequested && this._refreshCancellation === cancellation) {
				this._data.set(data, undefined);
			}
		}, error => {
			if (!isCancellationError(error) && !cancellation.token.isCancellationRequested) {
				this._logService.error('Failed to refresh agent session link presentation', error);
			}
		});
	}

	private async _resolve(token: CancellationToken): Promise<ILinkPresentation | undefined> {
		const clientResource = await this._resolveClientResource(token);
		if (!clientResource || token.isCancellationRequested) {
			return undefined;
		}
		const chatSessionType = getChatSessionType(clientResource);
		this._providerReady ??= this._chatSessionsService.activateChatSessionItemProvider(chatSessionType);
		await this._providerReady;
		const match = await findChatSessionItem(this._chatSessionsService, chatSessionType, clientResource, token);
		return match ? toSessionLinkPresentation(match.item, match.status, this._kind) : undefined;
	}
}

interface IChatSessionItemMatch {
	readonly item: IChatSessionItem;
	readonly status: ChatSessionStatus | undefined;
}

/**
 * The chat session item behind {@link clientResource}, or `undefined` when this
 * window's providers do not surface it.
 */
async function findChatSessionItem(
	chatSessionsService: IChatSessionsService,
	chatSessionType: string,
	clientResource: URI,
	token: CancellationToken,
): Promise<IChatSessionItemMatch | undefined> {
	for await (const group of chatSessionsService.getChatSessionItems([chatSessionType], token)) {
		const match = findChatSessionItemByResource(group.items, clientResource);
		if (match) {
			return match;
		}
	}
	return undefined;
}

function findChatSessionItemByResource(items: readonly IChatSessionItem[], resource: URI, parentStatus?: ChatSessionStatus): IChatSessionItemMatch | undefined {
	for (const item of items) {
		const status = item.status ?? parentStatus;
		if (isEqual(item.resource, resource) || !!item.legacyResource && isEqual(item.legacyResource, resource)) {
			return { item, status };
		}
		const child = item.children && findChatSessionItemByResource(item.children, resource, status);
		if (child) {
			return child;
		}
	}
	return undefined;
}

function toClientSessionResource(resource: URI | string, connectionsService: IAgentHostConnectionsService): URI | undefined {
	const backendSession = parseOpenSessionLinkUri(resource);
	if (!backendSession) {
		return undefined;
	}
	if (backendSession.scheme === 'ahp-session' || backendSession.authority || backendSession.query) {
		return connectionsService.findSessionResource(backendSession)?.with({ fragment: parseOpenSessionLinkChatId(resource) ?? '' });
	}
	const provider = AgentSession.provider(backendSession);
	const rawId = AgentSession.id(backendSession);
	return provider && rawId
		? URI.from({ scheme: `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}`, path: `/${rawId}`, fragment: parseOpenSessionLinkChatId(resource) })
		: undefined;
}

function toSessionLinkPresentation(item: IChatSessionItem, status: ChatSessionStatus | undefined, kind: 'session' | 'chat'): ILinkPresentation {
	const description = typeof item.description === 'string' ? item.description : item.description?.value;
	return buildAgentSessionLinkPresentation(item.label, description, chatSessionStatusName(status), kind);
}

/**
 * Maps a chat session item onto the shared session hover data.
 *
 * The editor window only knows a session through its item, so the hover is
 * necessarily thinner than the Agents window's: the worktree path and the
 * session's pull requests have no representation here and are left out rather
 * than guessed at. Everything the item does carry — the workspace or worktree
 * path, the branch and the change counts — is surfaced through the same widget.
 *
 * Paths arrive as opaque strings rather than URIs, so they are tildified
 * directly instead of going through the label service; {@link tildify} rewrites
 * only a path that really sits under {@link userHome}, leaving a remote
 * session's path alone.
 */
function toSessionSummaryHoverData(item: IChatSessionItem, userHome: string): ISessionSummaryHoverData {
	const metadata = item.metadata;
	const changes = getAgentChangesSummary(item.changes);
	const workspace = metadata?.repositoryPath ?? metadata?.workingDirectoryPath;
	return {
		title: item.label,
		location: {
			workspace: workspace ? tildify(workspace, userHome) : undefined,
			worktree: metadata?.worktreePath ? tildify(metadata.worktreePath, userHome) : undefined,
			branch: metadata?.branchName ?? metadata?.branch,
			changes: changes && (changes.insertions > 0 || changes.deletions > 0) ? changes : undefined,
		},
	};
}

function chatSessionStatusName(status: ChatSessionStatus | undefined): AgentSessionLinkStatus {
	switch (status) {
		case ChatSessionStatus.Failed: return 'error';
		case ChatSessionStatus.InProgress: return 'inProgress';
		case ChatSessionStatus.NeedsInput: return 'needsInput';
		case ChatSessionStatus.Completed:
		case undefined:
			return 'completed';
	}
}
