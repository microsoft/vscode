/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken, ChatParticipantToolToken, TextDocumentChangeEvent } from 'vscode';
import { NullWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { handleExitPlanMode, type ExitPlanModeEventData, type ExitPlanModeResponse } from '../exitPlanModeHandler';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from '../userInputHelpers';

// ---------- helpers / mocks ----------

function makeEvent(overrides: Partial<ExitPlanModeEventData> = {}): ExitPlanModeEventData {
	return {
		requestId: 'req-1',
		actions: ['autopilot', 'interactive', 'exit_only'],
		recommendedAction: 'autopilot',
		...overrides,
	};
}

class StubSession {
	public writtenPlans: string[] = [];
	constructor(public planPath: string | undefined = '/session/plan.md') { }
	getPlanPath(): string | undefined { return this.planPath; }
	async writePlan(content: string): Promise<void> { this.writtenPlans.push(content); }
}

class FakeUserQuestionHandler implements IUserQuestionHandler {
	_serviceBrand: undefined;
	answer: IQuestionAnswer | undefined = undefined;
	lastQuestion: IQuestion | undefined;

	async askUserQuestion(question: IQuestion, _token: ChatParticipantToolToken, _ct: CancellationToken): Promise<IQuestionAnswer | undefined> {
		this.lastQuestion = question;
		return this.answer;
	}
}

function stubLogService() {
	return {
		_serviceBrand: undefined,
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as any;
}

const FAKE_TOKEN = {} as ChatParticipantToolToken;
const CANCEL_TOKEN: CancellationToken = { isCancellationRequested: false, onCancellationRequested: new Emitter<void>().event };

// ---------- tests ----------

describe('handleExitPlanMode', () => {
	const disposables = new DisposableStore();
	let session: StubSession;
	let logService: ReturnType<typeof stubLogService>;
	let workspaceService: NullWorkspaceService;
	let questionHandler: FakeUserQuestionHandler;

	beforeEach(() => {
		session = new StubSession();
		logService = stubLogService();
		workspaceService = disposables.add(new NullWorkspaceService());
		questionHandler = new FakeUserQuestionHandler();
	});

	afterEach(() => {
		disposables.clear();
	});

	// ---- autopilot ----

	describe('autopilot mode', () => {
		it('auto-approves with recommended action when it is available', async () => {
			const event = makeEvent({ actions: ['autopilot', 'interactive', 'exit_only'], recommendedAction: 'interactive' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'interactive', autoApproveEdits: true });
		});

		it('falls back to first available action in priority order when no recommended', async () => {
			const event = makeEvent({ actions: ['interactive', 'exit_only'], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'interactive', autoApproveEdits: undefined });
		});

		it('prefers autopilot over other actions in fallback order', async () => {
			const event = makeEvent({ actions: ['exit_only', 'autopilot'], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'autopilot', autoApproveEdits: true });
		});

		it('prefers autopilot_fleet second in fallback order', async () => {
			const event = makeEvent({ actions: ['exit_only', 'autopilot_fleet', 'interactive'], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'autopilot_fleet', autoApproveEdits: true });
		});

		it('returns approved with autoApproveEdits when no actions available', async () => {
			const event = makeEvent({ actions: [], recommendedAction: '' });
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, autoApproveEdits: true });
		});

		it('sets autoApproveEdits only for autopilot and autopilot_fleet', async () => {
			const event1 = makeEvent({ actions: ['exit_only'], recommendedAction: '' });
			const r1 = await handleExitPlanMode(event1, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(r1.autoApproveEdits).toBeUndefined();

			const event2 = makeEvent({ actions: ['interactive'], recommendedAction: '' });
			const r2 = await handleExitPlanMode(event2, session as unknown as Session, 'autopilot', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(r2.autoApproveEdits).toBeUndefined();
		});
	});

	// ---- no tool invocation token ----

	describe('missing toolInvocationToken', () => {
		it('returns not approved when no token', async () => {
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', undefined, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false });
		});
	});

	// ---- interactive mode ----

	describe('interactive mode', () => {
		it('returns not approved when user dismisses the question', async () => {
			questionHandler.answer = undefined;
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false });
		});

		it('returns feedback when user provides freeform text', async () => {
			questionHandler.answer = { selected: [], freeText: 'I want changes to the plan', skipped: false };
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: false, feedback: 'I want changes to the plan' });
		});

		it('returns approved with selected action', async () => {
			questionHandler.answer = { selected: ['autopilot'], freeText: null, skipped: false };
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result).toEqual<ExitPlanModeResponse>({ approved: true, selectedAction: 'autopilot', autoApproveEdits: undefined });
		});

		it('maps label back to action type', async () => {
			// User selects the label "Autopilot" which should map back to the action key 'autopilot'
			questionHandler.answer = { selected: ['Autopilot'], freeText: null, skipped: false };
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result.selectedAction).toBe('autopilot');
		});

		it('maps "Approve and exit" label to exit_only', async () => {
			questionHandler.answer = { selected: ['Approve and exit'], freeText: null, skipped: false };
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result.selectedAction).toBe('exit_only');
		});

		it('sets autoApproveEdits when permissionLevel is autoApprove', async () => {
			questionHandler.answer = { selected: ['interactive'], freeText: null, skipped: false };
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'autoApprove', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result.autoApproveEdits).toBe(true);
		});

		it('does not set autoApproveEdits when permissionLevel is interactive', async () => {
			questionHandler.answer = { selected: ['interactive'], freeText: null, skipped: false };
			const event = makeEvent();
			const result = await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(result.autoApproveEdits).toBeUndefined();
		});

		it('builds question options from event actions with recommended flag', async () => {
			questionHandler.answer = { selected: ['Interactive'], freeText: null, skipped: false };
			const event = makeEvent({ actions: ['autopilot', 'exit_only'], recommendedAction: 'exit_only' });
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			const q = questionHandler.lastQuestion!;
			expect(q.options).toHaveLength(2);
			expect(q.options![0]).toEqual(expect.objectContaining({ label: 'Autopilot', recommended: false }));
			expect(q.options![1]).toEqual(expect.objectContaining({ label: 'Approve and exit', recommended: true }));
		});

		it('includes plan.md link in question when plan path exists', async () => {
			session.planPath = '/session/plan.md';
			questionHandler.answer = { selected: ['interactive'], freeText: null, skipped: false };
			const event = makeEvent();
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			const q = questionHandler.lastQuestion!;
			expect(q.question).toContain('Plan.md');
		});

		it('uses plain question when no plan path', async () => {
			session.planPath = undefined;
			questionHandler.answer = { selected: ['interactive'], freeText: null, skipped: false };
			const event = makeEvent();
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			const q = questionHandler.lastQuestion!;
			expect(q.question).not.toContain('Plan.md');
		});

		it('enables freeform input', async () => {
			questionHandler.answer = undefined;
			const event = makeEvent();
			await handleExitPlanMode(event, session as unknown as Session, 'interactive', FAKE_TOKEN, workspaceService, logService, questionHandler, CANCEL_TOKEN);
			expect(questionHandler.lastQuestion!.allowFreeformInput).toBe(true);
		});
	});

	// ---- plan file monitoring ----

	describe('plan file monitoring', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('syncs saved plan changes to SDK session', async () => {
			const planUri = URI.file('/session/plan.md');
			const savedDoc = {
				uri: planUri,
				isDirty: false,
				getText: () => 'updated plan content',
			};

			// Set up a delayed question handler so we can fire document changes while waiting
			let resolveQuestion!: (answer: IQuestionAnswer | undefined) => void;
			questionHandler.askUserQuestion = (_q, _t, _ct) => {
				return new Promise<IQuestionAnswer | undefined>(resolve => { resolveQuestion = resolve; });
			};

			const promise = handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, questionHandler, CANCEL_TOKEN,
			);

			// Simulate a saved document change
			workspaceService.didChangeTextDocumentEmitter.fire({
				document: savedDoc,
				contentChanges: [{ range: {} as any, rangeOffset: 0, rangeLength: 0, text: 'x' }],
			} as unknown as TextDocumentChangeEvent);

			// Allow debouncer to fire
			await vi.advanceTimersByTimeAsync(150);

			expect(session.writtenPlans).toEqual(['updated plan content']);

			// Resolve the question to complete the handler
			resolveQuestion(undefined);
			const result = await promise;
			expect(result.approved).toBe(false);
		});

		it('does not sync when document is still dirty', async () => {
			const planUri = URI.file('/session/plan.md');
			const dirtyDoc = {
				uri: planUri,
				isDirty: true,
				getText: () => 'dirty content',
			};

			let resolveQuestion!: (answer: IQuestionAnswer | undefined) => void;
			questionHandler.askUserQuestion = (_q, _t, _ct) => {
				return new Promise<IQuestionAnswer | undefined>(resolve => { resolveQuestion = resolve; });
			};

			const promise = handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, questionHandler, CANCEL_TOKEN,
			);

			workspaceService.didChangeTextDocumentEmitter.fire({
				document: dirtyDoc,
				contentChanges: [{ range: {} as any, rangeOffset: 0, rangeLength: 0, text: 'x' }],
			} as unknown as TextDocumentChangeEvent);

			await vi.advanceTimersByTimeAsync(150);

			expect(session.writtenPlans).toEqual([]);

			resolveQuestion(undefined);
			await promise;
		});

		it('ignores document changes for unrelated files', async () => {
			const otherUri = URI.file('/other/file.md');
			const otherDoc = {
				uri: otherUri,
				isDirty: false,
				getText: () => 'other content',
			};

			let resolveQuestion!: (answer: IQuestionAnswer | undefined) => void;
			questionHandler.askUserQuestion = (_q, _t, _ct) => {
				return new Promise<IQuestionAnswer | undefined>(resolve => { resolveQuestion = resolve; });
			};

			const promise = handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, questionHandler, CANCEL_TOKEN,
			);

			workspaceService.didChangeTextDocumentEmitter.fire({
				document: otherDoc,
				contentChanges: [{ range: {} as any, rangeOffset: 0, rangeLength: 0, text: 'x' }],
			} as unknown as TextDocumentChangeEvent);

			await vi.advanceTimersByTimeAsync(150);

			expect(session.writtenPlans).toEqual([]);

			resolveQuestion(undefined);
			await promise;
		});

		it('does not create monitor when no plan path', async () => {
			session.planPath = undefined;
			questionHandler.answer = { selected: ['interactive'], freeText: null, skipped: false };

			const result = await handleExitPlanMode(
				makeEvent(), session as unknown as Session, 'interactive', FAKE_TOKEN,
				workspaceService, logService, questionHandler, CANCEL_TOKEN,
			);

			// Should complete without errors even with no plan path
			expect(result.approved).toBe(true);
		});
	});
});
