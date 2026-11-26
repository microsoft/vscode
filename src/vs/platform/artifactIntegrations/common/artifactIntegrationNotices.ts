/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../base/common/htmlContent.js';
import { localize } from '../../../nls.js';
import { ArtifactActor, ArtifactAutomationConfiguration, isArtifactOptionEnabled } from './artifactIntegration.js';
import { ArtifactIntegrationState } from './artifactIntegrationStore.js';
import { isRecord } from './artifactIntegrationValidation.js';
import { ArtifactAutomationEnabledRules, ArtifactAutomationNotice, ArtifactAutomationNoticeChange } from './artifactRuntime.js';

const noticeKinds: ReadonlySet<unknown> = new Set<ArtifactAutomationNoticeChange['kind']>(['enabled', 'changed', 'disabled']);

/** Names that notices show for who made a change and for the kind of artifact it applies to. */
export interface IArtifactAutomationNoticeLabels {
	/** Names the agent of a chat, such as Copilot. */
	getAgentName?(chat: string): string | undefined;
	/** A short name for the kind of artifact an integration supports, such as "PR". */
	getArtifactKind?(integrationId: string): string | undefined;
}

/** Describes each committed automation change of an artifact's binding in one notice. */
export function getArtifactAutomationNotices(previous: ArtifactIntegrationState, current: ArtifactIntegrationState, labels: IArtifactAutomationNoticeLabels = {}): readonly ArtifactAutomationNotice[] {
	const notices: ArtifactAutomationNotice[] = [];
	const previousBindings = new Map(previous.bindings.map(binding => [binding.id, binding]));
	const agentName = (actor: ArtifactActor | undefined) => actor?.kind === 'agent'
		? labels.getAgentName?.(actor.chat) ?? localize('artifactAutomationUnknownAgent', "The agent")
		: undefined;
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
			let agent: string | undefined;
			if (enabled) {
				details.push(option.description);
				const choice = option.kind === 'enum' ? option.choices.find(choice => choice.value === value) : undefined;
				if (choice) {
					details.push(localize('artifactAutomationSelectedMode', "Mode: {0}", choice.label));
					if (choice.description) {
						details.push(choice.description);
					}
				}
				const grant = binding.configuration.grants?.[option.id];
				agent = agentName(grant);
				// The title names the agent; only a confirmation by the person adds to it.
				if (grant?.kind === 'agent' && !grant.autoApproved) {
					details.push(localize('artifactAutomationAgentGrant', "Requested by the agent and confirmed by you."));
				}
			} else {
				// The integration turned the rule off when it recorded a reason; otherwise a person or an agent did.
				const disablement = binding.configuration.disablements[option.id];
				if (disablement) {
					details.push(disablement.reason);
				} else {
					agent = agentName(binding.configuration.disabledBy?.[option.id]);
				}
			}
			changes.push({ integrationId: binding.integrationId, optionId: option.id, label: option.label, kind: enabled ? wasEnabled ? 'changed' : 'enabled' : 'disabled', details, ...(agent ? { agent } : {}) });
		}
		if (changes.length) {
			// Every integration of the artifact, so that the summary only says Autopilot is off when no rule of the artifact remains on.
			const enabledRules = current.bindings
				.filter(candidate => candidate.session === binding.session && candidate.artifact.id === binding.artifact.id)
				.map(candidate => ({ integrationId: candidate.integrationId, labels: candidate.options.filter(option => isArtifactOptionEnabled(option, candidate.configuration.values[option.id])).map(option => option.label) }));
			const artifactKind = labels.getArtifactKind?.(binding.integrationId);
			notices.push({
				session: binding.session, artifact: binding.artifact, changes, enabledRules, ...(artifactKind ? { artifactKind } : {}),
				...formatArtifactAutomationNotice(binding.artifact.label, changes, enabledRules, artifactKind),
			});
		}
	}
	return notices;
}

/**
 * Renders a notice as a one-line summary followed by the details that are
 * shown when it is expanded. Several changes are summarized by their count.
 * The summary names the agent only when it made every change, and bolds what changed.
 */
export function formatArtifactAutomationNotice(artifactLabel: string, changes: readonly ArtifactAutomationNoticeChange[], enabledRules: readonly ArtifactAutomationEnabledRules[], artifactKind?: string): Pick<ArtifactAutomationNotice, 'kind' | 'content'> {
	const blocks: string[] = [];
	// The summaries mark up their own text, so only the text they insert is escaped.
	const artifact = escapeMarkdownSyntaxTokens(artifactKind ? localize('artifactAutomationNoticeArtifact', "{0}: {1}", artifactKind, artifactLabel) : artifactLabel);
	const agentName = changes.every(change => change.agent !== undefined && change.agent === changes[0].agent) ? changes[0].agent : undefined;
	const agent = agentName && escapeMarkdownSyntaxTokens(agentName);
	// Opens the expanded details by saying how Autopilot acts, whenever the notice leaves a rule on.
	const intro = changes.some(change => change.kind !== 'disabled')
		? [localize('artifactAutomationNoticeIntro', "Autopilot keeps working automatically, sending messages to the agent in this chat when there is work to do.")]
		: [];
	if (changes.length === 1) {
		const [change] = changes;
		const label = escapeMarkdownSyntaxTokens(change.label);
		blocks.push(agent
			? change.kind === 'enabled'
				? localize('artifactAutomationAgentEnabledNotice', "{0} **enabled {1}** for {2}", agent, label, artifact)
				: change.kind === 'changed'
					? localize('artifactAutomationAgentChangedNotice', "{0} **updated {1}** for {2}", agent, label, artifact)
					: localize('artifactAutomationAgentDisabledNotice', "{0} **disabled {1}** for {2}", agent, label, artifact)
			: change.kind === 'enabled'
				? localize('artifactAutomationEnabledNotice', "**{0} enabled** for {1}", label, artifact)
				: change.kind === 'changed'
					? localize('artifactAutomationChangedNotice', "**{0} updated** for {1}", label, artifact)
					: localize('artifactAutomationDisabledNotice', "**{0} disabled** for {1}", label, artifact));
		blocks.push(...[...intro, ...change.details].map(escapeMarkdownSyntaxTokens));
	} else {
		const enabledCount = enabledRules.reduce((count, rules) => count + rules.labels.length, 0);
		// `enabledRules` covers every integration of the artifact, so every enabled rule being newly enabled means that
		// Autopilot was off before, and no enabled rule after disabling several means that it is off now.
		const summary = changes.every(change => change.kind === 'enabled') && enabledCount === changes.length ? 'enabled'
			: changes.every(change => change.kind === 'disabled') && enabledCount === 0 ? 'disabled' : 'updated';
		blocks.push(agent
			? summary === 'enabled'
				? localize('artifactAutomationAgentEnabledRulesNotice', "{0} **enabled Autopilot** for {1} ({2} rules)", agent, artifact, changes.length)
				: summary === 'disabled'
					? localize('artifactAutomationAgentDisabledRulesNotice', "{0} **disabled Autopilot** for {1} ({2} rules)", agent, artifact, changes.length)
					: localize('artifactAutomationAgentUpdatedNotice', "{0} **updated Autopilot** for {1} ({2} rules)", agent, artifact, changes.length)
			: summary === 'enabled'
				? localize('artifactAutomationEnabledRulesNotice', "**Autopilot enabled** for {0} ({1} rules)", artifact, changes.length)
				: summary === 'disabled'
					? localize('artifactAutomationDisabledRulesNotice', "**Autopilot disabled** for {0} ({1} rules)", artifact, changes.length)
					: localize('artifactAutomationUpdatedNotice', "**Autopilot updated** for {0} ({1} rules)", artifact, changes.length));
		blocks.push(...intro.map(escapeMarkdownSyntaxTokens));
		blocks.push(changes.map(change => {
			const title = change.kind === 'enabled'
				? localize('artifactAutomationRuleEnabled', "{0} enabled", change.label)
				: change.kind === 'changed'
					? localize('artifactAutomationRuleChanged', "{0} updated", change.label)
					: localize('artifactAutomationRuleDisabled', "{0} disabled", change.label);
			// One tight list item per rule, with its details on hard-broken lines below its title.
			const [escapedTitle, ...details] = [title, ...change.details].map(text => escapeMarkdownSyntaxTokens(text.replace(/\s*\n\s*/g, ' ')));
			return `- ${[`**${escapedTitle}**`, ...details].join('\\\n  ')}`;
		}).join('\n'));
	}
	if (changes.some(change => change.kind === 'disabled')) {
		const remaining = enabledRules.flatMap(rules => rules.labels);
		if (remaining.length) {
			blocks.push(escapeMarkdownSyntaxTokens(localize('artifactAutomationRemainingNotice', "Still enabled: {0}.", remaining.join(', '))));
		}
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
		&& (change.agent === undefined || isNoticeText(change.agent))
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
