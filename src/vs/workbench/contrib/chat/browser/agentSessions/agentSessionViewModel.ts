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
			{ id: '1', title: 'Session 1' },
			{ id: '2', title: 'Session 2' },
			{ id: '3', title: 'Session 3' }
		];
	}
}
