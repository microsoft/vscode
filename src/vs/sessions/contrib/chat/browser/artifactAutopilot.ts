/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveElement, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../base/browser/ui/button/button.js';
import { Switch } from '../../../../base/browser/ui/toggle/switch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ArtifactDetailsCard, placeArtifactChildren } from './artifactDetailsCard.js';
import { IArtifactAutopilotGroupViewData, IArtifactAutopilotRuleViewData } from './artifactDetailsView.js';
import './media/artifactAutopilot.css';

class ArtifactAutopilotRule extends Disposable {
	readonly element = $('.artifact-autopilot-rule');
	private readonly row = append(this.element, $('.artifact-autopilot-rule-row'));
	private readonly toggle: Switch;
	private readonly label = append(this.row, $<HTMLLabelElement>('label.artifact-autopilot-rule-label'));
	private readonly picker: ButtonWithIcon | undefined;
	private data: IArtifactAutopilotRuleViewData;

	constructor(data: IArtifactAutopilotRuleViewData, hoverService: IHoverService) {
		super();
		this.data = data;
		this.toggle = this._register(new Switch({ ariaLabel: data.label }));
		this.row.insertBefore(this.toggle.domNode, this.label);
		this.toggle.domNode.id = generateUuid();
		this.label.htmlFor = this.toggle.domNode.id;
		this._register(this.toggle.onChange(value => this.execute(this.toggle.domNode, () => this.data.setEnabled(value))));
		if (data.policy !== undefined) {
			this.picker = this._register(new ButtonWithIcon(this.row, { ...defaultButtonStyles, secondary: true, small: true }));
			this.picker.icon = Codicon.chevronDown;
			this.picker.iconElement.classList.add('artifact-autopilot-policy-chevron');
			this.picker.iconElement.setAttribute('aria-hidden', 'true');
			this.picker.element.classList.add('artifact-autopilot-policy');
			this.picker.element.setAttribute('aria-haspopup', 'listbox');
			this._register(this.picker.onDidClick(() => this.execute(this.picker!.element, () => this.data.policy!.choose())));
		}
		this._register(hoverService.setupDelayedHover(this.label, () => ({ content: `${this.data.label}\n${this.data.description}` })));
		this._register(toDisposable(() => this.element.remove()));
		this.update(data);
	}

	update(data: IArtifactAutopilotRuleViewData): void {
		const hadFocus = isAncestorOfActiveElement(this.element);
		const focusedPicker = getActiveElement() === this.picker?.element;
		this.data = data;
		this.label.textContent = data.label;
		this.label.tabIndex = data.disabled && !data.pending ? 0 : -1;
		this.label.setAttribute('aria-description', data.description);
		this.toggle.checked = data.checked;
		this.toggle.disabled = data.disabled;
		this.toggle.setAriaLabel(data.label, data.description);
		this.toggle.domNode.setAttribute('aria-description', data.description);
		if (this.picker) {
			this.picker.label = data.policy?.label ?? '';
			this.picker.enabled = !data.disabled;
			this.picker.element.setAttribute('aria-label', localize('artifactEnumOption', "{0}: {1}", data.label, data.policy?.label ?? ''));
			this.picker.element.setAttribute('aria-description', data.description);
		}
		if (hadFocus) {
			(focusedPicker && this.picker?.enabled ? this.picker.element : this.tabbableElements[0])?.focus({ preventScroll: true });
		}
	}

	private execute(control: HTMLElement, operation: () => Promise<void>): void {
		const hadFocus = getActiveElement() === control;
		const promise = operation();
		const interim = getActiveElement();
		void promise.finally(() => {
			if (!this._store.isDisposed && hadFocus && getActiveElement() === interim) {
				(this.tabbableElements.includes(control) ? control : this.tabbableElements[0])?.focus({ preventScroll: true });
			}
		});
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.label.tabIndex === 0 ? [this.label] : [
			...this.toggle.disabled ? [] : [this.toggle.domNode],
			...this.picker?.enabled ? [this.picker.element] : [],
		];
	}
}

class ArtifactAutopilotGroup extends ArtifactDetailsCard {
	private readonly toggle: Switch;
	private readonly summary = $('span.artifact-card-summary.artifact-autopilot-summary');
	private readonly rules = this._register(new DisposableMap<string, ArtifactAutopilotRule>());
	private orderedRules: readonly ArtifactAutopilotRule[] = [];
	private data: IArtifactAutopilotGroupViewData;

	constructor(data: IArtifactAutopilotGroupViewData, hoverService: IHoverService) {
		super(expanded => this.data.setExpanded(expanded));
		this.data = data;
		this.element.classList.add('artifact-autopilot-group');
		this.toggle = this._register(new Switch({ ariaLabel: data.toggleLabel }));
		append(this.heading, this.toggle.domNode, this.summary);
		this._register(hoverService.setupDelayedHover(this.toggle.domNode, () => ({ content: this.data.description })));
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
		this.toggle.setAriaLabel(data.toggleLabel);
		this.toggle.domNode.setAttribute('aria-description', data.summary);
		this.summary.textContent = data.summary;
		const ids = new Set(data.rules.map(rule => `${rule.id}:${rule.policy !== undefined}`));
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
			const id = `${data.id}:${data.policy !== undefined}`;
			let rule = this.rules.get(id);
			if (!rule) {
				rule = new ArtifactAutopilotRule(data, hoverService);
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
