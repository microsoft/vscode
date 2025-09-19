/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IDebugService } from '../../debug/common/debug.js';
import { McpDevModeDebugging } from '../common/mcpDevMode.js';

export class McpDevModeDebuggingNode extends McpDevModeDebugging {
	constructor(
		@IDebugService debugService: IDebugService,
		@ICommandService commandService: ICommandService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
	) {
		super(debugService, commandService);
	}

	protected override async ensureListeningOnPort(port: number): Promise<void> {
		const deadline = Date.now() + 30_000;
		while (await this._nativeHostService.isPortFree(port) && Date.now() < deadline) {
			await timeout(50);
		}
	}

	protected override getDebugPort() {
		return this._nativeHostService.findFreePort(5000, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */, 2048 /* skip 2048 ports between attempts */);
	}
}
