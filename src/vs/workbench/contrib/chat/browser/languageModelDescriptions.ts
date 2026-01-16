/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../common/languageModels.js';

/**
 * Returns a localized description for a language model based on its family or name.
 */
export function getModelDescription(model: ILanguageModelChatMetadataAndIdentifier): string | undefined {
	const family = model.metadata.family.toLowerCase();
	const name = model.metadata.name.toLowerCase();

	// Claude models
	if (family.includes('claude') || name.includes('claude')) {
		if (name.includes('opus')) {
			return localize('chat.model.claudeOpus', "Most capable Claude model. Excellent for complex analysis, coding tasks, and nuanced creative writing.");
		}
		if (name.includes('sonnet')) {
			return localize('chat.model.claudeSonnet', "Balanced Claude model offering strong performance for everyday coding and chat tasks at faster speeds.");
		}
		if (name.includes('haiku')) {
			return localize('chat.model.claudeHaiku', "Fastest and most compact Claude model. Ideal for quick responses and simple tasks.");
		}
	}

	// GPT models
	if (family.includes('gpt') || name.includes('gpt')) {
		if (name.includes('codex')) {
			if (name.includes('max')) {
				return localize('chat.model.gptCodexMax', "Maximum capability Codex model optimized for complex multi-file refactoring and large codebase understanding.");
			}
			if (name.includes('mini')) {
				return localize('chat.model.gptCodexMini', "Lightweight Codex model for quick code completions and simple edits with low latency.");
			}
			return localize('chat.model.gptCodex', "OpenAI Codex model specialized for code generation, debugging, and software development tasks.");
		}
		if (name.includes('5.2')) {
			return localize('chat.model.gpt52', "Latest generation GPT model with improved reasoning, coding abilities, and instruction following.");
		}
		if (name.includes('5.1')) {
			return localize('chat.model.gpt51', "Advanced GPT model with strong coding capabilities and improved context handling.");
		}
		if (name.includes('5') && name.includes('mini')) {
			return localize('chat.model.gpt5mini', "Compact GPT-5 variant optimized for speed. Great for quick questions and simple tasks.");
		}
		if (name.includes('gpt-5') || name.includes('gpt5')) {
			return localize('chat.model.gpt5', "Powerful GPT-5 model with advanced reasoning and comprehensive coding knowledge.");
		}
		if (name.includes('4o')) {
			return localize('chat.model.gpt4o', "Optimized GPT-4 model with faster responses and multimodal capabilities.");
		}
		if (name.includes('4.1') || name.includes('4-1')) {
			return localize('chat.model.gpt41', "Enhanced GPT-4 model with improved instruction following and coding performance.");
		}
		if (name.includes('4')) {
			return localize('chat.model.gpt4', "Reliable GPT-4 model suitable for a wide range of coding and general tasks.");
		}
	}

	// Gemini models
	if (family.includes('gemini') || name.includes('gemini')) {
		if (name.includes('flash')) {
			return localize('chat.model.geminiFlash', "Fast and efficient Gemini model optimized for quick responses and high throughput.");
		}
		if (name.includes('pro')) {
			return localize('chat.model.geminiPro', "Google's advanced Gemini Pro model with strong reasoning and coding capabilities.");
		}
		return localize('chat.model.gemini', "Google Gemini model with balanced performance for coding and general assistance.");
	}

	// o1/o3 reasoning models
	if (family.includes('o1') || name.includes('o1') || family.includes('o3') || name.includes('o3')) {
		if (name.includes('mini')) {
			return localize('chat.model.o1mini', "Compact reasoning model for quick problem-solving with step-by-step thinking.");
		}
		return localize('chat.model.o1', "Advanced reasoning model that excels at complex problem-solving, math, and coding challenges.");
	}

	// VS Code Prime / OSWE models
	if (name.includes('prime') || name.includes('oswe')) {
		return localize('chat.model.vscodePrime', "Specialized model optimized for VS Code development workflows, extensions, and editor customization.");
	}

	return undefined;
}
