/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { matchesFuzzy } from 'vs/base/common/filters';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { killTerminalIcon, renameTerminalIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { getColorClass, getIconId, getUriClasses } from 'vs/workbench/contrib/terminal/browser/terminalIcon';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
let terminalPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

export class TerminalQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'term ';

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ICommandService private readonly _commandService: ICommandService,
		@IThemeService private readonly _themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(TerminalQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
	}
	protected _getPicks(filter: string): Array<IPickerQuickAccessItem | IQuickPickSeparator> {
		terminalPicks = [];
		terminalPicks.push({ type: 'separator', label: 'panel' });
		const terminalGroups = this._terminalGroupService.groups;
		for (let groupIndex = 0; groupIndex < terminalGroups.length; groupIndex++) {
			const terminalGroup = terminalGroups[groupIndex];
			for (let terminalIndex = 0; terminalIndex < terminalGroup.terminalInstances.length; terminalIndex++) {
				const terminal = terminalGroup.terminalInstances[terminalIndex];
				const pick = this._createPick(terminal, terminalIndex, filter, { groupIndex, groupSize: terminalGroup.terminalInstances.length });
				if (pick) {
					terminalPicks.push(pick);
				}
			}
		}

		if (terminalPicks.length > 0) {
			terminalPicks.push({ type: 'separator', label: 'editor' });
		}

		const terminalEditors = this._terminalEditorService.instances;
		for (let editorIndex = 0; editorIndex < terminalEditors.length; editorIndex++) {
			const term = terminalEditors[editorIndex];
			term.target = TerminalLocation.Editor;
			const pick = this._createPick(term, editorIndex, filter);
			if (pick) {
				terminalPicks.push(pick);
			}
		}

		if (terminalPicks.length > 0) {
			terminalPicks.push({ type: 'separator' });
		}

		const createTerminalLabel = localize("workbench.action.terminal.newplus", "Create New Terminal");
		terminalPicks.push({
			label: `$(plus) ${createTerminalLabel}`,
			ariaLabel: createTerminalLabel,
			accept: () => this._commandService.executeCommand(TerminalCommandId.New)
		});
		const createWithProfileLabel = localize("workbench.action.terminal.newWithProfilePlus", "Create New Terminal With Profile...");
		terminalPicks.push({
			label: `$(plus) ${createWithProfileLabel}`,
			ariaLabel: createWithProfileLabel,
			accept: () => this._commandService.executeCommand(TerminalCommandId.NewWithProfile)
		});
		return terminalPicks;
	}

	private _createPick(terminal: ITerminalInstance, terminalIndex: number, filter: string, groupInfo?: { groupIndex: number; groupSize: number }): IPickerQuickAccessItem | undefined {
		const iconId = this._instantiationService.invokeFunction(getIconId, terminal);
		const index = groupInfo
			? (groupInfo.groupSize > 1
				? `${groupInfo.groupIndex + 1}.${terminalIndex + 1}`
				: `${groupInfo.groupIndex + 1}`)
			: `${terminalIndex + 1}`;
		const label = `$(${iconId}) ${index}: ${terminal.title}`;
		const iconClasses: string[] = [];
		const colorClass = getColorClass(terminal);
		if (colorClass) {
			iconClasses.push(colorClass);
		}
		const uriClasses = getUriClasses(terminal, this._themeService.getColorTheme().type);
		if (uriClasses) {
			iconClasses.push(...uriClasses);
		}
		const highlights = matchesFuzzy(filter, label, true);
		if (highlights) {
			return {
				label,
				description: terminal.description,
				highlights: { label: highlights },
				buttons: [
					{
						iconClass: ThemeIcon.asClassName(renameTerminalIcon),
						tooltip: localize('renameTerminal', "Rename Terminal")
					},
					{
						iconClass: ThemeIcon.asClassName(killTerminalIcon),
						tooltip: terminalStrings.kill.value
					}
				],
				iconClasses,
				trigger: buttonIndex => {
					switch (buttonIndex) {
						case 0:
							this._commandService.executeCommand(TerminalCommandId.Rename, terminal);
							return TriggerAction.NO_ACTION;
						case 1:
							this._terminalService.safeDisposeTerminal(terminal);
							return TriggerAction.REMOVE_ITEM;
					}

					return TriggerAction.NO_ACTION;
				},
				accept: (keyMod, event) => {
					if (terminal.target === TerminalLocation.Editor) {
						const existingEditors = this._editorService.findEditors(terminal.resource);
						this._terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
						this._terminalEditorService.setActiveInstance(terminal);
					} else {
						this._terminalGroupService.showPanel(!event.inBackground);
						this._terminalGroupService.setActiveInstance(terminal);
					}
				}
			};
		}
		return undefined;
	}
}
