/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { AgentHostFilterService } from '../../../../services/agentHostFilter/browser/agentHostFilterService.js';
import { IAgentHostFilterEntry } from '../../../../services/agentHostFilter/common/agentHostFilter.js';

export function isImplicitlyConnectedHost(entry: IAgentHostFilterEntry): boolean {
	return entry.grouped && !entry.connectable && entry.sessionCreationProviderId !== undefined;
}

function presentHost(host: IAgentHostFilterEntry): IAgentHostFilterEntry {
	return host.id === 'githubsandbox'
		? { ...host, label: localize('cloud', "Cloud"), description: host.label, icon: Codicon.cloud }
		: host;
}

/** The experimental client prefers Cloud and presents the provider name as its description. */
export class MobileAgentHostFilterService extends AgentHostFilterService {
	protected override automaticSelectionRank(entry: IAgentHostFilterEntry): number {
		return isImplicitlyConnectedHost(entry) ? -1 : super.automaticSelectionRank(entry);
	}

	override get hosts(): readonly IAgentHostFilterEntry[] {
		return super.hosts.map(presentHost);
	}

	override get selectedHost(): IAgentHostFilterEntry | undefined {
		const host = super.selectedHost;
		return host && presentHost(host);
	}
}
