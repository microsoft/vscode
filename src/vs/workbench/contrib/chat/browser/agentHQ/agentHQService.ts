/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentSessionViewModel } from '../agentSessions/agentSessionViewModel.js';

export const IAgentHQService = createDecorator<IAgentHQService>('agentHQService');

export interface IAgentHQService {
	readonly _serviceBrand: undefined;

	readonly mostRecentSession: IAgentSessionViewModel | undefined;
	readonly onDidChangeMostRecentSession: Event<IAgentSessionViewModel | undefined>;

	setMostRecentSession(session: IAgentSessionViewModel | undefined): void;
}

export class AgentHQService extends Disposable implements IAgentHQService {
	readonly _serviceBrand: undefined;

	private _mostRecentSession: IAgentSessionViewModel | undefined;
	private readonly _onDidChangeMostRecentSession = this._register(new Emitter<IAgentSessionViewModel | undefined>());
	readonly onDidChangeMostRecentSession: Event<IAgentSessionViewModel | undefined> = this._onDidChangeMostRecentSession.event;

	get mostRecentSession(): IAgentSessionViewModel | undefined {
		return this._mostRecentSession;
	}

	setMostRecentSession(session: IAgentSessionViewModel | undefined): void {
		this._mostRecentSession = session;
		this._onDidChangeMostRecentSession.fire(session);
	}
}
