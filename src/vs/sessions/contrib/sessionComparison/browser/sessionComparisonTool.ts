/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionComparisonAttemptVerdict, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';

const CompleteSessionComparisonToolId = 'vscode_completeAttemptComparison';

interface ICompleteSessionComparisonInput {
	readonly comparisonId: string;
	readonly recommendedParticipantId: string;
	readonly explanation: string;
	readonly conflicts: readonly string[];
	readonly attempts: readonly ISessionComparisonAttemptVerdict[];
}

export class CompleteSessionComparisonTool implements IToolImpl {

	constructor(
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
	) { }

	getToolData(): IToolData {
		return {
			id: CompleteSessionComparisonToolId,
			toolReferenceName: 'completeAttemptComparison',
			canBeReferencedInPrompt: true,
			icon: Codicon.compareChanges,
			displayName: localize('sessionComparison.tool.displayName', "Complete Attempt Comparison"),
			userDescription: localize('sessionComparison.tool.userDescription', "Submit the judge's structured attempt comparison"),
			modelDescription: 'Submit the final structured verdict for an active implementation-attempt comparison. Use this exactly once after inspecting every referenced attempt, its code changes, and its validation evidence. The recommended participant must be one of the comparison attempts. This persists an advisory verdict; synthesis only starts through an explicit user action.',
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.and(ChatContextKeys.enabled),
			runsInWorkspace: false,
			inputSchema: {
				type: 'object',
				properties: {
					comparisonId: {
						type: 'string',
						description: 'The comparison ID supplied in the judge prompt.',
					},
					recommendedParticipantId: {
						type: 'string',
						description: 'The participant ID of the strongest attempt.',
					},
					explanation: {
						type: 'string',
						description: 'A concise explanation of the recommendation and important trade-offs.',
					},
					conflicts: {
						type: 'array',
						description: 'Cross-attempt conflicts or incompatible design choices that synthesis must resolve.',
						items: { type: 'string' },
					},
					attempts: {
						type: 'array',
						description: 'One structured verdict for each attempt.',
						items: {
							type: 'object',
							properties: {
								participantId: { type: 'string' },
								summary: { type: 'string' },
								validation: {
									type: 'object',
									properties: {
										tests: validationStateSchema(),
										build: validationStateSchema(),
										lint: validationStateSchema(),
										diagnostics: validationStateSchema(),
									},
									required: ['tests', 'build', 'lint', 'diagnostics'],
									additionalProperties: false,
								},
								unresolvedIssues: { type: 'array', items: { type: 'string' } },
								notableDifferences: { type: 'array', items: { type: 'string' } },
							},
							required: ['participantId', 'summary', 'validation', 'unresolvedIssues', 'notableDifferences'],
							additionalProperties: false,
						},
					},
				},
				required: ['comparisonId', 'recommendedParticipantId', 'explanation', 'conflicts', 'attempts'],
				additionalProperties: false,
			},
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('sessionComparison.tool.invocationMessage', "Submitting attempt comparison"),
			pastTenseMessage: localize('sessionComparison.tool.pastTenseMessage', "Submitted attempt comparison"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const input = parseInput(invocation.parameters);
		if (!input) {
			return toolError('The comparison verdict input is invalid.');
		}
		const comparison = this.comparisonService.getComparison(input.comparisonId);
		if (!comparison) {
			return toolError(`Comparison '${input.comparisonId}' does not exist.`);
		}
		const invokingSession = invocation.context?.sessionResource;
		const judge = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
		if (!invokingSession || !judge?.sessionResource || !isEqual(invokingSession, judge.sessionResource)) {
			return toolError('Only the judge session for this comparison can submit its verdict.');
		}
		const attemptIds = new Set(comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)
			.map(participant => participant.id));
		if (!attemptIds.has(input.recommendedParticipantId)
			|| input.attempts.length !== attemptIds.size
			|| input.attempts.some(attempt => !attemptIds.has(attempt.participantId))
			|| new Set(input.attempts.map(attempt => attempt.participantId)).size !== input.attempts.length) {
			return toolError('The verdict must recommend an attempt and include exactly one finding for every attempt.');
		}

		const verdict: ISessionComparisonVerdict = {
			recommendedParticipantId: input.recommendedParticipantId,
			explanation: input.explanation,
			conflicts: input.conflicts,
			attempts: input.attempts,
		};
		this.comparisonService.submitVerdict(input.comparisonId, verdict);
		const result = toolResult(JSON.stringify({ status: 'submitted', comparisonId: input.comparisonId }));
		result.toolResultMessage = localize('sessionComparison.tool.result', "Submitted attempt comparison");
		return result;
	}
}

export class SessionComparisonToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sessionComparisonTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const tool = instantiationService.createInstance(CompleteSessionComparisonTool);
		this._register(toolsService.registerTool(tool.getToolData(), tool));
	}
}

function parseInput(value: unknown): ICompleteSessionComparisonInput | undefined {
	if (!isRecord(value)
		|| typeof value.comparisonId !== 'string'
		|| typeof value.recommendedParticipantId !== 'string'
		|| typeof value.explanation !== 'string'
		|| !isStringArray(value.conflicts)
		|| !Array.isArray(value.attempts)) {
		return undefined;
	}
	const attempts: ISessionComparisonAttemptVerdict[] = [];
	for (const attempt of value.attempts) {
		if (!isRecord(attempt)
			|| typeof attempt.participantId !== 'string'
			|| typeof attempt.summary !== 'string'
			|| !isRecord(attempt.validation)
			|| !isValidationState(attempt.validation.tests)
			|| !isValidationState(attempt.validation.build)
			|| !isValidationState(attempt.validation.lint)
			|| !isValidationState(attempt.validation.diagnostics)
			|| !isStringArray(attempt.unresolvedIssues)
			|| !isStringArray(attempt.notableDifferences)) {
			return undefined;
		}
		attempts.push({
			participantId: attempt.participantId,
			summary: attempt.summary,
			validation: {
				tests: attempt.validation.tests,
				build: attempt.validation.build,
				lint: attempt.validation.lint,
				diagnostics: attempt.validation.diagnostics,
			},
			unresolvedIssues: attempt.unresolvedIssues,
			notableDifferences: attempt.notableDifferences,
		});
	}
	return {
		comparisonId: value.comparisonId,
		recommendedParticipantId: value.recommendedParticipantId,
		explanation: value.explanation,
		conflicts: value.conflicts,
		attempts,
	};
}

function validationStateSchema(): IJSONSchema {
	return {
		type: 'string',
		enum: [
			SessionComparisonValidationState.Passed,
			SessionComparisonValidationState.Failed,
			SessionComparisonValidationState.NotRun,
			SessionComparisonValidationState.Unknown,
		],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isValidationState(value: unknown): value is SessionComparisonValidationState {
	return value === SessionComparisonValidationState.Passed
		|| value === SessionComparisonValidationState.Failed
		|| value === SessionComparisonValidationState.NotRun
		|| value === SessionComparisonValidationState.Unknown;
}

function toolResult(value: string): IToolResult {
	return { content: [{ kind: 'text', value }] };
}

function toolError(message: string): IToolResult {
	return {
		content: [{ kind: 'text', value: message }],
		toolResultError: message,
		toolResultMessage: localize('sessionComparison.tool.error', "Attempt comparison submission failed"),
	};
}
