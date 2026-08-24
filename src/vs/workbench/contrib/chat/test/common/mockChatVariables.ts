/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatVariablesService, IDynamicVariable } from '../../common/attachments/chatVariables.js';
import { ToolAndToolSetEnablementMap } from '../../common/tools/languageModelToolsService.js';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;

	private _dynamicVariables = new ResourceMap<readonly IDynamicVariable[]>();
	private _selectedToolAndToolSets = new ResourceMap<ToolAndToolSetEnablementMap>();

	getDynamicVariables(sessionResource: URI): readonly IDynamicVariable[] {
		return this._dynamicVariables.get(sessionResource) ?? [];
	}

	getSelectedToolAndToolSets(sessionResource: URI): ToolAndToolSetEnablementMap {
		return this._selectedToolAndToolSets.get(sessionResource) ?? ToolAndToolSetEnablementMap.fromEntries([]);
	}

	setDynamicVariables(sessionResource: URI, variables: readonly IDynamicVariable[]): void {
		this._dynamicVariables.set(sessionResource, variables);
	}

	setSelectedToolAndToolSets(sessionResource: URI, tools: ToolAndToolSetEnablementMap): void {
		this._selectedToolAndToolSets.set(sessionResource, tools);
	}
}
