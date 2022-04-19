/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

function getCapabilityName(capability: TerminalCapability): string | undefined {
	switch (capability) {
		case TerminalCapability.CwdDetection:
		case TerminalCapability.NaiveCwdDetection:
			return localize('capability.cwdDetection', "Current working directory detection");
		case TerminalCapability.CommandDetection:
			return localize('capability.commandDetection', "Command detection");
		case TerminalCapability.PartialCommandDetection:
			return localize('capability.partialCommandDetection', "Command detection (partial)");
	}
}

export function getShellIntegrationTooltip(instance: ITerminalInstance, markdown?: boolean): string {
	let shellIntegrationString = '';
	const shellIntegrationCapabilities: TerminalCapability[] = [];
	if (instance.capabilities.has(TerminalCapability.CommandDetection)) {
		shellIntegrationCapabilities.push(TerminalCapability.CommandDetection);
	}
	if (instance.capabilities.has(TerminalCapability.CwdDetection)) {
		shellIntegrationCapabilities.push(TerminalCapability.CwdDetection);
	}
	if (shellIntegrationCapabilities.length > 0) {
		shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'} ${localize('shellIntegration.enabled', "Shell integration is enabled")}`;
		for (const capability of shellIntegrationCapabilities) {
			shellIntegrationString += `\n- ${getCapabilityName(capability)}`;
		}
	}
	return shellIntegrationString;
}
