/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { Location } from '../../../../../editor/common/languages.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDiagnosticVariableEntryFilterData, StringChatContextValue, type IChatRequestVariableEntry } from './chatVariableEntries.js';
import { ToolAndToolSetEnablementMap } from '../tools/languageModelToolsService.js';

export interface IChatRequestProblemsVariable {
	id: 'vscode.problems';
	filter: IDiagnosticVariableEntryFilterData;
}

export type IChatRequestVariableValue = string | URI | Location | Uint8Array | IChatRequestProblemsVariable | StringChatContextValue | unknown;

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	getDynamicVariables(sessionResource: URI): ReadonlyArray<IDynamicVariable>;
	getSelectedToolAndToolSets(sessionResource: URI): ToolAndToolSetEnablementMap;
}

export interface IDynamicVariable {
	range: IRange;
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	modelDescription?: string;
	promptText?: string;
	isFile?: boolean;
	isDirectory?: boolean;
	isAttachmentReference?: boolean;
	data: IChatRequestVariableValue;
	/**
	 * Implementation-defined metadata that flows through to the resulting
	 * {@link IChatRequestVariableEntry} and any {@link MessageAttachment}
	 * derived from it. Used to round-trip provider-specific data attached
	 * to chat input completions.
	 */
	_meta?: Record<string, unknown>;
}

export function toAttachedContextDynamicVariable(entry: IChatRequestVariableEntry, range: IRange): IDynamicVariable {
	return {
		id: entry.id,
		fullName: entry.name,
		icon: entry.icon,
		modelDescription: entry.modelDescription,
		isFile: entry.kind === 'file',
		isDirectory: entry.kind === 'directory',
		isAttachmentReference: true,
		range,
		data: undefined,
	};
}
