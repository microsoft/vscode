/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IChatQuestion, IChatQuestionAnswers, IChatQuestionAnswerValue, IChatMultiSelectAnswer, IChatService, IChatSingleSelectAnswer, IChatToolInvocation } from '../../chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatRequestModel } from '../../model/chatModel.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../constants.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { raceCancellation } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalToolId } from '../terminalToolIds.js';

/**
 * Response returned to the model when the user is not available (autopilot mode).
 */
export const AUTOPILOT_ASK_USER_RESPONSE =
	'The user is not available to respond and will review your work later. Work autonomously and make good decisions.';

// Use a distinct id to avoid clashing with extension-provided tools
export const AskQuestionsToolId = 'vscode_askQuestions';

// Soft limits are used in the schema to guide the model
// Hard limits are more lenient and used to truncate if the model overshoots
//
// Example text at each limit:
// - header soft (50 chars):        "Which database engine do you want to use for this?"
// - header hard (75 chars):        "Which database engine and connection pooling strategy do you want to use here?"
// - question soft (200 chars):     "What testing framework would you like to use for this project? Consider factors like your team's familiarity, community support, and integration with your existing CI/CD pipeline when making a choice."
const SoftLimits = {
	header: 50,
	question: 200
} as const;

const HardLimits = {
	header: 75,
} as const;

function truncateToLimit(value: string | undefined, limit: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value.length > limit) {
		return value.slice(0, limit - 3) + '...';
	}
	return value;
}

export interface IQuestionOption {
	readonly label: string;
	readonly description?: string;
	readonly recommended?: boolean;
}

export interface IQuestion {
	readonly header: string;
	readonly question: string;
	readonly message?: string;
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
				description: `Short identifier for the question. Must be unique so answers can be mapped back to the question. Maximum ${SoftLimits.header} characters.`,
				maxLength: SoftLimits.header
			},
			question: {
				type: 'string',
				description: `The question text to display to the user. Keep it concise, ideally one sentence. Maximum ${SoftLimits.question} characters.`,
				maxLength: SoftLimits.question
			},
			multiSelect: {
				type: 'boolean',
				description: 'Allow selecting multiple options when options are provided.'
			},
			allowFreeformInput: {
				type: 'boolean',
				description: 'Allow freeform text answers in addition to option selection. Defaults to true; set to false to restrict to predefined options only.'
			},
			message: {
				type: 'string',
				description: 'Optional markdown message to display below the question text, providing additional context or details.'
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
		legacyToolReferenceFullNames: [AskQuestionsToolId, 'vscode/askQuestions'],
		canBeReferencedInPrompt: false,
		icon: ThemeIcon.fromId(Codicon.question.id),
		displayName: localize('tool.askQuestions.displayName', 'Ask Clarifying Questions'),
		userDescription: localize('tool.askQuestions.userDescription', 'Ask structured clarifying questions using single select, multi-select, or freeform inputs to collect task requirements before proceeding.'),
		modelDescription: 'Use this tool to ask the user a small number of clarifying questions before proceeding. Provide the questions array with concise headers and prompts. Use options for fixed choices, set multiSelect when multiple selections are allowed. Users can always provide a freeform text answer alongside options unless you set allowFreeformInput to false.',
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
		@IConfigurationService private readonly configService: IConfigurationService,
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

		// In autopilot mode or when auto-reply is enabled, the user is not available —
		// auto-respond instead of blocking. Still append a completed carousel so the
		// user can see what was skipped.
		const resolveId = invocation.chatStreamToolCallId ?? invocation.callId;
		if (request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot || this.configService.getValue<boolean>(ChatConfiguration.AutoReply)) {
			const reason = request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot ? 'Autopilot mode' : 'Auto-reply enabled';
			this.logService.info(`[AskQuestionsTool] ${reason}: auto-responding to questions`);
			const { carousel, idToHeaderMap } = this.toQuestionCarousel(questions, resolveId);
			carousel.terminalId = this.extractTerminalId(request);
			carousel.data = this.buildAutopilotCarouselAnswers(questions, carousel, idToHeaderMap);
			carousel.isUsed = true;
			this.chatService.appendProgress(request, carousel);
			return this.createAutopilotResult(questions);
		}

		const { carousel, idToHeaderMap } = this.toQuestionCarousel(questions, resolveId);
		carousel.terminalId = this.extractTerminalId(request);
		this.logService.trace(`[AskQuestionsTool] request=${request.id} terminalExecutionId=${request.terminalExecutionId ?? 'undefined'} carousel.terminalId=${carousel.terminalId ?? 'undefined'}`);
		this.chatService.appendProgress(request, carousel);
		const externalAnswerListener = this.chatService.onDidReceiveQuestionCarouselAnswer(event => {
			if (event.resolveId !== carousel.resolveId || carousel.isUsed) {
				return;
			}
			carousel.dismiss(event.answers);
		});

		let answerResult: { answers: IChatQuestionAnswers | undefined } | undefined;
		try {
			answerResult = await raceCancellation(carousel.completion.p, token);
		} catch (error) {
			if (error instanceof CancellationError) {
				carousel.dismiss(undefined);
			}
			throw error;
		} finally {
			externalAnswerListener.dispose();
		}
		if (!answerResult) {
			carousel.dismiss(undefined);
			throw new CancellationError();
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		// When the user typed directly in the terminal (bypassing the carousel),
		// tell the agent to stop asking questions and wait for the command to finish.
		if (carousel.dismissedByTerminalInput && carousel.terminalId) {
			this.logService.info(`[AskQuestionsTool] Carousel dismissed because user typed directly in terminal ${carousel.terminalId}`);
			return {
				content: [{
					kind: 'text',
					value: `The user is replying to the terminal prompts directly. Do not ask more questions or send input to the terminal. You will be automatically notified when the command in terminal ${carousel.terminalId} completes.`
				}]
			};
		}

		progress.report({ message: localize('askQuestionsTool.progress', 'Analyzing your answers...') });

		const converted = this.convertCarouselAnswers(questions, answerResult?.answers, idToHeaderMap);
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

	/**
	 * Resolves the terminal execution ID for the request.
	 * Prefer structured metadata and fall back to legacy message parsing for
	 * old sessions that may not carry the metadata yet.
	 * As a final fallback, search completed runInTerminal tool invocations in
	 * the response for the terminal ID, but only when the tool output indicates
	 * the terminal is still running and waiting for input (foreground/timeout
	 * path where the model calls ask_questions from the same turn as
	 * runInTerminal).
	 */
	private extractTerminalId(request: IChatRequestModel): string | undefined {
		if (request.terminalExecutionId) {
			return request.terminalExecutionId;
		}

		const match = request.message.text.match(/\[Terminal (?<termId>\S+) notification:/);
		if (match?.groups?.termId) {
			return match.groups.termId;
		}

		// Search completed runInTerminal tool invocations in the response
		// for the terminal execution ID (covers foreground/timeout path).
		// Only match output that explicitly indicates the terminal is still
		// running and waiting for input; otherwise the question is unrelated
		// to the prior terminal command.
		const response = request.response;
		if (response) {
			const parts = response.response.value;
			for (let i = parts.length - 1; i >= 0; i--) {
				const part = parts[i];
				if (part.kind === 'toolInvocation' && part.toolId === TerminalToolId.RunInTerminal) {
					const state = part.state.get();
					if (state.type === IChatToolInvocation.StateKind.Completed && state.contentForModel) {
						for (const item of state.contentForModel) {
							if (item.kind === 'text') {
								const idMatch = item.value.match(/(?:running in terminal ID|may still be running in terminal ID) ([0-9a-fA-F-]+)/);
								if (idMatch) {
									return idMatch[1];
								}
							}
						}
					}
				}
			}
		}

		return undefined;
	}

	private toQuestionCarousel(questions: IQuestion[], resolveId?: string): { carousel: ChatQuestionCarouselData; idToHeaderMap: Map<string, string> } {
		const idToHeaderMap = new Map<string, string>();
		const carouselResolveId = resolveId ?? generateUuid();
		const mappedQuestions = questions.map((question, index) => this.toChatQuestion(question, idToHeaderMap, carouselResolveId, index));
		return {
			carousel: new ChatQuestionCarouselData(mappedQuestions, true, carouselResolveId),
			idToHeaderMap
		};
	}

	private toChatQuestion(question: IQuestion, idToHeaderMap: Map<string, string>, resolveId: string, index: number): IChatQuestion {
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

		// Use a stable UUID as the internal ID to avoid collisions when truncating headers
		// The original header is preserved in idToHeaderMap for answer correlation
		const internalId = `${resolveId}:${index}`;
		idToHeaderMap.set(internalId, question.header);

		// Truncate header for display only
		const displayTitle = truncateToLimit(question.header, HardLimits.header) ?? question.header;

		return {
			id: internalId,
			type,
			title: displayTitle,
			message: question.question,
			detailedMessage: question.message,
			options: question.options?.map(opt => ({
				id: opt.label,
				label: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
				value: opt.label
			})),
			defaultValue,
			allowFreeformInput: question.allowFreeformInput ?? true
		};
	}

	protected convertCarouselAnswers(questions: IQuestion[], carouselAnswers: IChatQuestionAnswers | undefined, idToHeaderMap: Map<string, string>): IAnswerResult {
		const result: IAnswerResult = { answers: {} };

		if (carouselAnswers) {
			this.logService.trace(`[AskQuestionsTool] Carousel answer keys: ${Object.keys(carouselAnswers).join(', ')}`);
			this.logService.trace(`[AskQuestionsTool] Question headers: ${questions.map(q => q.header).join(', ')}`);
		}

		// Build a reverse map: original header -> internal ID
		const headerToIdMap = new Map<string, string>();
		for (const [internalId, originalHeader] of idToHeaderMap) {
			headerToIdMap.set(originalHeader, internalId);
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

			// Look up the answer using the internal ID that was used in the carousel
			const internalId = headerToIdMap.get(question.header);
			const answer: IChatQuestionAnswerValue | undefined = internalId ? carouselAnswers[internalId] : undefined;
			this.logService.trace(`[AskQuestionsTool] Processing question "${question.header}" (internal ID: ${internalId}), raw answer: ${JSON.stringify(answer)}, type: ${typeof answer}`);

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
			} else if (typeof answer === 'object' && hasKey(answer, { selectedValues: true })) {
				const { selectedValues, freeformValue } = answer as IChatMultiSelectAnswer;
				result.answers[question.header] = {
					selected: selectedValues,
					freeText: freeformValue ?? null,
					skipped: false
				};
			} else if (typeof answer === 'object' && (hasKey(answer, { selectedValue: true }) || hasKey(answer, { freeformValue: true }))) {
				const { selectedValue, freeformValue } = answer as IChatSingleSelectAnswer;
				if (freeformValue) {
					result.answers[question.header] = {
						selected: [],
						freeText: freeformValue,
						skipped: false
					};
				} else if (selectedValue !== undefined) {
					if (question.options?.some(opt => opt.label === selectedValue)) {
						result.answers[question.header] = {
							selected: [selectedValue],
							freeText: null,
							skipped: false
						};
					} else {
						result.answers[question.header] = {
							selected: [],
							freeText: selectedValue,
							skipped: false
						};
					}
				} else {
					result.answers[question.header] = {
						selected: [],
						freeText: null,
						skipped: true
					};
				}
			} else {
				this.logService.warn(`[AskQuestionsTool] Unknown answer format for "${question.header}": ${JSON.stringify(answer)}`);
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

	private createAutopilotResult(questions: IQuestion[]): IToolResult {
		const answers: Record<string, IQuestionAnswer> = {};
		for (const question of questions) {
			// In autopilot mode the user is not available to respond. Do not
			// auto-select any option — instead instruct the model to make its own
			// decision regardless of the question type.
			answers[question.header] = {
				selected: [],
				freeText: AUTOPILOT_ASK_USER_RESPONSE,
				skipped: false,
			};
		}
		return {
			content: [{ kind: 'text', value: JSON.stringify({ answers } satisfies IAnswerResult) }]
		};
	}

	/**
	 * Build carousel answer data keyed by carousel question IDs for rendering
	 * the completed summary in the UI during autopilot mode.
	 */
	private buildAutopilotCarouselAnswers(questions: IQuestion[], carousel: ChatQuestionCarouselData, idToHeaderMap: Map<string, string>): IChatQuestionAnswers {
		const data: IChatQuestionAnswers = {};
		// Build reverse map: original header -> internal carousel question ID
		const headerToIdMap = new Map<string, string>();
		for (const [internalId, originalHeader] of idToHeaderMap) {
			headerToIdMap.set(originalHeader, internalId);
		}

		for (const question of questions) {
			const internalId = headerToIdMap.get(question.header);
			if (!internalId) {
				continue;
			}

			const chatQuestion = carousel.questions.find(q => q.id === internalId);
			if (!chatQuestion) {
				continue;
			}

			// Do not auto-select any option in autopilot mode — show the
			// "user is not available" response as the answer for all question types.
			if (chatQuestion.type === 'multiSelect') {
				data[internalId] = { selectedValues: [], freeformValue: AUTOPILOT_ASK_USER_RESPONSE };
			} else if (chatQuestion.type === 'singleSelect') {
				data[internalId] = { freeformValue: AUTOPILOT_ASK_USER_RESPONSE };
			} else {
				data[internalId] = AUTOPILOT_ASK_USER_RESPONSE;
			}
		}

		return data;
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
