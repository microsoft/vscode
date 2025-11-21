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
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatSessionStatus, IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
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

	readonly providerType: string;
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
	return session.providerType === localChatSessionType;
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
	private readonly cache: AgentSessionsCache;

	constructor(
		options: IAgentSessionsViewModelOptions,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.filter = this._register(this.instantiationService.createInstance(AgentSessionsViewFilter, { filterMenuId: options.filterMenuId }));

		this.cache = this.instantiationService.createInstance(AgentSessionsCache);
		this._sessions = this.cache.loadCachedSessions();

		this.resolve(undefined);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType: provider }) => this.resolve(provider)));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(undefined)));
		this._register(this.chatSessionsService.onDidChangeSessionItems(provider => this.resolve(provider)));
		this._register(this.filter.onDidChange(() => this._onDidChangeSessions.fire()));
		this._register(this.storageService.onWillSaveState(() => this.cache.saveCachedSessions(this._sessions)));
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

		const resolvedProviders = new Set<string>();
		const sessions = new ResourceMap<IAgentSessionViewModel>();
		for (const provider of this.chatSessionsService.getAllChatSessionItemProviders()) {
			if (!providersToResolve.includes(undefined) && !providersToResolve.includes(provider.chatSessionType)) {
				continue; // skip: not considered for resolving
			}

			const providerSessions = await provider.provideChatSessionItems(token);
			resolvedProviders.add(provider.chatSessionType);

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
					providerType: provider.chatSessionType,
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

		for (const session of this._sessions) {
			if (!resolvedProviders.has(session.providerType)) {
				sessions.set(session.resource, session); // fill in existing sessions for providers that did not resolve
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

//#region Sessions Cache

interface ISerializedAgentSessionViewModel {

	readonly providerType: string;
	readonly providerLabel: string;

	readonly resource: UriComponents;

	readonly icon: string;

	readonly label: string;

	readonly description?: string | IMarkdownString;
	readonly tooltip?: string | IMarkdownString;

	readonly status: ChatSessionStatus;
	readonly archived: boolean;

	readonly timing: {
		readonly startTime: number;
		readonly endTime?: number;
	};

	readonly statistics?: {
		readonly files: number;
		readonly insertions: number;
		readonly deletions: number;
	};
}

class AgentSessionsCache {

	private static readonly STORAGE_KEY = 'agentSessions.cache';

	constructor(@IStorageService private readonly storageService: IStorageService) { }

	saveCachedSessions(sessions: IAgentSessionViewModel[]): void {
		const serialized: ISerializedAgentSessionViewModel[] = sessions
			.filter(session =>
				// Only consider providers that we own where we know that
				// we can also invalidate the data after startup
				// Other providers are bound to a different lifecycle (extensions)
				session.providerType === AgentSessionProviders.Local ||
				session.providerType === AgentSessionProviders.Background ||
				session.providerType === AgentSessionProviders.Cloud
			)
			.map(session => ({
				providerType: session.providerType,
				providerLabel: session.providerLabel,

				resource: session.resource.toJSON(),

				icon: session.icon.id,
				label: session.label,
				description: session.description,
				tooltip: session.tooltip,

				status: session.status,
				archived: session.archived,

				timing: {
					startTime: session.timing.startTime,
					endTime: session.timing.endTime,
				},

				statistics: session.statistics,
			}));
		this.storageService.store(AgentSessionsCache.STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	loadCachedSessions(): IAgentSessionViewModel[] {
		const sessionsCache = this.storageService.get(AgentSessionsCache.STORAGE_KEY, StorageScope.WORKSPACE);
		if (!sessionsCache) {
			return [];
		}

		try {
			const cached = JSON.parse(sessionsCache) as ISerializedAgentSessionViewModel[];
			return cached.map(session => ({
				providerType: session.providerType,
				providerLabel: session.providerLabel,

				resource: URI.revive(session.resource),

				icon: ThemeIcon.fromId(session.icon),
				label: session.label,
				description: session.description,
				tooltip: session.tooltip,

				status: session.status,
				archived: session.archived,

				timing: {
					startTime: session.timing.startTime,
					endTime: session.timing.endTime,
				},

				statistics: session.statistics,
			}));
		} catch {
			return []; // invalid data in storage, fallback to empty sessions list
		}
	}
}

//#endregion
