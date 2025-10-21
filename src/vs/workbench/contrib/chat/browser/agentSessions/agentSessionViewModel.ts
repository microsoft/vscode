/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatSessionItemProvider, IChatSessionsService } from '../../common/chatSessionsService.js';

//#region Interfaces, Types

export interface IAgentSessionsViewModel {

	readonly sessions: IAgentSessionViewModel[];

	resolve(): Promise<void>;
}

export const enum AgentSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2
}

export interface IAgentSessionViewModel {

	readonly provider: IChatSessionItemProvider;

	readonly id: string;
	readonly resource: URI;

	readonly status?: AgentSessionStatus;

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
	return session.provider.chatSessionType === 'local';
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

export class AgentSessionsViewModel extends Disposable implements IAgentSessionsViewModel {

	readonly sessions: IAgentSessionViewModel[] = [];

	private readonly resolver = this._register(new ThrottledDelayer<void>(100));

	constructor(@IChatSessionsService private readonly chatSessionsService: IChatSessionsService) {
		super();
	}

	async resolve(): Promise<void> {
		return this.resolver.trigger(token => this.doResolve(token));
	}

	private async doResolve(token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		const newSessions: IAgentSessionViewModel[] = [];
		for (const provider of this.chatSessionsService.getAllChatSessionItemProviders()) {
			const sessions = await provider.provideChatSessionItems(token);
			if (token.isCancellationRequested) {
				return;
			}

			for (const session of sessions) {
				newSessions.push({
					provider,
					id: session.id,
					resource: session.resource,
					label: session.label,
					description: session.description ?? '',
					icon: session.iconPath,
					status: session.status as AgentSessionStatus | undefined,
					timing: {
						startTime: session.timing?.startTime ?? Date.now(),
						endTime: session.timing?.endTime
					},
					statistics: session.statistics
				});
			}
		}

		this.sessions.length = 0;
		this.sessions.push(...newSessions);
	}
}
