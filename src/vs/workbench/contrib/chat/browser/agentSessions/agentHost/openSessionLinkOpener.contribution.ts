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
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, resolveChatLinkFragment } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_CHAT_LINK_PATTERN, AGENT_HOST_SESSION_LINK_SCHEME, AGENT_HOST_SESSION_ONLY_LINK_PATTERN, AgentSessionLinkStatus, buildAgentSessionLinkPresentation, getSessionLinkAuthority, parseOpenSessionLinkChatId, parseOpenSessionLinkConnectionAuthority, parseOpenSessionLinkTurnId, parseOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentation, ILinkPresentationService, ILinkPresentationWatcher } from '../../../../../../platform/dataChannel/common/dataChannel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenOptions } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IChatRequestOriginService } from '../../../common/chatRequestOrigin.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../chat.js';
import { getAgentChangesSummary } from '../agentSessionsModel.js';
import { shouldRevealSessionEditor } from '../agentSessionsOpener.js';
import { ISessionSummaryHoverData } from '../sessionSummaryHover.js';
import { ISessionSummaryHoverService } from '../sessionSummaryHoverService.js';
import { handleSessionLink, revealLinkedRequest } from './sessionLinkNavigation.js';

/** Opens Agent Host session and request-origin links in the editor window using the owning connection's advertised resources. */
export class AgentHostOpenSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.chat.agentHostOpenSessionLinkOpener';
	private readonly _sessionListRefreshes = new Map<string, Promise<void>>();

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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async (resource, options) => this._open(resource, options),
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

	private async _open(resource: URI | string, options?: OpenOptions): Promise<boolean> {
		return handleSessionLink(resource, this._notificationService, () => this._openChat(resource, options));
	}

	private async _openChat(resource: URI | string, options?: OpenOptions): Promise<boolean> {
		const linked = await this._resolveClientSessionResource(resource, CancellationToken.None);
		const resolution = linked && this._connectionsService.resolveSessionResource(linked);
		if (!linked || !resolution || resolution.connection.connectionAvailable?.get() === false || !isEqual(resolution.backendSession, parseOpenSessionLinkUri(resource))) {
			return false;
		}
		const scope = parseOpenSessionLinkConnectionAuthority(resource);
		if (scope && getSessionLinkAuthority(this._connectionsService, resolution.connectionAuthority) !== scope) {
			return false;
		}
		const fragment = linked.fragment && await resolveChatLinkFragment(resolution.connection, resolution.backendSession, linked.fragment);
		if (fragment === undefined) {
			return false;
		}
		const clientResource = linked.with({ fragment });
		await this._chatSessionsService.activateChatSessionItemProvider(getChatSessionType(clientResource));
		const openToSide = options?.openToSide === true;
		const inEditor = !openToSide && this._configurationService.getValue<boolean>(ChatConfiguration.OpenSessionsInEditor);
		const widget = await this._chatWidgetService.openSession(clientResource, openToSide ? SIDE_GROUP : inEditor ? ACTIVE_GROUP : ChatViewPaneTarget, {
			...options?.editorOptions,
			revealIfOpened: inEditor ? shouldRevealSessionEditor(this._chatWidgetService, clientResource) : !openToSide,
			...(openToSide || inEditor ? {} : { keepFolder: true }),
		});
		const turn = parseOpenSessionLinkTurnId(resource);
		if (turn) {
			revealLinkedRequest(widget, clientResource, turn);
		}
		return !!widget;
	}

	private async _resolveClientSessionResource(resource: URI | string, token: CancellationToken): Promise<URI | undefined> {
		const backend = parseOpenSessionLinkUri(resource);
		if (!backend) {
			return undefined;
		}
		const scope = parseOpenSessionLinkConnectionAuthority(resource);
		const ambientScope = getSessionLinkAuthority(this._connectionsService, AMBIENT_AGENT_HOST_AUTHORITY);
		if (scope === AMBIENT_AGENT_HOST_AUTHORITY && scope !== ambientScope) {
			return undefined;
		}
		const authority = !scope || scope === ambientScope ? AMBIENT_AGENT_HOST_AUTHORITY : scope;
		const find = () => this._connectionsService.findSessionResource(backend, authority)?.with({ fragment: parseOpenSessionLinkChatId(resource) ?? '' });
		const cached = find();
		if (cached) {
			return cached;
		}
		let refresh = this._sessionListRefreshes.get(authority);
		if (!refresh) {
			refresh = this._loadSessionIdentities(authority).finally(() => {
				if (this._sessionListRefreshes.get(authority) === refresh) {
					this._sessionListRefreshes.delete(authority);
				}
			});
			this._sessionListRefreshes.set(authority, refresh);
		}
		await refresh;
		return token.isCancellationRequested ? undefined : find();
	}

	private async _loadSessionIdentities(authority: string): Promise<void> {
		const connection = authority === AMBIENT_AGENT_HOST_AUTHORITY
			? this._connectionsService.ambientConnection
			: this._connectionsService.getConnectionByAuthority(authority);
		if (!connection) {
			return;
		}
		for (const metadata of await connection.listSessions()) {
			this._connectionsService.registerSessionResource(metadata.session, authority, metadata.provider);
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
