/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { PreferredGroup, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { IAgentSession, AgentSessionStatus } from '../../../browser/agentSessions/agentSessionsModel.js';
import { openSession } from '../../../browser/agentSessions/agentSessionsOpener.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';
import { IChatEditorOptions } from '../../../browser/widgetHosts/editor/chatEditor.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';

suite('agentSessionsOpener', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(resource: URI): IAgentSession {
		return {
			providerType: AgentSessionProviders.Local,
			providerLabel: 'Local',
			resource,
			status: AgentSessionStatus.Completed,
			label: 'Test Session',
			icon: ThemeIcon.fromId(Codicon.commentDiscussion.id),
			timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
			isArchived: () => false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => false,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	test('opens local sessions to the side when sideBySide is requested', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const chatSessionsService = new MockChatSessionsService();
		let target: unknown;
		let options: IChatEditorOptions | undefined;

		const chatWidgetService = new class extends MockChatWidgetService {
			override async openSession(_sessionResource: URI, openTarget?: typeof ChatViewPaneTarget | PreferredGroup, openOptions?: IChatEditorOptions): Promise<IChatWidget | undefined> {
				target = openTarget;
				options = openOptions;
				return undefined;
			}
		};

		instantiationService.stub(IInstantiationService, instantiationService);
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		instantiationService.stub(ILogService, new NullLogService());

		const session = createSession(URI.from({ scheme: Schemas.vscodeLocalChatSession, path: '/session' }));

		await instantiationService.invokeFunction(accessor => openSession(accessor, session, { sideBySide: true }));

		assert.strictEqual(target, SIDE_GROUP);
		assert.strictEqual(options?.revealIfOpened, true);
	});

	test('opens local sessions in the chat view by default', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const chatSessionsService = new MockChatSessionsService();
		let target: unknown;

		const chatWidgetService = new class extends MockChatWidgetService {
			override async openSession(_sessionResource: URI, openTarget?: typeof ChatViewPaneTarget | PreferredGroup): Promise<IChatWidget | undefined> {
				target = openTarget;
				return undefined;
			}
		};

		instantiationService.stub(IInstantiationService, instantiationService);
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		instantiationService.stub(ILogService, new NullLogService());

		const session = createSession(URI.from({ scheme: Schemas.vscodeLocalChatSession, path: '/session' }));

		await instantiationService.invokeFunction(accessor => openSession(accessor, session));

		assert.strictEqual(target, ChatViewPaneTarget);
	});
});
