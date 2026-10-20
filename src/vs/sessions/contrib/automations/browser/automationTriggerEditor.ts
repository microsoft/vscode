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
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IQuickInputService, IQuickTreeItem } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAutomationCloudTrigger } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationTriggerCatalog } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { automationTriggerChoices, automationTriggerFamily, automationTriggerFieldGroups, AutomationTriggerFamily, automationTriggerSummary, canEditAutomationTriggers, IAutomationTriggerChoice, IAutomationTriggerFieldGroup, normalizeAutomationTriggerField, selectAutomationTriggerEvents, validateAutomationTriggerFields } from '../../../../workbench/contrib/chat/common/automations/automationTriggers.js';

export interface IAutomationTriggerFormState {
	cloudTrigger?: IAutomationCloudTrigger;
	initialActorWritePermission?: boolean;
	triggerError?: string;
	triggerReadOnly?: boolean;
}

export class AutomationTriggerEditor extends Disposable {
	private readonly controls = this._register(new DisposableStore());
	private readonly requiredFieldControls = this._register(new DisposableStore());
	private readonly fieldControls = this._register(new DisposableStore());
	private readonly eventPicker = this._register(new MutableDisposable<DisposableStore>());
	private catalog: AutomationTriggerCatalog | undefined;
	private choices: readonly IAutomationTriggerChoice[] = [];
	private cloud = false;
	private initialized = false;
	private eventSelector: SelectBox | undefined;
	private eventsButton: Button | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly eventContainer: HTMLElement,
		private readonly requiredFieldsContainer: HTMLElement,
		private readonly fieldsContainer: HTMLElement,
		private readonly state: IAutomationTriggerFormState,
		private readonly initial: IAutomationCloudTrigger | undefined,
		private readonly externalResource: URI | undefined,
		private readonly selectOptions: ISelectBoxOptions,
		private readonly changed: () => void,
		private readonly retry: () => void,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	update(catalog: AutomationTriggerCatalog | undefined, cloud: boolean): void {
		if (this.initialized && catalog === this.catalog && cloud === this.cloud) {
			return;
		}
		this.initialized = true;
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

	private row(container: HTMLElement, label: string): HTMLElement {
		const row = DOM.append(container, DOM.$('.automation-form-row'));
		DOM.append(row, DOM.$('span.automation-form-label', undefined, label));
		return DOM.append(row, DOM.$('.automation-form-input-host'));
	}

	private render(): void {
		this.eventPicker.clear();
		this.controls.clear();
		this.requiredFieldControls.clear();
		this.fieldControls.clear();
		DOM.clearNode(this.container);
		DOM.clearNode(this.eventContainer);
		DOM.clearNode(this.requiredFieldsContainer);
		DOM.clearNode(this.fieldsContainer);
		this.eventContainer.style.display = 'none';
		this.requiredFieldsContainer.style.display = 'none';
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
			DOM.append(this.container, DOM.$('span', undefined,
				automationTriggerSummary(selected?.triggers ?? this.initial!.triggers) ?? localize('automation.trigger.custom', "Custom trigger")));
			DOM.append(this.container, DOM.$('p', undefined, localize('automation.trigger.readOnly', "These triggers cannot be edited here. Other changes keep them unchanged.")));
			if (this.externalResource) {
				this.controls.add(this.instantiationService.createInstance(Link, this.container, { label: localize('automation.trigger.open', "Open on GitHub"), href: this.externalResource.toString() }, {}));
			}
		} else {
			const family = this.state.cloudTrigger ? automationTriggerFamily(this.state.cloudTrigger.triggers) : undefined;
			if (family) {
				this.renderEvents(this.choices.filter(choice => choice.family === family));
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
		this.eventContainer.style.display = '';
		DOM.append(this.eventContainer, DOM.$('span.automation-form-label', undefined, localize('automation.trigger.event', "Event")));
		const host = DOM.append(this.eventContainer, DOM.$('.automation-form-schedule-select-container'));
		if (choices[0].family === 'pullRequest') {
			const button = this.controls.add(new Button(host, { ...defaultButtonStyles, secondary: true }));
			this.eventsButton = button;
			button.element.classList.add('automation-event-button');
			this.updateEventLabel();
			this.controls.add(this.hoverService.setupDelayedHover(button.element, () => ({
				content: automationTriggerSummary(this.state.cloudTrigger!.triggers) ?? '',
			})));
			this.controls.add(button.onDidClick(() => this.pickEvents(choices)));
		} else {
			const selected = choices.findIndex(choice => this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type));
			const picker = this.controls.add(new SelectBox(choices.map(choice => ({ text: choice.label })), selected, this.contextViewService, defaultSelectBoxStyles, { ...this.selectOptions, ariaLabel: localize('automation.trigger.event', "Event") }));
			this.eventSelector = picker;
			picker.render(host);
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
		this.renderSelectedFields(choices);
	}

	private updateEventLabel(): void {
		if (!this.eventsButton) {
			return;
		}
		const summary = automationTriggerSummary(this.state.cloudTrigger!.triggers) ?? '';
		const count = Object.values(this.state.cloudTrigger!.triggers).reduce((total, trigger) => total + (trigger.types?.length ?? 0), 0);
		const label = count > 1 ? localize('automation.trigger.eventCount', "{0} events selected", count) : summary;
		this.eventsButton.label = label;
		this.eventsButton.element.setAttribute('aria-label', count > 1
			? localize('automation.trigger.selectedEventsCount', "Select events. {0}. Current selection: {1}", label, summary)
			: localize('automation.trigger.selectedEvents', "Select events. Current selection: {0}", summary));
	}

	private renderSelectedFields(choices: readonly IAutomationTriggerChoice[]): void {
		this.requiredFieldControls.clear();
		this.fieldControls.clear();
		DOM.clearNode(this.requiredFieldsContainer);
		DOM.clearNode(this.fieldsContainer);
		const selected = choices.filter(choice => this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type));
		for (const field of automationTriggerFieldGroups(selected)) {
			this.renderField(field, field.required ? this.requiredFieldsContainer : this.fieldsContainer, field.required ? this.requiredFieldControls : this.fieldControls);
		}
		this.requiredFieldsContainer.style.display = this.requiredFieldsContainer.childElementCount ? '' : 'none';
		this.renderActorPermission();
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
			this.updateEventLabel();
			this.renderSelectedFields(choices);
			this.changed();
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

	private renderField(field: IAutomationTriggerFieldGroup, target: HTMLElement, controls: DisposableStore): void {
		const container = this.row(target, field.label);
		const names = [...new Set(field.choices.map(choice => choice.name))];
		const value = names.map(name => this.state.cloudTrigger!.triggers[name][field.name]).find(value => value !== undefined);
		const update = (value: string | readonly string[]) => {
			const triggers = { ...this.state.cloudTrigger!.triggers };
			const normalized = normalizeAutomationTriggerField(field, value);
			for (const name of names) {
				const trigger = { ...triggers[name] };
				if (normalized === undefined) {
					delete trigger[field.name];
				} else {
					trigger[field.name] = normalized;
				}
				triggers[name] = trigger;
			}
			this.state.cloudTrigger = { ...this.state.cloudTrigger!, triggers };
			this.validate();
			this.changed();
		};
		if (field.options?.length && !field.scalar) {
			for (const option of field.options) {
				const checkbox = controls.add(new Checkbox(option, Array.isArray(value) && value.includes(option), defaultCheckboxStyles));
				const label = DOM.append(container, DOM.$('label.automation-trigger-option'));
				DOM.append(label, checkbox.domNode);
				const labelText = DOM.append(label, DOM.$('span', undefined, option));
				controls.add(DOM.addDisposableListener(labelText, DOM.EventType.CLICK, () => checkbox.domNode.click()));
				controls.add(checkbox.onChange(() => {
					const current = this.state.cloudTrigger!.triggers[names[0]][field.name];
					const values = Array.isArray(current) ? current.filter((value): value is string => typeof value === 'string') : [];
					update(checkbox.checked ? [...values, option] : values.filter(value => value !== option));
				}));
			}
		} else {
			const input = controls.add(new InputBox(container, this.contextViewService, {
				inputBoxStyles: defaultInputBoxStyles, ariaLabel: field.label,
				placeholder: field.name === 'query'
					? localize('automation.trigger.queryExample', "e.g. label:bug is:open")
					: field.name === 'paths'
						? localize('automation.trigger.pathsPlaceholder', "Match changed files with gitignore-style patterns, separated by commas")
						: field.scalar ? undefined : localize('automation.trigger.commaSeparated', "Comma-separated values"),
			}));
			input.value = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : '';
			controls.add(input.onDidChange(update));
		}
	}

	private renderActorPermission(): void {
		const label = localize('automation.trigger.actor', "Require write access to trigger");
		const container = this.row(this.fieldsContainer, label);
		const checkbox = this.fieldControls.add(new Checkbox(label, this.state.cloudTrigger?.requireActorWritePermission ?? false, defaultCheckboxStyles));
		DOM.append(container, checkbox.domNode);
		DOM.append(container, DOM.$('span', undefined, localize('automation.trigger.actorDescription', "Only people with write access to the repository can trigger this automation.")));
		this.fieldControls.add(checkbox.onChange(() => {
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
