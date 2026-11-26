/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { SequencerByKey } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignal } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactSnapshot, artifactOptionDisabledValue, IArtifactModel, isArtifactOptionEnabled } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { canEnableArtifactAutomationOption } from '../../../../../platform/artifactIntegrations/common/artifactAutomationConfiguration.js';
import { describeArtifactAutomationConsent } from '../../../../../platform/artifactIntegrations/common/artifactAutomationConsent.js';
import { ArtifactDetailsViewState, artifactViewKey, IArtifactAutopilotGroupViewData, IArtifactAutopilotRuleViewData } from './artifactDetailsView.js';

type EnumOption = Extract<ArtifactAutomationOption, { kind: 'enum' }>;

/** A value chosen in the controls that the provider has not confirmed yet. */
interface IUnconfirmedValue {
	readonly value: boolean | string;
	/**
	 * Set for another value of a rule that is on, which is not consent to turn it on: the value is saved only while the
	 * provider still has the rule on, so a rule turned off meanwhile, such as by another client, stays off.
	 */
	readonly requiresEnabled: boolean;
	/** Set once a write takes the value. */
	submitted?: boolean;
}

/** Normalizes provider rules and owns consent commands, independently of their controls. */
export class ArtifactAutopilotModel extends Disposable {
	private readonly changed = observableSignal(this);
	private readonly shown = new Set<string>();
	/**
	 * Values chosen in the controls that the provider has not confirmed yet, by integration and option. The controls show
	 * them at once, so rules can be changed in quick succession while their writes are saved one after another.
	 */
	private readonly unconfirmed = new Map<string, Map<string, IUnconfirmedValue>>();
	private readonly writes = new SequencerByKey<string>();
	readonly data: IObservable<readonly IArtifactAutopilotGroupViewData[]>;

	constructor(
		private readonly snapshot: IObservable<ArtifactSnapshot>,
		private readonly model: IArtifactModel,
		private readonly state: ArtifactDetailsViewState,
		private readonly run: (operation: () => Promise<void>) => Promise<void>,
	) {
		super();
		this.data = derived(this, reader => {
			this.changed.read(reader);
			const snapshot = this.snapshot.read(reader);
			const groups = snapshot.contributions.map(contribution => ({ contribution, options: this.options(contribution) })).filter(group => group.options.length);
			return groups.map(({ contribution, options }): IArtifactAutopilotGroupViewData => {
				const eligible = options.filter(option => isArtifactOptionEnabled(option, this.value(contribution, option)) || canEnableArtifactAutomationOption(contribution, option));
				const enabled = eligible.filter(option => isArtifactOptionEnabled(option, this.value(contribution, option))).length;
				const unavailable = options.length - eligible.length;
				return {
					id: contribution.integrationId,
					title: groups.length > 1 ? localize('artifactAutopilot.providerTitle', "{0} Autopilot", contribution.label) : localize('artifactAutopilot.title', "Autopilot"),
					expanded: state.expandedAutopilot.has(contribution.integrationId),
					checked: enabled > 0,
					disabled: !eligible.length,
					summary: unavailable ? localize('artifactAutopilot.unavailable', "{0} on, {1} unavailable", enabled, unavailable)
						: localize('artifactAutopilot.enabled', "{0} of {1} on", enabled, eligible.length),
					// Starts with the switch's visible "Toggle All" label, so the control can be found by the text shown.
					toggleLabel: groups.length > 1 ? localize('artifactAutopilot.toggleProviderRules', "Toggle All Autopilot Rules: {0}", contribution.label)
						: localize('artifactAutopilot.toggleAllRules', "Toggle All Autopilot Rules"),
					description: localize('artifactAutopilot.masterHelp', "On while any rule is on. Turn on to enable all available rules for this provider, or turn off to disable all enabled rules. Rules with several modes turn on with the mode last selected for them. Unavailable rules are not enabled."),
					rules: options.map(option => this.rule(contribution, option, snapshot)),
					setExpanded: expanded => {
						if (expanded) {
							state.expandedAutopilot.add(contribution.integrationId);
						} else {
							state.expandedAutopilot.delete(contribution.integrationId);
						}
						this.changed.trigger(undefined);
					},
					setEnabled: enabled => this.setGroup(contribution.integrationId, enabled),
				};
			});
		});
	}

	/** The option's value as the controls show it: the user's unconfirmed choice, else the provider's. */
	private value(contribution: ArtifactContributionSnapshot, option: ArtifactAutomationOption): boolean | string | undefined {
		return this.unconfirmed.get(contribution.integrationId)?.get(option.id)?.value ?? contribution.configuration.values[option.id];
	}

	private contribution(integrationId: string): ArtifactContributionSnapshot | undefined {
		return this.snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId);
	}

	private options(contribution: ArtifactContributionSnapshot): readonly ArtifactAutomationOption[] {
		return contribution.options.filter(option => {
			const id = artifactViewKey(contribution.integrationId, option.id);
			if (isArtifactOptionEnabled(option, this.value(contribution, option)) || contribution.configuration.disablements[option.id]
				|| (!contribution.authentication && contribution.view.availability.kind !== 'authenticationRequired'
					&& (option.actionIds.some(id => contribution.view.stateActions.some(action => action.id === id))
						|| contribution.view.automationAvailability.some(available => available.id === option.id && available.available && available.enablement?.enabled !== false)))) {
				this.shown.add(id);
			}
			return this.shown.has(id);
		});
	}

	/** The choice a rule with several enabled values is on with, else the one last selected for it, else its first. */
	private enabledChoice(contribution: ArtifactContributionSnapshot, option: EnumOption): EnumOption['choices'][number] | undefined {
		const current = this.value(contribution, option);
		const value = isArtifactOptionEnabled(option, current) ? current : this.state.lastChoices.get(artifactViewKey(contribution.integrationId, option.id));
		return option.choices.find(choice => choice.value === value && choice.value !== option.disabledValue)
			?? option.choices.find(choice => choice.value !== option.disabledValue);
	}

	private location(contribution: ArtifactContributionSnapshot, snapshot = this.snapshot.get()) {
		return (contribution.authority ?? snapshot.authority).location;
	}

	private rule(contribution: ArtifactContributionSnapshot, option: ArtifactAutomationOption, snapshot: ArtifactSnapshot): IArtifactAutopilotRuleViewData {
		const id = artifactViewKey(contribution.integrationId, option.id);
		const value = this.value(contribution, option);
		const checked = isArtifactOptionEnabled(option, value);
		const disabled = !checked && !canEnableArtifactAutomationOption(contribution, option);
		const available = contribution.view.automationAvailability.find(available => available.id === option.id);
		const grant = contribution.configuration.grants?.[option.id];
		const availability = contribution.view.availability;
		// Loading and refreshing are transient (a refresh follows every Autopilot change), so describing them would flicker.
		const reason = contribution.configuration.disablements[option.id]?.reason ?? available?.unavailableReason
			?? (!checked ? available?.enablement?.disabledReason : undefined)
			?? (availability.kind !== 'available' && availability.kind !== 'loading' && availability.kind !== 'stale' ? availability.reason : undefined)
			?? (disabled ? localize('artifactAutopilot.unavailableRule', "This Autopilot rule is not available in the current resource state.") : '');
		if (option.kind === 'enum' && checked && typeof value === 'string') {
			this.state.lastChoices.set(id, value);
		}
		return {
			id, label: option.label, checked, disabled,
			description: [
				// The mode a rule is on with explains what it adds, such as When Not Changed turning merging off after a repair.
				...describeArtifactAutomationConsent(contribution, option, { location: this.location(contribution, snapshot), value: checked ? value : undefined }),
				checked && grant?.kind === 'agent'
					? grant.autoApproved
						? localize('artifactAutopilot.agentAutoApprovedGrant', "Turned on by the agent (auto-approved).")
						: localize('artifactAutopilot.agentGrant', "Turned on at the agent's request after you confirmed.")
					: '',
				reason,
			].filter(Boolean).join(' '),
			choices: option.kind === 'enum' ? {
				items: option.choices,
				value: checked && typeof value === 'string' ? value : option.disabledValue,
				select: value => this.select(contribution.integrationId, option.id, value),
			} : undefined,
			setEnabled: enabled => this.setRule(contribution.integrationId, option.id, enabled),
		};
	}

	/** Runs a change from a control, then shows the current values, which are the provider's again when the change failed. */
	private change(operation: () => Promise<void>): Promise<void> {
		return this.run(async () => {
			try {
				await operation();
			} finally {
				this.changed.trigger(undefined);
			}
		});
	}

	private setRule(integrationId: string, optionId: string, enabled: boolean): Promise<void> {
		return this.change(async () => {
			const contribution = this.contribution(integrationId);
			const option = contribution?.options.find(option => option.id === optionId);
			if (this._store.isDisposed || !contribution || !option || (enabled && !canEnableArtifactAutomationOption(contribution, option))) {
				throw new Error(localize('artifactAutopilot.ruleUnavailable', "This Autopilot rule is no longer available."));
			}
			const value = option.kind === 'boolean' ? enabled : enabled ? this.enabledChoice(contribution, option)?.value : artifactOptionDisabledValue(option);
			if (value === undefined) {
				throw new Error(localize('artifactPolicyUnavailable', "No enabled mode is available for {0}.", option.label));
			}
			await this.save(integrationId, { [optionId]: value });
		});
	}

	/** Saves a choice of a rule with several enabled values, which turns it off, turns it on with that value, or changes the value it is on with. */
	private select(integrationId: string, optionId: string, value: string): Promise<void> {
		return this.change(async () => {
			const contribution = this.contribution(integrationId);
			const option = contribution?.options.find(option => option.id === optionId);
			const enabled = !!contribution && option?.kind === 'enum' && isArtifactOptionEnabled(option, this.value(contribution, option));
			const disabling = option?.kind === 'enum' && value === option.disabledValue;
			if (this._store.isDisposed || !contribution || option?.kind !== 'enum' || !option.choices.some(choice => choice.value === value)
				|| (!enabled && !disabling && !canEnableArtifactAutomationOption(contribution, option))) {
				throw new Error(localize('artifactAutopilot.ruleUnavailable', "This Autopilot rule is no longer available."));
			}
			// Another value for a rule that is on keeps it on but does not turn it on again, unless it joins the user's own enablement that has not been sent yet.
			const pending = this.unconfirmed.get(integrationId)?.get(optionId);
			const requiresEnabled = enabled && !disabling && (pending && !pending.submitted ? pending.requiresEnabled : true);
			await this.save(integrationId, { [optionId]: value }, requiresEnabled);
		});
	}

	private setGroup(integrationId: string, enabled: boolean): Promise<void> {
		return this.change(async () => {
			const contribution = this.contribution(integrationId);
			if (this._store.isDisposed || !contribution) {
				throw new Error(localize('artifactAutopilot.providerUnavailable', "This Autopilot provider is no longer available."));
			}
			const values: Record<string, boolean | string> = {};
			for (const option of this.options(contribution)) {
				if (isArtifactOptionEnabled(option, this.value(contribution, option)) === enabled || (enabled && !canEnableArtifactAutomationOption(contribution, option))) {
					continue;
				}
				const choice = option.kind === 'enum' ? this.enabledChoice(contribution, option) : undefined;
				if (enabled && option.kind === 'enum' && !choice) {
					throw new Error(localize('artifactPolicyUnavailable', "No enabled mode is available for {0}.", option.label));
				}
				values[option.id] = enabled ? choice?.value ?? true : artifactOptionDisabledValue(option);
			}
			// Save without awaiting user input first: any outside click, such as in a dialog, closes the details panel and disposes this model.
			await this.save(integrationId, values);
		});
	}

	/**
	 * Shows the values at once and writes them after the integration's earlier writes, each against the revision the
	 * previous one produced. Values changed while a write is in flight are combined into the next write.
	 */
	private async save(integrationId: string, values: Readonly<Record<string, boolean | string>>, requiresEnabled = false): Promise<void> {
		if (!Object.keys(values).length) {
			return;
		}
		let unconfirmed = this.unconfirmed.get(integrationId);
		if (!unconfirmed) {
			unconfirmed = new Map();
			this.unconfirmed.set(integrationId, unconfirmed);
		}
		for (const [optionId, value] of Object.entries(values)) {
			unconfirmed.set(optionId, { value, requiresEnabled });
		}
		this.changed.trigger(undefined);
		await this.writes.queue(integrationId, () => this.write(integrationId));
	}

	private async write(integrationId: string): Promise<void> {
		const unconfirmed = this.unconfirmed.get(integrationId);
		if (!unconfirmed) {
			return;
		}
		const submitted = new Map(unconfirmed);
		for (const entry of submitted.values()) {
			entry.submitted = true;
		}
		try {
			const contribution = this.contribution(integrationId);
			if (!contribution) {
				throw new Error(localize('artifactAutopilot.providerUnavailable', "This Autopilot provider is no longer available."));
			}
			// Checked against the state written to, whose revision rejects the write if the rules change before it applies.
			const values: Record<string, boolean | string> = {};
			const turnedOff: string[] = [];
			for (const [optionId, entry] of submitted) {
				const option = contribution.options.find(option => option.id === optionId);
				if (entry.requiresEnabled && (!option || !isArtifactOptionEnabled(option, contribution.configuration.values[optionId]))) {
					if (typeof entry.value === 'string') {
						this.state.lastChoices.set(artifactViewKey(integrationId, optionId), entry.value);
					}
					turnedOff.push(option?.label ?? optionId);
				} else if (contribution.configuration.values[optionId] !== entry.value) {
					values[optionId] = entry.value;
				}
			}
			const changed = Object.keys(values);
			if (changed.length) {
				await this.model.configure(integrationId, contribution.configuration.revision, values);
				const option = changed.length === 1 ? contribution.options.find(option => option.id === changed[0]) : undefined;
				status(option ? localize('artifactAutomationSaved', "Autopilot rule updated: {0}", option.label) : localize('artifactAutopilot.saved', "Artifact Autopilot updated."));
			}
			if (turnedOff.length) {
				throw new Error(localize('artifactChoiceRuleTurnedOff', "{0} was turned off before your choice was saved, so it stays off. Select the mode again to turn it on.", turnedOff.join(', ')));
			}
		} finally {
			// Values changed again during the write stay for the next one; the others are confirmed now, or failed and show the provider's again.
			for (const [optionId, entry] of submitted) {
				if (unconfirmed.get(optionId) === entry) {
					unconfirmed.delete(optionId);
				}
			}
			if (!unconfirmed.size) {
				this.unconfirmed.delete(integrationId);
			}
			this.changed.trigger(undefined);
		}
	}
}
