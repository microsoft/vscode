/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IToolResult, ToolProgress } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CompleteSessionComparisonTool, ReadSessionComparisonTool } from '../../browser/sessionComparisonTool.js';

const progress: ToolProgress = { report: () => { } };
const attemptResource = URI.parse('test:/attempt');
const attemptChatResource = URI.parse('test-chat:/attempt');
const judgeResource = URI.parse('test:/judge');

suite('SessionComparisonTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
			description: 'Read the bounded manifest for an active implementation-attempt comparison. Use this when judging or synthesizing that comparison, before inspecting individual transcripts. It returns the original task, every attempt, changed-file evidence status, change summaries, authoritative worktree locations, and exact targets for get_session_context. Read implementation code only from the listed worktrees; transcripts are for rationale or validation evidence. A Judge must review every attempt diff and run missing targeted validation when needed. It does not return full transcripts or submit a verdict.',
		});
	});

	test('returns bounded evidence and exact session context targets to the Judge', async () => {
		const comparison = stubComparison();
		const session = stubAttemptSession();
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
				participantId: 'attempt',
				label: 'Attempt 1: Copilot · Claude',
				harness: { agent: 'Copilot', model: 'Claude' },
				status: SessionStatus.Completed,
				sessionContextTarget: 'agent-host-session://copilot/attempt',
				worktree: {
					workingDirectory: '/workspace',
					folders: ['/workspace'],
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
			next: 'Review every attempt diff in its authoritative worktree. When changedFilesStatus is unavailable, read the Git diff from that worktree instead. Use get_session_context with an exact attempt sessionContextTarget only for rationale, validation claims, or other non-code evidence; never recover implementation code or paths from a transcript. Run missing targeted validation when needed, record whether each result came from the attempt report or the Judge run, and do not modify any attempt. Do not inspect another checkout, discover sessions, guess references, or create sessions.',
		});
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
				recommendedParticipantId: 'attempt',
				explanation: 'The implementation is correct and focused.',
				conflicts: [],
				attempts: [{
					participantId: 'attempt',
					summary: 'Focused implementation with passing tests.',
					validation: {
						tests: SessionComparisonValidationState.Passed,
						build: SessionComparisonValidationState.Passed,
						lint: SessionComparisonValidationState.Unknown,
						diagnostics: SessionComparisonValidationState.Passed,
					},
					validationSource: {
						tests: SessionComparisonValidationSource.JudgeRun,
						build: SessionComparisonValidationSource.AttemptReport,
						lint: SessionComparisonValidationSource.Unavailable,
						diagnostics: SessionComparisonValidationSource.JudgeRun,
					},
					unresolvedIssues: [],
					notableDifferences: ['Smallest diff'],
				}],
			},
			context: { sessionResource: judgeResource },
		}, async () => 0, progress, CancellationToken.None);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			validationSource: submitted?.attempts[0].validationSource,
		}, {
			result: { status: 'submitted', comparisonId: 'comparison' },
			validationSource: {
				tests: SessionComparisonValidationSource.JudgeRun,
				build: SessionComparisonValidationSource.AttemptReport,
				lint: SessionComparisonValidationSource.Unavailable,
				diagnostics: SessionComparisonValidationSource.JudgeRun,
			},
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
});

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
			usage: {
				inputTokens: 30,
				cachedTokens: 12,
				outputTokens: 8,
				models: [{ model: 'Claude', inputTokens: 30, cachedTokens: 12, outputTokens: 8 }],
				isComplete: true,
			},
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

async function invoke(tool: ReadSessionComparisonTool, parameters: Record<string, unknown>, sessionResource: URI): Promise<IToolResult> {
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
