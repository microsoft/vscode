/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatMessageRole, ILanguageModelsService } from '../../common/languageModels.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

export const CHAT_ENHANCE_ACTION_ID = 'workbench.action.chat.enhance';

class ChatEnhanceAction extends Action2 {
	constructor() {
		super({
			id: CHAT_ENHANCE_ACTION_ID,
			title: localize2('chat.enhance.label', "Enhance Prompt"),
			tooltip: localize('chat.enhance.tooltip', "Enhance the current prompt with AI suggestions"),
			icon: Codicon.sparkle,
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.inputHasText,
				ChatContextKeys.requestInProgress.negate(),
				ChatContextKeys.enhanceInProgress.negate()
			),
			toggled: {
				condition: ChatContextKeys.enhanceInProgress,
				icon: ThemeIcon.modify(Codicon.loading, 'spin'),
				tooltip: localize('chat.enhance.loading', "Enhancing prompt...")
			},
			menu: {
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ChatContextKeys.requestInProgress.negate()
				)
			}
		});
	}

	async run(accessor: ServicesAccessor) {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const languageModelsService = accessor.get(ILanguageModelsService);
		const logService = accessor.get(ILogService);
		const contextKeyService = accessor.get(IContextKeyService);
		const widget = chatWidgetService.lastFocusedWidget;

		if (!widget) {
			logService.warn('Chat enhance: No focused chat widget found');
			return;
		}

		await this.enhancePrompt(widget, languageModelsService, logService, contextKeyService);
	}

	private async enhancePrompt(widget: IChatWidget, languageModelsService: ILanguageModelsService, logService: ILogService, contextKeyService: IContextKeyService): Promise<void> {
		const currentInput = widget.getInput();
		if (!currentInput.trim()) {
			logService.info('Chat enhance: No input text to enhance');
			return;
		}

		logService.info('Chat enhance: Starting enhancement for input length:', currentInput.length);

		// Set loading state
		const enhanceInProgressKey = ChatContextKeys.enhanceInProgress.bindTo(contextKeyService);
		enhanceInProgressKey.set(true);

		// Use the input's startGenerating method to show loading state in the input
		const inputGeneratingDisposable = widget.input.startGenerating();

		try {
			// Add a small delay to see the spinner in action during development/testing
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Use AI to enhance the prompt
			const enhancedPrompt = await this.generateAIEnhancement(currentInput, languageModelsService, logService);
			if (enhancedPrompt && enhancedPrompt !== currentInput) {
				logService.info('Chat enhance: AI enhancement successful');
				widget.setInput(enhancedPrompt);
				widget.focusInput();
			} else {
				logService.warn('Chat enhance: AI returned same or empty text, using fallback');
				// If AI returned the same text or empty, use fallback
				const fallbackPrompt = this.generateFallbackEnhancement(currentInput);
				widget.setInput(fallbackPrompt);
				widget.focusInput();
			}
		} catch (error) {
			// Log the error for debugging
			logService.error('Chat enhance: AI failed, using fallback:', error);
			// Fall back to hardcoded enhancement if AI fails
			const fallbackPrompt = this.generateFallbackEnhancement(currentInput);
			widget.setInput(fallbackPrompt);
			widget.focusInput();
		} finally {
			// Clear loading state
			enhanceInProgressKey.set(false);
			inputGeneratingDisposable.dispose();
		}
	}

	private async generateAIEnhancement(input: string, languageModelsService: ILanguageModelsService, logService: ILogService): Promise<string> {
		// Use selectLanguageModels to get actually available models (not just registered ones)
		logService.info('Chat enhance: Selecting available language models...');
		const modelIds = await languageModelsService.selectLanguageModels({}, false); // Don't prompt user
		logService.info('Chat enhance: Available language models:', modelIds);

		if (modelIds.length === 0) {
			logService.warn('Chat enhance: No language models available for chat enhancement');
			throw new Error('No language models available');
		}

		// Use the first available model (could be made configurable)
		const modelId = modelIds[0];
		logService.info('Chat enhance: Using language model:', modelId);

		// Check if we can access this model
		const modelMetadata = languageModelsService.lookupLanguageModel(modelId);
		if (!modelMetadata) {
			logService.warn('Chat enhance: Could not find metadata for model:', modelId);
			throw new Error('Model metadata not found');
		}

		const enhancementPrompt = `You are an expert prompt engineer specializing in optimizing prompts for AI assistants. Your goal is to transform user prompts into more effective versions that will yield better, more useful responses.

Original prompt: "${input}"

Transform this prompt by applying these enhancement strategies:

**Clarity & Specificity:**
- Identify and clarify any ambiguous terms or concepts
- Add specific details about scope, context, or constraints
- Define the target audience or use case if relevant

**Context Enhancement:**
- Add requests for relevant background information
- Include domain-specific context when applicable
- Specify the environment, tools, or technologies involved

**Output Optimization:**
- Define the desired response format (code, explanation, list, etc.)
- Specify the level of detail needed (beginner, intermediate, advanced)
- Request examples, code snippets, or step-by-step instructions when helpful

**Quality Improvements:**
- Ask for best practices, common pitfalls, or considerations
- Request multiple approaches or alternatives when relevant
- Include error handling or edge cases for technical topics

**Preservation:**
- Maintain the original intent and core question
- Keep the user's preferred tone and style
- Preserve any specific requirements already mentioned

Guidelines:
- If the original prompt is already well-structured, make minimal but impactful improvements
- For vague prompts, add structure and specificity
- For technical prompts, include requests for practical examples
- For conceptual prompts, ask for clear explanations and real-world applications

Return only the enhanced prompt without quotation marks, prefixes, or explanations.`;
		const messages = [{
			role: ChatMessageRole.System,
			content: [{ type: 'text' as const, value: enhancementPrompt }]
		}];

		// Use the proper ExtensionIdentifier constructor for the chat enhance feature
		const extensionId = new ExtensionIdentifier('core');

		logService.info('Chat enhance: Sending chat request to AI...');
		const response = await languageModelsService.sendChatRequest(
			modelId,
			extensionId,
			messages,
			{},
			CancellationToken.None
		);

		logService.info('Chat enhance: Got AI response, processing stream...');
		let enhancedText = '';
		for await (const chunk of response.stream) {
			// Handle both single parts and arrays of parts
			const parts = Array.isArray(chunk) ? chunk : [chunk];
			for (const part of parts) {
				if (part.type === 'text') {
					enhancedText += part.value;
				}
			}
		}

		const result = enhancedText.trim();
		logService.info('Chat enhance: AI enhancement result length:', result.length);
		if (result.length > 0) {
			logService.info('Chat enhance: AI enhancement preview:', result.substring(0, 100) + '...');
		}

		return result || input;
	}

	private generateFallbackEnhancement(input: string): string {
		// Enhanced prompt improvement logic
		const improvements = [];
		const lowerInput = input.toLowerCase();

		// Detect question type and add appropriate context
		if (lowerInput.includes('how to') || lowerInput.includes('how do') || lowerInput.includes('how can')) {
			improvements.push('Please provide step-by-step instructions with examples.');
		}

		if (lowerInput.includes('explain') || lowerInput.includes('what is') || lowerInput.includes('what are')) {
			improvements.push('Include clear explanations with relevant context and examples.');
		}

		if (lowerInput.includes('error') || lowerInput.includes('bug') || lowerInput.includes('issue') || lowerInput.includes('problem')) {
			improvements.push('Please include any error messages, stack traces, and relevant code snippets for better debugging assistance.');
		}

		if (lowerInput.includes('code') || lowerInput.includes('implement') || lowerInput.includes('create') || lowerInput.includes('build')) {
			improvements.push('Provide working code examples with clear comments and best practices.');
		}

		if (lowerInput.includes('best practice') || lowerInput.includes('recommend') || lowerInput.includes('should')) {
			improvements.push('Include industry standards, common patterns, and trade-offs to consider.');
		}

		// Check for missing context that could be useful
		if (!lowerInput.includes('typescript') && !lowerInput.includes('javascript') && !lowerInput.includes('language')) {
			if (lowerInput.includes('function') || lowerInput.includes('method') || lowerInput.includes('class')) {
				improvements.push('Consider the current programming language and framework context.');
			}
		}

		// Check if the prompt is too vague
		if (input.length < 15) {
			improvements.push('Please provide more specific details about what you are trying to accomplish.');
		}

		// Check for missing output format requests
		if (!lowerInput.includes('format') && !lowerInput.includes('example') &&
			(lowerInput.includes('show') || lowerInput.includes('generate') || lowerInput.includes('create'))) {
			improvements.push('Specify the desired output format if applicable (e.g., code, documentation, explanation).');
		}

		if (improvements.length === 0) {
			// General enhancement for well-formed prompts
			improvements.push('Please be comprehensive and consider edge cases in your response.');
		}

		// Create enhanced prompt with structured additions
		const enhancementText = improvements.join(' ');
		return `${input}\n\nAdditional context: ${enhancementText}`;
	}
}

export function registerChatEnhanceActions(): void {
	registerAction2(ChatEnhanceAction);
}
