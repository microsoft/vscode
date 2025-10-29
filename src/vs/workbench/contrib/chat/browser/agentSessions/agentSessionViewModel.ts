/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IChatService } from '../../common/chatService.js';
import { ChatSessionStatus, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatSessionUri } from '../../common/chatUri.js';

//#region Interfaces, Types

export interface IAgentSessionsViewModel {

	readonly onWillResolve: Event<void>;
	readonly onDidResolve: Event<void>;

	readonly onDidChangeSessions: Event<void>;

	readonly sessions: IAgentSessionViewModel[];

	resolve(provider: string | string[] | undefined): Promise<void>;
}

export interface IAgentSessionViewModel {

	readonly provider: IChatSessionItemProvider;

	readonly id: string;
	readonly resource: URI;

	readonly status?: ChatSessionStatus;

	readonly label: string;
	readonly description: string | IMarkdownString;
	readonly icon?: ThemeIcon; // TODO@bpasero support

	readonly timing: {
		readonly startTime: number;
		readonly endTime?: number;
	};

	readonly statistics?: {
		readonly insertions: number;
		readonly deletions: number;
	};
}

export function isLocalAgentSessionItem(session: IAgentSessionViewModel): boolean {
	return session.provider.chatSessionType === localChatSessionType;
}

export function isAgentSession(obj: IAgentSessionsViewModel | IAgentSessionViewModel): obj is IAgentSessionViewModel {
	const session = obj as IAgentSessionViewModel | undefined;

	return typeof session?.id === 'string';
}

export function isAgentSessionsViewModel(obj: IAgentSessionsViewModel | IAgentSessionViewModel): obj is IAgentSessionsViewModel {
	const sessionsViewModel = obj as IAgentSessionsViewModel | undefined;

	return Array.isArray(sessionsViewModel?.sessions);
}

//#endregion

const INCLUDE_HISTORY = false;
export class AgentSessionsViewModel extends Disposable implements IAgentSessionsViewModel {

	readonly sessions: IAgentSessionViewModel[] = [];

	private readonly _onWillResolve = this._register(new Emitter<void>());
	readonly onWillResolve = this._onWillResolve.event;

	private readonly _onDidResolve = this._register(new Emitter<void>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly resolver = this._register(new ThrottledDelayer<void>(100));
	private readonly providersToResolve = new Set<string | undefined>();

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		this.registerListeners();

		this.resolve(undefined);
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType: provider }) => this.resolve(provider)));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
		this._register(this.chatSessionsService.onDidChangeSessionItems(provider => this.resolve(provider)));
	}

	async resolve(provider: string | string[] | undefined): Promise<void> {
		if (Array.isArray(provider)) {
			for (const p of provider) {
				this.providersToResolve.add(p);
			}
		} else {
			this.providersToResolve.add(provider);
		}

		return this.resolver.trigger(async token => {
			if (token.isCancellationRequested) {
				return;
			}

			try {
				this._onWillResolve.fire();
				return await this.doResolve(token);
			} finally {
				this._onDidResolve.fire();
			}
		});
	}

	private async doResolve(token: CancellationToken): Promise<void> {
		const providersToResolve = Array.from(this.providersToResolve);
		this.providersToResolve.clear();

		const newSessions: IAgentSessionViewModel[] = [];
		for (const provider of this.chatSessionsService.getAllChatSessionItemProviders()) {
			if (!providersToResolve.includes(undefined) && !providersToResolve.includes(provider.chatSessionType)) {
				newSessions.push(...this.sessions.filter(session => session.provider.chatSessionType === provider.chatSessionType));
				continue; // skipped for resolving, preserve existing ones
			}

			const sessions = await provider.provideChatSessionItems(token);
			if (token.isCancellationRequested) {
				return;
			}

			for (const session of sessions) {
				if (session.id === 'show-history' || session.id === 'workbench.panel.chat.view.copilot') {
					continue; // TODO@bpasero this needs to be fixed at the provider level
				}

				newSessions.push({
					provider,
					id: session.id,
					resource: session.resource,
					label: session.label,
					description: session.description || new MarkdownString(`_<${localize('chat.session.noDescription', 'No description')}>_`),
					icon: session.iconPath,
					status: session.status,
					timing: {
						startTime: session.timing.startTime,
						endTime: session.timing.endTime
					},
					statistics: session.statistics
				});
			}

			if (INCLUDE_HISTORY && provider.chatSessionType === localChatSessionType) {
				// TODO@bpasero this needs to come from the local provider:
				// - do we want to show history or not and how
				// - can we support all properties including `startTime` properly
				for (const history of await this.chatService.getLocalSessionHistory()) {
					newSessions.push({
						id: history.sessionId,
						resource: ChatSessionUri.forSession(localChatSessionType, history.sessionId),
						label: history.title,
						provider: provider,
						timing: {
							startTime: history.lastMessageDate ?? Date.now()
						},
						description: new MarkdownString(`_<${localize('chat.session.noDescription', 'No description')}>_`),
					});
				}
			}
		}

		this.sessions.length = 0;
		this.sessions.push(...newSessions);

		this._onDidChangeSessions.fire();
	}
}
