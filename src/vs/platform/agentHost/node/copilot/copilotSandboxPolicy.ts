/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot-sdk';
import type { ILogService } from '../../../log/common/log.js';
import type { ISessionSandboxPolicy } from '../sessionSandbox.js';

/** Projects only resolved boolean sandbox fields; composition and validation remain runtime-owned. */
export function projectCopilotSandboxPolicy(data: Extract<SessionEvent, { type: 'session.managed_settings_resolved' }>['data'], sessionId: string, logService: ILogService): ISessionSandboxPolicy {
	const settings = data.settings;
	const sandboxValue = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.sandbox : undefined;
	const sandbox = sandboxValue && typeof sandboxValue === 'object' && !Array.isArray(sandboxValue) ? sandboxValue : undefined;
	const userPolicyValue = sandbox?.userPolicy;
	const userPolicy = userPolicyValue && typeof userPolicyValue === 'object' && !Array.isArray(userPolicyValue) ? userPolicyValue : undefined;
	const networkValue = userPolicy?.network;
	const network = networkValue && typeof networkValue === 'object' && !Array.isArray(networkValue) ? networkValue : undefined;
	const failClosed = data.failClosed || data.sandboxEnabledByUndeterminedPolicy === true;
	const sandboxFailClosed = data.sandboxEnabledByUndeterminedPolicy ?? (data.failClosed && sandbox?.enabled !== true);
	if (failClosed) {
		logService.warn(`[Copilot:${sessionId}] Sandbox policy fail-closed: source=${data.source}, failClosed=${data.failClosed}, sandboxEnabledByUndeterminedPolicy=${data.sandboxEnabledByUndeterminedPolicy === true}; forcing enabled=true, allowBypass=false`);
	}
	return {
		enabled: failClosed || sandbox?.enabled === true,
		allowBypass: failClosed ? false : typeof sandbox?.allowBypass === 'boolean' ? sandbox.allowBypass : undefined,
		...(typeof network?.allowOutbound === 'boolean' ? { allowOutbound: network.allowOutbound } : {}),
		...(sandboxFailClosed ? { failClosed: true } : {}),
	};
}
