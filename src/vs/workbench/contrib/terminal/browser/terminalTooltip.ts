/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';

export function getShellIntegrationTooltip(instance: ITerminalInstance, markdown: boolean, configurationService: IConfigurationService): string {
	if (!configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled) || instance.disableShellIntegrationReporting) {
		return '';
	}
	const shellIntegrationCapabilities: TerminalCapability[] = [];
	if (instance.capabilities.has(TerminalCapability.CommandDetection)) {
		shellIntegrationCapabilities.push(TerminalCapability.CommandDetection);
	}
	if (instance.capabilities.has(TerminalCapability.CwdDetection)) {
		shellIntegrationCapabilities.push(TerminalCapability.CwdDetection);
	}
	let shellIntegrationString = '';
	if (shellIntegrationCapabilities.length > 0) {
		shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'} ${localize('shellIntegration.enabled', "Shell integration activated")}`;
	} else {
		if (instance.shellLaunchConfig.ignoreShellIntegration) {
			shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'} ${localize('launchFailed.exitCodeOnlyShellIntegration', "The terminal process failed to launch. Disabling shell integration with terminal.integrated.shellIntegration.enabled might help.")}`;
		} else {
			shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'} ${localize('shellIntegration.activationFailed', "Shell integration failed to activate")}`;
		}
	}
	return shellIntegrationString;
}
