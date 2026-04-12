/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CancellationError } from '../../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IChatService } from '../../chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../constants.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ToolDataSource } from '../languageModelToolsService.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { raceCancellation } from '../../../../../../base/common/async.js';
/**
 * Response returned to the model when the user is not available (autopilot mode).
 */
export const AUTOPILOT_ASK_USER_RESPONSE = 'The user is not available to respond and will review your work later. Work autonomously and make good decisions.';
// Use a distinct id to avoid clashing with extension-provided tools
export const AskQuestionsToolId = 'vscode_askQuestions';
// Soft limits are used in the schema to guide the model
// Hard limits are more lenient and used to truncate if the model overshoots
//
// Example text at each limit:
// - header soft (50 chars):        "Which database engine do you want to use for this?"
// - header hard (75 chars):        "Which database engine and connection pooling strategy do you want to use here?"
// - question soft (200 chars):     "What testing framework would you like to use for this project? Consider factors like your team's familiarity, community support, and integration with your existing CI/CD pipeline when making a choice."
// - question hard (300 chars):     "What testing framework would you like to use for this project? Consider factors like your team's familiarity with the framework, community support and documentation quality, integration with your existing CI/CD pipeline, and the specific testing needs of your application architecture when deciding."
const SoftLimits = {
    header: 50,
    question: 200
};
const HardLimits = {
    header: 75,
    question: 300
};
function truncateToLimit(value, limit) {
    if (value === undefined) {
        return undefined;
    }
    if (value.length > limit) {
        return value.slice(0, limit - 3) + '...';
    }
    return value;
}
export function createAskQuestionsToolData() {
    const questionSchema = {
        type: 'object',
        properties: {
            header: {
                type: 'string',
                description: 'Short identifier for the question. Must be unique so answers can be mapped back to the question.',
                maxLength: SoftLimits.header
            },
            question: {
                type: 'string',
                description: 'The question text to display to the user. Keep it concise, ideally one sentence.',
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
    const inputSchema = {
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
export const AskQuestionsToolData = createAskQuestionsToolData();
let AskQuestionsTool = class AskQuestionsTool extends Disposable {
    constructor(chatService, telemetryService, logService, configService) {
        super();
        this.chatService = chatService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.configService = configService;
    }
    async invoke(invocation, _countTokens, progress, token) {
        const stopWatch = StopWatch.create(true);
        const parameters = invocation.parameters;
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
        if (request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot || this.configService.getValue(ChatConfiguration.AutoReply)) {
            const reason = request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot ? 'Autopilot mode' : 'Auto-reply enabled';
            this.logService.info(`[AskQuestionsTool] ${reason}: auto-responding to questions`);
            const { carousel, idToHeaderMap } = this.toQuestionCarousel(questions);
            carousel.data = this.buildAutopilotCarouselAnswers(questions, carousel, idToHeaderMap);
            carousel.isUsed = true;
            this.chatService.appendProgress(request, carousel);
            return this.createAutopilotResult(questions);
        }
        const { carousel, idToHeaderMap } = this.toQuestionCarousel(questions);
        this.chatService.appendProgress(request, carousel);
        const answerResult = await raceCancellation(carousel.completion.p, token);
        if (token.isCancellationRequested) {
            throw new CancellationError();
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
    async prepareToolInvocation(context, _token) {
        const parameters = context.parameters;
        const { questions } = parameters;
        if (!questions || questions.length === 0) {
            throw new Error(localize('askQuestionsTool.noQuestions', 'No questions provided. The questions array must contain at least one question.'));
        }
        for (const question of questions) {
            if (question.options && question.options.length === 1) {
                throw new Error(localize('askQuestionsTool.invalidOptions', 'Question "{0}" must have at least two options, or none for free text input.', question.header));
            }
            // Apply hard limits to truncate display values that exceed the more lenient hard limit
            // Note: The original header is preserved and used as the answer key in convertCarouselAnswers
            // to avoid collisions when distinct headers become identical after truncation
            question.question = truncateToLimit(question.question, HardLimits.question) ?? question.question;
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
    getRequest(chatSessionResource, chatRequestId) {
        if (!chatSessionResource) {
            return { request: undefined, sessionResource: undefined };
        }
        const model = this.chatService.getSession(chatSessionResource);
        let request;
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
    toQuestionCarousel(questions) {
        const idToHeaderMap = new Map();
        const mappedQuestions = questions.map(question => this.toChatQuestion(question, idToHeaderMap));
        return {
            carousel: new ChatQuestionCarouselData(mappedQuestions, true, generateUuid()),
            idToHeaderMap
        };
    }
    toChatQuestion(question, idToHeaderMap) {
        let type;
        if (!question.options || question.options.length === 0) {
            type = 'text';
        }
        else if (question.multiSelect) {
            type = 'multiSelect';
        }
        else {
            type = 'singleSelect';
        }
        let defaultValue;
        if (question.options) {
            const recommendedOptions = question.options.filter(opt => opt.recommended);
            if (recommendedOptions.length > 0) {
                defaultValue = question.multiSelect ? recommendedOptions.map(opt => opt.label) : recommendedOptions[0].label;
            }
        }
        // Use a stable UUID as the internal ID to avoid collisions when truncating headers
        // The original header is preserved in idToHeaderMap for answer correlation
        const internalId = generateUuid();
        idToHeaderMap.set(internalId, question.header);
        // Truncate header for display only
        const displayTitle = truncateToLimit(question.header, HardLimits.header) ?? question.header;
        return {
            id: internalId,
            type,
            title: displayTitle,
            message: question.question,
            options: question.options?.map(opt => ({
                id: opt.label,
                label: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
                value: opt.label
            })),
            defaultValue,
            allowFreeformInput: question.allowFreeformInput ?? true
        };
    }
    convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap) {
        const result = { answers: {} };
        if (carouselAnswers) {
            this.logService.trace(`[AskQuestionsTool] Carousel answer keys: ${Object.keys(carouselAnswers).join(', ')}`);
            this.logService.trace(`[AskQuestionsTool] Question headers: ${questions.map(q => q.header).join(', ')}`);
        }
        // Build a reverse map: original header -> internal ID
        const headerToIdMap = new Map();
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
            const answer = internalId ? carouselAnswers[internalId] : undefined;
            this.logService.trace(`[AskQuestionsTool] Processing question "${question.header}" (internal ID: ${internalId}), raw answer: ${JSON.stringify(answer)}, type: ${typeof answer}`);
            if (answer === undefined) {
                result.answers[question.header] = {
                    selected: [],
                    freeText: null,
                    skipped: true
                };
            }
            else if (typeof answer === 'string') {
                if (question.options?.some(opt => opt.label === answer)) {
                    result.answers[question.header] = {
                        selected: [answer],
                        freeText: null,
                        skipped: false
                    };
                }
                else {
                    result.answers[question.header] = {
                        selected: [],
                        freeText: answer,
                        skipped: false
                    };
                }
            }
            else if (Array.isArray(answer)) {
                result.answers[question.header] = {
                    selected: answer.map(a => String(a)),
                    freeText: null,
                    skipped: false
                };
            }
            else if (typeof answer === 'object' && hasKey(answer, { selectedValues: true })) {
                const { selectedValues, freeformValue } = answer;
                result.answers[question.header] = {
                    selected: selectedValues,
                    freeText: freeformValue ?? null,
                    skipped: false
                };
            }
            else if (typeof answer === 'object' && (hasKey(answer, { selectedValue: true }) || hasKey(answer, { freeformValue: true }))) {
                const { selectedValue, freeformValue } = answer;
                if (freeformValue) {
                    result.answers[question.header] = {
                        selected: [],
                        freeText: freeformValue,
                        skipped: false
                    };
                }
                else if (selectedValue !== undefined) {
                    if (question.options?.some(opt => opt.label === selectedValue)) {
                        result.answers[question.header] = {
                            selected: [selectedValue],
                            freeText: null,
                            skipped: false
                        };
                    }
                    else {
                        result.answers[question.header] = {
                            selected: [],
                            freeText: selectedValue,
                            skipped: false
                        };
                    }
                }
                else {
                    result.answers[question.header] = {
                        selected: [],
                        freeText: null,
                        skipped: true
                    };
                }
            }
            else {
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
    collectMetrics(questions, result) {
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
    createSkippedResult(questions) {
        const skippedAnswers = {};
        for (const question of questions) {
            skippedAnswers[question.header] = { selected: [], freeText: null, skipped: true };
        }
        return {
            content: [{ kind: 'text', value: JSON.stringify({ answers: skippedAnswers }) }]
        };
    }
    createAutopilotResult(questions) {
        const answers = {};
        for (const question of questions) {
            // Pick the recommended option if available, otherwise pick the first option
            const recommended = question.options?.find(opt => opt.recommended);
            const firstOption = question.options?.[0];
            const selected = recommended?.label ?? firstOption?.label;
            answers[question.header] = {
                selected: selected ? [selected] : [],
                freeText: selected ? null : AUTOPILOT_ASK_USER_RESPONSE,
                skipped: false,
            };
        }
        return {
            content: [{ kind: 'text', value: JSON.stringify({ answers }) }]
        };
    }
    /**
     * Build carousel answer data keyed by carousel question IDs for rendering
     * the completed summary in the UI during autopilot mode.
     */
    buildAutopilotCarouselAnswers(questions, carousel, idToHeaderMap) {
        const data = {};
        // Build reverse map: original header -> internal carousel question ID
        const headerToIdMap = new Map();
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
            const recommended = question.options?.find(opt => opt.recommended);
            const firstOption = question.options?.[0];
            const selectedLabel = recommended?.label ?? firstOption?.label;
            if (chatQuestion.type === 'text' || !selectedLabel) {
                data[internalId] = AUTOPILOT_ASK_USER_RESPONSE;
            }
            else if (chatQuestion.type === 'multiSelect') {
                data[internalId] = { selectedValues: [selectedLabel] };
            }
            else {
                data[internalId] = { selectedValue: selectedLabel };
            }
        }
        return data;
    }
    sendTelemetry(requestId, questionCount, answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount, duration) {
        this.telemetryService.publicLog2('askQuestionsToolInvoked', {
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
};
AskQuestionsTool = __decorate([
    __param(0, IChatService),
    __param(1, ITelemetryService),
    __param(2, ILogService),
    __param(3, IConfigurationService)
], AskQuestionsTool);
export { AskQuestionsTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNrUXVlc3Rpb25zVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9hc2tRdWVzdGlvbnNUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUF5RixZQUFZLEVBQTJCLE1BQU0sa0NBQWtDLENBQUM7QUFDaEwsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFckcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQXVJLGNBQWMsRUFBZ0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwTixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7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