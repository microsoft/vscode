/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatVariablesService, IDynamicVariable } from '../../common/chatVariables.js';
import { IToolAndToolSetEnablementMap } from '../../common/languageModelToolsService.js';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;

	private _dynamicVariables = new Map<string, readonly IDynamicVariable[]>();
	private _selectedToolAndToolSets = new Map<string, IToolAndToolSetEnablementMap>();

	getDynamicVariables(sessionId: string): readonly IDynamicVariable[] {
		return this._dynamicVariables.get(sessionId) ?? [];
	}

	getSelectedToolAndToolSets(sessionId: string): IToolAndToolSetEnablementMap {
		return this._selectedToolAndToolSets.get(sessionId) ?? new Map();
	}

	setDynamicVariables(sessionId: string, variables: readonly IDynamicVariable[]): void {
		this._dynamicVariables.set(sessionId, variables);
	}

	setSelectedToolAndToolSets(sessionId: string, tools: IToolAndToolSetEnablementMap): void {
		this._selectedToolAndToolSets.set(sessionId, tools);
	}
}
