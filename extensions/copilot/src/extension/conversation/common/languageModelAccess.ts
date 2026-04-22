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
			if (name.includes('max')) {
				return l10n.t('Maximum capability Codex model optimized for complex multi-file refactoring and large codebase understanding.');
			}
			if (name.includes('mini')) {
				return l10n.t('Lightweight Codex model for quick code completions and simple edits with low latency.');
			}
			return l10n.t('OpenAI Codex model specialized for code generation, debugging, and software development tasks.');
		}
		if (name.includes('4o')) {
			return l10n.t('Optimized GPT-4 model with faster responses and multimodal capabilities.');
		}
		if (name.includes('4.1') || name.includes('4-1')) {
			return l10n.t('Enhanced GPT-4 model with improved instruction following and coding performance.');
		}
		if (name.includes('4')) {
			return l10n.t('Reliable GPT-4 model suitable for a wide range of coding and general tasks.');
		}
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

	// o1/o3 reasoning models
	if (family.includes('o1') || family.includes('o3') || name.includes('o1') || name.includes('o3')) {
		if (name.includes('mini')) {
			return l10n.t('Compact reasoning model for quick problem-solving with step-by-step thinking.');
		}
		return l10n.t('Advanced reasoning model that excels at complex problem-solving, math, and coding challenges.');
	}

	return undefined;
}
