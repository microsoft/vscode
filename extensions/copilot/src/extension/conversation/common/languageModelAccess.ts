/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IChatEndpoint } from '../../../platform/networking/common/networking';
import * as l10n from '@vscode/l10n';
import type { LanguageModelChatInformation } from 'vscode';

/**
 * Returns a description of the model's capabilities and intended use cases.
 * This is shown in the rich hover when selecting models.
 */
export function getModelCapabilitiesDescription(endpoint: IChatEndpoint | LanguageModelChatInformation): string | undefined {
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
