/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../base/common/htmlContent.js';
import { localize } from '../../../nls.js';
import { ArtifactAutomationConfiguration, isArtifactOptionEnabled } from './artifactIntegration.js';
import { ArtifactIntegrationState } from './artifactIntegrationStore.js';
import { isRecord } from './artifactIntegrationValidation.js';
import { ArtifactAutomationEnabledRules, ArtifactAutomationNotice, ArtifactAutomationNoticeChange } from './artifactRuntime.js';

const noticeKinds: ReadonlySet<unknown> = new Set<ArtifactAutomationNoticeChange['kind']>(['enabled', 'changed', 'disabled']);

/** Describes each committed automation change of an artifact's binding in one notice. */
export function getArtifactAutomationNotices(previous: ArtifactIntegrationState, current: ArtifactIntegrationState): readonly ArtifactAutomationNotice[] {
	const notices: ArtifactAutomationNotice[] = [];
	const previousBindings = new Map(previous.bindings.map(binding => [binding.id, binding]));
	for (const binding of current.bindings) {
		// Bindings are stored on their first change, so a new one had every option off before it.
		const before: Pick<ArtifactAutomationConfiguration, 'revision' | 'values'> = previousBindings.get(binding.id)?.configuration ?? { revision: -1, values: {} };
		if (before.revision === binding.configuration.revision) {
			continue;
		}
		const changes: ArtifactAutomationNoticeChange[] = [];
		for (const option of binding.options) {
			const value = binding.configuration.values[option.id];
			if (before.values[option.id] === value) {
				continue;
			}
			const enabled = isArtifactOptionEnabled(option, value);
			const wasEnabled = isArtifactOptionEnabled(option, before.values[option.id]);
			if (!enabled && !wasEnabled) {
				continue;
			}
			const details: string[] = [];
			if (enabled) {
				details.push(option.description);
				const choice = option.kind === 'enum' ? option.choices.find(choice => choice.value === value) : undefined;
				if (choice) {
					details.push(localize('artifactAutomationSelectedMode', "Mode: {0}", choice.label));
					if (choice.description) {
						details.push(choice.description);
					}
				}
				if (binding.configuration.grants?.[option.id]?.kind === 'agent') {
					details.push(localize('artifactAutomationAgentGrant', "Requested by the agent and confirmed by you."));
				}
			} else {
				const disablement = binding.configuration.disablements[option.id];
				if (disablement) {
					details.push(disablement.reason);
				}
			}
			changes.push({ integrationId: binding.integrationId, optionId: option.id, label: option.label, kind: enabled ? wasEnabled ? 'changed' : 'enabled' : 'disabled', details });
		}
		if (changes.length) {
			const enabledRules = [{ integrationId: binding.integrationId, labels: binding.options.filter(option => isArtifactOptionEnabled(option, binding.configuration.values[option.id])).map(option => option.label) }];
			notices.push({ session: binding.session, artifact: binding.artifact, changes, enabledRules, ...formatArtifactAutomationNotice(binding.artifact.label, changes, enabledRules) });
		}
	}
	return notices;
}

/**
 * Renders a notice as a one-line summary followed by the details that are
 * shown when it is expanded. Several changes are summarized by their count.
 */
export function formatArtifactAutomationNotice(artifactLabel: string, changes: readonly ArtifactAutomationNoticeChange[], enabledRules: readonly ArtifactAutomationEnabledRules[]): Pick<ArtifactAutomationNotice, 'kind' | 'content'> {
	const blocks: string[] = [];
	if (changes.length === 1) {
		const [change] = changes;
		const title = change.kind === 'enabled'
			? localize('artifactAutomationEnabledNotice', "{0} enabled for {1}", change.label, artifactLabel)
			: change.kind === 'changed'
				? localize('artifactAutomationChangedNotice', "{0} updated for {1}", change.label, artifactLabel)
				: localize('artifactAutomationDisabledNotice', "{0} disabled for {1}", change.label, artifactLabel);
		blocks.push(...[title, ...change.details].map(escapeMarkdownSyntaxTokens));
	} else {
		blocks.push(escapeMarkdownSyntaxTokens(localize('artifactAutomationUpdatedNotice', "Autopilot updated for {0} ({1} rules)", artifactLabel, changes.length)));
		blocks.push(changes.map(change => {
			const title = change.kind === 'enabled'
				? localize('artifactAutomationRuleEnabled', "{0} enabled", change.label)
				: change.kind === 'changed'
					? localize('artifactAutomationRuleChanged', "{0} updated", change.label)
					: localize('artifactAutomationRuleDisabled', "{0} disabled", change.label);
			// One tight list item per rule, with its details on hard-broken lines below its title.
			return `- ${[title, ...change.details].map(text => escapeMarkdownSyntaxTokens(text.replace(/\s*\n\s*/g, ' '))).join('\\\n  ')}`;
		}).join('\n'));
	}
	if (changes.some(change => change.kind === 'disabled')) {
		blocks.push(escapeMarkdownSyntaxTokens(changes.length === 1
			? localize('artifactAutomationStoppedNotice', "No new automatic runs will start for this rule. Pending runs will be cancelled; work already sent may still finish. Completed changes are not undone.")
			: localize('artifactAutomationStoppedRulesNotice', "No new automatic runs will start for the disabled rules. Pending runs will be cancelled; work already sent may still finish. Completed changes are not undone.")));
		const remaining = enabledRules.flatMap(rules => rules.labels);
		blocks.push(escapeMarkdownSyntaxTokens(remaining.length
			? localize('artifactAutomationRemainingNotice', "Still enabled: {0}.", remaining.join(', '))
			: enabledRules.length > 1
				// Only the integrations of these changes are known, not every integration of the artifact.
				? localize('artifactAutomationNoneRemainingForIntegrationsNotice', "No automation rules remain enabled for these artifact integrations.")
				: localize('artifactAutomationNoneRemainingNotice', "No automation rules remain enabled for this artifact integration.")));
	}
	const kind = changes.every(change => change.kind === changes[0].kind) ? changes[0].kind : 'changed';
	return { kind, content: blocks.join('\n\n') };
}

/**
 * Adds the changes of `next` to an earlier notice, keeping only the latest
 * change of each rule and the latest enabled rules of each integration. A rule
 * that was enabled in the earlier notice stays newly enabled when only its mode
 * changes. Returns `undefined` when the merged notice would exceed the limits
 * that its readers accept, so that the notices stay separate.
 */
export function mergeArtifactAutomationNotices(previous: Required<Pick<ArtifactAutomationNotice, 'changes' | 'enabledRules'>>, next: Required<Pick<ArtifactAutomationNotice, 'changes' | 'enabledRules'>>): Required<Pick<ArtifactAutomationNotice, 'changes' | 'enabledRules'>> | undefined {
	const changes = [...previous.changes];
	for (const change of next.changes) {
		const index = changes.findIndex(candidate => isSameRule(candidate, change));
		if (index === -1) {
			changes.push(change);
		} else {
			changes[index] = changes[index].kind === 'enabled' && change.kind === 'changed' ? { ...change, kind: 'enabled' } : change;
		}
	}
	const enabledRules = [...previous.enabledRules];
	for (const rules of next.enabledRules) {
		const index = enabledRules.findIndex(candidate => candidate.integrationId === rules.integrationId);
		if (index === -1) {
			enabledRules.push(rules);
		} else {
			enabledRules[index] = rules;
		}
	}
	return isArtifactAutomationNoticeChanges(changes) && isArtifactAutomationEnabledRules(enabledRules) ? { changes, enabledRules } : undefined;
}

function isSameRule(a: ArtifactAutomationNoticeChange, b: ArtifactAutomationNoticeChange): boolean {
	return a.integrationId === b.integrationId && a.optionId === b.optionId;
}

function isNoticeText(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 8_000;
}

/** Validates rule changes, each rule at most once. */
export function isArtifactAutomationNoticeChanges(value: unknown): value is readonly ArtifactAutomationNoticeChange[] {
	return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((change, index) => isRecord(change)
		&& isNoticeText(change.integrationId) && isNoticeText(change.optionId) && isNoticeText(change.label) && noticeKinds.has(change.kind)
		&& Array.isArray(change.details) && change.details.length <= 20 && change.details.every(isNoticeText)
		&& value.findIndex(candidate => isRecord(candidate) && candidate.integrationId === change.integrationId && candidate.optionId === change.optionId) === index);
}

/** Validates enabled rules, each integration at most once. */
export function isArtifactAutomationEnabledRules(value: unknown): value is readonly ArtifactAutomationEnabledRules[] {
	return Array.isArray(value) && value.length <= 100 && value.every((rules, index) => isRecord(rules)
		&& isNoticeText(rules.integrationId) && Array.isArray(rules.labels) && rules.labels.length <= 100 && rules.labels.every(isNoticeText)
		&& value.findIndex(candidate => isRecord(candidate) && candidate.integrationId === rules.integrationId) === index);
}

/** Whether every integration of `changes` has its enabled rules, which structured notices require to render consistently. */
export function hasArtifactAutomationEnabledRules(changes: readonly ArtifactAutomationNoticeChange[], enabledRules: readonly ArtifactAutomationEnabledRules[]): boolean {
	return changes.every(change => enabledRules.some(rules => rules.integrationId === change.integrationId));
}
