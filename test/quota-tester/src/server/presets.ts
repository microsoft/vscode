/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppState, PlanConfig, PlanId } from '../types.js';
import { defaultState, snap } from './defaults.js';

export interface ScenarioPreset {
	id: string;
	label: string;
	description: string;
	category: string;
	apply: (base: AppState) => AppState;
}

function clone(state: AppState): AppState {
	return JSON.parse(JSON.stringify(state));
}

function withConfig(state: AppState, planId: PlanId, overrides: Partial<PlanConfig>): AppState {
	const next = clone(state);
	next.activePlan = planId;
	Object.assign(next.plans[planId], overrides);
	return next;
}

export const PRESETS: ScenarioPreset[] = [
	// ── Copilot Free ────────────────────────────────────────────────
	{
		id: 'free-pru',
		label: 'Free — PRU',
		description: 'Free user on per-request usage (legacy). Uses limited_user_quotas/monthly_quotas.',
		category: 'Copilot Free',
		apply: base => withConfig(base, 'free', {
			label: 'Copilot Free (PRU)',
			access_type_sku: 'free_limited_copilot',
			copilot_plan: 'individual',
			codex_agent_enabled: false,
			includeSnapshots: [],
			snapshots: {},
			limited_user_quotas: { chat: 490, completions: 4000 },
			monthly_quotas: { chat: 500, completions: 4000 },
		}),
	},
	{
		id: 'free-pru-exhausted',
		label: 'Free — PRU exhausted',
		description: 'Free PRU user with all quotas consumed.',
		category: 'Copilot Free',
		apply: base => withConfig(base, 'free', {
			label: 'Copilot Free (PRU, exhausted)',
			access_type_sku: 'free_limited_copilot',
			copilot_plan: 'individual',
			codex_agent_enabled: false,
			includeSnapshots: [],
			snapshots: {},
			limited_user_quotas: { chat: 0, completions: 0 },
			monthly_quotas: { chat: 500, completions: 4000 },
		}),
	},
	{
		id: 'free-tbb',
		label: 'Free — TBB',
		description: 'Free user with token-based billing. Chat at 97.8%, completions full.',
		category: 'Copilot Free',
		apply: base => withConfig(base, 'free', {
			label: 'Copilot Free (TBB)',
			access_type_sku: 'free_limited_copilot',
			copilot_plan: 'individual',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ percent_remaining: 97.8, quota_remaining: 195.7, remaining: 195, entitlement: 200, token_based_billing: true }),
				completions: snap({ has_quota: true, quota_remaining: 4000, remaining: 4000, entitlement: 4000, token_based_billing: true }),
				premium_interactions: snap({ percent_remaining: 0, token_based_billing: true }),
			},
			limited_user_quotas: undefined,
			monthly_quotas: undefined,
		}),
	},
	{
		id: 'free-tbb-exhausted',
		label: 'Free — TBB exhausted',
		description: 'Free TBB user with chat quota exhausted.',
		category: 'Copilot Free',
		apply: base => withConfig(base, 'free', {
			label: 'Copilot Free (TBB, exhausted)',
			access_type_sku: 'free_limited_copilot',
			copilot_plan: 'individual',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ percent_remaining: 0, quota_remaining: 0, remaining: 0, entitlement: 200, token_based_billing: true }),
				completions: snap({ has_quota: true, quota_remaining: 4000, remaining: 4000, entitlement: 4000, token_based_billing: true }),
				premium_interactions: snap({ percent_remaining: 0, token_based_billing: true }),
			},
			limited_user_quotas: undefined,
			monthly_quotas: undefined,
		}),
	},

	// ── Copilot Pro / EDU ─────────────────────────────────────────
	{
		id: 'edu-pro-pru',
		label: 'EDU/Pro — PRU',
		description: 'EDU/Pro user on per-request usage. 300 premium interactions.',
		category: 'Copilot Pro',
		apply: base => withConfig(base, 'pro', {
			label: 'Copilot EDU/Pro (PRU)',
			access_type_sku: 'free_educational_quota',
			copilot_plan: 'individual',
			codex_agent_enabled: false,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true }),
				premium_interactions: snap({ remaining: 300, entitlement: 300, quota_remaining: 300 }),
			},
		}),
	},
	{
		id: 'edu-pro-tbb',
		label: 'EDU/Pro — TBB',
		description: 'EDU/Pro user with TBB enabled. 1200 premium interactions.',
		category: 'Copilot Pro',
		apply: base => withConfig(base, 'pro', {
			label: 'Copilot EDU/Pro (TBB)',
			access_type_sku: 'free_educational_quota',
			copilot_plan: 'individual',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, has_quota: true }),
				premium_interactions: snap({ remaining: 300, entitlement: 300, quota_remaining: 300, token_based_billing: true }),
			},
		}),
	},

	// ── Copilot Pro — exhausted ───────────────────────────────────
	{
		id: 'pro-tbb-exhausted-no-overages',
		label: 'EDU/Pro — TBB exhausted (no overages)',
		description: 'EDU/Pro TBB user with premium_interactions exhausted and overage_permitted=false.',
		category: 'Copilot Pro',
		apply: base => withConfig(base, 'pro', {
			label: 'Copilot EDU/Pro (TBB, exhausted, no overages)',
			access_type_sku: 'free_educational_quota',
			copilot_plan: 'individual',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, has_quota: true }),
				premium_interactions: snap({ percent_remaining: 0, remaining: 0, entitlement: 300, quota_remaining: 0, overage_permitted: false, token_based_billing: true }),
			},
		}),
	},
	{
		id: 'pro-tbb-exhausted-overages',
		label: 'EDU/Pro — TBB exhausted (with overages)',
		description: 'EDU/Pro TBB user with premium_interactions exhausted and overage_permitted=true. overage_count > 0.',
		category: 'Copilot Pro',
		apply: base => withConfig(base, 'pro', {
			label: 'Copilot EDU/Pro (TBB, exhausted, with overages)',
			access_type_sku: 'free_educational_quota',
			copilot_plan: 'individual',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, overage_permitted: true, has_quota: true }),
				premium_interactions: snap({ percent_remaining: 0, overage_permitted: true, remaining: 0, entitlement: 300, quota_remaining: 0, overage_count: 1025, token_based_billing: true }),
			},
		}),
	},

	// ── Copilot Pro+ ──────────────────────────────────────────────
	{
		id: 'pro-plus-pru',
		label: 'Pro+ — PRU',
		description: 'Pro+ user on per-request usage. 300 premium interactions.',
		category: 'Copilot Pro+',
		apply: base => withConfig(base, 'pro_plus', {
			label: 'Copilot Pro+ (PRU)',
			access_type_sku: 'plus_monthly_subscriber_quota',
			copilot_plan: 'individual_pro',
			codex_agent_enabled: false,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true }),
				premium_interactions: snap({ remaining: 300, entitlement: 300, quota_remaining: 300 }),
			},
		}),
	},
	{
		id: 'pro-plus-tbb',
		label: 'Pro+ — TBB with quota',
		description: 'Pro+ user with TBB enabled and quota remaining. overage_permitted=true.',
		category: 'Copilot Pro+',
		apply: base => withConfig(base, 'pro_plus', {
			label: 'Copilot Pro+ (TBB)',
			access_type_sku: 'plus_monthly_subscriber_quota',
			copilot_plan: 'individual_pro',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, overage_permitted: true, has_quota: true }),
				premium_interactions: snap({ overage_permitted: true, remaining: 1500, entitlement: 1500, quota_remaining: 1500, token_based_billing: true }),
			},
		}),
	},
	{
		id: 'pro-plus-tbb-exhausted',
		label: 'Pro+ — TBB out of quota',
		description: 'Pro+ user with premium_interactions exhausted but overage_permitted=true. overage_count > 0.',
		category: 'Copilot Pro+',
		apply: base => withConfig(base, 'pro_plus', {
			label: 'Copilot Pro+ (TBB, exhausted)',
			access_type_sku: 'plus_monthly_subscriber_quota',
			copilot_plan: 'individual_pro',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, overage_permitted: true, has_quota: true }),
				premium_interactions: snap({ percent_remaining: 0, overage_permitted: true, remaining: 0, entitlement: 1500, quota_remaining: 0, overage_count: 1025, token_based_billing: true }),
			},
		}),
	},

	// ── Copilot Max ───────────────────────────────────────────────
	{
		id: 'max-yearly-no-tbb',
		label: 'Max Yearly — no TBB',
		description: 'Max user on yearly contract. TBB not allowed (no token_based_billing).',
		category: 'Copilot Max',
		apply: base => withConfig(base, 'max', {
			label: 'Copilot Max Yearly (no TBB)',
			access_type_sku: 'max_yearly_subscriber_quota',
			copilot_plan: 'individual_max',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, has_quota: true }),
				premium_interactions: snap({ remaining: 5000, entitlement: 5000, quota_remaining: 5000 }),
			},
		}),
	},
	{
		id: 'max-monthly-tbb',
		label: 'Max Monthly — TBB',
		description: 'Max user on monthly contract with TBB enabled.',
		category: 'Copilot Max',
		apply: base => withConfig(base, 'max', {
			label: 'Copilot Max Monthly (TBB)',
			access_type_sku: 'max_monthly_subscriber_quota',
			copilot_plan: 'individual_max',
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true, has_quota: true }),
				premium_interactions: snap({ remaining: 5000, entitlement: 5000, quota_remaining: 5000, token_based_billing: true }),
			},
		}),
	},

	// ── Copilot Business / Enterprise ─────────────────────────────
	{
		id: 'enterprise-pru',
		label: 'Enterprise Managed — PRU',
		description: 'Enterprise managed user on PRU. Minimal response, chat_enabled=false.',
		category: 'Business / Enterprise',
		apply: base => withConfig(base, 'enterprise', {
			label: 'Copilot Enterprise Managed (PRU)',
			access_type_sku: 'enterprise_managed',
			copilot_plan: 'individual',
			chat_enabled: false,
			codex_agent_enabled: false,
			includeSnapshots: [],
			snapshots: {},
		}),
	},
	{
		id: 'enterprise-tbb',
		label: 'Enterprise — TBB (multi-quota)',
		description: 'Enterprise user with TBB multi-quota. All quotas unlimited.',
		category: 'Business / Enterprise',
		apply: base => withConfig(base, 'enterprise', {
			label: 'Copilot Enterprise (TBB)',
			access_type_sku: 'copilot_enterprise_seat_multi_quota',
			copilot_plan: 'enterprise',
			chat_enabled: true,
			codex_agent_enabled: true,
			includeSnapshots: ['chat', 'completions', 'premium_interactions'],
			snapshots: {
				chat: snap({ unlimited: true }),
				completions: snap({ unlimited: true }),
				premium_interactions: snap({ unlimited: true, token_based_billing: true }),
			},
		}),
	},
];

export function applyPreset(id: string): AppState | null {
	const preset = PRESETS.find(p => p.id === id);
	if (!preset) {
		return null;
	}
	return preset.apply(defaultState());
}

export function presetSummaries(): Array<{ id: string; label: string; description: string; category: string }> {
	return PRESETS.map(({ id, label, description, category }) => ({ id, label, description, category }));
}
