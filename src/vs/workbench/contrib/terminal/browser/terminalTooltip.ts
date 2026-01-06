/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IHoverAction } from '../../../../base/browser/ui/hover/hover.js';
import { asArray } from '../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
import { StorageScope, StorageTarget, type IStorageService } from '../../../../platform/storage/common/storage.js';
import type { ITerminalStatusHoverAction } from '../common/terminal.js';
import { TerminalStorageKeys } from '../common/terminalStorageKeys.js';
import { ITerminalInstance } from './terminal.js';

export function getInstanceHoverInfo(instance: ITerminalInstance, storageService: IStorageService): { content: MarkdownString; actions: IHoverAction[] } {
	const showDetailed = parseInt(storageService.get(TerminalStorageKeys.TabsShowDetailed, StorageScope.APPLICATION) ?? '0');
	let statusString = '';
	const statuses = instance.statusList.statuses;
	const actions: ITerminalStatusHoverAction[] = [];
	for (const status of statuses) {
		if (showDetailed) {
			if (status.detailedTooltip ?? status.tooltip) {
				statusString += `\n\n---\n\n${status.icon ? `$(${status.icon?.id}) ` : ''}` + (status.detailedTooltip ?? status.tooltip ?? '');
			}
		} else {
			if (status.tooltip) {
				statusString += `\n\n---\n\n${status.icon ? `$(${status.icon?.id}) ` : ''}` + (status.tooltip ?? '');
			}
		}
		if (status.hoverActions) {
			actions.push(...status.hoverActions);
		}
	}
	actions.push({
		commandId: 'toggleDetailedInfo',
		label: showDetailed ? localize('hideDetails', 'Hide Details') : localize('showDetails', 'Show Details'),
		run() {
			storageService.store(TerminalStorageKeys.TabsShowDetailed, (showDetailed + 1) % 2, StorageScope.APPLICATION, StorageTarget.USER);
		},
	});

	const shellProcessString = getShellProcessTooltip(instance, !!showDetailed);
	const content = new MarkdownString(instance.title + shellProcessString + statusString, { supportThemeIcons: true });

	return { content, actions };
}

export function getShellProcessTooltip(instance: ITerminalInstance, showDetailed: boolean): string {
	const lines: string[] = [];

	if (instance.processId && instance.processId > 0) {
		lines.push(localize({ key: 'shellProcessTooltip.processId', comment: ['The first arg is "PID" which shouldn\'t be translated'] }, "Process ID ({0}): {1}", 'PID', instance.processId) + '\n');
	}

	if (instance.shellLaunchConfig.executable) {
		let commandLine = '';
		if (!showDetailed && instance.shellLaunchConfig.executable.length > 32) {
			const base = basename(instance.shellLaunchConfig.executable);
			const sepIndex = instance.shellLaunchConfig.executable.length - base.length - 1;
			const sep = instance.shellLaunchConfig.executable.substring(sepIndex, sepIndex + 1);
			commandLine += `…${sep}${base}`;
		} else {
			commandLine += instance.shellLaunchConfig.executable;
		}
		const args = asArray(instance.injectedArgs || instance.shellLaunchConfig.args || []).map(x => x.match(/\s/) ? `'${x}'` : x).join(' ');
		if (args) {
			commandLine += ` ${args}`;
		}

		lines.push(localize('shellProcessTooltip.commandLine', 'Command line: {0}', commandLine));
	}

	return lines.length ? `\n\n---\n\n${lines.join('\n')}` : '';
}

