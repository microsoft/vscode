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
import { IAgentSessionLinkPresentation, parseOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { DataWatcherKind, IDataWatcher, IDataWatcherService } from '../../../../../../platform/dataChannel/common/dataChannel.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
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
		@IDataWatcherService dataWatcherService: IDataWatcherService,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
		this._register(dataWatcherService.registerDataWatcherProvider(DataWatcherKind.AgentSession, {
			createDataWatcher: params => {
				const clientResource = toClientSessionResource(params.resource);
				return clientResource
					? new WorkbenchAgentSessionDataWatcher(clientResource, this._chatSessionsService, logService)
					: undefined;
			},
		}));
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

class WorkbenchAgentSessionDataWatcher extends Disposable implements IDataWatcher<IAgentSessionLinkPresentation> {
	private readonly _data = observableValueOpts<IAgentSessionLinkPresentation | undefined>(
		{ owner: this, equalsFn: structuralEquals },
		undefined,
	);
	readonly data: IObservable<IAgentSessionLinkPresentation | undefined> = this._data;

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
				this._logService.error('Failed to refresh agent session data watcher', error);
			}
		});
	}

	private async _resolve(token: CancellationToken): Promise<IAgentSessionLinkPresentation | undefined> {
		await this._providerReady;
		for await (const group of this._chatSessionsService.getChatSessionItems([this._chatSessionType], token)) {
			const item = group.items.find(candidate =>
				isEqual(candidate.resource, this._clientResource)
				|| !!candidate.legacyResource && isEqual(candidate.legacyResource, this._clientResource));
			if (item) {
				return toSessionLinkPresentation(item);
			}
		}
		return undefined;
	}
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

function toSessionLinkPresentation(item: IChatSessionItem): IAgentSessionLinkPresentation {
	const description = typeof item.description === 'string' ? item.description : item.description?.value;
	return {
		title: item.label,
		...(description ? { description } : {}),
		status: chatSessionStatusName(item.status),
	};
}

function chatSessionStatusName(status: ChatSessionStatus | undefined): IAgentSessionLinkPresentation['status'] {
	switch (status) {
		case ChatSessionStatus.Failed: return 'error';
		case ChatSessionStatus.InProgress: return 'inProgress';
		case ChatSessionStatus.NeedsInput: return 'needsInput';
		case ChatSessionStatus.Completed:
		case undefined:
			return 'completed';
	}
}
