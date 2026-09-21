/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageModelToolsService, IToolData, IToolResult, ToolProgress, ToolSet } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CompleteSessionComparisonTool, ReadSessionComparisonTool, SessionComparisonToolContribution } from '../../browser/sessionComparisonTool.js';

const progress: ToolProgress = { report: () => { } };
const attemptResource = URI.parse('test:/attempt');
const thirdAttemptResource = URI.parse('test:/attempt-three');
const attemptChatResource = URI.parse('test-chat:/attempt');
const judgeResource = URI.parse('test:/judge');
const synthesisResource = URI.parse('test:/synthesis');

suite('SessionComparisonTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes comparison tools for ongoing comparison workflows', () => {
		const registeredTools = new Set<string>();
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override createToolSet() {
				return upcastPartial<ToolSet & IDisposable>({
					addTool: () => toDisposable(() => { }),
					dispose: () => { },
				});
			}
			override registerTool(toolData: IToolData) {
				registeredTools.add(toolData.id);
				return toDisposable(() => registeredTools.delete(toolData.id));
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionComparisonService, upcastPartial<ISessionComparisonService>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		store.add(new SessionComparisonToolContribution(toolsService, instantiationService));
		const enabledIds = [...registeredTools];

		assert.deepStrictEqual({
			enabledIds,
		}, {
			enabledIds: ['vscode_readAttemptComparison', 'vscode_completeAttemptComparison'],
		});
	});

	test('describes the manifest-first evidence flow', () => {
		const tool = new ReadSessionComparisonTool(
			upcastPartial<ISessionComparisonService>({}),
			upcastPartial<ISessionsManagementService>({}),
		);

		assert.deepStrictEqual({
			referenceName: tool.getToolData().toolReferenceName,
			description: tool.getToolData().modelDescription,
		}, {
			referenceName: 'readAttemptComparison',
			description: 'Read the bounded manifest for an active implementation-attempt comparison. Use this when judging or synthesizing that comparison, before inspecting individual transcripts. It returns the original task, every attempt with a semantic lifecycle status, changed-file evidence status, change summaries, authoritative worktree locations, exact targets for get_session_context, the Judge verdict mapped to attempt numbers when available, and any user-selected synthesis plan. Attempt status is one of untitled, inProgress, needsInput, completed, error, or unavailable; only completed means the attempt finished successfully. Terminal commands start in the Judge or synthesis worktree, so explicitly cd to an attempt\'s listed workingDirectory in every command that inspects or validates it. Read implementation code only from the listed worktrees; transcripts are for rationale or validation evidence. A Judge must review every attempt diff, use get_session_context to identify validation the attempt already completed, never rerun a validation category with a clear reported result, and run only missing targeted validation when needed. If dependencies or build artifacts are unavailable, it must record validation as unavailable without installing dependencies or substituting another validation category. A synthesis agent must resolve the verdict\'s conflicts and consider every decision section while treating selected plan sections as user requirements. It does not return full transcripts or submit a verdict.',
		});
	});

	test('requires semantic decision sections in the completed verdict', () => {
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({}));
		const data = tool.getToolData();
		const schema = JSON.stringify(data.inputSchema);

		assert.deepStrictEqual({
			description: data.modelDescription.includes('semantic decision sections'),
			categorizedRationale: data.modelDescription.includes('exactly one concise rationale point'),
			required: data.inputSchema?.required?.includes('decisionSections'),
			rationaleRequired: data.inputSchema?.required?.includes('rationale'),
			rationaleCategories: schema.includes('"required":["comparison","validation","codeQuality","solution"]'),
			rationaleLength: schema.includes(`"maxLength":180`),
			assessmentRequired: schema.includes('"required":["attemptNumber","approach","assessment"]'),
			assessmentValues: schema.includes('"enum":["better","neutral","worse"]'),
		}, {
			description: true,
			categorizedRationale: true,
			required: true,
			rationaleRequired: true,
			rationaleCategories: true,
			rationaleLength: true,
			assessmentRequired: true,
			assessmentValues: true,
		});
	});

	test('returns bounded evidence and exact session context targets to the Judge', async () => {
		const base = stubComparison();
		const comparison: ISessionComparison = {
			...base,
			participants: base.participants.map(participant => participant.role === SessionComparisonParticipantRole.Attempt ? {
				...participant,
				harness: { ...participant.harness, modelConfiguration: { thinkingLevel: 'high' }, permissionId: 'bypassPermissions', permissionLabel: 'Bypass Permissions' },
			} : participant),
		};
		const session = stubAttemptSession();
		const workingDirectory = URI.file('/workspace').fsPath;
		const tool = new ReadSessionComparisonTool(
			upcastPartial<ISessionComparisonService>({
				getComparison: id => id === comparison.id ? comparison : undefined,
			}),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === attemptResource.toString()
					? session
					: resource.toString() === judgeResource.toString()
						? upcastPartial<ISession>({ providerId: 'provider' })
						: undefined,
				getSessionContextReference: resource => resource.toString() === attemptChatResource.toString()
					? 'agent-host-session://copilot/attempt'
					: undefined,
			}),
		);

		const result = await invoke(tool, { comparisonId: comparison.id }, judgeResource);

		assert.deepStrictEqual(JSON.parse(getText(result)), {
			comparisonId: 'comparison',
			originalTask: 'Implement the feature',
			baseBranch: 'main',
			attempts: [{
				attemptNumber: 1,
				label: 'Attempt 1 (Copilot · Claude · High)',
				harness: { agent: 'Copilot', model: 'Claude', reasoningEffort: 'high', permissions: { id: 'bypassPermissions', label: 'Bypass Permissions' } },
				status: 'completed',
				sessionContextTarget: 'agent-host-session://copilot/attempt',
				worktree: {
					workingDirectory,
					folders: [workingDirectory],
				},
				changesSummary: { files: 1, additions: 3, deletions: 1 },
				changedFiles: [{
					resource: 'file:///workspace/src/example.ts',
					insertions: 3,
					deletions: 1,
				}],
				changedFilesStatus: 'available',
				changedFilesTruncated: false,
			}],
			next: 'Review every completed attempt diff in its authoritative worktree and treat error as failed and inProgress or needsInput as unfinished. Terminal commands start in this Judge or synthesis worktree, not an attempt worktree: explicitly cd to the exact attempt worktree.workingDirectory in every command that inspects or validates it. When changedFilesStatus is unavailable, read the Git diff from that worktree instead. Use get_session_context with an exact attempt sessionContextTarget to identify validation the attempt already completed and for rationale or other non-code evidence; never recover implementation code or paths from a transcript. Do not rerun a validation category with a clear reported result. Run only missing targeted validation when needed. If required dependencies or build artifacts are unavailable, record validation as unavailable without installing or building dependencies or substituting another validation category. Record each validation category as a consistent state and source pair. Submit verdict references using the manifest attemptNumber values; do not copy participant or session UUIDs. During synthesis, resolve every reported conflict, consider every verdict decision section, and treat synthesisPlan instructions and selections as explicit user requirements. Resolve dependencies coherently rather than copying hunks mechanically. Do not modify any attempt, inspect another checkout, discover sessions, guess references, or create sessions.',
		});
	});

	test('returns the user synthesis plan to the synthesis participant', async () => {
		const base = stubComparison();
		const comparison = {
			...base,
			verdict: {
				recommendedParticipantId: 'attempt',
				explanation: 'Use the attempt.',
				conflicts: [],
				attempts: [],
				decisionSections: [decisionSection()],
			},
			synthesisPlan: {
				instructions: 'Preserve the public API and add focused tests.',
				selections: [{ sectionId: 'error-handling', participantId: 'attempt' }],
			},
			participants: [...base.participants, {
				id: 'synthesis',
				role: SessionComparisonParticipantRole.Synthesis,
				harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
				sessionResource: synthesisResource,
			}],
		} satisfies ISessionComparison;
		const tool = new ReadSessionComparisonTool(
			upcastPartial<ISessionComparisonService>({ getComparison: () => comparison }),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === attemptResource.toString()
					? stubAttemptSession()
					: resource.toString() === synthesisResource.toString()
						? upcastPartial<ISession>({ providerId: 'provider' })
						: undefined,
				getSessionContextReference: () => undefined,
			}),
		);

		const result = await invoke(tool, { comparisonId: comparison.id }, synthesisResource);

		assert.deepStrictEqual(JSON.parse(getText(result)).synthesisPlan, {
			instructions: 'Preserve the public API and add focused tests.',
			sections: [{
				sectionId: 'error-handling',
				title: 'Error handling',
				description: 'Choose how parse failures are represented.',
				affectedFiles: ['src/parser.ts'],
				selection: {
					kind: 'attempt',
					attemptNumber: 1,
					approach: 'Return typed diagnostics.',
				},
			}],
		});
	});

	test('returns a bounded verdict with configured attempt numbers to synthesis', async () => {
		const base = stubComparison();
		const firstAttempt = base.participants[0];
		const thirdAttempt = {
			...firstAttempt,
			id: 'attempt-three',
			sessionResource: thirdAttemptResource,
		};
		const comparison: ISessionComparison = {
			...base,
			participants: [
				firstAttempt,
				{
					...firstAttempt,
					id: 'attempt-two',
					sessionResource: undefined,
					launchError: 'provider unavailable',
				},
				thirdAttempt,
				{
					id: 'synthesis',
					role: SessionComparisonParticipantRole.Synthesis,
					harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
					sessionResource: synthesisResource,
				},
			],
			verdict: {
				recommendedParticipantId: thirdAttempt.id,
				explanation: 'Attempt three is strongest.',
				rationale: rationaleInput(),
				conflicts: ['x'.repeat(1001)],
				attempts: [firstAttempt, thirdAttempt].map(participant => ({
					participantId: participant.id,
					summary: `${participant.id} summary`,
					validation: {
						tests: passedEvidence(),
						build: passedEvidence(),
						lint: passedEvidence(),
						diagnostics: passedEvidence(),
					},
					unresolvedIssues: [`${participant.id} issue`],
					notableDifferences: [`${participant.id} difference`],
				})),
				decisionSections: [{
					id: 'implementation',
					title: 'Implementation',
					description: 'Choose the implementation.',
					affectedFiles: ['src/example.ts'],
					options: [firstAttempt, thirdAttempt].map(participant => ({
						participantId: participant.id,
						approach: `Use ${participant.id}`,
						assessment: participant.id === thirdAttempt.id ? SessionComparisonDecisionAssessment.Better : SessionComparisonDecisionAssessment.Worse,
					})),
					recommendedParticipantId: thirdAttempt.id,
				}],
			},
		};
		const tool = new ReadSessionComparisonTool(
			upcastPartial<ISessionComparisonService>({ getComparison: () => comparison }),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === synthesisResource.toString()
					? upcastPartial<ISession>({ providerId: 'provider' })
					: stubAttemptSession(),
				getSessionContextReference: () => undefined,
			}),
		);

		const result = JSON.parse(getText(await invoke(tool, { comparisonId: comparison.id }, synthesisResource)));

		assert.deepStrictEqual({
			attemptNumbers: result.attempts.map((attempt: { attemptNumber: number }) => attempt.attemptNumber),
			recommendedAttemptNumber: result.verdict.recommendedAttemptNumber,
			conflictLength: result.verdict.conflicts[0].length,
			verdictAttemptNumbers: result.verdict.attempts.map((attempt: { attemptNumber: number }) => attempt.attemptNumber),
			decisionOptionNumbers: result.verdict.decisionSections[0].options.map((option: { attemptNumber: number }) => option.attemptNumber),
			decisionRecommendation: result.verdict.decisionSections[0].recommendedAttemptNumber,
		}, {
			attemptNumbers: [1, 3],
			recommendedAttemptNumber: 3,
			conflictLength: 1000,
			verdictAttemptNumbers: [1, 3],
			decisionOptionNumbers: [1, 3],
			decisionRecommendation: 3,
		});
	});

	test('accepts validation categories that do not apply', async () => {
		const comparison = stubComparison();
		let submitted: ISessionComparisonVerdict | undefined;
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({
			getComparison: () => comparison,
			submitVerdict: (_comparisonId, verdict) => submitted = verdict,
		}));

		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'No implementation changes were needed.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Completed the requested inspection without changing code.',
				validation: {
					tests: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
			decisionSections: [],
		}, judgeResource);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			recommendedParticipantId: submitted?.recommendedParticipantId,
			attemptParticipantId: submitted?.attempts[0].participantId,
			validation: submitted?.attempts[0].validation,
		}, {
			result: { status: 'submitted', comparisonId: 'comparison' },
			recommendedParticipantId: 'attempt',
			attemptParticipantId: 'attempt',
			validation: {
				tests: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
			},
		});
	});

	test('rejects inconsistent validation evidence', async () => {
		const comparison = stubComparison();
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({
			getComparison: () => comparison,
		}));

		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'No implementation changes were needed.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Completed the requested inspection without changing code.',
				validation: {
					tests: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.Unavailable),
					build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
			decisionSections: [],
		}, judgeResource);

		assert.strictEqual(getText(result), 'The comparison verdict input is invalid. Keep explanation to one sentence, provide concise comparison, validation, codeQuality, and solution rationale points, and use a consistent state and source pair for every validation category.');
	});

	test('records automatic review evidence provenance in the verdict', async () => {
		const comparison = stubComparison();
		let submitted: ISessionComparisonVerdict | undefined;
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({
			getComparison: () => comparison,
			submitVerdict: (_comparisonId, verdict) => submitted = verdict,
		}));
		const result = await tool.invoke({
			callId: 'call',
			toolId: 'tool',
			parameters: {
				comparisonId: comparison.id,
				recommendedAttemptNumber: 1,
				explanation: 'The implementation is correct and focused.',
				rationale: rationaleInput(),
				conflicts: [],
				attempts: [{
					attemptNumber: 1,
					summary: 'Focused implementation with passing tests.',
					validation: {
						tests: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
						build: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.AttemptReport),
						lint: evidence(SessionComparisonValidationState.Unknown, SessionComparisonValidationSource.Unavailable),
						diagnostics: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
					},
					unresolvedIssues: [],
					notableDifferences: ['Smallest diff'],
				}],
				decisionSections: [decisionSectionInput()],
			},
			context: { sessionResource: judgeResource },
		}, async () => 0, progress, CancellationToken.None);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			rationale: submitted?.rationale,
			validation: submitted?.attempts[0].validation,
			decisionSections: submitted?.decisionSections,
		}, {
			result: { status: 'submitted', comparisonId: 'comparison' },
			rationale: rationaleInput(),
			validation: {
				tests: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
				build: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.AttemptReport),
				lint: evidence(SessionComparisonValidationState.Unknown, SessionComparisonValidationSource.Unavailable),
				diagnostics: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
			},
			decisionSections: [decisionSection()],
		});
	});

	test('rejects unrelated sessions', async () => {
		const comparison = stubComparison();
		const tool = new ReadSessionComparisonTool(
			upcastPartial<ISessionComparisonService>({ getComparison: () => comparison }),
			upcastPartial<ISessionsManagementService>({}),
		);

		const result = await invoke(tool, { comparisonId: comparison.id }, URI.parse('test:/unrelated'));

		assert.strictEqual(getText(result), 'Only the Judge or synthesis session for this comparison can read its manifest.');
	});

	test('rejects decision sections that reference an unknown attempt number', async () => {
		const comparison = stubComparison();
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({
			getComparison: () => comparison,
		}));
		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'Attempt is strongest.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Summary',
				validation: {
					tests: passedEvidence(),
					build: passedEvidence(),
					lint: passedEvidence(),
					diagnostics: passedEvidence(),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
			decisionSections: [{
				...decisionSectionInput(),
				options: [{ attemptNumber: 2, approach: 'Unknown', assessment: SessionComparisonDecisionAssessment.Better }],
				recommendedAttemptNumber: 2,
			}],
		}, judgeResource);

		assert.strictEqual(getText(result), 'Every synthesis decision section must have a unique ID, reference known attemptNumber values, and rate its recommended option as better.');
	});

	test('rejects a recommended decision option that is not rated better', async () => {
		const comparison = stubComparison();
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({
			getComparison: () => comparison,
		}));
		const section = decisionSectionInput();

		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'Attempt is strongest.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Focused implementation.',
				validation: {
					tests: passedEvidence(),
					build: passedEvidence(),
					lint: passedEvidence(),
					diagnostics: passedEvidence(),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
			decisionSections: [{
				...section,
				options: section.options.map(option => ({ ...option, assessment: SessionComparisonDecisionAssessment.Neutral })),
			}],
		}, judgeResource);

		assert.strictEqual(getText(result), 'Every synthesis decision section must have a unique ID, reference known attemptNumber values, and rate its recommended option as better.');
	});

	test('rejects verbose categorized rationale', async () => {
		const comparison = stubComparison();
		const tool = new CompleteSessionComparisonTool(upcastPartial<ISessionComparisonService>({
			getComparison: () => comparison,
		}));

		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'Attempt is strongest.',
			rationale: {
				...rationaleInput(),
				solution: 'x'.repeat(181),
			},
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Focused implementation.',
				validation: {
					tests: passedEvidence(),
					build: passedEvidence(),
					lint: passedEvidence(),
					diagnostics: passedEvidence(),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
			decisionSections: [],
		}, judgeResource);

		assert.strictEqual(getText(result), 'The comparison verdict input is invalid. Keep explanation to one sentence, provide concise comparison, validation, codeQuality, and solution rationale points, and use a consistent state and source pair for every validation category.');
	});
});

function passedEvidence() {
	return {
		state: SessionComparisonValidationState.Passed,
		source: SessionComparisonValidationSource.JudgeRun,
	} as const;
}

function evidence(state: SessionComparisonValidationState, source: SessionComparisonValidationSource) {
	return { state, source };
}

function rationaleInput() {
	return {
		comparison: 'The other attempts were incomplete or left the reported failure unresolved.',
		validation: 'Focused tests and diagnostics pass in the attempt worktree.',
		codeQuality: 'Matches the surrounding types and existing implementation pattern.',
		solution: 'Implements the requested behavior with the smallest correct change.',
	};
}

function decisionSectionInput() {
	return {
		id: 'error-handling',
		title: 'Error handling',
		description: 'Choose how parse failures are represented.',
		affectedFiles: ['src/parser.ts'],
		options: [{ attemptNumber: 1, approach: 'Return typed diagnostics.', assessment: SessionComparisonDecisionAssessment.Better }],
		recommendedAttemptNumber: 1,
	};
}

function decisionSection() {
	return {
		id: 'error-handling',
		title: 'Error handling',
		description: 'Choose how parse failures are represented.',
		affectedFiles: ['src/parser.ts'],
		options: [{ participantId: 'attempt', approach: 'Return typed diagnostics.', assessment: SessionComparisonDecisionAssessment.Better }],
		recommendedParticipantId: 'attempt',
	};
}

function stubComparison(): ISessionComparison {
	return {
		id: 'comparison',
		groupId: 'group',
		title: 'Comparison',
		createdAt: 1,
		workspace: URI.file('/workspace'),
		prompt: 'Implement the feature',
		branch: 'main',
		judgeHarness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
		participants: [{
			id: 'attempt',
			role: SessionComparisonParticipantRole.Attempt,
			harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot', modelLabel: 'Claude' },
			sessionResource: attemptResource,
		}, {
			id: 'judge',
			role: SessionComparisonParticipantRole.Judge,
			harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
			sessionResource: judgeResource,
		}],
	};
}

function stubAttemptSession(): ISession {
	const chat = upcastPartial<IChat>({
		resource: attemptChatResource,
	});
	return upcastPartial<ISession>({
		resource: attemptResource,
		providerId: 'provider',
		status: constObservable(SessionStatus.Completed),
		mainChat: constObservable(chat),
		workspace: constObservable(upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/source-workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
			}],
		})),
		changesSummary: constObservable({ files: 1, additions: 3, deletions: 1 }),
		changes: constObservable([{
			uri: URI.file('/workspace/src/example.ts'),
			insertions: 3,
			deletions: 1,
		}]),
	});
}

async function invoke(tool: ReadSessionComparisonTool | CompleteSessionComparisonTool, parameters: Record<string, unknown>, sessionResource: URI): Promise<IToolResult> {
	return tool.invoke({
		callId: 'call',
		toolId: 'tool',
		parameters,
		context: { sessionResource },
	}, async () => 0, progress, CancellationToken.None);
}

function getText(result: IToolResult): string {
	const part = result.content[0];
	if (!part || part.kind !== 'text') {
		assert.fail('Expected a text tool result.');
	}
	return part.value;
}
