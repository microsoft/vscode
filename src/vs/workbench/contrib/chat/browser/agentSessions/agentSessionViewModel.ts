/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatSessionStatus, IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from './agentSessions.js';
import { AgentSessionsViewFilter } from './agentSessionsViewFilter.js';

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
	readonly providerLabel: string;

	readonly resource: URI;

	readonly status: ChatSessionStatus;
	readonly archived: boolean;

	readonly tooltip?: string | IMarkdownString;

	readonly label: string;
	readonly description?: string | IMarkdownString;
	readonly icon: ThemeIcon;

	readonly timing: {
		readonly startTime: number;
		readonly endTime?: number;

		readonly inProgressTime?: number;
		readonly finishedOrFailedTime?: number;
	};

	readonly statistics?: {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	};
}

export function isLocalAgentSessionItem(session: IAgentSessionViewModel): boolean {
	return session.provider.chatSessionType === localChatSessionType;
}

export function isAgentSession(obj: IAgentSessionsViewModel | IAgentSessionViewModel): obj is IAgentSessionViewModel {
	const session = obj as IAgentSessionViewModel | undefined;

	return URI.isUri(session?.resource);
}

export function isAgentSessionsViewModel(obj: IAgentSessionsViewModel | IAgentSessionViewModel): obj is IAgentSessionsViewModel {
	const sessionsViewModel = obj as IAgentSessionsViewModel | undefined;

	return Array.isArray(sessionsViewModel?.sessions);
}

//#endregion

export interface IAgentSessionsViewModelOptions {
	readonly filterMenuId: MenuId;
}

export class AgentSessionsViewModel extends Disposable implements IAgentSessionsViewModel {

	private readonly _onWillResolve = this._register(new Emitter<void>());
	readonly onWillResolve = this._onWillResolve.event;

	private readonly _onDidResolve = this._register(new Emitter<void>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private _sessions: IAgentSessionViewModel[] = [];

	get sessions(): IAgentSessionViewModel[] {
		return this._sessions.filter(session => !this.filter.exclude(session));
	}

	private readonly resolver = this._register(new ThrottledDelayer<void>(100));
	private readonly providersToResolve = new Set<string | undefined>();

	private readonly mapSessionToState = new ResourceMap<{
		status: ChatSessionStatus;

		inProgressTime?: number;
		finishedOrFailedTime?: number;
	}>();

	private readonly filter: AgentSessionsViewFilter;

	constructor(
		options: IAgentSessionsViewModelOptions,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.filter = this._register(this.instantiationService.createInstance(AgentSessionsViewFilter, { filterMenuId: options.filterMenuId }));

		this.registerListeners();

		this.resolve(undefined);
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType: provider }) => this.resolve(provider)));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
		this._register(this.chatSessionsService.onDidChangeSessionItems(provider => this.resolve(provider)));
		this._register(this.filter.onDidChange(() => this._onDidChangeSessions.fire()));
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
			if (token.isCancellationRequested || this.lifecycleService.willShutdown) {
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

		const mapSessionContributionToType = new Map<string, IChatSessionsExtensionPoint>();
		for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
			mapSessionContributionToType.set(contribution.type, contribution);
		}

		const sessions = new ResourceMap<IAgentSessionViewModel>();
		for (const provider of this.chatSessionsService.getAllChatSessionItemProviders()) {
			if (!providersToResolve.includes(undefined) && !providersToResolve.includes(provider.chatSessionType)) {
				for (const session of this._sessions) {
					if (session.provider.chatSessionType === provider.chatSessionType) {
						sessions.set(session.resource, session);
					}
				}

				continue; // skipped for resolving, preserve existing ones
			}

			const providerSessions = await provider.provideChatSessionItems(token);
			if (token.isCancellationRequested) {
				return;
			}

			for (const session of providerSessions) {

				// Icon + Label
				let icon: ThemeIcon;
				let providerLabel: string;
				switch ((provider.chatSessionType)) {
					case AgentSessionProviders.Local:
						providerLabel = getAgentSessionProviderName(AgentSessionProviders.Local);
						icon = getAgentSessionProviderIcon(AgentSessionProviders.Local);
						break;
					case AgentSessionProviders.Background:
						providerLabel = getAgentSessionProviderName(AgentSessionProviders.Background);
						icon = getAgentSessionProviderIcon(AgentSessionProviders.Background);
						break;
					case AgentSessionProviders.Cloud:
						providerLabel = getAgentSessionProviderName(AgentSessionProviders.Cloud);
						icon = getAgentSessionProviderIcon(AgentSessionProviders.Cloud);
						break;
					default: {
						providerLabel = mapSessionContributionToType.get(provider.chatSessionType)?.name ?? provider.chatSessionType;
						icon = session.iconPath ?? Codicon.terminal;
					}
				}

				// State + Timings
				// TODO@bpasero this is a workaround for not having precise timing info in sessions
				// yet: we only track the time when a transition changes because then we can say with
				// confidence that the time is correct by assuming `Date.now()`. A better approach would
				// be to get all this information directly from the session.
				const status = session.status ?? ChatSessionStatus.Completed;
				const state = this.mapSessionToState.get(session.resource);
				let inProgressTime = state?.inProgressTime;
				let finishedOrFailedTime = state?.finishedOrFailedTime;

				// No previous state, just add it
				if (!state) {
					this.mapSessionToState.set(session.resource, {
						status
					});
				}

				// State changed, update it
				else if (status !== state.status) {
					inProgressTime = status === ChatSessionStatus.InProgress ? Date.now() : state.inProgressTime;
					finishedOrFailedTime = (status !== ChatSessionStatus.InProgress) ? Date.now() : state.finishedOrFailedTime;

					this.mapSessionToState.set(session.resource, {
						status,
						inProgressTime,
						finishedOrFailedTime
					});
				}

				sessions.set(session.resource, {
					provider,
					providerLabel,
					resource: session.resource,
					label: session.label,
					description: session.description,
					icon,
					tooltip: session.tooltip,
					status,
					archived: session.archived ?? false,
					timing: {
						startTime: session.timing.startTime,
						endTime: session.timing.endTime,
						inProgressTime,
						finishedOrFailedTime
					},
					statistics: session.statistics,
				});
			}
		}

		this._sessions.length = 0;
		this._sessions.push(...sessions.values());

		for (const [resource] of this.mapSessionToState) {
			if (!sessions.has(resource)) {
				this.mapSessionToState.delete(resource); // clean up tracking for removed sessions
			}
		}

		this._onDidChangeSessions.fire();
	}
}
