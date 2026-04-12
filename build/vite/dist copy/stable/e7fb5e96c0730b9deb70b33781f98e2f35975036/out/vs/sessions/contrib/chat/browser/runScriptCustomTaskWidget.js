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
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
export const WORKTREE_CREATED_RUN_ON = 'worktreeCreated';
export class RunScriptCustomTaskWidget extends Disposable {
    constructor(state) {
        super();
        this._onDidSubmit = this._register(new Emitter());
        this.onDidSubmit = this._onDidSubmit.event;
        this._onDidCancel = this._register(new Emitter());
        this.onDidCancel = this._onDidCancel.event;
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
        if (storageDisabledReason) {
            dom.append(storageSection, dom.$('div.run-script-action-hint', undefined, storageDisabledReason));
        }
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
        this._storageOptions.domNode.classList.toggle('run-script-action-radio-disabled', this._targetLocked);
        this._storageOptions.setEnabled(!this._targetLocked);
        storageSection.appendChild(this._storageOptions.domNode);
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
            if (keyboardEvent.equals(3 /* KeyCode.Enter */)) {
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                this._submit();
            }
        }));
        this._register(dom.addDisposableListener(this._commandInput.inputElement, dom.EventType.KEY_DOWN, event => {
            const keyboardEvent = new StandardKeyboardEvent(event);
            if (keyboardEvent.equals(3 /* KeyCode.Enter */)) {
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                this._submit();
            }
        }));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
            const keyboardEvent = new StandardKeyboardEvent(event);
            if (keyboardEvent.equals(9 /* KeyCode.Escape */)) {
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                this._onDidCancel.fire();
            }
        }));
        this._updateButtonState();
    }
    focus() {
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
    _submit() {
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
    _updateButtonState() {
        this._submitButton.enabled = this._commandInput.value.trim().length > 0;
        this._submitButton.label = this._getSubmitLabel();
    }
    _getSubmitLabel() {
        if (this._isAddExistingTask) {
            return localize('confirmAddToAgents', "Add to Agents Window");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuU2NyaXB0Q3VzdG9tVGFza1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3J1blNjcmlwdEN1c3RvbVRhc2tXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUVyQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUd4SSxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxpQkFBMEIsQ0FBQztBQW9CbEUsTUFBTSxPQUFPLHlCQUEwQixTQUFRLFVBQVU7SUEyQnhELFlBQVksS0FBc0M7UUFDakQsS0FBSyxFQUFFLENBQUM7UUFQUSxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW9DLENBQUMsQ0FBQztRQUN2RixnQkFBVyxHQUE0QyxJQUFJLENB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