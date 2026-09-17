/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { DeferredPromise, raceTimeout, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname, join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import type { WorkflowObject, WorkflowRun } from '../../../workflow/common/workflow.js';
import { validateWorkflowObject } from '../../../workflow/common/workflowValidation.js';
import { GITHUB_REPO_PROTECTED_RESOURCE, type IAgentMaterializeChatEvent } from '../../common/agent.js';
import type { IAgentServerToolHost, IAgentServerToolInvocation } from '../../common/agentServerTools.js';
import { AgentHostWorkflowsEnabledConfigKey } from '../../common/agentHostSchema.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { readAgentWorkflowProgress, readWorkflowMessagePresentation, supportsAgentHostWorkflows, toWorkflowMessageMeta } from '../../common/meta/agentWorkflowMeta.js';
import type { IWillDeleteSessionDataEvent } from '../../common/sessionDataService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType, NotificationType, type INotification } from '../../common/state/sessionActions.js';
import { MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, withSessionGitState, type AgentSelection, type MessageAttachment } from '../../common/state/sessionState.js';
import type { AgentService } from '../../node/agentService.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createTestAgentHostWorktreeIsolation, createTestAgentService, getTestAgentStateManager, registerTestAgentProvider, setTestAgentHostWorktreeIsolation } from './agentServiceTestUtils.js';
import { MOCK_WORKFLOW_TASK_PREFIX, MockAgent, ScriptedMockAgent } from './mockAgent.js';
import { workflowStoreRun } from './testWorkflowService.js';

class WorkflowAgent extends MockAgent {
	private readonly _disposables = new DisposableStore();
	private readonly _materialization = this._disposables.add(new Emitter<IAgentMaterializeChatEvent>());
	override readonly onDidMaterializeChat = this._materialization.event;
	tools: IAgentServerToolHost | undefined;
	currentAgent: AgentSelection | undefined;

	constructor(provisional = false) {
		super('copilot', { multipleWorkingDirectories: {} }, { workspaceConversion: false, workflows: true });
		this.chats.getAgent = async () => this.currentAgent;
		const createChat = this.chats.createChat;
		this.chats.createChat = async (chat, context, options) => {
			const created = await createChat(chat, context, options);
			return provisional && created ? { ...created, provisional: true } : created;
		};
	}

	override async changeAgent(session: URI, agent: AgentSelection | undefined, chat?: URI): Promise<void> {
		this.currentAgent = agent;
		await super.changeAgent(session, agent, chat);
	}

	override getProtectedResources() {
		return [...super.getProtectedResources(), GITHUB_REPO_PROTECTED_RESOURCE];
	}

	setServerToolHost(host: IAgentServerToolHost): void { this.tools = host; }

	materialize(chat: URI, workingDirectories: readonly URI[]): void {
		this._materialization.fire({ chat, workingDirectories, project: undefined });
	}

	override dispose(): void {
		this._disposables.dispose();
		super.dispose();
	}
}

suite('AgentHostWorkflowService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let service: AgentService;
	let agent: WorkflowAgent;
	let session: URI;
	let options: WorkflowRun;
	let deletionEvents: Emitter<IWillDeleteSessionDataEvent>;
	let settingsSequence: number;
	let gitService: IAgentHostGitService;
	let sessionDatabase: TestSessionDatabase;

	function setWorkflowsEnabled(enabled: boolean): void {
		service.dispatchAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AgentHostWorkflowsEnabledConfigKey]: enabled } }, 'workflow-settings', ++settingsSequence);
	}

	async function createService(storageResource?: URI, enabled = true, provisional = false, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
		const log = new NullLogService();
		const files = disposables.add(new FileService(log));
		disposables.add(files.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		deletionEvents = disposables.add(new Emitter<IWillDeleteSessionDataEvent>());
		gitService = createNoopGitService();
		sessionDatabase = new TestSessionDatabase();
		service = disposables.add(createTestAgentService(log, files, { ...createSessionDataService(sessionDatabase), onWillDeleteSessionData: deletionEvents.event }, { _serviceBrand: undefined } as IProductService, gitService, undefined, undefined, undefined, undefined, fetchFn, undefined, undefined, storageResource));
		settingsSequence = 0;
		if (enabled) {
			setWorkflowsEnabled(true);
		}
		agent = disposables.add(new WorkflowAgent(provisional));
		registerTestAgentProvider(service, agent);
		session = await service.createSession({ provider: 'copilot' });
		options = workflowStoreRun(session.toString());
	}

	setup(() => createService());

	for (const explicit of [false, true]) {
		test(`infers the owning session repository without replacing explicit inputs (${explicit})`, async () => {
			const directory = URI.file('/workflow-project');
			const resource = await service.createSession({ provider: 'copilot', workingDirectories: [directory] });
			const template = workflowStoreRun(resource.toString());
			gitService.getSessionGitState = async () => ({ githubOwner: 'example', githubRepo: 'project' });
			const inputSchema = { type: 'object' as const, properties: { repository: { type: 'string' as const, format: 'uri' } }, required: ['repository'], additionalProperties: false };
			const run = await service.startWorkflow!({
				...template, workspace: directory.toString(),
				inputs: explicit ? { repository: 'https://github.com/example/explicit-project' } : undefined,
				snapshot: {
					...template.snapshot, inputSchema,
					checkpoints: template.snapshot.checkpoints.map(checkpoint => ({
						...checkpoint, type: { ...checkpoint.type, inputSchema }, inputs: { repository: { input: 'repository' } },
					})),
				},
			});
			assert.deepStrictEqual({ status: run.status, inputs: run.inputs, request: run.inputRequest }, {
				status: 'running', inputs: { repository: explicit ? 'https://github.com/example/explicit-project' : 'https://github.com/example/project' }, request: undefined,
			});
		});
	}

	for (const rootIndex of [0, 1]) {
		test(`repository inference uses metadata belonging to the selected root (${rootIndex})`, async () => {
			const directories = [URI.file('/primary-project'), URI.file('/secondary-project')];
			const resource = await service.createSession({ provider: 'copilot', workingDirectories: directories });
			const state = getTestAgentStateManager(service);
			state.setSessionMeta(resource.toString(), withSessionGitState(state.getSessionSummary(resource.toString())?._meta, {
				branchName: 'main', githubOwner: 'example', githubRepo: 'primary',
			}));
			gitService.getSessionGitState = async directory => ({
				githubOwner: 'example', githubRepo: directory.toString() === directories[1].toString() ? 'secondary' : 'primary',
			});
			const template = workflowStoreRun(resource.toString());
			const inputSchema = { type: 'object' as const, properties: { repository: { type: 'string' as const, format: 'uri' } }, required: ['repository'], additionalProperties: false };
			const run = await service.startWorkflow!({
				...template, workspace: directories[rootIndex].toString(),
				snapshot: {
					...template.snapshot, inputSchema,
					checkpoints: template.snapshot.checkpoints.map(checkpoint => ({
						...checkpoint, type: { ...checkpoint.type, inputSchema }, inputs: { repository: { input: 'repository' } },
					})),
				},
			});
			assert.deepStrictEqual(run.inputs, { repository: `https://github.com/example/${rootIndex ? 'secondary' : 'primary'}` });
		});
	}

	test('an inferred repository that does not match the input schema is requested at its checkpoint', async () => {
		const directory = URI.file('/workflow-project');
		const resource = await service.createSession({ provider: 'copilot', workingDirectories: [directory] });
		gitService.getSessionGitState = async () => ({ githubOwner: 'example', githubRepo: 'project' });
		const template = workflowStoreRun(resource.toString());
		const inputSchema = { type: 'object' as const, properties: { repository: { type: 'string' as const, format: 'uri', const: 'https://github.com/example/another-project' } }, required: ['repository'], additionalProperties: false };
		const run = await service.startWorkflow!({
			...template, workspace: directory.toString(),
			snapshot: {
				...template.snapshot, inputSchema,
				checkpoints: template.snapshot.checkpoints.map(checkpoint => ({
					...checkpoint, type: { ...checkpoint.type, inputSchema }, inputs: { repository: { input: 'repository' } },
				})),
			},
		});
		assert.deepStrictEqual({ status: run.status, inputs: run.inputs, request: run.inputRequest, firstTurns: run.firstTurns }, {
			status: 'blocked', inputs: {}, request: { checkpointId: 'plan', keys: ['repository'] }, firstTurns: {},
		});
	});

	test('missing initial inputs are durable and disabled workflows cannot accept them', async () => {
		const inputSchema = { type: 'object' as const, properties: { project: { type: 'string' as const, minLength: 1 } }, required: ['project'], additionalProperties: false };
		const run = await service.startWorkflow!({
			...options,
			snapshot: {
				...options.snapshot, inputSchema,
				checkpoints: options.snapshot.checkpoints.map(checkpoint => ({
					...checkpoint, type: { ...checkpoint.type, inputSchema }, inputs: { project: { input: 'project' } },
				})),
			},
		});
		assert.deepStrictEqual({ status: run.status, request: run.inputRequest, firstTurns: run.firstTurns }, {
			status: 'blocked', request: { checkpointId: 'plan', keys: ['project'] }, firstTurns: {},
		});
		setWorkflowsEnabled(false);
		await assert.rejects(service.controlWorkflow!({ kind: 'provideInputs', runId: run.id, revision: run.revision, inputs: { project: 'Example' } }), /disabled/);
	});

	async function until(predicate: (run: WorkflowRun) => boolean): Promise<WorkflowRun> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const run = await service.getWorkflowRun(session);
			if (run && predicate(run)) {
				return run;
			}
			await timeout(10);
		}
		throw new Error('Workflow did not reach its expected state');
	}

	async function execute(name: string, args: object, invocation?: IAgentServerToolInvocation): Promise<WorkflowObject> {
		assert.ok(agent.tools);
		const result: unknown = JSON.parse(await agent.tools.executeTool(options.chat, name, args, invocation));
		validateWorkflowObject(result);
		return result;
	}

	async function finishWorkflow(): Promise<WorkflowRun> {
		const run = await service.startWorkflow(options);
		const turnId = run.assignment!.turnId;
		await execute('prove_checkpoint', { proof: {} }, { turnId, toolCallId: 'proof' });
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId, duration: 1 } });
		return until(current => current.assignment?.delivery === 'ended');
	}

	test('publishes per-agent workflow support through ordinary root state', () => {
		registerTestAgentProvider(service, disposables.add(new MockAgent('legacy')));
		assert.deepStrictEqual(
			getTestAgentStateManager(service).rootState.agents.map(agent => ({ provider: agent.provider, workflows: supportsAgentHostWorkflows(agent) })),
			[{ provider: 'copilot', workflows: true }, { provider: 'legacy', workflows: false }],
		);
	});

	test('scripted mock uses host tools through a stop boundary and explicit continuation', async () => {
		registerTestAgentProvider(service, disposables.add(new ScriptedMockAgent()));
		session = await service.createSession({ provider: 'mock' });
		options = workflowStoreRun(session.toString());
		const first = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({
			...options,
			task: `${MOCK_WORKFLOW_TASK_PREFIX}${JSON.stringify({ proofs: { plan: {}, implement: {}, verify: {} } })}`,
			snapshot: { ...options.snapshot, checkpoints: [first, { ...first, id: 'implement' }, { ...first, id: 'verify' }] },
			stopAfter: 'implement',
		});
		const stopped = await until(current => current.status === 'stopped' && current.assignment?.delivery === 'ended');
		await service.controlWorkflow({ kind: 'setStopAfter', runId: stopped.id, revision: stopped.revision, checkpointId: 'verify' });
		const completed = await until(current => current.status === 'completed' && current.assignment?.delivery === 'ended');
		const turns = getTestAgentStateManager(service).getChatState(options.chat)!.turns;
		assert.deepStrictEqual({
			atStop: stopped.receipts.map(receipt => receipt.checkpointId),
			completed: completed.receipts.map(receipt => receipt.checkpointId),
			receiptTurns: completed.receipts.map(receipt => receipt.turnId),
			distinctTurns: new Set(completed.receipts.map(receipt => receipt.turnId)).size,
			activityAt: completed.activityAt,
		}, {
			atStop: ['plan', 'implement'], completed: ['plan', 'implement', 'verify'],
			receiptTurns: turns.filter(turn => readWorkflowMessagePresentation(turn.message)).map(turn => turn.id), distinctTurns: 3, activityAt: run.activityAt,
		});
	});

	test('pausing a scripted workflow cancels delayed proof without completing the checkpoint', async () => {
		const mock = disposables.add(new ScriptedMockAgent());
		registerTestAgentProvider(service, mock);
		session = await service.createSession({ provider: 'mock' });
		options = workflowStoreRun(session.toString());
		const listeners = disposables.add(new DisposableStore());
		const read = Event.toPromise(Event.filter(mock.onDidChatProgress, signal =>
			signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete && signal.action.toolCallId.endsWith('get_checkpoint'),
		), listeners);
		await service.startWorkflow({ ...options, task: `${MOCK_WORKFLOW_TASK_PREFIX}${JSON.stringify({ proofs: { plan: {} }, delayMs: 30_000 })}` });
		await read;
		const run = (await service.getWorkflowRun(session))!;
		await service.controlWorkflow({ kind: 'pause', runId: run.id, revision: run.revision });
		const paused = await until(current => current.status === 'paused' && current.assignment?.delivery === 'ended');
		assert.deepStrictEqual({ status: paused.status, receipts: paused.receipts, active: getTestAgentStateManager(service).getActiveTurnId(options.chat) }, { status: 'paused', receipts: [], active: undefined });
	});

	test('workflows default off without affecting ordinary user turns', async () => {
		service.dispose();
		await createService(undefined, false);
		await assert.rejects(service.startWorkflow(options), /Workflows are disabled/);
		const listeners = disposables.add(new DisposableStore());
		const sent = Event.toPromise(agent.onDidSendMessage, listeners);
		service.dispatchAction(options.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'ordinary-user', startedAt: new Date().toISOString(),
			message: { text: 'Ordinary request', origin: { kind: MessageKind.User } },
		}, 'client', 1);
		await sent;
		assert.deepStrictEqual({ run: await service.getWorkflowRun(session), sent: agent.sendMessageCalls.length }, { run: undefined, sent: 1 });
	});

	test('disabling the rollout gate revokes proof and dispatch until explicitly resumed', async () => {
		const run = await service.startWorkflow(options);
		setWorkflowsEnabled(false);
		const stale = await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'revoked' });
		const paused = await until(current => current.status === 'paused' && current.assignment?.delivery === 'ended');
		await assert.rejects(service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision }), /Workflows are disabled/);
		setWorkflowsEnabled(true);
		await timeout(20);
		assert.deepStrictEqual({
			proof: stale.kind, status: (await service.getWorkflowRun(session))?.status, sent: agent.sendMessageCalls.length,
		}, { proof: 'stale_assignment', status: 'paused', sent: 1 });
		const resumed = await service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision });
		assert.deepStrictEqual({ status: resumed.status, sent: agent.sendMessageCalls.length }, { status: 'running', sent: 2 });
	});

	test('normal dispatch carries authoritative identity and rejects missing, wrong and delegated turns', async () => {
		const run = await service.startWorkflow(options);
		assert.ok(run.assignment);
		const invalid = await Promise.all([
			execute('prove_checkpoint', { proof: {} }),
			execute('prove_checkpoint', { proof: {} }, { turnId: 'another-turn', toolCallId: 'call' }),
			execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment.turnId, toolCallId: 'call', isSubagent: true }),
		]);
		const accepted = await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment.turnId, toolCallId: 'original-call' });
		const completed = await service.getWorkflowRun(session);
		assert.deepStrictEqual({
			sendCount: agent.sendMessageCalls.length,
			invalid: invalid.map(result => result.kind),
			accepted: accepted.kind,
			status: completed?.status,
			receipts: completed?.receipts.map(receipt => ({ checkpoint: receipt.checkpointId, turn: receipt.turnId })),
		}, {
			sendCount: 1, invalid: ['stale_assignment', 'stale_assignment', 'stale_assignment'], accepted: 'accepted',
			status: 'completed', receipts: [{ checkpoint: 'plan', turn: run.assignment.turnId }],
		});
	});

	for (const status of ['running', 'stopped', 'completed'] as const) {
		test(`checkpoint reads retain the original assignment after proof leaves the run ${status}`, async () => {
			const first = options.snapshot.checkpoints[0];
			const run = await service.startWorkflow({
				...options,
				stopAfter: status === 'running' ? 'implement' : first.id,
				snapshot: { ...options.snapshot, checkpoints: status === 'completed' ? [first] : [first, { ...first, id: 'implement' }] },
			});
			const turnId = run.assignment!.turnId;
			const before = await execute('get_checkpoint', {}, { turnId, toolCallId: 'read-before-proof' });
			const proof = await execute('prove_checkpoint', { proof: {} }, { turnId, toolCallId: 'proof' });
			const accepted = await until(current => current.receipts.length === 1);
			const after = await execute('get_checkpoint', {}, { turnId, toolCallId: 'read-after-proof' });
			const unchanged = await service.getWorkflowRun(session);
			assert.deepStrictEqual({
				before, proof: proof.kind, status: accepted.status, after,
				revision: unchanged?.revision, sent: agent.sendMessageCalls.length,
			}, {
				before: { task: run.task, checkpoint: first, assignment: run.assignment, stopAfter: run.stopAfter },
				proof: 'accepted', status,
				after: { task: run.task, checkpoint: first, assignment: accepted.assignment, stopAfter: accepted.stopAfter },
				revision: accepted.revision, sent: 1,
			});
		});
	}

	test('first dispatch retires the draft and forwards selections and context without pinning later turns', async () => {
		const state = getTestAgentStateManager(service);
		assert.strictEqual(state.isUnusedDraft(options.session), true);
		const listeners = disposables.add(new DisposableStore());
		const sent = Event.toPromise(agent.onDidSendMessage, listeners);
		const model = { id: 'chosen-model', config: { reasoning: 'high', limit: 64, fast: true } };
		const selectedAgent = { uri: 'file:///agents/reviewer.agent.md' };
		const attachments: MessageAttachment[] = [{ type: MessageAttachmentKind.Simple, label: 'Requirements', modelRepresentation: 'Keep this context' }];
		const first = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({
			...options, model, agent: selectedAgent, attachments, stopAfter: 'implement',
			snapshot: { ...options.snapshot, checkpoints: [first, { ...first, id: 'implement' }] },
		});
		await sent;
		const message = state.getChatState(options.chat)!.activeTurn!.message;
		const nextAgent = { uri: 'file:///agents/implementer.agent.md' };
		const nextModel = { id: 'normal-chat-model', config: { reasoning: 'low' } };
		agent.currentAgent = nextAgent;
		agent.chatModel = nextModel;
		const nextSent = Event.toPromise(agent.onDidSendMessage, listeners);
		await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'proof' });
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId: run.assignment!.turnId, duration: 1 } });
		await nextSent;
		assert.deepStrictEqual({
			unused: state.isUnusedDraft(options.session),
			first: { model: message.model, agent: message.agent, attachments: message.attachments },
			modelUpdates: agent.changeModelCalls.map(call => call.model),
			agents: agent.changeAgentCalls.map(call => call.agent),
			attachments: agent.sendMessageCalls.map(call => call.attachments),
			currentModel: agent.chatModel,
		}, {
			unused: false, first: { model, agent: selectedAgent, attachments },
			modelUpdates: [model], agents: [selectedAgent, nextAgent], attachments: [attachments, undefined], currentModel: nextModel,
		});
	});

	for (const task of ['First line\nNext line', 'proof']) {
		test(`retains the original request and attachments without stale prompt ranges (${JSON.stringify(task)})`, async () => {
			const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } };
			const attachment: MessageAttachment = { type: MessageAttachmentKind.Simple, label: 'Context', modelRepresentation: 'Keep this context', range };
			const run = await service.startWorkflow({ ...options, task, attachments: [attachment] });
			const message = getTestAgentStateManager(service).getChatState(options.chat)!.activeTurn!.message;
			const context = await execute('get_checkpoint', {}, { turnId: run.assignment!.turnId, toolCallId: 'read-original-request' });
			assert.deepStrictEqual({
				task: context.task, attachments: message.attachments, original: attachment.range, presentation: readWorkflowMessagePresentation(message),
				initial: getTestAgentStateManager(service).getChatState(options.chat)!.turns.map(turn => ({
					text: turn.message.text, origin: turn.message.origin.kind, attachments: turn.message.attachments, state: turn.state,
				})),
			}, {
				task, attachments: [{ type: MessageAttachmentKind.Simple, label: 'Context', modelRepresentation: 'Keep this context' }], original: range,
				presentation: { kind: 'workflow', workflowLabel: options.snapshot.label, checkpointLabel: options.snapshot.checkpoints[0].label, reason: 'start' },
				initial: [{ text: task, origin: MessageKind.User, attachments: [attachment], state: TurnState.Complete }],
			});
		});
	}

	test('prepares the worktree on the original user message before publishing the workflow message', async () => {
		const preparing = new DeferredPromise<void>();
		const ready = new DeferredPromise<void>();
		const worktree = URI.file('/work/prepared-worktree');
		let pending = true;
		let preparationPrompt: string | undefined;
		let sentDirectories: Parameters<typeof agent.chats.sendMessage>[2];
		const send = agent.chats.sendMessage;
		agent.chats.sendMessage = async (...args) => {
			sentDirectories = args[2];
			await send(...args);
		};
		setTestAgentHostWorktreeIsolation(service, createTestAgentHostWorktreeIsolation({
			isWorkingDirectoryPending: () => pending,
			resolveOnFirstSend: async request => {
				preparationPrompt = request.prompt;
				await preparing.complete();
				await ready.p;
				pending = false;
				return worktree;
			},
			getResolvedWorktree: () => pending ? undefined : worktree,
			takePendingAnnouncement: () => 'Created isolated worktree\n\n',
		}));
		const listeners = disposables.add(new DisposableStore());
		const sent = Event.toPromise(agent.onDidSendMessage, listeners);
		const starting = service.startWorkflow(options);
		await preparing.p;
		const state = getTestAgentStateManager(service);
		const initial = state.getChatState(options.chat)!.activeTurn!;
		const before = {
			message: initial.message.text, origin: initial.message.origin.kind,
			title: state.getSessionState(session.toString())?.title,
			completed: state.getChatState(options.chat)!.turns.length, sent: agent.sendMessageCalls.length,
		};
		await ready.complete();
		const run = await starting;
		await sent;
		const chat = state.getChatState(options.chat)!;
		assert.deepStrictEqual({
			before, preparationPrompt,
			title: state.getSessionState(session.toString())?.title,
			directories: URI.isUri(sentDirectories) ? sentDirectories.toString() : sentDirectories?.map(directory => directory.toString()),
			initial: chat.turns.map(turn => ({
				id: turn.id, origin: turn.message.origin.kind, state: turn.state,
				response: turn.responseParts.map(part => part.kind === ResponsePartKind.Markdown ? part.content : part.kind),
			})),
			workflow: { id: chat.activeTurn?.id, origin: chat.activeTurn?.message.origin.kind, presentation: readWorkflowMessagePresentation(chat.activeTurn!.message) },
			persisted: (await sessionDatabase.getLocalTurns()).map(record => JSON.parse(record.payload)),
			sent: agent.sendMessageCalls.length,
		}, {
			before: { message: options.task, origin: MessageKind.User, title: options.task, completed: 0, sent: 0 },
			title: options.task,
			preparationPrompt: options.task, directories: [worktree.toString()],
			initial: [{ id: initial.id, origin: MessageKind.User, state: TurnState.Complete, response: ['Created isolated worktree\n\n'] }],
			workflow: {
				id: run.assignment!.turnId, origin: MessageKind.SystemNotification,
				presentation: { kind: 'workflow', workflowLabel: options.snapshot.label, checkpointLabel: options.snapshot.checkpoints[0].label, reason: 'start' },
			},
			persisted: [JSON.parse(JSON.stringify(chat.turns[0]))],
			sent: 1,
		});
	});

	test('starting a workflow preserves an explicitly named session', async () => {
		const state = getTestAgentStateManager(service);
		state.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: 'Keep this title' });
		await service.startWorkflow(options);
		assert.deepStrictEqual({
			title: state.getSessionState(session.toString())?.title,
			original: state.getChatState(options.chat)?.turns[0]?.message.text,
			sent: agent.sendMessageCalls.length,
		}, { title: 'Keep this title', original: options.task, sent: 1 });
	});

	test('cancelling initial workspace preparation stops the workflow without an agent turn', async () => {
		const preparing = new DeferredPromise<void>();
		const ready = new DeferredPromise<void>();
		setTestAgentHostWorktreeIsolation(service, createTestAgentHostWorktreeIsolation({
			isWorkingDirectoryPending: () => true,
			resolveOnFirstSend: async () => {
				await preparing.complete();
				await ready.p;
				return undefined;
			},
		}));
		const starting = service.startWorkflow(options);
		await preparing.p;
		const state = getTestAgentStateManager(service);
		const turnId = state.getActiveTurnId(options.chat)!;
		service.dispatchAction(options.chat, { type: ActionType.ChatTurnCancelled, turnId, duration: 0 }, 'user', 1);
		await ready.complete();
		const run = await starting;
		assert.deepStrictEqual({
			status: run.status, sent: agent.sendMessageCalls.length,
			turns: state.getChatState(options.chat)?.turns.map(turn => ({ text: turn.message.text, state: turn.state })),
			active: state.getActiveTurnId(options.chat),
		}, {
			status: 'paused', sent: 0, turns: [{ text: options.task, state: TurnState.Cancelled }], active: undefined,
		});
	});

	test('a failed initial request write is visible and cannot start the agent', async () => {
		sessionDatabase.insertLocalTurn = async () => { throw new Error('Initial request could not be saved'); };
		await assert.rejects(service.startWorkflow(options), /Initial request could not be saved/);
		const chat = getTestAgentStateManager(service).getChatState(options.chat)!;
		assert.deepStrictEqual({
			status: (await service.getWorkflowRun(session))?.status,
			sent: agent.sendMessageCalls.length,
			turns: chat.turns.map(turn => ({ text: turn.message.text, state: turn.state })),
			active: chat.activeTurn,
		}, {
			status: 'paused', sent: 0, turns: [{ text: options.task, state: TurnState.Error }], active: undefined,
		});
	});

	test('attaching to existing history does not insert another initial user message', async () => {
		const state = getTestAgentStateManager(service);
		state.dispatchServerAction(options.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'existing', startedAt: new Date().toISOString(),
			message: { text: 'Existing conversation', origin: { kind: MessageKind.User } },
		});
		state.dispatchServerAction(options.chat, { type: ActionType.ChatTurnComplete, turnId: 'existing', duration: 0 });
		const run = await service.startWorkflow(options);
		assert.deepStrictEqual({
			history: state.getChatState(options.chat)?.turns.map(turn => turn.message.text),
			active: state.getActiveTurnId(options.chat),
			local: await sessionDatabase.getLocalTurns(),
		}, {
			history: ['Existing conversation'], active: run.assignment!.turnId, local: [],
		});
	});

	test('workspace preparation errors are persisted on the initial user request', async () => {
		setTestAgentHostWorktreeIsolation(service, createTestAgentHostWorktreeIsolation({
			getResolvedWorktree: () => URI.file('/work/missing-workspace'),
			resolveWorkingDirectoryForResume: async () => { throw new Error('Workspace is unavailable'); },
		}));
		await assert.rejects(service.startWorkflow(options), /Workspace is unavailable/);
		assert.deepStrictEqual({
			status: (await service.getWorkflowRun(session))?.status,
			sent: agent.sendMessageCalls.length,
			states: (await sessionDatabase.getLocalTurns()).map(record => JSON.parse(record.payload).state),
		}, { status: 'paused', sent: 0, states: [TurnState.Error] });
	});

	test('durable workflow ownership retires a draft even before any provider turn can start', async () => {
		const state = getTestAgentStateManager(service);
		assert.strictEqual(state.isUnusedDraft(options.session), true);
		const first = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({
			...options,
			snapshot: { ...options.snapshot, checkpoints: [{ ...first, type: { ...first.type, startCondition: { check: 'test/unavailable@1' } } }] },
		});
		assert.deepStrictEqual({
			status: run.status, unused: state.isUnusedDraft(options.session), sent: agent.sendMessageCalls.length,
		}, { status: 'blocked', unused: false, sent: 0 });
	});

	test('a waiting first condition publishes an eager draft without a provider turn', async () => {
		service.dispose();
		let requests = 0;
		await createService(undefined, true, true, async () => {
			requests++;
			return new Response('{"message":"Rate limit exceeded"}', { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '900' } });
		});
		await service.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'workflow-test-token' });
		const state = getTestAgentStateManager(service);
		const listedBefore = await service.listSessions();
		const notifications: INotification[] = [];
		disposables.add(service.onDidNotification(notification => notifications.push(notification)));
		const first = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({
			...options,
			snapshot: {
				...options.snapshot,
				checkpoints: [{
					...first,
					type: {
						...first.type,
						startCondition: {
							check: 'vscode.github/commit-in-release@1',
							inputs: { repository: { value: 'https://github.com/microsoft/vscode' }, commit: { value: 'a'.repeat(40) } },
							options: { release: 'published-stable' },
						},
					},
				}],
			},
		});
		const listed = await service.listSessions();
		const added = notifications.filter(notification => notification.type === NotificationType.SessionAdded);
		assert.deepStrictEqual({
			listedBefore: listedBefore.map(entry => entry.session.toString()),
			listed: listed.map(entry => entry.session.toString()),
			added: added.map(notification => notification.summary.resource),
			publishedRun: added.map(notification => readAgentWorkflowProgress(notification.summary)?.runId),
			status: run.status,
			wait: run.wait?.kind,
			durableStatus: (await service.getWorkflowRun(session))?.status,
			unused: state.isUnusedDraft(options.session),
			lifecycle: state.getSessionState(options.session)?.lifecycle,
			modifiedAt: state.getSessionSummary(options.session)?.modifiedAt,
			sent: agent.sendMessageCalls.length,
			turns: state.getChatState(options.chat)?.turns.length,
			active: state.getChatState(options.chat)?.activeTurn,
			checkRequested: requests > 0,
		}, {
			listedBefore: [], listed: [options.session], added: [options.session], publishedRun: [run.id],
			status: 'waiting', wait: 'startCondition', durableStatus: 'waiting', unused: false,
			lifecycle: SessionLifecycle.Creating, modifiedAt: new Date(run.createdAt).toISOString(), sent: 0, turns: 1, active: undefined, checkRequested: true,
		}, run.reason);
	});

	test('an eager workflow dispatches normally and later materialization refreshes its single catalog entry', async () => {
		service.dispose();
		await createService(undefined, true, true);
		const state = getTestAgentStateManager(service);
		const notifications: INotification[] = [];
		disposables.add(service.onDidNotification(notification => notifications.push(notification)));
		const listeners = disposables.add(new DisposableStore());
		const sent = Event.toPromise(agent.onDidSendMessage, listeners);
		const run = await service.startWorkflow(options);
		await sent;
		const workingDirectory = URI.file('/work/workflow');
		agent.materialize(URI.parse(options.chat), [workingDirectory]);
		const added = notifications.filter(notification => notification.type === NotificationType.SessionAdded);
		const changed = notifications.filter(notification => notification.type === NotificationType.SessionSummaryChanged);
		assert.deepStrictEqual({
			sent: agent.sendMessageCalls.length,
			activeTurn: state.getChatState(options.chat)?.activeTurn?.id,
			added: added.map(notification => notification.summary.resource),
			lifecycle: state.getSessionState(options.session)?.lifecycle,
			workingDirectories: state.getSessionSummary(options.session)?.workingDirectories,
			updatedDirectory: changed.some(notification => notification.changes.workingDirectories?.[0] === workingDirectory.toString()),
			runId: readAgentWorkflowProgress(state.getSessionSummary(options.session))?.runId,
		}, {
			sent: 1, activeTurn: run.assignment?.turnId, added: [options.session], lifecycle: SessionLifecycle.Ready,
			workingDirectories: [workingDirectory.toString()], updatedDirectory: true, runId: run.id,
		});
	});

	test('a rejected start leaves an ordinary eager draft hidden and collectable', async () => {
		service.dispose();
		await createService(undefined, true, true);
		const notifications: INotification[] = [];
		disposables.add(service.onDidNotification(notification => notifications.push(notification)));
		await assert.rejects(service.startWorkflow({ ...options, stopAfter: 'missing' }));
		const state = getTestAgentStateManager(service);
		assert.deepStrictEqual({
			run: await service.getWorkflowRun(session),
			listed: (await service.listSessions()).map(entry => entry.session.toString()),
			added: notifications.filter(notification => notification.type === NotificationType.SessionAdded).length,
			unused: state.isUnusedDraft(options.session),
			lifecycle: state.getSessionState(options.session)?.lifecycle,
			sent: agent.sendMessageCalls.length,
		}, { run: undefined, listed: [], added: 0, unused: true, lifecycle: SessionLifecycle.Creating, sent: 0 });
	});

	test('routine completion is quiet and an old invocation cannot prove a new active turn', async () => {
		const first = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({ ...options, stopAfter: 'implement', snapshot: { ...options.snapshot, checkpoints: [first, { ...first, id: 'implement' }] } });
		const turnId = run.assignment!.turnId;
		await execute('prove_checkpoint', { proof: {} }, { turnId, toolCallId: 'proof' });
		const state = getTestAgentStateManager(service);
		state.dispatchServerAction(options.session, { type: ActionType.SessionIsReadChanged, isRead: true });
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId, duration: 1 } });
		const next = await until(current => current.assignment?.turnId !== turnId && current.assignment?.delivery === 'running');
		const isRead = !!(state.getSessionState(options.session)!.status & SessionStatus.IsRead);
		assert.deepStrictEqual({
			late: (await execute('prove_checkpoint', { proof: {} }, { turnId, toolCallId: 'late-call' })).kind,
			lateRead: (await execute('get_checkpoint', {}, { turnId, toolCallId: 'late-read' })).kind,
			active: state.getChatState(options.chat)?.activeTurn?.id,
			isRead,
			activityAt: next.activityAt,
		}, { late: 'stale_assignment', lateRead: 'stale_assignment', active: next.assignment?.turnId, isRead: true, activityAt: run.activityAt });
	});

	test('a queued-message race returns the assignment to pending without sending or blocking', async () => {
		const checkpoint = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({ ...options, stopAfter: 'implement', snapshot: { ...options.snapshot, checkpoints: [checkpoint, { ...checkpoint, id: 'implement' }] } });
		const state = getTestAgentStateManager(service);
		agent.chats.getAgent = async () => {
			state.dispatchServerAction(options.chat, {
				type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'queued-user',
				message: { text: 'User work takes priority', origin: { kind: MessageKind.User } },
			});
			return agent.currentAgent;
		};
		await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'proof' });
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId: run.assignment!.turnId, duration: 1 } });
		const pending = await until(current => current.pendingAssignment?.checkpointId === 'implement' && current.assignment === undefined);
		assert.deepStrictEqual({
			status: pending.status, sent: agent.sendMessageCalls.length, active: state.getChatState(options.chat)?.activeTurn,
			queued: state.getChatState(options.chat)?.queuedMessages?.map(message => message.id),
		}, { status: 'running', sent: 1, active: undefined, queued: ['queued-user'] });
	});

	test('pause and resume cannot admit a revoked assignment after a deferred provider lookup', async () => {
		const checkpoint = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({ ...options, stopAfter: 'implement', snapshot: { ...options.snapshot, checkpoints: [checkpoint, { ...checkpoint, id: 'implement' }] } });
		const state = getTestAgentStateManager(service);
		const lookingUp = new DeferredPromise<WorkflowRun>();
		const selected = new DeferredPromise<AgentSelection | undefined>();
		const dispatched: string[] = [];
		disposables.add(state.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChatTurnStarted) {
				dispatched.push(envelope.action.turnId);
			}
		}));
		agent.chats.getAgent = async () => {
			const current = await service.getWorkflowRun(session);
			if (current?.assignment?.checkpointId === 'implement' && current.assignment.delivery === 'dispatching') {
				void lookingUp.complete(current);
				return selected.p;
			}
			return agent.currentAgent;
		};
		try {
			await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'proof' });
			agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId: run.assignment!.turnId, duration: 1 } });
			const current = await lookingUp.p;
			const paused = await service.controlWorkflow({ kind: 'pause', runId: current.id, revision: current.revision });
			const resuming = service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision });
			const resumingState = await until(current => current.status === 'running');
			await selected.complete(undefined);
			const resumed = await resuming;
			assert.deepStrictEqual({
				dispatched, receipts: resumed.receipts.map(receipt => receipt.checkpointId),
				sameAssignment: resumingState.assignment?.id === current.assignment?.id,
				revoked: resumingState.assignment?.revoked,
			}, { dispatched: [], receipts: ['plan'], sameAssignment: true, revoked: true });
		} finally {
			await selected.complete(undefined);
		}
	});

	for (const source of ['client', 'provider'] as const) {
		test(`records admitted user activity from another ${source} without replacing chat timestamps`, async () => {
			const completed = await finishWorkflow();
			await timeout(20);
			const before = Date.now();
			const startedAt = '2099-01-01T00:00:00.000Z';
			const action = {
				type: ActionType.ChatTurnStarted, turnId: `user-${source}`, startedAt,
				message: { text: 'User follow-up', origin: { kind: MessageKind.User } },
			} as const;
			if (source === 'client') {
				service.dispatchAction(options.chat, action, 'another-client', 1);
			} else {
				agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action });
			}
			const active = await until(current => current.activityAt > completed.activityAt);
			const modifiedAt = getTestAgentStateManager(service).getChatState(options.chat)?.modifiedAt;
			agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId: action.turnId, duration: 1 } });
			await timeout(20);
			assert.deepStrictEqual({
				serverTime: active.activityAt >= before && active.activityAt <= Date.now(),
				modifiedAt,
				afterCompletion: (await service.getWorkflowRun(session))?.activityAt,
			}, { serverTime: true, modifiedAt: startedAt, afterCompletion: active.activityAt });
		});
	}

	test('a synchronously cancelled admitted user turn still records its activity', async () => {
		const completed = await finishWorkflow();
		await timeout(20);
		service.dispatchAction(options.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'cancelled-user', startedAt: new Date().toISOString(),
			message: { text: 'User follow-up', origin: { kind: MessageKind.User } },
		}, 'another-client', 1);
		service.dispatchAction(options.chat, { type: ActionType.ChatTurnCancelled, turnId: 'cancelled-user', duration: 0 }, 'another-client', 2);
		const updated = await until(current => current.activityAt > completed.activityAt);
		assert.deepStrictEqual({
			status: updated.status,
			revision: updated.revision,
			active: getTestAgentStateManager(service).getChatState(options.chat)?.activeTurn,
		}, { status: completed.status, revision: completed.revision + 1, active: undefined });
	});

	test('rejected user turns and automatic attention do not advance workflow ordering', async () => {
		const run = await service.startWorkflow(options);
		await timeout(20);
		await execute('report_checkpoint_blocked', { reason: 'Needs user input' }, { turnId: run.assignment!.turnId, toolCallId: 'blocker' });
		getTestAgentStateManager(service).dispatchServerAction(options.session, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		await until(current => current.assignment?.delivery === 'ended');
		service.dispatchAction(options.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'rejected-user', startedAt: new Date().toISOString(),
			message: { text: 'Must be rejected', origin: { kind: MessageKind.User } },
		}, 'another-client', 1);
		await timeout(20);
		assert.deepStrictEqual({
			activityAt: (await service.getWorkflowRun(session))?.activityAt,
			sent: agent.sendMessageCalls.length,
		}, { activityAt: run.activityAt, sent: 1 });
	});

	test('pause uses normal cancellation and retains committed receipts', async () => {
		const run = await service.startWorkflow(options);
		const paused = await service.controlWorkflow({ kind: 'pause', runId: run.id, revision: run.revision });
		await until(current => current.assignment?.delivery === 'ended');
		assert.deepStrictEqual({
			status: paused.status,
			active: getTestAgentStateManager(service).getChatState(options.chat)?.activeTurn,
			aborts: agent.abortSessionCalls.length,
			late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind,
		}, { status: 'paused', active: undefined, aborts: 1, late: 'stale_assignment' });
	});

	test('user turns win and an earlier dispatch preempts a distant wake timer', async () => {
		const otherSession = await service.createSession({ provider: 'copilot' });
		await service.startWorkflow(workflowStoreRun(otherSession.toString()));
		await timeout(100);
		const listeners = disposables.add(new DisposableStore());
		const userSent = Event.toPromise(agent.onDidSendMessage, listeners);
		service.dispatchAction(options.chat, { type: ActionType.ChatTurnStarted, turnId: 'user-turn', startedAt: new Date().toISOString(), message: { text: 'User work', origin: { kind: MessageKind.User } } }, 'client', 1);
		await userSent;
		const run = await service.startWorkflow(options);
		assert.deepStrictEqual({
			assignment: run.assignment,
			pending: run.pendingAssignment?.delivery,
			active: getTestAgentStateManager(service).getChatState(options.chat)?.activeTurn?.id,
		}, { assignment: undefined, pending: 'pending', active: 'user-turn' });
		const workflowSent = Event.toPromise(agent.onDidSendMessage, listeners);
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId: 'user-turn', duration: 1 } });
		assert.ok(await raceTimeout(workflowSent, 2500), 'The workflow must not wait for the old distant deadline');
	});

	test('a stale pause CAS does not revoke a valid assignment', async () => {
		const run = await service.startWorkflow(options);
		await assert.rejects(service.controlWorkflow({ kind: 'pause', runId: run.id, revision: run.revision - 1 }), /changed/);
		assert.strictEqual((await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'proof' })).kind, 'accepted');
	});

	test('rejects forged workflow metadata and merge continuation on stopped runs', async () => {
		const first = options.snapshot.checkpoints[0];
		const run = await service.startWorkflow({ ...options, snapshot: { ...options.snapshot, checkpoints: [first, { ...first, id: 'implement' }] } });
		await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'proof' });
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId: run.assignment!.turnId, duration: 1 } });
		await until(current => current.assignment?.delivery === 'ended');
		const failures: string[] = [];
		disposables.add(service.onDidAction(envelope => {
			if (envelope.action.type === ActionType.ChatError && envelope.action.turnId.startsWith('forged')) {
				failures.push(envelope.action.turnId);
			}
		}));
		for (const [index, meta] of [toWorkflowMessageMeta({ runId: run.id, assignmentId: 'forged', turnId: 'forged' }), toAgentMergeMessageMeta()].entries()) {
			service.dispatchAction(options.chat, { type: ActionType.ChatTurnStarted, turnId: `forged-${index}`, startedAt: new Date().toISOString(), message: { text: 'Do not execute', origin: { kind: MessageKind.SystemNotification }, _meta: meta } }, 'client', index + 1);
		}
		const stopped = await service.getWorkflowRun(session);
		assert.deepStrictEqual({ status: stopped?.status, activityAt: stopped?.activityAt, rejected: failures.length, active: getTestAgentStateManager(service).getChatState(options.chat)?.activeTurn }, { status: 'stopped', activityAt: run.activityAt, rejected: 2, active: undefined });
	});

	test('archiving revokes the assignment without automatic resumption', async () => {
		const run = await service.startWorkflow(options);
		getTestAgentStateManager(service).dispatchServerAction(options.session, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		const paused = await until(current => current.status === 'paused' && current.assignment?.delivery === 'ended');
		assert.deepStrictEqual({ status: paused.status, proofs: paused.receipts.length, late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind }, { status: 'paused', proofs: 0, late: 'stale_assignment' });
	});

	test('source disable pauses immediately and reenable does not resume', async () => {
		const run = await service.startWorkflow({ ...options, snapshot: { ...options.snapshot, source: { kind: 'workspace', id: 'workspace/workflow' } } });
		await service.setWorkflowSourceEnabled('workspace/workflow', false);
		await service.setWorkflowSourceEnabled('workspace/workflow', true);
		const paused = await until(current => current.assignment?.delivery === 'ended');
		assert.deepStrictEqual({ status: paused.status, sent: agent.sendMessageCalls.length, late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind }, { status: 'paused', sent: 1, late: 'stale_assignment' });
		const resumed = await service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision });
		assert.deepStrictEqual({ status: resumed.status, sent: agent.sendMessageCalls.length, reason: resumed.assignment?.reason }, { status: 'running', sent: 2, reason: 'resume' });
	});

	test('extension sources must be reconciled and removals revoke without client history', async () => {
		const source = { kind: 'extension', id: 'example.workflows' } as const;
		const sourced = { ...options, snapshot: { ...options.snapshot, source } };
		await assert.rejects(service.startWorkflow(sourced), /source is disabled/);
		await service.setWorkflowExtensionSources({ [source.id]: true });
		const run = await service.startWorkflow(sourced);
		await service.setWorkflowExtensionSources({});
		const paused = await until(current => current.status === 'paused' && current.assignment?.delivery === 'ended');
		await assert.rejects(service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision }), /source is disabled/);
		await service.setWorkflowExtensionSources({ [source.id]: true });
		assert.deepStrictEqual({
			status: (await service.getWorkflowRun(session))?.status,
			sent: agent.sendMessageCalls.length,
			late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind,
		}, { status: 'paused', sent: 1, late: 'stale_assignment' });
	});

	test('checkpoint extension provenance is enforced independently of the template source', async () => {
		const first = options.snapshot.checkpoints[0];
		await service.setWorkflowExtensionSources({ 'example.template': true, 'example.checkpoint': false });
		await assert.rejects(service.startWorkflow({
			...options,
			snapshot: {
				...options.snapshot, source: { kind: 'extension', id: 'example.template' },
				checkpoints: [{ ...first, type: { ...first.type, source: { kind: 'extension', id: 'Example.Checkpoint' } } }],
			},
		}), /source is disabled/);
	});

	test('a failed extension snapshot write cannot restore revoked execution', async () => {
		service.dispose();
		const resource = URI.file(join(process.cwd(), '.build', `workflow-extension-source-${generateUuid()}`, 'preferences.json'));
		try {
			await createService(resource);
			await service.setWorkflowExtensionSources({ 'example.workflows': true });
			const run = await service.startWorkflow({ ...options, snapshot: { ...options.snapshot, source: { kind: 'extension', id: 'example.workflows' } } });
			await fs.unlink(resource.fsPath);
			await fs.mkdir(resource.fsPath);
			await assert.rejects(service.setWorkflowExtensionSources({}), /EISDIR|EPERM|EACCES/);
			const paused = await until(current => current.status === 'paused' && current.assignment?.delivery === 'ended');
			await assert.rejects(service.setWorkflowExtensionSources({ 'example.workflows': true }), /EISDIR|EPERM|EACCES/);
			await assert.rejects(service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision }), /source is disabled/);
			assert.deepStrictEqual({
				status: paused.status, sent: agent.sendMessageCalls.length,
				late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind,
			}, { status: 'paused', sent: 1, late: 'stale_assignment' });
		} finally {
			service.dispose();
			await fs.rm(dirname(resource.fsPath), { recursive: true, force: true });
		}
	});

	test('source disable rejects a resume while other runs are still being paused', async () => {
		const source = { kind: 'workspace', id: 'workspace/workflow' } as const;
		const run = await service.startWorkflow({ ...options, snapshot: { ...options.snapshot, source } });
		const other = workflowStoreRun((await service.createSession({ provider: 'copilot' })).toString());
		await service.startWorkflow({ ...other, snapshot: { ...other.snapshot, source } });
		const listeners = disposables.add(new DisposableStore());
		const paused = Event.toPromise(Event.filter(service.onDidChangeWorkflowRun, change => change.session === options.session && change.progress?.status === 'paused'), listeners);
		const resume = paused.then(change => service.controlWorkflow({ kind: 'resume', runId: run.id, revision: change.progress!.revision }));
		await Promise.all([
			assert.rejects(resume, /source is disabled/),
			service.setWorkflowSourceEnabled(source.id, false),
		]);
		assert.deepStrictEqual({ status: (await service.getWorkflowRun(session))?.status, sent: agent.sendMessageCalls.length }, { status: 'paused', sent: 2 });
	});

	test('a failed source preference write still revokes and durably pauses the run', async () => {
		service.dispose();
		const resource = URI.file(join(process.cwd(), '.build', `workflow-source-${generateUuid()}`, 'preferences.json'));
		try {
			await createService(resource);
			const run = await service.startWorkflow({ ...options, snapshot: { ...options.snapshot, source: { kind: 'workspace', id: 'workspace/workflow' } } });
			await fs.mkdir(resource.fsPath, { recursive: true });
			await assert.rejects(service.setWorkflowSourceEnabled('workspace/workflow', false), /EISDIR|EPERM|EACCES/);
			const paused = await until(current => current.status === 'paused' && current.assignment?.delivery === 'ended');
			await assert.rejects(service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision }), /source is disabled/);
			await Promise.all([
				assert.rejects(service.setWorkflowSourceEnabled('workspace/workflow', true), /EISDIR|EPERM|EACCES/),
				assert.rejects(service.controlWorkflow({ kind: 'resume', runId: paused.id, revision: paused.revision }), /source is disabled/),
			]);
			assert.deepStrictEqual({
				status: paused.status,
				late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind,
				sent: agent.sendMessageCalls.length,
			}, { status: 'paused', late: 'stale_assignment', sent: 1 });
		} finally {
			service.dispose();
			await fs.rm(dirname(resource.fsPath), { recursive: true, force: true });
		}
	});

	test('disabled checkpoint type sources cannot start a workflow', async () => {
		await service.setWorkflowSourceEnabled('workspace/checkpoint', false);
		const first = options.snapshot.checkpoints[0];
		await assert.rejects(service.startWorkflow({
			...options,
			snapshot: { ...options.snapshot, checkpoints: [{ ...first, type: { ...first.type, source: { kind: 'workspace', id: 'workspace/checkpoint' } } }] },
		}), /source is disabled/);
		assert.deepStrictEqual({ run: await service.getWorkflowRun(session), sent: agent.sendMessageCalls.length }, { run: undefined, sent: 0 });
	});

	test('deletion tombstones the durable run and rejects late proof', async () => {
		const run = await service.startWorkflow(options);
		await service.disposeSession(session);
		assert.deepStrictEqual({ run: await service.getWorkflowRun(session), late: (await execute('prove_checkpoint', { proof: {} }, { turnId: run.assignment!.turnId, toolCallId: 'late' })).kind }, { run: undefined, late: 'stale_assignment' });
	});

	test('deleting the run cannot hand continuation to Agent Merge before session state disappears', async () => {
		const run = await service.startWorkflow(options);
		const turnId = run.assignment!.turnId;
		await execute('prove_checkpoint', { proof: {} }, { turnId, toolCallId: 'proof' });
		agent.fireProgress({ kind: 'action', resource: URI.parse(options.chat), action: { type: ActionType.ChatTurnComplete, turnId, duration: 1 } });
		await until(current => current.assignment?.delivery === 'ended');
		const cleanup: Promise<unknown>[] = [];
		deletionEvents.fire({ session, workingDirectories: undefined, waitUntil: promise => cleanup.push(promise) });
		await Promise.all(cleanup);
		service.dispatchAction(options.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'merge-after-delete', startedAt: new Date().toISOString(),
			message: { text: 'Do not take over', origin: { kind: MessageKind.SystemNotification }, _meta: toAgentMergeMessageMeta() },
		}, 'client', 1);
		assert.deepStrictEqual({
			run: await service.getWorkflowRun(session),
			active: getTestAgentStateManager(service).getChatState(options.chat)?.activeTurn,
			sent: agent.sendMessageCalls.length,
		}, { run: undefined, active: undefined, sent: 1 });
	});

	test('a pre-SDK workflow remains listed and restores its original session after a database restart', async () => {
		service.dispose();
		const directory = join(process.cwd(), '.build', `workflow-cold-${generateUuid()}`);
		await fs.mkdir(directory, { recursive: true });
		const path = join(directory, 'host.db');
		const log = new NullLogService();
		const files = disposables.add(new FileService(log));
		disposables.add(files.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const sessionDatabase = new TestSessionDatabase();
		const fetchFn: typeof globalThis.fetch = async () => new Response('{"message":"Rate limit exceeded"}', { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '900' } });
		const create = (database: AgentHostDatabase) => {
			const host = disposables.add(createTestAgentService(log, files, createSessionDataService(sessionDatabase), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, fetchFn, undefined, undefined, undefined, database));
			const provider = disposables.add(new WorkflowAgent(true));
			registerTestAgentProvider(host, provider);
			return { host, provider };
		};
		const firstDatabase = disposables.add(new AgentHostDatabase(path));
		const first = create(firstDatabase);
		let reopenedDatabase: AgentHostDatabase | undefined;
		let reopened: ReturnType<typeof create> | undefined;
		try {
			first.host.dispatchAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AgentHostWorkflowsEnabledConfigKey]: true } }, 'settings', 1);
			await first.host.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'workflow-test-token' });
			const workingDirectory = URI.file('/work/original-workspace');
			const model = { id: 'chosen-model', config: { reasoning: 'high' } };
			const selectedAgent = { uri: 'file:///agents/reviewer.agent.md' };
			const attachments: MessageAttachment[] = [{ type: MessageAttachmentKind.Simple, label: 'Requirements', modelRepresentation: 'Original context' }];
			const eager = await first.host.createSession({ provider: 'copilot', workingDirectories: [workingDirectory], config: { [SessionConfigKey.AutoApprove]: 'autoApprove' } });
			const initial = workflowStoreRun(eager.toString());
			const checkpoint = initial.snapshot.checkpoints[0];
			const run = await first.host.startWorkflow({
				...initial, model, agent: selectedAgent, attachments, workspace: 'file:///untrusted-client-workspace',
				snapshot: {
					...initial.snapshot,
					checkpoints: [{
						...checkpoint,
						type: {
							...checkpoint.type,
							startCondition: {
								check: 'vscode.github/commit-in-release@1',
								inputs: { repository: { value: 'https://github.com/microsoft/vscode' }, commit: { value: 'a'.repeat(40) } },
								options: { release: 'published-stable' },
							},
						},
					}],
				},
			});
			first.host.dispatchAction(initial.session, { type: ActionType.SessionTitleChanged, title: 'Waiting on release' }, 'user', 1);
			await firstDatabase.workflows.getInitialSession(initial.session);
			await sessionDatabase.setMetadata('configValues', JSON.stringify({ [SessionConfigKey.AutoApprove]: 'default' }));
			first.host.dispose();
			await firstDatabase.close();
			reopenedDatabase = disposables.add(new AgentHostDatabase(path));
			reopened = create(reopenedDatabase);
			const catalog = await reopened.host.listSessions();
			const beforeRestore = {
				resources: catalog.map(entry => entry.session.toString()),
				titles: catalog.map(entry => entry.summary),
				activityAt: catalog.map(entry => readAgentWorkflowProgress(entry)?.activityAt),
				status: catalog.map(entry => readAgentWorkflowProgress(entry)?.status),
				session: getTestAgentStateManager(reopened.host).getSessionState(eager.toString()),
				created: reopened.provider.lastCreateSessionConfig,
				sent: reopened.provider.sendMessageCalls.length,
			};
			await reopened.host.restoreSession(eager);
			const state = getTestAgentStateManager(reopened.host);
			const context = await reopenedDatabase.workflows.claimStartContext(run.id, 'eventual-first-turn');
			assert.deepStrictEqual({
				beforeRestore,
				workingDirectories: reopened.provider.lastCreateSessionConfig?.workingDirectories?.map(directory => directory.toString()),
				model: reopened.provider.lastCreateSessionConfig?.model,
				agent: reopened.provider.lastCreateSessionConfig?.agent,
				approval: state.getSessionState(eager.toString())?.config?.values[SessionConfigKey.AutoApprove],
				turns: state.getChatState(initial.chat)?.turns.map(turn => ({ text: turn.message.text, origin: turn.message.origin.kind, attachments: turn.message.attachments })),
				active: state.getChatState(initial.chat)?.activeTurn,
				sent: reopened.provider.sendMessageCalls.length,
				context,
			}, {
				beforeRestore: { resources: [initial.session], titles: ['Waiting on release'], activityAt: [run.activityAt], status: ['waiting'], session: undefined, created: undefined, sent: 0 },
				workingDirectories: [workingDirectory.toString()], model, agent: selectedAgent, approval: 'default',
				turns: [{ text: initial.task, origin: MessageKind.User, attachments }], active: undefined, sent: 0, context: { model, agent: selectedAgent, attachments },
			});
		} finally {
			first.host.dispose();
			reopened?.host.dispose();
			await firstDatabase.close();
			await reopenedDatabase?.close();
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	test('restart indexes a waiting run without restoring a chat or retaining a provider session', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const nextWakeAt = Date.now() - 1000;
		const waiting: WorkflowRun = {
			...options, status: 'waiting', nextWakeAt,
			pendingAssignment: { id: 'waiting-assignment', checkpointId: 'plan', turnId: 'waiting-turn', attempt: 1, reason: 'start', inputs: {}, createdAt: 1, delivery: 'pending' },
			wait: { kind: 'startCondition', checkpointId: 'plan', reason: 'Waiting for an external event', nextCheckAt: nextWakeAt },
			snapshot: { ...options.snapshot, checkpoints: options.snapshot.checkpoints.map(checkpoint => ({ ...checkpoint, type: { ...checkpoint.type, startCondition: { check: 'vscode.github/pull-request-merged@1' } } })) },
		};
		await database.registerSession(waiting.session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		await database.workflows.createRun(waiting);
		const files = disposables.add(new FileService(new NullLogService()));
		const restored = disposables.add(createTestAgentService(new NullLogService(), files, createSessionDataService(), { _serviceBrand: undefined } as IProductService, createNoopGitService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, database));
		const restoredAgent = disposables.add(new WorkflowAgent());
		restoredAgent.getChatMetadata = async chat => ({ chat, startTime: 7, modifiedTime: 42 });
		registerTestAgentProvider(restored, restoredAgent);
		const catalog = await restored.listSessions();
		assert.deepStrictEqual({
			run: await restored.getWorkflowRun(session),
			catalog: catalog.map(entry => ({ session: entry.session.toString(), startTime: entry.startTime, modifiedTime: entry.modifiedTime, activityAt: readAgentWorkflowProgress(entry)?.activityAt })),
			chat: getTestAgentStateManager(restored).getChatState(options.chat),
			session: getTestAgentStateManager(restored).getSessionState(options.session),
			sent: restoredAgent.sendMessageCalls.length,
		}, { run: waiting, catalog: [{ session: options.session, startTime: 7, modifiedTime: 42, activityAt: waiting.activityAt }], chat: undefined, session: undefined, sent: 0 });
	});
});
