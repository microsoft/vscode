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
import { IChatModel } from './chatModel.js';
import { IChatContentReference, IChatProgressMessage } from './chatService.js';
import { IDiagnosticVariableEntryFilterData } from './chatVariableEntries.js';
import { IToolAndToolSetEnablementMap } from './languageModelToolsService.js';

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

export type IChatRequestVariableValue = string | URI | Location | Uint8Array | IChatRequestProblemsVariable | unknown;

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
	getSelectedToolAndToolSets(sessionId: string): IToolAndToolSetEnablementMap;
}

export interface IDynamicVariable {
	range: IRange;
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	modelDescription?: string;
	isFile?: boolean;
	isDirectory?: boolean;
	data: IChatRequestVariableValue;
}
