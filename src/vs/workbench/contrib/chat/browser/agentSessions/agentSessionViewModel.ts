/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

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

	constructor(@IChatSessionsService chatSessionsService: IChatSessionsService) {
		super();
	}

	async resolve(): Promise<void> {
		this.sessions.length = 0;

		this.sessions.push(
			{ id: '1', resource: URI.from({ scheme: 'agentSession', path: '1' }), label: 'React Component Help', description: 'Assistance with building React components.', timing: { startTime: Date.now() - 1000 * 60 * 2 }, statistics: { insertions: 10, deletions: 2 } },
			{ id: '2', resource: URI.from({ scheme: 'agentSession', path: '2' }), label: 'TypeScript Types', description: 'Explain TypeScript generics.', timing: { startTime: Date.now() - 1000 * 60 * 60 }, statistics: { insertions: 5, deletions: 1 } },
			{ id: '3', resource: URI.from({ scheme: 'agentSession', path: '3' }), label: 'API Integration', description: 'How to fetch data in next.js?', timing: { startTime: Date.now() - 1000 * 60 * 60 * 24, endTime: Date.now() - 1000 * 60 * 60 * 12 }, statistics: { insertions: 8, deletions: 3 } },
			{ id: '4', resource: URI.from({ scheme: 'agentSession', path: '4' }), label: 'Database Schema', description: 'Help me design a database schema.', timing: { startTime: Date.now() - 1000 * 60 * 60 * 48, endTime: Date.now() - 1000 * 60 * 60 * 24 }, statistics: { insertions: 7, deletions: 2 } },
		);
	}
}
