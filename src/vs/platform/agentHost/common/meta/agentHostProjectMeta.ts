/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RootState } from '../state/sessionState.js';

/** Whether the host exposes the Copilot project-management extension. */
export function supportsAgentHostProjectManagement(state: RootState): boolean {
	const capability = state._meta?.['copilot.projectManagement'];
	return typeof capability === 'object' && capability !== null
		&& (capability as { available?: unknown }).available === true;
}
