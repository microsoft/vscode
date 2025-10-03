/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatVariablesService, IDynamicVariable } from '../../common/chatVariables.js';
import { IToolAndToolSetEnablementMap } from '../../common/languageModelToolsService.js';

export class MockChatVariablesService implements IChatVariablesService {
	_serviceBrand: undefined;

	getDynamicVariables(sessionId: string): readonly IDynamicVariable[] {
		return [];
	}

	getSelectedToolAndToolSets(sessionId: string): IToolAndToolSetEnablementMap {
		return new Map();
	}

}
