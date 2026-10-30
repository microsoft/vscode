/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPick, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, PicksWithActive, TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { matchesFuzzyIconAware, parseLabelWithIcons } from '../../../../../base/common/iconLabels.js';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TerminalCommandId } from '../../../terminal/common/terminal.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { killTerminalIcon, renameTerminalIcon } from '../../../terminal/browser/terminalIcons.js';
import { createColorStyleElement, getColorClass, getIconId, getUriClasses } from '../../../terminal/browser/terminalIcon.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { CopyAction } from '../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { InstanceContext } from '../../../terminal/browser/terminalContextMenu.js';

interface ITerminalQuickPick extends IPickerQuickAccessItem {
	readonly terminal: ITerminalInstance;
	readonly location: TerminalLocation;
}

interface ITerminalPickerSnapshot {
	readonly items: readonly ITerminalQuickPick[];
	readonly activeTerminal: ITerminalInstance | undefined;
}

export class TerminalQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'term ';

	private _snapshot: ITerminalPickerSnapshot | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super(TerminalQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
	}

	override provide(picker: IQuickPick<IPickerQuickAccessItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		const snapshot = this._snapshot = this._createSnapshot();
		const disposables = new DisposableStore();
		disposables.add(createColorStyleElement(this._themeService.getColorTheme()));
		disposables.add(super.provide(picker, token, runOptions));
		if (CopyAction) {
			disposables.add(CopyAction.addImplementation(110, 'terminal-picker', accessor => {
				if (accessor.get(IQuickInputService).currentQuickInput !== picker) {
					return false;
				}
				const selection = picker.valueSelection;
				if (picker.inputHasFocus() && selection && selection[0] !== selection[1]) {
					return false;
				}
				const terminal = (picker.activeItems[0] as ITerminalQuickPick | undefined)?.terminal;
				if (!terminal || !this._isAvailable(terminal)) {
					return false;
				}
				return this._commandService.executeCommand<void>(TerminalCommandId.CopyInstanceId, new InstanceContext(terminal));
			}));
		}
		disposables.add(toDisposable(() => {
			if (this._snapshot === snapshot) {
				this._snapshot = undefined;
			}
		}));
		return disposables;
	}

	protected _getPicks(filter: string): PicksWithActive<IPickerQuickAccessItem> {
		const snapshot = this._snapshot ?? this._createSnapshot();
		const items: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		let active: IPickerQuickAccessItem | undefined;
		for (const location of [TerminalLocation.Panel, TerminalLocation.Editor]) {
			let hasSeparator = false;
			for (const pick of snapshot.items) {
				if (pick.location !== location) {
					continue;
				}
				const labelHighlights = matchesFuzzyIconAware(filter, parseLabelWithIcons(pick.label), true);
				const descriptionHighlights = matchesContiguousSubString(filter, pick.description ?? '');
				if (!labelHighlights && !descriptionHighlights) {
					continue;
				}
				if (!hasSeparator) {
					items.push({ type: 'separator', label: location === TerminalLocation.Panel ? localize('panelTerminals', "Panel") : localize('editorTerminals', "Editor") });
					hasSeparator = true;
				}
				const item = { ...pick, highlights: { label: labelHighlights ?? undefined, description: descriptionHighlights ?? undefined } };
				items.push(item);
				if (pick.terminal === snapshot.activeTerminal) {
					active = item;
				}
			}
		}

		if (items.length > 0) {
			items.push({ type: 'separator' });
		}

		const createTerminalLabel = localize("workbench.action.terminal.newplus", "Create New Terminal");
		items.push({
			label: `$(plus) ${createTerminalLabel}`,
			ariaLabel: createTerminalLabel,
			accept: () => this._commandService.executeCommand(TerminalCommandId.New)
		});
		const createWithProfileLabel = localize("workbench.action.terminal.newWithProfilePlus", "Create New Terminal With Profile...");
		items.push({
			label: `$(plus) ${createWithProfileLabel}`,
			ariaLabel: createWithProfileLabel,
			accept: () => this._commandService.executeCommand(TerminalCommandId.NewWithProfile)
		});
		return { items, active };
	}

	private _createSnapshot(): ITerminalPickerSnapshot {
		const items: ITerminalQuickPick[] = [];
		const groups = this._terminalGroupService.groups;
		for (let tabIndex = 0; tabIndex < groups.length; tabIndex++) {
			const group = groups[tabIndex];
			for (let paneIndex = 0; paneIndex < group.terminalInstances.length; paneIndex++) {
				items.push(this._createPick(group.terminalInstances[paneIndex], TerminalLocation.Panel, { tabIndex, paneIndex, paneCount: group.terminalInstances.length }));
			}
		}
		for (const terminal of this._terminalEditorService.instances) {
			items.push(this._createPick(terminal, TerminalLocation.Editor));
		}
		return { items, activeTerminal: this._terminalService.activeInstance };
	}

	private _createPick(terminal: ITerminalInstance, location: TerminalLocation, position?: { tabIndex: number; paneIndex: number; paneCount: number }): ITerminalQuickPick {
		const iconId = this._instantiationService.invokeFunction(getIconId, terminal);
		const label = `$(${iconId}) ${terminal.title}`;
		const coordinates = position
			? (position.paneCount > 1
				? localize('terminalPaneCoordinates', "id:{0}, tab:{1}, pane:{2}", terminal.instanceId, position.tabIndex + 1, position.paneIndex + 1)
				: localize('terminalTabCoordinates', "id:{0}, tab:{1}", terminal.instanceId, position.tabIndex + 1))
			: localize('terminalEditorCoordinates', "id:{0}, editor", terminal.instanceId);
		const description = terminal.description ? `${terminal.description} (${coordinates})` : `(${coordinates})`;
		const iconClasses: string[] = [];
		const colorClass = getColorClass(terminal);
		if (colorClass) {
			iconClasses.push(colorClass);
		}
		const uriClasses = getUriClasses(terminal, this._themeService.getColorTheme().type);
		if (uriClasses) {
			iconClasses.push(...uriClasses);
		}
		return {
			terminal,
			location,
			label,
			description,
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
				if (!this._isAvailable(terminal)) {
					return TriggerAction.REMOVE_ITEM;
				}
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
			accept: async (keyMod, event) => {
				if (!this._isAvailable(terminal)) {
					return;
				}
				if (!event.inBackground) {
					await this._terminalService.focusInstance(terminal);
				} else if (terminal.target === TerminalLocation.Editor) {
					const existingEditors = this._editorService.findEditors(terminal.resource);
					await this._terminalEditorService.openEditor(terminal, { viewColumn: existingEditors[0]?.groupId ?? ACTIVE_GROUP, preserveFocus: true });
					this._terminalEditorService.setActiveInstance(terminal);
				} else {
					this._terminalGroupService.setActiveInstance(terminal);
					await this._terminalGroupService.showPanel(false);
				}
			}
		};
	}

	private _isAvailable(terminal: ITerminalInstance): boolean {
		return !terminal.isDisposed && this._terminalService.foregroundInstances.includes(terminal);
	}
}
