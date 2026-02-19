/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IChatQuestion, IChatService } from '../../chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatRequestModel } from '../../model/chatModel.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { raceCancellation } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';

// Use a distinct id to avoid clashing with extension-provided tools
export const AskQuestionsToolId = 'vscode_askQuestions';

export interface IQuestionOption {
	readonly label: string;
	readonly description?: string;
	readonly recommended?: boolean;
}

export interface IQuestion {
	readonly header: string;
	readonly question: string;
	readonly multiSelect?: boolean;
	readonly options?: IQuestionOption[];
	readonly allowFreeformInput?: boolean;
}

export interface IAskQuestionsParams {
	readonly questions: IQuestion[];
}

export interface IQuestionAnswer {
	readonly selected: string[];
	readonly freeText: string | null;
	readonly skipped: boolean;
}

export interface IAnswerResult {
	readonly answers: Record<string, IQuestionAnswer>;
}

export function createAskQuestionsToolData(): IToolData {
	const questionSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
		type: 'object',
		properties: {
			header: {
				type: 'string',
				description: 'Short identifier for the question. Must be unique so answers can be mapped back to the question.'
			},
			question: {
				type: 'string',
				description: 'The question text to display to the user.'
			},
			multiSelect: {
				type: 'boolean',
				description: 'Allow selecting multiple options when options are provided.'
			},
			allowFreeformInput: {
				type: 'boolean',
				description: 'Allow freeform text answers in addition to option selection.'
			},
			options: {
				type: 'array',
				description: 'Optional list of selectable answers. If omitted, the question is free text.',
				items: {
					type: 'object',
					properties: {
						label: {
							type: 'string',
							description: 'Display label and value for the option.'
						},
						description: {
							type: 'string',
							description: 'Optional secondary text shown with the option.'
						},
						recommended: {
							type: 'boolean',
							description: 'Mark this option as the recommended default.'
						}
					},
					required: ['label']
				}
			}
		},
		required: ['header', 'question']
	};

	const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
		type: 'object',
		properties: {
			questions: {
				type: 'array',
				description: 'List of questions to ask the user. Order is preserved.',
				items: questionSchema,
				minItems: 1
			}
		},
		required: ['questions']
	};

	return {
		id: AskQuestionsToolId,
		toolReferenceName: 'askQuestions',
		canBeReferencedInPrompt: true,
		icon: ThemeIcon.fromId(Codicon.question.id),
		displayName: localize('tool.askQuestions.displayName', 'Ask Clarifying Questions'),
		userDescription: localize('tool.askQuestions.userDescription', 'Ask structured clarifying questions using single select, multi-select, or freeform inputs to collect task requirements before proceeding.'),
		modelDescription: 'Use this tool to ask the user a small number of clarifying questions before proceeding. Provide the questions array with concise headers and prompts. Use options for fixed choices, set multiSelect when multiple selections are allowed, and set allowFreeformInput to let users supply their own answer.',
		source: ToolDataSource.Internal,
		inputSchema
	};
}

export const AskQuestionsToolData: IToolData = createAskQuestionsToolData();

export class AskQuestionsTool extends Disposable implements IToolImpl {

	constructor(
		@IChatService private readonly chatService: IChatService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const stopWatch = StopWatch.create(true);
		const parameters = invocation.parameters as IAskQuestionsParams;
		const { questions } = parameters;
		this.logService.trace(`[AskQuestionsTool] Invoking with ${questions?.length ?? 0} question(s)`);

		if (!questions || questions.length === 0) {
			throw new Error(localize('askQuestionsTool.noQuestions', 'No questions provided. The questions array must contain at least one question.'));
		}

		const chatSessionResource = invocation.context?.sessionResource;
		const chatRequestId = invocation.chatRequestId;
		const { request, sessionResource } = this.getRequest(chatSessionResource, chatRequestId);

		if (!sessionResource || !request) {
			this.logService.warn('[AskQuestionsTool] Missing chat context; marking all questions as skipped.');
			return this.createSkippedResult(questions);
		}

		const carousel = this.toQuestionCarousel(questions);
		this.chatService.appendProgress(request, carousel);

		const answerResult = await raceCancellation(carousel.completion.p, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		progress.report({ message: localize('askQuestionsTool.progress', 'Analyzing your answers...') });

		const converted = this.convertCarouselAnswers(questions, answerResult?.answers);
		const { answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount } = this.collectMetrics(questions, converted);

		this.sendTelemetry(invocation.chatRequestId, questions.length, answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount, stopWatch.elapsed());

		const toolResultJson = JSON.stringify(converted);
		this.logService.trace(`[AskQuestionsTool] Returning tool result with metrics: questions=${questions.length}, answered=${answeredCount}, skipped=${skippedCount}, freeText=${freeTextCount}, recommendedAvailable=${recommendedAvailableCount}, recommendedSelected=${recommendedSelectedCount}`);
		return {
			content: [{ kind: 'text', value: toolResultJson }]
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const parameters = context.parameters as IAskQuestionsParams;
		const { questions } = parameters;

		if (!questions || questions.length === 0) {
			throw new Error(localize('askQuestionsTool.noQuestions', 'No questions provided. The questions array must contain at least one question.'));
		}

		for (const question of questions) {
			if (question.options && question.options.length === 1) {
				throw new Error(localize('askQuestionsTool.invalidOptions', 'Question "{0}" must have at least two options, or none for free text input.', question.header));
			}
		}

		const questionCount = questions.length;
		const headers = questions.map(q => q.header).join(', ');
		const message = questionCount === 1
			? localize('askQuestionsTool.invocation.single', 'Asking a question ({0})', headers)
			: localize('askQuestionsTool.invocation.multiple', 'Asking {0} questions ({1})', questionCount, headers);
		const pastMessage = questionCount === 1
			? localize('askQuestionsTool.invocation.single.past', 'Asked a question ({0})', headers)
			: localize('askQuestionsTool.invocation.multiple.past', 'Asked {0} questions ({1})', questionCount, headers);

		return {
			invocationMessage: new MarkdownString(message),
			pastTenseMessage: new MarkdownString(pastMessage)
		};
	}

	private getRequest(chatSessionResource: URI | undefined, chatRequestId: string | undefined): { request: IChatRequestModel | undefined; sessionResource: URI | undefined } {
		if (!chatSessionResource) {
			return { request: undefined, sessionResource: undefined };
		}

		const model = this.chatService.getSession(chatSessionResource);
		let request: IChatRequestModel | undefined;
		if (model) {
			// Prefer an exact match on chatRequestId when possible
			if (chatRequestId) {
				request = model.getRequests().find(r => r.id === chatRequestId);
			}
			// Fall back to the most recent request in the session if we can't find a match
			if (!request) {
				request = model.getRequests().at(-1);
			}
		}

		if (!request) {
			return { request: undefined, sessionResource: chatSessionResource };
		}

		return { request, sessionResource: chatSessionResource };
	}

	private toQuestionCarousel(questions: IQuestion[]): ChatQuestionCarouselData {
		const mappedQuestions = questions.map(question => this.toChatQuestion(question));
		return new ChatQuestionCarouselData(mappedQuestions, true, generateUuid());
	}

	private toChatQuestion(question: IQuestion): IChatQuestion {
		let type: IChatQuestion['type'];
		if (!question.options || question.options.length === 0) {
			type = 'text';
		} else if (question.multiSelect) {
			type = 'multiSelect';
		} else {
			type = 'singleSelect';
		}

		let defaultValue: string | string[] | undefined;
		if (question.options) {
			const recommendedOptions = question.options.filter(opt => opt.recommended);
			if (recommendedOptions.length > 0) {
				defaultValue = question.multiSelect ? recommendedOptions.map(opt => opt.label) : recommendedOptions[0].label;
			}
		}

		return {
			id: question.header,
			type,
			title: question.header,
			message: question.question,
			options: question.options?.map(opt => ({
				id: opt.label,
				label: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
				value: opt.label
			})),
			defaultValue,
			allowFreeformInput: question.allowFreeformInput ?? false
		};
	}

	protected convertCarouselAnswers(questions: IQuestion[], carouselAnswers: Record<string, unknown> | undefined): IAnswerResult {
		const result: IAnswerResult = { answers: {} };

		if (carouselAnswers) {
			this.logService.trace(`[AskQuestionsTool] Carousel answer keys: ${Object.keys(carouselAnswers).join(', ')}`);
			this.logService.trace(`[AskQuestionsTool] Question headers: ${questions.map(q => q.header).join(', ')}`);
		}

		for (const question of questions) {
			if (!carouselAnswers) {
				result.answers[question.header] = {
					selected: [],
					freeText: null,
					skipped: true
				};
				continue;
			}

			const answer = carouselAnswers[question.header];
			this.logService.trace(`[AskQuestionsTool] Processing question "${question.header}", raw answer: ${JSON.stringify(answer)}, type: ${typeof answer}`);

			if (answer === undefined) {
				result.answers[question.header] = {
					selected: [],
					freeText: null,
					skipped: true
				};
			} else if (typeof answer === 'string') {
				if (question.options?.some(opt => opt.label === answer)) {
					result.answers[question.header] = {
						selected: [answer],
						freeText: null,
						skipped: false
					};
				} else {
					result.answers[question.header] = {
						selected: [],
						freeText: answer,
						skipped: false
					};
				}
			} else if (Array.isArray(answer)) {
				result.answers[question.header] = {
					selected: answer.map(a => String(a)),
					freeText: null,
					skipped: false
				};
			} else if (typeof answer === 'object' && answer !== null) {
				const answerObj = answer as Record<string, unknown>;
				const freeformValue = typeof answerObj.freeformValue === 'string' && answerObj.freeformValue ? answerObj.freeformValue : null;
				const selectedValues = Array.isArray(answerObj.selectedValues) ? answerObj.selectedValues.map(v => String(v)) : undefined;
				const selectedValue = answerObj.selectedValue;
				const label = typeof answerObj.label === 'string' ? answerObj.label : undefined;

				if (selectedValues) {
					result.answers[question.header] = {
						selected: selectedValues,
						freeText: freeformValue,
						skipped: false
					};
				} else if (typeof selectedValue === 'string') {
					if (question.options?.some(opt => opt.label === selectedValue)) {
						result.answers[question.header] = {
							selected: [selectedValue],
							freeText: freeformValue,
							skipped: false
						};
					} else {
						result.answers[question.header] = {
							selected: [],
							freeText: freeformValue ?? selectedValue,
							skipped: false
						};
					}
				} else if (Array.isArray(selectedValue)) {
					result.answers[question.header] = {
						selected: selectedValue.map(v => String(v)),
						freeText: freeformValue,
						skipped: false
					};
				} else if (selectedValue === undefined || selectedValue === null) {
					if (freeformValue) {
						result.answers[question.header] = {
							selected: [],
							freeText: freeformValue,
							skipped: false
						};
					} else {
						result.answers[question.header] = {
							selected: [],
							freeText: null,
							skipped: true
						};
					}
				} else if (freeformValue) {
					result.answers[question.header] = {
						selected: [],
						freeText: freeformValue,
						skipped: false
					};
				} else if (label) {
					result.answers[question.header] = {
						selected: [label],
						freeText: null,
						skipped: false
					};
				} else {
					this.logService.warn(`[AskQuestionsTool] Unknown answer object format for "${question.header}": ${JSON.stringify(answer)}`);
					result.answers[question.header] = {
						selected: [],
						freeText: null,
						skipped: true
					};
				}
			} else {
				this.logService.warn(`[AskQuestionsTool] Unknown answer format for "${question.header}": ${typeof answer}`);
				result.answers[question.header] = {
					selected: [],
					freeText: null,
					skipped: true
				};
			}
		}

		return result;
	}

	private collectMetrics(questions: IQuestion[], result: IAnswerResult): { answeredCount: number; skippedCount: number; freeTextCount: number; recommendedAvailableCount: number; recommendedSelectedCount: number } {
		const answers = Object.values(result.answers);
		const answeredCount = answers.filter(a => !a.skipped).length;
		const skippedCount = answers.filter(a => a.skipped).length;
		const freeTextCount = answers.filter(a => a.freeText !== null).length;
		const recommendedAvailableCount = questions.filter(q => q.options?.some(opt => opt.recommended)).length;
		const recommendedSelectedCount = questions.filter(q => {
			const answer = result.answers[q.header];
			const recommendedOption = q.options?.find(opt => opt.recommended);
			return answer && !answer.skipped && recommendedOption && answer.selected.includes(recommendedOption.label);
		}).length;
		return { answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount };
	}

	private createSkippedResult(questions: IQuestion[]): IToolResult {
		const skippedAnswers: Record<string, IQuestionAnswer> = {};
		for (const question of questions) {
			skippedAnswers[question.header] = { selected: [], freeText: null, skipped: true };
		}
		return {
			content: [{ kind: 'text', value: JSON.stringify({ answers: skippedAnswers }) }]
		};
	}

	private sendTelemetry(requestId: string | undefined, questionCount: number, answeredCount: number, skippedCount: number, freeTextCount: number, recommendedAvailableCount: number, recommendedSelectedCount: number, duration: number): void {
		this.telemetryService.publicLog2<AskQuestionsToolInvokedEvent, AskQuestionsToolInvokedClassification>('askQuestionsToolInvoked', {
			requestId,
			questionCount,
			answeredCount,
			skippedCount,
			freeTextCount,
			recommendedAvailableCount,
			recommendedSelectedCount,
			duration,
		});
	}
}

type AskQuestionsToolInvokedEvent = {
	requestId: string | undefined;
	questionCount: number;
	answeredCount: number;
	skippedCount: number;
	freeTextCount: number;
	recommendedAvailableCount: number;
	recommendedSelectedCount: number;
	duration: number;
};

type AskQuestionsToolInvokedClassification = {
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the current request turn.' };
	questionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of questions asked' };
	answeredCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions that were answered' };
	skippedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions that were skipped' };
	freeTextCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions answered with free text input' };
	recommendedAvailableCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions that had a recommended option' };
	recommendedSelectedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of questions where the user selected the recommended option' };
	duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The total time in milliseconds to complete all questions' };
	owner: 'digitarald';
	comment: 'Tracks usage of the AskQuestions tool for agent clarifications';
};
