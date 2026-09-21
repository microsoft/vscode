/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionComparisonAttemptLabel, ISessionComparison, ISessionComparisonAttemptVerdict, ISessionComparisonRationale, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole, SessionComparisonValidationEvidence, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../services/sessions/common/sessionComparison.js';

const CompleteSessionComparisonToolId = 'vscode_completeAttemptComparison';
const ReadSessionComparisonToolId = 'vscode_readAttemptComparison';
const MaxExplanationLength = 240;
const MaxRationalePointLength = 180;
const MaxManifestTextLength = 1000;
const MaxManifestListItems = 32;

interface ICompleteSessionComparisonInput {
	readonly comparisonId: string;
	readonly recommendedAttemptNumber: number;
	readonly explanation: string;
	readonly rationale: ISessionComparisonRationale;
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
		readonly assessment: SessionComparisonDecisionAssessment;
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
			modelDescription: 'Read the bounded manifest for an active implementation-attempt comparison. Use this when judging or synthesizing that comparison, before inspecting individual transcripts. It returns the original task, every attempt with a semantic lifecycle status, changed-file evidence status, change summaries, authoritative worktree locations, exact targets for get_session_context, the Judge verdict mapped to attempt numbers when available, and any user-selected synthesis plan. Attempt status is one of untitled, inProgress, needsInput, completed, error, or unavailable; only completed means the attempt finished successfully. Terminal commands start in the Judge or synthesis worktree, so explicitly cd to an attempt\'s listed workingDirectory in every command that inspects or validates it. Read implementation code only from the listed worktrees; transcripts are for rationale or validation evidence. A Judge must review every attempt diff, use get_session_context to identify validation the attempt already completed, never rerun a validation category with a clear reported result, and run only missing targeted validation when needed. If dependencies or build artifacts are unavailable, it must record validation as unavailable without installing dependencies or substituting another validation category. A synthesis agent must resolve the verdict\'s conflicts and consider every decision section while treating selected plan sections as user requirements. It does not return full transcripts or submit a verdict.',
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

		const allAttemptParticipants = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const attemptNumbers = new Map(allAttemptParticipants.map((participant, index) => [participant.id, index + 1]));
		const attemptParticipants = allAttemptParticipants.filter(participant => participant.sessionResource);
		const attempts = attemptParticipants.map(participant => {
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
			const attemptNumber = attemptNumbers.get(participant.id)!;
			return {
				attemptNumber,
				label: getSessionComparisonAttemptLabel(participant, attemptNumber),
				harness: {
					agent: participant.harness.label,
					model: participant.harness.modelLabel ?? 'Default',
					reasoningEffort: typeof reasoningEffort === 'string' ? reasoningEffort : 'default',
					permissions: {
						id: participant.harness.permissionId ?? 'default',
						label: participant.harness.permissionLabel ?? 'Default',
					},
				},
				status: getManifestSessionStatus(session?.status.get()),
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
		const synthesisPlan = comparison.synthesisPlan ? {
			instructions: comparison.synthesisPlan.instructions,
			sections: comparison.verdict?.decisionSections ? comparison.synthesisPlan.selections.flatMap(selection => {
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
			}) : [],
		} : undefined;
		return toolResult(JSON.stringify({
			comparisonId: comparison.id,
			originalTask: comparison.prompt,
			baseBranch: comparison.branch,
			attempts,
			verdict: comparison.verdict ? toManifestVerdict(comparison.verdict, attemptNumbers) : undefined,
			synthesisPlan,
			next: 'Review every completed attempt diff in its authoritative worktree and treat error as failed and inProgress or needsInput as unfinished. Terminal commands start in this Judge or synthesis worktree, not an attempt worktree: explicitly cd to the exact attempt worktree.workingDirectory in every command that inspects or validates it. When changedFilesStatus is unavailable, read the Git diff from that worktree instead. Use get_session_context with an exact attempt sessionContextTarget to identify validation the attempt already completed and for rationale or other non-code evidence; never recover implementation code or paths from a transcript. Do not rerun a validation category with a clear reported result. Run only missing targeted validation when needed. If required dependencies or build artifacts are unavailable, record validation as unavailable without installing or building dependencies or substituting another validation category. Record each validation category as a consistent state and source pair. Submit verdict references using the manifest attemptNumber values; do not copy participant or session UUIDs. During synthesis, resolve every reported conflict, consider every verdict decision section, and treat synthesisPlan instructions and selections as explicit user requirements. Resolve dependencies coherently rather than copying hunks mechanically. Do not modify any attempt, inspect another checkout, discover sessions, guess references, or create sessions.',
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
			modelDescription: 'Submit the final structured verdict for an active implementation-attempt comparison. Use this after reviewing every referenced attempt diff and running any missing targeted validation needed for a reliable recommendation. Reference attempts only by the attemptNumber values returned by readAttemptComparison; do not use participant or session UUIDs. Keep explanation to one concise sentence. Provide exactly one concise rationale point in this order: comparison, validation, codeQuality, and solution. Each point must cite concrete evidence and stay within the schema length limit. For each validation category, provide one consistent state and source evidence pair. Known passed or failed results must come from the attempt report or a Judge run; unavailable evidence cannot claim a known result. Identify semantic decision sections when attempts take meaningfully different approaches, including affected files and one concise option per relevant attemptNumber. Rate every option as better, neutral, or worse and rate each section\'s recommended option as better. This persists an advisory verdict; synthesis only starts through an explicit user action. If invalid input is rejected, correct the reported fields and retry; do not submit again after success.',
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
						minLength: 1,
						maxLength: MaxExplanationLength,
						description: 'One concise sentence summarizing why the winning attempt is strongest.',
					},
					rationale: {
						type: 'object',
						description: 'Four categorized, concise reasons why the recommended attempt won.',
						properties: {
							comparison: rationalePointSchema('The decisive advantage over the other attempts.'),
							validation: rationalePointSchema('The strongest concrete validation evidence.'),
							codeQuality: rationalePointSchema('Why the implementation is well scoped and maintainable.'),
							solution: rationalePointSchema('What the solution gets right.'),
						},
						required: ['comparison', 'validation', 'codeQuality', 'solution'],
						additionalProperties: false,
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
										tests: validationEvidenceSchema(),
										build: validationEvidenceSchema(),
										lint: validationEvidenceSchema(),
										diagnostics: validationEvidenceSchema(),
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
							required: ['attemptNumber', 'summary', 'validation', 'unresolvedIssues', 'notableDifferences'],
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
											assessment: {
												type: 'string',
												description: 'Rate this approach relative to the other options for this decision.',
												enum: [
													SessionComparisonDecisionAssessment.Better,
													SessionComparisonDecisionAssessment.Neutral,
													SessionComparisonDecisionAssessment.Worse,
												],
											},
										},
										required: ['attemptNumber', 'approach', 'assessment'],
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
				required: ['comparisonId', 'recommendedAttemptNumber', 'explanation', 'rationale', 'conflicts', 'attempts', 'decisionSections'],
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
			return toolError('The comparison verdict input is invalid. Keep explanation to one sentence, provide concise comparison, validation, codeQuality, and solution rationale points, and use a consistent state and source pair for every validation category.');
		}
		const comparison = this.comparisonService.getComparison(input.comparisonId);
		if (!comparison) {
			return toolError(`Comparison '${input.comparisonId}' does not exist.`);
		}
		if (!isInvokingParticipant(comparison, invocation, [SessionComparisonParticipantRole.Judge])) {
			return toolError('Only the judge session for this comparison can submit its verdict.');
		}
		const allAttemptParticipants = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const attemptParticipantsByNumber = new Map<number, ISessionComparison['participants'][number]>();
		for (const [index, participant] of allAttemptParticipants.entries()) {
			if (participant.sessionResource) {
				attemptParticipantsByNumber.set(index + 1, participant);
			}
		}
		const attemptParticipants = [...attemptParticipantsByNumber.values()];
		const validAttemptNumbers = new Set(attemptParticipantsByNumber.keys());
		if (!Number.isInteger(input.recommendedAttemptNumber)
			|| !validAttemptNumbers.has(input.recommendedAttemptNumber)
			|| input.attempts.length !== attemptParticipants.length
			|| input.attempts.some(attempt => !Number.isInteger(attempt.attemptNumber) || !validAttemptNumbers.has(attempt.attemptNumber))
			|| new Set(input.attempts.map(attempt => attempt.attemptNumber)).size !== input.attempts.length) {
			return toolError('The verdict must recommend an attemptNumber and include exactly one finding for every attemptNumber returned by readAttemptComparison.');
		}
		const decisionSectionIds = new Set<string>();
		if (input.decisionSections.some(section => {
			const optionNumbers = new Set(section.options.map(option => option.attemptNumber));
			const recommendedOption = section.options.find(option => option.attemptNumber === section.recommendedAttemptNumber);
			const invalid = decisionSectionIds.has(section.id)
				|| recommendedOption?.assessment !== SessionComparisonDecisionAssessment.Better
				|| optionNumbers.size !== section.options.length
				|| section.options.some(option => !Number.isInteger(option.attemptNumber) || !validAttemptNumbers.has(option.attemptNumber));
			decisionSectionIds.add(section.id);
			return invalid;
		})) {
			return toolError('Every synthesis decision section must have a unique ID, reference known attemptNumber values, and rate its recommended option as better.');
		}

		const verdict: ISessionComparisonVerdict = {
			recommendedParticipantId: attemptParticipantsByNumber.get(input.recommendedAttemptNumber)!.id,
			explanation: input.explanation,
			rationale: input.rationale,
			conflicts: input.conflicts,
			attempts: input.attempts.map(attempt => {
				const { attemptNumber, ...finding } = attempt;
				return {
					participantId: attemptParticipantsByNumber.get(attemptNumber)!.id,
					...finding,
				};
			}),
			decisionSections: input.decisionSections.map(section => ({
				id: section.id,
				title: section.title,
				description: section.description,
				affectedFiles: section.affectedFiles,
				options: section.options.map(option => ({
					participantId: attemptParticipantsByNumber.get(option.attemptNumber)!.id,
					approach: option.approach,
					assessment: option.assessment,
				})),
				recommendedParticipantId: attemptParticipantsByNumber.get(section.recommendedAttemptNumber)!.id,
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
	private readonly _toolRegistrations = this._register(new DisposableStore());

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const toolSet = this._toolRegistrations.add(toolsService.createToolSet(
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
		this._toolRegistrations.add(toolsService.registerTool(readToolData, readTool));
		this._toolRegistrations.add(toolSet.addTool(readToolData));
		const tool = instantiationService.createInstance(CompleteSessionComparisonTool);
		const toolData = tool.getToolData();
		this._toolRegistrations.add(toolsService.registerTool(toolData, tool));
		this._toolRegistrations.add(toolSet.addTool(toolData));
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
	const rationale = isRecord(value) ? parseRationale(value.rationale) : undefined;
	if (!isRecord(value)
		|| typeof value.comparisonId !== 'string'
		|| typeof value.recommendedAttemptNumber !== 'number'
		|| !isConciseText(value.explanation, MaxExplanationLength)
		|| !rationale
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
			|| !isValidationEvidence(attempt.validation.tests)
			|| !isValidationEvidence(attempt.validation.build)
			|| !isValidationEvidence(attempt.validation.lint)
			|| !isValidationEvidence(attempt.validation.diagnostics)
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
		const options: { attemptNumber: number; approach: string; assessment: SessionComparisonDecisionAssessment }[] = [];
		for (const option of section.options) {
			if (!isRecord(option)
				|| typeof option.attemptNumber !== 'number'
				|| typeof option.approach !== 'string'
				|| !isDecisionAssessment(option.assessment)) {
				return undefined;
			}
			options.push({ attemptNumber: option.attemptNumber, approach: option.approach, assessment: option.assessment });
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
		rationale,
		conflicts: value.conflicts,
		attempts,
		decisionSections,
	};
}

function parseRationale(value: unknown): ISessionComparisonRationale | undefined {
	if (!isRecord(value)
		|| !isConciseText(value.comparison, MaxRationalePointLength)
		|| !isConciseText(value.validation, MaxRationalePointLength)
		|| !isConciseText(value.codeQuality, MaxRationalePointLength)
		|| !isConciseText(value.solution, MaxRationalePointLength)) {
		return undefined;
	}
	return {
		comparison: value.comparison,
		validation: value.validation,
		codeQuality: value.codeQuality,
		solution: value.solution,
	};
}

function isConciseText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !value.includes('\n');
}

function rationalePointSchema(description: string): IJSONSchema {
	return {
		type: 'string',
		minLength: 1,
		maxLength: MaxRationalePointLength,
		description,
	};
}

function isDecisionAssessment(value: unknown): value is SessionComparisonDecisionAssessment {
	return value === SessionComparisonDecisionAssessment.Better
		|| value === SessionComparisonDecisionAssessment.Neutral
		|| value === SessionComparisonDecisionAssessment.Worse;
}

function getManifestSessionStatus(status: SessionStatus | undefined): 'untitled' | 'inProgress' | 'needsInput' | 'completed' | 'error' | 'unavailable' {
	switch (status) {
		case SessionStatus.Untitled:
			return 'untitled';
		case SessionStatus.InProgress:
			return 'inProgress';
		case SessionStatus.NeedsInput:
			return 'needsInput';
		case SessionStatus.Completed:
			return 'completed';
		case SessionStatus.Error:
			return 'error';
		case undefined:
			return 'unavailable';
	}
}

function validationEvidenceSchema(): IJSONSchema {
	return {
		description: 'A consistent validation state and evidence source pair.',
		oneOf: [
			validationEvidenceVariant(
				[SessionComparisonValidationState.Passed, SessionComparisonValidationState.Failed],
				[SessionComparisonValidationSource.AttemptReport, SessionComparisonValidationSource.JudgeRun],
			),
			validationEvidenceVariant(
				[SessionComparisonValidationState.NotRun, SessionComparisonValidationState.Unknown],
				[SessionComparisonValidationSource.AttemptReport, SessionComparisonValidationSource.JudgeRun, SessionComparisonValidationSource.Unavailable],
			),
			validationEvidenceVariant(
				[SessionComparisonValidationState.NotApplicable],
				[SessionComparisonValidationSource.NotApplicable],
			),
		],
	};
}

function validationEvidenceVariant(states: readonly SessionComparisonValidationState[], sources: readonly SessionComparisonValidationSource[]): IJSONSchema {
	return {
		type: 'object',
		properties: {
			state: { type: 'string', enum: [...states] },
			source: { type: 'string', enum: [...sources] },
		},
		required: ['state', 'source'],
		additionalProperties: false,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isValidationEvidence(value: unknown): value is SessionComparisonValidationEvidence {
	if (!isRecord(value)) {
		return false;
	}
	switch (value.state) {
		case SessionComparisonValidationState.Passed:
		case SessionComparisonValidationState.Failed:
			return value.source === SessionComparisonValidationSource.AttemptReport
				|| value.source === SessionComparisonValidationSource.JudgeRun;
		case SessionComparisonValidationState.NotRun:
		case SessionComparisonValidationState.Unknown:
			return value.source === SessionComparisonValidationSource.AttemptReport
				|| value.source === SessionComparisonValidationSource.JudgeRun
				|| value.source === SessionComparisonValidationSource.Unavailable;
		case SessionComparisonValidationState.NotApplicable:
			return value.source === SessionComparisonValidationSource.NotApplicable;
		default:
			return false;
	}
}

function toManifestVerdict(verdict: ISessionComparisonVerdict, attemptNumbers: ReadonlyMap<string, number>) {
	const recommendedAttemptNumber = attemptNumbers.get(verdict.recommendedParticipantId);
	if (!recommendedAttemptNumber) {
		return undefined;
	}
	return {
		recommendedAttemptNumber,
		explanation: boundedText(verdict.explanation),
		rationale: verdict.rationale,
		conflicts: boundedList(verdict.conflicts),
		attempts: verdict.attempts.slice(0, MaxManifestListItems).flatMap(attempt => {
			const attemptNumber = attemptNumbers.get(attempt.participantId);
			return attemptNumber ? [{
				attemptNumber,
				summary: boundedText(attempt.summary),
				validation: attempt.validation,
				unresolvedIssues: boundedList(attempt.unresolvedIssues),
				notableDifferences: boundedList(attempt.notableDifferences),
			}] : [];
		}),
		decisionSections: (verdict.decisionSections ?? []).slice(0, MaxManifestListItems).flatMap(section => {
			const sectionRecommendedAttemptNumber = attemptNumbers.get(section.recommendedParticipantId);
			if (!sectionRecommendedAttemptNumber) {
				return [];
			}
			return [{
				id: boundedText(section.id),
				title: boundedText(section.title),
				description: boundedText(section.description),
				affectedFiles: boundedList(section.affectedFiles),
				options: section.options.slice(0, MaxManifestListItems).flatMap(option => {
					const attemptNumber = attemptNumbers.get(option.participantId);
					return attemptNumber ? [{
						attemptNumber,
						approach: boundedText(option.approach),
						assessment: option.assessment,
					}] : [];
				}),
				recommendedAttemptNumber: sectionRecommendedAttemptNumber,
			}];
		}),
	};
}

function boundedList(values: readonly string[]): readonly string[] {
	return values.slice(0, MaxManifestListItems).map(boundedText);
}

function boundedText(value: string): string {
	return value.length <= MaxManifestTextLength ? value : value.slice(0, MaxManifestTextLength);
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
