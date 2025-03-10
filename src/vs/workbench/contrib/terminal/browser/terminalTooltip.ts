/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ITerminalInstance } from './terminal.js';
import { asArray } from '../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import type { IHoverAction } from '../../../../base/browser/ui/hover/hover.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalStatus } from './terminalStatusList.js';
import Severity from '../../../../base/common/severity.js';

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
	const content = new MarkdownString(instance.title + shellProcessString + statusString, { supportThemeIcons: true });

	return { content, actions };
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

export function refreshShellIntegrationInfoStatus(instance: ITerminalInstance) {
	if (!instance.xterm) {
		return;
	}
	const cmdDetectionType = (
		instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection
			? localize('shellIntegration.rich', 'Rich')
			: instance.capabilities.has(TerminalCapability.CommandDetection)
				? localize('shellIntegration.basic', 'Basic')
				: instance.usedShellIntegrationInjection
					? localize('shellIntegration.injectionFailed', "Injection failed to activate")
					: localize('shellIntegration.no', 'No')
	);
	const seenSequences = Array.from(instance.xterm.shellIntegration.seenSequences);
	const seenSequencesString = (
		seenSequences.length > 0
			? ` (${seenSequences.map(e => `\`${e}\``).join(', ')})`
			: ''
	);
	instance.statusList.add({
		id: TerminalStatus.ShellIntegrationInfo,
		severity: Severity.Info,
		tooltip: `${localize('shellIntegration', "Shell integration")}: ${cmdDetectionType}${seenSequencesString}`
	});
}
