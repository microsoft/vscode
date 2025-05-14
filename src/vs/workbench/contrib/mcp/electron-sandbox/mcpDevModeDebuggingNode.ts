/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IDebugService } from '../../debug/common/debug.js';
import { McpDevModeDebugging } from '../common/mcpDevMode.js';

export class McpDevModeDebuggingNode extends McpDevModeDebugging {
	constructor(
		@IDebugService debugService: IDebugService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
	) {
		super(debugService);
	}

	protected override getDebugPort() {
		return this._nativeHostService.findFreePort(5000, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */, 2048 /* skip 2048 ports between attempts */);
	}
}
