/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/runScriptAction.css';

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { TaskStorageTarget } from './sessionsConfigurationService.js';

export const WORKTREE_CREATED_RUN_ON = 'worktreeCreated' as const;

export interface IRunScriptCustomTaskWidgetState {
	readonly label?: string;
	readonly labelDisabledReason?: string;
	readonly command?: string;
	readonly commandDisabledReason?: string;
	readonly target?: TaskStorageTarget;
	readonly targetDisabledReason?: string;
	readonly runOn?: typeof WORKTREE_CREATED_RUN_ON;
	readonly mode?: 'add' | 'add-existing' | 'configure';
}

export interface IRunScriptCustomTaskWidgetResult {
	readonly label?: string;
	readonly command: string;
	readonly target: TaskStorageTarget;
	readonly runOn?: typeof WORKTREE_CREATED_RUN_ON;
}

export class RunScriptCustomTaskWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _labelInput: InputBox;
	private readonly _commandInput: InputBox;
	private readonly _runOnCheckbox: Checkbox;
	private readonly _storageOptions: Radio;
	private readonly _submitButton: Button;
	private readonly _cancelButton: Button;
	private readonly _labelLocked: boolean;
	private readonly _commandLocked: boolean;
	private readonly _targetLocked: boolean;
	private readonly _isExistingTask: boolean;
	private readonly _isAddExistingTask: boolean;
	private readonly _initialLabel: string;
	private readonly _initialCommand: string;
	private readonly _initialRunOn: boolean;
	private readonly _initialTarget: TaskStorageTarget;
	private _selectedTarget: TaskStorageTarget;

	private readonly _onDidSubmit = this._register(new Emitter<IRunScriptCustomTaskWidgetResult>());
	readonly onDidSubmit: Event<IRunScriptCustomTaskWidgetResult> = this._onDidSubmit.event;

	private readonly _onDidCancel = this._register(new Emitter<void>());
	readonly onDidCancel: Event<void> = this._onDidCancel.event;

	constructor(state: IRunScriptCustomTaskWidgetState) {
		super();

		this._labelLocked = !!state.labelDisabledReason;
		this._commandLocked = !!state.commandDisabledReason;
		this._targetLocked = !!state.targetDisabledReason && state.target !== undefined;
		this._isExistingTask = state.mode === 'configure';
		this._isAddExistingTask = state.mode === 'add-existing';
		this._selectedTarget = state.target ?? (state.targetDisabledReason ? 'user' : 'workspace');
		this._initialLabel = state.label ?? '';
		this._initialCommand = state.command ?? '';
		this._initialRunOn = state.runOn === WORKTREE_CREATED_RUN_ON;
		this._initialTarget = this._selectedTarget;

		this.domNode = dom.$('.run-script-action-widget');

		const labelSection = dom.append(this.domNode, dom.$('.run-script-action-section'));
		dom.append(labelSection, dom.$('label.run-script-action-label', undefined, localize('labelFieldLabel', "Name")));
		const labelInputContainer = dom.append(labelSection, dom.$('.run-script-action-input'));
		this._labelInput = this._register(new InputBox(labelInputContainer, undefined, {
			placeholder: localize('enterLabelPlaceholder', "Enter a name for this task (optional)"),
			tooltip: state.labelDisabledReason,
			ariaLabel: localize('enterLabelAriaLabel', "Task name"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._labelInput.value = state.label ?? '';
		if (state.labelDisabledReason) {
			this._labelInput.disable();
		}

		const commandSection = dom.append(this.domNode, dom.$('.run-script-action-section'));
		dom.append(commandSection, dom.$('label.run-script-action-label', undefined, localize('commandFieldLabel', "Command")));
		const commandInputContainer = dom.append(commandSection, dom.$('.run-script-action-input'));
		this._commandInput = this._register(new InputBox(commandInputContainer, undefined, {
			placeholder: localize('enterCommandPlaceholder', "Enter command (for example, npm run dev)"),
			tooltip: state.commandDisabledReason,
			ariaLabel: localize('enterCommandAriaLabel', "Task command"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._commandInput.value = state.command ?? '';
		if (state.commandDisabledReason) {
			this._commandInput.disable();
		}

		const runOnSection = dom.append(this.domNode, dom.$('.run-script-action-section'));
		dom.append(runOnSection, dom.$('div.run-script-action-label', undefined, localize('runOptionsLabel', "Run Options")));
		const runOnRow = dom.append(runOnSection, dom.$('.run-script-action-option-row'));
		this._runOnCheckbox = this._register(new Checkbox(localize('runOnWorktreeCreated', "Run When Worktree Is Created"), state.runOn === WORKTREE_CREATED_RUN_ON, defaultCheckboxStyles));
		runOnRow.appendChild(this._runOnCheckbox.domNode);
		const runOnText = dom.append(runOnRow, dom.$('span.run-script-action-option-text', undefined, localize('runOnWorktreeCreatedDescription', "Automatically run this task when the session worktree is created")));
		this._register(dom.addDisposableListener(runOnText, dom.EventType.CLICK, () => this._runOnCheckbox.checked = !this._runOnCheckbox.checked));

		const storageSection = dom.append(this.domNode, dom.$('.run-script-action-section'));
		dom.append(storageSection, dom.$('div.run-script-action-label', undefined, localize('storageLabel', "Save In")));
		const storageDisabledReason = state.targetDisabledReason;
		const workspaceTargetDisabled = !!storageDisabledReason;
		this._storageOptions = this._register(new Radio({
			items: [
				{
					text: localize('workspaceStorageLabel', "Workspace"),
					tooltip: storageDisabledReason ?? localize('workspaceStorageTooltip', "Save this task in the current workspace"),
					isActive: this._selectedTarget === 'workspace',
					disabled: workspaceTargetDisabled,
				},
				{
					text: localize('userStorageLabel', "User"),
					tooltip: this._targetLocked ? storageDisabledReason : localize('userStorageTooltip', "Save this task in your user tasks and make it available in all sessions"),
					isActive: this._selectedTarget === 'user',
					disabled: this._targetLocked,
				}
			]
		}));
		this._storageOptions.domNode.setAttribute('aria-label', localize('storageAriaLabel', "Task storage target"));
		storageSection.appendChild(this._storageOptions.domNode);
		if (storageDisabledReason && !this._targetLocked) {
			dom.append(storageSection, dom.$('div.run-script-action-hint', undefined, storageDisabledReason));
		}

		const buttonRow = dom.append(this.domNode, dom.$('.run-script-action-buttons'));
		this._cancelButton = this._register(new Button(buttonRow, { ...defaultButtonStyles, secondary: true }));
		this._cancelButton.label = localize('cancelAddAction', "Cancel");
		this._submitButton = this._register(new Button(buttonRow, defaultButtonStyles));
		this._submitButton.label = this._getSubmitLabel();

		this._register(this._labelInput.onDidChange(() => this._updateButtonState()));
		this._register(this._commandInput.onDidChange(() => this._updateButtonState()));
		this._register(this._storageOptions.onDidSelect(index => {
			this._selectedTarget = index === 0 ? 'workspace' : 'user';
			this._updateButtonState();
		}));
		this._register(this._runOnCheckbox.onChange(() => this._updateButtonState()));
		this._register(this._submitButton.onDidClick(() => this._submit()));
		this._register(this._cancelButton.onDidClick(() => this._onDidCancel.fire()));
		this._register(dom.addDisposableListener(this._labelInput.inputElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this._submit();
			}
		}));
		this._register(dom.addDisposableListener(this._commandInput.inputElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this._submit();
			}
		}));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this._onDidCancel.fire();
			}
		}));

		this._updateButtonState();
	}

	focus(): void {
		if (!this._labelLocked) {
			this._labelInput.focus();
			return;
		}
		if (this._commandLocked) {
			this._runOnCheckbox.focus();
			return;
		}
		this._commandInput.focus();
	}

	private _submit(): void {
		const label = this._labelInput.value.trim();
		const command = this._commandInput.value.trim();
		if (!command) {
			return;
		}

		this._onDidSubmit.fire({
			label: label.length > 0 ? label : undefined,
			command,
			target: this._selectedTarget,
			runOn: this._runOnCheckbox.checked ? WORKTREE_CREATED_RUN_ON : undefined,
		});
	}

	private _updateButtonState(): void {
		this._submitButton.enabled = this._commandInput.value.trim().length > 0;
		this._submitButton.label = this._getSubmitLabel();
	}

	private _getSubmitLabel(): string {
		if (this._isAddExistingTask) {
			return localize('confirmAddToSessions', "Add to Sessions Window");
		}
		if (!this._isExistingTask) {
			return localize('confirmAddTask', "Add Task");
		}

		const targetChanged = this._selectedTarget !== this._initialTarget;
		const labelChanged = this._labelInput.value !== this._initialLabel;
		const commandChanged = this._commandInput.value !== this._initialCommand;
		const runOnChanged = this._runOnCheckbox.checked !== this._initialRunOn;
		const otherChanged = labelChanged || commandChanged || runOnChanged;

		if (targetChanged && otherChanged) {
			return localize('confirmMoveAndUpdateTask', "Move and Update Task");
		}
		if (targetChanged) {
			return localize('confirmMoveTask', "Move Task");
		}
		return localize('confirmUpdateTask', "Update Task");
	}
}
