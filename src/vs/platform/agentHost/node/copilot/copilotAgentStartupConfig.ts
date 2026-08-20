/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/objects.js';
import type { IAgentHostManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import type { CopilotSdkLogLevelSetting } from '../../common/copilotCliConfig.js';

export class CopilotAgentStartupConfig {
	constructor(
		readonly sessionSync: boolean,
		readonly rubberDuck: boolean,
		readonly multiTurnContextRouting: boolean,
		readonly copilotSdkLogLevel: CopilotSdkLogLevelSetting,
		readonly enterpriseHost: string | undefined,
		readonly systemProxy: boolean,
		readonly githubMcpServer: boolean,
		readonly managedSettingsPermissions: IAgentHostManagedSettingsPermissions,
	) { }

	equals(other: CopilotAgentStartupConfig): boolean {
		return this.changedKeysFrom(other).length === 0;
	}

	proxyTargetChangedFrom(other: CopilotAgentStartupConfig): boolean {
		return this.enterpriseHost !== other.enterpriseHost || this.systemProxy !== other.systemProxy;
	}

	describeChangesFrom(other: CopilotAgentStartupConfig): string {
		const values = new Map(Object.entries(this));
		return this.changedKeysFrom(other)
			.map(key => key === 'managedSettingsPermissions' ? key : `${key}=${String(values.get(key))}`)
			.join(', ');
	}

	private changedKeysFrom(other: CopilotAgentStartupConfig): string[] {
		const otherEntries = new Map(Object.entries(other));
		return Object.entries(this)
			.filter(([key, value]) => key === 'managedSettingsPermissions'
				? !equals(value, otherEntries.get(key))
				: value !== otherEntries.get(key))
			.map(([key]) => key);
	}
}
