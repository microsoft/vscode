/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { matchesFuzzy } from 'vs/base/common/filters';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { killTerminalIcon, renameTerminalIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { iconRegistry, Codicon } from 'vs/base/common/codicons';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { hash } from 'vs/base/common/hash';
import { URI } from 'vs/base/common/uri';

export class TerminalQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'term ';

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ICommandService private readonly _commandService: ICommandService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super(TerminalQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
	}

	protected _getPicks(filter: string): Array<IPickerQuickAccessItem | IQuickPickSeparator> {
		const terminalPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		const terminalGroups = this._terminalService.terminalGroups;
		for (let groupIndex = 0; groupIndex < terminalGroups.length; groupIndex++) {
			const terminalGroup = terminalGroups[groupIndex];
			for (let terminalIndex = 0; terminalIndex < terminalGroup.terminalInstances.length; terminalIndex++) {
				const terminal = terminalGroup.terminalInstances[terminalIndex];
				const icon = terminal.icon;
				const iconId = this._getIconId(icon);
				const label = `$(${iconId}) ${groupIndex + 1}.${terminalIndex + 1}: ${terminal.title}`;
				const iconClasses: string[] = [];
				let color = undefined;
				if (terminal.color) {
					color = terminal.color;
				} else if (ThemeIcon.isThemeIcon(icon) && icon.color) {
					color = icon.color.id.replace('.', '_');
				}
				if (color) {
					iconClasses.push(`terminal-icon-${color}`);
				}
				let uri = undefined;
				if (icon instanceof URI) {
					uri = icon;
				} else if (icon instanceof Object && 'light' in icon && 'dark' in icon) {
					uri = this._themeService.getColorTheme().type === ColorScheme.LIGHT ? icon.light : icon.dark;
				}
				if (uri instanceof URI) {
					const uriIconKey = hash(uri.path).toString(36);
					const className = `terminal-uri-icon-${uriIconKey}`;
					iconClasses.push(className);
					iconClasses.push(`terminal-uri-icon`);
				}
				const highlights = matchesFuzzy(filter, label, true);
				if (highlights) {
					terminalPicks.push({
						label,
						highlights: { label: highlights },
						buttons: [
							{
								iconClass: ThemeIcon.asClassName(renameTerminalIcon),
								tooltip: localize('renameTerminal', "Rename Terminal")
							},
							{
								iconClass: ThemeIcon.asClassName(killTerminalIcon),
								tooltip: localize('killTerminal', "Kill Terminal Instance")
							},
						],
						iconClasses,
						trigger: buttonIndex => {
							switch (buttonIndex) {
								case 0:
									this._commandService.executeCommand(TerminalCommandId.Rename, terminal);
									return TriggerAction.NO_ACTION;
								case 1:
									terminal.dispose(true);
									return TriggerAction.REMOVE_ITEM;
							}

							return TriggerAction.NO_ACTION;
						},
						accept: (keyMod, event) => {
							this._terminalService.setActiveInstance(terminal);
							this._terminalService.showPanel(!event.inBackground);
						}
					});
				}
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
		const createWithProfileLabel = localize("workbench.action.terminal.newWithProfilePlus", "Create New Terminal With Profile");
		terminalPicks.push({
			label: `$(plus) ${createWithProfileLabel}`,
			ariaLabel: createWithProfileLabel,
			accept: () => this._commandService.executeCommand(TerminalCommandId.NewWithProfile)
		});

		return terminalPicks;

	}
	private _getIconId(icon: any): string {
		if (!icon) {
			return Codicon.terminal.id;
		}
		if (ThemeIcon.isThemeIcon(icon.id)) {
			return icon.id;
		} else if (typeof icon === 'string' && iconRegistry.get(icon)) {
			return icon;
		}
		return Codicon.terminal.id;
	}
}
