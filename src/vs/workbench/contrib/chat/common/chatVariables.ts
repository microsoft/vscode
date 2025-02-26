/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Location } from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatAgentLocation } from './chatAgents.js';
import { IChatModel, IChatRequestVariableData, IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData } from './chatModel.js';
import { IParsedChatRequest } from './chatParserTypes.js';
import { IChatContentReference, IChatProgressMessage } from './chatService.js';

export interface IChatVariableData {
	id: string;
	name: string;
	icon?: ThemeIcon;
	fullName?: string;
	description: string;
	modelDescription?: string;
	canTakeArgument?: boolean;
}

export interface IChatRequestProblemsVariable {
	id: 'vscode.problems';
	filter: IDiagnosticVariableEntryFilterData;
}

export const isIChatRequestProblemsVariable = (obj: unknown): obj is IChatRequestProblemsVariable =>
	typeof obj === 'object' && obj !== null && 'id' in obj && (obj as IChatRequestProblemsVariable).id === 'vscode.problems';

export type IChatRequestVariableValue = string | URI | Location | unknown | Uint8Array | IChatRequestProblemsVariable;

export type IChatVariableResolverProgress =
	| IChatContentReference
	| IChatProgressMessage;

export interface IChatVariableResolver {
	(messageText: string, arg: string | undefined, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue | undefined>;
}

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable>;
	attachContext(name: string, value: string | URI | Location | unknown, location: ChatAgentLocation): void;

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, attachedContextVariables: IChatRequestVariableEntry[] | undefined): IChatRequestVariableData;
}

export interface IDynamicVariable {
	range: IRange;
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	prefix?: string;
	modelDescription?: string;
	isFile?: boolean;
	isDirectory?: boolean;
	data: IChatRequestVariableValue;
}
