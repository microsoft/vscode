/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentHostFilterService } from '../../../../../workbench/contrib/sessions/browser/agentHostFilterService.js';
import { IAgentHostFilterEntry } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';

export function isImplicitlyConnectedHost(entry: IAgentHostFilterEntry): boolean {
	return entry.grouped && !entry.connectable && entry.sessionCreationProviderId !== undefined;
}

/** The phone prefers places that don't need an explicit connection. */
export class MobileAgentHostFilterService extends AgentHostFilterService {
	protected override automaticSelectionRank(entry: IAgentHostFilterEntry): number {
		return isImplicitlyConnectedHost(entry) ? -1 : super.automaticSelectionRank(entry);
	}
}
