/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../base/browser/dom.js';
import { FindInput } from '../../../base/browser/ui/findinput/findInput.js';
import { createToggleActionViewItemProvider } from '../../../base/browser/ui/toggle/toggle.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import Severity from '../../../base/common/severity.js';
import './media/quickInput.css';
const $ = dom.$;
export class QuickInputBox extends Disposable {
    constructor(parent, inputBoxStyles, toggleStyles) {
        super();
        this.parent = parent;
        this._listFocusMode = false;
        this.onDidChange = (handler) => {
            return this.findInput.onDidChange(handler);
        };
        this.container = dom.append(this.parent, $('.quick-input-box'));
        this.findInput = this._register(new FindInput(this.container, undefined, {
            label: '',
            inputBoxStyles,
            toggleStyles,
            actionViewItemProvider: createToggleActionViewItemProvider(toggleStyles),
            hideHoverOnValueChange: true
        }));
        // Don't set role="textbox" - the input element already has that implicit role
        // Don't set aria-haspopup or aria-autocomplete by default - only add them when list is active
    }
    get onKeyDown() {
        return this.findInput.onKeyDown;
    }
    get onMouseDown() {
        return this.findInput.onMouseDown;
    }
    get value() {
        return this.findInput.getValue();
    }
    set value(value) {
        this.findInput.setValue(value);
    }
    select(range = null) {
        this.findInput.inputBox.select(range);
    }
    getSelection() {
        return this.findInput.inputBox.getSelection();
    }
    isSelectionAtEnd() {
        return this.findInput.inputBox.isSelectionAtEnd();
    }
    setPlaceholder(placeholder) {
        this.findInput.inputBox.setPlaceHolder(placeholder);
    }
    get placeholder() {
        return this.findInput.inputBox.inputElement.getAttribute('placeholder') || '';
    }
    set placeholder(placeholder) {
        this.findInput.inputBox.setPlaceHolder(placeholder);
    }
    get password() {
        return this.findInput.inputBox.inputElement.type === 'password';
    }
    set password(password) {
        this.findInput.inputBox.inputElement.type = password ? 'password' : 'text';
    }
    set enabled(enabled) {
        // We can't disable the input box because it is still used for
        // navigating the list. Instead, we disable the list and the OK
        // so that nothing can be selected.
        // TODO: should this be what we do for all find inputs? Or maybe some _other_ API
        // on findInput to change it to readonly?
        this.findInput.inputBox.inputElement.toggleAttribute('readonly', !enabled);
        // TODO: styles of the quick pick need to be moved to the CSS instead of being in line
        // so things like this can be done in CSS
        // this.findInput.inputBox.inputElement.classList.toggle('disabled', !enabled);
    }
    set toggles(toggles) {
        this.findInput.setAdditionalToggles(toggles);
    }
    set actions(actions) {
        this.setActions(actions);
    }
    setActions(actions, actionViewItemProvider) {
        this.findInput.setActions(actions, actionViewItemProvider);
    }
    get ariaLabel() {
        return this.findInput.inputBox.inputElement.getAttribute('aria-label') || '';
    }
    set ariaLabel(ariaLabel) {
        this.findInput.inputBox.inputElement.setAttribute('aria-label', ariaLabel);
    }
    hasFocus() {
        return this.findInput.inputBox.hasFocus();
    }
    setAttribute(name, value) {
        this.findInput.inputBox.inputElement.setAttribute(name, value);
    }
    removeAttribute(name) {
        this.findInput.inputBox.inputElement.removeAttribute(name);
    }
    /**
     * Controls the ARIA popup mode for screen readers.
     * When enabled (hasActiveDescendant=true), indicates a list popup is active.
     * When disabled, removes ARIA attributes to allow normal text input behavior.
     * Only updates attributes when the state actually changes to avoid
     * unnecessary screen reader re-announcements.
     */
    setListFocusMode(hasActiveDescendant) {
        if (this._listFocusMode === hasActiveDescendant) {
            return; // No change, avoid triggering screen reader re-announcements
        }
        this._listFocusMode = hasActiveDescendant;
        const input = this.findInput.inputBox.inputElement;
        if (hasActiveDescendant) {
            // List item is focused - indicate combobox behavior
            input.setAttribute('aria-haspopup', 'listbox');
            input.setAttribute('aria-autocomplete', 'list');
        }
        else {
            // No list item focused - remove combobox attributes for normal text input
            input.removeAttribute('aria-haspopup');
            input.removeAttribute('aria-autocomplete');
        }
    }
    showDecoration(decoration) {
        if (decoration === Severity.Ignore) {
            this.findInput.clearMessage();
        }
        else {
            this.findInput.showMessage({ type: decoration === Severity.Info ? 1 /* MessageType.INFO */ : decoration === Severity.Warning ? 2 /* MessageType.WARNING */ : 3 /* MessageType.ERROR */, content: '' });
        }
    }
    stylesForType(decoration) {
        return this.findInput.inputBox.stylesForType(decoration === Severity.Info ? 1 /* MessageType.INFO */ : decoration === Severity.Warning ? 2 /* MessageType.WARNING */ : 3 /* MessageType.ERROR */);
    }
    setFocus() {
        this.findInput.focus();
    }
    layout() {
        this.findInput.inputBox.layout();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dEJveC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja0lucHV0Qm94LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBeUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUd0SCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDeEQsT0FBTyx3QkFBd0IsQ0FBQztBQUVoQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCLE1BQU0sT0FBTyxhQUFjLFNBQVEsVUFBVTtJQU01QyxZQUNTLE1BQW1CLEVBQzNCLGNBQStCLEVBQy9CLFlBQTJCO1FBRTNCLEtBQUssRUFBRSxDQUFDO1FBSkEsV0FBTSxHQUFOLE1BQU0sQ0FBYTtRQUhwQixtQkFBYyxHQUFZLEtBQUssQ0FBQztRQStCeEMsZ0JBQVcsR0FBRyxDQUFDLE9BQWdDLEVBQWUsRUFBRTtZQUMvRCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVDLENBQUMsQ0FBQztRQXpCRCxJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFNBQVMsQ0FDNUMsSUFBSSxDQUFDLFNBQVMsRUFDZCxTQUFT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