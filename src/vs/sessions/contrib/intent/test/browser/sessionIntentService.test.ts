/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfirmation, IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { _util } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { GitRepositoryState, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionInputDraftService, SessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ChatInteractivity, GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionCapabilities, ISessionWorkspace, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, IProviderSessionType, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider, ISessionWorkspaceIntentAction } from '../../../../services/sessions/common/sessionsProvider.js';
import { createWorkTestSession } from '../../../../services/sessions/test/common/sessionWorkTestUtils.js';
import { SessionIntentService } from '../../browser/sessionIntentService.js';

suite('SessionIntentService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/known/project');
	const target: IProviderSessionType = {
		providerId: 'test-provider',
		sessionType: { id: 'test-type', label: 'Local', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.None, supportsWorkspaceConversion: true },
	};

	function intake(path: string) {
		const { session, chat } = createWorkTestSession(URI.parse(`test:/${path}`));
		chat.status.set(SessionStatus.Untitled, undefined);
		return {
			...session,
			status: observableValue('status', SessionStatus.Untitled),
			isQuickChat: observableValue('quickChat', true),
			capabilities: observableValue<ISessionCapabilities>('capabilities', { supportsMultipleChats: true, supportsWorkspaceConversion: true }),
			chat,
		};
	}

	interface ISetupOptions {
		actions?: readonly ISessionWorkspaceIntentAction[];
		context?: string;
		confirm?: boolean;
		cloudTargetAvailable?: boolean;
		cloudWorkspace?: ISessionWorkspace;
		localWorkspace?: ISessionWorkspace;
		trusted?: boolean;
		onContext?: () => void;
		onConfirm?: () => void;
		onTrust?: () => Promise<void> | void;
		onValidate?: () => Promise<void> | void;
		folders?: URI[];
		storage?: InMemoryStorageService;
		catalog?: readonly ISession[];
		pending?: ISession;
	}

	function setup(options: ISetupOptions = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const replaced = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const started = store.add(new Emitter<ISession>());
		const deleted = store.add(new Emitter<ISession>());
		const discarded = store.add(new Emitter<ISession>());
		const replacedDraft = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const catalog = [...options.catalog ?? []];
		const pending = observableValue<ISession | undefined>('pending', options.pending);
		const memberships: { sessionId: string; groupId: string }[] = [];
		const destinations: { folder: URI; options?: ICreateNewSessionOptions }[] = [];
		const trustRequests: ResourceTrustRequestOptions[] = [];
		const confirmations: IConfirmation[] = [];
		const hidden = { hidden: false };
		let creates = 0;
		let sends = 0;
		let loads = 0;
		let validations = 0;
		let discoveries = 0;
		let repositoryReads = 0;
		let contextReviews = 0;
		let targets = [target];
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly newSession = pending;
			override readonly onDidReplaceSession = replaced.event;
			override readonly onDidStartSession = started.event;
			override readonly onDidDeleteSession = deleted.event;
			override readonly onDidDiscardNewSession = discarded.event;
			override readonly onDidReplaceNewDraftSession = replacedDraft.event;
			override readonly onDidChangeSessions = changed.event;
			override getSessions() { return [...catalog]; }
			override getSession(resource: URI) { return catalog.find(session => extUri.isEqual(session.resource, resource)); }
			override getQuickChatSessionTypes() { return targets; }
			override isNewSessionTargetAvailable() { return options.cloudTargetAvailable ?? true; }
			override resolveWorkspace() { return { providerId: target.providerId, workspace: options.cloudWorkspace ?? setupWorkspace(true) }; }
			override createQuickChat(options?: ICreateNewSessionOptions) {
				const session = { ...intake(`draft-${++creates}`), providerId: options?.providerId ?? target.providerId, sessionType: options?.sessionTypeId ?? target.sessionType.id };
				pending.set(session, undefined);
				return session;
			}
			override createNewSession(folder: URI, createOptions?: ICreateNewSessionOptions) {
				destinations.push({ folder, options: createOptions });
				const session = { ...intake('cloud-draft'), providerId: createOptions?.providerId ?? target.providerId, sessionType: createOptions?.sessionTypeId ?? 'cloud-type' };
				session.isQuickChat.set(false, undefined);
				session.workspace.set(options.cloudWorkspace ?? setupWorkspace(true), undefined);
				pending.set(session, undefined);
				return session;
			}
			override async sendRequest() { sends++; }
		};
		const provider = new class extends mock<ISessionsProvider>() {
			override readonly id = target.providerId;
			override readonly supportsLocalWorkspaces = true;
			override readonly supportsQuickChats = true;
			override get workspaceIntentActions() { return options.actions; }
			override resolveWorkspace(resource: URI) {
				return options.localWorkspace ?? { uri: resource, label: 'project', icon: Codicon.folder, requiresWorkspaceTrust: true, isVirtualWorkspace: false, folders: [{ root: resource, workingDirectory: resource, name: 'project', description: undefined }] };
			}
		};
		instantiation.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(id: string) { return id === provider.id ? provider as T : undefined; }
			override getProviders() { return [provider]; }
		});
		instantiation.stub(ISessionsManagementService, management);
		instantiation.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
			override getGroup(id: string) { return { id, name: id, createdAt: 0 }; }
			override addToGroup(sessionId: string, groupId: string) { memberships.push({ sessionId, groupId }); }
		});
		instantiation.stub(IChatEntitlementService, { sentiment: hidden });
		instantiation.stub(IFileDialogService, { showOpenDialog: async () => options.folders });
		instantiation.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				options.onConfirm?.();
				return { confirmed: options.confirm ?? false };
			}
		});
		instantiation.stub(IQuickInputService, { input: async () => { contextReviews++; options.onContext?.(); return options.context; } });
		instantiation.stub(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(request: ResourceTrustRequestOptions) {
				trustRequests.push(request);
				await options.onTrust?.();
				return options.trusted;
			}
		});
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(ILogService, new NullLogService());
		const storage = options.storage ?? store.add(new InMemoryStorageService());
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidCreateModel = Event.None;
			override getSession() { return undefined; }
			override async acquireOrLoadSession() { loads++; return undefined; }
		});
		let drafts = store.add(instantiation.createInstance(SessionInputDraftService));
		instantiation.stub(ISessionInputDraftService, drafts);
		const fileService = store.add(new FileService(new NullLogService()));
		const fs = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fs));
		instantiation.stub(IFileService, new class extends mock<IFileService>() {
			override hasProvider(resource: URI) { return fileService.hasProvider(resource); }
			override async stat(resource: URI) {
				validations++;
				await options.onValidate?.();
				return fileService.stat(resource);
			}
		});
		instantiation.stub(ISessionsRecentWorkspacesService, { getRecentWorkspaces: () => { discoveries++; return []; } });
		const repositoryState = observableValue<GitRepositoryState>('repositoryState', {
			HEAD: { type: 0, commit: 'abc' }, remotes: [{ name: 'origin', fetchUrl: 'https://github.com/example/project', isReadOnly: false }],
			mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [],
		});
		const repository = new class extends mock<IGitRepository>() {
			override readonly rootUri = folder;
			override readonly state = repositoryState;
		};
		instantiation.stub(IGitService, new class extends mock<IGitService>() {
			override get repositories() { repositoryReads++; return [repository]; }
			override async openRepository() { return undefined; }
		});
		let service = store.add(instantiation.createInstance(SessionIntentService));
		return {
			service, drafts, fileService, catalog, pending, hidden, memberships, replaced, started, deleted, discarded, replacedDraft, changed, destinations, trustRequests, confirmations, repositoryState, storage,
			counts: () => ({ creates, sends, loads }), setTargets: (value: IProviderSessionType[]) => targets = value,
			discoveryCounts: () => ({ discoveries, validations, repositoryReads }), contextReviews: () => contextReviews,
			restore: async () => {
				await storage.flush();
				service.dispose();
				drafts.dispose();
				drafts = store.add(instantiation.createInstance(SessionInputDraftService));
				instantiation.stub(ISessionInputDraftService, drafts);
				service = store.add(instantiation.createInstance(SessionIntentService));
				return { service, drafts };
			},
		};
	}

	test('starts one native draft without a navigation service, discovery, or history hydration', async () => {
		const { service, drafts, counts, fileService, discoveryCounts } = setup({
			onValidate: () => { throw new Error('Draft creation must not wait for workspace discovery'); },
		});
		await fileService.createFolder(folder);
		const session = await service.start(target, { outcome: 'Fix login' });
		const draft = drafts.getDraft(session.mainChat.get().resource).get();
		assert.deepStrictEqual({
			counts: counts(), quick: session.isQuickChat?.get(), workspace: session.workspace.get(),
			text: draft.inputText, attachmentKind: draft.attachments[0].kind,
			hasNativeConfirmation: String(draft.attachments[0].value).includes('native question'),
			discovery: service.getPresentation(session).get().discovery,
			requiresNavigation: _util.getServiceDependencies(SessionIntentService as typeof SessionIntentService & _util.DI_TARGET_OBJ).some(dependency => dependency.id.toString() === 'sessionsService'),
			discoveryCounts: discoveryCounts(), intakes: service.intakes.get(),
		}, {
			counts: { creates: 1, sends: 0, loads: 0 }, quick: true, workspace: undefined,
			text: 'Fix login', attachmentKind: 'promptText', hasNativeConfirmation: true,
			discovery: { status: 'idle', revision: 0, candidates: [], alternatives: [] },
			requiresNavigation: false, discoveryCounts: { discoveries: 0, validations: 0, repositoryReads: 0 }, intakes: [session],
		});
	});

	test('quick-chat support alone and disabled AI never create an intake', async () => {
		const { service, setTargets, hidden, counts } = setup();
		setTargets([{ ...target, sessionType: { ...target.sessionType, supportsWorkspaceConversion: undefined } }]);
		await assert.rejects(service.start(target));
		setTargets([target]);
		hidden.hidden = true;
		await assert.rejects(service.start(target));
		assert.deepStrictEqual({ targets: service.getTargets(), counts: counts() }, { targets: [], counts: { creates: 0, sends: 0, loads: 0 } });
	});

	test('resumes matching work without resetting text, evidence, collection, or a removed context seed', async () => {
		const { service, drafts, counts, started, memberships } = setup();
		const session = await service.start(target, { outcome: 'Original outcome', collectionId: 'one' });
		const chat = session.mainChat.get().resource;
		const draft = { inputText: 'Edited outcome', attachments: [{ kind: 'file' as const, id: 'evidence', name: 'Evidence', value: URI.file('/evidence.png') }] };
		drafts.setDraft(chat, draft);
		const resumed = await service.start(target, { outcome: 'Do not overwrite this draft' });
		await assert.rejects(service.start(target, { collectionId: 'two' }), /explicitly discard/);
		started.fire({ ...session, status: constObservable(SessionStatus.Completed) });
		assert.deepStrictEqual({
			resumed: resumed === session, draft: drafts.getDraft(chat).get(), counts: counts(), memberships,
		}, {
			resumed: true, draft, counts: { creates: 1, sends: 0, loads: 0 },
			memberships: [{ sessionId: session.sessionId, groupId: 'one' }],
		});
	});

	test('adopts a matching native draft once without replacing its text or evidence', async () => {
		const existing = intake('existing');
		const { service, drafts, pending, counts, started, memberships } = setup({ pending: existing });
		const evidence = { kind: 'file' as const, id: 'evidence', name: 'Screenshot', value: URI.file('/evidence.png') };
		store.add(drafts.registerDraftProvider(existing.mainChat.get().resource, () => ({ inputText: 'Native text', attachments: [evidence] })));
		const session = await service.start(target, { outcome: 'New outcome', collectionId: 'native' });
		await service.start(target);
		const draft = drafts.getDraft(session.mainChat.get().resource).get();
		started.fire({ ...session, status: constObservable(SessionStatus.Completed) });
		assert.deepStrictEqual({
			isOriginal: session === existing && pending.get() === existing, text: draft.inputText,
			attachments: draft.attachments.map(attachment => attachment.id), evidence: draft.attachments[0], memberships, counts: counts(),
		}, {
			isOriginal: true, text: 'Native text', attachments: ['evidence', 'sessions.intent.context'], evidence,
			memberships: [{ sessionId: existing.sessionId, groupId: 'native' }], counts: { creates: 0, sends: 0, loads: 0 },
		});
	});

	test('requires explicit discard before replacing a different target, workspace draft, or sending intake', async () => {
		const existing = intake('keep-me');
		const { service, drafts, pending, counts } = setup();
		const chat = existing.mainChat.get().resource;
		const original = { inputText: 'Keep my work', attachments: [{ kind: 'file' as const, id: 'evidence', name: 'Evidence', value: URI.file('/evidence.png') }] };
		drafts.setDraft(chat, original);
		const different = { ...existing, providerId: 'another-provider' };
		pending.set(different, undefined);
		await assert.rejects(service.start(target), /explicitly discard/);
		assert.strictEqual(pending.get(), different);
		pending.set(existing, undefined);
		existing.workspace.set(setupWorkspace(false), undefined);
		await assert.rejects(service.start(target), /explicitly discard/);
		existing.workspace.set(undefined, undefined);
		existing.isNewSessionRequestInProgress.set(true, undefined);
		await assert.rejects(service.start(target), /explicitly discard/);
		assert.deepStrictEqual({ pending: pending.get(), draft: drafts.getDraft(chat).get(), counts: counts(), intakes: service.intakes.get() }, {
			pending: existing, draft: original, counts: { creates: 0, sends: 0, loads: 0 }, intakes: [],
		});
	});

	test('observing the catalog or a presentation never turns unrelated quick chats into intakes', async () => {
		const unrelated = intake('unrelated');
		const selected = intake('selected');
		const { service, changed, counts, discoveryCounts } = setup({ catalog: [unrelated, selected] });
		changed.fire({ added: [unrelated, selected], removed: [], changed: [] });
		assert.throws(() => service.getPresentation(unrelated), /not been selected/);
		assert.deepStrictEqual({ intakes: service.intakes.get(), discovery: discoveryCounts() }, {
			intakes: [], discovery: { discoveries: 0, validations: 0, repositoryReads: 0 },
		});
		await service.refresh(selected);
		assert.deepStrictEqual({ intakes: service.intakes.get(), counts: counts() }, {
			intakes: [selected], counts: { creates: 0, sends: 0, loads: 0 },
		});
	});

	test('explicit discovery updates only the existing intake context and never reinstates a removed seed', async () => {
		const { service, drafts, fileService } = setup();
		await fileService.createFolder(folder);
		const session = await service.start(target);
		const chat = session.mainChat.get().resource;
		const evidence = { kind: 'file' as const, id: 'evidence', name: 'Evidence', value: URI.file('/evidence.png') };
		drafts.addAttachments(chat, [evidence]);
		await service.refresh(session);
		const draft = drafts.getDraft(chat).get();
		assert.deepStrictEqual({
			text: draft.inputText, evidence: draft.attachments.find(attachment => attachment.id === evidence.id),
			knownFolder: String(draft.attachments.find(attachment => attachment.id === 'sessions.intent.context')?.value).includes(folder.fsPath),
		}, { text: '', evidence, knownFolder: true });
		drafts.setDraft(chat, { inputText: '', attachments: [evidence] });
		await service.refresh(session);
		await service.start(target, { outcome: 'Do not refill a cleared draft' });
		assert.deepStrictEqual(drafts.getDraft(chat).get(), { inputText: '', attachments: [evidence] });
	});

	test('late discovery does not change a draft that is already being submitted', async () => {
		const validation = new DeferredPromise<void>();
		const h = setup({ onValidate: () => validation.p });
		await h.fileService.createFolder(folder);
		const session = await h.service.start(target, { outcome: 'Send once' });
		const refresh = h.service.refresh(session);
		const draft = h.drafts.getDraft(session.mainChat.get().resource).get();
		const running = { ...session, status: constObservable(SessionStatus.InProgress) };
		h.started.fire(running);
		h.catalog.push(running);
		await validation.complete();
		await refresh;
		assert.deepStrictEqual(h.drafts.getDraft(session.mainChat.get().resource).get(), draft);
	});

	test('selection is scoped draft context, preserves evidence, and cannot cause conversion or duplicate continuation', async () => {
		const { service, drafts, fileService, counts } = setup();
		await fileService.createFolder(folder);
		const session = await service.start(target, { outcome: 'Fix login' });
		const chat = session.mainChat.get().resource;
		drafts.addAttachments(chat, [{ kind: 'file', id: 'evidence', name: 'screenshot', value: URI.file('/evidence.png') }]);
		const discovery = await service.refresh(session);
		const candidate = discovery.candidates[0];
		await service.stageCandidate(session, candidate.id, candidate.revision, true);
		const draft = drafts.getDraft(chat).get();
		const presentation = service.getPresentation(session).get();
		assert.deepStrictEqual({
			text: draft.inputText, attachments: draft.attachments.length,
			isolated: String(draft.attachments.find(value => value.id === 'sessions.intent.context')?.value).includes('"isolate":true'),
			workspace: session.workspace.get(), counts: counts(),
			proposal: presentation.proposedWorkspace, busy: presentation.busy,
		}, {
			text: 'Fix login', attachments: 2, isolated: true, workspace: undefined, counts: { creates: 1, sends: 0, loads: 0 },
			proposal: { candidate: presentation.discovery.candidates[0], isolate: true }, busy: false,
		});
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, true), /changed/);
	});

	test('direct-creation validation preserves candidate identity and does not stage or execute work', async () => {
		const h = setup();
		await h.fileService.createFolder(folder);
		const session = await h.service.start(target, { outcome: 'Choose the checkout first' });
		const candidate = (await h.service.refresh(session)).candidates[0];
		const draft = h.drafts.getDraft(session.mainChat.get().resource).get();
		const verified = await h.service.validateCandidate(session, candidate.id, candidate.revision);
		assert.deepStrictEqual({
			id: verified.id, revision: verified.revision, validation: verified.validation,
			draft: h.drafts.getDraft(session.mainChat.get().resource).get(), proposal: h.service.getPresentation(session).get().proposedWorkspace, sends: h.counts().sends,
		}, { id: candidate.id, revision: candidate.revision, validation: 'verified', draft, proposal: undefined, sends: 0 });
	});

	test('workspace selection adopts an ordinary native quick-chat draft without dropping its content', async () => {
		const { service, drafts, fileService, pending } = setup();
		await fileService.createFolder(folder);
		const session = intake('ordinary-quick-chat');
		pending.set(session, undefined);
		const chat = session.mainChat.get().resource;
		const evidence = { kind: 'file' as const, id: 'evidence', name: 'screenshot', value: URI.file('/evidence.png') };
		store.add(drafts.registerDraftProvider(chat, () => ({ inputText: 'Keep the native outcome', attachments: [evidence] })));
		const candidate = (await service.refresh(session)).candidates[0];
		await service.stageCandidate(session, candidate.id, candidate.revision, false);
		const draft = drafts.getDraft(chat).get();
		assert.deepStrictEqual({ text: draft.inputText, evidence: draft.attachments[0], count: draft.attachments.length }, {
			text: 'Keep the native outcome', evidence, count: 2,
		});
	});

	test('refresh invalidates a selected revision and removal invalidates a live selection', async () => {
		const { service, fileService } = setup();
		await fileService.createFolder(folder);
		const session = await service.start(target);
		const previous = (await service.refresh(session)).candidates[0];
		const current = (await service.refresh(session)).candidates[0];
		await assert.rejects(service.stageCandidate(session, previous.id, previous.revision, false), /changed/);
		await fileService.del(folder, { recursive: true });
		await assert.rejects(service.stageCandidate(session, current.id, current.revision, false), /revalidated/);
	});

	test('revoked capability and read-only default chat refuse selected context', async () => {
		const { service, fileService, catalog, pending } = setup();
		await fileService.createFolder(folder);
		const session = intake('committed');
		session.status.set(SessionStatus.Completed, undefined);
		catalog.push(session);
		pending.set(undefined, undefined);
		const candidate = (await service.refresh(session)).candidates[0];
		session.capabilities.set({ supportsMultipleChats: true }, undefined);
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, false), /cannot currently/);
		session.capabilities.set({ supportsMultipleChats: true, supportsWorkspaceConversion: true }, undefined);
		session.chat.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, false), /cannot currently/);
	});

	test('revalidates capability after asynchronous folder checks and reports setup busy without staging', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const options: ISetupOptions = { catalog: [source] };
		const { service, fileService, drafts, trustRequests, counts } = setup(options);
		await fileService.createFolder(folder);
		const candidate = (await service.refresh(source)).candidates[0];
		const draft = drafts.getDraft(source.mainChat.get().resource).get();
		const validation = new DeferredPromise<void>();
		options.onValidate = () => validation.p;
		const busy: boolean[] = [];
		store.add(autorun(reader => busy.push(service.getPresentation(source).read(reader).busy)));
		const staging = service.stageCandidate(source, candidate.id, candidate.revision, false);
		await assert.rejects(service.chooseFolder(source), /Finish the current setup choice/);
		await assert.rejects(service.stageCandidate(source, candidate.id, candidate.revision, false), /Finish the current setup choice/);
		source.capabilities.set({ supportsMultipleChats: true }, undefined);
		await validation.complete();
		await assert.rejects(staging, /cannot currently/);
		assert.deepStrictEqual({
			busy: busy.filter((value, index) => index === 0 || value !== busy[index - 1]),
			proposal: service.getPresentation(source).get().proposedWorkspace,
			draft: drafts.getDraft(source.mainChat.get().resource).get(), trustRequests, counts: counts(),
		}, { busy: [false, true, false], proposal: undefined, draft, trustRequests: [], counts: { creates: 0, sends: 0, loads: 0 } });
	});

	test('rejects changed repository, unavailable isolation, and a provider that resolves a different directory', async () => {
		const options: ISetupOptions = {};
		const { service, fileService, repositoryState, drafts, trustRequests } = setup(options);
		await fileService.createFolder(folder);
		const session = await service.start(target, { outcome: 'Keep the task' });
		const candidate = (await service.refresh(session)).candidates[0];
		const before = drafts.getDraft(session.mainChat.get().resource).get();
		const state = repositoryState.get();
		repositoryState.set({ ...state, remotes: [{ name: 'origin', fetchUrl: 'https://github.com/example/other', isReadOnly: false }] }, undefined);
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, false), /revalidated/);
		repositoryState.set({ ...state, HEAD: { type: 0 } }, undefined);
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, true), /no usable commit/);
		repositoryState.set(state, undefined);
		const workspace = setupWorkspace(false);
		options.localWorkspace = { ...workspace, folders: [{ ...workspace.folders[0], workingDirectory: URI.file('/different') }] };
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, false), /revalidated/);
		assert.deepStrictEqual({
			draft: drafts.getDraft(session.mainChat.get().resource).get(), proposal: service.getPresentation(session).get().proposedWorkspace, trustRequests,
		}, { draft: before, proposal: undefined, trustRequests: [] });
	});

	test('collection intent follows each draft identity rather than a global next-session slot', async () => {
		const { service, replaced, started, memberships, pending } = setup();
		const first = await service.start(target, { collectionId: 'one' });
		pending.set(undefined, undefined);
		const second = await service.start(target, { collectionId: 'two' });
		const committedFirst = intake('committed-one');
		const committedSecond = intake('committed-two');
		committedFirst.status.set(SessionStatus.Completed, undefined);
		committedSecond.status.set(SessionStatus.Completed, undefined);
		replaced.fire({ from: second, to: committedSecond });
		replaced.fire({ from: first, to: committedFirst });
		started.fire(committedFirst);
		started.fire(committedSecond);
		assert.deepStrictEqual(memberships, [
			{ sessionId: committedFirst.sessionId, groupId: 'one' },
			{ sessionId: committedSecond.sessionId, groupId: 'two' },
		]);
	});

	test('same-resource publication uses the committed facade even without a replacement event', async () => {
		const { service, started, memberships } = setup();
		const draft = await service.start(target, { collectionId: 'work' });
		const presentation = service.getPresentation(draft);
		const committed = { ...draft, status: constObservable(SessionStatus.Completed) };
		started.fire(committed);
		assert.deepStrictEqual({ current: presentation.get().session === committed, memberships }, {
			current: true, memberships: [{ sessionId: committed.sessionId, groupId: 'work' }],
		});
	});

	test('observable intake membership and native draft handles follow canonical identity without navigation', async () => {
		const { service, drafts, replaced, started, changed, deleted, pending, catalog, memberships, storage, counts } = setup();
		const observed: (readonly ISession[])[] = [];
		store.add(autorun(reader => observed.push(service.intakes.read(reader))));
		const source = await service.start(target, { outcome: 'Carry this outcome', collectionId: 'work' });
		const presentation = service.getPresentation(source);
		const sourceDraft = drafts.getDraft(source.mainChat.get().resource);
		drafts.addAttachments(source.mainChat.get().resource, [{ kind: 'file', id: 'evidence', name: 'Evidence', value: URI.file('/evidence.png') }]);
		const original = sourceDraft.get();
		const committed = intake('canonical');
		committed.status.set(SessionStatus.Completed, undefined);
		catalog.push(committed);
		replaced.fire({ from: source, to: committed });
		pending.set(undefined, undefined);
		changed.fire({ added: [], removed: [source], changed: [committed] });
		started.fire(committed);
		assert.deepStrictEqual({
			intakes: service.intakes.get(), alias: service.getPresentation(source) === presentation,
			session: presentation.get().session, sourceDraft: sourceDraft.get(),
			canonicalDraft: drafts.getDraft(committed.mainChat.get().resource).get(), memberships, counts: counts(),
		}, {
			intakes: [committed], alias: true, session: committed, sourceDraft: original, canonicalDraft: original,
			memberships: [{ sessionId: committed.sessionId, groupId: 'work' }], counts: { creates: 1, sends: 0, loads: 0 },
		});
		deleted.fire(committed);
		assert.deepStrictEqual({ observed, storage: storage.get('sessions.intent.intakes', StorageScope.WORKSPACE) }, {
			observed: [[], [source], [committed], []], storage: undefined,
		});
	});

	test('same-resource catalog publication preserves intake membership while unrelated draft replacement does not', async () => {
		const { service, changed, replacedDraft, pending, discarded, memberships } = setup();
		const source = await service.start(target, { collectionId: 'one' });
		const published = { ...source, status: constObservable(SessionStatus.Completed) };
		changed.fire({ added: [published], removed: [source], changed: [] });
		assert.deepStrictEqual({ intakes: service.intakes.get(), memberships }, {
			intakes: [published], memberships: [{ sessionId: source.sessionId, groupId: 'one' }],
		});
		changed.fire({ added: [], removed: [published], changed: [] });
		pending.set(undefined, undefined);
		const next = await service.start(target);
		const unrelated = intake('unrelated-replacement');
		replacedDraft.fire({ from: next, to: unrelated });
		pending.set(unrelated, undefined);
		assert.deepStrictEqual(service.intakes.get(), []);
		await service.start(target);
		discarded.fire(unrelated);
		assert.deepStrictEqual(service.intakes.get(), []);
	});

	test('a reconnecting catalog retains intake identity and restores it without discovery', async () => {
		const source = intake('reconnecting');
		source.status.set(SessionStatus.Completed, undefined);
		const h = setup({ catalog: [source] });
		await h.service.refresh(source);
		const before = h.discoveryCounts();
		h.catalog.splice(0);
		h.changed.fire({ added: [], removed: [source], changed: [] });
		assert.deepStrictEqual(h.service.intakes.get(), []);
		const next = { ...source };
		h.catalog.push(next);
		h.changed.fire({ added: [next], removed: [], changed: [] });
		assert.deepStrictEqual({ intakes: h.service.intakes.get(), discovery: h.discoveryCounts() }, { intakes: [next], discovery: before });
	});

	test('restores only lightweight membership; native drafts survive and setup proposals reset without discovery', async () => {
		const { service, drafts, fileService, restore, storage, discoveryCounts, counts } = setup();
		await fileService.createFolder(folder);
		const source = await service.start(target, { outcome: 'Persistent native outcome', collectionId: 'work' });
		drafts.addAttachments(source.mainChat.get().resource, [{ kind: 'file', id: 'evidence', name: 'Evidence', value: URI.file('/evidence.png') }]);
		const candidate = (await service.refresh(source, { repository: { owner: 'example', repo: 'project' } })).candidates[0];
		await service.stageCandidate(source, candidate.id, candidate.revision, false);
		const before = drafts.getDraft(source.mainChat.get().resource).get();
		const beforeDiscovery = discoveryCounts();
		const restored = await restore();
		const resumed = await restored.service.start(target);
		const presentation = restored.service.getPresentation(source).get();
		assert.deepStrictEqual({
			stored: JSON.parse(storage.get('sessions.intent.intakes', StorageScope.WORKSPACE)!),
			intakes: restored.service.intakes.get(), resumed: resumed === source,
			draft: restored.drafts.getDraft(source.mainChat.get().resource).get(),
			busy: presentation.busy, proposal: presentation.proposedWorkspace, discovery: presentation.discovery,
			discoveryCounts: discoveryCounts(), counts: counts(),
		}, {
			stored: { version: 1, intakes: [{ resource: source.resource.toString(), providerId: source.providerId, collectionId: 'work' }] },
			intakes: [source], resumed: true, draft: before, busy: false, proposal: undefined,
			discovery: { status: 'idle', revision: 0, candidates: [], alternatives: [] },
			discoveryCounts: beforeDiscovery, counts: { creates: 1, sends: 0, loads: 0 },
		});
		await restored.service.refresh(source);
		assert.deepStrictEqual(restored.drafts.getDraft(source.mainChat.get().resource).get(), before);
	});

	test('restores delayed catalog entries by resource and provider, never by another quick chat or invalid storage', async () => {
		const source = intake('restored');
		source.status.set(SessionStatus.Completed, undefined);
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.intent.intakes', JSON.stringify({
			version: 1, intakes: [null, { resource: 7 }, { resource: 'invalid', providerId: source.providerId }, { resource: source.resource.toString(), providerId: source.providerId }],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const { service, changed, catalog, counts, discoveryCounts } = setup({ storage });
		const otherProvider = { ...source, providerId: 'another-provider' };
		const unrelated = intake('another-resource');
		catalog.push(otherProvider, unrelated);
		changed.fire({ added: [otherProvider, unrelated], removed: [], changed: [] });
		assert.deepStrictEqual(service.intakes.get(), []);
		catalog.splice(0, 1, source);
		changed.fire({ added: [source], removed: [], changed: [] });
		assert.deepStrictEqual({ intakes: service.intakes.get(), counts: counts(), discovery: discoveryCounts() }, {
			intakes: [source], counts: { creates: 0, sends: 0, loads: 0 }, discovery: { discoveries: 0, validations: 0, repositoryReads: 0 },
		});
	});

	test('canonical replacement restores a persisted intake even before its old facade reaches the catalog', async () => {
		const source = intake('restored-source');
		const canonical = intake('restored-canonical');
		canonical.status.set(SessionStatus.Completed, undefined);
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.intent.intakes', JSON.stringify({
			version: 1, intakes: [{ resource: source.resource.toString(), providerId: source.providerId, collectionId: 'work' }],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const { service, drafts, replaced, changed, deleted, catalog, memberships, counts } = setup({ storage });
		const original = { inputText: 'Preserve this draft', attachments: [] };
		drafts.setDraft(source.mainChat.get().resource, original);
		deleted.fire({ ...source, providerId: 'another-provider' });
		catalog.push(canonical);
		replaced.fire({ from: source, to: canonical });
		changed.fire({ added: [], removed: [source], changed: [canonical] });
		assert.deepStrictEqual({
			intakes: service.intakes.get(), session: service.getPresentation(source).get().session,
			draft: drafts.getDraft(canonical.mainChat.get().resource).get(), memberships,
			stored: JSON.parse(storage.get('sessions.intent.intakes', StorageScope.WORKSPACE)!), counts: counts(),
		}, {
			intakes: [canonical], session: canonical, draft: original,
			memberships: [{ sessionId: canonical.sessionId, groupId: 'work' }],
			stored: { version: 1, intakes: [{ resource: canonical.resource.toString(), providerId: canonical.providerId }] },
			counts: { creates: 0, sends: 0, loads: 0 },
		});
	});

	test('cancelling a folder picker retains the intake and its evidence', async () => {
		const { service, drafts, counts } = setup();
		const session = await service.start(target, { outcome: 'Keep this' });
		const before = drafts.getDraft(session.mainChat.get().resource).get();
		const candidate = await service.chooseFolder(session);
		assert.deepStrictEqual({ candidate, draft: drafts.getDraft(session.mainChat.get().resource).get(), counts: counts() }, {
			candidate: undefined, draft: before, counts: { creates: 1, sends: 0, loads: 0 },
		});
	});

	test('choosing a folder returns verified context without staging, authorizing trust, or navigating', async () => {
		const { service, fileService, counts, trustRequests } = setup({ folders: [folder] });
		await fileService.createFolder(folder);
		const source = await service.start(target);
		const selected = await service.chooseFolder(source);
		assert.deepStrictEqual({
			folder: selected?.folder, validation: selected?.validation, workspace: source.workspace.get(),
			proposal: service.getPresentation(source).get().proposedWorkspace, busy: service.getPresentation(source).get().busy,
			trustRequests, counts: counts(),
		}, { folder, validation: 'verified', workspace: undefined, proposal: undefined, busy: false, trustRequests: [], counts: { creates: 1, sends: 0, loads: 0 } });
	});

	function setupWorkspace(virtual: boolean): ISessionWorkspace {
		const root = virtual ? URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/example/project/HEAD' }) : folder;
		return {
			uri: virtual ? URI.parse('https://github.com/example/project') : folder,
			label: 'example/project', icon: Codicon.repo, requiresWorkspaceTrust: !virtual, isVirtualWorkspace: virtual,
			folders: [{ root, workingDirectory: root, name: 'project', description: undefined }],
		};
	}

	function cloudAction(workspace = setupWorkspace(true)): ISessionWorkspaceIntentAction {
		return {
			id: 'cloud', kind: 'cloud', label: 'Cloud', availability: 'unknown', reason: 'Access not checked',
			run: async () => ({ kind: 'selected', workspace, providerId: target.providerId, sessionTypeId: 'cloud-type' }),
		};
	}

	test('discovery invokes no setup; selected clone returns a candidate and does not send or attach', async () => {
		let actions = 0;
		const { service, fileService, counts } = setup({
			actions: [{
				id: 'clone', kind: 'clone', label: 'Clone', availability: 'unknown', reason: 'Access not checked',
				run: async () => { actions++; return { kind: 'selected', workspace: setupWorkspace(false) }; },
			}]
		});
		await fileService.createFolder(folder);
		const session = await service.start(target);
		const discovery = await service.refresh(session, { repository: { owner: 'example', repo: 'project' } });
		assert.strictEqual(actions, 0);
		const result = await service.runAlternative(session, discovery.alternatives[0].id, discovery.revision);
		assert.ok(result.kind === 'candidate');
		assert.deepStrictEqual({
			actions, kind: result.kind, candidate: result.candidate.folder.toString(), validation: result.candidate.validation,
			workspace: session.workspace.get(), proposal: service.getPresentation(session).get().proposedWorkspace, counts: counts(),
		}, { actions: 1, kind: 'candidate', candidate: folder.toString(), validation: 'verified', workspace: undefined, proposal: undefined, counts: { creates: 1, sends: 0, loads: 0 } });
	});

	test('failed attachment after clone retains the selected checkout without retrying clone', async () => {
		let actions = 0;
		const { service, fileService, counts } = setup({
			actions: [{
				id: 'clone', kind: 'clone', label: 'Clone', availability: 'unknown', reason: 'Access not checked',
				run: async () => { actions++; return { kind: 'selected', workspace: setupWorkspace(false) }; },
			}]
		});
		await fileService.createFolder(folder);
		const session = await service.start(target);
		const discovery = await service.refresh(session, { repository: { owner: 'example', repo: 'project' } });
		const result = await service.runAlternative(session, discovery.alternatives[0].id, discovery.revision);
		assert.ok(result.kind === 'candidate');
		const candidate = result.candidate;
		await service.refresh(session);
		await assert.rejects(service.stageCandidate(session, candidate.id, candidate.revision, false), /changed/);
		assert.deepStrictEqual({ exists: await fileService.exists(folder), actions, sends: counts().sends }, { exists: true, actions: 1, sends: 0 });
	});

	test('clone rejects stale choices and unverified repository results without deleting the checkout', async () => {
		let actions = 0;
		const { service, fileService, repositoryState, counts } = setup({
			actions: [{
				id: 'clone', kind: 'clone', label: 'Clone', availability: 'available', reason: 'Available',
				run: async () => { actions++; return { kind: 'selected', workspace: setupWorkspace(false) }; },
			}],
		});
		await fileService.createFolder(folder);
		const source = await service.start(target);
		const intent = { repository: { owner: 'example', repo: 'project' } };
		const previous = await service.refresh(source, intent);
		const current = await service.refresh(source, intent);
		await assert.rejects(service.runAlternative(source, previous.alternatives[0].id, previous.revision), /recommendation changed/);
		repositoryState.set({ ...repositoryState.get(), remotes: [] }, undefined);
		await assert.rejects(service.runAlternative(source, current.alternatives[0].id, current.revision), /could not be verified/);
		assert.deepStrictEqual({
			actions, folderExists: await fileService.exists(folder), workspace: source.workspace.get(),
			discovery: service.getPresentation(source).get().discovery, busy: service.getPresentation(source).get().busy, counts: counts(),
		}, { actions: 1, folderExists: true, workspace: undefined, discovery: current, busy: false, counts: { creates: 1, sends: 0, loads: 0 } });
	});

	test('clone revalidates its source after provider setup completes', async () => {
		const completed = new DeferredPromise<void>();
		const { service, fileService, setTargets } = setup({
			actions: [{
				id: 'clone', kind: 'clone', label: 'Clone', availability: 'available', reason: 'Available',
				run: async () => { await completed.p; return { kind: 'selected', workspace: setupWorkspace(false) }; },
			}],
		});
		await fileService.createFolder(folder);
		const source = await service.start(target);
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		const running = service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		setTargets([]);
		await completed.complete();
		await assert.rejects(running, /cannot currently/);
		assert.deepStrictEqual({
			discovery: service.getPresentation(source).get().discovery,
			busy: service.getPresentation(source).get().busy, exists: await fileService.exists(folder),
		}, { discovery, busy: false, exists: true });
	});

	test('cloud creates an unsent management destination with reviewed context and leaves the source unchanged', async () => {
		let actions = 0;
		const workspace = setupWorkspace(true);
		const { service, catalog, drafts, destinations, pending, counts, trustRequests, confirmations } = setup({
			context: 'Fix login; preserve the existing API.', confirm: true,
			actions: [{
				id: 'cloud', kind: 'cloud', label: 'Cloud', availability: 'unknown', reason: 'Access not checked',
				run: async () => { actions++; return { kind: 'selected', workspace, providerId: target.providerId, sessionTypeId: 'cloud-type' }; },
			}],
		});
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		catalog.push(source);
		const sourceChat = source.mainChat.get().resource;
		drafts.setDraft(sourceChat, { inputText: 'Private unsent note', attachments: [{ kind: 'file', id: 'private', name: 'private', value: URI.file('/private.png') }] });
		const original = drafts.getDraft(sourceChat).get();
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		const result = await service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		const cloud = pending.get();
		assert.ok(cloud);
		const cloudDraft = drafts.getDraft(cloud.mainChat.get().resource).get();
		assert.deepStrictEqual({
			result, actions, destinations, text: cloudDraft.inputText, copiedLocalFile: cloudDraft.attachments.some(value => value.kind === 'file'),
			sourceDraft: drafts.getDraft(sourceChat).get(), sourceWorkspace: source.workspace.get(), counts: counts(),
			status: cloud.status.get(), intakes: service.intakes.get(), trustRequests,
			review: confirmations.map(confirmation => confirmation.detail),
		}, {
			result: { kind: 'destination', session: cloud, source },
			actions: 1, destinations: [{ folder: workspace.folders[0].root, options: { providerId: target.providerId, sessionTypeId: 'cloud-type' } }],
			text: 'Fix login; preserve the existing API.', copiedLocalFile: false,
			sourceDraft: original, sourceWorkspace: undefined, counts: { creates: 0, sends: 0, loads: 0 },
			status: SessionStatus.Untitled, intakes: [source], trustRequests: [],
			review: [`Destination: ${target.providerId} / cloud-type\nWorkspace: example/project\nFolder: ${workspace.folders[0].root.toString()}\nContext: Fix login; preserve the existing API.\nThe original intake stays intact. Nothing is sent or provisioned until you review and send the destination draft.`],
		});
	});

	test('cancelled cloud context review opens no destination and keeps the intake', async () => {
		const { service, catalog, destinations, counts } = setup({
			actions: [{
				id: 'cloud', kind: 'cloud', label: 'Cloud', availability: 'unknown', reason: 'Access not checked',
				run: async () => ({ kind: 'selected', workspace: setupWorkspace(true), providerId: target.providerId, sessionTypeId: 'cloud-type' }),
			}],
		});
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		catalog.push(source);
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		const result = await service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		assert.deepStrictEqual({ result, destinations, source: catalog[0].resource, counts: counts() }, {
			result: { kind: 'cancelled' }, destinations: [], source: source.resource, counts: { creates: 0, sends: 0, loads: 0 },
		});
	});

	test('cloud cannot discard an unsent intake, even if a stale caller invokes its action', async () => {
		let actions = 0;
		const { service, counts } = setup({
			actions: [{
				id: 'cloud', kind: 'cloud', label: 'Cloud', availability: 'unknown', reason: 'Access not checked',
				run: async () => { actions++; return { kind: 'cancelled' }; },
			}],
		});
		const source = await service.start(target, { outcome: 'Unsent outcome' });
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /Send the intake message first/);
		assert.deepStrictEqual({ actions, counts: counts() }, { actions: 0, counts: { creates: 1, sends: 0, loads: 0 } });
	});

	test('cloud rechecks committed intake status instead of trusting a previously available recommendation', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const { service, destinations } = setup({
			catalog: [source], actions: [{
				...cloudAction(),
				run: async () => { throw new Error('An unsent source cannot invoke provider setup'); },
			}],
		});
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		source.status.set(SessionStatus.Untitled, undefined);
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /Send the intake message first/);
		assert.deepStrictEqual(destinations, []);
	});

	test('a pending clone cannot be invoked twice or redirected by a recommendation refresh', async () => {
		const result = new DeferredPromise<void>();
		let actions = 0;
		const { service } = setup({
			actions: [{
				id: 'clone', kind: 'clone', label: 'Clone', availability: 'unknown', reason: 'Access not checked',
				run: async () => { actions++; await result.p; return { kind: 'cancelled' }; },
			}]
		});
		const source = await service.start(target);
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		const busy: boolean[] = [];
		store.add(autorun(reader => busy.push(service.getPresentation(source).read(reader).busy)));
		const running = service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /already being handled/);
		await assert.rejects(service.refresh(source), /Finish the current setup choice/);
		await result.complete();
		assert.deepStrictEqual({ selected: await running, actions, busy }, { selected: { kind: 'cancelled' }, actions: 1, busy: [false, true, false] });
	});

	test('cloud rechecks source capability after context review before opening a new draft', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const { service, catalog, destinations } = setup({
			context: 'Reviewed task', confirm: true,
			onContext: () => source.capabilities.set({ supportsMultipleChats: true }, undefined),
			actions: [{
				id: 'cloud', kind: 'cloud', label: 'Cloud', availability: 'unknown', reason: 'Access not checked',
				run: async () => ({ kind: 'selected', workspace: setupWorkspace(true), providerId: target.providerId, sessionTypeId: 'cloud-type' }),
			}],
		});
		catalog.push(source);
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /cannot currently/);
		assert.deepStrictEqual(destinations, []);
	});

	test('cloud refuses to replace another pending draft before invoking provider setup', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const existing = intake('unsent');
		const { service, drafts, pending, destinations, contextReviews } = setup({
			catalog: [source], pending: existing, actions: [{
				...cloudAction(),
				run: async () => { throw new Error('Provider setup must not run when another draft would be replaced'); },
			}],
		});
		drafts.setDraft(existing.mainChat.get().resource, { inputText: 'Do not discard me', attachments: [] });
		const before = drafts.getDraft(existing.mainChat.get().resource).get();
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /Finish or discard/);
		assert.deepStrictEqual({
			pending: pending.get(), draft: drafts.getDraft(existing.mainChat.get().resource).get(), destinations, reviews: contextReviews(),
		}, { pending: existing, draft: before, destinations: [], reviews: 0 });
	});

	test('cloud preserves a draft opened during context review', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const existing = intake('opened-during-review');
		const options: ISetupOptions = { catalog: [source], actions: [cloudAction()], context: 'Reviewed task', confirm: true };
		const { service, drafts, pending, destinations } = setup(options);
		options.onContext = () => {
			pending.set(existing, undefined);
			drafts.setDraft(existing.mainChat.get().resource, { inputText: 'Concurrent task', attachments: [] });
		};
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /Another draft was opened/);
		assert.deepStrictEqual({
			pending: pending.get(), text: drafts.getDraft(existing.mainChat.get().resource).get().inputText, destinations, intakes: service.intakes.get(),
		}, { pending: existing, text: 'Concurrent task', destinations: [], intakes: [source] });
	});

	test('cloud revalidates provider actions and target availability after review', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const options: ISetupOptions = { catalog: [source], actions: [cloudAction()], context: 'Reviewed task', confirm: true };
		const { service, destinations, trustRequests } = setup(options);
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		options.onConfirm = () => { options.actions = []; };
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /no longer available/);
		options.actions = [cloudAction()];
		options.onConfirm = () => { options.cloudTargetAvailable = false; };
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /no longer available/);
		assert.deepStrictEqual({ destinations, trustRequests, busy: service.getPresentation(source).get().busy }, {
			destinations: [], trustRequests: [], busy: false,
		});
	});

	test('cloud requests normal resource trust when the returned workspace requires it and honors refusal', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const workspace = { ...setupWorkspace(true), requiresWorkspaceTrust: true };
		const { service, drafts, destinations, pending, trustRequests, counts } = setup({
			catalog: [source], actions: [cloudAction(workspace)], context: 'Reviewed task', confirm: true, trusted: false,
		});
		drafts.setDraft(source.mainChat.get().resource, { inputText: 'Private source note', attachments: [] });
		const before = drafts.getDraft(source.mainChat.get().resource).get();
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		const result = await service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		assert.deepStrictEqual({
			result, destinations, pending: pending.get(), trust: trustRequests.map(request => request.uri),
			draft: drafts.getDraft(source.mainChat.get().resource).get(), busy: service.getPresentation(source).get().busy, counts: counts(),
		}, {
			result: { kind: 'cancelled' }, destinations: [], pending: undefined, trust: [workspace.folders[0].root],
			draft: before, busy: false, counts: { creates: 0, sends: 0, loads: 0 },
		});
	});

	test('cloud creates only after trust for the resolved workspace and rechecks the pending draft after that await', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const workspace = { ...setupWorkspace(true), requiresWorkspaceTrust: true };
		const options: ISetupOptions = {
			catalog: [source], actions: [cloudAction()], cloudWorkspace: workspace, context: 'Reviewed task', confirm: true, trusted: true,
		};
		const { service, drafts, pending, destinations, trustRequests, counts } = setup(options);
		const existing = intake('opened-during-trust');
		options.onTrust = () => { pending.set(existing, undefined); };
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /Another draft was opened/);
		assert.deepStrictEqual({ pending: pending.get(), destinations, trust: trustRequests.map(request => request.uri) }, {
			pending: existing, destinations: [], trust: [workspace.folders[0].root],
		});
		pending.set(undefined, undefined);
		options.onTrust = undefined;
		const result = await service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		assert.ok(result.kind === 'destination');
		assert.deepStrictEqual({
			source: result.source, pending: pending.get(), status: result.session.status.get(),
			text: drafts.getDraft(result.session.mainChat.get().resource).get().inputText,
			trust: trustRequests.map(request => request.uri), count: destinations.length, counts: counts(),
		}, {
			source, pending: result.session, status: SessionStatus.Untitled, text: 'Reviewed task',
			trust: [workspace.folders[0].root, workspace.folders[0].root], count: 1, counts: { creates: 0, sends: 0, loads: 0 },
		});
	});

	test('cloud rejects a changed destination after trust instead of carrying trust to a different workspace', async () => {
		const source = intake('source');
		source.status.set(SessionStatus.Completed, undefined);
		const workspace = { ...setupWorkspace(true), requiresWorkspaceTrust: true };
		const options: ISetupOptions = {
			catalog: [source], actions: [cloudAction(workspace)], cloudWorkspace: workspace, context: 'Reviewed task', confirm: true, trusted: true,
		};
		const { service, destinations } = setup(options);
		options.onTrust = () => { options.cloudWorkspace = { ...workspace, uri: URI.parse('https://github.com/example/other') }; };
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		await assert.rejects(service.runAlternative(source, discovery.alternatives[0].id, discovery.revision), /no longer available/);
		assert.deepStrictEqual(destinations, []);
	});

	test('cloud handoff follows canonical source replacement without copying private evidence', async () => {
		const source = intake('source');
		const canonical = intake('canonical');
		source.status.set(SessionStatus.Completed, undefined);
		canonical.status.set(SessionStatus.Completed, undefined);
		const options: ISetupOptions = { catalog: [source], actions: [cloudAction()], context: 'Reviewed task', confirm: true };
		const { service, drafts, replaced, catalog } = setup(options);
		const original = { inputText: 'Private note', attachments: [{ kind: 'file' as const, id: 'evidence', name: 'Evidence', value: URI.file('/private.png') }] };
		drafts.setDraft(source.mainChat.get().resource, original);
		options.onContext = () => {
			catalog.splice(0, 1, canonical);
			replaced.fire({ from: source, to: canonical });
		};
		const discovery = await service.refresh(source, { repository: { owner: 'example', repo: 'project' } });
		const result = await service.runAlternative(source, discovery.alternatives[0].id, discovery.revision);
		assert.ok(result.kind === 'destination');
		const destination = drafts.getDraft(result.session.mainChat.get().resource).get();
		assert.deepStrictEqual({
			source: result.source, intakes: service.intakes.get(),
			sourceDraft: drafts.getDraft(canonical.mainChat.get().resource).get(),
			text: destination.inputText, copiedFiles: destination.attachments.filter(attachment => attachment.kind === 'file'),
			canonicalReference: String(destination.attachments[0].value).includes(canonical.resource.toString()),
		}, { source: canonical, intakes: [canonical], sourceDraft: original, text: 'Reviewed task', copiedFiles: [], canonicalReference: true });
	});
});
