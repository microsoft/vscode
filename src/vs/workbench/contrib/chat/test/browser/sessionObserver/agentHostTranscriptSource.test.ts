/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ConfirmationOptionKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, MessageAttachmentKind, MessageKind, ResponsePartKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type ActiveTurn, type ChatState, type Message, type ResponsePart, type SessionState, type ToolCallState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { agentHostContentKey, AgentHostTranscriptProjector, AgentHostTranscriptSource, computeUnifiedDiff, IAgentHostChatSnapshot, IAgentHostContentRequest } from '../../../browser/sessionObserver/agentHostTranscriptSource.js';
import { IChatSessionEventInput, IChatSessionObservedInfo } from '../../../common/sessionObserver/chatSessionObserver.js';

suite('AgentHostTranscriptSource', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const T0 = Date.UTC(2026, 10, 8, 18, 0, 0);
	const NOW = T0 + 999_000;
	const iso = (s: number) => new Date(T0 + s * 1000).toISOString();
	const msg = (text: string, kind = MessageKind.User, extra: Partial<Message> = {}): Message => ({ text, origin: { kind }, ...extra });
	const turn = (id: string, s: number, message: Message, responseParts: ResponsePart[], state = TurnState.Complete): Turn => ({ id, startedAt: iso(s), duration: 5_000, message, responseParts, usage: undefined, state });
	const active = (id: string, s: number, message: Message, responseParts: ResponsePart[]): ActiveTurn => ({ id, startedAt: iso(s), message, responseParts, usage: undefined });
	const md = (id: string, content: string): ResponsePart => ({ kind: ResponsePartKind.Markdown, id, content });
	const tool = (toolCall: ToolCallState): ResponsePart => ({ kind: ResponsePartKind.ToolCall, toolCall });
	const snapshot = (turns: Turn[], activeTurn?: ActiveTurn): IAgentHostChatSnapshot => ({ turns, activeTurn, modifiedAt: iso(0) });

	function createProjector(content: Record<string, string> = {}, reasoning: 'full' | 'summary' = 'full') {
		const stored: string[] = [];
		const projector = new AgentHostTranscriptProjector({
			storeContent: text => {
				stored.push(text);
				return { id: `c${stored.length}`, size: text.length };
			},
			readContent: (request: IAgentHostContentRequest) => content[agentHostContentKey(request)],
			now: () => NOW,
			reasoning,
		});
		return { projector, stored };
	}

	function only<K extends IChatSessionEventInput['kind']>(events: readonly IChatSessionEventInput[], kind: K): Extract<IChatSessionEventInput, { kind: K }>[] {
		return events.filter((e): e is Extract<IChatSessionEventInput, { kind: K }> => e.kind === kind);
	}

	test('maps each turn: who sent it, its text and reasoning, and how it ended', () => {
		const { projector } = createProjector({}, 'summary');
		const events = projector.project(snapshot([
			turn('t1', 0, msg('Fix the retries', MessageKind.User, {
				model: { id: 'claude-opus' },
				attachments: [{ type: MessageAttachmentKind.Resource, uri: 'file:///w/retry.ts', label: 'retry.ts', selection: { range: { start: { line: 4, character: 0 }, end: { line: 9, character: 0 } } } }],
			}), [
				{ kind: ResponsePartKind.Reasoning, id: 'r1', content: 'Look at the loop first.', startedAt: iso(1), duration: 1_200 },
				md('m1', 'Looking.'),
				tool({ status: ToolCallStatus.Completed, toolCallId: 'c1', toolName: 'Read', displayName: 'Read file', invocationMessage: 'Reading', toolInput: '{"path":"/w/retry.ts"}', confirmed: ToolCallConfirmationReason.NotNeeded, success: true, pastTenseMessage: 'Read', content: [{ type: ToolResultContentType.Text, text: 'let tries = 0;' }] }),
				md('m2', 'Fixed.'),
			]),
			turn('t2', 10, msg('nightly run', MessageKind.Automation, { model: { id: 'gpt-5' } }), [
				md('m3', 'Starting.'),
				{ kind: ResponsePartKind.Error, error: { errorType: 'rate_limit', message: 'Too many requests' }, resumable: true },
			], TurnState.Error),
			turn('t3', 20, msg('<subagent finished>', MessageKind.SystemNotification), [], TurnState.Cancelled),
			turn('t4', 30, msg('seed prompt', MessageKind.Tool), []),
			turn('t5', 40, msg('handing over', MessageKind.Agent), []),
		]));

		assert.deepStrictEqual(only(events, 'userMessage').map(e => e.origin), ['user', 'autopilot', 'notification', 'extension', 'agent']);
		assert.deepStrictEqual(only(events, 'turnStarted').map(e => e.trigger), ['user', 'autopilot', 'system', 'system', 'system']);
		assert.deepStrictEqual(only(events, 'turnEnded').map(e => e.outcome), ['completed', 'failed', 'cancelled', 'completed', 'completed']);
		assert.deepStrictEqual(events.filter(e => e.turnId === 't1').map(e => e.kind), ['turnStarted', 'userMessage', 'reasoning', 'agentText', 'toolCall', 'toolOutput', 'toolResult', 'agentText', 'turnEnded']);

		const user = only(events, 'userMessage')[0];
		assert.deepStrictEqual({ model: user.model, attachments: user.attachments }, { model: 'claude-opus', attachments: [{ kind: 'selection', label: 'retry.ts', uri: URI.parse('file:///w/retry.ts'), range: { startLineNumber: 5, endLineNumber: 10 } }] });
		assert.deepStrictEqual(only(events, 'reasoning')[0], { id: 'rs:t1:r1', at: T0 + 1_000, turnId: 't1', rawType: 'reasoning', kind: 'reasoning', text: 'Look at the loop first.', availability: 'summary', durationMs: 1_200 });
		assert.deepStrictEqual(only(events, 'agentText').filter(e => e.turnId === 't1').map(e => [e.id, e.text, e.final]), [['md:t1:m1', 'Looking.', false], ['md:t1:m2', 'Fixed.', true]]);
		assert.deepStrictEqual(only(events, 'toolCall')[0].input, { path: '/w/retry.ts' });
		assert.deepStrictEqual(only(events, 'modelChanged').map(e => [e.turnId, e.model]), [['t2', 'gpt-5']]);
		assert.deepStrictEqual(only(events, 'error').map(e => [e.message, e.code, e.resumable]), [['Too many requests', 'rate_limit', true]]);
		// History is stamped per turn: a turn starts at its start and ends after its duration.
		assert.strictEqual(only(events, 'turnStarted')[0].at, T0);
		assert.strictEqual(only(events, 'turnEnded')[0].at, T0 + 5_000);
		assert.strictEqual(projector.status, 'waiting');
		assert.deepStrictEqual(projector.info, { lastActivityAt: T0 + 45_000, lastRequestStartedAt: T0 + 40_000, lastRequestEndedAt: T0 + 45_000 });

		// Ids are unique, and projecting the same turns again adds nothing.
		assert.strictEqual(new Set(events.map(e => e.id)).size, events.length);
		assert.deepStrictEqual(projector.project(snapshot([])), []);
	});

	test('a resumed turn (failed, then run again under its id) logs its new work and ends again', () => {
		const { projector } = createProjector();
		const failed: ResponsePart[] = [md('m1', 'Screening names.'), { kind: ResponsePartKind.Error, error: { errorType: 'network', message: 'Connection lost' }, resumable: true }];
		const first = projector.project(snapshot([turn('t1', 0, msg('Screen these names'), failed, TurnState.Error)]));
		assert.deepStrictEqual(only(first, 'turnEnded').map(e => [e.id, e.outcome]), [['end:t1', 'failed']]);

		// ChatTurnResume moves the turn back to the active turn, with the parts it had.
		const resumed = projector.project(snapshot([], active('t1', 0, msg('Screen these names'), [...failed, md('m2', 'Picking up where I left off.'), md('m3', 'Writing the report.')])));
		assert.deepStrictEqual(resumed.map(e => [e.kind, e.id]), [['turnStarted', 'start:t1:resume1'], ['agentText', 'md:t1:m2']]);

		const done = projector.project(snapshot([turn('t1', 0, msg('Screen these names'), [...failed, md('m2', 'Picking up where I left off.'), md('m3', 'Writing the report.')])]));
		assert.deepStrictEqual(done.map(e => [e.kind, e.id]), [['agentText', 'md:t1:m3'], ['turnEnded', 'end:t1:resume1']]);
		assert.strictEqual(only(done, 'turnEnded')[0].outcome, 'completed');
		assert.deepStrictEqual(projector.project(snapshot([turn('t1', 0, msg('Screen these names'), [...failed, md('m2', 'Picking up where I left off.'), md('m3', 'Writing the report.')])])), []);
	});

	test('tool calls: input, output (large output stored out of line), denials, and the result', () => {
		const { projector, stored } = createProjector();
		const big = 'x'.repeat(20_000);
		const events = projector.project(snapshot([turn('t1', 0, msg('go'), [
			tool({
				status: ToolCallStatus.Completed, toolCallId: 'sh', toolName: 'Bash', displayName: 'Run command', invocationMessage: 'Running', toolInput: '{"command":"make"}', confirmed: ToolCallConfirmationReason.Setting, success: false, pastTenseMessage: 'Ran',
				error: { message: 'exit 2' }, content: [{ type: ToolResultContentType.Terminal, resource: 'ahp-terminal:/t1', title: 'make', isPty: true, result: { exitCode: 2, preview: '\x1b[31mboom\x1b[0m', truncated: true } }],
				_meta: { 'vscode.toolCallDurationMs': 750 },
			}),
			tool({ status: ToolCallStatus.Completed, toolCallId: 'rd', toolName: 'Read', displayName: 'Read', invocationMessage: 'Reading', toolInput: '{}', confirmed: ToolCallConfirmationReason.NotNeeded, success: true, pastTenseMessage: 'Read', content: [{ type: ToolResultContentType.Text, text: big }] }),
			tool({ status: ToolCallStatus.Cancelled, toolCallId: 'rm', toolName: 'Bash', displayName: 'Run command', invocationMessage: 'rm -rf /', toolInput: '{"command":"rm -rf /"}', reason: ToolCallCancellationReason.Denied, reasonMessage: 'Not that', selectedOption: { id: 'deny', label: 'Deny', kind: ConfirmationOptionKind.Deny } }),
		])]));

		const outputs = only(events, 'toolOutput');
		assert.deepStrictEqual(outputs[0], { id: 'out:sh', at: T0, turnId: 't1', rawType: 'toolCall/completed', kind: 'toolOutput', callId: 'sh', stream: 'stdout', text: 'boom', totalChars: 4, truncated: true });
		assert.deepStrictEqual({ ...outputs[1], text: outputs[1].text?.length }, { id: 'out:rd', at: T0, turnId: 't1', rawType: 'toolCall/completed', kind: 'toolOutput', callId: 'rd', stream: 'content', text: 2_000, ref: { id: 'c1', size: 20_000 }, totalChars: 20_000, truncated: true });
		assert.deepStrictEqual(stored, [big]);
		assert.deepStrictEqual(only(events, 'toolResult').map(e => [e.callId, e.status, e.exitCode, e.error, e.durationMs]), [['sh', 'failed', 2, 'exit 2', 750], ['rd', 'completed', undefined, undefined, undefined], ['rm', 'denied', undefined, 'Not that', undefined]]);
		assert.deepStrictEqual(events.filter(e => e.id.endsWith(':rm') || e.id === 'call:rm').map(e => e.kind), ['toolCall', 'permission', 'permissionDecision', 'toolResult']);
		assert.deepStrictEqual(only(events, 'permissionDecision').map(e => [e.permissionId, e.decision, e.option]), [['rm', 'denied', 'Deny']]);
	});

	test('a tool call carries the message the transcript shows for it, links and all', () => {
		const { projector } = createProjector();
		const events = projector.project(snapshot([turn('t1', 0, msg('go'), [
			tool({ status: ToolCallStatus.Completed, toolCallId: 'f', toolName: 'web_fetch', displayName: 'Fetch Web Content', invocationMessage: { markdown: 'Fetching [https://relayhq.dev/](https://relayhq.dev/)' }, toolInput: '{"url":"https://relayhq.dev/"}', confirmed: ToolCallConfirmationReason.NotNeeded, success: true, pastTenseMessage: 'Fetched' }),
			tool({ status: ToolCallStatus.Completed, toolCallId: 'p', toolName: 'Bash', displayName: 'Run command', invocationMessage: 'Run [x](y) *now*', toolInput: '{"command":"x"}', confirmed: ToolCallConfirmationReason.NotNeeded, success: true, pastTenseMessage: 'Ran' }),
		])]));
		assert.deepStrictEqual(only(events, 'toolCall').map(e => e.message), ['Fetching [https://relayhq.dev/](https://relayhq.dev/)', 'Run \\[x\\]\\(y\\) \\*now\\*']);
	});

	test('a turn its host keeps open for a background shell ends for the user once the agent falls quiet after its last words', () => {
		let clock = NOW;
		const projector = new AgentHostTranscriptProjector({ storeContent: text => ({ id: 'c', size: text.length }), now: () => clock });
		const message = msg('Fix the contact form');
		const shell = tool({ toolCallId: 'c1', toolName: 'bash', displayName: 'Run command', invocationMessage: 'find / -name "*.log"', toolInput: '{"command":"find /","mode":"async"}', status: ToolCallStatus.Completed, success: true, pastTenseMessage: 'Started', content: [{ type: ToolResultContentType.Text, text: 'started in background' }] } as ToolCallState);
		const parts = [md('m1', 'Searching the logs.'), shell, md('m2', 'The form is fixed. The log search keeps running in the background.')];
		const background = [{ kind: 'shell', id: 'shell:1', label: 'Search logs', startedAt: iso(1), command: 'find /' }] as IAgentHostChatSnapshot['backgroundWork'];
		const open = (p: ResponsePart[], work = background): IAgentHostChatSnapshot => ({ ...snapshot([], active('a1', 0, message, p)), backgroundWork: work });

		assert.deepStrictEqual(only(projector.project(open(parts)), 'turnEnded'), []);
		assert.strictEqual(projector.status, 'working');
		assert.strictEqual(projector.quietCheckInMs, 3_000);

		clock += 3_000;
		const ended = projector.project(open(parts));
		assert.deepStrictEqual(ended.map(e => [e.kind, e.id]), [['agentText', 'md:a1:m2'], ['turnEnded', 'end:a1:quiet1']]);
		assert.deepStrictEqual(only(ended, 'agentText').map(e => e.final), [true]);
		assert.strictEqual(only(ended, 'turnEnded')[0].outcome, 'needsInput');
		assert.strictEqual(projector.status, 'waiting');
		assert.deepStrictEqual(projector.project(open(parts)), []);

		// The agent works again in the same turn: it reopens, and its new work follows.
		const more = [...parts, tool({ toolCallId: 'c2', toolName: 'read_bash', displayName: 'Read shell', invocationMessage: 'read', toolInput: '{}', status: ToolCallStatus.Running } as ToolCallState)];
		assert.deepStrictEqual(projector.project(open(more)).map(e => [e.kind, e.id]), [['turnStarted', 'start:a1:quiet1'], ['toolCall', 'call:c2']]);
		assert.strictEqual(projector.status, 'working');

		// Quiet again, then the host closes the turn with nothing new: no second end.
		const done = [...parts, { ...more[3], toolCall: { ...(more[3] as { toolCall: ToolCallState }).toolCall, status: ToolCallStatus.Completed, success: true, pastTenseMessage: 'Read', content: [] } } as ResponsePart, md('m3', 'The search found 3 logs.')];
		projector.project(open(done));
		clock += 3_000;
		assert.deepStrictEqual(only(projector.project(open(done)), 'turnEnded').map(e => e.id), ['end:a1:quiet2']);
		assert.deepStrictEqual(only(projector.project(snapshot([turn('a1', 0, message, done)])), 'turnEnded'), []);
		assert.strictEqual(projector.status, 'waiting');
	});

	test('without listed background work, a quiet turn waits longer before it counts as handed back', () => {
		let clock = NOW;
		const projector = new AgentHostTranscriptProjector({ storeContent: text => ({ id: 'c', size: text.length }), now: () => clock });
		const state = snapshot([], active('a1', 0, msg('Ship it'), [md('m1', 'Done. Anything else?')]));
		projector.project(state);
		clock += 3_000;
		assert.deepStrictEqual(only(projector.project(state), 'turnEnded'), []);
		clock += 12_000;
		assert.deepStrictEqual(only(projector.project(state), 'turnEnded').map(e => e.id), ['end:a1:quiet1']);
	});

	test('live: streaming text waits until it closes, a pending confirmation is a question, then its decision and result follow', () => {
		const { projector } = createProjector();
		const message = msg('Run the tests');
		const call = { toolCallId: 'c1', toolName: 'Bash', displayName: 'Run command', invocationMessage: 'npm test', toolInput: '{"command":"npm test"}' };
		const all: IChatSessionEventInput[] = [];
		const step = (state: IAgentHostChatSnapshot) => {
			const events = projector.project(state);
			all.push(...events);
			return events.map(e => e.kind);
		};

		assert.deepStrictEqual(step(snapshot([], active('a1', 0, message, [md('m1', 'Let me')]))), ['turnStarted', 'userMessage']);
		assert.strictEqual(projector.status, 'working');

		assert.deepStrictEqual(step(snapshot([], active('a1', 0, message, [
			md('m1', 'Let me run them.'),
			tool({ ...call, status: ToolCallStatus.PendingConfirmation, confirmationTitle: 'Run in terminal', options: [{ id: 'once', label: 'Allow once', kind: ConfirmationOptionKind.Approve }, { id: 'no', label: 'Deny', kind: ConfirmationOptionKind.Deny }] }),
		]))), ['agentText', 'toolCall', 'permission']);
		assert.strictEqual(projector.status, 'question');
		assert.deepStrictEqual(only(all, 'permission')[0], { id: 'perm:c1', at: NOW, turnId: 'a1', rawType: 'toolCall/pending-confirmation', kind: 'permission', permissionId: 'c1', callId: 'c1', title: 'Run in terminal', detail: 'npm test', options: ['Allow once', 'Deny'] });

		const running = tool({ ...call, status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.UserAction, selectedOption: { id: 'once', label: 'Allow once', kind: ConfirmationOptionKind.Approve } });
		assert.deepStrictEqual(step(snapshot([], active('a1', 0, message, [md('m1', 'Let me run them.'), running]))), ['permissionDecision']);
		assert.strictEqual(projector.status, 'working');

		const completed = tool({ ...call, status: ToolCallStatus.Completed, confirmed: ToolCallConfirmationReason.UserAction, success: true, pastTenseMessage: 'Ran', content: [{ type: ToolResultContentType.Text, text: '12 passing' }] });
		const parts = [md('m1', 'Let me run them.'), completed, md('m2', 'All 12')];
		assert.deepStrictEqual(step(snapshot([], active('a1', 0, message, parts))), ['toolOutput', 'toolResult']);

		parts[2] = md('m2', 'All 12 pass.');
		assert.deepStrictEqual(step(snapshot([turn('a1', 0, message, parts)])), ['agentText', 'turnEnded']);
		assert.strictEqual(projector.status, 'waiting');
		assert.deepStrictEqual(only(all, 'agentText').map(e => [e.text, e.final]), [['Let me run them.', false], ['All 12 pass.', true]]);
		assert.deepStrictEqual(only(all, 'permissionDecision').map(e => [e.decision, e.option]), [['allowed', 'Allow once']]);

		assert.deepStrictEqual(projector.project(snapshot([turn('a1', 0, message, parts)])), []);
		assert.strictEqual(new Set(all.map(e => e.id)).size, all.length);
	});

	test('input requests become questions and answers; plan reviews become plan review events', () => {
		const { projector } = createProjector();
		const request = {
			id: 'q1', questions: [
				{ id: 'runner', kind: ChatInputQuestionKind.SingleSelect as const, message: 'Which runner?', options: [{ id: 'v', label: 'vitest' }, { id: 'm', label: 'mocha' }] },
				{ id: 'why', kind: ChatInputQuestionKind.Text as const, message: 'Why?' },
				{ id: 'ci', kind: ChatInputQuestionKind.Boolean as const, message: 'Run in CI?' },
			],
		};
		const pending = projector.project(snapshot([], active('a1', 0, msg('add tests'), [{ kind: ResponsePartKind.InputRequest, request }])));
		assert.deepStrictEqual(only(pending, 'question')[0].questions, [
			{ text: 'Which runner?', kind: 'single', options: ['vitest', 'mocha'] },
			{ text: 'Why?', kind: 'text' },
			{ text: 'Run in CI?', kind: 'single', options: ['yes', 'no'] },
		]);
		assert.strictEqual(projector.status, 'question');

		const answered = {
			...request, answers: {
				runner: { state: ChatInputAnswerState.Submitted as const, value: { kind: ChatInputAnswerValueKind.Selected as const, value: 'v' } },
				why: { state: ChatInputAnswerState.Submitted as const, value: { kind: ChatInputAnswerValueKind.Text as const, value: 'fast' } },
				ci: { state: ChatInputAnswerState.Submitted as const, value: { kind: ChatInputAnswerValueKind.Boolean as const, value: true } },
			},
		};
		const plan = {
			id: 'p1', planReview: { title: 'Plan', content: '1. Add vitest', actions: [{ id: 'interactive', label: 'Implement' }], canProvideFeedback: true, answerQuestionId: 'plan' },
			answers: { plan: { state: ChatInputAnswerState.Submitted as const, value: { kind: ChatInputAnswerValueKind.Selected as const, value: 'interactive' } } },
		};
		const done = projector.project(snapshot([turn('a1', 0, msg('add tests'), [
			{ kind: ResponsePartKind.InputRequest, request: answered, response: ChatInputResponseKind.Accept },
			{ kind: ResponsePartKind.InputRequest, request: plan, response: ChatInputResponseKind.Accept },
		])]));
		assert.deepStrictEqual(done.map(e => e.kind), ['questionAnswer', 'planReview', 'planReviewDecision', 'turnEnded']);
		const answer = only(done, 'questionAnswer')[0];
		assert.deepStrictEqual([answer.questionId, answer.answers, answer.actor, answer.rawType], ['q1', [{ selected: ['vitest'] }, { text: 'fast' }, { selected: ['yes'] }], 'user', 'inputRequest/accept']);
		assert.deepStrictEqual(only(done, 'planReview').map(e => [e.reviewId, e.plan, e.actions]), [['p1', '1. Add vitest', ['Implement']]]);
		assert.deepStrictEqual(only(done, 'planReviewDecision').map(e => e.action), ['Implement']);
	});

	test('content refs: the log waits for content in order, then maps referenced input, output and file edits', () => {
		const content: Record<string, string> = {};
		const { projector, stored } = createProjector(content);
		const state = snapshot([turn('t1', 0, msg('rename it'), [
			tool({
				status: ToolCallStatus.Completed, toolCallId: 'e1', toolName: 'Edit', displayName: 'Edit', invocationMessage: 'Editing', toolInput: { uri: 'session-db:/input/e1' },
				confirmed: ToolCallConfirmationReason.NotNeeded, success: true, pastTenseMessage: 'Edited',
				content: [{
					type: ToolResultContentType.FileEdit,
					before: { uri: 'file:///w/a.ts', content: { uri: 'session-db:/e1/before' } },
					after: { uri: 'file:///w/a.ts', content: { uri: 'session-db:/e1/after' } },
				}],
			}),
			{ kind: ResponsePartKind.ContentRef, uri: 'session-db:/summary', contentType: 'text/markdown' },
		])]);

		const first = projector.project(state);
		assert.deepStrictEqual(first.map(e => e.kind), ['turnStarted', 'userMessage']);
		assert.deepStrictEqual(projector.pendingContent.map(r => r.uri), ['session-db:/input/e1', 'session-db:/e1/before', 'session-db:/e1/after', 'session-db:/summary']);

		Object.assign(content, {
			'resource:session-db:/input/e1': '{"path":"/w/a.ts"}',
			'resource:session-db:/e1/before': 'a\nb\nc\n',
			'resource:session-db:/e1/after': 'a\nB\nc\n',
			'resource:session-db:/summary': 'Renamed b to B.',
		});
		const second = projector.project(state);
		assert.deepStrictEqual(second.map(e => e.kind), ['toolCall', 'edit', 'toolResult', 'agentText', 'turnEnded']);
		assert.deepStrictEqual(only(second, 'toolCall')[0].input, { path: '/w/a.ts' });
		const edit = only(second, 'edit')[0];
		assert.deepStrictEqual({ uri: edit.uri.toString(), operation: edit.operation, added: edit.added, removed: edit.removed, before: edit.before, after: edit.after }, { uri: 'file:///w/a.ts', operation: 'modify', added: 1, removed: 1, before: { id: 'c1', size: 6 }, after: { id: 'c2', size: 6 } });
		assert.strictEqual(edit.unifiedDiff, '--- a/w/a.ts\n+++ b/w/a.ts\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c');
		assert.deepStrictEqual(stored, ['a\nb\nc\n', 'a\nB\nc\n']);
		assert.deepStrictEqual(only(second, 'agentText')[0].text, 'Renamed b to B.');
		assert.deepStrictEqual(projector.pendingContent, []);
		assert.strictEqual(projector.consumedContent.length, 4);
	});

	test('unified diffs of creations and edits', () => {
		assert.deepStrictEqual(computeUnifiedDiff('/w/n.ts', undefined, 'one\ntwo\n'), { diff: '--- /dev/null\n+++ b/w/n.ts\n@@ -0,0 +1,2 @@\n+one\n+two', added: 2, removed: 0 });
		const lines = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const edited = lines.map(l => l === 'l2' ? 'L2' : l === 'l18' ? 'L18' : l);
		const { diff, added, removed } = computeUnifiedDiff('/f', lines.join('\n'), edited.join('\n'));
		assert.deepStrictEqual([added, removed], [2, 2]);
		// Changes far apart are separate hunks.
		assert.deepStrictEqual(diff.split('\n').filter(l => l.startsWith('@@')), ['@@ -1,5 +1,5 @@', '@@ -15,6 +15,6 @@']);
	});

	test('canObserve takes agent-host sessions (the CLI source keeps those with a CLI log) and needs the connections service', () => {
		const connections = { resolveSessionResourceIdentity: (r: URI) => /^(agent-host|remote)-/.test(r.scheme) ? { connectionAuthority: 'local', backendSession: r } : undefined } as unknown as IAgentHostConnectionsService;
		const withService = { invokeFunction: (fn: (accessor: unknown) => unknown) => fn({ get: () => connections }) } as unknown as IInstantiationService;
		const source = store.add(new AgentHostTranscriptSource(withService, new NullLogService()));
		assert.strictEqual(source.priority, 50);
		assert.deepStrictEqual(['agent-host-claude:/s1', 'agent-host-codex:/s1', 'remote-box-claude:/s1', 'agent-host-copilotcli:/s1', 'copilotcli:/s1', 'vscode-chat-session://local/s1'].map(r => source.canObserve(URI.parse(r))), [true, true, true, true, false, false]);

		const without = { invokeFunction: () => { throw new Error('unknown service'); } } as unknown as IInstantiationService;
		const missing = store.add(new AgentHostTranscriptSource(without, new NullLogService()));
		assert.strictEqual(missing.canObserve(URI.parse('agent-host-claude:/s1')), false);
	});

	test('observe loads the full history, then streams live changes without a widget', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		class FakeSubscription<T> {
			value: T | Error | undefined;
			readonly emitter = store.add(new Emitter<T>());
			readonly onDidChange = this.emitter.event;
			constructor(value: T) {
				this.value = value;
			}
			set(value: T): void {
				this.value = value;
				this.emitter.fire(value);
			}
		}
		const session = new FakeSubscription<SessionState>({ defaultChat: 'ahp-chat:/s1/default', chats: [] } as unknown as SessionState);
		const chatState = (turns: Turn[], activeTurn?: ActiveTurn) => ({ resource: 'ahp-chat:/s1/default', title: 'Retries', status: 1, modifiedAt: iso(0), turns, activeTurn } as unknown as ChatState);
		const history = turn('t1', 0, msg('Fix it'), [
			tool({ status: ToolCallStatus.Completed, toolCallId: 'c1', toolName: 'Write', displayName: 'Write', invocationMessage: 'Writing', toolInput: { uri: 'session-db:/input/c1' }, confirmed: ToolCallConfirmationReason.NotNeeded, success: true, pastTenseMessage: 'Wrote' }),
			md('m1', 'Done.'),
		]);
		const chat = new FakeSubscription<ChatState>(chatState([history]));
		const subscribed: string[] = [];
		const connection = {
			resourceUris: identityAgentHostResourceUriMapper,
			getSubscription: (kind: StateComponents, resource: URI) => {
				subscribed.push(resource.toString());
				return { object: (kind === StateComponents.Session ? session : chat) as unknown as IAgentSubscription<unknown>, dispose: () => { } };
			},
			resourceRead: async (uri: URI) => ({ data: uri.toString() === 'session-db:/input/c1' ? '{"path":"/w/a.ts"}' : '', encoding: 'utf-8' }),
		} as unknown as IAgentConnection;
		const connections = {
			resolveSessionResourceIdentity: () => ({ connectionAuthority: 'local', backendSession: URI.parse('claude:/s1') }),
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession: URI.parse('claude:/s1') }),
		} as unknown as IAgentHostConnectionsService;
		const source = store.add(new AgentHostTranscriptSource({ invokeFunction: (fn: (accessor: unknown) => unknown) => fn({ get: () => connections }) } as unknown as IInstantiationService, new NullLogService()));

		const events: IChatSessionEventInput[] = [];
		let info: Partial<IChatSessionObservedInfo> = {};
		const sink = { append: (e: readonly IChatSessionEventInput[]) => events.push(...e), patchInfo: (p: Partial<IChatSessionObservedInfo>) => info = { ...info, ...p }, storeContent: (t: string) => ({ id: 'x', size: t.length }) };
		const handle = await source.observe(URI.parse('agent-host-claude:/s1'), sink);

		assert.deepStrictEqual(subscribed, ['claude:/s1', 'ahp-chat:/s1/default']);
		assert.deepStrictEqual(events.map(e => e.kind), ['turnStarted', 'userMessage', 'toolCall', 'toolResult', 'agentText', 'turnEnded']);
		assert.deepStrictEqual(only(events, 'toolCall')[0].input, { path: '/w/a.ts' });
		assert.deepStrictEqual([info.status, info.fidelity?.reasoning, info.fidelity?.diffs, info.fidelity?.liveWithoutWidget], ['waiting', 'summary', 'perEdit', true]);

		chat.set(chatState([history], active('t2', 60, msg('Now add a test'), [md('m2', 'On it')])));
		await timeout(500);
		assert.deepStrictEqual(events.slice(6).map(e => e.kind), ['turnStarted', 'userMessage']);
		assert.strictEqual(info.status, 'working');

		chat.set(chatState([history, turn('t2', 60, msg('Now add a test'), [md('m2', 'On it. Added.')])]));
		await timeout(500);
		assert.deepStrictEqual(events.slice(8).map(e => [e.kind, e.id]), [['agentText', 'md:t2:m2'], ['turnEnded', 'end:t2']]);
		assert.strictEqual(info.status, 'waiting');

		handle.dispose();
		chat.set(chatState([history]));
		await timeout(500);
		assert.strictEqual(events.length, 10);
	}));
});
