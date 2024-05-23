/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { asArray } from 'vs/base/common/arrays';
import { MarkdownString } from 'vs/base/common/htmlContent';
import type { IHoverAction } from 'vs/base/browser/ui/hover/hover';

export function getInstanceHoverInfo(instance: ITerminalInstance): { content: MarkdownString; actions: IHoverAction[] } {
	let statusString = '';
	const statuses = instance.statusList.statuses;
	const actions = [];
	for (const status of statuses) {
		statusString += `\n\n---\n\n${status.icon ? `$(${status.icon?.id}) ` : ''}${status.tooltip || status.id}`;
		if (status.hoverActions) {
			actions.push(...status.hoverActions);
		}
	}

	const shellProcessString = getShellProcessTooltip(instance, true);
	const shellIntegrationString = getShellIntegrationTooltip(instance, true);
	const content = new MarkdownString(instance.title + shellProcessString + shellIntegrationString + statusString, { supportThemeIcons: true });

	return { content, actions };
}

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
		shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'}${localize('shellIntegration.enabled', "Shell integration activated")}`;
	} else {
		if (instance.shellLaunchConfig.ignoreShellIntegration) {
			shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'}${localize('launchFailed.exitCodeOnlyShellIntegration', "The terminal process failed to launch. Disabling shell integration with terminal.integrated.shellIntegration.enabled might help.")}`;
		} else {
			if (instance.usedShellIntegrationInjection) {
				shellIntegrationString += `${markdown ? '\n\n---\n\n' : '\n\n'}${localize('shellIntegration.activationFailed', "Shell integration failed to activate")}`;
			}
		}
	}
	return shellIntegrationString;
}

export function getShellProcessTooltip(instance: ITerminalInstance, markdown: boolean): string {
	const lines: string[] = [];

	if (instance.processId && instance.processId > 0) {
		lines.push(localize({ key: 'shellProcessTooltip.processId', comment: ['The first arg is "PID" which shouldn\'t be translated'] }, "Process ID ({0}): {1}", 'PID', instance.processId) + '\n');
	}

	if (instance.shellLaunchConfig.executable) {
		let commandLine = instance.shellLaunchConfig.executable;
		const args = asArray(instance.injectedArgs || instance.shellLaunchConfig.args || []).map(x => `'${x}'`).join(' ');
		if (args) {
			commandLine += ` ${args}`;
		}

		lines.push(localize('shellProcessTooltip.commandLine', 'Command line: {0}', commandLine));
	}

	return lines.length ? `${markdown ? '\n\n---\n\n' : '\n\n'}${lines.join('\n')}` : '';
}
