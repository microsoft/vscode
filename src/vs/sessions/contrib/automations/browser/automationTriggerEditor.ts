/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectBoxOptions, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IQuickInputService, IQuickTreeItem } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAutomationCloudTrigger } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationTriggerCatalog } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { automationTriggerChoices, automationTriggerFamily, AutomationTriggerFamily, automationTriggerSummary, canEditAutomationTriggers, IAutomationTriggerChoice, normalizeAutomationTriggerField, selectAutomationTriggerEvents, validateAutomationTriggerFields } from '../../../../workbench/contrib/chat/common/automations/automationTriggers.js';

export interface IAutomationTriggerFormState {
	cloudTrigger?: IAutomationCloudTrigger;
	initialActorWritePermission?: boolean;
	triggerError?: string;
	triggerReadOnly?: boolean;
}

export class AutomationTriggerEditor extends Disposable {
	private readonly controls = this._register(new DisposableStore());
	private catalog: AutomationTriggerCatalog | undefined;
	private choices: readonly IAutomationTriggerChoice[] = [];
	private cloud = false;
	private eventSelector: SelectBox | undefined;
	private eventsButton: Button | undefined;
	private readonly eventPicker = this._register(new MutableDisposable<DisposableStore>());

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
		@IQuickInputService private readonly quickInputService: IQuickInputService,
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

	get families(): readonly AutomationTriggerFamily[] {
		return [...new Set(this.choices.map(choice => choice.family))];
	}

	selectFamily(family: AutomationTriggerFamily | undefined): void {
		const currentFamily = this.state.cloudTrigger ? automationTriggerFamily(this.state.cloudTrigger.triggers) : undefined;
		if (currentFamily === family) {
			return;
		}
		const choice = this.choices.find(choice => choice.family === family);
		this.state.cloudTrigger = choice ? {
			triggers: { [choice.name]: { types: [choice.type] } },
			requireActorWritePermission: this.state.cloudTrigger?.requireActorWritePermission ?? this.initial?.requireActorWritePermission ?? this.state.initialActorWritePermission ?? false,
		} : undefined;
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
		const selected = this.state.cloudTrigger;
		this.state.triggerReadOnly = this.cloud && ((!!this.initial && !canEditAutomationTriggers(this.initial.triggers, this.choices))
			|| (!!selected && Object.entries(selected.triggers).some(([name, trigger]) => !trigger.types?.length
				|| trigger.types.some(type => !this.choices.some(choice => choice.name === name && choice.type === type)))));
		if (this.state.triggerReadOnly && !this.initial) {
			this.state.triggerError = localize('automation.trigger.unavailable', "The selected triggers are unavailable. Retry loading the trigger catalog before saving.");
		}
		if (!this.cloud) {
			this.changed();
			return;
		}
		if (this.state.triggerReadOnly) {
			DOM.append(this.row(localize('automation.trigger.label', "Trigger")), DOM.$('span', undefined,
				automationTriggerSummary(selected?.triggers ?? this.initial!.triggers) ?? localize('automation.trigger.custom', "Custom trigger")));
			DOM.append(this.container, DOM.$('p', undefined, localize('automation.trigger.readOnly', "These triggers cannot be edited here. Other changes keep them unchanged.")));
			if (this.externalResource) {
				this.controls.add(this.instantiationService.createInstance(Link, this.container, { label: localize('automation.trigger.open', "Open on GitHub"), href: this.externalResource.toString() }, {}));
			}
		} else {
			const family = this.state.cloudTrigger ? automationTriggerFamily(this.state.cloudTrigger.triggers) : undefined;
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
		if (choices[0].family === 'pullRequest') {
			const button = this.controls.add(new Button(this.row(localize('automation.trigger.event', "Event")), { ...defaultButtonStyles, secondary: true }));
			this.eventsButton = button;
			button.label = automationTriggerSummary(this.state.cloudTrigger!.triggers) ?? '';
			this.controls.add(button.onDidClick(() => this.pickEvents(choices)));
		} else {
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
		}
		const rendered = new Set<string>();
		for (const choice of choices.filter(choice => this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type))) {
			if (!rendered.has(choice.name)) {
				rendered.add(choice.name);
				if (choices[0].family === 'pullRequest' && choice.fields.length) {
					DOM.append(this.container, DOM.$('span.automation-form-label', undefined, choice.label));
				}
				this.renderFields(choice);
			}
		}
		this.validate();
	}

	private pickEvents(choices: readonly IAutomationTriggerChoice[]): void {
		const store = new DisposableStore();
		this.eventPicker.value = store;
		let disposing = false;
		store.add(toDisposable(() => { disposing = true; }));
		const picker = store.add(this.quickInputService.createQuickTree<IQuickTreeItem>());
		picker.title = localize('automation.trigger.selectEvents', "Pull Request Events");
		picker.placeholder = localize('automation.trigger.selectEventsPlaceholder', "Select at least one event");
		picker.sortByLabel = false;
		const items = () => choices.map((choice, index) => ({
			id: String(index), label: choice.label, checked: this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type) ?? false,
		}));
		picker.setItemTree(items());
		store.add(picker.onDidChangeCheckedLeafItems(selected => {
			if (!selected.length) {
				picker.setItemTree(items());
				return;
			}
			this.state.cloudTrigger = { ...this.state.cloudTrigger!, triggers: selectAutomationTriggerEvents(this.state.cloudTrigger!.triggers, selected.map(item => choices[Number(item.id)])) };
			this.render();
		}));
		store.add(picker.onDidAccept(() => picker.hide()));
		store.add(picker.onDidHide(() => {
			if (disposing) {
				return;
			}
			this.eventPicker.clear();
			this.eventsButton?.focus();
		}));
		picker.show();
	}

	private renderFields(choice: IAutomationTriggerChoice): void {
		for (const field of choice.fields) {
			const container = this.row(field.required ? localize('automation.trigger.requiredLabel', "{0} (required)", field.label) : field.label);
			if (field.name === 'paths') {
				DOM.append(this.container, DOM.$('span', undefined, localize('automation.trigger.pathsHelp', "Match changed files with gitignore-style patterns, separated by commas.")));
			}
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
