/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { emptyAgentTerminalPath } from '../../common/agentTerminalPath.js';
import type { IAgentTerminalPathService } from '../../node/agentTerminalPathService.js';

/** For tests that do not exercise agent terminal PATH contributions. */
export const noAgentTerminalPathService: IAgentTerminalPathService = {
	_serviceBrand: undefined,
	onDidChange: Event.None,
	path: emptyAgentTerminalPath,
	setClientPath() { },
	removeClient() { },
};
