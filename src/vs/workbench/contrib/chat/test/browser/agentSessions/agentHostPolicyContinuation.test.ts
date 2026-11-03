/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentCreateSessionConfig } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostSavedChatWorkspace, IAgentHostSavedChat, IAgentHostSavedChatContinuation } from '../../../../../../platform/agentHost/common/agentHostSavedChat.js';
import { AgentHostClaudeAgentEnabledSettingId, AgentHostCodexAgentEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { INotification, NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, ChatOriginKind, MessageKind, ResponsePartKind, ROOT_STATE_URI, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { createFileSystemProviderError, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { COPILOT_SANDBOX_ENABLED_KEY, IManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { AgentHostPolicyContinuationService, IAgentHostPolicyContinuationPresenter } from '../../../browser/agentSessions/agentHost/agentHostPolicyContinuation.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatModel, IChatModelInputState, IChatRequestModel, IChatResponseModel, IInputModel } from '../../../common/model/chatModel.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';

suite('Agent Host policy continuation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const target = URI.parse('agent-host-copilotcli:/copy');
	const targetBackend = URI.parse('ahp-session:/copy');
	const folder = URI.file('/workspace');
	const managed = URI.file('/workspace/.worktrees/original');
	const attachment = { kind: 'file' as const, id: 'context', name: 'file.txt', value: URI.file('/workspace/file.txt') };

	function setup(options: { provider?: 'claude' | 'codex'; workspace?: AgentHostSavedChatWorkspace; savedDraft?: string; emptyInput?: boolean; missingInputState?: boolean; emptyHistory?: boolean; inProgress?: boolean; availability?: IAgentHostSavedChat['availability']; origin?: IAgentHostSavedChat['origin']; completionSupported?: boolean } = {}) {
		const services = store.add(new TestInstantiationService());
		const notifications = store.add(new Emitter<INotification>());
		const source = URI.from({ scheme: `agent-host-${options.provider ?? 'claude'}`, path: '/source' });
		const backend = URI.parse('ahp-session:/source');
		const request = upcastPartial<IChatRequestModel>({
			message: { text: 'Original question', parts: [] },
			response: upcastPartial<IChatResponseModel>({ entireResponse: upcastPartial<IChatResponseModel['entireResponse']>({ value: [{ kind: 'markdownContent', content: new MarkdownString('Original answer') }] }) }),
		});
		const saved: IAgentHostSavedChat = {
			session: backend,
			chat: URI.parse(buildDefaultChatUri(backend)),
			provider: options.provider ?? 'claude',
			identity: 'source-read-identity',
			availability: options.availability ?? { kind: 'available' },
			origin: options.origin,
			title: 'Saved conversation',
			turns: options.emptyHistory ? [] : [{ id: 'turn', message: { text: 'Original question', origin: { kind: MessageKind.User } }, responseParts: [{ kind: ResponsePartKind.Markdown, id: 'reply', content: 'Original answer' }], state: TurnState.Complete, usage: undefined }],
			draft: { text: options.savedDraft ?? 'Saved draft', origin: { kind: MessageKind.User } },
			workspace: options.workspace ?? { kind: 'folder', workingDirectories: [folder] },
		};
		let sourceHistoryLoaded = true;
		const sourceModel = upcastPartial<IChatModel>({
			sessionResource: source,
			getRequests: () => options.emptyHistory || !sourceHistoryLoaded ? [] : [request],
			requestInProgress: constObservable(!!options.inProgress),
			isReadOnly: constObservable(true),
			inputModel: upcastPartial<IInputModel>({ state: constObservable(undefined) }),
		});
		let copiedDraft: Partial<IChatModelInputState> | undefined;
		const state = {
			visible: true,
			sourceRegistered: true,
			available: true,
			trusted: true,
			readFailure: false,
			createFailure: false,
			completionFailure: false,
			archived: false,
			managedPolicy: true,
			providerDisabled: true,
			openFailure: false,
			opened: false,
			destinationVisible: true,
			historyLoaded: true,
			cancelDuringCreate: false,
			destinationDeleted: false,
			openCalls: 0,
			readCalls: 0,
			disposedModels: 0,
			draftWrites: 0,
			trustPrompts: 0,
			workspaceChoices: 0,
			get draft() { return copiedDraft; },
			set draft(value: Partial<IChatModelInputState> | undefined) { copiedDraft = value; },
		};
		const input = options.emptyInput ? '' : 'Unsent follow-up';
		const sourceWidget = upcastPartial<IChatWidget>({
			get visible() { return state.visible; },
			viewModel: upcastPartial<ChatViewModel>({ sessionResource: source, model: sourceModel }),
			getInput: () => input,
			getInputState: () => options.missingInputState ? undefined : upcastPartial<IChatModelInputState>({ inputText: input, attachments: options.emptyInput ? [] : [attachment], selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 4, positionLineNumber: 1, positionColumn: 4 }] }),
		});
		const targetInput = observableValue<IChatModelInputState | undefined>('destinationInput', undefined);
		const targetModel = upcastPartial<IChatModel>({
			sessionResource: target,
			getRequests: () => state.historyLoaded && !options.emptyHistory ? [request] : [],
			inputModel: upcastPartial<IInputModel>({ state: targetInput, setState: draft => { state.draft = draft; state.draftWrites++; targetInput.set(upcastPartial<IChatModelInputState>({ ...targetInput.get(), ...draft }), undefined); } }),
		});
		const targetWidget = upcastPartial<IChatWidget>({ get visible() { return state.opened && state.destinationVisible; }, viewModel: upcastPartial<ChatViewModel>({ model: targetModel, sessionResource: target }), focusInput: () => { } });
		const created: IAgentCreateSessionConfig[] = [];
		const completions: (IAgentHostSavedChatContinuation & { opened: boolean; draft: string | undefined })[] = [];
		services.stub(IAgentHostService, {
			initializeResult: constObservable({ protocolVersion: '0.9.0', serverSeq: 0, snapshots: [], _meta: { 'vscode.completeSavedChatContinuation': options.completionSupported !== false } }),
			completeSavedChatContinuation: async request => {
				completions.push({ ...request, opened: state.opened, draft: state.draft?.inputText });
				if (state.completionFailure) { throw new Error('Archive failed'); }
				state.archived = true;
				return { archived: true };
			},
			onDidNotification: notifications.event,
			listSessions: async () => [{ session: backend, provider: saved.provider, startTime: 0, modifiedTime: 0 }],
			readSavedChat: async () => {
				state.readCalls++;
				if (state.readFailure) { throw new Error('Saved history missing'); }
				const availability: IAgentHostSavedChat['availability'] = state.archived
					? state.destinationDeleted ? { kind: 'archived' } : { kind: 'continued', destination: targetBackend }
					: saved.availability;
				return { ...saved, availability };
			},
			createSession: async config => {
				assert.ok(config);
				created.push(config);
				if (state.createFailure) { throw new Error('Import failed'); }
				state.destinationDeleted = false;
				targetInput.set(undefined, undefined);
				if (state.cancelDuringCreate) { state.visible = false; }
				return targetBackend;
			},
			dispatch: () => assert.fail('Continuation must not dispatch to the source'),
			getSubscription: () => assert.fail('Continuation must not subscribe to the source'),
			disposeSession: async () => assert.fail('Continuation must not delete a conversation'),
		});
		services.stub(IAgentHostConnectionsService, { registerSessionResource: (_backend, _authority, provider) => provider === 'copilotcli' ? target : source });
		services.stub(IChatSessionsService, { canResolveChatSession: async () => state.available });
		services.stub(IChatWidgetService, { getWidgetBySessionResource: resource => resource.toString() === source.toString() ? state.sourceRegistered ? sourceWidget : undefined : state.opened ? targetWidget : undefined });
		services.stub(IChatService, {
			acquireOrLoadSession: async () => {
				if (state.destinationDeleted) { throw new Error('Copied conversation was deleted'); }
				return { object: targetModel, dispose: () => state.disposedModels++ };
			},
			sendRequest: async () => assert.fail('Continuation must not send a prompt'),
		});
		services.stub(IAgentHostPolicyContinuationPresenter, {
			open: async () => {
				state.openCalls++;
				if (state.openFailure) { throw new Error('Open failed'); }
				state.opened = true;
			}
		});
		services.stub(IQuickInputService, { pick: async () => { state.workspaceChoices++; return undefined; } });
		services.stub(IFileDialogService, { showOpenDialog: async () => [folder] });
		services.stub(IFileService, { realpath: async uri => uri });
		services.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		services.stub(IWorkspaceTrustManagementService, { getUriTrustInfo: async uri => ({ uri, trusted: state.trusted }) });
		services.stub(IWorkspaceTrustRequestService, { requestResourcesTrust: async () => { state.trustPrompts++; return false; } });
		const configuration = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				const value = super.inspect<T>(key);
				return { ...value, policyValue: state.providerDisabled && (key === AgentHostClaudeAgentEnabledSettingId || key === AgentHostCodexAgentEnabledSettingId) ? value.value : undefined };
			}
		}({ [AgentHostClaudeAgentEnabledSettingId]: false, [AgentHostCodexAgentEnabledSettingId]: false });
		store.add(configuration.onDidChangeConfigurationEmitter);
		services.stub(IConfigurationService, configuration);
		services.stub(IManagedSettingsService, { getManagedSettings: () => ({}), getManagedSettingValue: key => key === COPILOT_SANDBOX_ENABLED_KEY && state.managedPolicy ? true : undefined });
		let coordinator: AgentHostPolicyContinuationService | undefined;
		return { services, source, sourceModel, sourceWidget, targetModel, targetInput, state, saved, created, completions, notifications, setSourceHistoryLoaded: (value: boolean) => { sourceHistoryLoaded = value; }, run: (trigger: 'manual' | 'automatic' = 'manual') => (coordinator ??= store.add(services.createInstance(AgentHostPolicyContinuationService))).continueInCopilot(source, trigger) };
	}

	test('completes and archives only after the copied conversation and draft are presented', async () => {
		const { run, state, completions } = setup();
		state.openFailure = true;
		await assert.rejects(run(), /Open failed/);
		const beforePresentation = completions.length;
		state.openFailure = false;
		await run();
		assert.deepStrictEqual({ beforePresentation, completed: completions.map(completion => ({ destination: completion.destination.toString(), opened: completion.opened, draft: completion.draft })) }, {
			beforePresentation: 0,
			completed: [{ destination: targetBackend.toString(), opened: true, draft: 'Unsent follow-up' }],
		});
	});

	test('hands off the draft before awaiting the first presentation', async () => {
		const { run, services, state } = setup();
		let presentedDraft: Partial<IChatModelInputState> | undefined;
		services.stub(IAgentHostPolicyContinuationPresenter, {
			open: async () => {
				presentedDraft = state.draft;
				state.opened = true;
			},
		});
		await run();
		assert.deepStrictEqual(presentedDraft, { inputText: 'Unsent follow-up', attachments: [attachment], selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 4, positionLineNumber: 1, positionColumn: 4 }] });
	});

	for (const provider of ['claude', 'codex'] as const) {
		test(`automatically continues ${provider} only under the required managed policy`, async () => {
			const { run, state, created, completions } = setup({ provider });
			state.managedPolicy = false;
			await assert.rejects(run('automatic'), CancellationError);
			const withoutManagedPolicy = created.length;
			state.managedPolicy = true;
			state.providerDisabled = false;
			await assert.rejects(run('automatic'), CancellationError);
			const withoutProviderPolicy = created.length;
			state.providerDisabled = true;
			await run('automatic');
			assert.deepStrictEqual({ withoutManagedPolicy, withoutProviderPolicy, title: created[0].importConversation?.title, completed: completions.length, archived: state.archived }, {
				withoutManagedPolicy: 0, withoutProviderPolicy: 0, title: 'Saved conversation', completed: 1, archived: true,
			});
		});

		test(`copies ${provider} history and unsent input without changing the source`, async () => {
			const { run, created, state, sourceModel, sourceWidget } = setup({ provider });
			await run();
			assert.deepStrictEqual({
				provider: created[0].provider,
				folders: created[0].workingDirectories?.map(uri => uri.toString()),
				config: created[0].config,
				title: created[0].importConversation?.title,
				turns: created[0].importConversation?.turns.map(turn => ({ question: turn.message.text, answers: turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content) })),
				draft: state.draft,
				source: { requests: sourceModel.getRequests().length, draft: sourceWidget.getInput() },
			}, {
				provider: 'copilotcli', folders: [folder.toString()], config: { isolation: 'folder' }, title: 'Saved conversation',
				turns: [{ question: 'Original question', answers: ['Original answer'] }],
				draft: { inputText: 'Unsent follow-up', attachments: [attachment], selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 4, positionLineNumber: 1, positionColumn: 4 }] },
				source: { requests: 1, draft: 'Unsent follow-up' },
			});
		});
	}

	for (const scenario of ['archived', 'tool', 'empty', 'older-host'] as const) {
		test(`keeps ${scenario} conversations available for manual continuation`, async () => {
			const { run, state, created, completions } = setup({
				availability: scenario === 'archived' ? { kind: 'archived' } : undefined,
				origin: scenario === 'tool' ? { kind: ChatOriginKind.Tool, chat: 'ahp-chat:/source/parent', toolCallId: 'tool-call' } : undefined,
				emptyHistory: scenario === 'empty',
				completionSupported: scenario !== 'older-host',
			});
			await assert.rejects(run('automatic'), CancellationError);
			const automaticImports = created.length;
			await run();
			assert.deepStrictEqual({ automaticImports, manualImports: created.length, opened: state.opened, completed: completions.length, archived: state.archived }, {
				automaticImports: 0, manualImports: 1, opened: true, completed: scenario === 'older-host' ? 0 : 1, archived: scenario !== 'older-host',
			});
		});
	}

	test('reopens a completed destination without importing or overwriting its draft', async () => {
		const { run, targetInput, state, created, completions } = setup({ availability: { kind: 'continued', destination: targetBackend } });
		targetInput.set(upcastPartial<IChatModelInputState>({ inputText: 'Existing Copilot input', attachments: [attachment] }), undefined);
		await assert.rejects(run('automatic'), CancellationError);
		await run();
		assert.deepStrictEqual({ imports: created.length, opened: state.opened, input: targetInput.get()?.inputText, writes: state.draftWrites, completion: completions[0]?.destination.toString() }, {
			imports: 0, opened: true, input: 'Existing Copilot input', writes: 0, completion: targetBackend.toString(),
		});
	});

	test('copies the saved transcript that owns the completion identity', async () => {
		const { run, services, saved, created, completions } = setup();
		services.stub(IAgentHostService, 'readSavedChat', async () => ({
			...saved,
			identity: 'authoritative-snapshot',
			turns: [{
				...saved.turns[0],
				message: { text: 'Saved authoritative question', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'persisted-answer', content: 'Saved authoritative answer' }],
			}],
		}));
		await run();
		assert.deepStrictEqual({ questions: created[0].importConversation?.turns.map(turn => turn.message.text), parts: created[0].importConversation?.turns[0].responseParts, identity: completions[0].identity }, {
			questions: ['Saved authoritative question'], parts: [{ kind: ResponsePartKind.Markdown, id: 'persisted-answer', content: 'Saved authoritative answer' }], identity: 'authoritative-snapshot',
		});
	});

	test('fresh source history does not reuse or acknowledge an older cached copy', async () => {
		const { run, services, saved, created, completions } = setup();
		await run();
		services.stub(IAgentHostService, 'readSavedChat', async () => ({
			...saved,
			identity: 'changed-history',
			turns: [{ ...saved.turns[0], message: { text: 'Changed original question', origin: { kind: MessageKind.User } } }],
		}));
		await run('automatic');
		assert.deepStrictEqual({
			copiedQuestions: created.map(config => config.importConversation?.turns.map(turn => turn.message.text)),
			acknowledged: completions.map(completion => completion.identity),
		}, {
			copiedQuestions: [['Original question'], ['Changed original question']],
			acknowledged: ['source-read-identity', 'changed-history'],
		});
	});

	test('does not complete an open that leaves the destination hidden', async () => {
		const { run, state, created, completions } = setup();
		state.destinationVisible = false;
		await assert.rejects(run(), /Couldn't continue/);
		const incomplete = { completions: completions.length, archived: state.archived };
		state.destinationVisible = true;
		await run();
		assert.deepStrictEqual({ incomplete, imports: created.length, completed: completions.length, writes: state.draftWrites }, {
			incomplete: { completions: 0, archived: false }, imports: 1, completed: 1, writes: 1,
		});
	});

	test('waits for the full source history before importing it', async () => {
		const { run, setSourceHistoryLoaded, created, state } = setup();
		setSourceHistoryLoaded(false);
		await assert.rejects(run('automatic'), /hasn't finished loading/);
		const incompleteImports = created.length;
		setSourceHistoryLoaded(true);
		await run();
		assert.deepStrictEqual({ incompleteImports, history: created[0].importConversation?.turns.map(turn => turn.message.text), opened: state.opened }, {
			incompleteImports: 0, history: ['Original question'], opened: true,
		});
	});

	test('defers an automatic managed-checkout choice to the manual action', async () => {
		const { run, state, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		await assert.rejects(run('automatic'), CancellationError);
		const automatic = { choices: state.workspaceChoices, imports: created.length };
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		await run();
		assert.deepStrictEqual({ automatic, directories: created[0].workingDirectories?.map(uri => uri.toString()), opened: state.opened }, {
			automatic: { choices: 0, imports: 0 }, directories: [folder.toString()], opened: true,
		});
	});

	test('defers a new trust prompt to the manual action', async () => {
		const { run, state, services, created } = setup();
		state.trusted = false;
		await assert.rejects(run('automatic'), CancellationError);
		const automatic = { prompts: state.trustPrompts, imports: created.length };
		services.stub(IWorkspaceTrustRequestService, 'requestResourcesTrust', async () => { state.trustPrompts++; return true; });
		await run();
		assert.deepStrictEqual({ automatic, prompts: state.trustPrompts, title: created[0].importConversation?.title, opened: state.opened }, {
			automatic: { prompts: 0, imports: 0 }, prompts: 1, title: 'Saved conversation', opened: true,
		});
	});

	for (const failure of ['openFailure', 'completionFailure'] as const) {
		test(`does not reseed a deliberately cleared destination draft after ${failure}`, async () => {
			const { run, state, targetInput, created } = setup();
			state[failure] = true;
			await assert.rejects(run(), failure === 'openFailure' ? /Open failed/ : /Archive failed/);
			const copied = state.draft;
			targetInput.set(upcastPartial<IChatModelInputState>({ inputText: '', attachments: [], selections: [] }), undefined);
			state[failure] = false;
			await run();
			assert.deepStrictEqual({ copied, imports: created.length, writes: state.draftWrites, input: targetInput.get()?.inputText, attachments: targetInput.get()?.attachments, archived: state.archived }, {
				copied: { inputText: 'Unsent follow-up', attachments: [attachment], selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 4, positionLineNumber: 1, positionColumn: 4 }] },
				imports: 1, writes: 1, input: '', attachments: [], archived: true,
			});
		});
	}

	test('does not copy when the source moves during its saved read', async () => {
		const { run, state, services, saved, created } = setup();
		services.stub(IAgentHostService, 'readSavedChat', async () => { state.visible = false; return saved; });
		await assert.rejects(run('automatic'), CancellationError);
		const movedImports = created.length;
		state.visible = true;
		services.stub(IAgentHostService, 'readSavedChat', async () => saved);
		await run();
		assert.deepStrictEqual({ movedImports, imports: created.length, opened: state.opened }, { movedImports: 0, imports: 1, opened: true });
	});

	test('retains the prepared copy when its source widget is disposed during loading', async () => {
		const { run, state, services, targetModel, created, completions } = setup();
		let removeSource = true;
		services.stub(IChatService, 'acquireOrLoadSession', async () => {
			if (removeSource) { state.sourceRegistered = false; }
			return { object: targetModel, dispose: () => state.disposedModels++ };
		});
		await assert.rejects(run('automatic'), CancellationError);
		const cancelled = { opened: state.opened, completions: completions.length };
		removeSource = false;
		state.sourceRegistered = true;
		await run();
		assert.deepStrictEqual({ cancelled, imports: created.length, opened: state.opened, draft: state.draft?.inputText }, {
			cancelled: { opened: false, completions: 0 }, imports: 1, opened: true, draft: 'Unsent follow-up',
		});
	});

	test('an empty hidden input does not overwrite the persisted draft', async () => {
		const { run, state } = setup({ emptyInput: true, missingInputState: true, savedDraft: 'Cold saved draft' });
		await run();
		assert.deepStrictEqual(state.draft, { inputText: 'Cold saved draft', attachments: [], selections: [] });
	});

	test('preserves explicitly cleared input instead of restoring an older saved draft', async () => {
		const { run, state } = setup({ emptyInput: true, savedDraft: 'An older saved draft' });
		await run();
		assert.strictEqual(state.draft?.inputText, '');
	});

	test('captures history after the saved read settles', async () => {
		const { run, services, saved, setSourceHistoryLoaded, created } = setup();
		setSourceHistoryLoaded(false);
		services.stub(IAgentHostService, 'readSavedChat', async () => {
			setSourceHistoryLoaded(true);
			return saved;
		});
		await run();
		assert.deepStrictEqual(created[0].importConversation?.turns.map(turn => turn.message.text), ['Original question']);
	});

	test('preserves workspaceless intent', async () => {
		const { run, created } = setup({ workspace: { kind: 'none' } });
		await run();
		assert.strictEqual(created[0].workingDirectories, undefined);
	});

	test('a valid empty history can continue without a dummy prompt', async () => {
		const { run, created, state } = setup({ emptyHistory: true });
		await run();
		assert.deepStrictEqual({ turns: created[0].importConversation?.turns, opened: state.opened }, { turns: [], opened: true });
	});

	for (const failure of ['readFailure', 'createFailure', 'available', 'trusted'] as const) {
		test(`preserves the source when ${failure} prevents continuation`, async () => {
			const { run, created, state, sourceWidget } = setup();
			state[failure] = failure === 'readFailure' || failure === 'createFailure';
			if (failure === 'trusted') { await run(); } else { await assert.rejects(run()); }
			assert.deepStrictEqual({ imports: created.length, opened: state.opened, draft: state.draft, sourceDraft: sourceWidget.getInput() }, { imports: failure === 'createFailure' ? 1 : 0, opened: false, draft: undefined, sourceDraft: 'Unsent follow-up' });
		});
	}

	test('retries opening a persisted copy without importing it again', async () => {
		const { run, created, state } = setup();
		state.openFailure = true;
		await assert.rejects(run(), /Open failed/);
		state.openFailure = false;
		await run();
		assert.deepStrictEqual({ imports: created.length, opens: state.openCalls, disposedModels: state.disposedModels, draft: state.draft?.inputText }, { imports: 1, opens: 2, disposedModels: 2, draft: 'Unsent follow-up' });
	});

	test('does not apply a draft until the imported history has loaded', async () => {
		const { run, created, state } = setup();
		state.historyLoaded = false;
		await assert.rejects(run(), /hasn't loaded/);
		assert.deepStrictEqual({ opened: state.opened, draft: state.draft }, { opened: false, draft: undefined });
		state.historyLoaded = true;
		await run();
		assert.strictEqual(created.length, 1);
	});

	test('an open retry preserves a draft edited independently in the copied conversation', async () => {
		const { run, state, targetInput } = setup();
		state.openFailure = true;
		await assert.rejects(run(), /Open failed/);
		targetInput.set(upcastPartial<IChatModelInputState>({ inputText: 'A newer draft in Copilot', attachments: [] }), undefined);
		state.openFailure = false;
		await run();
		assert.deepStrictEqual({ input: targetInput.get()?.inputText, writes: state.draftWrites }, { input: 'A newer draft in Copilot', writes: 1 });
	});

	test('preserves independently added destination attachments before its first presentation', async () => {
		const { run, services, state, targetInput, targetModel, completions } = setup();
		const newerAttachment = { kind: 'file' as const, id: 'new-context', name: 'new.txt', value: URI.file('/workspace/new.txt') };
		services.stub(IChatService, 'acquireOrLoadSession', async () => {
			targetInput.set(upcastPartial<IChatModelInputState>({ inputText: '', attachments: [newerAttachment] }), undefined);
			return { object: targetModel, dispose: () => state.disposedModels++ };
		});
		await run();
		assert.deepStrictEqual({ opened: state.opened, completed: completions.length, writes: state.draftWrites, attachments: targetInput.get()?.attachments }, {
			opened: true, completed: 1, writes: 0, attachments: [newerAttachment],
		});
	});

	test('shares concurrent continuation attempts', async () => {
		const { run, services, created, state } = setup();
		const opening = new DeferredPromise<void>();
		services.stub(IAgentHostPolicyContinuationPresenter, { open: async () => { await opening.p; state.opened = true; } });
		const first = run();
		const second = run();
		assert.strictEqual(first, second);
		opening.complete();
		await first;
		assert.strictEqual(created.length, 1);
	});

	test('reopening a successful copy does not overwrite its newer draft', async () => {
		const { run, state, created } = setup();
		await run();
		state.draft = { inputText: 'New destination draft' };
		await run();
		assert.deepStrictEqual({ imports: created.length, draft: state.draft }, { imports: 1, draft: { inputText: 'New destination draft' } });
	});

	test('reuses a successful copy on a host without completion support', async () => {
		const { run, state, created, completions } = setup({ completionSupported: false });
		await run();
		state.draft = { inputText: 'New destination draft' };
		await run();
		assert.deepStrictEqual({ imports: created.length, completions: completions.length, draft: state.draft }, {
			imports: 1, completions: 0, draft: { inputText: 'New destination draft' },
		});
	});

	test('creates another copy only when its previous destination was deleted', async () => {
		const { run, state, created, sourceWidget, notifications } = setup();
		await run();
		notifications.fire({ type: NotificationType.SessionRemoved, channel: ROOT_STATE_URI, session: 'ahp-session:/unrelated' });
		state.draft = { inputText: 'New destination draft' };
		await run();
		assert.deepStrictEqual({ imports: created.length, draft: state.draft }, { imports: 1, draft: { inputText: 'New destination draft' } });
		state.destinationDeleted = true;
		state.opened = false;
		notifications.fire({ type: NotificationType.SessionRemoved, channel: ROOT_STATE_URI, session: targetBackend.toString() });
		await run();
		assert.deepStrictEqual({ imports: created.length, opened: state.opened, draft: state.draft?.inputText, sourceDraft: sourceWidget.getInput() }, { imports: 2, opened: true, draft: 'Unsent follow-up', sourceDraft: 'Unsent follow-up' });
	});

	test('recovers a deleted completed copy when its removal notification was missed', async () => {
		const { run, state, created, completions, sourceWidget } = setup();
		await run();
		state.destinationDeleted = true;
		state.opened = false;
		await assert.rejects(run('automatic'), CancellationError);
		const automaticImports = created.length;
		await run();
		assert.deepStrictEqual({ automaticImports, imports: created.length, completions: completions.length, opened: state.opened, draft: state.draft?.inputText, sourceDraft: sourceWidget.getInput() }, {
			automaticImports: 1, imports: 2, completions: 2, opened: true, draft: 'Unsent follow-up', sourceDraft: 'Unsent follow-up',
		});
	});

	test('does not cache a destination deleted while it is opening', async () => {
		const { run, services, state, created, notifications } = setup();
		let deleted = false;
		services.stub(IAgentHostPolicyContinuationPresenter, {
			open: async () => {
				state.opened = true;
				if (!deleted) {
					deleted = true;
					notifications.fire({ type: NotificationType.SessionRemoved, channel: ROOT_STATE_URI, session: targetBackend.toString() });
				}
			}
		});
		await assert.rejects(run());
		await run();
		assert.deepStrictEqual({ imports: created.length, opened: state.opened }, { imports: 2, opened: true });
	});

	test('retains a created destination if the user switches away during import', async () => {
		const { run, state, created } = setup();
		state.cancelDuringCreate = true;
		await assert.rejects(run(), CancellationError);
		state.visible = true;
		await run();
		assert.deepStrictEqual({ imports: created.length, opened: state.opened }, { imports: 1, opened: true });
	});

	test('requires a workspace choice for a managed source checkout', async () => {
		const { run, state, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		await run();
		assert.deepStrictEqual({ imports: created.length, opened: state.opened }, { imports: 0, opened: false });
	});

	test('copies a managed conversation into explicitly chosen project folders', async () => {
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		await run();
		assert.deepStrictEqual(created[0].workingDirectories?.map(uri => uri.toString()), [folder.toString()]);
	});

	for (const [kind, missing] of [
		['native', Object.assign(new Error('Removed checkout'), { code: 'ENOENT' })],
		['provider', createFileSystemProviderError('Removed checkout', FileSystemProviderErrorCode.FileNotFound)],
		['operation', new FileOperationError('Removed checkout', FileOperationResult.FILE_NOT_FOUND)],
	] as const) {
		test(`continues an archived conversation after its source checkout was removed (${kind})`, async () => {
			const canonicalFolder = URI.file('/real/workspace');
			const { run, services, created, sourceWidget } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
			services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
			services.stub(IFileService, {
				realpath: async uri => {
					if (uri.path.startsWith('/workspace/.worktrees')) {
						throw missing;
					}
					return uri.toString() === folder.toString() ? canonicalFolder : uri;
				}
			});
			await run();
			assert.deepStrictEqual({ directories: created[0].workingDirectories?.map(uri => uri.toString()), sourceDraft: sourceWidget.getInput() }, { directories: [canonicalFolder.toString()], sourceDraft: 'Unsent follow-up' });
		});
	}

	test('retains ownership exclusion through a symlinked parent of a removed checkout', async () => {
		const canonicalFolder = URI.file('/real/workspace');
		const recreatedChild = URI.joinPath(canonicalFolder, '.worktrees/original/subfolder');
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'browse', label: 'Choose Another Folder...' });
		services.stub(IFileDialogService, { showOpenDialog: async () => [recreatedChild] });
		services.stub(IFileService, {
			realpath: async uri => {
				if (uri.path.startsWith('/workspace/.worktrees')) {
					throw createFileSystemProviderError('Removed checkout', FileSystemProviderErrorCode.FileNotFound);
				}
				return uri.toString() === folder.toString() ? canonicalFolder : uri;
			}
		});
		await assert.rejects(run(), /outside the original session's managed checkout/);
		assert.deepStrictEqual(created, []);
	});

	test('deduplicates canonical project folders selected for managed continuation', async () => {
		const alias = URI.file('/workspace-alias');
		const second = URI.file('/second-project');
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder, second, alias, folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		services.stub(IFileService, { realpath: async uri => uri.toString() === alias.toString() ? folder : uri });
		await run();
		assert.deepStrictEqual(created[0].workingDirectories?.map(uri => uri.toString()), [folder.toString(), second.toString()]);
	});

	test('does not mistake an inaccessible owned checkout for a removed checkout', async () => {
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		services.stub(IFileService, {
			realpath: async uri => {
				if (uri.toString() === managed.toString()) {
					throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
				}
				return uri;
			}
		});
		await assert.rejects(run(), /Access denied/);
		assert.deepStrictEqual(created, []);
	});

	test('requires realpath support for owned checkouts even when the target resolves', async () => {
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		services.stub(IFileService, { realpath: async uri => uri.toString() === managed.toString() ? undefined : uri });
		await assert.rejects(run(), /verify the selected workspace/);
		assert.deepStrictEqual(created, []);
	});

	test('requires the selected target to exist instead of resolving its parent', async () => {
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		services.stub(IFileService, {
			realpath: async uri => {
				if (uri.toString() === folder.toString()) {
					throw createFileSystemProviderError('Selected folder is missing', FileSystemProviderErrorCode.FileNotFound);
				}
				return uri;
			}
		});
		await assert.rejects(run(), /Selected folder is missing/);
		assert.deepStrictEqual(created, []);
	});

	test('does not continue if the user leaves during removed-checkout resolution', async () => {
		const { run, services, state, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		services.stub(IFileService, {
			realpath: async uri => {
				if (uri.toString() === managed.toString()) {
					state.visible = false;
					throw createFileSystemProviderError('Removed checkout', FileSystemProviderErrorCode.FileNotFound);
				}
				return uri;
			}
		});
		await assert.rejects(run(), CancellationError);
		assert.deepStrictEqual(created, []);
	});

	test('rejects choosing the original managed checkout or its descendant', async () => {
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [folder, managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'browse', label: 'Choose Another Folder...' });
		services.stub(IFileDialogService, { showOpenDialog: async () => [URI.joinPath(managed, 'subfolder')] });
		await assert.rejects(run(), /outside the original session's managed checkout/);
		assert.strictEqual(created.length, 0);
	});

	test('rejects a symlink alias into the original managed checkout', async () => {
		const alias = URI.file('/another/path');
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'browse', label: 'Choose Another Folder...' });
		services.stub(IFileDialogService, { showOpenDialog: async () => [alias] });
		services.stub(IFileService, { realpath: async uri => uri.toString() === alias.toString() ? URI.joinPath(managed, 'subfolder') : uri });
		await assert.rejects(run(), /outside the original session's managed checkout/);
		assert.deepStrictEqual(created, []);
	});

	test('does not assume an unresolved target is independent of the managed checkout', async () => {
		const { run, services, created } = setup({ workspace: { kind: 'managed', workingDirectories: [managed], managedDirectories: [managed], suggestedDirectories: [folder] } });
		services.stub(IQuickInputService, 'pick', { id: 'project', label: 'Use Project Folders' });
		services.stub(IFileService, { realpath: async () => undefined });
		await assert.rejects(run(), /verify the selected workspace/);
		assert.deepStrictEqual(created, []);
	});

	test('does not copy an in-progress source', async () => {
		const { run, created } = setup({ inProgress: true });
		await assert.rejects(run());
		assert.deepStrictEqual(created, []);
	});
});
