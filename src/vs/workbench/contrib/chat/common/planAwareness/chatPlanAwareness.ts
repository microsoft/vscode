/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../../../base/common/htmlContent.js';
import { IChatPlanAwarenessTerminalAgent } from '../../../../../base/common/product.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logExperimentTrigger, logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { IQuotaSnapshot } from '../../../../services/chat/common/chatEntitlementService.js';
import { AUTO_RAW_MODEL_ID } from '../languageModels.js';
import { AGENT_MD_FILENAME, CLAUDE_LOCAL_MD_FILENAME, CLAUDE_MD_FILENAME, getPromptFileType } from '../promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../promptSyntax/promptTypes.js';

/**
 * The plan awareness nudges. Each nudge targets a way of working of paid
 * Copilot users who do not use Copilot Chat.
 */
export const enum PlanNudgeId {
	/** An agent instructions, skill, agent or prompt file that Copilot also reads. */
	CustomizationFile = 'customizationFile',
	/** Another AI agent reported a usage limit in the terminal. */
	AgentUsageLimit = 'agentUsageLimit',
	/** Changes in the Source Control view, a moment to let Copilot review and commit them. */
	ReviewChanges = 'reviewChanges',
	/** What the plan includes, in the center of the empty Chat view. */
	ChatWelcome = 'chatWelcome',
	/** Asking Copilot when a search finds nothing. */
	SearchFallback = 'searchFallback',
}

/** Every suggestion, in the order they are listed for developer mode. */
export const PLAN_NUDGE_IDS: readonly PlanNudgeId[] = [
	PlanNudgeId.CustomizationFile,
	PlanNudgeId.AgentUsageLimit,
	PlanNudgeId.ReviewChanges,
	PlanNudgeId.SearchFallback,
	PlanNudgeId.ChatWelcome,
];

/**
 * Suggestions that take attention or space where the user works. Each different
 * one the user sees counts towards {@link IPlanNudgeLimits.maxSeenNudges}. Quiet
 * entry points, such as a search fallback, do not count, so that they cannot use
 * up the budget, but they stop with the rest.
 */
export const COUNTED_PLAN_NUDGES: readonly PlanNudgeId[] = [
	PlanNudgeId.CustomizationFile,
	PlanNudgeId.AgentUsageLimit,
	PlanNudgeId.ReviewChanges,
];

/** Suggestions in Chat, where the user already is, which the budget does not stop. */
const IN_CHAT_PLAN_NUDGES: readonly PlanNudgeId[] = [PlanNudgeId.ChatWelcome];

/**
 * Suggestions that keep showing until the user closes them, however often they
 * showed and however many different suggestions the user has seen.
 */
const UNTIL_CLOSED_PLAN_NUDGES: readonly PlanNudgeId[] = [PlanNudgeId.CustomizationFile];

/**
 * The suggestions that developer mode shows, from the value of its setting: a map
 * of suggestion id to whether to show it.
 */
export function parsePlanNudgeDeveloperMode(value: unknown): ReadonlySet<PlanNudgeId> {
	const ids = new Set<PlanNudgeId>();
	if (typeof value === 'object' && value !== null) {
		const map = value as { readonly [id: string]: unknown };
		for (const id of PLAN_NUDGE_IDS) {
			if (map[id] === true) {
				ids.add(id);
			}
		}
	}
	return ids;
}

/**
 * Where a nudge appears. Moments interrupt the most, so they are rarer.
 */
export const enum PlanNudgeSurface {
	/** A card in the corner of the window, at a moment where Copilot can take over. */
	Moment = 'moment',
	/** A small inline hint in an editor, the Source Control view or a search. */
	Hint = 'hint',
	/** The center of the empty Chat view. */
	ChatWelcome = 'chatWelcome',
}

export type PlanCredits =
	| { readonly kind: 'remaining'; readonly remaining: number; readonly resetDate: Date | undefined; readonly unit: 'credits' | 'premiumRequests' }
	| { readonly kind: 'unlimited' }
	| { readonly kind: 'organizationCovered' };

export interface IPlanSummary {
	readonly planName: string;
	/** Whether an organization pays for the plan: Copilot Business or Enterprise. */
	readonly paidByOrganization: boolean;
	readonly organization: string | undefined;
	readonly credits: PlanCredits | undefined;
	/** Model families the user can pick, for example `Claude` or `GPT`. */
	readonly modelFamilies: readonly string[];
	/** The most capable model the user can pick in each family, by display name. */
	readonly models: readonly string[];
	/** Whether the user can pick more models than {@link models} names. */
	readonly hasMoreModels: boolean;
	/** Agent harnesses that run with the plan, for example `Claude` or `Codex`. */
	readonly harnesses: readonly string[];
}

/**
 * Below this share of remaining credits, advertising the allowance would
 * point at a limit the user is about to hit, so it is not shown.
 */
const MIN_ADVERTISED_PERCENT_REMAINING = 20;

/**
 * Describes the AI credits the user can still spend, or `undefined` when they
 * should not be advertised.
 */
export function getPlanCredits(premium: IQuotaSnapshot | undefined, usageBasedBilling: boolean | undefined, resetDate: string | undefined): PlanCredits | undefined {
	if (!premium || premium.hasQuota === false) {
		return undefined;
	}

	if (premium.unlimited) {
		// An organization pool without a per-user budget only reports what was used
		return typeof premium.creditsUsed === 'number' ? { kind: 'organizationCovered' } : { kind: 'unlimited' };
	}

	if (premium.percentRemaining < MIN_ADVERTISED_PERCENT_REMAINING) {
		return undefined;
	}

	const remaining = premium.quotaRemaining ?? (premium.entitlement ? premium.entitlement * premium.percentRemaining / 100 : undefined);
	if (remaining === undefined || remaining <= 0) {
		return undefined;
	}

	let reset: Date | undefined;
	if (premium.resetAt) {
		reset = new Date(premium.resetAt * 1000);
	} else if (resetDate) {
		const parsed = new Date(resetDate);
		reset = isNaN(parsed.getTime()) ? undefined : parsed;
	}

	return { kind: 'remaining', remaining: Math.floor(remaining), resetDate: reset, unit: usageBasedBilling ? 'credits' : 'premiumRequests' };
}

export interface IPlanModelInfo {
	readonly vendor: string;
	readonly family: string;
	readonly id: string;
	readonly name: string;
	readonly isBYOK?: boolean;
	/** Set on models of an agent host that come from a key the user brought. */
	readonly byokModelIdentifier?: string;
	readonly isUserSelectable?: boolean;
	/** The cost of a request relative to the base models, which is higher for more capable models. */
	readonly multiplierNumeric?: number;
	/** The cost of output tokens, which is higher for more capable models. */
	readonly outputCost?: number;
	/** The cost of input tokens. */
	readonly inputCost?: number;
	/** How capable the model is: `powerful`, `versatile` or `lightweight`. */
	readonly category?: string;
}

const MODEL_FAMILIES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
	{ name: 'Claude', pattern: /claude|anthropic/i },
	{ name: 'GPT', pattern: /gpt|openai|codex|\bo[134]\b/i },
	{ name: 'Gemini', pattern: /gemini|google/i },
	{ name: 'Grok', pattern: /grok|xai/i },
];

/**
 * Whether a model is a Copilot model that the user can pick.
 * @param copilotVendor The vendor of Copilot models. Omitted for the models of a
 * chat, which an agent host can provide under its own vendor.
 */
function isPickableCopilotModel(model: IPlanModelInfo, copilotVendor: string | undefined): boolean {
	// Auto picks a model for each request, so it does not stand for a model family
	return (copilotVendor === undefined || model.vendor === copilotVendor)
		&& !model.isBYOK && model.byokModelIdentifier === undefined
		&& !!model.isUserSelectable && model.id !== AUTO_RAW_MODEL_ID;
}

/**
 * The name of the well-known model family, for example `Claude`, ignoring case,
 * or `undefined` when it is not one.
 */
export function getModelFamilyName(family: string): string | undefined {
	return MODEL_FAMILIES.find(candidate => candidate.name.toLowerCase() === family.toLowerCase())?.name;
}

/**
 * The well-known model families among the Copilot models the user can pick.
 * Models that an organization disables are absent from the model list, so the
 * result only names families the organization allows.
 */
export function getModelFamilies(models: readonly IPlanModelInfo[], copilotVendor: string): string[] {
	const found = new Set<string>();
	for (const model of models) {
		if (!isPickableCopilotModel(model, copilotVendor)) {
			continue;
		}
		const identity = `${model.family} ${model.id} ${model.name}`;
		const family = MODEL_FAMILIES.find(candidate => candidate.pattern.test(identity));
		if (family) {
			found.add(family.name);
		}
	}
	return MODEL_FAMILIES.map(family => family.name).filter(name => found.has(name));
}

const MODEL_CATEGORY_RANK: { readonly [category: string]: number } = { powerful: 3, versatile: 2, lightweight: 1 };

function getModelVersion(name: string): number[] {
	return /\d+(?:\.\d+)*/.exec(name)?.[0].split('.').map(Number) ?? [];
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const difference = (a[i] ?? 0) - (b[i] ?? 0);
		if (difference) {
			return difference;
		}
	}
	return 0;
}

/**
 * Orders the more capable models first: by category, by cost, then the newest
 * version. Among variants of one version, the base model wins over variants such
 * as `Fast` or `(Preview)`, whose names are longer.
 */
function compareModelCapability(a: IPlanModelInfo, b: IPlanModelInfo): number {
	return (MODEL_CATEGORY_RANK[b.category ?? ''] ?? 0) - (MODEL_CATEGORY_RANK[a.category ?? ''] ?? 0)
		|| (b.outputCost ?? 0) - (a.outputCost ?? 0)
		|| (b.inputCost ?? 0) - (a.inputCost ?? 0)
		|| (b.multiplierNumeric ?? 0) - (a.multiplierNumeric ?? 0)
		|| compareVersions(getModelVersion(b.name), getModelVersion(a.name))
		|| a.name.length - b.name.length
		|| a.name.localeCompare(b.name);
}

/** The model line without its version, for example `claude opus` for `Claude Opus 5.5`. */
function getModelLine(name: string): string {
	return name.replace(/\d+(?:\.\d+)*/g, '').replace(/[\s-]+/g, ' ').trim().toLowerCase();
}

/**
 * The most capable of the given models. Older versions of a model line can cost
 * more than the newest one, so only the newest version of each line competes,
 * for example `Claude Opus 5.5` over `Claude Opus 4.6`, and then the most
 * capable line wins, for example `GPT-6 Astra` over `GPT-6.1 Sol`.
 */
function getMostCapableModel<T extends IPlanModelInfo>(models: readonly T[]): T | undefined {
	const newest = new Map<string, T>();
	for (const model of models) {
		const line = getModelLine(model.name);
		const current = newest.get(line);
		if (!current || compareVersions(getModelVersion(model.name), getModelVersion(current.name)) > 0) {
			newest.set(line, model);
		}
	}
	return [...newest.values()].sort(compareModelCapability)[0];
}

/**
 * Finds the most capable Copilot model the user can pick from the given model
 * family, for example among the models that a chat offers.
 * @param copilotVendor Only considers models of this vendor, when given.
 */
export function findModelOfFamily<T extends IPlanModelInfo>(models: readonly T[], family: string, copilotVendor?: string): T | undefined {
	const pattern = MODEL_FAMILIES.find(candidate => candidate.name === family)?.pattern;
	return pattern && getMostCapableModel(models.filter(model => isPickableCopilotModel(model, copilotVendor) && pattern.test(`${model.family} ${model.id} ${model.name}`)));
}

/**
 * The most capable model of each well-known family that the user can pick, by
 * display name, so that the plan can name the models it includes. Like
 * {@link getModelFamilies}, it only names models the organization allows, so a
 * family that the organization disables makes room for the next one.
 */
export function getFlagshipModels(models: readonly IPlanModelInfo[], copilotVendor: string, max = 3): { readonly names: string[]; readonly hasMore: boolean } {
	const pickable = models.filter(model => isPickableCopilotModel(model, copilotVendor));
	const names: string[] = [];
	for (const family of MODEL_FAMILIES) {
		const best = getMostCapableModel(pickable.filter(model => family.pattern.test(`${model.family} ${model.id} ${model.name}`)));
		if (best && names.length < max) {
			names.push(best.name);
		}
	}
	return { names, hasMore: pickable.length > names.length };
}

/**
 * Joins items into a list in the display language, for example `Claude, GPT, and Gemini`,
 * `Copilot, Claude, or Codex` for a `disjunction`, or `Claude, GPT, Gemini` for a `unit`
 * list that continues.
 */
export type PlanListType = 'conjunction' | 'disjunction' | 'unit';

export function formatPlanList(items: readonly string[], language: string, type: PlanListType = 'conjunction'): string {
	try {
		return new Intl.ListFormat(language, { type }).format(items);
	} catch {
		return items.join(', ');
	}
}

/**
 * The parts of a list as {@link formatPlanList} formats it, so that its items
 * can render differently from the separators between them.
 */
export function getPlanListParts(items: readonly string[], language: string, type: PlanListType = 'conjunction'): { readonly value: string; readonly isItem: boolean }[] {
	try {
		return new Intl.ListFormat(language, { type }).formatToParts(items).map(part => ({ value: part.value, isItem: part.type === 'element' }));
	} catch {
		return items.flatMap((item, index) => index ? [{ value: ', ', isItem: false }, { value: item, isItem: true }] : [{ value: item, isItem: true }]);
	}
}

/**
 * A fact about what the plan includes, with the part that matters most, such as
 * the number of AI credits or the model names, emphasized for reading at a glance.
 */
export interface IPlanFact {
	readonly before: string;
	readonly emphasis: string;
	readonly after: string;
	/** The names that the emphasized part lists, which the user can pick. */
	readonly choices?: IPlanFactChoices;
}

/** Models or harnesses that a fact lists, as {@link formatPlanList} formats them. */
export interface IPlanFactChoices {
	readonly kind: 'model' | 'harness';
	readonly names: readonly string[];
	readonly listType: PlanListType;
}

/** Marks where the emphasized part goes in a localized fact. */
const EMPHASIS = '\u0001';

function planFact(localized: string, emphasis: string, choices?: IPlanFactChoices): IPlanFact {
	const index = localized.indexOf(EMPHASIS);
	return index === -1
		? { before: localized, emphasis: '', after: '' }
		: { before: localized.slice(0, index), emphasis, after: localized.slice(index + EMPHASIS.length), choices };
}

function planListFact(localized: string, choices: IPlanFactChoices, language: string): IPlanFact {
	return planFact(localized, formatPlanList(choices.names, language, choices.listType), choices);
}

export function getPlanFactText(fact: IPlanFact): string {
	return `${fact.before}${fact.emphasis}${fact.after}`;
}

export function getPlanFactMarkdown(fact: IPlanFact): string {
	const emphasis = fact.emphasis ? `**${escapeMarkdownSyntaxTokens(fact.emphasis)}**` : '';
	return `${escapeMarkdownSyntaxTokens(fact.before)}${emphasis}${escapeMarkdownSyntaxTokens(fact.after)}`;
}

/**
 * The amount of AI credits the user can spend, for example `10,000 AI credits`.
 */
export function getPlanCreditsAmount(credits: PlanCredits | undefined, language: string): string | undefined {
	if (credits?.kind !== 'remaining') {
		return undefined;
	}
	const amount = credits.remaining.toLocaleString(language);
	return credits.unit === 'credits'
		? localize('planAwareness.credits.amount', "{0} AI credits", amount)
		: localize('planAwareness.premium.amount', "{0} premium requests", amount);
}

/**
 * What the plan includes, in display order: the AI credits, the most capable
 * models and the agents.
 */
export function getPlanFacts(summary: IPlanSummary, language: string): IPlanFact[] {
	const facts: IPlanFact[] = [];
	const paidByOrganization = summary.paidByOrganization;

	const amount = getPlanCreditsAmount(summary.credits, language);
	if (amount) {
		facts.push(paidByOrganization
			? planFact(localize('planAwareness.fact.credits.organization', "{0} available, paid by your organization", EMPHASIS), amount)
			: planFact(localize('planAwareness.fact.credits.plan', "{0} available in your {1} plan", EMPHASIS, summary.planName), amount));
	} else if (summary.credits?.kind === 'unlimited') {
		facts.push(planFact(localize('planAwareness.fact.unlimited', "{0} in your {1} plan", EMPHASIS, summary.planName), localize('planAwareness.fact.unlimited.emphasis', "Unlimited Copilot usage")));
	} else if (summary.credits?.kind === 'organizationCovered') {
		facts.push(planFact(localize('planAwareness.fact.organizationCovered', "Copilot usage is {0}", EMPHASIS), localize('planAwareness.fact.organizationCovered.emphasis', "paid by your organization")));
	} else {
		facts.push(planFact(localize('planAwareness.fact.plan', "Included in your {0}", EMPHASIS), paidByOrganization
			? localize('planAwareness.fact.plan.seat', "{0} seat", summary.planName)
			: localize('planAwareness.fact.plan.individual', "{0} plan", summary.planName)));
	}

	if (summary.models.length > 0) {
		facts.push(summary.hasMoreModels
			? planListFact(localize('planAwareness.fact.models.more', "{0}, …", EMPHASIS), { kind: 'model', names: summary.models, listType: 'unit' }, language)
			: planListFact(localize('planAwareness.fact.models', "{0} models", EMPHASIS), { kind: 'model', names: summary.models, listType: 'conjunction' }, language));
	} else if (summary.modelFamilies.length > 0) {
		facts.push(planListFact(localize('planAwareness.fact.models', "{0} models", EMPHASIS), { kind: 'model', names: summary.modelFamilies, listType: 'conjunction' }, language));
	}

	if (summary.harnesses.length > 0) {
		facts.push(planListFact(localize('planAwareness.fact.harnesses', "Use the {0} harness", EMPHASIS), { kind: 'harness', names: ['Copilot', ...summary.harnesses], listType: 'disjunction' }, language));
	}

	return facts;
}

/**
 * The AI credits of the plan in one sentence, with the amount emphasized, for
 * hints that have room for one line, for example
 * `You have **10,000 AI credits** available, paid by your organization.`
 */
export function getPlanCreditsSentence(summary: IPlanSummary, language: string): IPlanFact {
	const amount = getPlanCreditsAmount(summary.credits, language);
	const paidByOrganization = summary.paidByOrganization;
	if (amount) {
		return paidByOrganization
			? planFact(localize('planAwareness.sentence.credits.organization', "You have {0} available, paid by your organization.", EMPHASIS), amount)
			: planFact(localize('planAwareness.sentence.credits.plan', "You have {0} available in your {1} plan.", EMPHASIS, summary.planName), amount);
	}
	if (summary.credits?.kind === 'organizationCovered') {
		return planFact(localize('planAwareness.sentence.organizationCovered', "Your organization pays for your Copilot usage."), '');
	}
	return planFact(paidByOrganization
		? localize('planAwareness.sentence.seat', "Included in your {0} seat.", summary.planName)
		: localize('planAwareness.sentence.plan', "Included in your {0} plan.", summary.planName), '');
}

/**
 * The AI credits of the plan in one short sentence, with the amount emphasized,
 * for hints in narrow places, for example `You have **10,000 AI credits** available.`
 */
export function getPlanCreditsAvailableFact(summary: IPlanSummary, language: string): IPlanFact {
	const amount = getPlanCreditsAmount(summary.credits, language);
	return amount
		? planFact(localize('planAwareness.fact.creditsAvailable', "You have {0} available.", EMPHASIS), amount)
		: getPlanCreditsSentence(summary, language);
}

/**
 * The AI credits of the plan in a few words, with the amount emphasized, for
 * hints that have one short line, for example `**10,000 AI credits** available, paid by your organization`.
 */
export function getPlanCreditsPhrase(summary: IPlanSummary, language: string): IPlanFact {
	const amount = getPlanCreditsAmount(summary.credits, language);
	if (amount) {
		return summary.paidByOrganization
			? planFact(localize('planAwareness.phrase.credits.organization', "{0} available, paid by your organization", EMPHASIS), amount)
			: planFact(localize('planAwareness.phrase.credits.plan', "{0} available in your {1} plan", EMPHASIS, summary.planName), amount);
	}
	return summary.paidByOrganization
		? planFact(localize('planAwareness.phrase.organization', "Paid by your organization"), '')
		: planFact(localize('planAwareness.phrase.plan', "Included in your {0} plan", summary.planName), '');
}

export interface IPlanNudgeState {
	/** When a moment was last shown, in milliseconds since the epoch. */
	readonly lastMomentShownAt?: number;
	/** When each nudge was last shown, in milliseconds since the epoch. */
	readonly lastShownAt?: { readonly [id: string]: number };
	readonly shownCounts: { readonly [id: string]: number };
	readonly dismissed: readonly string[];
}

export interface IPlanNudgeLimits {
	/** The minimum time between two moments, in milliseconds. */
	readonly momentIntervalMs: number;
	/**
	 * The minimum time before the same moment shows again, in milliseconds. It also
	 * applies to moments about something that blocks the user, such as a usage limit.
	 */
	readonly momentRepeatIntervalMs: number;
	/** How often the same moment is shown at most. */
	readonly maxMomentShows: number;
	/** How often the same hint is shown at most. */
	readonly maxHintShows: number;
	/**
	 * After seeing this many different {@link COUNTED_PLAN_NUDGES}, the user knows
	 * what the plan includes, so no more suggestions show outside of Chat.
	 */
	readonly maxSeenNudges: number;
}

export const DEFAULT_PLAN_NUDGE_LIMITS: IPlanNudgeLimits = {
	momentIntervalMs: 3 * 24 * 60 * 60 * 1000,
	momentRepeatIntervalMs: 7 * 24 * 60 * 60 * 1000,
	maxMomentShows: 3,
	maxHintShows: 3,
	maxSeenNudges: 2,
};

/**
 * The different suggestions that count towards the budget which the user has seen.
 */
export function getSeenPlanNudges(state: IPlanNudgeState): PlanNudgeId[] {
	return COUNTED_PLAN_NUDGES.filter(id => (state.shownCounts[id] ?? 0) > 0);
}

/**
 * Whether the user has seen enough different suggestions that no more show outside of Chat.
 */
export function isPlanNudgeBudgetUsed(state: IPlanNudgeState, limits: IPlanNudgeLimits = DEFAULT_PLAN_NUDGE_LIMITS): boolean {
	return getSeenPlanNudges(state).length >= limits.maxSeenNudges;
}

/**
 * Whether a nudge may be shown: dismissed nudges never return, nudges that show
 * until closed have no other limit, no nudge shows outside of Chat once the user
 * has seen a few different ones, moments are spaced out and shown a few times
 * each, and hints are shown a few times.
 */
export function canShowPlanNudge(state: IPlanNudgeState, id: PlanNudgeId, surface: PlanNudgeSurface, now: number, limits: IPlanNudgeLimits = DEFAULT_PLAN_NUDGE_LIMITS): boolean {
	if (state.dismissed.includes(id)) {
		return false;
	}

	if (UNTIL_CLOSED_PLAN_NUDGES.includes(id)) {
		return true;
	}

	if (!IN_CHAT_PLAN_NUDGES.includes(id) && isPlanNudgeBudgetUsed(state, limits)) {
		return false;
	}

	const shown = state.shownCounts[id] ?? 0;
	if (surface === PlanNudgeSurface.Moment) {
		if (shown >= limits.maxMomentShows) {
			return false;
		}
		const lastShownAt = state.lastShownAt?.[id];
		if (lastShownAt !== undefined && now - lastShownAt < limits.momentRepeatIntervalMs) {
			return false;
		}
		return state.lastMomentShownAt === undefined || now - state.lastMomentShownAt >= limits.momentIntervalMs;
	}

	return shown < limits.maxHintShows;
}

export function recordPlanNudgeShown(state: IPlanNudgeState, id: PlanNudgeId, surface: PlanNudgeSurface, now: number): IPlanNudgeState {
	return {
		lastMomentShownAt: surface === PlanNudgeSurface.Moment ? now : state.lastMomentShownAt,
		lastShownAt: { ...state.lastShownAt, [id]: now },
		shownCounts: { ...state.shownCounts, [id]: (state.shownCounts[id] ?? 0) + 1 },
		dismissed: state.dismissed,
	};
}

export function recordPlanNudgeDismissed(state: IPlanNudgeState, id: PlanNudgeId): IPlanNudgeState {
	return state.dismissed.includes(id) ? state : { ...state, dismissed: [...state.dismissed, id] };
}

/**
 * Parses persisted nudge state, falling back to an empty state when the
 * stored value is missing or malformed.
 */
export function parsePlanNudgeState(raw: string | undefined): IPlanNudgeState {
	const empty: IPlanNudgeState = { shownCounts: {}, dismissed: [] };
	if (!raw) {
		return empty;
	}
	let value: { lastMomentShownAt?: unknown; lastShownAt?: unknown; shownCounts?: unknown; dismissed?: unknown };
	try {
		value = JSON.parse(raw);
	} catch {
		return empty;
	}
	if (typeof value !== 'object' || value === null) {
		return empty;
	}
	const numbers = (record: unknown) => {
		const result: { [id: string]: number } = {};
		if (typeof record === 'object' && record !== null) {
			for (const [key, number] of Object.entries(record)) {
				if (typeof number === 'number') {
					result[key] = number;
				}
			}
		}
		return result;
	};
	return {
		lastMomentShownAt: typeof value.lastMomentShownAt === 'number' ? value.lastMomentShownAt : undefined,
		lastShownAt: numbers(value.lastShownAt),
		shownCounts: numbers(value.shownCounts),
		dismissed: Array.isArray(value.dismissed) ? value.dismissed.filter((id): id is string => typeof id === 'string') : [],
	};
}

/**
 * Another AI agent that runs in the terminal, as configured by the product in
 * `chatPlanAwarenessTerminalAgents`.
 */
export interface ITerminalAgent {
	readonly name: string;
	/** The commands that start the agent, each split into its words, for example `npx` and the package. */
	readonly commands: readonly (readonly string[])[];
	/** The options or subcommands that are followed by a prompt, such as `-p` or `exec`. */
	readonly promptArguments: readonly string[];
	/** The well-known family of the Copilot model to continue with. */
	readonly modelFamily: string | undefined;
	readonly limitReached: readonly RegExp[];
	readonly limitApproaching: readonly RegExp[];
}

function compilePatterns(patterns: unknown): RegExp[] {
	const result: RegExp[] = [];
	for (const pattern of Array.isArray(patterns) ? patterns : []) {
		if (typeof pattern === 'string' && pattern) {
			try {
				result.push(new RegExp(pattern));
			} catch {
				// An invalid pattern detects nothing
			}
		}
	}
	return result;
}

function toStrings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map(item => item.trim()) : [];
}

/**
 * The terminal agents that the product configures, skipping entries that are
 * not valid, for example without a name, commands or usage limit patterns.
 */
export function parseTerminalAgents(configuration: readonly IChatPlanAwarenessTerminalAgent[] | undefined): ITerminalAgent[] {
	const agents: ITerminalAgent[] = [];
	for (const entry of Array.isArray(configuration) ? configuration : []) {
		if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string' || !entry.name.trim()) {
			continue;
		}
		const commands = toStrings(entry.commands);
		const limitReached = compilePatterns(entry.limitReachedOutput);
		if (!commands.length || !limitReached.length) {
			continue;
		}
		agents.push({
			name: entry.name.trim(),
			commands: commands.map(command => command.split(/\s+/)),
			promptArguments: toStrings(entry.promptArguments),
			modelFamily: typeof entry.modelFamily === 'string' ? getModelFamilyName(entry.modelFamily) : undefined,
			limitReached,
			limitApproaching: compilePatterns(entry.limitApproachingOutput),
		});
	}
	return agents;
}

interface ICommandLineWord {
	readonly value: string;
	/** Whether any part of the word was quoted, as prompts with several words are. */
	readonly quoted: boolean;
	/** Whether the word is an option such as `-p` or `--model=opus`: it starts with an unquoted `-`. */
	readonly option: boolean;
}

/**
 * Splits the first command of a shell command line into its words, removing
 * quotes and escapes. It ends at an operator that starts another command or
 * redirects, such as `|`, `;`, `&` or `>`, and at a comment.
 */
function splitCommandLine(commandLine: string): ICommandLineWord[] {
	const words: ICommandLineWord[] = [];
	let value = '';
	let quoted = false;
	let option = false;
	let inWord = false;
	const endWord = () => {
		if (inWord) {
			words.push({ value, quoted, option });
		}
		value = '';
		quoted = option = inWord = false;
	};
	for (let i = 0; i < commandLine.length; i++) {
		const char = commandLine[i];
		if (/\s/.test(char)) {
			endWord();
		} else if (char === '\'') {
			const end = commandLine.indexOf('\'', i + 1);
			value += commandLine.slice(i + 1, end === -1 ? undefined : end);
			quoted = inWord = true;
			i = end === -1 ? commandLine.length : end;
		} else if (char === '"') {
			quoted = inWord = true;
			for (i++; i < commandLine.length && commandLine[i] !== '"'; i++) {
				if (commandLine[i] === '\\' && i + 1 < commandLine.length && '"\\$`'.includes(commandLine[i + 1])) {
					i++;
				}
				value += commandLine[i];
			}
		} else if (char === '\\') {
			value += commandLine[++i] ?? '';
			inWord = true;
		} else if ('|;&<>'.includes(char) || (char === '#' && !inWord)) {
			break;
		} else {
			option ||= !inWord && char === '-';
			value += char;
			inWord = true;
		}
	}
	endWord();
	return words;
}

/**
 * The prompt among the arguments of an agent. Options may come before or after
 * it, and which options take a value is not known, so a prompt of several words
 * is the quoted argument that is not an option, after a prompt argument when there
 * is one. Otherwise, a prompt argument such as `-p` may be followed by an unquoted
 * prompt of one word, or give it as `--print=…`. An unquoted argument without a
 * prompt argument may be a subcommand, so it is not taken for a prompt.
 */
function findAgentPrompt(args: readonly ICommandLineWord[], promptArguments: readonly string[]): string | undefined {
	let promptArgument = -1;
	for (let i = 0; i < args.length && promptArgument === -1; i++) {
		const word = args[i];
		const inline = word.option ? promptArguments.find(argument => word.value.startsWith(`${argument}=`)) : undefined;
		if (inline) {
			return word.value.slice(inline.length + 1).trim() || undefined;
		}
		if (!word.quoted && promptArguments.includes(word.value)) {
			promptArgument = i;
		}
	}
	const quoted = args.find((word, index) => index > promptArgument && word.quoted && !word.option && word.value.trim());
	if (quoted) {
		return quoted.value.trim();
	}
	const next = promptArgument === -1 ? undefined : args[promptArgument + 1];
	return next && !next.option && next.value.trim() ? next.value.trim() : undefined;
}

/**
 * Detects a terminal command line that starts one of the given agents, and the
 * prompt it gives the agent.
 */
export function parseAgentCommandLine(commandLine: string, agents: readonly ITerminalAgent[]): { readonly agent: ITerminalAgent; readonly prompt: string | undefined } | undefined {
	const words = splitCommandLine(commandLine);
	for (const agent of agents) {
		const command = agent.commands.find(command => command.length <= words.length && command.every((part, index) => !words[index].quoted && words[index].value === part));
		if (command) {
			return { agent, prompt: findAgentPrompt(words.slice(command.length), agent.promptArguments) };
		}
	}
	return undefined;
}

/**
 * Whether the output of an agent reports that its usage limit was reached or is
 * close. The patterns match the output without whitespace, because terminal UIs
 * may draw spaces by moving the cursor instead, and in lowercase.
 */
export function getAgentLimitState(output: string, agent: ITerminalAgent): 'reached' | 'approaching' | undefined {
	const compact = output.replace(/\s+/g, '').toLowerCase();
	if (agent.limitReached.some(pattern => pattern.test(compact))) {
		return 'reached';
	}
	if (agent.limitApproaching.some(pattern => pattern.test(compact))) {
		return 'approaching';
	}
	return undefined;
}

//#region Customization file hint

/**
 * Shows the customization file hint. An experiment-controlled setting, so an
 * experiment can compare it with no hint.
 */
export const CUSTOMIZATION_HINT_SETTING_ID = 'chat.planAwareness.customizationHint.enabled';

/**
 * Treatments that tune the customization file hint.
 */
export const enum CustomizationHintTreatment {
	/**
	 * A number: the hint shows when the user has not sent a Copilot request in this
	 * many days, and sent fewer than {@link CUSTOMIZATION_HINT_ACTIVE_REQUESTS} in
	 * the last {@link CUSTOMIZATION_HINT_ACTIVE_PERIOD_DAYS} days.
	 */
	InactiveDays = 'chatPlanCustomizationHintInactiveDays',
	/** A string that replaces the text of the hint. `{credits}` and `{plan}` stand for the AI credits and the plan name. */
	Text = 'chatPlanCustomizationHintText',
	/** A string that replaces the label of the action that opens Copilot. */
	Action = 'chatPlanCustomizationHintAction',
}

/** The one line above the first line of a customization file. */
export interface ICustomizationHintPresentation {
	/** For example `Copilot picks up your skill files`, followed by {@link credits}. */
	readonly text: IPlanFact;
	/** For example `**10,000 AI credits** available, paid by your organization`, unless a text treatment replaced the text. */
	readonly credits: IPlanFact | undefined;
	readonly action: string;
}

export const DEFAULT_CUSTOMIZATION_HINT_INACTIVE_DAYS = 14;
/** Users who sent this many Copilot requests in {@link CUSTOMIZATION_HINT_ACTIVE_PERIOD_DAYS} use Copilot, so they see no hint. */
export const CUSTOMIZATION_HINT_ACTIVE_REQUESTS = 4;
export const CUSTOMIZATION_HINT_ACTIVE_PERIOD_DAYS = 28;
const MAX_INACTIVE_DAYS = 365;
/** The hint has one short line. */
const MAX_CUSTOMIZATION_HINT_TEXT_LENGTH = 120;
const MAX_CUSTOMIZATION_HINT_ACTION_LENGTH = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomizationFileKind = 'instructions' | 'skill' | 'agent' | 'prompt';

/**
 * What a customization file that Copilot reads holds: agent instructions such as
 * `CLAUDE.md` and `AGENTS.md`, a skill, an agent or a prompt.
 */
export function getCustomizationFileKind(uri: URI): CustomizationFileKind | undefined {
	const name = basename(uri);
	if (name === CLAUDE_MD_FILENAME || name === CLAUDE_LOCAL_MD_FILENAME || name === AGENT_MD_FILENAME) {
		return 'instructions';
	}
	switch (getPromptFileType(uri)) {
		case PromptsType.instructions: return 'instructions';
		case PromptsType.skill: return 'skill';
		case PromptsType.agent: return 'agent';
		case PromptsType.prompt: return 'prompt';
		default: return undefined;
	}
}

/**
 * How many of the user's most recent Copilot requests are remembered, enough to
 * tell whether the user sent as many as any suggestion requires recently.
 */
export const MAX_RECENT_CHAT_REQUESTS = 4;

/**
 * Adds Copilot requests to the times of the most recent requests, newest first.
 * A time that is already known is the same request, for example one that another
 * window stored too.
 */
export function addRecentChatRequests(recentChatRequests: readonly number[], ...times: number[]): number[] {
	return [...new Set([...recentChatRequests, ...times])].filter(time => time > 0).sort((a, b) => b - a).slice(0, MAX_RECENT_CHAT_REQUESTS);
}

/**
 * Parses the stored times of the most recent Copilot requests, `undefined` when
 * none were stored.
 */
export function parseRecentChatRequests(value: string | undefined): number[] | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return addRecentChatRequests(parsed.filter((time): time is number => typeof time === 'number' && Number.isFinite(time)));
		}
	} catch {
		// Stored by an incompatible version
	}
	return undefined;
}

/**
 * Whether the user sent fewer than the given number of Copilot requests in the
 * given number of days.
 * @param recentChatRequests The times of the most recent requests, or `undefined`
 * while they are still unknown.
 * @param requests At most {@link MAX_RECENT_CHAT_REQUESTS}.
 */
export function isCopilotHardlyUsed(recentChatRequests: readonly number[] | undefined, now: number, days: number, requests: number): boolean {
	return recentChatRequests !== undefined && recentChatRequests.filter(time => now - time < days * DAY_MS).length < requests;
}

export interface ICustomizationHintContext {
	/** Whether the setting shows the hint. */
	readonly enabled: boolean;
	/** The times of the most recent Copilot requests, newest first, or `undefined` while unknown. */
	readonly recentChatRequests: readonly number[] | undefined;
	/** The {@link CustomizationHintTreatment.InactiveDays} treatment, if assigned. */
	readonly inactiveDays: unknown;
	/** Whether the user did not close the hint. */
	readonly withinLimits: boolean;
	readonly now: number;
}

/**
 * Decides whether to show the customization file hint to a paid user with
 * Copilot enabled who opened a customization file that Copilot reads. Logs the
 * experiment triggers where the experiment arms start to differ, under
 * conditions that are the same in every arm.
 */
export function shouldShowCustomizationHint(context: ICustomizationHintContext, telemetryService: ITelemetryService): boolean {
	const days = getInactiveDays(context.inactiveDays, DEFAULT_CUSTOMIZATION_HINT_INACTIVE_DAYS);
	const inactive = isCopilotHardlyUsed(context.recentChatRequests, context.now, days, 1)
		&& isCopilotHardlyUsed(context.recentChatRequests, context.now, CUSTOMIZATION_HINT_ACTIVE_PERIOD_DAYS, CUSTOMIZATION_HINT_ACTIVE_REQUESTS);
	if (inactive) {
		logSettingExperimentTrigger(telemetryService, CUSTOMIZATION_HINT_SETTING_ID);
	}
	if (!context.enabled) {
		return false;
	}
	// Before the inactivity check, so that every number of days logs it for the same users
	logExperimentTrigger(telemetryService, CustomizationHintTreatment.InactiveDays);
	return inactive && context.withinLimits;
}

function getInactiveDays(value: unknown, defaultDays: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_INACTIVE_DAYS
		? value
		: defaultDays;
}

/**
 * Fills the `{credits}` and `{plan}` placeholders of a text treatment, or
 * returns `undefined` when the treatment is invalid or a placeholder has no value.
 */
export function formatCustomizationHintText(template: unknown, values: { readonly credits: string | undefined; readonly plan: string }): string | undefined {
	if (typeof template !== 'string' || !template.trim() || template.length > MAX_CUSTOMIZATION_HINT_TEXT_LENGTH) {
		return undefined;
	}
	let missing = false;
	const text = template.replace(/\{(?<name>credits|plan)\}/g, (_match, name: string) => {
		const value = name === 'credits' ? values.credits : values.plan;
		missing ||= value === undefined;
		return value ?? '';
	});
	return missing ? undefined : text.trim();
}

/**
 * The text and action label of the customization file hint, which treatments
 * may replace. Logs their experiment triggers, as the hint renders in every arm.
 * @param telemetryService Omitted for previews, which are not part of experiments.
 */
export function getCustomizationHintPresentation(
	treatments: { readonly text: unknown; readonly action: unknown },
	defaults: { readonly text: string; readonly credits: IPlanFact; readonly action: string },
	values: { readonly credits: string | undefined; readonly plan: string },
	telemetryService: ITelemetryService | undefined,
): ICustomizationHintPresentation {
	if (telemetryService) {
		logExperimentTrigger(telemetryService, CustomizationHintTreatment.Text);
		logExperimentTrigger(telemetryService, CustomizationHintTreatment.Action);
	}
	const text = formatCustomizationHintText(treatments.text, values);
	const action = typeof treatments.action === 'string' && treatments.action.trim() && treatments.action.length <= MAX_CUSTOMIZATION_HINT_ACTION_LENGTH ? treatments.action.trim() : undefined;
	return {
		// A text treatment replaces the whole text, so it decides what the hint says
		text: text ? emphasize(text, values.credits) : emphasize(defaults.text, undefined),
		credits: text ? undefined : defaults.credits,
		action: action ?? defaults.action,
	};
}

function emphasize(text: string, part: string | undefined): IPlanFact {
	const index = part ? text.indexOf(part) : -1;
	return index === -1 || !part
		? { before: text, emphasis: '', after: '' }
		: { before: text.slice(0, index), emphasis: part, after: text.slice(index + part.length) };
}

//#endregion

//#region Chat welcome

/**
 * Shows what the plan includes in the center of the empty Chat view to Business
 * and Enterprise users who hardly used Copilot for a while. An
 * experiment-controlled setting, so an experiment can compare it with nothing.
 */
export const CHAT_WELCOME_SETTING_ID = 'chat.planAwareness.chatWelcome.enabled';

/**
 * Treatments that tune the plan in the empty Chat view.
 */
export const enum ChatWelcomeTreatment {
	/** A number: the plan shows when the user sent fewer than {@link CHAT_WELCOME_ACTIVE_REQUESTS} Copilot requests in this many days. */
	InactiveDays = 'chatPlanChatWelcomeInactiveDays',
}

export const DEFAULT_CHAT_WELCOME_INACTIVE_DAYS = 21;
/** Users who sent this many Copilot requests recently use Copilot, so the empty Chat view shows no plan. */
export const CHAT_WELCOME_ACTIVE_REQUESTS = 2;

export interface IChatWelcomeContext {
	/** Whether the setting shows the plan. */
	readonly enabled: boolean;
	readonly paidByOrganization: boolean;
	/** The times of the most recent Copilot requests, newest first, or `undefined` while unknown. */
	readonly recentChatRequests: readonly number[] | undefined;
	/** The {@link ChatWelcomeTreatment.InactiveDays} treatment, if assigned. */
	readonly inactiveDays: unknown;
	readonly now: number;
}

/**
 * Decides whether a paid user with Copilot enabled sees what their plan includes
 * in the empty Chat view. Logs the experiment triggers where the experiment arms
 * start to differ, under conditions that are the same in every arm, so the
 * caller checks whether the user dismissed it afterwards.
 */
export function shouldShowPlanInChatWelcome(context: IChatWelcomeContext, telemetryService: ITelemetryService): boolean {
	if (!context.paidByOrganization) {
		return false;
	}
	const days = getInactiveDays(context.inactiveDays, DEFAULT_CHAT_WELCOME_INACTIVE_DAYS);
	const inactive = isCopilotHardlyUsed(context.recentChatRequests, context.now, days, CHAT_WELCOME_ACTIVE_REQUESTS);
	if (inactive) {
		logSettingExperimentTrigger(telemetryService, CHAT_WELCOME_SETTING_ID);
	}
	if (!context.enabled) {
		return false;
	}
	// Before the inactivity check, so that every number of days logs it for the same users
	logExperimentTrigger(telemetryService, ChatWelcomeTreatment.InactiveDays);
	return inactive;
}

//#endregion

//#region Plan suggestions

/**
 * Shows suggestions about the plan at moments where Copilot could help, such as
 * when another agent reaches its usage limit, in the Source Control view and when
 * a search finds nothing. An experiment-controlled setting, so an experiment can
 * compare them with no suggestions.
 */
export const PLAN_SUGGESTIONS_SETTING_ID = 'chat.planAwareness.enabled';

/** Suggestions apply to users who sent no Copilot request in this many days. */
export const PLAN_SUGGESTIONS_INACTIVE_DAYS = 28;

export interface IPlanSuggestionsContext {
	/** Whether the setting shows suggestions. */
	readonly enabled: boolean;
	/** The times of the most recent Copilot requests, newest first, or `undefined` while unknown. */
	readonly recentChatRequests: readonly number[] | undefined;
	readonly now: number;
}

/**
 * Decides whether suggestions apply to a paid user with Copilot enabled. Every
 * suggestion requires this, so the experiment arms start to differ from here on,
 * and it logs the experiment trigger for the same users in every arm. The trigger
 * is not tied to a single suggestion, because Search and Quick Open offer theirs
 * where only the treatment runs any code of this feature.
 */
export function shouldShowPlanSuggestions(context: IPlanSuggestionsContext, telemetryService: ITelemetryService): boolean {
	if (!isCopilotHardlyUsed(context.recentChatRequests, context.now, PLAN_SUGGESTIONS_INACTIVE_DAYS, 1)) {
		return false;
	}
	logSettingExperimentTrigger(telemetryService, PLAN_SUGGESTIONS_SETTING_ID);
	return context.enabled;
}

//#endregion
