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
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ChatSessionStatus, IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { AgentSessionProviders } from './agentSessions.js';

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

	readonly status?: ChatSessionStatus;
	readonly tooltip?: string | IMarkdownString;

	readonly label: string;
	readonly description: string | IMarkdownString;
	readonly icon: ThemeIcon;

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
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
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

				let description;
				if (session.description) {
					description = session.description;
				} else {
					switch (session.status) {
						case ChatSessionStatus.InProgress:
							description = localize('chat.session.status.inProgress', "Working...");
							break;
						case ChatSessionStatus.Failed:
							description = localize('chat.session.status.error', "Failed");
							break;
						default:
							description = localize('chat.session.status.completed', "Finished");
							break;
					}
				}

				let icon: ThemeIcon;
				let providerLabel: string;
				switch ((provider.chatSessionType)) {
					case localChatSessionType:
						providerLabel = localize('chat.session.providerLabel.local', "Local");
						icon = Codicon.window;
						break;
					case AgentSessionProviders.Background:
						providerLabel = localize('chat.session.providerLabel.background', "Background");
						icon = Codicon.serverProcess;
						break;
					case AgentSessionProviders.Cloud:
						providerLabel = localize('chat.session.providerLabel.cloud', "Cloud");
						icon = Codicon.cloud;
						break;
					default: {
						providerLabel = mapSessionContributionToType.get(provider.chatSessionType)?.name ?? provider.chatSessionType;
						icon = session.iconPath ?? Codicon.terminal;
					}
				}

				newSessions.push({
					provider,
					providerLabel,
					resource: session.resource,
					label: session.label,
					description,
					icon,
					tooltip: session.tooltip,
					status: session.status,
					timing: {
						startTime: session.timing.startTime,
						endTime: session.timing.endTime
					},
					statistics: session.statistics
				});
			}
		}

		this.sessions.length = 0;
		this.sessions.push(...newSessions);

		this._onDidChangeSessions.fire();
	}
}
