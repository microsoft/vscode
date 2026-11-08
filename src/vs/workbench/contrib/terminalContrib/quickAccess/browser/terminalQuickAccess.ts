/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveDocument, isHTMLElement } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPick, IQuickPickSeparator, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
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
import { Codicon } from '../../../../../base/common/codicons.js';
import { matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
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
	readonly preferredTerminalId?: number;
}

export class TerminalQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'term ';

	private _snapshot: ITerminalPickerSnapshot | undefined;
	private _picker: IQuickPick<IPickerQuickAccessItem, { useSeparators: true }> | undefined;
	private _pendingRestore: ITerminalPickerRestoreState | undefined;
	private readonly _renameController: TerminalPickerRenameController;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IThemeService private readonly _themeService: IThemeService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super(TerminalQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
		this._renameController = this._register(this._instantiationService.createInstance(TerminalPickerRenameController));
	}

	override provide(picker: IQuickPick<IPickerQuickAccessItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		const restoreState = this._pendingRestore;
		this._pendingRestore = undefined;
		this._picker = picker;
		const snapshot = this._snapshot = { ...this._createSnapshot(), preferredTerminalId: restoreState?.terminalId };
		const disposables = new DisposableStore();
		disposables.add(createColorStyleElement(this._themeService.getColorTheme()));
		disposables.add(super.provide(picker, token, runOptions));
		if (restoreState) {
			picker.valueSelection = restoreState.valueSelection;
		}
		if (CopyAction) {
			disposables.add(CopyAction.addImplementation(110, 'terminal-picker', () => {
				const terminal = this._getCopyTarget(picker);
				if (!terminal) {
					return false;
				}
				return this._commandService.executeCommand<void>(TerminalCommandId.CopyInstanceId, new InstanceContext(terminal));
			}));
		}
		// Browsers handle Ctrl/Cmd+C through a copy event instead of the editor copy command.
		disposables.add(addDisposableListener(getActiveDocument(), 'copy', (event: ClipboardEvent) => {
			if (event.defaultPrevented || !event.clipboardData || !isHTMLElement(event.target) || !event.target.closest('.quick-input-widget')) {
				return;
			}
			const terminal = this._getCopyTarget(picker);
			if (terminal) {
				event.clipboardData.setData('text/plain', String(terminal.instanceId));
				event.preventDefault();
			}
		}));
		disposables.add(toDisposable(() => {
			if (this._picker === picker) {
				this._picker = undefined;
			}
			if (this._snapshot === snapshot) {
				this._snapshot = undefined;
			}
		}));
		return disposables;
	}

	private _getCopyTarget(picker: IQuickPick<IPickerQuickAccessItem, { useSeparators: true }>): ITerminalInstance | undefined {
		if (this._quickInputService.currentQuickInput !== picker) {
			return;
		}
		const selection = picker.valueSelection;
		if (picker.inputHasFocus() && selection && selection[0] !== selection[1]) {
			return;
		}
		const terminal = (picker.activeItems[0] as ITerminalQuickPick | undefined)?.terminal;
		return terminal && this._isAvailable(terminal) ? terminal : undefined;
	}

	protected _getPicks(filter: string): PicksWithActive<IPickerQuickAccessItem> {
		const snapshot = this._snapshot ?? this._createSnapshot();
		const items: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		let active: IPickerQuickAccessItem | undefined;
		let preferred: IPickerQuickAccessItem | undefined;
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
				if (pick.terminal.instanceId === snapshot.preferredTerminalId) {
					preferred = item;
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
		return { items, active: preferred ?? active };
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
				? localize({ key: 'terminalPaneCoordinates', comment: ['Short display labels, not JSON argument names. {0} is the terminal instance ID, {1} is the 1-based tab position, and {2} is the 1-based pane position within that tab. A pane is one terminal within a tab.'] }, "id:{0}, tab:{1}, pane:{2}", terminal.instanceId, position.tabIndex + 1, position.paneIndex + 1)
				: localize({ key: 'terminalTabCoordinates', comment: ['Short display labels, not JSON argument names. {0} is the terminal instance ID and {1} is the 1-based tab position. This tab contains a single terminal.'] }, "id:{0}, tab:{1}", terminal.instanceId, position.tabIndex + 1))
			: localize({ key: 'terminalEditorCoordinates', comment: ['{0} is the terminal instance ID. The terminal is open in the editor area rather than the terminal panel. These are short display labels, not JSON argument names.'] }, "id:{0}, editor", terminal.instanceId);
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
					iconClass: ThemeIcon.asClassName(Codicon.copy),
					tooltip: localize('copyTerminalId', "Copy Terminal ID")
				},
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
			trigger: async buttonIndex => {
				if (!this._isAvailable(terminal)) {
					return TriggerAction.REMOVE_ITEM;
				}
				switch (buttonIndex) {
					case 0:
						await this._commandService.executeCommand<void>(TerminalCommandId.CopyInstanceId, new InstanceContext(terminal));
						return TriggerAction.NO_ACTION;
					case 1:
						this._renameFromPicker(terminal);
						return TriggerAction.NO_ACTION;
					case 2:
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

	private _renameFromPicker(terminal: ITerminalInstance): void {
		const picker = this._picker;
		if (!picker) {
			return;
		}
		this._renameController.rename(terminal, {
			value: picker.value,
			valueSelection: picker.valueSelection,
			terminalId: terminal.instanceId
		}, () => this._isAvailable(terminal), state => {
			this._pendingRestore = state;
			this._quickInputService.quickAccess.show(state.value, { preserveValue: true });
		});
	}

	private _isAvailable(terminal: ITerminalInstance): boolean {
		return !terminal.isDisposed && this._terminalService.foregroundInstances.includes(terminal);
	}
}

/** The picker state to restore after a terminal rename. */
export interface ITerminalPickerRestoreState {
	readonly value: string;
	readonly valueSelection: Readonly<[number, number]> | undefined;
	readonly terminalId: number;
}

/** Owns a rename input independently of the picker it replaces. */
export class TerminalPickerRenameController extends Disposable {
	private readonly _session = this._register(new MutableDisposable<DisposableStore>());
	private _generation = 0;

	constructor(@IQuickInputService private readonly _quickInputService: IQuickInputService) {
		super();
	}

	rename(terminal: ITerminalInstance, state: ITerminalPickerRestoreState, isAvailable: () => boolean, restore: (state: ITerminalPickerRestoreState) => void): void {
		if (this._store.isDisposed || !isAvailable()) {
			return;
		}

		const generation = ++this._generation;
		const session = new DisposableStore();
		this._session.value = session;
		let finished = false;
		let accepted = false;
		// Disposing a session must not reopen the picker through input.dispose().
		session.add(toDisposable(() => finished = true));
		const input = session.add(this._quickInputService.createInputBox());
		const savedState: ITerminalPickerRestoreState = {
			...state,
			valueSelection: state.valueSelection ? [state.valueSelection[0], state.valueSelection[1]] : undefined
		};

		session.add(input.onDidAccept(() => {
			accepted = true;
			try {
				if (input.value && isAvailable()) {
					terminal.rename(input.value);
				}
			} finally {
				input.hide();
			}
		}));
		session.add(input.onDidHide(event => {
			if (finished) {
				return;
			}
			finished = true;
			const shouldRestore = accepted || event.reason === QuickInputHideReason.Gesture;
			this._session.clear();
			if (shouldRestore) {
				// Finish the old input's hide/focus lifecycle before showing a new picker.
				queueMicrotask(() => {
					if (!this._store.isDisposed && generation === this._generation && !this._quickInputService.currentQuickInput) {
						restore(savedState);
					}
				});
			}
		}));
		input.value = terminal.title;
		input.prompt = localize('workbench.action.terminal.rename.prompt', "Enter terminal name");
		input.show();
	}
}
