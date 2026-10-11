/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodexAccountTelemetryContext } from './agentHostTelemetry.js';

const chatgptPlanTiers = {
	free: 'free',
	go: 'go',
	plus: 'plus',
	pro: 'pro',
	prolite: 'pro',
	team: 'business',
	self_serve_business_prolite: 'business',
	self_serve_business_usage_based: 'business',
	business: 'business',
	ent26: 'enterprise',
	enterprise_cbp_automation: 'enterprise',
	enterprise_cbp_usage_based: 'enterprise',
	enterprise: 'enterprise',
	edu: 'edu',
	edu_plus: 'edu',
	edu_pro: 'edu',
	unknown: 'unknown',
} as const satisfies Record<string, NonNullable<ICodexAccountTelemetryContext['chatgptPlanTier']>>;

export function normalizeChatGPTPlanTier(planType: unknown): NonNullable<ICodexAccountTelemetryContext['chatgptPlanTier']> {
	return typeof planType === 'string' && Object.hasOwn(chatgptPlanTiers, planType) ? chatgptPlanTiers[planType as keyof typeof chatgptPlanTiers] : 'unknown';
}

export function isPaidChatGPTPlan(planType: string | undefined): boolean {
	const tier = normalizeChatGPTPlanTier(planType);
	return tier !== 'free' && tier !== 'unknown';
}
