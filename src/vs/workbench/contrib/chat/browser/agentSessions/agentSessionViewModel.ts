/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

//#region Interfaces, Types

export interface IAgentSessionsViewModel {
	readonly sessions: IAgentSessionViewModel[];
}

export interface IAgentSessionViewModel {
	readonly id: string;

	readonly title: string;
	readonly description: string;

	readonly timing: {
		readonly start: number;
		readonly end: number;
	};

	readonly diff?: {
		readonly added: number;
		readonly removed: number;
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

	readonly sessions: IAgentSessionViewModel[];

	constructor(@IChatSessionsService chatSessionsService: IChatSessionsService) {
		super();

		this.sessions = [
			{ id: '1', title: 'React Component Help', description: 'Assistance with building React components.', timing: { start: Date.now() - 1000 * 60 * 2, end: Date.now() - 1000 * 60 * 1 } },
			{ id: '2', title: 'TypeScript Types', description: 'Explain TypeScript generics.', timing: { start: Date.now() - 1000 * 60 * 60, end: Date.now() - 1000 * 60 * 30 } },
			{ id: '3', title: 'API Integration', description: 'How to fetch data in next.js?', timing: { start: Date.now() - 1000 * 60 * 60 * 24, end: Date.now() - 1000 * 60 * 60 * 12 } },
			{ id: '4', title: 'Database Schema', description: 'Help me design a database schema.', timing: { start: Date.now() - 1000 * 60 * 60 * 48, end: Date.now() - 1000 * 60 * 60 * 24 } },
		];
	}
}
