/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

export interface ISessionsDraft {
	readonly inputText: string;
	readonly attachments: readonly IChatRequestVariableEntry[];
}

export const IAgentSessionsDraftService = createDecorator<IAgentSessionsDraftService>('agentSessionsDraftService');

export interface IAgentSessionsDraftService {
	readonly _serviceBrand: undefined;

	getDraft(sessionId: string): ISessionsDraft | undefined;
	setDraft(sessionId: string, draft: ISessionsDraft | undefined): void;
	clearDraft(sessionId: string): void;
}

export class AgentSessionsDraftService implements IAgentSessionsDraftService {
	declare readonly _serviceBrand: undefined;

	private readonly _drafts = new Map<string, ISessionsDraft>();

	getDraft(sessionId: string): ISessionsDraft | undefined {
		return this._drafts.get(sessionId);
	}

	setDraft(sessionId: string, draft: ISessionsDraft | undefined): void {
		if (draft) {
			this._drafts.set(sessionId, draft);
		} else {
			this._drafts.delete(sessionId);
		}
	}

	clearDraft(sessionId: string): void {
		this._drafts.delete(sessionId);
	}
}

registerSingleton(IAgentSessionsDraftService, AgentSessionsDraftService, InstantiationType.Delayed);
