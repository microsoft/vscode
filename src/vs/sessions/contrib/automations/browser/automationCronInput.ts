/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getAutomationCronValidationError } from '../../../../workbench/contrib/chat/common/automations/schedule.js';

const fields = [
	{ label: localize('cron.minute', "Minute"), caption: localize('cron.min', "min"), minimum: 0, maximum: 59, hint: localize('cron.minuteHint', "Every minute (*), 0-59, or */2 for every two minutes.") },
	{ label: localize('cron.hour', "Hour"), caption: localize('cron.hourCaption', "hour"), minimum: 0, maximum: 23, hint: localize('cron.hourHint', "Every hour (*) or 0-23.") },
	{ label: localize('cron.day', "Day of month"), caption: localize('cron.dayCaption', "day"), minimum: 1, maximum: 31, hint: localize('cron.dayHint', "Every day (*) or 1-31.") },
	{ label: localize('cron.month', "Month"), caption: localize('cron.monthCaption', "month"), minimum: 1, maximum: 12, hint: localize('cron.monthHint', "Every month (*), 1-12, or JAN-DEC.") },
	{ label: localize('cron.weekday', "Day of week"), caption: localize('cron.weekdayCaption', "weekday"), minimum: 0, maximum: 7, hint: localize('cron.weekdayHint', "Every weekday (*), SUN-SAT, or 0-7. Sunday is 0 or 7.") },
];

/** A five-part editor for the host's cron expression, with one shared validation border. */
export class AutomationCronInput extends Disposable {
	private readonly inputs: InputBox[] = [];
	private readonly group: HTMLElement;
	private readonly hint: HTMLElement;
	private readonly error: HTMLElement;
	private allSelected = false;
	private updating = false;
	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	constructor(container: HTMLElement, expression: string, private readonly timeZone: string, contextViewService: IContextViewService) {
		super();
		this.group = DOM.append(container, DOM.$('.automation-cron-segments', { role: 'group', 'aria-label': localize('cron.expression', "Cron expression") }));
		this.hint = DOM.append(container, DOM.$('.automation-form-hint', { id: 'automation-cron-hint' }));
		this.error = DOM.append(container, DOM.$('.automation-form-hint.automation-form-cron-error', { id: 'automation-cron-error', 'aria-live': 'polite' }));
		const parts = expression.trim().split(/\s+/);
		for (const [index, field] of fields.entries()) {
			const segment = DOM.append(this.group, DOM.$('.automation-cron-segment'));
			const input = this._register(new InputBox(segment, contextViewService, {
				inputBoxStyles: { ...defaultInputBoxStyles, inputBorder: 'transparent', inputBackground: 'transparent' },
				placeholder: '*',
				ariaLabel: field.label,
			}));
			input.value = index === fields.length - 1 ? parts.slice(index).join(' ') : parts[index] ?? '';
			input.inputElement.spellcheck = false;
			input.inputElement.setAttribute('aria-describedby', `${this.hint.id} ${this.error.id}`);
			this.inputs.push(input);
			DOM.append(segment, DOM.$('span.automation-cron-caption', { 'aria-hidden': 'true' }, field.caption));
			this._register(DOM.addDisposableListener(input.inputElement, 'focus', () => {
				this.hint.textContent = field.hint;
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'blur', () => {
				this.setAllSelected(false);
				this.showTimeZone();
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'mousedown', () => this.setAllSelected(false)));
			this._register(DOM.addDisposableListener(input.inputElement, 'beforeinput', (event: InputEvent) => {
				if (!event.isComposing && event.data && /[^a-zA-Z0-9*,/-]/.test(event.data)) {
					event.preventDefault();
				}
			}));
			this._register(input.onDidChange(() => {
				if (this.updating) {
					return;
				}
				if (this.allSelected) {
					this.setAllSelected(false);
					this.updating = true;
					for (const other of this.inputs) {
						if (other !== input) {
							other.value = '';
						}
					}
					this.updating = false;
				}
				this.setAllSelected(false);
				this.changed();
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'keydown', event => {
				if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
					event.preventDefault();
					input.select();
					this.setAllSelected(true);
				} else if (this.allSelected && (event.key === 'Backspace' || event.key === 'Delete')) {
					event.preventDefault();
					this.clear();
				} else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					const value = input.value.trim();
					if (value === '' || value === '*' || /^\d+$/.test(value)) {
						event.preventDefault();
						this.setAllSelected(false);
						const up = event.key === 'ArrowUp';
						input.value = value === '' || value === '*' ? String(up ? field.minimum : field.maximum)
							: (up ? Number(value) >= field.maximum : Number(value) <= field.minimum) ? '*'
								: String(Number(value) + (up ? 1 : -1));
					}
				}
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'paste', event => {
				const text = event.clipboardData?.getData('text/plain').trim() ?? '';
				const pasted = text.split(/\s+/);
				if (pasted.length < 2) {
					return;
				}
				event.preventDefault();
				const start = this.allSelected ? 0 : index;
				this.setAllSelected(false);
				// Keep overflow visible and invalid rather than silently discarding pasted fields.
				this.updating = true;
				for (let target = start; target < this.inputs.length; target++) {
					this.inputs[target].value = target === this.inputs.length - 1
						? pasted.slice(target - start).join(' ')
						: pasted[target - start] ?? '';
				}
				this.updating = false;
				this.changed();
			}));
			for (const type of ['copy', 'cut'] as const) {
				this._register(DOM.addDisposableListener(input.inputElement, type, event => {
					if (this.allSelected) {
						event.preventDefault();
						event.clipboardData?.setData('text/plain', this.value);
						if (type === 'cut') {
							this.clear();
						}
					}
				}));
			}
		}
		this.showTimeZone();
		this.validate();
	}

	get value(): string {
		const parts = this.inputs.map(input => input.value.trim());
		return parts.every(part => !part) ? '' : parts.map(part => part || '*').join(' ');
	}

	private clear(): void {
		this.setAllSelected(false);
		this.updating = true;
		for (const input of this.inputs) {
			input.value = '';
		}
		this.updating = false;
		this.changed();
	}

	private setAllSelected(selected: boolean): void {
		this.allSelected = selected;
		this.group.classList.toggle('all-selected', selected);
	}

	private showTimeZone(): void {
		this.hint.textContent = localize('cron.timeZone', "Blank parts mean *. Evaluated in {0}.", this.timeZone);
	}

	private changed(): void {
		this.validate();
		this._onDidChange.fire(this.value);
	}

	private validate(): void {
		const error = getAutomationCronValidationError(this.value, this.timeZone);
		this.error.textContent = error ?? '';
		DOM.setVisibility(!!error, this.error);
		this.group.classList.toggle('invalid', !!error);
		for (const input of this.inputs) {
			input.inputElement.setAttribute('aria-invalid', String(!!error));
		}
	}
}
