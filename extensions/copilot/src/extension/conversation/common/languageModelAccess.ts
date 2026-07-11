/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IChatEndpoint, IChatEndpointTokenPricing } from '../../../platform/networking/common/networking';
import * as l10n from '@vscode/l10n';
import type { LanguageModelChatInformation, LanguageModelConfigurationSchema } from 'vscode';

/**
 * Picks a sensible default reasoning-effort level given the levels advertised
 * by an endpoint and the model `family`. The picker must never receive
 * `undefined`, otherwise the UI shows an "undefined" state.
 *
 * Selection order:
 *  - claude families  → 'high' if available
 *  - other families   → 'medium' if available
 *  - fallback         → the first advertised level
 */
export function pickDefaultReasoningEffort(effortLevels: readonly string[], family: string): string | undefined {
	if (effortLevels.length === 0) {
		return undefined;
	}
	const lowerFamily = family.toLowerCase();
	const preferred = lowerFamily.startsWith('claude') ? 'high' : 'medium';
	if (effortLevels.includes(preferred)) {
		return preferred;
	}
	return effortLevels[0];
}

/**
 * Returns the localized description shown in the picker hover for a given
 * reasoning-effort `level`. Centralised here so every provider surfaces the
 * same wording. Falls back to the raw level for unknown values.
 */
export function getReasoningEffortDescription(level: string): string {
	switch (level) {
		case 'none': return l10n.t('No reasoning applied');
		case 'minimal': return l10n.t('Minimal reasoning for fastest responses');
		case 'low': return l10n.t('Faster responses with less reasoning');
		case 'medium': return l10n.t('Balanced reasoning and speed');
		case 'high': return l10n.t('Greater reasoning depth but slower');
		case 'xhigh': return l10n.t('Highest reasoning depth but slowest');
		case 'max': return l10n.t('Absolute maximum capability with no constraints');
		default: return level;
	}
}

/**
 * Returns the localized, title-cased picker label for a given
 * reasoning-effort `level`. Centralised here so every provider surfaces the
 * same wording. Falls back to capitalizing an unknown value.
 */
export function getReasoningEffortLabel(level: string): string {
	switch (level) {
		case 'none': return l10n.t('None');
		case 'minimal': return l10n.t('Minimal');
		case 'low': return l10n.t('Low');
		case 'medium': return l10n.t('Medium');
		case 'high': return l10n.t('High');
		case 'xhigh': return l10n.t('Extra High');
		case 'max': return l10n.t('Max');
		default: return level.charAt(0).toUpperCase() + level.slice(1);
	}
}

/**
 * Builds the `reasoningEffort` property descriptor for a model's
 * {@link LanguageModelConfigurationSchema}. Centralises the default-selection
 * and localized descriptions so the picker stays consistent across the
 * Copilot and BYOK code paths.
 */
export function buildReasoningEffortSchemaProperty(effortLevels: readonly string[], family: string): NonNullable<LanguageModelConfigurationSchema['properties']>[string] {
	return {
		type: 'string',
		title: l10n.t('Thinking Effort'),
		enum: effortLevels,
		enumItemLabels: effortLevels.map(getReasoningEffortLabel),
		enumDescriptions: effortLevels.map(getReasoningEffortDescription),
		default: pickDefaultReasoningEffort(effortLevels, family),
		group: 'navigation',
	};
}

/**
 * Returns a description of the model's capabilities and intended use cases.
 * This is shown in the rich hover when selecting models.
 */
export function getModelCapabilitiesDescription(endpoint: IChatEndpoint | LanguageModelChatInformation | { name: string; family: string }): string | undefined {
	const name = endpoint.name.toLowerCase();
	const family = endpoint.family.toLowerCase();

	// Claude models
	if (family.includes('claude') || name.includes('claude')) {
		if (name.includes('opus')) {
			return l10n.t('Most capable Claude model. Excellent for complex analysis, coding tasks, and nuanced creative writing.');
		}
		if (name.includes('sonnet')) {
			return l10n.t('Balanced Claude model offering strong performance for everyday coding and chat tasks at faster speeds.');
		}
		if (name.includes('haiku')) {
			return l10n.t('Fastest and most compact Claude model. Ideal for quick responses and simple tasks.');
		}
	}

	// GPT models
	if (family.includes('gpt') || name.includes('gpt') || family.includes('codex') || name.includes('codex')) {
		if (name.includes('codex') || family.includes('codex')) {
			return l10n.t('OpenAI Codex model specialized for code generation, debugging, and software development tasks.');
		}
		if (name.includes('mini')) {
			return l10n.t('Lightweight GPT model for quick responses and simple tasks with low latency.');
		}
		if (name.includes('copilot')) {
			return l10n.t('GPT model fine-tuned for Copilot code completions.');
		}
		if (name.includes('4o')) {
			return l10n.t('Optimized GPT-4 model with faster responses and multimodal capabilities.');
		}
		if (name.includes('4.1')) {
			return l10n.t('Enhanced GPT-4 model with improved instruction following and coding performance.');
		}
		return l10n.t('OpenAI GPT model for coding and general assistance.');
	}

	// Gemini models
	if (family.includes('gemini') || name.includes('gemini')) {
		if (name.includes('flash')) {
			return l10n.t('Fast and efficient Gemini model optimized for quick responses and high throughput.');
		}
		if (name.includes('pro')) {
			return l10n.t("Google's advanced Gemini Pro model with strong reasoning and coding capabilities.");
		}
		return l10n.t('Google Gemini model with balanced performance for coding and general assistance.');
	}

	// Grok models
	if (family.includes('grok') || name.includes('grok')) {
		return l10n.t('xAI Grok model optimized for fast code generation and development tasks.');
	}

	return undefined;
}

/**
 * Documentation link surfaced in the Auto model description.
 * NOTE: Also defined in src/vs/workbench/contrib/chat/common/languageModels.ts (ILanguageModelChatMetadata.autoModelSelectionDocsUrl) — keep in sync.
 */
const AUTO_MODEL_DOCS_URL = 'https://docs.github.com/en/copilot/concepts/models/auto-model-selection';

/**
 * Classifies an Auto discount range (given as fractions, e.g. `0.1` for 10%)
 * into whole-number percentages. Returns `undefined` when there is no discount
 * to show, `{ low }` for a single value, or `{ low, high }` for a range.
 */
function classifyDiscountRange(discountRange?: { low: number; high: number }): { low: number; high?: number } | undefined {
	if (!discountRange) {
		return undefined;
	}
	const low = Math.round(discountRange.low * 100);
	const high = Math.round(discountRange.high * 100);
	if (low === high) {
		return low !== 0 ? { low } : undefined;
	}
	return { low, high };
}

/**
 * Formats the Auto discount as a short label (e.g. "10% discount" or
 * "10% to 20% discount"). Returns `undefined` when there is no discount.
 *
 * @param discountRange Discount as fractions (e.g. `0.1` for 10%).
 */
export function getAutoModelDiscountLabel(discountRange?: { low: number; high: number }): string | undefined {
	const discount = classifyDiscountRange(discountRange);
	if (!discount) {
		return undefined;
	}
	return discount.high === undefined
		? l10n.t('{0}% discount', discount.low)
		: l10n.t('{0}% to {1}% discount', discount.low, discount.high);
}

/**
 * Builds the shared description shown for the Auto model. The discount sentence
 * is only included when a non-zero discount is provided.
 *
 * @param discountRange Discount as fractions (e.g. `0.1` for 10%). When omitted
 * or zero, the discount sentence is left out entirely.
 */
export function getAutoModelDescription(discountRange?: { low: number; high: number }): string {
	const base = l10n.t('Auto routes based on your task and real-time system health and model performance.');
	const learnMore = l10n.t('[Learn More]({0})', AUTO_MODEL_DOCS_URL);
	const discount = classifyDiscountRange(discountRange);
	const discountSentence = !discount
		? undefined
		: discount.high === undefined
			? l10n.t('Models routed via auto receive a {0}% discount.', discount.low)
			: l10n.t('Models routed via auto receive a {0}% to {1}% discount.', discount.low, discount.high);
	return discountSentence ? `${base} ${discountSentence} ${learnMore}` : `${base} ${learnMore}`;
}

function formatAicPrice(price: number): string {
	if (price === 0) {
		return '0';
	}
	if (price < 0.01) {
		return price.toExponential(2);
	}
	// Remove unnecessary trailing zeros
	return price.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * Formats a token count as a human-readable string (e.g. 128K, 1M, 2.5M).
 */
export function formatTokenCount(count: number): string {
	if (count >= 1_000_000) {
		const value = count / 1_000_000;
		const floored = Math.floor(value * 10) / 10;
		return floored % 1 === 0 ? `${floored.toFixed(0)}M` : `${floored.toFixed(1)}M`;
	} else if (count > 900_000) {
		return '1M';
	} else if (count >= 1000) {
		return `${Math.round(count / 1000)}K`;
	}
	return count.toString();
}

/**
 * Formats a compact pricing label for display in the model management column.
 * Shows input and output AICs per million tokens.
 */
export function formatPricingLabel(pricing: IChatEndpointTokenPricing): string {
	return l10n.t(
		'In: {0} · Out: {1} AICs/1M tokens',
		formatAicPrice(pricing.default.inputPrice),
		formatAicPrice(pricing.default.outputPrice),
	);
}

const TOKENS_PER_MILLION = 1_000_000;
const NANO_AIU_DIVISOR = 1_000_000_000;

/**
 * Raw token prices from the CAPI billing response. Supports both the tiered
 * format (API 2026-06-01+, prices in AIUs) and the legacy flat format
 * (pre-2026-06-01, prices in nano-AIUs) which is still used by some endpoints
 * such as the cloud agents (`/agents/swe/models`) model picker.
 */
export interface IRawTokenPrices {
	batch_size?: number;
	input_price?: number;
	cache_price?: number;
	output_price?: number;
	default?: { input_price?: number; cache_price?: number; cache_write_price?: number; output_price?: number; context_max?: number };
	long_context?: { input_price?: number; cache_price?: number; cache_write_price?: number; output_price?: number; context_max?: number };
}

export interface INormalizedPriceTier {
	readonly inputPrice: number;
	readonly outputPrice: number;
	readonly cachePrice: number | undefined;
	readonly cacheWritePrice: number | undefined;
	readonly contextMax?: number;
}

export interface INormalizedTokenPricing {
	readonly default: INormalizedPriceTier;
	readonly longContext?: INormalizedPriceTier;
}

/**
 * Converts raw billing token prices into normalized AICs (credits) per million tokens.
 * Handles both tiered (AIU) and legacy flat (nano-AIU) formats.
 *
 * When a `long_context` tier is present but its prices match the `default` tier,
 * it is omitted from the result.
 */
export function normalizeTokenPrices(tokenPrices: IRawTokenPrices | undefined): INormalizedTokenPricing | undefined {
	if (!tokenPrices) {
		return undefined;
	}
	const batchSize = tokenPrices.batch_size ?? TOKENS_PER_MILLION;
	const scale = TOKENS_PER_MILLION / batchSize;
	const defaultTier = tokenPrices.default;

	if (defaultTier && defaultTier.input_price !== undefined && defaultTier.output_price !== undefined) {
		// Tiered format (API 2026-06-01+): values are in AIUs
		const normalized: INormalizedPriceTier = {
			inputPrice: defaultTier.input_price * scale,
			outputPrice: defaultTier.output_price * scale,
			cachePrice: defaultTier.cache_price !== undefined ? defaultTier.cache_price * scale : undefined,
			cacheWritePrice: defaultTier.cache_write_price !== undefined ? defaultTier.cache_write_price * scale : undefined,
			contextMax: defaultTier.context_max,
		};
		let longContext: INormalizedPriceTier | undefined;
		const lc = tokenPrices.long_context;
		if (lc && lc.input_price !== undefined && lc.output_price !== undefined) {
			const lcNormalized: INormalizedPriceTier = {
				inputPrice: lc.input_price * scale,
				outputPrice: lc.output_price * scale,
				cachePrice: lc.cache_price !== undefined ? lc.cache_price * scale : undefined,
				cacheWritePrice: lc.cache_write_price !== undefined ? lc.cache_write_price * scale : undefined,
				contextMax: lc.context_max,
			};
			// Only include long-context tier when prices differ from default
			if (lcNormalized.inputPrice !== normalized.inputPrice
				|| lcNormalized.outputPrice !== normalized.outputPrice
				|| lcNormalized.cachePrice !== normalized.cachePrice
				|| lcNormalized.cacheWritePrice !== normalized.cacheWritePrice) {
				longContext = lcNormalized;
			}
		}
		return { default: normalized, longContext };
	}

	// Legacy flat format (pre-2026-06-01): values are in nano-AIUs
	if (tokenPrices.input_price === undefined || tokenPrices.output_price === undefined) {
		return undefined;
	}
	return {
		default: {
			inputPrice: (tokenPrices.input_price / NANO_AIU_DIVISOR) * scale,
			outputPrice: (tokenPrices.output_price / NANO_AIU_DIVISOR) * scale,
			cachePrice: tokenPrices.cache_price !== undefined ? (tokenPrices.cache_price / NANO_AIU_DIVISOR) * scale : undefined,
			cacheWritePrice: undefined,
		},
	};
}
