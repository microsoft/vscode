/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { raceTimeout } from '../../../../base/common/async.js';

export const AGENT_HOST_COPILOT_CLIENT_NAME = 'vscode-agent-host';

/** Resolves policy through the runtime without independently composing or validating model options. */
export async function resolveCopilotManagedSettings(
	managedSettings: Pick<CopilotClient['rpc']['managedSettings'], 'resolve'>,
	token: string | undefined,
	timeoutMs: number,
	workingDirectory?: string,
): Promise<Awaited<ReturnType<CopilotClient['rpc']['managedSettings']['resolve']>>> {
	const result = await raceTimeout(managedSettings.resolve({
		clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
		...(token ? { gitHubToken: token } : {}),
		...(workingDirectory ? { workingDirectory } : {}),
	}), timeoutMs);
	if (!result) {
		throw new Error(`Copilot runtime managed-settings query exceeded ${timeoutMs / 1000} seconds while waiting for native MDM or GitHub policy resolution.`);
	}
	return result;
}
