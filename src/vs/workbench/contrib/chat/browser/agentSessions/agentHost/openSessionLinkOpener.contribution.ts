/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValueOpts } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_SESSION_LINK_PATTERN, AgentSessionLinkStatus, buildAgentSessionLinkPresentation, parseOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentation, ILinkPresentationService, ILinkPresentationWatcher } from '../../../../../../platform/dataChannel/common/dataChannel.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../chat.js';
import { getAgentChangesSummary } from '../agentSessionsModel.js';
import { ISessionSummaryHoverData } from '../sessionSummaryHover.js';
import { ISessionSummaryHoverService } from '../sessionSummaryHoverService.js';

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
		@ILinkPresentationService linkPresentationService: ILinkPresentationService,
		@ILogService logService: ILogService,
		@ISessionSummaryHoverService sessionSummaryHoverService: ISessionSummaryHoverService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
		this._register(linkPresentationService.registerLinkPresentationProvider({
			id: 'workbench.agentSessionLinkPresentation',
			uriPattern: AGENT_HOST_SESSION_LINK_PATTERN,
			kind: 'session',
		}, {
			createLinkPresentationWatcher: resource => {
				const clientResource = toClientSessionResource(resource);
				if (!clientResource) {
					throw new Error(`Invalid agent session link: ${resource.toString(true)}`);
				}
				return new WorkbenchAgentSessionLinkPresentationWatcher(clientResource, this._chatSessionsService, logService);
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
				return item ? toSessionSummaryHoverData(item) : undefined;
			},
		}));
	}

	private async _findChatSessionItem(resource: URI, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		const clientResource = toClientSessionResource(resource);
		if (!clientResource) {
			return undefined;
		}
		const chatSessionType = getChatSessionType(clientResource);
		await this._chatSessionsService.activateChatSessionItemProvider(chatSessionType);
		return findChatSessionItem(this._chatSessionsService, chatSessionType, clientResource, token);
	}

	private async _open(resource: URI | string): Promise<boolean> {
		const clientResource = toClientSessionResource(resource);
		if (!clientResource) {
			return false;
		}
		await this._chatSessionsService.activateChatSessionItemProvider(getChatSessionType(clientResource));
		const widget = await this._chatWidgetService.openSession(clientResource, ChatViewPaneTarget, { revealIfOpened: true });
		return !!widget;
	}
}

class WorkbenchAgentSessionLinkPresentationWatcher extends Disposable implements ILinkPresentationWatcher {
	private readonly _data = observableValueOpts<ILinkPresentation | undefined>(
		{ owner: this, equalsFn: structuralEquals },
		undefined,
	);
	readonly presentation: IObservable<ILinkPresentation | undefined> = this._data;

	private readonly _clientResource: URI;
	private readonly _chatSessionType: string;
	private readonly _providerReady: Promise<void>;
	private _refreshCancellation: CancellationTokenSource | undefined;

	constructor(
		clientResource: URI,
		private readonly _chatSessionsService: IChatSessionsService,
		private readonly _logService: ILogService,
	) {
		super();
		this._clientResource = clientResource;
		this._chatSessionType = getChatSessionType(this._clientResource);
		this._providerReady = this._chatSessionsService.activateChatSessionItemProvider(this._chatSessionType);
		this._register(Event.any(
			this._chatSessionsService.onDidChangeAvailability,
			this._chatSessionsService.onDidChangeInProgress,
			this._chatSessionsService.onDidChangeItemsProviders,
			this._chatSessionsService.onDidChangeSessionItems,
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
		await this._providerReady;
		const item = await findChatSessionItem(this._chatSessionsService, this._chatSessionType, this._clientResource, token);
		return item ? toSessionLinkPresentation(item) : undefined;
	}
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
): Promise<IChatSessionItem | undefined> {
	for await (const group of chatSessionsService.getChatSessionItems([chatSessionType], token)) {
		const item = group.items.find(candidate =>
			isEqual(candidate.resource, clientResource)
			|| !!candidate.legacyResource && isEqual(candidate.legacyResource, clientResource));
		if (item) {
			return item;
		}
	}
	return undefined;
}

function toClientSessionResource(resource: URI | string): URI | undefined {
	const backendSession = parseOpenSessionLinkUri(resource);
	if (!backendSession) {
		return undefined;
	}
	const provider = AgentSession.provider(backendSession);
	const rawId = AgentSession.id(backendSession);
	return provider && rawId
		? URI.from({ scheme: `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}`, path: `/${rawId}` })
		: undefined;
}

function toSessionLinkPresentation(item: IChatSessionItem): ILinkPresentation {
	const description = typeof item.description === 'string' ? item.description : item.description?.value;
	return buildAgentSessionLinkPresentation(item.label, description, chatSessionStatusName(item.status));
}

/**
 * Maps a chat session item onto the shared session hover data.
 *
 * The editor window only knows a session through its item, so the hover is
 * necessarily thinner than the Agents window's: the worktree path and the
 * session's pull requests have no representation here and are left out rather
 * than guessed at. Everything the item does carry — the workspace or worktree
 * path, the branch and the change counts — is surfaced through the same widget.
 */
function toSessionSummaryHoverData(item: IChatSessionItem): ISessionSummaryHoverData {
	const metadata = item.metadata;
	const changes = getAgentChangesSummary(item.changes);
	const worktree = metadata?.worktreePath;
	return {
		title: item.label,
		location: {
			workspace: metadata?.repositoryPath ?? metadata?.workingDirectoryPath,
			worktree,
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
