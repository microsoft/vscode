/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ISessionsTasksService } from '../../../chat/browser/sessionsTasksService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsTelemetryContribution } from '../../browser/sessionsTelemetry.contribution.js';

interface IRequestSentTelemetry {
	readonly isNewSession: boolean;
	readonly isNewChat: boolean;
	readonly totalAttachementCount: number;
	readonly attachmentKinds: string;
}

function isRequestSentTelemetry(data: unknown): data is IRequestSentTelemetry {
	return typeof data === 'object'
		&& data !== null
		&& typeof Reflect.get(data, 'isNewSession') === 'boolean'
		&& typeof Reflect.get(data, 'isNewChat') === 'boolean'
		&& typeof Reflect.get(data, 'totalAttachementCount') === 'number'
		&& typeof Reflect.get(data, 'attachmentKinds') === 'string';
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly requestSentEvents: IRequestSentTelemetry[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName === 'agents/requestSent' && isRequestSentTelemetry(data)) {
			this.requestSentEvents.push({
				isNewSession: data.isNewSession,
				isNewChat: data.isNewChat,
				totalAttachementCount: data.totalAttachementCount,
				attachmentKinds: data.attachmentKinds,
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

suite('SessionsTelemetryContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('logs requestSent for new sessions, new chats, and follow-up messages', async () => {
		const onDidSendRequest = disposables.add(new Emitter<ISendRequestSentEvent>());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onWillSendRequest = Event.None;
			override readonly onDidSendRequest = onDidSendRequest.event;
			override readonly onDidArchiveSession = Event.None;
			override readonly onDidUnarchiveSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onDidDeleteChat = Event.None;
			override readonly onDidRenameChat = Event.None;
			override readonly onDidRenameSession = Event.None;
			override readonly onDidChangeSessions = Event.None;
			override getSessions(): ISession[] { return [session]; }
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly visibleSessions = constObservable([]);
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

		disposables.add(new SessionsTelemetryContribution(
			sessionsManagementService,
			sessionsService,
			telemetryService,
			new class extends mock<IUriIdentityService>() { }(),
			storageService,
			new class extends mock<ISearchService>() { }(),
			new class extends mock<IConfigurationService>() { }(),
			commandService,
			feedbackService,
			sessionsPartService,
			providersService,
			tasksService,
		));

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
});
