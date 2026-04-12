/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { IProductOnboardingTheme } from '../../../../base/common/product.js';

/**
 * Step identifiers for the onboarding walkthrough.
 */
export const enum OnboardingStepId {
	SignIn = 'onboarding.signIn',
	Personalize = 'onboarding.personalize',
	Extensions = 'onboarding.extensions',
	AiPreference = 'onboarding.aiPreference',
	AgentSessions = 'onboarding.agentSessions',
}

/**
 * Returns a localized title for each step.
 */
export function getOnboardingStepTitle(stepId: OnboardingStepId): string {
	switch (stepId) {
		case OnboardingStepId.SignIn:
			return localize('onboarding.step.signIn', "Sign In");
		case OnboardingStepId.Personalize:
			return localize('onboarding.step.personalize', "Make It Yours");
		case OnboardingStepId.Extensions:
			return localize('onboarding.step.extensions', "Supercharge Your Editor");
		case OnboardingStepId.AiPreference:
			return localize('onboarding.step.aiPreference', "Your AI Style");
		case OnboardingStepId.AgentSessions:
			return localize('onboarding.step.agentSessions', "Meet Your Agentic Coding Partner");
	}
}

/**
 * Returns a localized subtitle for each step.
 */
export function getOnboardingStepSubtitle(stepId: OnboardingStepId): string {
	switch (stepId) {
		case OnboardingStepId.SignIn:
			return localize('onboarding.step.signIn.subtitle', "Sync settings, unlock AI features, and connect to GitHub");
		case OnboardingStepId.Personalize:
			return localize('onboarding.step.personalize.subtitle', "Choose your theme and keyboard mapping");
		case OnboardingStepId.Extensions:
			return localize('onboarding.step.extensions.subtitle', "Install extensions to enhance your workflow");
		case OnboardingStepId.AiPreference:
			return localize('onboarding.step.aiPreference.subtitle', "Choose how much AI collaboration fits your workflow");
		case OnboardingStepId.AgentSessions:
			return localize('onboarding.step.agentSessions.subtitle', "Tip: Press {0} to open Chat", isMacintosh ? '\u2318\u2303I' : 'Ctrl+Alt+I');
	}
}

/**
 * Ordered step IDs for the onboarding flow.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
	OnboardingStepId.SignIn,
	OnboardingStepId.Personalize,
	OnboardingStepId.Extensions,
	OnboardingStepId.AgentSessions,
];

/**
 * Theme option for the onboarding personalization step.
 * Sourced from product.json via `onboardingThemes`.
 */
export type IOnboardingThemeOption = IProductOnboardingTheme;

/**
 * AI collaboration preference for the AI style step.
 */
export const enum AiCollaborationMode {
	CodeFirst = 'code-first',
	Balanced = 'balanced',
	AgentForward = 'agent-forward',
}

/**
 * AI collaboration preference option.
 */
export interface IAiPreferenceOption {
	readonly id: AiCollaborationMode;
	readonly label: string;
	readonly description: string;
	readonly icon: string;
}

/**
 * AI collaboration preference options shown in the AI style step.
 */
export const ONBOARDING_AI_PREFERENCE_OPTIONS: readonly IAiPreferenceOption[] = [
	{
		id: AiCollaborationMode.CodeFirst,
		label: localize('onboarding.aiPref.codeFirst', "I Write the Code"),
		description: localize('onboarding.aiPref.codeFirst.desc', "AI assists with suggestions and answers questions when you ask. You stay in control of every edit."),
		icon: 'edit',
	},
	{
		id: AiCollaborationMode.Balanced,
		label: localize('onboarding.aiPref.balanced', "Side by Side"),
		description: localize('onboarding.aiPref.balanced.desc', "Inline suggestions plus a chat panel for deeper collaboration. A balance of writing and delegating."),
		icon: 'layoutSidebarRight',
	},
	{
		id: AiCollaborationMode.AgentForward,
		label: localize('onboarding.aiPref.agentForward', "AI Takes the Lead"),
		description: localize('onboarding.aiPref.agentForward.desc', "Let the agent drive — describe what you want and review the result. Great for scaffolding and exploration."),
		icon: 'copilot',
	},
];

/**
 * Storage key for persisting onboarding completion state.
 */
export const ONBOARDING_STORAGE_KEY = 'welcomeOnboarding.state';
