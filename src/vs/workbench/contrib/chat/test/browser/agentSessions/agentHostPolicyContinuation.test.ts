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
import { AgentHostSavedChatWorkspace, IAgentHostSavedChat } from '../../../../../../platform/agentHost/common/agentHostSavedChat.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { INotification, NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, ResponsePartKind, ROOT_STATE_URI, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { createFileSystemProviderError, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
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

	function setup(options: { provider?: 'claude' | 'codex'; workspace?: AgentHostSavedChatWorkspace; savedDraft?: string; emptyInput?: boolean; missingInputState?: boolean; emptyHistory?: boolean; inProgress?: boolean } = {}) {
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
			available: true,
			trusted: true,
			readFailure: false,
			createFailure: false,
			openFailure: false,
			opened: false,
			historyLoaded: true,
			cancelDuringCreate: false,
			destinationDeleted: false,
			openCalls: 0,
			readCalls: 0,
			disposedModels: 0,
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
			inputModel: upcastPartial<IInputModel>({ state: targetInput, setState: draft => { state.draft = draft; } }),
		});
		const targetWidget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<ChatViewModel>({ model: targetModel, sessionResource: target }), focusInput: () => { } });
		const created: IAgentCreateSessionConfig[] = [];
		const completions: { session: URI; chat: URI; identity: string; destination: URI; opened: boolean; draft: string | undefined }[] = [];
		services.stub(IAgentHostService, {
			...{
				completeSavedChatContinuation: async (request: { session: URI; chat: URI; identity: string; destination: URI }) => {
					completions.push({ ...request, opened: state.opened, draft: state.draft?.inputText });
					return { archived: true };
				},
			},
			onDidNotification: notifications.event,
			listSessions: async () => [{ session: backend, provider: saved.provider, startTime: 0, modifiedTime: 0 }],
			readSavedChat: async () => {
				state.readCalls++;
				if (state.readFailure) { throw new Error('Saved history missing'); }
				return saved;
			},
			createSession: async config => {
				assert.ok(config);
				created.push(config);
				if (state.createFailure) { throw new Error('Import failed'); }
				state.destinationDeleted = false;
				if (state.cancelDuringCreate) { state.visible = false; }
				return targetBackend;
			},
			dispatch: () => assert.fail('Continuation must not dispatch to the source'),
			getSubscription: () => assert.fail('Continuation must not subscribe to the source'),
			disposeSession: async () => assert.fail('Continuation must not delete a conversation'),
		});
		services.stub(IAgentHostConnectionsService, { registerSessionResource: (_backend, _authority, provider) => provider === 'copilotcli' ? target : source });
		services.stub(IChatSessionsService, { canResolveChatSession: async () => state.available });
		services.stub(IChatWidgetService, { getWidgetBySessionResource: resource => resource.toString() === source.toString() ? sourceWidget : state.opened ? targetWidget : undefined });
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
		services.stub(IQuickInputService, { pick: async () => undefined });
		services.stub(IFileDialogService, { showOpenDialog: async () => [folder] });
		services.stub(IFileService, { realpath: async uri => uri });
		services.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		services.stub(IWorkspaceTrustManagementService, { getUriTrustInfo: async uri => ({ uri, trusted: state.trusted }) });
		services.stub(IWorkspaceTrustRequestService, { requestResourcesTrust: async () => false });
		let coordinator: AgentHostPolicyContinuationService | undefined;
		return { services, source, sourceModel, sourceWidget, targetModel, targetInput, state, saved, created, completions, notifications, setSourceHistoryLoaded: (value: boolean) => { sourceHistoryLoaded = value; }, run: () => (coordinator ??= store.add(services.createInstance(AgentHostPolicyContinuationService))).continueInCopilot(source) };
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
		test(`copies ${provider} history and unsent input without changing the source`, async () => {
			const { run, created, state, sourceModel, sourceWidget } = setup({ provider });
			await run();
			assert.deepStrictEqual({
				provider: created[0].provider,
				folders: created[0].workingDirectories?.map(uri => uri.toString()),
				config: created[0].config,
				turns: created[0].importConversation?.turns.map(turn => ({ question: turn.message.text, answers: turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content) })),
				draft: state.draft,
				source: { requests: sourceModel.getRequests().length, draft: sourceWidget.getInput() },
			}, {
				provider: 'copilotcli', folders: [folder.toString()], config: { isolation: 'folder' },
				turns: [{ question: 'Original question', answers: ['Original answer'] }],
				draft: { inputText: 'Unsent follow-up', attachments: [attachment], selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 4, positionLineNumber: 1, positionColumn: 4 }] },
				source: { requests: 1, draft: 'Unsent follow-up' },
			});
		});
	}

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
		assert.strictEqual(state.draft, undefined, 'The copied source draft must not overwrite newer input');
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
