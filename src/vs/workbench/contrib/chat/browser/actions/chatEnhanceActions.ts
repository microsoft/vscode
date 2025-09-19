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
import { getActiveWindow } from '../../../../../base/browser/dom.js';

export const CHAT_ENHANCE_ACTION_ID = 'workbench.action.chat.enhance';

interface MadLibPlaceholder {
	id: string;
	label: string;
	suggestions: string[];
	value: string;
	startIndex: number;
	endIndex: number;
}

interface MadLibTemplate {
	template: string;
	placeholders: MadLibPlaceholder[];
	isComplete: boolean;
}

class MadLibTemplateParser {
	private static readonly PLACEHOLDER_REGEX = /\{\{([^|]+)\|([^|]+)\|([^}]+)\}\}/g;

	static parseTemplate(template: string): MadLibTemplate {
		const placeholders: MadLibPlaceholder[] = [];
		let match;
		let processedTemplate = template;
		let offset = 0;

		// Reset regex state
		this.PLACEHOLDER_REGEX.lastIndex = 0;

		while ((match = this.PLACEHOLDER_REGEX.exec(template)) !== null) {
			const [fullMatch, id, label, suggestionsStr] = match;
			const suggestions = suggestionsStr.split(',').map(s => s.trim());
			const startIndex = match.index - offset;

			// Replace the placeholder with a shorter placeholder for display
			const displayPlaceholder = `{{${id}}}`;
			processedTemplate = processedTemplate.replace(fullMatch, displayPlaceholder);

			placeholders.push({
				id: id.trim(),
				label: label.trim(),
				suggestions,
				value: '',
				startIndex,
				endIndex: startIndex + displayPlaceholder.length
			});

			// Adjust offset for the length difference
			offset += fullMatch.length - displayPlaceholder.length;
		}

		return {
			template: processedTemplate,
			placeholders,
			isComplete: placeholders.length === 0 || placeholders.every(p => p.value.trim() !== '')
		};
	}

	static renderTemplate(madLibTemplate: MadLibTemplate): string {
		let result = madLibTemplate.template;

		// Sort placeholders by start index in reverse order to avoid index shifting
		const sortedPlaceholders = [...madLibTemplate.placeholders].sort((a, b) => b.startIndex - a.startIndex);

		for (const placeholder of sortedPlaceholders) {
			const value = placeholder.value.trim() || `{{${placeholder.id}}}`;
			result = result.slice(0, placeholder.startIndex) + value + result.slice(placeholder.endIndex);
		}

		return result;
	}

	static isTemplateComplete(madLibTemplate: MadLibTemplate): boolean {
		return madLibTemplate.placeholders.length === 0 ||
			madLibTemplate.placeholders.every(p => p.value.trim() !== '');
	}
}

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

			// Use AI to enhance the prompt and get a template
			const enhancedTemplate = await this.generateAIEnhancement(currentInput, languageModelsService, logService);
			const madLibTemplate = MadLibTemplateParser.parseTemplate(enhancedTemplate);

			if (madLibTemplate.placeholders.length > 0) {
				// Show mad-lib form if there are placeholders to fill
				logService.info('Chat enhance: Found placeholders, showing mad-lib form');
				await this.showMadLibForm(widget, madLibTemplate, contextKeyService, logService);
			} else {
				// No placeholders, just set the enhanced prompt directly
				logService.info('Chat enhance: No placeholders, setting enhanced prompt directly');
				widget.setInput(enhancedTemplate);
				widget.focusInput();
			}
		} catch (error) { } finally {
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

		const enhancementPrompt = `You are an expert prompt engineer specializing in creating interactive prompt templates. Your goal is to enhance the prompt and then transform user prompts into templates with fillable placeholders that users can customize.

Original prompt: "${input}"

Step 1 is to enhance the prompt:

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

Step 2 is then to use the enhanced prompt and templatize it using these guidelines.

**Template Creation Rules:**
- Use placeholder syntax: {{placeholder_name|placeholder_name|suggestions}}
- Replace vague or missing details with specific placeholders
- Keep the original intent and structure intact
- Don't add placeholders for information already provided

**Placeholder Guidelines:**
- Identify areas where the prompt lacks specificity or detail
- Create placeholders that capture the missing information naturally
- Use clear, descriptive placeholder names (use the same name for both the ID and display)
- Provide 2-4 relevant, contextual suggestions for each placeholder
- Adapt placeholder types to match the prompt's domain and context

**Examples:**
- "build a game" → "build a {{game_type|game_type|puzzle,action,strategy}} game using {{language|language|javascript,python,java}}"
- "create an app" → "create a {{app_type|app_type|productivity,entertainment,utility}} app for {{platform|platform|web,mobile,desktop}}"
- "explain how to" → "explain how to {{topic|topic|concept,process,technique}} for {{audience|audience|beginners,professionals,students}}"

**Rules:**
- Only add placeholders where information is genuinely missing or vague
- Provide 2-4 relevant suggestions for each placeholder
- Use descriptive placeholder names (snake_case)
- Keep existing specific details unchanged
- Let the context determine what placeholders are needed

Return only the enhanced template without explanations or formatting.`;
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

	private async showMadLibForm(widget: IChatWidget, madLibTemplate: MadLibTemplate, contextKeyService: IContextKeyService, logService: ILogService): Promise<void> {
		const madLibInProgressKey = ChatContextKeys.madLibInProgress.bindTo(contextKeyService);
		const madLibCompleteKey = ChatContextKeys.madLibComplete.bindTo(contextKeyService);

		madLibInProgressKey.set(true);
		madLibCompleteKey.set(false);

		try {
			// Create and show the interactive mad-lib overlay
			await this.showMadLibOverlay(widget, madLibTemplate, logService);
		} finally {
			madLibInProgressKey.set(false);
			madLibCompleteKey.set(true);
		}
	}

	private async showMadLibOverlay(widget: IChatWidget, madLibTemplate: MadLibTemplate, logService: ILogService): Promise<void> {
		return new Promise<void>((resolve) => {
			// Create overlay container
			const overlay = document.createElement('div');
			overlay.className = 'chat-madlib-overlay';

			// Create form
			const form = document.createElement('div');
			form.className = 'chat-madlib-form';

			// Title
			const title = document.createElement('h3');
			title.textContent = 'Complete the prompt template:';
			form.appendChild(title);

			// Template preview
			const templatePreview = document.createElement('div');
			templatePreview.className = 'chat-madlib-template';
			templatePreview.textContent = madLibTemplate.template;
			form.appendChild(templatePreview);

			// Fields container
			const fieldsContainer = document.createElement('div');
			fieldsContainer.className = 'chat-madlib-fields';

			const inputFields: HTMLInputElement[] = [];

			// Create input fields for each placeholder
			madLibTemplate.placeholders.forEach((placeholder, index) => {
				const fieldDiv = document.createElement('div');
				fieldDiv.className = 'chat-madlib-field';

				const label = document.createElement('label');
				label.textContent = placeholder.id + ':';
				label.htmlFor = `madlib-${placeholder.id}`;
				fieldDiv.appendChild(label);

				const input = document.createElement('input');
				input.type = 'text';
				input.id = `madlib-${placeholder.id}`;
				input.className = 'madlib-input';
				input.setAttribute('data-placeholder-id', placeholder.id);
				input.tabIndex = index + 1;
				input.placeholder = `Enter ${placeholder.id.toLowerCase()}...`;
				fieldDiv.appendChild(input);

				// Add suggestions if available
				if (placeholder.suggestions.length > 0) {
					const suggestionsDiv = document.createElement('div');
					suggestionsDiv.className = 'madlib-suggestions';

					placeholder.suggestions.forEach(suggestion => {
						const suggestionBtn = document.createElement('button');
						suggestionBtn.className = 'madlib-suggestion';
						suggestionBtn.textContent = suggestion;
						suggestionBtn.type = 'button';
						suggestionBtn.onclick = () => {
							input.value = suggestion;
							validateForm();
							// Focus next input or apply button
							const nextInput = inputFields[index + 1];
							if (nextInput) {
								nextInput.focus();
							} else {
								applyBtn.focus();
							}
						};
						suggestionsDiv.appendChild(suggestionBtn);
					});

					fieldDiv.appendChild(suggestionsDiv);
				}

				inputFields.push(input);
				fieldsContainer.appendChild(fieldDiv);
			});

			form.appendChild(fieldsContainer);

			// Actions container
			const actionsDiv = document.createElement('div');
			actionsDiv.className = 'chat-madlib-actions';

			const applyBtn = document.createElement('button');
			applyBtn.className = 'madlib-apply';
			applyBtn.textContent = 'Apply Template';
			applyBtn.disabled = true;
			applyBtn.type = 'button';

			const cancelBtn = document.createElement('button');
			cancelBtn.className = 'madlib-cancel';
			cancelBtn.textContent = 'Cancel';
			cancelBtn.type = 'button';

			actionsDiv.appendChild(applyBtn);
			actionsDiv.appendChild(cancelBtn);
			form.appendChild(actionsDiv);

			overlay.appendChild(form);

			// Validation function
			const validateForm = () => {
				const allFilled = inputFields.every(input => input.value.trim() !== '');
				applyBtn.disabled = !allFilled;
			};

			// Add input event listeners for validation
			inputFields.forEach(input => {
				input.addEventListener('input', validateForm);
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' && !applyBtn.disabled) {
						applyBtn.click();
					} else if (e.key === 'Escape') {
						cancelBtn.click();
					}
				});
			});

			// Apply button handler
			applyBtn.onclick = () => {
				// Update placeholder values
				inputFields.forEach(input => {
					const placeholderId = input.getAttribute('data-placeholder-id');
					const placeholder = madLibTemplate.placeholders.find(p => p.id === placeholderId);
					if (placeholder) {
						placeholder.value = input.value.trim();
					}
				});

				// Render the final template
				const finalPrompt = MadLibTemplateParser.renderTemplate(madLibTemplate);
				widget.setInput(finalPrompt);
				widget.focusInput();

				logService.info('Chat enhance: Mad-lib template applied successfully');
				cleanup();
				resolve();
			};

			// Cancel button handler
			cancelBtn.onclick = () => {
				logService.info('Chat enhance: Mad-lib template cancelled');
				cleanup();
				resolve();
			};

			// Cleanup function
			let cleanup = () => {
				overlay.remove();
			};

			// Add overlay to the page
			widget.domNode.appendChild(overlay);

			// Focus first input
			if (inputFields.length > 0) {
				inputFields[0].focus();
			}

			// Add click outside to close
			const activeWindow = getActiveWindow();
			const clickOutsideHandler = (e: MouseEvent) => {
				if (!form.contains(e.target as Node)) {
					cancelBtn.click();
				}
			};
			setTimeout(() => {
				activeWindow.document.addEventListener('click', clickOutsideHandler);
			}, 100);

			// Remove click handler on cleanup
			const originalCleanup = cleanup;
			cleanup = () => {
				activeWindow.document.removeEventListener('click', clickOutsideHandler);
				originalCleanup();
			};
		});
	}
}

export function registerChatEnhanceActions(): void {
	registerAction2(ChatEnhanceAction);
}
