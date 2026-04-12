/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asArray } from '../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
export function getInstanceHoverInfo(instance, storageService) {
    const showDetailed = parseInt(storageService.get("terminal.integrated.tabs.showDetailed" /* TerminalStorageKeys.TabsShowDetailed */, -1 /* StorageScope.APPLICATION */) ?? '0');
    let statusString = '';
    const statuses = instance.statusList.statuses;
    const actions = [];
    for (const status of statuses) {
        if (showDetailed) {
            if (status.detailedTooltip ?? status.tooltip) {
                statusString += `\n\n---\n\n${status.icon ? `$(${status.icon?.id}) ` : ''}` + (status.detailedTooltip ?? status.tooltip ?? '');
            }
        }
        else {
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
            storageService.store("terminal.integrated.tabs.showDetailed" /* TerminalStorageKeys.TabsShowDetailed */, (showDetailed + 1) % 2, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        },
    });
    const shellProcessString = getShellProcessTooltip(instance, !!showDetailed);
    const content = new MarkdownString(instance.title + shellProcessString + statusString, { supportThemeIcons: true });
    return { content, actions };
}
export function getShellProcessTooltip(instance, showDetailed) {
    const lines = [];
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
        }
        else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUb29sdGlwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFRvb2x0aXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBTTlDLE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxRQUEyQixFQUFFLGNBQStCO0lBQ2hHLE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsR0FBRyx1SEFBZ0UsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUN6SCxJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7SUFDdEIsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7SUFDOUMsTUFBTSxPQUFPLEdBQWlDLEVBQUUsQ0FBQztJQUNqRCxLQUFLLE1BQU0sTUFBTSxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQy9CLElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsSUFBSSxNQUFNLENBQUMsZUFBZSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDOUMsWUFBWSxJQUFJLGNBQWMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFLENB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SUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0SSxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1YsV0FBVyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7UUFDM0IsQ0FBQztRQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDM0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsY0FBYyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUM3RCxDQUFDIn0=