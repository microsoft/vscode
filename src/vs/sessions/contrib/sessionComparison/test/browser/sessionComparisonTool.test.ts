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
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ReadSessionComparisonTool } from '../../browser/sessionComparisonTool.js';

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
			description: 'Read the bounded manifest for an active implementation-attempt comparison. Use this when judging or synthesizing that comparison, before inspecting individual transcripts. It returns the original task, every attempt, changed files, change summaries, worktree locations, and exact targets for get_session_context. It does not return full transcripts or submit a verdict.',
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
				changedFilesTruncated: false,
			}],
			next: 'Inspect code in the listed worktrees. Use get_session_context with an exact attempt sessionContextTarget for validation claims or other transcript evidence. Do not discover sessions, guess references, or create sessions.',
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
				root: URI.file('/workspace'),
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
