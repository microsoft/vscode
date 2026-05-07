/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionConfigState } from '../../platform/agentHost/common/state/protocol/state.js';

export function isSessionConfigComplete(config: SessionConfigState): boolean {
	return (config.schema.required ?? []).every(property => config.values[property] !== undefined);
}
