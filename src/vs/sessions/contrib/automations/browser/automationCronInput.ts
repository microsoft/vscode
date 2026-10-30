/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getAutomationCronValidationError } from '../../../../workbench/contrib/chat/common/automations/schedule.js';

const fields = [
	{ label: localize('cron.minute', "Minute"), caption: localize('cron.min', "min"), minimum: 0, maximum: 59, hint: localize('cron.minuteHint', "Every minute * or from 0 to 59") },
	{ label: localize('cron.hour', "Hour"), caption: localize('cron.hourCaption', "hour"), minimum: 0, maximum: 23, hint: localize('cron.hourHint', "Every hour * or from 0 to 23") },
	{ label: localize('cron.day', "Day of month"), caption: localize('cron.dayCaption', "day"), minimum: 1, maximum: 31, hint: localize('cron.dayHint', "Every day * or from 1 to 31") },
	{ label: localize('cron.month', "Month"), caption: localize('cron.monthCaption', "month"), minimum: 1, maximum: 12, hint: localize('cron.monthHint', "Every month * or from January (1) to December (12)") },
	{ label: localize('cron.weekday', "Day of week"), caption: localize('cron.weekdayCaption', "weekday"), minimum: 0, maximum: 7, hint: localize('cron.weekdayHint', "Every day of week * or from Monday (1) to Sunday (7 and 0)") },
];

function isContextMenuTarget(target: EventTarget | null): boolean {
	return DOM.isHTMLElement(target) && !!target.closest('.monaco-menu-container');
}

/** A five-part editor for the host's cron expression, with one shared validation border. */
export class AutomationCronInput extends Disposable {
	private readonly inputs: InputBox[] = [];
	private readonly group: HTMLElement;
	private readonly hint: HTMLElement;
	private readonly error: HTMLElement;
	private allSelected = false;
	private updating = false;
	private pastedValue: string | undefined;
	private readonly hover = this._register(new MutableDisposable<IHoverWidget>());
	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		container: HTMLElement,
		expression: string,
		private readonly timeZone: string,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		const label = DOM.append(container, DOM.$('.automation-cron-label'));
		DOM.append(label, DOM.$('span.automation-form-label', undefined, localize('cron.expression', "CRON expression")));
		this.hint = DOM.append(label, DOM.$('span.automation-cron-hint', { id: 'automation-cron-hint' }));
		this.hint.textContent = timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone
			? localize('cron.localTime', "Evaluated in local time.")
			: localize('cron.timeZone', "Evaluated in {0}.", timeZone);
		this.group = DOM.append(container, DOM.$('.automation-cron-segments', { role: 'group', 'aria-label': localize('cron.expression', "CRON expression") }));
		this._register(DOM.addDisposableListener(DOM.getWindow(this.group).document, 'focusin', (event: FocusEvent) => {
			if (this.allSelected && DOM.isHTMLElement(event.target) && !this.group.contains(event.target) && !isContextMenuTarget(event.target)) {
				this.setAllSelected(false);
			}
		}));
		this.error = DOM.append(container, DOM.$('.automation-cron-hint.automation-form-cron-error', { id: 'automation-cron-error', 'aria-live': 'polite' }));
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
			const fieldHint = DOM.append(segment, DOM.$('span.automation-visually-hidden', { id: `automation-cron-field-${index}-hint` }, field.hint));
			input.inputElement.setAttribute('aria-describedby', `${fieldHint.id} ${this.hint.id} ${this.error.id}`);
			this.inputs.push(input);
			DOM.append(segment, DOM.$('span.automation-cron-caption', { 'aria-hidden': 'true' }, field.caption));
			this._register(DOM.addDisposableListener(input.inputElement, 'focus', () => {
				this.hover.clear();
				this.hover.value = hoverService.showInstantHover({
					content: field.hint,
					target: input.inputElement,
					position: { hoverPosition: HoverPosition.ABOVE },
					appearance: { showPointer: true },
					persistence: { sticky: true },
				}, false);
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'blur', (event: FocusEvent) => {
				this.hover.clear();
				if (!isContextMenuTarget(event.relatedTarget)) {
					this.setAllSelected(false);
				}
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'mousedown', (event: MouseEvent) => {
				if (event.button !== 2 && !(isMacintosh && event.button === 0 && event.ctrlKey)) {
					this.setAllSelected(false);
				}
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'beforeinput', (event: InputEvent) => {
				if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
					this.setAllSelected(false);
				}
				if (!event.isComposing && event.data && /[^a-zA-Z0-9*,/-]/.test(event.data)) {
					event.preventDefault();
				}
			}));
			this._register(input.onDidChange(() => {
				if (this.updating || this.acceptExpression(index, input.value)) {
					return;
				}
				this.pastedValue = undefined;
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
				if (event.key === 'Escape' && this.dismissHover()) {
					event.preventDefault();
					event.stopPropagation();
				} else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
					event.preventDefault();
					input.select();
					this.setAllSelected(true);
				} else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
					this.setAllSelected(false);
				} else if (this.allSelected && (event.key === 'Backspace' || event.key === 'Delete')) {
					event.preventDefault();
					this.clear();
				} else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					this.setAllSelected(false);
					const value = input.value.trim();
					if (value === '' || value === '*' || /^\d+$/.test(value)) {
						event.preventDefault();
						const up = event.key === 'ArrowUp';
						input.value = value === '' || value === '*' ? String(up ? field.minimum : field.maximum)
							: (up ? Number(value) >= field.maximum : Number(value) <= field.minimum) ? '*'
								: String(Number(value) + (up ? 1 : -1));
					}
				}
			}));
			this._register(DOM.addDisposableListener(input.inputElement, 'paste', event => {
				const text = event.clipboardData?.getData('text/plain');
				if (!text) {
					return;
				}
				const element = input.inputElement;
				const value = input.value.slice(0, element.selectionStart ?? 0) + text + input.value.slice(element.selectionEnd ?? 0);
				if (this.acceptExpression(index, value)) {
					event.preventDefault();
				}
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
		this.validate();
	}

	get value(): string {
		if (this.pastedValue !== undefined) {
			return this.pastedValue;
		}
		const parts = this.inputs.map(input => input.value.trim());
		return parts.every(part => !part) ? '' : parts.map(part => part || '*').join(' ');
	}

	dismissHover(): boolean {
		if (this.hover.value?.isDisposed !== false) {
			return false;
		}
		this.hover.clear();
		return true;
	}

	private acceptExpression(index: number, value: string): boolean {
		const text = value.trim();
		const pasted = text.split(/\s+/);
		const isMacro = text.startsWith('@');
		if (pasted.length < 2 && !isMacro) {
			return false;
		}
		const wholeExpression = this.allSelected || index === 0 || pasted.length >= fields.length || isMacro;
		const start = wholeExpression ? 0 : index;
		const end = wholeExpression ? this.inputs.length : Math.min(this.inputs.length, start + pasted.length);
		this.setAllSelected(false);
		// Keep overflow visible and invalid rather than silently discarding pasted fields.
		this.updating = true;
		for (let target = start; target < end; target++) {
			this.inputs[target].value = target === this.inputs.length - 1
				? pasted.slice(target - start).join(' ')
				: pasted[target - start] ?? '';
		}
		this.updating = false;
		this.pastedValue = wholeExpression && pasted.length !== fields.length ? text : undefined;
		this.changed();
		return true;
	}

	private clear(): void {
		this.pastedValue = undefined;
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
