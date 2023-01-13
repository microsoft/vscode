/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { escapeMarkdownSyntaxTokens } from 'vs/base/common/htmlContent';
import { asArray } from 'vs/base/common/arrays';

export function getShellIntegrationTooltip(instance: ITerminalInstance, markdown: boolean): string {
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
			if (instance.usedShellIntegrationInjection) {
				shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'} ${localize('shellIntegration.activationFailed', "Shell integration failed to activate")}`;
			}
		}
	}
	return shellIntegrationString;
}

export function getShellProcessTooltip(instance: ITerminalInstance, markdown: boolean): string {
	const lines: string[] = [];

	if (instance.processId) {
		lines.push(localize({ key: 'shellProcessTooltip.processId', comment: ['Do not translate "PID" as it is a pre-defined shell variable'] }, "Process ID (PID): {0}", instance.processId));
	}

	if (instance.shellLaunchConfig.executable) {
		lines.push(markdown
			? localize('shellProcessTooltip.executableAsMarkdown', "Executable: `{0}`", escapeMarkdownSyntaxTokens(instance.shellLaunchConfig.executable))
			: localize('shellProcessTooltip.executable', "Executable: {0}", instance.shellLaunchConfig.executable)
		);

		const args = asArray(instance.shellLaunchConfig.args || []).map(x => `'${x}'`).join(' ');
		if (args) {
			lines.push(localize('shellProcessTooltip.args', "Args: {0}", markdown ? escapeMarkdownSyntaxTokens(args) : args));
		}
	}

	return lines.length ? `${markdown ? '\n\n---\n\n' : '\n\n'}${lines.join(markdown ? '\n\n' : '\n')}` : '';
}
