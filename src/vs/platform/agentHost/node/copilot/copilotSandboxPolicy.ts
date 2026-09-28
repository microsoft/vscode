/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot-sdk';
import type { ISessionSandboxPolicy } from '../sessionSandbox.js';

/** Projects only resolved boolean sandbox fields; composition and validation remain runtime-owned. */
export function projectCopilotSandboxPolicy(data: Extract<SessionEvent, { type: 'session.managed_settings_resolved' }>['data']): ISessionSandboxPolicy {
	const settings = data.settings;
	const sandboxValue = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.sandbox : undefined;
	const sandbox = sandboxValue && typeof sandboxValue === 'object' && !Array.isArray(sandboxValue) ? sandboxValue : undefined;
	const failClosed = data.failClosed || data.sandboxEnabledByUndeterminedPolicy === true;
	return {
		enabled: failClosed || sandbox?.enabled === true,
		allowBypass: failClosed ? false : typeof sandbox?.allowBypass === 'boolean' ? sandbox.allowBypass : undefined,
	};
}
