/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
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
	private readonly fieldControls = this._register(new DisposableStore());
	private readonly popup = this._register(new MutableDisposable());
	private catalog: AutomationTriggerCatalog | undefined;
	private choices: readonly IAutomationTriggerChoice[] = [];
	private cloud = false;
	private eventSelector: SelectBox | undefined;
	private eventsButton: Button | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly eventContainer: HTMLElement,
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
		const row = DOM.append(this.fieldsContainer, DOM.$('.automation-form-row'));
		DOM.append(row, DOM.$('span.automation-form-label', undefined, label));
		return DOM.append(row, DOM.$('.automation-form-input-host'));
	}

	private render(): void {
		this.popup.clear();
		this.controls.clear();
		this.fieldControls.clear();
		DOM.clearNode(this.container);
		DOM.clearNode(this.eventContainer);
		DOM.clearNode(this.fieldsContainer);
		this.eventContainer.style.display = 'none';
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
			const button = this.controls.add(new Button(host, { ...unthemedButtonStyles }));
			this.eventsButton = button;
			button.element.classList.add('automation-event-select');
			button.element.setAttribute('role', 'combobox');
			button.element.setAttribute('aria-haspopup', 'dialog');
			button.element.setAttribute('aria-expanded', 'false');
			this.updateEventLabel();
			this.controls.add(this.hoverService.setupDelayedHover(button.element, () => ({
				content: automationTriggerSummary(this.state.cloudTrigger!.triggers) ?? '',
			})));
			this.controls.add(button.onDidClick(() => this.pickEvents(choices)));
			this.controls.add(DOM.addDisposableListener(button.element, 'keydown', (event: KeyboardEvent) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					DOM.EventHelper.stop(event, true);
					this.pickEvents(choices);
				}
			}));
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
		this.eventsButton.element.setAttribute('aria-label', localize('automation.trigger.selectedEvents', "Event: {0}", summary));
		DOM.reset(this.eventsButton.element, DOM.$('span.automation-event-select-label', undefined, summary), renderIcon(Codicon.chevronDown));
	}

	private renderSelectedFields(choices: readonly IAutomationTriggerChoice[]): void {
		this.fieldControls.clear();
		DOM.clearNode(this.fieldsContainer);
		const rendered = new Set<string>();
		for (const choice of choices.filter(choice => this.state.cloudTrigger?.triggers[choice.name]?.types?.includes(choice.type))) {
			if (!rendered.has(choice.name)) {
				rendered.add(choice.name);
				if (choices[0].family === 'pullRequest' && choice.fields.length) {
					DOM.append(this.fieldsContainer, DOM.$('span.automation-form-label', undefined, choice.label));
				}
				this.renderFields(choice);
			}
		}
		this.renderActorPermission();
		this.validate();
	}

	private pickEvents(choices: readonly IAutomationTriggerChoice[]): void {
		const button = this.eventsButton!;
		if (button.element.getAttribute('aria-expanded') === 'true') {
			return;
		}
		const checks: Checkbox[] = [];
		let list: HTMLElement | undefined;
		button.element.setAttribute('aria-expanded', 'true');
		const popup = this.contextViewService.showContextView({
			getAnchor: () => button.element,
			anchorPosition: this.selectOptions.anchorPosition,
			render: container => {
				const store = new DisposableStore();
				const renderedList = list = DOM.append(container, DOM.$('.automation-event-options', { role: 'dialog', 'aria-label': localize('automation.trigger.selectEvents', "Pull Request Events") }));
				renderedList.style.minWidth = `${button.element.getBoundingClientRect().width}px`;
				for (const choice of choices) {
					const checked = this.state.cloudTrigger!.triggers[choice.name]?.types?.includes(choice.type) ?? false;
					const row = DOM.append(renderedList, DOM.$('label.automation-event-option'));
					const checkbox = store.add(new Checkbox(choice.label, checked, defaultCheckboxStyles));
					checks.push(checkbox);
					DOM.append(row, checkbox.domNode);
					DOM.append(row, DOM.$('span', undefined, choice.label));
					store.add(checkbox.onChange(() => {
						if (!checks.some(check => check.checked)) {
							checkbox.checked = true;
							status(localize('automation.trigger.keepEvent', "At least one event must remain selected."));
							return;
						}
						this.state.cloudTrigger = { ...this.state.cloudTrigger!, triggers: selectAutomationTriggerEvents(this.state.cloudTrigger!.triggers, choices.filter((_, index) => checks[index].checked)) };
						this.updateEventLabel();
						this.renderSelectedFields(choices);
						this.changed();
					}));
				}
				store.add(DOM.addDisposableListener(renderedList, 'keydown', (event: KeyboardEvent) => {
					const index = checks.findIndex(check => check.domNode === DOM.getActiveElement());
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
						DOM.EventHelper.stop(event, true);
						const next = event.key === 'Home' ? 0 : event.key === 'End' ? checks.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + checks.length) % checks.length;
						checks[next].focus();
					} else if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'Tab') {
						DOM.EventHelper.stop(event, true);
						popup.close();
						button.focus();
					}
				}));
				store.add(DOM.addDisposableListener(renderedList, 'focusout', event => {
					const target = event.relatedTarget;
					if (target instanceof Node && !renderedList.contains(target)) {
						popup.close();
					}
				}));
				return store;
			},
			onDOMEvent: event => {
				const target = event.target;
				if (event.type === DOM.EventType.MOUSE_DOWN && target instanceof Node && !list?.contains(target) && !button.element.contains(target)) {
					popup.close();
				}
			},
			focus: () => checks[0]?.focus(),
			onHide: () => button.element.setAttribute('aria-expanded', 'false'),
		});
		this.popup.value = toDisposable(() => popup.close());
	}

	private renderFields(choice: IAutomationTriggerChoice): void {
		for (const field of choice.fields) {
			const container = this.row(field.required ? localize('automation.trigger.requiredLabel', "{0} (required)", field.label) : field.label);
			if (field.name === 'paths') {
				DOM.append(this.fieldsContainer, DOM.$('span', undefined, localize('automation.trigger.pathsHelp', "Match changed files with gitignore-style patterns, separated by commas.")));
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
					const checkbox = this.fieldControls.add(new Checkbox(option, Array.isArray(value) && value.includes(option), defaultCheckboxStyles));
					const label = DOM.append(container, DOM.$('label'));
					DOM.append(label, checkbox.domNode);
					DOM.append(label, DOM.$('span', undefined, option));
					this.fieldControls.add(checkbox.onChange(() => {
						const current = this.state.cloudTrigger!.triggers[choice.name][field.name];
						const values = Array.isArray(current) ? current.filter((value): value is string => typeof value === 'string') : [];
						update(checkbox.checked ? [...values, option] : values.filter(value => value !== option));
					}));
				}
			} else {
				const input = this.fieldControls.add(new InputBox(container, this.contextViewService, {
					inputBoxStyles: defaultInputBoxStyles, ariaLabel: field.label,
					placeholder: field.name === 'query' ? localize('automation.trigger.queryExample', "e.g. label:bug is:open") : field.scalar ? undefined : localize('automation.trigger.commaSeparated', "Comma-separated values"),
				}));
				input.value = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : '';
				this.fieldControls.add(input.onDidChange(update));
			}
		}
	}

	private renderActorPermission(): void {
		const label = localize('automation.trigger.actor', "Require write access to trigger");
		const container = this.row(label);
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
