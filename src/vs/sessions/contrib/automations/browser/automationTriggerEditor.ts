/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectBoxOptions, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAutomationCloudTrigger } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationTriggerCatalog } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { automationTriggerChoices, automationTriggerFamily, automationTriggerSummary, canEditAutomationTriggers, IAutomationTriggerChoice, normalizeAutomationTriggerField, validateAutomationTriggerFields } from '../../../../workbench/contrib/chat/common/automations/automationTriggers.js';

export interface IAutomationTriggerFormState {
	cloudTrigger?: IAutomationCloudTrigger;
	triggerError?: string;
	triggerReadOnly?: boolean;
}

export class AutomationTriggerEditor extends Disposable {
	private readonly controls = this._register(new DisposableStore());
	private catalog: AutomationTriggerCatalog | undefined;
	private choices: readonly IAutomationTriggerChoice[] = [];
	private cloud = false;
	private familySelector: SelectBox | undefined;
	private eventSelector: SelectBox | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly state: IAutomationTriggerFormState,
		private readonly initial: IAutomationCloudTrigger | undefined,
		private readonly externalResource: URI | undefined,
		private readonly selectOptions: ISelectBoxOptions,
		private readonly changed: () => void,
		private readonly retry: () => void,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	update(catalog: AutomationTriggerCatalog | undefined, cloud: boolean): void {
		if (catalog === this.catalog && cloud === this.cloud) {
			return;
		}
		this.catalog = catalog;
		this.cloud = cloud;
		this.choices = catalog?.kind === 'ready' ? automationTriggerChoices(catalog.definitions) : [];
		this.render();
	}

	private row(label: string): HTMLElement {
		const row = DOM.append(this.container, DOM.$('.automation-form-row'));
		DOM.append(row, DOM.$('span.automation-form-label', undefined, label));
		return DOM.append(row, DOM.$('.automation-form-input-host'));
	}

	private render(): void {
		this.controls.clear();
		DOM.clearNode(this.container);
		this.container.style.display = this.cloud ? '' : 'none';
		this.state.triggerError = undefined;
		this.state.triggerReadOnly = this.cloud && !!this.initial && !canEditAutomationTriggers(this.initial.triggers, this.choices);
		if (!this.cloud) {
			this.changed();
			return;
		}
		if (this.state.triggerReadOnly) {
			DOM.append(this.row(localize('automation.trigger.label', "Trigger")), DOM.$('span', undefined,
				automationTriggerSummary(this.initial!.triggers) ?? localize('automation.trigger.custom', "Custom trigger")));
			DOM.append(this.container, DOM.$('p', undefined, localize('automation.trigger.readOnly', "These triggers cannot be edited here. Other changes keep them unchanged.")));
			if (this.externalResource) {
				this.controls.add(this.instantiationService.createInstance(Link, this.container, { label: localize('automation.trigger.open', "Open on GitHub"), href: this.externalResource.toString() }, {}));
			}
		} else {
			const families = [
				{ label: localize('automation.trigger.schedule', "Schedule"), value: undefined },
				...(this.choices.some(choice => choice.family === 'issue') ? [{ label: localize('automation.trigger.issue', "Issue"), value: 'issue' as const }] : []),
			];
			const family = this.state.cloudTrigger ? automationTriggerFamily(this.state.cloudTrigger.triggers) : undefined;
			const selector = this.controls.add(new SelectBox(families.map(item => ({ text: item.label })), Math.max(0, families.findIndex(item => item.value === family)), this.contextViewService, defaultSelectBoxStyles, { ...this.selectOptions, ariaLabel: localize('automation.trigger.label', "Trigger") }));
			this.familySelector = selector;
			selector.render(this.row(localize('automation.trigger.label', "Trigger")));
			this.controls.add(selector.onDidSelect(event => {
				const choice = this.choices.find(choice => choice.family === families[event.index].value);
				if (families[event.index].value === family) {
					return;
				}
				this.state.cloudTrigger = choice ? {
					triggers: { [choice.name]: { types: [choice.type] } },
					requireActorWritePermission: this.state.cloudTrigger?.requireActorWritePermission ?? this.initial?.requireActorWritePermission ?? false,
				} : undefined;
				this.render();
				this.familySelector?.focus();
			}));
			if (family) {
				this.renderEvents(this.choices.filter(choice => choice.family === family));
				this.renderActorPermission();
			}
		}
		if (this.catalog?.kind !== 'ready') {
			DOM.append(this.container, DOM.$('p', { role: 'status' }, this.catalog?.kind === 'error' ? this.catalog.message : localize('automation.trigger.loading', "Loading available triggers…")));
			if (this.catalog?.kind === 'error') {
				const retry = this.controls.add(new Button(this.container, { ...defaultButtonStyles, secondary: true }));
				retry.label = localize('automation.trigger.retry', "Retry");
				this.controls.add(retry.onDidClick(this.retry));
			}
		}
		this.changed();
	}

	private renderEvents(choices: readonly IAutomationTriggerChoice[]): void {
		const selected = choices.findIndex(choice => this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type));
		const picker = this.controls.add(new SelectBox(choices.map(choice => ({ text: choice.label })), selected, this.contextViewService, defaultSelectBoxStyles, { ...this.selectOptions, ariaLabel: localize('automation.trigger.event', "Event") }));
		this.eventSelector = picker;
		picker.render(this.row(localize('automation.trigger.event', "Event")));
		this.controls.add(picker.onDidSelect(event => {
			const choice = choices[event.index];
			if (event.index === selected) {
				return;
			}
			this.state.cloudTrigger = { ...this.state.cloudTrigger!, triggers: { [choice.name]: { types: [choice.type] } } };
			this.render();
			this.eventSelector?.focus();
		}));
		for (const choice of choices.filter(choice => this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type))) {
			this.renderFields(choice);
		}
		this.validate();
	}

	private renderFields(choice: IAutomationTriggerChoice): void {
		for (const field of choice.fields) {
			const container = this.row(field.required ? localize('automation.trigger.requiredLabel', "{0} (required)", field.label) : field.label);
			const value = this.state.cloudTrigger!.triggers[choice.name][field.name];
			const update = (value: string | readonly string[]) => {
				const trigger = { ...this.state.cloudTrigger!.triggers[choice.name] };
				const normalized = normalizeAutomationTriggerField(field, value);
				if (normalized === undefined) {
					delete trigger[field.name];
				} else {
					trigger[field.name] = normalized;
				}
				this.state.cloudTrigger = { ...this.state.cloudTrigger!, triggers: { ...this.state.cloudTrigger!.triggers, [choice.name]: trigger } };
				this.validate();
				this.changed();
			};
			if (field.options?.length && !field.scalar) {
				for (const option of field.options) {
					const checkbox = this.controls.add(new Checkbox(option, Array.isArray(value) && value.includes(option), defaultCheckboxStyles));
					const label = DOM.append(container, DOM.$('label'));
					DOM.append(label, checkbox.domNode);
					DOM.append(label, DOM.$('span', undefined, option));
					this.controls.add(checkbox.onChange(() => {
						const current = this.state.cloudTrigger!.triggers[choice.name][field.name];
						const values = Array.isArray(current) ? current.filter((value): value is string => typeof value === 'string') : [];
						update(checkbox.checked ? [...values, option] : values.filter(value => value !== option));
					}));
				}
			} else {
				const input = this.controls.add(new InputBox(container, this.contextViewService, {
					inputBoxStyles: defaultInputBoxStyles, ariaLabel: field.label,
					placeholder: field.name === 'query' ? localize('automation.trigger.queryExample', "e.g. label:bug is:open") : field.scalar ? undefined : localize('automation.trigger.commaSeparated', "Comma-separated values"),
				}));
				input.value = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : '';
				this.controls.add(input.onDidChange(update));
			}
		}
	}

	private renderActorPermission(): void {
		const label = localize('automation.trigger.actor', "Require write access to trigger");
		const container = this.row(label);
		const checkbox = this.controls.add(new Checkbox(label, this.state.cloudTrigger?.requireActorWritePermission ?? false, defaultCheckboxStyles));
		DOM.append(container, checkbox.domNode);
		DOM.append(container, DOM.$('span', undefined, localize('automation.trigger.actorDescription', "Only people with write access to the repository can trigger this automation.")));
		this.controls.add(checkbox.onChange(() => {
			this.state.cloudTrigger = { ...this.state.cloudTrigger!, requireActorWritePermission: checkbox.checked };
			this.changed();
		}));
	}

	private validate(): void {
		this.state.triggerError = undefined;
		for (const [name, trigger] of Object.entries(this.state.cloudTrigger?.triggers ?? {})) {
			const choice = this.choices.find(choice => choice.name === name);
			if (choice) {
				this.state.triggerError ??= validateAutomationTriggerFields(choice.fields, trigger);
			}
		}
	}
}
