/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatModeKind, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChat, ISession, SessionStatus, ChatInteractivity } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { OmniSessionRoutingAdapter } from '../../browser/omniSessionRoutingAdapter.contribution.js';

suite('OmniSessionRoutingAdapter', () => {

	const store = new DisposableStore();
	let managementService: TestSessionsManagementService;
	let opened: URI[];
	let adapter: OmniSessionRoutingAdapter;

	setup(() => {
		managementService = store.add(new TestSessionsManagementService());
		opened = [];
		adapter = store.add(new OmniSessionRoutingAdapter(
			managementService,
			upcastPartial<ISessionsService>({
				openSession: async resource => { opened.push(resource); },
			}),
		));
	});

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('aggregates provider-neutral sessions and filters drafts, archived, and non-routable chats', () => {
		managementService.sessions = [
			createSession('provider-a:one', { providerId: 'provider-a', title: 'One', description: 'First session', repository: 'vscode', status: SessionStatus.InProgress }),
			createSession('provider-b:two', { providerId: 'provider-b', title: 'Two', status: SessionStatus.Completed }),
			createSession('provider-a:draft', { status: SessionStatus.Untitled }),
			createSession('provider-a:archived', { archived: true }),
			createSession('provider-a:readonly', { interactivity: ChatInteractivity.ReadOnly }),
		];

		assert.deepStrictEqual(adapter.getCandidateSessions(CancellationToken.None), [
			{
				sessionId: 'provider-a:one',
				label: 'One',
				repo: 'microsoft/vscode',
				cwd: '/work/vscode',
				status: 'working',
				lastActivity: Date.parse('2026-08-13T12:00:00Z'),
				description: 'First session',
			},
			{
				sessionId: 'provider-b:two',
				label: 'Two',
				repo: 'microsoft/repo',
				cwd: '/work/repo',
				status: 'idle',
				lastActivity: Date.parse('2026-08-13T12:00:00Z'),
				description: undefined,
			},
		]);
	});

	test('refreshes on lifecycle changes and rejects a removed provider session', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		managementService.fireSessionsChanged({ added: [session], removed: [], changed: [] });
		assert.deepStrictEqual(adapter.getCandidateSessions(CancellationToken.None).map(candidate => candidate.sessionId), ['provider:session']);

		managementService.sessions = [];
		managementService.fireSessionsChanged({ added: [], removed: [session], changed: [] });

		assert.deepStrictEqual({
			candidates: adapter.getCandidateSessions(CancellationToken.None),
			dispatch: await adapter.dispatchToSession(session.sessionId, 'Continue', {}, CancellationToken.None),
		}, {
			candidates: [],
			dispatch: {
				status: 'rejected',
				reasonCode: 'providerRemoved',
				reason: 'The selected session is no longer available.',
			},
		});
	});

	test('returns an explicit rejection when the owning provider disappears during dispatch', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		managementService.sendError = new Error(`Sessions provider 'provider' not found`);

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {}, CancellationToken.None);

		assert.deepStrictEqual(result, {
			status: 'rejected',
			resource: session.resource,
			reason: `Sessions provider 'provider' not found`,
		});
	});

	test('sends existing sessions through Sessions management with attachments in the background', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file', name: 'file' });

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {
			attachedContext: [attachment],
			userSelectedTools: constObservable({ tool: true }),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			send: managementService.existingSend,
		}, {
			result: { status: 'sent', resource: session.resource },
			send: {
				session,
				chat: session.mainChat.get(),
				options: { query: 'Continue', attachedContext: [attachment], background: true },
			},
		});
	});

	test('creates and sends a folder session with supported model, mode, permission, and attachments', async () => {
		const created = createSession('provider:created');
		managementService.createdSession = created;
		const folder = URI.file('/work/repo');
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file', name: 'file' });

		const result = await adapter.dispatchToNewSession(folder, 'Build it', {
			attachedContext: [attachment],
			userSelectedModelId: 'model',
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: ChatPermissionLevel.AutoApprove,
			},
		}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			folderSend: managementService.folderSend,
		}, {
			result: { status: 'sent', resource: created.resource },
			folderSend: {
				folder,
				options: { query: 'Build it', attachedContext: [attachment], background: true },
				createOptions: { modelId: 'model', modeId: 'agent', permissionLevel: ChatPermissionLevel.AutoApprove },
			},
		});
	});

	test('creates and sends a quick chat when no folder is selected', async () => {
		const created = createSession('provider:quick');
		managementService.createdSession = created;

		const result = await adapter.dispatchToNewSession(undefined, 'Explain this', {}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			quickSend: managementService.quickSend,
		}, {
			result: { status: 'sent', resource: created.resource },
			quickSend: {
				options: { query: 'Explain this', attachedContext: undefined, background: true },
				createOptions: undefined,
			},
		});
	});

	test('rejects unsupported request context instead of dropping it', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {
			userSelectedTools: constObservable({ tool: false }),
		}, CancellationToken.None);

		assert.deepStrictEqual(result, {
			status: 'rejected',
			reasonCode: 'unsupportedOptions',
			reason: 'The selected tool configuration cannot be sent through Sessions.',
		});
		assert.strictEqual(managementService.existingSend, undefined);
	});

	test('rejects cancelled sends before dispatch', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		const cts = new CancellationTokenSource();
		cts.cancel();

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {}, cts.token);

		assert.deepStrictEqual(result, {
			status: 'rejected',
			resource: undefined,
			reasonCode: 'cancelled',
			reason: 'The request was cancelled.',
		});
		assert.strictEqual(managementService.existingSend, undefined);
		cts.dispose();
	});

	test('opens adapter results through Sessions service', async () => {
		const resource = URI.parse('session:/provider/session');

		await adapter.revealSession(resource);

		assert.deepStrictEqual(opened, [resource]);
	});
});

class TestSessionsManagementService extends mock<ISessionsManagementService>() {
	declare readonly _serviceBrand: undefined;

	private readonly sessionsChangedEmitter = new Emitter<ISessionsChangeEvent>();
	private readonly sessionTypesChangedEmitter = new Emitter<void>();
	override readonly onDidChangeSessions = this.sessionsChangedEmitter.event;
	override readonly onDidChangeSessionTypes = this.sessionTypesChangedEmitter.event;

	sessions: ISession[] = [];
	createdSession: ISession | undefined;
	sendError: Error | undefined;
	existingSend: { session: ISession; chat: IChat; options: ISendRequestOptions } | undefined;
	folderSend: { folder: URI; options: ISendRequestOptions; createOptions: ICreateNewSessionOptions | undefined } | undefined;
	quickSend: { options: ISendRequestOptions; createOptions: ICreateNewSessionOptions | undefined } | undefined;

	override getSessions(): ISession[] {
		return this.sessions;
	}

	override getSession(resource: URI): ISession | undefined {
		return this.sessions.find(session => session.resource.toString() === resource.toString());
	}

	override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
		for (const session of this.sessions) {
			const chat = session.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
			if (chat) {
				return { session, chat };
			}
		}
		return undefined;
	}

	override async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		if (this.sendError) {
			throw this.sendError;
		}
		this.existingSend = { session, chat, options };
	}

	override async createAndSendNewChatRequest(folder: URI, options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined> {
		this.folderSend = { folder, options, createOptions };
		return this.createdSession;
	}

	override async createAndSendQuickChatRequest(options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined> {
		this.quickSend = { options, createOptions };
		return this.createdSession;
	}

	fireSessionsChanged(event: ISessionsChangeEvent): void {
		this.sessionsChangedEmitter.fire(event);
	}

	dispose(): void {
		this.sessionsChangedEmitter.dispose();
		this.sessionTypesChangedEmitter.dispose();
	}
}

function createSession(sessionId: string, options: {
	readonly providerId?: string;
	readonly title?: string;
	readonly description?: string;
	readonly repository?: string;
	readonly status?: SessionStatus;
	readonly archived?: boolean;
	readonly interactivity?: ChatInteractivity;
} = {}): ISession {
	const providerId = options.providerId ?? 'provider';
	const status = options.status ?? SessionStatus.Completed;
	const repository = options.repository ?? 'repo';
	const resource = URI.parse(`session:/${sessionId}`);
	const chat = upcastPartial<IChat>({
		resource: URI.parse(`chat:/${sessionId}`),
		createdAt: new Date('2026-08-13T10:00:00Z'),
		title: constObservable(options.title ?? sessionId),
		updatedAt: constObservable(new Date('2026-08-13T12:00:00Z')),
		status: constObservable(status),
		isArchived: constObservable(options.archived ?? false),
		interactivity: constObservable(options.interactivity ?? ChatInteractivity.Full),
	});
	return upcastPartial<ISession>({
		sessionId,
		resource,
		providerId,
		sessionType: 'test',
		createdAt: new Date('2026-08-13T10:00:00Z'),
		title: constObservable(options.title ?? sessionId),
		updatedAt: constObservable(new Date('2026-08-13T12:00:00Z')),
		status: constObservable(status),
		isArchived: constObservable(options.archived ?? false),
		isAutomation: constObservable(false),
		description: constObservable(options.description ? { value: options.description } : undefined),
		lastTurnEnd: constObservable(new Date('2026-08-13T12:00:00Z')),
		workspace: constObservable({
			uri: URI.file(`/work/${repository}`),
			label: repository,
			icon: { id: 'folder' },
			folders: [{
				root: URI.file(`/work/${repository}`),
				workingDirectory: URI.file(`/work/${repository}`),
				name: repository,
				description: undefined,
				gitRepository: {
					uri: URI.file(`/work/${repository}`),
					workTreeUri: undefined,
					baseBranchName: undefined,
					gitHubInfo: constObservable({ owner: 'microsoft', repo: repository }),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		chats: constObservable([chat]),
		mainChat: constObservable(chat),
	});
}
