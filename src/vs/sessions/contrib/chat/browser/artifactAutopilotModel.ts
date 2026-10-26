/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignal } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactSnapshot, artifactOptionDisabledValue, IArtifactModel, isArtifactOptionEnabled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { canEnableArtifactAutomationOption } from '../../../../platform/artifactIntegrations/common/artifactAutomationConfiguration.js';
import { describeArtifactAutomationConsent } from '../../../../platform/artifactIntegrations/common/artifactAutomationConsent.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ArtifactDetailsViewState, artifactViewKey, IArtifactAutopilotGroupViewData, IArtifactAutopilotRuleViewData } from './artifactDetailsView.js';

type EnumOption = Extract<ArtifactAutomationOption, { kind: 'enum' }>;

/** Normalizes provider rules and owns consent commands, independently of their controls. */
export class ArtifactAutopilotModel extends Disposable {
	private readonly changed = observableSignal(this);
	private readonly shown = new Set<string>();
	private readonly pendingRules = new Set<string>();
	private readonly pendingGroups = new Set<string>();
	readonly data: IObservable<readonly IArtifactAutopilotGroupViewData[]>;

	constructor(
		private readonly snapshot: IObservable<ArtifactSnapshot>,
		private readonly model: IArtifactModel,
		private readonly state: ArtifactDetailsViewState,
		private readonly run: (operation: () => Promise<void>) => Promise<void>,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
		this.data = derived(this, reader => {
			this.changed.read(reader);
			const snapshot = this.snapshot.read(reader);
			const groups = snapshot.contributions.map(contribution => ({ contribution, options: this.options(contribution) })).filter(group => group.options.length);
			return groups.map(({ contribution, options }): IArtifactAutopilotGroupViewData => {
				const eligible = options.filter(option => isArtifactOptionEnabled(option, contribution.configuration.values[option.id]) || canEnableArtifactAutomationOption(contribution, option));
				const enabled = eligible.filter(option => isArtifactOptionEnabled(option, contribution.configuration.values[option.id])).length;
				const unavailable = options.length - eligible.length;
				return {
					id: contribution.integrationId,
					title: groups.length > 1 ? localize('artifactAutopilot.providerTitle', "{0} Autopilot", contribution.label) : localize('artifactAutopilot.title', "Autopilot"),
					expanded: state.expandedAutopilot.has(contribution.integrationId),
					checked: enabled > 0 && enabled === eligible.length,
					disabled: this.pendingGroups.has(contribution.integrationId) || !eligible.length,
					summary: unavailable ? localize('artifactAutopilot.unavailable', "{0} on, {1} unavailable", enabled, unavailable)
						: localize('artifactAutopilot.enabled', "{0} of {1} on", enabled, eligible.length),
					toggleLabel: groups.length > 1 ? localize('artifactAutopilot.providerRules', "All Available Autopilot Rules: {0}", contribution.label)
						: localize('artifactAutopilot.allRules', "All Available Autopilot Rules"),
					description: localize('artifactAutopilot.masterHelp', "Enable all available rules for this provider using the policies shown in their dropdowns, or turn off all enabled rules. Unavailable rules are not enabled."),
					rules: options.map(option => this.rule(contribution, option, snapshot)),
					setExpanded: expanded => {
						if (expanded) {
							state.expandedAutopilot.add(contribution.integrationId);
						} else {
							state.expandedAutopilot.delete(contribution.integrationId);
						}
						this.changed.trigger(undefined);
					},
					setEnabled: enabled => this.saveGroup(contribution.integrationId, enabled),
				};
			});
		});
	}

	private options(contribution: ArtifactContributionSnapshot): readonly ArtifactAutomationOption[] {
		return contribution.options.filter(option => {
			const id = artifactViewKey(contribution.integrationId, option.id);
			if (isArtifactOptionEnabled(option, contribution.configuration.values[option.id]) || contribution.configuration.disablements[option.id]
				|| (!contribution.authentication && contribution.view.availability.kind !== 'authenticationRequired'
					&& (option.actionIds.some(id => contribution.view.stateActions.some(action => action.id === id))
						|| contribution.view.automationAvailability.some(available => available.id === option.id && available.available && available.enablement?.enabled !== false)))) {
				this.shown.add(id);
			}
			return this.shown.has(id);
		});
	}

	private choice(contribution: ArtifactContributionSnapshot, option: EnumOption): EnumOption['choices'][number] | undefined {
		const id = artifactViewKey(contribution.integrationId, option.id);
		const current = contribution.configuration.values[option.id];
		const value = isArtifactOptionEnabled(option, current) ? current : this.state.preparedPolicies.get(id);
		const choice = option.choices.find(choice => choice.value === value && choice.value !== option.disabledValue)
			?? option.choices.find(choice => choice.value !== option.disabledValue);
		if (choice) {
			this.state.preparedPolicies.set(id, choice.value);
		}
		return choice;
	}

	private location(contribution: ArtifactContributionSnapshot, snapshot = this.snapshot.get()) {
		return (contribution.authority ?? snapshot.authority).location;
	}

	private rule(contribution: ArtifactContributionSnapshot, option: ArtifactAutomationOption, snapshot: ArtifactSnapshot): IArtifactAutopilotRuleViewData {
		const id = artifactViewKey(contribution.integrationId, option.id);
		const checked = isArtifactOptionEnabled(option, contribution.configuration.values[option.id]);
		const pending = this.pendingRules.has(id);
		const disabled = pending || (!checked && !canEnableArtifactAutomationOption(contribution, option));
		const available = contribution.view.automationAvailability.find(available => available.id === option.id);
		const reason = contribution.configuration.disablements[option.id]?.reason ?? available?.unavailableReason
			?? (!checked ? available?.enablement?.disabledReason : undefined)
			?? (contribution.view.availability.kind !== 'available' && contribution.view.availability.kind !== 'loading' ? contribution.view.availability.reason : undefined)
			?? (disabled && !pending ? localize('artifactAutopilot.unavailableRule', "This Autopilot rule is not available in the current resource state.") : '');
		return {
			id, label: option.label, checked, disabled, pending,
			description: [
				...describeArtifactAutomationConsent(contribution, option, { location: this.location(contribution, snapshot) }),
				option.kind === 'enum' ? localize('artifactPolicyPreparation', "Choosing a policy while this rule is off does not enable it. Turning it on uses the displayed policy.") : '',
				checked && contribution.configuration.grants?.[option.id]?.kind === 'agent' ? localize('artifactAutopilot.agentGrant', "Turned on at the agent's request after you confirmed.") : '',
				reason,
			].filter(Boolean).join(' '),
			policy: option.kind === 'enum' ? {
				label: this.choice(contribution, option)?.label ?? localize('artifactNoPolicyChoices', "No Available Policies"),
				choose: () => this.saveRule(contribution.integrationId, option.id),
			} : undefined,
			setEnabled: enabled => this.saveRule(contribution.integrationId, option.id, enabled),
		};
	}

	private saveRule(integrationId: string, optionId: string, enabled?: boolean): Promise<void> {
		const id = artifactViewKey(integrationId, optionId);
		if (this.pendingRules.has(id)) {
			return Promise.resolve();
		}
		return this.run(async () => {
			const contribution = this.snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId);
			const option = contribution?.options.find(option => option.id === optionId);
			if (this._store.isDisposed || !contribution || !option || (!isArtifactOptionEnabled(option, contribution.configuration.values[option.id]) && !canEnableArtifactAutomationOption(contribution, option))) {
				throw new Error(localize('artifactAutopilot.ruleUnavailable', "This Autopilot rule is no longer available."));
			}
			this.pendingRules.add(id);
			this.changed.trigger(undefined);
			try {
				let value: boolean | string | undefined;
				if (option.kind === 'boolean') {
					value = enabled;
				} else if (enabled !== undefined) {
					value = enabled ? this.choice(contribution, option)?.value : artifactOptionDisabledValue(option);
					if (value === undefined) {
						throw new Error(localize('artifactPolicyUnavailable', "No enabled policy is available for {0}.", option.label));
					}
				} else {
					const choices = option.choices.filter(choice => choice.value !== option.disabledValue);
					const selected = await this.quickInputService.pick(choices, {
						title: option.label, placeHolder: option.description, activeItem: this.choice(contribution, option),
					});
					if (!selected || this._store.isDisposed) {
						return;
					}
					value = selected.value;
					if (!isArtifactOptionEnabled(option, contribution.configuration.values[option.id])) {
						const current = this.snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId);
						const currentOption = current?.options.find(option => option.id === optionId);
						if (!current || currentOption?.kind !== 'enum' || !currentOption.choices.some(choice => choice.value === value && choice.value !== currentOption.disabledValue)
							|| isArtifactOptionEnabled(currentOption, current.configuration.values[optionId])) {
							throw new Error(localize('artifactPolicyChanged', "This Autopilot rule changed while selecting a policy. Choose the policy again."));
						}
						this.state.preparedPolicies.set(id, value);
						status(localize('artifactPolicySelected', "Selected {0} for {1}. This Autopilot rule remains off.", selected.label, option.label));
						return;
					}
				}
				if (value !== undefined) {
					await this.model.configure(integrationId, contribution.configuration.revision, { [optionId]: value });
					status(localize('artifactAutomationSaved', "Autopilot rule updated: {0}", option.label));
				}
			} finally {
				this.pendingRules.delete(id);
				this.changed.trigger(undefined);
			}
		});
	}

	private saveGroup(integrationId: string, enabled: boolean): Promise<void> {
		if (this.pendingGroups.has(integrationId)) {
			return Promise.resolve();
		}
		return this.run(async () => {
			const contribution = this.snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId);
			if (this._store.isDisposed || !contribution) {
				throw new Error(localize('artifactAutopilot.providerUnavailable', "This Autopilot provider is no longer available."));
			}
			this.pendingGroups.add(integrationId);
			this.changed.trigger(undefined);
			try {
				const values: Record<string, boolean | string> = {};
				for (const option of this.options(contribution)) {
					const current = contribution.configuration.values[option.id];
					if (isArtifactOptionEnabled(option, current) === enabled || (enabled && !canEnableArtifactAutomationOption(contribution, option))) {
						continue;
					}
					const choice = option.kind === 'enum' ? this.choice(contribution, option) : undefined;
					if (enabled && option.kind === 'enum' && !choice) {
						throw new Error(localize('artifactPolicyUnavailable', "No enabled policy is available for {0}.", option.label));
					}
					values[option.id] = enabled ? choice?.value ?? true : artifactOptionDisabledValue(option);
				}
				if (!Object.keys(values).length) {
					return;
				}
				// Save without awaiting user input first: any outside click, such as in a dialog, closes the details panel and disposes this model.
				await this.model.configure(integrationId, contribution.configuration.revision, values);
				status(localize('artifactAutopilot.saved', "Artifact Autopilot updated."));
			} finally {
				this.pendingGroups.delete(integrationId);
				this.changed.trigger(undefined);
			}
		});
	}
}
