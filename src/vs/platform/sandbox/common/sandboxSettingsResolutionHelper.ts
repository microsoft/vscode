/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSandboxEnabledValue } from './settings.js';

/** Resolves user-editable sandbox toggles against the managed floor without changing saved preferences. */
export class SandboxSettingsResolutionHelper {
	static resolveEnabled(local: AgentSandboxEnabledValue | undefined, managed: boolean | undefined): AgentSandboxEnabledValue | undefined {
		return managed === true ? AgentSandboxEnabledValue.On : local;
	}

	static resolveSandboxServers(local: boolean | undefined, managed: boolean | undefined): boolean | undefined {
		return managed === true ? true : local;
	}

	static resolveAllowBypass(local: boolean | undefined, managed: boolean | undefined, managedEnabled: boolean | undefined): boolean | undefined {
		return managed === false || (managedEnabled === true && managed !== true) ? false : local;
	}

	static resolveAllowAccess(local: boolean | undefined, managed: boolean | undefined): boolean | undefined {
		return managed === false ? false : local;
	}
}
