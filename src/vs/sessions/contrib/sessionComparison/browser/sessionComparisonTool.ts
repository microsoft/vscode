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
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionComparison, ISessionComparisonAttemptVerdict, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';

const CompleteSessionComparisonToolId = 'vscode_completeAttemptComparison';
const ReadSessionComparisonToolId = 'vscode_readAttemptComparison';

interface ICompleteSessionComparisonInput {
	readonly comparisonId: string;
	readonly recommendedParticipantId: string;
	readonly explanation: string;
	readonly conflicts: readonly string[];
	readonly attempts: readonly ISessionComparisonAttemptVerdict[];
}

interface IReadSessionComparisonInput {
	readonly comparisonId: string;
}

export class ReadSessionComparisonTool implements IToolImpl {

	constructor(
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) { }

	getToolData(): IToolData {
		return {
			id: ReadSessionComparisonToolId,
			toolReferenceName: 'readAttemptComparison',
			canBeReferencedInPrompt: true,
			icon: Codicon.compareChanges,
			displayName: localize('sessionComparison.readTool.displayName', "Read Attempt Comparison"),
			userDescription: localize('sessionComparison.readTool.userDescription', "Read the attempts and evidence for an active comparison"),
			modelDescription: 'Read the bounded manifest for an active implementation-attempt comparison. Use this when judging or synthesizing that comparison, before inspecting individual transcripts. It returns the original task, every attempt, changed-file evidence status, change summaries, authoritative worktree locations, and exact targets for get_session_context. Terminal commands start in the Judge or synthesis worktree, so explicitly cd to an attempt\'s listed workingDirectory in every command that inspects or validates it. Read implementation code only from the listed worktrees; transcripts are for rationale or validation evidence. A Judge must review every attempt diff and run missing targeted validation when needed. It does not return full transcripts or submit a verdict.',
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.and(ChatContextKeys.enabled),
			runsInWorkspace: false,
			inputSchema: {
				type: 'object',
				properties: {
					comparisonId: {
						type: 'string',
						description: 'The comparison ID supplied in the Judge or synthesis prompt.',
					},
				},
				required: ['comparisonId'],
				additionalProperties: false,
			},
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('sessionComparison.readTool.invocationMessage', "Reading attempt comparison"),
			pastTenseMessage: localize('sessionComparison.readTool.pastTenseMessage', "Read attempt comparison"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const input = parseReadInput(invocation.parameters);
		if (!input) {
			return toolError('The comparison manifest input is invalid.');
		}
		const comparison = this.comparisonService.getComparison(input.comparisonId);
		if (!comparison) {
			return toolError(`Comparison '${input.comparisonId}' does not exist.`);
		}
		if (!isInvokingParticipant(comparison, invocation, [SessionComparisonParticipantRole.Judge, SessionComparisonParticipantRole.Synthesis])) {
			return toolError('Only the Judge or synthesis session for this comparison can read its manifest.');
		}
		const invokingSession = invocation.context?.sessionResource
			? this.sessionsManagementService.getSession(invocation.context.sessionResource)
			: undefined;

		const attempts = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)
			.map((participant, index) => {
				const session = this.sessionsManagementService.getSession(participant.sessionResource!);
				const changes = session?.changes.get() ?? [];
				const changedFiles = changes.slice(0, 200).map(change => ({
					resource: (isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri).toString(),
					insertions: change.insertions,
					deletions: change.deletions,
				}));
				const workspace = session?.workspace.get();
				const changesSummary = session?.changesSummary?.get();
				const sessionContextTarget = session && invokingSession && invokingSession.providerId === session.providerId
					? this.sessionsManagementService.getSessionContextReference(session.mainChat.get().resource)
					: undefined;
				return {
					participantId: participant.id,
					label: `Attempt ${index + 1}: ${participant.harness.label}${participant.harness.modelLabel ? ` · ${participant.harness.modelLabel}` : ''}`,
					harness: {
						agent: participant.harness.label,
						model: participant.harness.modelLabel ?? 'Default',
					},
					status: session?.status.get() ?? 'unavailable',
					launchError: participant.launchError,
					sessionContextTarget,
					sessionContextUnavailableReason: session && !sessionContextTarget
						? 'Transcript follow-up is unavailable from this Judge host; use the manifest and worktree evidence.'
						: undefined,
					worktree: workspace ? {
						workingDirectory: workspace.folders[0]?.workingDirectory.fsPath,
						folders: workspace.folders.map(folder => folder.workingDirectory.fsPath),
					} : undefined,
					changesSummary,
					changedFiles,
					changedFilesStatus: changes.length > 0 ? 'available' : changesSummary?.files === 0 ? 'noChanges' : 'unavailable',
					changedFilesTruncated: changes.length > changedFiles.length,
				};
			});
		return toolResult(JSON.stringify({
			comparisonId: comparison.id,
			originalTask: comparison.prompt,
			baseBranch: comparison.branch,
			attempts,
			next: 'Review every attempt diff in its authoritative worktree. Terminal commands start in this Judge or synthesis worktree, not an attempt worktree: explicitly cd to the exact attempt worktree.workingDirectory in every command that inspects or validates it. When changedFilesStatus is unavailable, read the Git diff from that worktree instead. Use get_session_context with an exact attempt sessionContextTarget only for rationale, validation claims, or other non-code evidence; never recover implementation code or paths from a transcript. Run missing targeted validation when needed, record whether each result came from the attempt report or the Judge run, and use notApplicable for both validation state and source when a category genuinely does not apply. Do not modify any attempt, inspect another checkout, discover sessions, guess references, or create sessions.',
		}));
	}
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
			modelDescription: 'Submit the final structured verdict for an active implementation-attempt comparison. Use this after reviewing every referenced attempt diff and running any missing targeted validation needed for a reliable recommendation. Record whether each validation result came from the attempt report, a Judge run, was unavailable, or was not applicable. Use notApplicable for both validation state and source when a category genuinely does not apply. The recommended participant must be one of the comparison attempts. This persists an advisory verdict; synthesis only starts through an explicit user action. If invalid input is rejected, correct the reported fields and retry; do not submit again after success.',
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
						description: 'A concise explanation of why the winning attempt is strongest, citing specific code and validation evidence.',
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
								validationSource: {
									type: 'object',
									properties: {
										tests: validationSourceSchema(),
										build: validationSourceSchema(),
										lint: validationSourceSchema(),
										diagnostics: validationSourceSchema(),
									},
									required: ['tests', 'build', 'lint', 'diagnostics'],
									additionalProperties: false,
								},
								unresolvedIssues: { type: 'array', items: { type: 'string' } },
								notableDifferences: {
									type: 'array',
									description: 'The strongest reusable points from this attempt, especially when it is not recommended.',
									items: { type: 'string' },
								},
							},
							required: ['participantId', 'summary', 'validation', 'validationSource', 'unresolvedIssues', 'notableDifferences'],
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
			return toolError('The comparison verdict input is invalid. Every attempt requires tests, build, lint, and diagnostics values in both validation and validationSource. Use notApplicable for both values when a category does not apply.');
		}
		const comparison = this.comparisonService.getComparison(input.comparisonId);
		if (!comparison) {
			return toolError(`Comparison '${input.comparisonId}' does not exist.`);
		}
		if (!isInvokingParticipant(comparison, invocation, [SessionComparisonParticipantRole.Judge])) {
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
		if (input.attempts.some(attempt => validationKinds.some(kind =>
			(attempt.validation[kind] === SessionComparisonValidationState.NotApplicable)
			!== (attempt.validationSource?.[kind] === SessionComparisonValidationSource.NotApplicable)))) {
			return toolError('A notApplicable validation result must use notApplicable as its validation source, and vice versa.');
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
		const toolSet = this._register(toolsService.createToolSet(
			ToolDataSource.Internal,
			'vscode_sessionComparison',
			'sessionComparison',
			{
				icon: Codicon.compareChanges,
				description: localize('sessionComparison.toolSet.description', "Compare implementation attempts"),
				hiddenInToolsPicker: true,
			},
		));
		const readTool = instantiationService.createInstance(ReadSessionComparisonTool);
		const readToolData = readTool.getToolData();
		this._register(toolsService.registerTool(readToolData, readTool));
		this._register(toolSet.addTool(readToolData));
		const tool = instantiationService.createInstance(CompleteSessionComparisonTool);
		const toolData = tool.getToolData();
		this._register(toolsService.registerTool(toolData, tool));
		this._register(toolSet.addTool(toolData));
	}
}

function parseReadInput(value: unknown): IReadSessionComparisonInput | undefined {
	return isRecord(value) && typeof value.comparisonId === 'string'
		? { comparisonId: value.comparisonId }
		: undefined;
}

function isInvokingParticipant(comparison: ISessionComparison, invocation: IToolInvocation, roles: readonly SessionComparisonParticipantRole[]): boolean {
	const invokingSession = invocation.context?.sessionResource;
	return !!invokingSession && comparison.participants.some(participant =>
		roles.includes(participant.role)
		&& !!participant.sessionResource
		&& isEqual(invokingSession, participant.sessionResource));
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
			|| !isRecord(attempt.validationSource)
			|| !isValidationSource(attempt.validationSource.tests)
			|| !isValidationSource(attempt.validationSource.build)
			|| !isValidationSource(attempt.validationSource.lint)
			|| !isValidationSource(attempt.validationSource.diagnostics)
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
			validationSource: {
				tests: attempt.validationSource.tests,
				build: attempt.validationSource.build,
				lint: attempt.validationSource.lint,
				diagnostics: attempt.validationSource.diagnostics,
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
		description: 'Use passed or failed for a known result, notRun when applicable validation was not run, notApplicable when the category does not apply, or unknown when the result cannot be determined.',
		enum: [
			SessionComparisonValidationState.Passed,
			SessionComparisonValidationState.Failed,
			SessionComparisonValidationState.NotRun,
			SessionComparisonValidationState.NotApplicable,
			SessionComparisonValidationState.Unknown,
		],
	};
}

function validationSourceSchema(): IJSONSchema {
	return {
		type: 'string',
		description: 'Use attemptReport, judgeRun, unavailable, or notApplicable. notApplicable must be paired with a notApplicable validation result.',
		enum: [
			SessionComparisonValidationSource.AttemptReport,
			SessionComparisonValidationSource.JudgeRun,
			SessionComparisonValidationSource.NotApplicable,
			SessionComparisonValidationSource.Unavailable,
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
		|| value === SessionComparisonValidationState.NotApplicable
		|| value === SessionComparisonValidationState.Unknown;
}

function isValidationSource(value: unknown): value is SessionComparisonValidationSource {
	return value === SessionComparisonValidationSource.AttemptReport
		|| value === SessionComparisonValidationSource.JudgeRun
		|| value === SessionComparisonValidationSource.NotApplicable
		|| value === SessionComparisonValidationSource.Unavailable;
}

const validationKinds = ['tests', 'build', 'lint', 'diagnostics'] as const;

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
