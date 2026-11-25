/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveElement, isAncestorOfActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { HoverStyle, IHoverLifecycleOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { equals } from '../../../../../base/common/arrays.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ArtifactDetailsCard, placeArtifactChildren } from './artifactDetailsCard.js';
import { IArtifactAutopilotChoiceViewData, IArtifactAutopilotGroupViewData, IArtifactAutopilotRuleViewData } from './artifactDetailsView.js';
import './media/artifactAutopilot.css';

/** A rule's switch, or the choices of a rule with several enabled values, one of which turns it off. */
class ArtifactAutopilotRule extends Disposable {
	readonly element = $('.artifact-autopilot-rule');
	private readonly row = append(this.element, $('.artifact-autopilot-rule-row'));
	private readonly label: HTMLElement;
	private readonly toggle: Switch | undefined;
	private readonly radio: Radio | undefined;
	private readonly choiceHovers = this._register(new DisposableStore());
	private choiceItems: readonly IArtifactAutopilotChoiceViewData[] = [];
	/** The choice the radio shows, which it selects itself before the model confirms it. */
	private choiceValue: string | undefined;
	private choicesEnabled = true;
	private data: IArtifactAutopilotRuleViewData;

	constructor(data: IArtifactAutopilotRuleViewData, private readonly hoverService: IHoverService, private readonly hoverLifecycleOptions: IHoverLifecycleOptions) {
		super();
		this.data = data;
		if (data.choices) {
			// The choices come first, where a switch would be, and are a group named by the label after them.
			// Selecting saves at once, so arrow keys only move between choices, and Enter or Space selects one.
			this.radio = this._register(new Radio({ items: [], className: 'segmented', arrowKeyBehavior: 'focus' }));
			this.radio.domNode.classList.add('artifact-autopilot-choices');
			this.row.appendChild(this.radio.domNode);
			this.label = append(this.row, $('span.artifact-autopilot-rule-label', { id: generateUuid() }));
			this.radio.domNode.setAttribute('aria-labelledby', this.label.id);
			this._register(this.radio.onDidSelect(index => {
				const choice = this.choiceItems[index];
				const element = this.radio?.optionElements[index];
				if (choice && element) {
					this.choiceValue = choice.value;
					this.execute(element, () => this.data.choices?.select(choice.value) ?? Promise.resolve());
				}
			}));
		} else {
			const label = append(this.row, $<HTMLLabelElement>('label.artifact-autopilot-rule-label'));
			this.label = label;
			this.toggle = this._register(new Switch({ ariaLabel: data.label }));
			this.row.insertBefore(this.toggle.domNode, label);
			this.toggle.domNode.id = generateUuid();
			label.htmlFor = this.toggle.domNode.id;
			this._register(hoverService.setupDelayedHover(this.toggle.domNode, () => ({ content: this.data.description, style: HoverStyle.Pointer }), hoverLifecycleOptions));
			this._register(this.toggle.onChange(value => this.execute(this.toggle!.domNode, () => this.data.setEnabled(value))));
		}
		this._register(hoverService.setupDelayedHover(this.label, () => ({ content: `${this.data.label}\n${this.data.description}`, style: HoverStyle.Pointer }), hoverLifecycleOptions));
		this._register(toDisposable(() => this.element.remove()));
		this.update(data);
	}

	update(data: IArtifactAutopilotRuleViewData): void {
		const hadFocus = isAncestorOfActiveElement(this.element);
		const focused = getActiveElement();
		this.data = data;
		this.label.textContent = data.label;
		this.label.tabIndex = data.disabled ? 0 : -1;
		this.label.setAttribute('aria-description', data.description);
		if (this.toggle) {
			this.toggle.checked = data.checked;
			this.toggle.disabled = data.disabled;
			this.toggle.setAriaLabel(data.label, data.description);
			this.toggle.domNode.setAttribute('aria-description', data.description);
		}
		if (this.radio && data.choices) {
			this.updateChoices(this.radio, data.choices, data.disabled);
			this.radio.domNode.setAttribute('aria-description', data.description);
		}
		if (hadFocus && !(isHTMLElement(focused) && this.canKeepFocus(focused))) {
			this.tabbableElements[0]?.focus({ preventScroll: true });
		}
	}

	private updateChoices(radio: Radio, choices: NonNullable<IArtifactAutopilotRuleViewData['choices']>, disabled: boolean): void {
		const index = choices.items.findIndex(choice => choice.value === choices.value);
		const active = getActiveElement();
		const focusedIndex = radio.optionElements.findIndex(element => element === active);
		const replaced = !equals(choices.items, this.choiceItems, (a, b) => a.value === b.value && a.label === b.label && a.description === b.description);
		if (replaced) {
			this.choiceItems = choices.items;
			this.choiceHovers.clear();
			radio.setItems(choices.items.map((choice, itemIndex) => ({ text: choice.label, isActive: itemIndex === index })));
			radio.optionElements.forEach((element, itemIndex) => {
				const description = choices.items[itemIndex].description;
				if (description) {
					element.setAttribute('aria-description', description);
					this.choiceHovers.add(this.hoverService.setupDelayedHover(element, { content: description, style: HoverStyle.Pointer }, this.hoverLifecycleOptions));
				}
			});
			this.choicesEnabled = true;
		} else if (index !== -1 && choices.value !== this.choiceValue) {
			// Only when it differs, so updating does not move the tab stop away from a choice reached with the arrow keys.
			radio.setActiveItem(index);
		}
		this.choiceValue = choices.value;
		if (this.choicesEnabled === disabled) {
			this.choicesEnabled = !disabled;
			radio.setEnabled(!disabled);
		}
		if (disabled) {
			// The label explains why the rule is unavailable, so it takes the choices' place in the tab order, as it does a switch's.
			for (const element of radio.optionElements) {
				element.tabIndex = -1;
			}
		} else if (!replaced && focusedIndex !== -1) {
			// Selecting another choice moves the tab stop to it, so give it back to the focused one, which Tab must still leave from.
			radio.focusItem(focusedIndex);
		}
	}

	private canKeepFocus(element: HTMLElement): boolean {
		return this.tabbableElements.includes(element) || (!this.data.disabled && !!this.radio?.optionElements.includes(element));
	}

	private execute(control: HTMLElement, operation: () => Promise<void>): void {
		const hadFocus = getActiveElement() === control;
		const promise = operation();
		const interim = getActiveElement();
		void promise.finally(() => {
			if (!this._store.isDisposed && hadFocus && getActiveElement() === interim) {
				(this.canKeepFocus(control) ? control : this.tabbableElements[0])?.focus({ preventScroll: true });
			}
		});
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.label.tabIndex === 0 ? [this.label] : [
			...this.toggle && !this.toggle.disabled ? [this.toggle.domNode] : [],
			...this.radio?.optionElements.filter(element => element.tabIndex === 0) ?? [],
		];
	}
}

class ArtifactAutopilotGroup extends ArtifactDetailsCard {
	private readonly toggle: Switch;
	/** The switch for all rules with its visible label, set apart from the disclosure that expands them. */
	private readonly toggleAll = $('.artifact-autopilot-toggle-all');
	private readonly summary = $('span.artifact-card-summary.artifact-autopilot-summary');
	private readonly rules = this._register(new DisposableMap<string, ArtifactAutopilotRule>());
	private readonly hoverLifecycleOptions = { groupId: generateUuid() };
	private orderedRules: readonly ArtifactAutopilotRule[] = [];
	private data: IArtifactAutopilotGroupViewData;

	constructor(data: IArtifactAutopilotGroupViewData, hoverService: IHoverService) {
		super(expanded => this.data.setExpanded(expanded));
		this.data = data;
		this.element.classList.add('artifact-autopilot-group');
		this.toggle = this._register(new Switch({ ariaLabel: data.toggleLabel }));
		this.toggle.domNode.id = generateUuid();
		// The switch's accessible name starts with this text, so assistive technology does not need it twice.
		const label = $<HTMLLabelElement>('label.artifact-autopilot-toggle-all-label', { 'aria-hidden': 'true' }, localize('artifactAutopilot.toggleAll', "Toggle All"));
		label.htmlFor = this.toggle.domNode.id;
		append<HTMLElement>(this.toggleAll, this.toggle.domNode, label);
		append(this.heading, this.toggleAll, this.summary);
		this.addHeadingControl(this.toggleAll);
		for (const target of [this.toggle.domNode, label]) {
			this._register(hoverService.setupDelayedHover(target, () => ({ content: this.data.description, style: HoverStyle.Pointer }), this.hoverLifecycleOptions));
		}
		this._register(this.toggle.onChange(enabled => {
			const focused = getActiveElement() === this.toggle.domNode;
			const promise = this.data.setEnabled(enabled);
			const interim = getActiveElement();
			void promise.finally(() => {
				if (!this._store.isDisposed && focused && !this.toggle.disabled && getActiveElement() === interim) {
					this.toggle.domNode.focus({ preventScroll: true });
				}
			});
		}));
		this.update(data, hoverService);
	}

	update(data: IArtifactAutopilotGroupViewData, hoverService: IHoverService): void {
		this.data = data;
		this.updateHeading(data.title, data.expanded);
		this.toggle.checked = data.checked;
		this.toggle.disabled = data.disabled;
		this.toggleAll.classList.toggle('disabled', data.disabled);
		this.toggle.setAriaLabel(data.toggleLabel);
		this.toggle.domNode.setAttribute('aria-description', data.summary);
		this.summary.textContent = data.summary;
		const ids = new Set(data.rules.map(rule => `${rule.id}:${rule.choices !== undefined}`));
		for (const id of this.rules.keys()) {
			if (!ids.has(id)) {
				const hadFocus = isAncestorOfActiveElement(this.rules.get(id)!.element);
				this.rules.deleteAndDispose(id);
				if (hadFocus) {
					this.disclosure.element.focus({ preventScroll: true });
				}
			}
		}
		this.orderedRules = data.rules.map(data => {
			const id = `${data.id}:${data.choices !== undefined}`;
			let rule = this.rules.get(id);
			if (!rule) {
				rule = new ArtifactAutopilotRule(data, hoverService, this.hoverLifecycleOptions);
				this.rules.set(id, rule);
			} else {
				rule.update(data);
			}
			return rule;
		});
		placeArtifactChildren(this.content, this.orderedRules.map(rule => rule.element));
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [this.disclosure.element, ...this.toggle.disabled ? [] : [this.toggle.domNode], ...this.content.hidden ? [] : this.orderedRules.flatMap(rule => rule.tabbableElements)];
	}
}

export class ArtifactAutopilot extends Disposable {
	readonly element = $('.artifact-autopilot');
	private readonly groups = this._register(new DisposableMap<string, ArtifactAutopilotGroup>());
	private orderedGroups: readonly ArtifactAutopilotGroup[] = [];

	constructor(private readonly hoverService: IHoverService) {
		super();
		this._register(toDisposable(() => this.element.remove()));
	}

	update(data: readonly IArtifactAutopilotGroupViewData[]): void {
		const ids = new Set(data.map(group => group.id));
		for (const id of this.groups.keys()) {
			if (!ids.has(id)) {
				const focused = isAncestorOfActiveElement(this.groups.get(id)!.element);
				this.groups.deleteAndDispose(id);
				if (focused) {
					this.element.closest<HTMLElement>('.artifact-integration-panel')?.focus({ preventScroll: true });
				}
			}
		}
		this.orderedGroups = data.map(data => {
			let group = this.groups.get(data.id);
			if (!group) {
				group = new ArtifactAutopilotGroup(data, this.hoverService);
				this.groups.set(data.id, group);
			} else {
				group.update(data, this.hoverService);
			}
			return group;
		});
		placeArtifactChildren(this.element, this.orderedGroups.map(group => group.element));
		this.element.hidden = !data.length;
	}

	focus(): void {
		const group = this.orderedGroups[0];
		if (group) {
			if (group.content.hidden) {
				group.disclosure.element.click();
			}
			group.disclosure.element.focus({ preventScroll: true });
			group.disclosure.element.scrollIntoView({ block: 'nearest' });
		}
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.orderedGroups.flatMap(group => group.tabbableElements);
	}
}
