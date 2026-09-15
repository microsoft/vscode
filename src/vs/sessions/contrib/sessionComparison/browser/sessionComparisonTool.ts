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
import { ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionComparisonHarnessDisplayLabel, ISessionComparison, ISessionComparisonAttemptVerdict, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';

const CompleteSessionComparisonToolId = 'vscode_completeAttemptComparison';
const ReadSessionComparisonToolId = 'vscode_readAttemptComparison';

interface ICompleteSessionComparisonInput {
	readonly comparisonId: string;
	readonly recommendedAttemptNumber: number;
	readonly explanation: string;
	readonly conflicts: readonly string[];
	readonly attempts: readonly ICompleteSessionComparisonAttemptInput[];
	readonly decisionSections: readonly ICompleteSessionComparisonDecisionSectionInput[];
}

interface ICompleteSessionComparisonAttemptInput extends Omit<ISessionComparisonAttemptVerdict, 'participantId'> {
	readonly attemptNumber: number;
}

interface ICompleteSessionComparisonDecisionSectionInput {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly affectedFiles: readonly string[];
	readonly options: readonly {
		readonly attemptNumber: number;
		readonly approach: string;
	}[];
	readonly recommendedAttemptNumber: number;
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
			modelDescription: 'Read the bounded manifest for an active implementation-attempt comparison. Use this when judging or synthesizing that comparison, before inspecting individual transcripts. It returns the original task, every attempt, changed-file evidence status, change summaries, authoritative worktree locations, exact targets for get_session_context, and any user-selected synthesis plan. Terminal commands start in the Judge or synthesis worktree, so explicitly cd to an attempt\'s listed workingDirectory in every command that inspects or validates it. Read implementation code only from the listed worktrees; transcripts are for rationale or validation evidence. A Judge must review every attempt diff and run missing targeted validation when needed. A synthesis agent must treat selected plan sections as user requirements. It does not return full transcripts or submit a verdict.',
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

		const attemptParticipants = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource);
		const attemptNumbers = new Map(attemptParticipants.map((participant, index) => [participant.id, index + 1]));
		const attempts = attemptParticipants.map((participant, index) => {
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
			const reasoningEffort = participant.harness.modelConfiguration?.[ReasoningEffortConfigKey];
			return {
				attemptNumber: index + 1,
				label: `Attempt ${index + 1}: ${getSessionComparisonHarnessDisplayLabel(participant.harness)}`,
				harness: {
					agent: participant.harness.label,
					model: participant.harness.modelLabel ?? 'Default',
					reasoningEffort: typeof reasoningEffort === 'string' ? reasoningEffort : 'default',
					permissions: {
						id: participant.harness.permissionId ?? 'default',
						label: participant.harness.permissionLabel ?? 'Default',
					},
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
		const synthesisPlan = comparison.synthesisPlan && comparison.verdict?.decisionSections ? {
			sections: comparison.synthesisPlan.selections.flatMap(selection => {
				const section = comparison.verdict!.decisionSections!.find(section => section.id === selection.sectionId);
				if (!section) {
					return [];
				}
				const option = selection.participantId
					? section.options.find(option => option.participantId === selection.participantId)
					: undefined;
				const attemptNumber = option ? attemptNumbers.get(option.participantId) : undefined;
				return [{
					sectionId: section.id,
					title: section.title,
					description: section.description,
					affectedFiles: section.affectedFiles,
					selection: option && attemptNumber ? {
						kind: 'attempt',
						attemptNumber,
						approach: option.approach,
					} : { kind: 'synthesizer' },
				}];
			}),
		} : undefined;
		return toolResult(JSON.stringify({
			comparisonId: comparison.id,
			originalTask: comparison.prompt,
			baseBranch: comparison.branch,
			attempts,
			synthesisPlan,
			next: 'Review every attempt diff in its authoritative worktree. Terminal commands start in this Judge or synthesis worktree, not an attempt worktree: explicitly cd to the exact attempt worktree.workingDirectory in every command that inspects or validates it. When changedFilesStatus is unavailable, read the Git diff from that worktree instead. Use get_session_context with an exact attempt sessionContextTarget only for rationale, validation claims, or other non-code evidence; never recover implementation code or paths from a transcript. Run missing targeted validation when needed, record whether each result came from the attempt report or the Judge run, and use notApplicable for both validation state and source when a category genuinely does not apply. Submit verdict references using the manifest attemptNumber values; do not copy participant or session UUIDs. If synthesisPlan is present, treat every selected section as an explicit user requirement and resolve dependencies coherently rather than copying hunks mechanically. Do not modify any attempt, inspect another checkout, discover sessions, guess references, or create sessions.',
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
			modelDescription: 'Submit the final structured verdict for an active implementation-attempt comparison. Use this after reviewing every referenced attempt diff and running any missing targeted validation needed for a reliable recommendation. Reference attempts only by the attemptNumber values returned by readAttemptComparison; do not use participant or session UUIDs. Record whether each validation result came from the attempt report, a Judge run, was unavailable, or was not applicable. Use notApplicable for both validation state and source when a category genuinely does not apply. Identify semantic decision sections when attempts take meaningfully different approaches, including affected files and one concise option per relevant attemptNumber. This persists an advisory verdict; synthesis only starts through an explicit user action. If invalid input is rejected, correct the reported fields and retry; do not submit again after success.',
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
					recommendedAttemptNumber: {
						type: 'integer',
						minimum: 1,
						description: 'The attemptNumber of the strongest attempt from readAttemptComparison.',
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
								attemptNumber: {
									type: 'integer',
									minimum: 1,
									description: 'The attemptNumber from readAttemptComparison.',
								},
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
							required: ['attemptNumber', 'summary', 'validation', 'validationSource', 'unresolvedIssues', 'notableDifferences'],
							additionalProperties: false,
						},
					},
					decisionSections: {
						type: 'array',
						description: 'Semantic implementation decisions the user may customize before synthesis. Return an empty array when there are no meaningful cross-attempt choices.',
						items: {
							type: 'object',
							properties: {
								id: { type: 'string', description: 'A stable identifier unique within this verdict.' },
								title: { type: 'string', description: 'A short user-facing name for the decision.' },
								description: { type: 'string', description: 'What this decision controls and why the approaches differ.' },
								affectedFiles: { type: 'array', items: { type: 'string' } },
								options: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											attemptNumber: { type: 'integer', minimum: 1 },
											approach: { type: 'string', description: 'A concise description of this attempt\'s approach.' },
										},
										required: ['attemptNumber', 'approach'],
										additionalProperties: false,
									},
								},
								recommendedAttemptNumber: { type: 'integer', minimum: 1 },
							},
							required: ['id', 'title', 'description', 'affectedFiles', 'options', 'recommendedAttemptNumber'],
							additionalProperties: false,
						},
					},
				},
				required: ['comparisonId', 'recommendedAttemptNumber', 'explanation', 'conflicts', 'attempts', 'decisionSections'],
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
		const attemptParticipants = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource);
		if (!Number.isInteger(input.recommendedAttemptNumber)
			|| input.recommendedAttemptNumber < 1
			|| input.recommendedAttemptNumber > attemptParticipants.length
			|| input.attempts.length !== attemptParticipants.length
			|| input.attempts.some(attempt => !Number.isInteger(attempt.attemptNumber) || attempt.attemptNumber < 1 || attempt.attemptNumber > attemptParticipants.length)
			|| new Set(input.attempts.map(attempt => attempt.attemptNumber)).size !== input.attempts.length) {
			return toolError('The verdict must recommend an attemptNumber and include exactly one finding for every attemptNumber returned by readAttemptComparison.');
		}
		if (input.attempts.some(attempt => validationKinds.some(kind =>
			(attempt.validation[kind] === SessionComparisonValidationState.NotApplicable)
			!== (attempt.validationSource?.[kind] === SessionComparisonValidationSource.NotApplicable)))) {
			return toolError('A notApplicable validation result must use notApplicable as its validation source, and vice versa.');
		}
		const decisionSectionIds = new Set<string>();
		if (input.decisionSections.some(section => {
			const optionNumbers = new Set(section.options.map(option => option.attemptNumber));
			const invalid = decisionSectionIds.has(section.id)
				|| !optionNumbers.has(section.recommendedAttemptNumber)
				|| optionNumbers.size !== section.options.length
				|| section.options.some(option => !Number.isInteger(option.attemptNumber) || option.attemptNumber < 1 || option.attemptNumber > attemptParticipants.length);
			decisionSectionIds.add(section.id);
			return invalid;
		})) {
			return toolError('Every synthesis decision section must have a unique ID and reference known attemptNumber values.');
		}

		const verdict: ISessionComparisonVerdict = {
			recommendedParticipantId: attemptParticipants[input.recommendedAttemptNumber - 1].id,
			explanation: input.explanation,
			conflicts: input.conflicts,
			attempts: input.attempts.map(attempt => {
				const { attemptNumber, ...finding } = attempt;
				return {
					participantId: attemptParticipants[attemptNumber - 1].id,
					...finding,
				};
			}),
			decisionSections: input.decisionSections.map(section => ({
				id: section.id,
				title: section.title,
				description: section.description,
				affectedFiles: section.affectedFiles,
				options: section.options.map(option => ({
					participantId: attemptParticipants[option.attemptNumber - 1].id,
					approach: option.approach,
				})),
				recommendedParticipantId: attemptParticipants[section.recommendedAttemptNumber - 1].id,
			})),
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
		|| typeof value.recommendedAttemptNumber !== 'number'
		|| typeof value.explanation !== 'string'
		|| !isStringArray(value.conflicts)
		|| !Array.isArray(value.attempts)
		|| !Array.isArray(value.decisionSections)) {
		return undefined;
	}
	const attempts: ICompleteSessionComparisonAttemptInput[] = [];
	for (const attempt of value.attempts) {
		if (!isRecord(attempt)
			|| typeof attempt.attemptNumber !== 'number'
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
			attemptNumber: attempt.attemptNumber,
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
	const decisionSections: ICompleteSessionComparisonDecisionSectionInput[] = [];
	for (const section of value.decisionSections) {
		if (!isRecord(section)
			|| typeof section.id !== 'string'
			|| typeof section.title !== 'string'
			|| typeof section.description !== 'string'
			|| !isStringArray(section.affectedFiles)
			|| !Array.isArray(section.options)
			|| typeof section.recommendedAttemptNumber !== 'number') {
			return undefined;
		}
		const options: { attemptNumber: number; approach: string }[] = [];
		for (const option of section.options) {
			if (!isRecord(option)
				|| typeof option.attemptNumber !== 'number'
				|| typeof option.approach !== 'string') {
				return undefined;
			}
			options.push({ attemptNumber: option.attemptNumber, approach: option.approach });
		}
		decisionSections.push({
			id: section.id,
			title: section.title,
			description: section.description,
			affectedFiles: section.affectedFiles,
			options,
			recommendedAttemptNumber: section.recommendedAttemptNumber,
		});
	}
	return {
		comparisonId: value.comparisonId,
		recommendedAttemptNumber: value.recommendedAttemptNumber,
		explanation: value.explanation,
		conflicts: value.conflicts,
		attempts,
		decisionSections,
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
