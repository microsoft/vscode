/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IChatModel, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatRequestVariableValue, IChatVariableData, IChatVariableResolver, IChatVariableResolverProgress, IChatVariablesService, IDynamicVariable } from 'vs/workbench/contrib/chat/common/chatVariables';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable {
		throw new Error('Method not implemented.');
	}

	getVariable(name: string): IChatVariableData | undefined {
		throw new Error('Method not implemented.');
	}

	hasVariable(name: string): boolean {
		throw new Error('Method not implemented.');
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		throw new Error('Method not implemented.');
	}

	getDynamicVariables(sessionId: string): readonly IDynamicVariable[] {
		return [];
	}

	async resolveVariables(prompt: IParsedChatRequest, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData> {
		return {
			variables: []
		};
	}

	resolveVariable(variableName: string, promptText: string, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue[]> {
		throw new Error('Method not implemented.');
	}
}
