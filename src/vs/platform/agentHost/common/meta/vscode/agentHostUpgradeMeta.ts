/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vObj, vString } from '../../../../../base/common/validation.js';
import type { InitializeResult } from '../../state/protocol/common/commands.js';

/**
 * `initialize` result `_meta` key naming the method a connected client MAY
 * invoke to ask the hosting CLI to update the server. Hosts without a managing
 * CLI omit it, as do relay connections, which can't make this request.
 */
export const AgentHostUpgradeMethodCapabilityMetaKey = 'vscode.upgradeMethod';

/**
 * `initialize` result `_meta` key describing the VS Code build a host runs, as an
 * {@link IAgentHostBuild}. Advertised with {@link AgentHostUpgradeMethodCapabilityMetaKey}
 * so a client can tell whether updating would install a newer build.
 */
export const AgentHostBuildMetaKey = 'vscode.build';

/** A VS Code build, as advertised under {@link AgentHostBuildMetaKey}. */
export interface IAgentHostBuild {
	/** The commit the build was made from. */
	readonly commit: string;
	/** The release quality, for example `stable` or `insider`. */
	readonly quality: string;
	/** When the build was made, as an ISO 8601 date. */
	readonly date: string;
}

const agentHostBuildValidator = vObj({ commit: vString(), quality: vString(), date: vString() });

/** Reads the upgrade method a connected host advertised, or `undefined` when absent or malformed. */
export function readAgentHostUpgradeMethod(result: InitializeResult | undefined): string | undefined {
	const method = result?._meta?.[AgentHostUpgradeMethodCapabilityMetaKey];
	return typeof method === 'string' && method.length > 0 ? method : undefined;
}

/** Reads the build a connected host advertised, or `undefined` when absent or malformed. */
export function readAgentHostBuild(result: InitializeResult | undefined): IAgentHostBuild | undefined {
	const { content, error } = agentHostBuildValidator.validate(result?._meta?.[AgentHostBuildMetaKey]);
	return !error && content.commit && content.quality && !isNaN(Date.parse(content.date))
		? { commit: content.commit, quality: content.quality, date: content.date }
		: undefined;
}

/**
 * Whether a host runs an older build of the client's quality, so updating it installs at
 * least the client's build. Builds of another quality are never compared, because updating
 * installs the latest build of the host's own quality. Clients without build information,
 * such as development builds, report no update.
 */
export function isNewerAgentHostBuildAvailable(host: IAgentHostBuild | undefined, client: Partial<IAgentHostBuild>): boolean {
	if (!host || !client.commit || !client.date || host.quality !== client.quality || host.commit === client.commit) {
		return false;
	}
	return Date.parse(host.date) < Date.parse(client.date);
}
