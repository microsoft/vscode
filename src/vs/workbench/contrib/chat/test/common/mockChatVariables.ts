/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { IChatModel, IChatRequestVariableData, IChatRequestVariableEntry } from '../../common/chatModel.js';
import { IParsedChatRequest } from '../../common/chatParserTypes.js';
import { IChatVariableData, IChatVariableResolverProgress, IChatVariablesService, IDynamicVariable } from '../../common/chatVariables.js';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		throw new Error('Method not implemented.');
	}

	getDynamicVariables(sessionId: string): readonly IDynamicVariable[] {
		return [];
	}

	async resolveVariables(prompt: IParsedChatRequest, attachedContextVariables: IChatRequestVariableEntry[] | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData> {
		return {
			variables: []
		};
	}

	attachContext(name: string, value: unknown, location: ChatAgentLocation): void {
		throw new Error('Method not implemented.');
	}
}
