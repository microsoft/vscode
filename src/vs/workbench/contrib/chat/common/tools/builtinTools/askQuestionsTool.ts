/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ChatModel } from '../../model/chatModel.js';
import { IChatService, IChatQuestion } from '../../chatService/chatService.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../languageModelToolsService.js';

export const AskQuestionsToolId = 'ask_questions';
export const AskQuestionsToolData: IToolData = {
	id: AskQuestionsToolId,
	displayName: 'Ask Questions',
	modelDescription: 'Ask the user questions to clarify intent, validate assumptions, or choose between implementation approaches.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			questions: {
				type: 'array',
				description: 'Array of 1-4 questions to ask the user',
				minItems: 1,
				maxItems: 4,
				items: {
					type: 'object',
					properties: {
						header: {
							type: 'string',
							maxLength: 12,
							description: 'A short label (max 12 chars) displayed as a quick pick header, also used as the unique identifier for the question'
						},
						question: {
							type: 'string',
							description: 'The complete question text to display'
						},
						options: {
							type: 'array',
							description: '0-6 options for the user to choose from. If empty or omitted, shows a free text input instead.',
							minItems: 0,
							maxItems: 6,
							items: {
								type: 'object',
								properties: {
									label: {
										type: 'string',
										description: 'Option label text'
									},
									description: {
										type: 'string',
										description: 'Optional description for the option'
									},
									recommended: {
										type: 'boolean',
										description: 'Mark this option as recommended'
									}
								},
								required: ['label']
							}
						},
						multiSelect: {
							type: 'boolean',
							default: false,
							description: 'Allow multiple selections'
						},
						allowFreeformInput: {
							type: 'boolean',
							default: false,
							description: 'When true, allows user to enter free-form text in addition to selecting options'
						}
					},
					required: ['header', 'question']
				}
			}
		},
		required: ['questions'],
		additionalProperties: false
	}
};

/**
 * Input option for a question as provided by the LLM.
 */
interface AskQuestionsToolOption {
	label: string;
	description?: string;
	recommended?: boolean;
}

/**
 * Input question format as provided by the LLM.
 */
interface AskQuestionsToolQuestion {
	/** Short label displayed as a quick pick header, also used as the unique identifier */
	header: string;
	/** The complete question text to display */
	question: string;
	/** Options for the user to choose from. If empty, shows a free text input */
	options?: AskQuestionsToolOption[];
	/** Allow multiple selections */
	multiSelect?: boolean;
	/** When true, allows free-form text input in addition to options */
	allowFreeformInput?: boolean;
}

/**
 * Parameters received from the LLM for the ask_questions tool.
 */
export interface AskQuestionsToolParams {
	questions: AskQuestionsToolQuestion[];
}

/**
 * A tool that allows asking the user questions inline in the chat response.
 * This is a simplified implementation that lives in VS Code core.
 */
export class AskQuestionsTool implements IToolImpl {

	constructor(
		@IChatService private readonly chatService: IChatService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		const parameters = invocation.parameters as AskQuestionsToolParams;
		if (!parameters.questions || parameters.questions.length === 0) {
			return {
				content: [{ kind: 'text', value: '{}' }]
			};
		}

		// Get the chat model and current request
		const model = this.chatService.getSession(invocation.context.sessionResource) as ChatModel;
		const request = model.getRequests().at(-1);
		if (!request) {
			throw new Error('No active chat request');
		}

		// Generate a unique ID for this carousel instance
		const resolveId = generateUuid();

		// Convert input questions to IChatQuestion format
		const chatQuestions: IChatQuestion[] = parameters.questions.map((q, index) => {
			const questionId = q.header || `question_${index}`;

			// Determine the question type based on input
			let type: IChatQuestion['type'] = 'text';
			if (q.options && q.options.length > 0) {
				type = q.multiSelect ? 'multiSelect' : 'singleSelect';
			}

			// Convert options
			const options = q.options?.map(opt => ({
				id: opt.label,
				label: opt.label + (opt.recommended ? ' (Recommended)' : ''),
				value: opt.label,
			}));

			return {
				id: questionId,
				type,
				title: q.header,
				message: q.question,
				options,
				allowFreeformInput: q.allowFreeformInput,
			};
		});

		// Push the question carousel to the chat response
		model.acceptResponseProgress(request, {
			kind: 'questionCarousel',
			questions: chatQuestions,
			allowSkip: true,
			resolveId,
		});

		// Wait for the user to submit answers
		const answers = await this.waitForAnswers(resolveId, token);

		// Return the answers as JSON
		return {
			content: [{ kind: 'text', value: JSON.stringify(answers ?? {}) }]
		};
	}

	/**
	 * Waits for the user to submit answers for the question carousel.
	 */
	private waitForAnswers(resolveId: string, token: CancellationToken): Promise<Record<string, unknown> | undefined> {
		return new Promise((resolve) => {
			const disposable = this.chatService.onDidReceiveQuestionCarouselAnswer(event => {
				if (event.resolveId === resolveId) {
					disposable.dispose();
					resolve(event.answers);
				}
			});

			// Handle cancellation
			token.onCancellationRequested(() => {
				disposable.dispose();
				resolve(undefined);
			});
		});
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			presentation: ToolInvocationPresentation.Hidden
		};
	}
}
