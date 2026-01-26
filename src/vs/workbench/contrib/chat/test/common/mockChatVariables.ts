/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatVariablesService, IDynamicVariable } from '../../common/attachments/chatVariables.js';
import { IToolAndToolSetEnablementMap } from '../../common/tools/languageModelToolsService.js';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;

	private _dynamicVariables = new ResourceMap<readonly IDynamicVariable[]>();
	private _selectedToolAndToolSets = new ResourceMap<IToolAndToolSetEnablementMap>();

	getDynamicVariables(sessionResource: URI): readonly IDynamicVariable[] {
		return this._dynamicVariables.get(sessionResource) ?? [];
	}

	getSelectedToolAndToolSets(sessionResource: URI): IToolAndToolSetEnablementMap {
		return this._selectedToolAndToolSets.get(sessionResource) ?? new Map();
	}

	setDynamicVariables(sessionResource: URI, variables: readonly IDynamicVariable[]): void {
		this._dynamicVariables.set(sessionResource, variables);
	}

	setSelectedToolAndToolSets(sessionResource: URI, tools: IToolAndToolSetEnablementMap): void {
		this._selectedToolAndToolSets.set(sessionResource, tools);
	}
}
