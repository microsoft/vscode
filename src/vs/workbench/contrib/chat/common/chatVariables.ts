/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation';
import { IDisposable } from '../../../../base/common/lifecycle';
import { ThemeIcon } from '../../../../base/common/themables';
import { URI } from '../../../../base/common/uri';
import { IRange } from '../../../../editor/common/core/range';
import { Location } from '../../../../editor/common/languages';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation';
import { ChatAgentLocation } from './chatAgents';
import { IChatModel, IChatRequestVariableData, IChatRequestVariableEntry } from './chatModel';
import { IParsedChatRequest } from './chatParserTypes';
import { IChatContentReference, IChatProgressMessage } from './chatService';

export interface IChatVariableData {
	id: string;
	name: string;
	icon?: ThemeIcon;
	fullName?: string;
	description: string;
	modelDescription?: string;
	isSlow?: boolean;
	canTakeArgument?: boolean;
}

export type IChatRequestVariableValue = string | URI | Location | unknown;

export type IChatVariableResolverProgress =
	| IChatContentReference
	| IChatProgressMessage;

export interface IChatVariableResolver {
	(messageText: string, arg: string | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue | undefined>;
}

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable;
	hasVariable(name: string): boolean;
	getVariable(name: string): IChatVariableData | undefined;
	getVariables(location: ChatAgentLocation): Iterable<Readonly<IChatVariableData>>;
	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable>; // should be its own service?
	attachContext(name: string, value: string | URI | Location | unknown, location: ChatAgentLocation): void;

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, attachedContextVariables: IChatRequestVariableEntry[] | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData>;
	resolveVariable(variableName: string, promptText: string, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue | undefined>;
}

export interface IDynamicVariable {
	range: IRange;
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	prefix?: string;
	modelDescription?: string;
	data: IChatRequestVariableValue;
}
