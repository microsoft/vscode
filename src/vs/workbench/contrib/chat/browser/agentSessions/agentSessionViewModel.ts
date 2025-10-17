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

	readonly timestamp: number;

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
			{ id: '1', title: 'React Component Help', description: 'Assistance with building React components.', timestamp: Date.now() - 1000 * 60 * 2, diff: { added: 45, removed: 12 } },
			{ id: '2', title: 'TypeScript Types', description: 'Explain TypeScript generics.', timestamp: Date.now() - 1000 * 60 * 60, diff: { added: 128, removed: 34 } },
			{ id: '3', title: 'API Integration', description: 'How to fetch data in next.js?', timestamp: Date.now() - 1000 * 60 * 60 * 24, diff: { added: 67, removed: 8 } },
			{ id: '4', title: 'Database Schema', description: 'Help me design a database schema.', timestamp: Date.now() - 1000 * 60 * 60 * 48, diff: { added: 203, removed: 56 } },
		];
	}
}
