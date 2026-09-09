/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ISessionsTasksService } from '../../../chat/browser/sessionsTasksService.js';
import { ChatInteractivity, IChat, ISession, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsWindowUsageService } from '../../../../services/sessions/browser/sessionsWindowUsageService.js';
import { SessionsTelemetryContribution } from '../../browser/sessionsTelemetry.contribution.js';

interface IRequestSentTelemetry {
	readonly isNewSession: boolean;
	readonly isNewChat: boolean;
	readonly totalAttachementCount: number;
	readonly attachmentKinds: string;
}

interface ISessionCountsTelemetry {
	readonly currentWorkspaceInProgress: number;
	readonly currentWorkspaceUnread: number;
	readonly currentWorkspaceWaitingForInput: number;
	readonly currentWorkspaceNotDone: number;
	readonly allWorkspacesInProgress: number;
	readonly allWorkspacesUnread: number;
	readonly allWorkspacesWaitingForInput: number;
	readonly allWorkspacesNotDone: number;
}

function isRequestSentTelemetry(data: unknown): data is IRequestSentTelemetry & ISessionCountsTelemetry {
	return typeof data === 'object'
		&& data !== null
		&& typeof Reflect.get(data, 'isNewSession') === 'boolean'
		&& typeof Reflect.get(data, 'isNewChat') === 'boolean'
		&& typeof Reflect.get(data, 'totalAttachementCount') === 'number'
		&& typeof Reflect.get(data, 'attachmentKinds') === 'string';
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly requestSentEvents: IRequestSentTelemetry[] = [];
	readonly sessionCounts: ISessionCountsTelemetry[] = [];
	readonly sessionSummaries: unknown[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName === 'agents/sessionSummary') {
			this.sessionSummaries.push(data);
		}
		if (eventName === 'agents/requestSent' && isRequestSentTelemetry(data)) {
			this.requestSentEvents.push({
				isNewSession: data.isNewSession,
				isNewChat: data.isNewChat,
				totalAttachementCount: data.totalAttachementCount,
				attachmentKinds: data.attachmentKinds,
			});
			this.sessionCounts.push({
				currentWorkspaceInProgress: data.currentWorkspaceInProgress,
				currentWorkspaceUnread: data.currentWorkspaceUnread,
				currentWorkspaceWaitingForInput: data.currentWorkspaceWaitingForInput,
				currentWorkspaceNotDone: data.currentWorkspaceNotDone,
				allWorkspacesInProgress: data.allWorkspacesInProgress,
				allWorkspacesUnread: data.allWorkspacesUnread,
				allWorkspacesWaitingForInput: data.allWorkspacesWaitingForInput,
				allWorkspacesNotDone: data.allWorkspacesNotDone,
			});
		}
	}
}

const chat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(SessionStatus.Completed),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
} satisfies IChat;

const session = {
	sessionId: 'session',
	providerId: 'test',
	resource: URI.parse('test:///session'),
	sessionType: 'test',
	icon: Codicon.vm,
	createdAt: new Date(),
	workspace: constObservable(undefined),
	title: constObservable('Session'),
	updatedAt: constObservable(new Date()),
	status: constObservable(SessionStatus.Completed),
	changesets: constObservable([]),
	changes: constObservable([]),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	loading: constObservable(false),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
	chats: constObservable([chat]),
	mainChat: constObservable(chat),
	capabilities: constObservable({ supportsMultipleChats: true }),
} satisfies ISession;

function createWorkspace(uri: URI, folders: ISessionFolder[] = []): ISessionWorkspace {
	return {
		uri,
		label: 'ws',
		icon: ThemeIcon.fromId('folder'),
		folders,
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

const workspace = createWorkspace(URI.parse('file:///repo'));

suite('SessionsTelemetryContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(sessions: readonly ISession[], activeSession?: IObservable<IActiveSession | undefined>): { telemetryService: TestTelemetryService; storageService: InMemoryStorageService; onDidSendRequest: Emitter<ISendRequestSentEvent>; onDidArchiveSession: Emitter<ISession>; onModelAdded: Emitter<ITextModel> } {
		const onDidSendRequest = disposables.add(new Emitter<ISendRequestSentEvent>());
		const onDidArchiveSession = disposables.add(new Emitter<ISession>());
		const onModelAdded = disposables.add(new Emitter<ITextModel>());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onWillSendRequest = Event.None;
			override readonly onDidSendRequest = onDidSendRequest.event;
			override readonly onDidArchiveSession = onDidArchiveSession.event;
			override readonly onDidUnarchiveSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onDidDeleteChat = Event.None;
			override readonly onDidRenameChat = Event.None;
			override readonly onDidRenameSession = Event.None;
			override readonly onDidChangeSessions = Event.None;
			override getSessions(): ISession[] { return [...sessions]; }
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly visibleSessions = constObservable([]);
			override readonly activeSession = activeSession ?? constObservable(undefined);
			override readonly onDidToggleSessionStickiness = Event.None;
		}();
		const telemetryService = new TestTelemetryService();
		const storageService = disposables.add(new InMemoryStorageService());
		const commandService = new class extends mock<ICommandService>() {
			override readonly onDidExecuteCommand = Event.None;
		}();
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidAddFeedback = Event.None;
			override readonly onDidConvertFeedback = Event.None;
			override readonly onDidAddReply = Event.None;
			override readonly onDidSubmitFeedback = Event.None;
		}();
		const sessionsPartService = new class extends mock<ISessionsPartService>() {
			override readonly onDidToggleMaximizeSession = Event.None;
		}();
		const providersService = new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProviders() { return []; }
		}();
		const tasksService = new class extends mock<ISessionsTasksService>() {
			override readonly onDidRunTask = Event.None;
			override async getAllTasks() { return []; }
		}();
		const modelService = new class extends mock<IModelService>() {
			override readonly onModelAdded = onModelAdded.event;
			override readonly onModelRemoved = Event.None;
			override getModels() { return []; }
		}();

		disposables.add(new SessionsTelemetryContribution(
			sessionsManagementService,
			sessionsService,
			telemetryService,
			new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUri;
			}(),
			storageService,
			new class extends mock<ISearchService>() { }(),
			new class extends mock<IConfigurationService>() { }(),
			commandService,
			feedbackService,
			sessionsPartService,
			providersService,
			tasksService,
			modelService,
			new class extends mock<ISessionsWindowUsageService>() {
				override readonly hadPriorWindowOpen = false;
				override readonly windowOpenCount = 1;
			}(),
		));

		return { telemetryService, storageService, onDidSendRequest, onDidArchiveSession, onModelAdded };
	}

	test('logs requestSent for new sessions, new chats, and follow-up messages', async () => {
		const { telemetryService, onDidSendRequest } = setup([session]);

		onDidSendRequest.fire({ session, chat, isNewSession: true, isNewChat: true, options: { query: 'new session' } });
		onDidSendRequest.fire({ session, chat, isNewSession: false, isNewChat: true, options: { query: 'new chat' } });
		onDidSendRequest.fire({
			session,
			chat,
			isNewSession: false,
			isNewChat: false,
			options: {
				query: 'follow up',
				attachedContext: [{ kind: 'generic', id: 'context', name: 'Context', value: 'value' }],
			},
		});
		await Promise.resolve();

		assert.deepStrictEqual(telemetryService.requestSentEvents, [
			{ isNewSession: true, isNewChat: true, totalAttachementCount: 0, attachmentKinds: '{}' },
			{ isNewSession: false, isNewChat: true, totalAttachementCount: 0, attachmentKinds: '{}' },
			{ isNewSession: false, isNewChat: false, totalAttachementCount: 1, attachmentKinds: '{"generic":1}' },
		]);
	});

	test('requestSent session counts exclude the session the request was sent to', async () => {
		// The anchor is reported by a fresh session object with in-progress
		// state, mirroring what a provider hands out right after a send.
		const anchor = { ...session, status: constObservable(SessionStatus.InProgress), isRead: constObservable(false), workspace: constObservable(workspace) };
		const listedAnchor = { ...anchor };
		const otherInSameWorkspace = { ...anchor, sessionId: 'other', resource: URI.parse('test:///other') };
		const otherWorkspaceSession = { ...anchor, sessionId: 'elsewhere', resource: URI.parse('test:///elsewhere'), workspace: constObservable(createWorkspace(URI.parse('file:///other-repo'))) };
		const { telemetryService, onDidSendRequest } = setup([listedAnchor, otherInSameWorkspace, otherWorkspaceSession]);

		onDidSendRequest.fire({ session: anchor, chat, isNewSession: false, isNewChat: false, options: { query: 'hi' } });
		await Promise.resolve();

		assert.deepStrictEqual(telemetryService.sessionCounts, [{
			currentWorkspaceInProgress: 1,
			currentWorkspaceUnread: 1,
			currentWorkspaceWaitingForInput: 0,
			currentWorkspaceNotDone: 1,
			allWorkspacesInProgress: 2,
			allWorkspacesUnread: 2,
			allWorkspacesWaitingForInput: 0,
			allWorkspacesNotDone: 2,
		}]);
	});

	test('sessionSummary counts characters and distinct files typed in the active session working directory only', () => {
		// A worktree session: the folder root is the shared checkout, the
		// working directory is the isolated worktree the session edits.
		const worktree = URI.file('/repo/worktree');
		const folder: ISessionFolder = { root: URI.file('/repo'), workingDirectory: worktree, name: 'repo', description: undefined };
		const tracked = { ...session, workspace: constObservable(createWorkspace(worktree, [folder])) };
		const { telemetryService, onDidSendRequest, onDidArchiveSession, onModelAdded } = setup([tracked], constObservable(upcastPartial<IActiveSession>(tracked)));
		onDidSendRequest.fire({ session: tracked, chat, isNewSession: true, isNewChat: true, options: { query: 'hi' } });

		const inWorktree = disposables.add(createTextModel('', null, undefined, URI.file('/repo/worktree/file.ts')));
		const alsoInWorktree = disposables.add(createTextModel('', null, undefined, URI.file('/repo/worktree/other.ts')));
		const outsideWorktree = disposables.add(createTextModel('', null, undefined, URI.file('/repo/file.ts')));
		onModelAdded.fire(inWorktree);
		onModelAdded.fire(alsoInWorktree);
		onModelAdded.fire(outsideWorktree);
		const typed = EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' });
		inWorktree.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'abc' }], false, typed);
		inWorktree.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'de' }], false, typed);
		alsoInWorktree.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'fgh' }], false, typed);
		outsideWorktree.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'ignored' }], false, typed);
		inWorktree.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'pasted' }], false, EditSources.cursor({ kind: 'paste' }));

		onDidArchiveSession.fire(tracked);

		assert.deepStrictEqual(
			telemetryService.sessionSummaries.map(s => {
				const { typedCharacters, typedFileCount, folderCount } = s as { typedCharacters: number; typedFileCount: number; folderCount: number };
				return { typedCharacters, typedFileCount, folderCount };
			}),
			[{ typedCharacters: 8, typedFileCount: 2, folderCount: 1 }],
		);
	});

	test('typing is attributed to the session that was active while it happened', () => {
		const makeSession = (id: string, worktree: URI) => ({
			...session,
			sessionId: id,
			resource: URI.parse(`test:///${id}`),
			workspace: constObservable(createWorkspace(worktree, [{ root: URI.file('/repo'), workingDirectory: worktree, name: id, description: undefined }])),
		});
		const first = makeSession('first', URI.file('/repo/wt-first'));
		const second = makeSession('second', URI.file('/repo/wt-second'));
		const active = observableValue<IActiveSession | undefined>('active', upcastPartial<IActiveSession>(first));
		const { telemetryService, onDidSendRequest, onDidArchiveSession, onModelAdded } = setup([first, second], active);
		onDidSendRequest.fire({ session: first, chat, isNewSession: true, isNewChat: true, options: { query: 'hi' } });
		onDidSendRequest.fire({ session: second, chat, isNewSession: true, isNewChat: true, options: { query: 'hi' } });

		const firstFile = disposables.add(createTextModel('', null, undefined, URI.file('/repo/wt-first/file.ts')));
		const secondFile = disposables.add(createTextModel('', null, undefined, URI.file('/repo/wt-second/file.ts')));
		onModelAdded.fire(firstFile);
		onModelAdded.fire(secondFile);
		const typed = EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' });

		// Typed while `first` was active, then the user switches before the
		// buffered characters would have been reported on their own.
		firstFile.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'abcde' }], false, typed);
		active.set(upcastPartial<IActiveSession>(second), undefined);
		secondFile.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'xyz' }], false, typed);

		onDidArchiveSession.fire(first);
		onDidArchiveSession.fire(second);

		assert.deepStrictEqual(telemetryService.sessionSummaries.map(s => (s as { typedCharacters: number }).typedCharacters), [5, 3]);
	});

	test('typing survives a flush while the session workspace is still hydrating', () => {
		// Providers resolve `ISession.workspace` asynchronously, so a flush can
		// land while it is still undefined. That typing must not be dropped.
		const worktree = URI.file('/repo/worktree');
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
		const tracked = { ...session, workspace };
		const { telemetryService, storageService, onDidSendRequest, onDidArchiveSession, onModelAdded } = setup([tracked], constObservable(upcastPartial<IActiveSession>(tracked)));
		onDidSendRequest.fire({ session: tracked, chat, isNewSession: true, isNewChat: true, options: { query: 'hi' } });

		const file = disposables.add(createTextModel('', null, undefined, URI.file('/repo/worktree/file.ts')));
		onModelAdded.fire(file);
		file.applyEdits([{ range: new Range(1, 1, 1, 1), text: 'abcde' }], false, EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' }));

		// A save-triggered flush arrives before the workspace resolves.
		void storageService.flush();
		workspace.set(createWorkspace(worktree, [{ root: URI.file('/repo'), workingDirectory: worktree, name: 'repo', description: undefined }]), undefined);

		onDidArchiveSession.fire(tracked);

		assert.deepStrictEqual(telemetryService.sessionSummaries.map(s => (s as { typedCharacters: number }).typedCharacters), [5]);
	});
});
