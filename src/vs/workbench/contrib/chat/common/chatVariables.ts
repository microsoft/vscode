/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatModel, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatContentReference, IChatProgressMessage } from 'vs/workbench/contrib/chat/common/chatService';

export interface IChatVariableData {
	name: string;
	description: string;
	hidden?: boolean;
	canTakeArgument?: boolean;
}

export interface IChatRequestVariableValue {
	level: 'short' | 'medium' | 'full';
	kind?: string;
	value: string | URI;
	description?: string;
}

export type IChatVariableResolverProgress =
	| IChatContentReference
	| IChatProgressMessage;

export interface IChatVariableResolver {
	// TODO should we spec "zoom level"
	(messageText: string, arg: string | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue[] | undefined>;
}

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable;
	hasVariable(name: string): boolean;
	getVariable(name: string): IChatVariableData | undefined;
	getVariables(): Iterable<Readonly<IChatVariableData>>;
	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable>; // should be its own service?

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData>;
	resolveVariable(variableName: string, promptText: string, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue[]>;
}

export interface IDynamicVariable {
	range: IRange;
	data: IChatRequestVariableValue[];
}
