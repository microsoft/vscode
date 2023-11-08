/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatVariableData, IChatVariableResolveResult, IChatVariableResolver, IChatVariablesService, IDynamicReference } from 'vs/workbench/contrib/chat/common/chatVariables';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable {
		throw new Error('Method not implemented.');
	}

	hasVariable(name: string): boolean {
		throw new Error('Method not implemented.');
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		throw new Error('Method not implemented.');
	}

	getDynamicReferences(sessionId: string): readonly IDynamicReference[] {
		return [];
	}

	async resolveVariables(prompt: IParsedChatRequest, model: IChatModel, token: CancellationToken): Promise<IChatVariableResolveResult> {
		return {
			prompt: prompt.text,
			variables: {}
		};
	}
}
