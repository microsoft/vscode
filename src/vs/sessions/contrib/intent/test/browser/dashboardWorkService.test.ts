/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, ISessionWorkspace, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, IProviderSessionType, ISessionsChangeEvent, ISessionsManagementService, NewSessionRequestOptions } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { createWorkTestSession } from '../../../../services/sessions/test/common/sessionWorkTestUtils.js';
import { DashboardWorkService } from '../../browser/dashboardWorkService.js';
import { WorkspaceCandidateResolver } from '../../browser/workspaceCandidates.js';
import { IDashboardStartWork } from '../../common/dashboardWork.js';
import { IWorkspaceCandidate } from '../../common/sessionIntent.js';

suite('Dashboard-only agent work', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/projects/hello');
	function setup() {
		const instantiation = store.add(new TestInstantiationService());
		const regular = createWorkTestSession(URI.parse('test:/regular-cloud-draft')).session;
		const sourceBase = createWorkTestSession(URI.parse('test:/dashboard'));
		sourceBase.chat.status.set(SessionStatus.Untitled, undefined);
		const source: ISession = { ...sourceBase.session, status: sourceBase.chat.status, workspace: constObservable(undefined), isQuickChat: constObservable(true) };
		const childModel = createWorkTestSession(URI.parse('test:/child'));
		const child: ISession = { ...childModel.session, status: childModel.chat.status };
		const pending = observableValue<ISession | undefined>('regularDraft', regular);
		const replaced = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const deleted = store.add(new Emitter<ISession>());
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const known = [regular, source, child];
		const target: IProviderSessionType = {
			providerId: 'local', sessionType: {
				id: 'copilot', label: 'Local Copilot', icon: Codicon.copilot,
				authRequirement: SessionTypeAuthRequirement.None, supportsWorkspaceConversion: true, supportsWorktreeConfiguration: true
			}
		};
		const workspace = {
			uri: folder, label: 'hello', icon: Codicon.repo, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			folders: [{ root: folder, workingDirectory: folder, name: 'hello', description: undefined }]
		};
		const candidate: IWorkspaceCandidate = {
			kind: 'local', id: 'checkout', revision: 1, folder, repository: { owner: 'example', repo: 'hello' },
			validation: 'verified', reason: 'Known checkout', worktree: 'available', worktreeReason: 'Git commit available'
		};
		const requests: { session: ISession; query: string; context: readonly IChatRequestVariableEntry[] | undefined; preserve: boolean | undefined }[] = [];
		const executions: ICreateNewSessionOptions[] = [];
		const executionFolders: (URI | undefined)[] = [];
		const backgroundRequests: NewSessionRequestOptions[] = [];
		const targets = new ResourceMap<readonly IProviderSessionType[]>([[folder, [target]]]);
		const workspaces = new ResourceMap<{ providerId: string; workspace: ISessionWorkspace }>([[folder, { providerId: target.providerId, workspace }]]);
		let draftCreates = 0;
		let discoveryCalls = 0;
		let failExecution: Error | undefined;
		const controls = { targetAvailable: true, trust: async () => true };
		let history: readonly string[] | undefined;
		const historyLoads: URI[] = [];
		let releasedReferences = 0;
		const draftStates = new ResourceMap<ReturnType<typeof observableValue<ISessionInputDraft>>>();
		const getDraft = (resource: URI) => {
			let draft = draftStates.get(resource);
			if (!draft) { draft = observableValue<ISessionInputDraft>('draft', { inputText: '', attachments: [] }); draftStates.set(resource, draft); }
			return draft;
		};
		instantiation.stubInstance(WorkspaceCandidateResolver, {
			resolve: async (_intent, revision) => { discoveryCalls++; return [{ ...candidate, revision }]; },
			validate: async (_folder, revision) => ({ ...candidate, revision }),
		});
		instantiation.stub(ISessionsManagementService, {
			newSession: pending, onDidChangeSessions: changed.event, onDidReplaceSession: replaced.event, onDidDeleteSession: deleted.event,
			getQuickChatSessionTypes: () => [target], getSessionTypesForFolder: folder => [...targets.get(folder) ?? []],
			getSession: resource => known.find(session => session.resource.toString() === resource.toString()), getSessions: () => known,
			createSessionDraft: () => { draftCreates++; return source; },
			sendSessionDraft: async (session, options) => {
				requests.push({ session, query: options.query, context: options.attachedContext, preserve: options.preservePendingDraft });
				sourceBase.chat.status.set(SessionStatus.Completed, undefined);
				return source;
			},
			sendRequest: async (session, _chat, options) => { requests.push({ session, query: options.query, context: options.attachedContext, preserve: options.preservePendingDraft }); },
			discardSessionDraft: () => { },
			isNewSessionTargetAvailable: () => controls.targetAvailable, resolveWorkspace: folder => workspaces.get(folder),
			createAndSendNewChatRequest: async (folder, request, options) => {
				executions.push(options!);
				executionFolders.push(folder);
				backgroundRequests.push(request);
				options?.onSessionCreated?.(child);
				if (failExecution) { throw failExecution; }
				return child;
			},
		});
		const provider: ISessionsProvider = new class extends mock<ISessionsProvider>() {
			override readonly id = 'local';
			override readonly label = 'Local';
			override readonly supportsLocalWorkspaces = true;
			override readonly workspaceIntentActions = [];
		}();
		const providers: ISessionsProvider[] = [provider];
		instantiation.stub(ISessionsProvidersService, { getProvider: <T extends ISessionsProvider>(id: string) => providers.find(provider => provider.id === id) as T | undefined, getProviders: () => providers });
		instantiation.stub(ISessionInputDraftService, { getDraft, setDraft: (resource, draft) => getDraft(resource).set(draft, undefined), rebindDraft: () => { } });
		instantiation.stub(IChatEntitlementService, { sentiment: { hidden: false } });
		instantiation.stub(IFileService, { stat: async () => new class extends mock<IFileStatWithMetadata>() { override readonly isDirectory = true; }() });
		instantiation.stub(IWorkspaceTrustRequestService, { requestResourcesTrust: () => controls.trust() });
		instantiation.stub(IChatService, {
			acquireOrLoadSession: async resource => {
				historyLoads.push(resource);
				if (!history) { return undefined; }
				const requests = history.map(text => upcastPartial<IChatRequestModel>({
					response: upcastPartial<IChatResponseModel>({ response: upcastPartial<IResponse>({ toString: () => text }) }),
				}));
				return { object: upcastPartial<IChatModel>({ getRequests: () => requests }), dispose: () => { releasedReferences++; } };
			},
		});
		const storage = store.add(new InMemoryStorageService());
		instantiation.stub(IStorageService, storage);
		instantiation.stub(ILogService, new NullLogService());
		const service = store.add(instantiation.createInstance(DashboardWorkService));
		return {
			service, source, regular, child, pending, requests, executions, replaced, deleted, changed, instantiation, storage, known, providers, targets, workspaces, workspace, target, candidate, controls,
			childStatus: childModel.chat.status, executionFolders, backgroundRequests,
			setHistory: (value: readonly string[]) => { history = value; }, historyLoads, releasedReferences: () => releasedReferences,
			counts: () => ({ draftCreates, discoveryCalls }), failExecution: (error: Error) => { failExecution = error; }
		};
	}

	async function prepareWork(h: ReturnType<typeof setup>): Promise<IDashboardStartWork> {
		await h.service.start();
		await h.service.send(h.source, 'Add a hello world extension', []);
		const discovery = await h.service.discover(h.source, undefined, CancellationToken.None);
		return { operationId: 'implementation', targetId: discovery.targets[0].id, revision: discovery.revision, title: 'Hello extension', prompt: 'Implement the extension' };
	}

	test('starts workspace-less work without adopting or replacing a regular cloud draft', async () => {
		const h = setup();
		const created = await h.service.start();
		assert.deepStrictEqual({
			created: created.resource, workspace: created.workspace.get(), regular: h.pending.get()?.resource,
			ordinaryHasTools: h.service.getSessionForChat(h.regular.mainChat.get().resource) !== undefined,
			counts: h.counts(),
		}, { created: h.source.resource, workspace: undefined, regular: h.regular.resource, ordinaryHasTools: false, counts: { draftCreates: 1, discoveryCalls: 0 } });
	});

	test('only dashboard messages receive orchestration context and preserve the ordinary draft', async () => {
		const h = setup();
		await h.service.start();
		await h.service.send(h.source, 'Add a hello world extension', []);
		await h.service.send(h.source, 'Continue', []);
		await assert.rejects(() => h.service.send(h.regular, 'Do not change me', []), /only to a dashboard/);
		assert.deepStrictEqual({
			requests: h.requests.map(request => ({ prompt: request.query, preserve: request.preserve, instructions: String(request.context?.[0].value).includes('dashboard_discover_work') })),
			regular: h.pending.get()?.resource,
		}, { requests: [{ prompt: 'Add a hello world extension', preserve: true, instructions: true }, { prompt: 'Continue', preserve: true, instructions: true }], regular: h.regular.resource });
	});

	test('discovers facts without selecting a workspace or executing anything', async () => {
		const h = setup();
		await h.service.start();
		const discovery = await h.service.discover(h.source, undefined, CancellationToken.None);
		assert.deepStrictEqual({
			candidates: discovery.candidates.map(candidate => candidate.folder.toString()),
			targets: discovery.targets.map(target => [target.kind, target.folder.toString(), target.supportsWorktree]),
			workspace: h.source.workspace.get(), starts: h.executions.length,
		}, { candidates: [folder.toString()], targets: [['local', folder.toString(), true]], workspace: undefined, starts: 0 });
	});

	test('agent-selected execution starts once, uses isolation and leaves regular work untouched', async () => {
		const h = setup();
		await h.service.start();
		const discovery = await h.service.discover(h.source, undefined, CancellationToken.None);
		const request: IDashboardStartWork = { operationId: 'implementation', targetId: discovery.targets[0].id, revision: discovery.revision, title: 'Hello extension', prompt: 'Implement the extension' };
		const first = await h.service.startWork(h.source, request, CancellationToken.None);
		const second = await h.service.startWork(h.source, request, CancellationToken.None);
		assert.deepStrictEqual({
			same: first === second, starts: h.executions.length, isolation: h.executions[0].isolationMode,
			phase: first.phase, child: first.sessionResource, regular: h.pending.get()?.resource,
		}, { same: true, starts: 1, isolation: 'worktree', phase: 'started', child: h.child.resource, regular: h.regular.resource });
		await assert.rejects(() => h.service.startWork(h.source, { ...request, prompt: 'Different task' }, CancellationToken.None), /different work/);
	});

	test('an uncertain execution is not silently restarted with the same operation ID', async () => {
		const h = setup();
		await h.service.start();
		const discovery = await h.service.discover(h.source, undefined, CancellationToken.None);
		const request: IDashboardStartWork = { operationId: 'implementation', targetId: discovery.targets[0].id, revision: discovery.revision, title: 'Hello extension', prompt: 'Implement' };
		h.failExecution(new Error('Connection lost after creation'));
		await assert.rejects(() => h.service.startWork(h.source, request, CancellationToken.None), /Connection lost/);
		await assert.rejects(() => h.service.startWork(h.source, request, CancellationToken.None), /Connection lost/);
		assert.deepStrictEqual({ starts: h.executions.length, phase: h.service.executions.get()[0].phase }, { starts: 1, phase: 'unknown' });
	});

	test('an available folder without worktree support overrides the provider isolation default', async () => {
		const h = setup();
		h.instantiation.stubInstance(WorkspaceCandidateResolver, {
			resolve: async (_intent, revision) => [{ ...h.candidate, revision, worktree: 'unavailable' }],
			validate: async () => h.candidate,
		});
		const request = await prepareWork(h);
		await h.service.startWork(h.source, request, CancellationToken.None);
		assert.strictEqual(h.executions[0].isolationMode, 'workspace');
	});

	test('a clone survives parent publication and the same operation never clones twice', async () => {
		const h = setup();
		const cloned = new DeferredPromise<void>();
		let clones = 0;
		h.providers.push(new class extends mock<ISessionsProvider>() {
			override readonly id = 'clone';
			override readonly workspaceIntentActions = [{
				id: 'clone', kind: 'clone' as const, label: 'Clone', availability: 'unknown' as const, reason: 'Access is not checked',
				run: async () => { clones++; await cloned.p; return { kind: 'selected' as const, workspace: h.workspace }; },
			}];
		}());
		await h.service.start();
		await h.service.send(h.source, 'Add a hello world extension', []);
		const first = h.service.cloneRepository(h.source, 'checkout', 'https://github.com/example/hello', folder, CancellationToken.None);
		const replacement = { ...h.source, resource: URI.parse('test:/published-source') };
		h.known[h.known.indexOf(h.source)] = replacement;
		h.replaced.fire({ from: h.source, to: replacement });
		const second = h.service.cloneRepository(replacement, 'checkout', 'https://github.com/example/hello', folder, CancellationToken.None);
		await cloned.complete();
		await Promise.all([first, second]);
		await h.service.cloneRepository(replacement, 'checkout', 'https://github.com/example/hello', folder, CancellationToken.None);
		assert.deepStrictEqual({ clones, operations: h.service.executions.get().map(operation => [operation.source, operation.phase]) },
			{ clones: 1, operations: [[replacement.resource, 'started']] });
	});

	test('a newer discovery supersedes an older asynchronous result', async () => {
		const h = setup();
		const first = new DeferredPromise<IWorkspaceCandidate[]>();
		const second = new DeferredPromise<IWorkspaceCandidate[]>();
		h.instantiation.stubInstance(WorkspaceCandidateResolver, { resolve: (_intent, revision) => revision === 1 ? first.p : second.p });
		await h.service.start();
		const stale = assert.rejects(h.service.discover(h.source, undefined, CancellationToken.None), CancellationError);
		const latest = h.service.discover(h.source, undefined, CancellationToken.None);
		await second.complete([{ ...h.candidate, revision: 2 }]);
		const discovery = await latest;
		await first.complete([{ ...h.candidate, revision: 1 }]);
		await stale;
		assert.strictEqual(h.service.resolveTarget(h.source, discovery.targets[0].id, discovery.revision).revision, 2);
	});

	test('revalidates the provider after the asynchronous trust decision', async () => {
		const h = setup();
		h.workspace.requiresWorkspaceTrust = true;
		h.controls.trust = async () => { h.controls.targetAvailable = false; return true; };
		const request = await prepareWork(h);
		await assert.rejects(h.service.startWork(h.source, request, CancellationToken.None), /no longer available/);
		assert.deepStrictEqual({ starts: h.executions.length, phase: h.service.executions.get()[0].phase }, { starts: 0, phase: 'failed' });
	});

	test('wait follows a worker replacement and returns when it needs input', async () => {
		const h = setup();
		const request = await prepareWork(h);
		h.childStatus.set(SessionStatus.InProgress, undefined);
		await h.service.startWork(h.source, request, CancellationToken.None);
		const result = h.service.readWork(h.source, request.operationId, CancellationToken.None, true);
		const replacement = { ...h.child, resource: URI.parse('test:/published-child'), status: constObservable(SessionStatus.NeedsInput) };
		h.known[h.known.indexOf(h.child)] = replacement;
		h.replaced.fire({ from: h.child, to: replacement });
		const read = await result;
		assert.deepStrictEqual({ status: read.status, resource: read.execution.sessionResource, starts: h.executions.length },
			{ status: 'inputNeeded', resource: replacement.resource, starts: 1 });
	});

	test('waiting is cancellable and does not stop or restart the worker', async () => {
		const h = setup();
		const request = await prepareWork(h);
		h.childStatus.set(SessionStatus.InProgress, undefined);
		await h.service.startWork(h.source, request, CancellationToken.None);
		const cancellation = store.add(new CancellationTokenSource());
		const result = assert.rejects(h.service.readWork(h.source, request.operationId, cancellation.token, true), CancellationError);
		cancellation.cancel();
		await result;
		assert.deepStrictEqual({ status: h.childStatus.get(), starts: h.executions.length }, { status: SessionStatus.InProgress, starts: 1 });
	});

	test('explicit output reads load only the worker, keep the last three responses, and report the character bound', async () => {
		const h = setup();
		const request = await prepareWork(h);
		await h.service.startWork(h.source, request, CancellationToken.None);
		const loadsBeforeRead = h.historyLoads.length;
		h.setHistory(['ignored', 'one', 'two', 'three']);
		const short = await h.service.readWork(h.source, request.operationId, CancellationToken.None);
		h.setHistory(['ignored', 'prefix', 'x'.repeat(21000), 'tail']);
		const long = await h.service.readWork(h.source, request.operationId, CancellationToken.None);
		assert.deepStrictEqual({
			loadsBeforeRead, short: short.output, long: long.output, truncated: [short.truncated, long.truncated],
			resources: h.historyLoads, released: h.releasedReferences(),
		}, {
			loadsBeforeRead: 0, short: 'one\n\ntwo\n\nthree', long: `${'x'.repeat(19994)}\n\ntail`, truncated: [false, true],
			resources: [h.child.mainChat.get().resource, h.child.mainChat.get().resource], released: 2,
		});
	});

	test('canonical parent replacement preserves ownership even when its main chat keeps its resource', async () => {
		const h = setup();
		const request = await prepareWork(h);
		await h.service.startWork(h.source, request, CancellationToken.None);
		const replacement = { ...h.source, resource: URI.parse('test:/published-parent') };
		h.known[h.known.indexOf(h.source)] = replacement;
		h.replaced.fire({ from: h.source, to: replacement });
		const execution = await h.service.startWork(h.source, request, CancellationToken.None);
		assert.deepStrictEqual({ source: execution.source, owner: h.service.getSessionForChat(h.source.mainChat.get().resource)?.resource, starts: h.executions.length },
			{ source: replacement.resource, owner: replacement.resource, starts: 1 });
	});

	test('restoration preserves uncertain starts without creating another worker', async () => {
		const h = setup();
		const request = await prepareWork(h);
		await h.service.startWork(h.source, request, CancellationToken.None);
		const execution = h.service.executions.get()[0];
		h.service.dispose();
		h.storage.store('sessions.dashboard.agentWork', JSON.stringify({
			version: 1, sessions: [h.source.resource.toString()],
			executions: [{ fingerprint: JSON.stringify(request), state: { ...execution, source: execution.source.toString(), sessionResource: execution.sessionResource?.toString(), phase: 'starting' } }],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const restored = store.add(h.instantiation.createInstance(DashboardWorkService));
		const state = await restored.startWork(h.source, request, CancellationToken.None);
		assert.deepStrictEqual({ starts: h.executions.length, phase: state.phase }, { starts: 1, phase: 'unknown' });
	});

	test('invalid saved records do not partially enroll ordinary conversations', () => {
		const h = setup();
		h.service.dispose();
		h.storage.store('sessions.dashboard.agentWork', JSON.stringify({
			version: 1, sessions: [h.regular.resource.toString()],
			executions: [{ fingerprint: 'invalid', state: { id: 'invalid', source: h.regular.resource.toString(), phase: 'invented' } }],
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const restored = store.add(h.instantiation.createInstance(DashboardWorkService));
		assert.deepStrictEqual({ owned: restored.sessions.get(), work: restored.executions.get() }, { owned: [], work: [] });
	});

	test('discovers and starts an exact cloud target without a picker or inherited context', async () => {
		const h = setup();
		const cloudFolder = URI.parse('test-cloud:/example/hello');
		const cloudWorkspace: ISessionWorkspace = {
			...h.workspace, uri: cloudFolder, isVirtualWorkspace: true,
			folders: [{ ...h.workspace.folders[0], root: cloudFolder, workingDirectory: cloudFolder }],
		};
		const cloudType = { ...h.target.sessionType, id: 'cloud', supportsWorktreeConfiguration: false };
		let pickerCalls = 0;
		h.providers.push(new class extends mock<ISessionsProvider>() {
			override readonly id = 'cloud';
			override readonly label = 'Cloud';
			override readonly supportsLocalWorkspaces = false;
			override getSessionTypes() { return [cloudType]; }
			override readonly workspaceIntentActions = [{
				id: 'cloud', kind: 'cloud' as const, label: 'Cloud', availability: 'unknown' as const, reason: 'Access must be checked',
				resolveRepositoryWorkspace: () => cloudWorkspace,
				run: async () => { pickerCalls++; return { kind: 'cancelled' as const }; },
			}];
		}());
		h.targets.set(cloudFolder, [{ providerId: 'cloud', sessionType: cloudType }]);
		h.workspaces.set(cloudFolder, { providerId: 'cloud', workspace: cloudWorkspace });
		await h.service.start();
		const discovery = await h.service.discover(h.source, 'https://github.com/example/hello', CancellationToken.None);
		const target = discovery.targets.find(target => target.kind === 'cloud');
		assert.ok(target);
		await h.service.startWork(h.source, { operationId: 'cloud-work', targetId: target.id, revision: discovery.revision, title: 'Cloud work', prompt: 'Verify extension packaging' }, CancellationToken.None);
		assert.deepStrictEqual({
			pickerCalls, availability: target.availability, folders: h.executionFolders, provider: h.executions[0].providerId,
			isolation: h.executions[0].isolationMode, request: h.backgroundRequests[0], ordinary: h.pending.get()?.resource,
		}, {
			pickerCalls: 0, availability: 'unknown', folders: [cloudFolder], provider: 'cloud', isolation: undefined,
			request: { query: 'Verify extension packaging', preservePendingDraft: true }, ordinary: h.regular.resource,
		});
	});

	test('known remote workspaces remain explicitly unverified execution choices', async () => {
		const h = setup();
		const remoteFolder = URI.parse('test-remote://host/projects/hello');
		const workspace: ISessionWorkspace = { ...h.workspace, uri: remoteFolder, folders: [{ ...h.workspace.folders[0], root: remoteFolder, workingDirectory: remoteFolder }] };
		h.known.push({ ...h.child, providerId: 'remote', workspace: constObservable(workspace) });
		h.providers.push(new class extends mock<ISessionsProvider>() {
			override readonly id = 'remote';
			override readonly label = 'Remote host';
			override readonly supportsLocalWorkspaces = false;
			override getSessionTypes() { return [h.target.sessionType]; }
			override readonly workspaceIntentActions = [];
		}());
		await h.service.start();
		const discovery = await h.service.discover(h.source, undefined, CancellationToken.None);
		assert.deepStrictEqual(discovery.targets.filter(target => target.kind === 'remote').map(target => ({ folder: target.folder, availability: target.availability })),
			[{ folder: remoteFolder, availability: 'unknown' }]);
	});

	test('does not impose a dashboard-specific execution quota', async () => {
		const h = setup();
		const request = await prepareWork(h);
		for (let index = 0; index < 26; index++) {
			await h.service.startWork(h.source, { ...request, operationId: `work-${index}` }, CancellationToken.None);
		}
		assert.strictEqual(h.executions.length, 26);
	});
});
