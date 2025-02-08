/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatAgentLocation } from '../../common/chatAgents.js';
import { IChatRequestVariableData, IChatRequestVariableEntry } from '../../common/chatModel.js';
import { IParsedChatRequest } from '../../common/chatParserTypes.js';
import { IChatVariablesService, IDynamicVariable } from '../../common/chatVariables.js';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;

	getDynamicVariables(sessionId: string): readonly IDynamicVariable[] {
		return [];
	}

	resolveVariables(prompt: IParsedChatRequest, attachedContextVariables: IChatRequestVariableEntry[] | undefined): IChatRequestVariableData {
		return {
			variables: []
		};
	}

	attachContext(name: string, value: unknown, location: ChatAgentLocation): void {
		throw new Error('Method not implemented.');
	}
}
