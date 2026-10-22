/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { COMPUTER_USE_STATUS_KEY, type IComputerUseStatusV1 } from '../computerUse.js';
import type { RootState } from '../state/protocol/state.js';
import { readComputerUseStatus } from './vscode/computerUse.js';

export { readComputerUseSetupCard, readComputerUseStatus, withComputerUseSetupCard, type IComputerUseSetupCard } from './vscode/computerUse.js';

/** Reads the Computer Use setup status a host published as `vscode.computerUse.status`; `undefined` (keep the ordinary elicitation UI) for hosts that don't implement it. */
export function readComputerUseStatusFromRootState(state: RootState | Error | undefined): IComputerUseStatusV1 | undefined {
	if (!state || state instanceof Error) {
		return undefined;
	}
	return readComputerUseStatus(state.config?.values[COMPUTER_USE_STATUS_KEY]);
}
