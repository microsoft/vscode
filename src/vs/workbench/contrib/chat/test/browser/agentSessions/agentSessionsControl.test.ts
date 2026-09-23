/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { AgentSessionsControl } from '../../../browser/agentSessions/agentSessionsControl.js';
import { IAgentSession, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IAgentSessionsFilter } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { ChatSessionStatus, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { timeout } from '../../../../../../base/common/async.js';

suite('AgentSessionsControl', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(resource: URI, label: string, children?: readonly IAgentSession[]): IAgentSession {
		return {
			providerType: 'test',
			providerLabel: 'Test',
			resource,
			status: ChatSessionStatus.Completed,
			label,
			icon: Codicon.chatSparkle,
			timing: { created: 1, lastRequestStarted: undefined, lastRequestEnded: undefined },
			children,
			isArchived: () => false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
	}

	function createFilter(): IAgentSessionsFilter {
		return {
			onDidChange: Event.None,
			exclude: () => false,
			getExcludes: () => ({ providers: [], states: [], archived: false, read: false, repositoryGroupCapped: true }),
			isDefault: () => true,
			reset: () => { },
		};
	}

	test('creates a new chat when double-clicking empty list space', () => {
		const model: IAgentSessionsModel = {
			sessions: [],
			resolved: true,
			getSession: () => undefined,
			observeSession: () => { throw new Error('Not implemented'); },
			onWillResolve: Event.None,
			onDidResolve: Event.None,
			onDidChangeSessions: Event.None,
			onDidChangeSessionArchivedState: Event.None,
			resolve: async () => { },
		};
		const filter = createFilter();
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { });
		instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() { });
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override readonly model = model;
			override readonly onDidChangeSessionArchivedState = Event.None;
			override getSession = () => undefined;
		});

		const container = document.createElement('div');
		let newChatCount = 0;
		const control = store.add(instantiationService.createInstance(AgentSessionsControl, container, {
			overrideStyles: {},
			filter,
			source: 'test',
			createNewChat: () => newChatCount++,
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
		}));

		control.element?.querySelector('.monaco-list')?.dispatchEvent(new MouseEvent(EventType.DBLCLICK, {
			bubbles: true,
			button: 0,
			detail: 2,
		}));

		assert.strictEqual(newChatCount, 1);
	});

	test('activating a session parent opens its main chat', async () => {
		const resource = URI.parse('test:/session');
		const children = [
			createSession(resource.with({ fragment: 'peer' }), 'Peer chat'),
		];
		const parent = createSession(resource, 'Session', children);
		const model: IAgentSessionsModel = {
			sessions: [parent],
			resolved: true,
			getSession: candidate => candidate.toString() === resource.toString() ? parent : children.find(child => child.resource.toString() === candidate.toString()),
			observeSession: () => { throw new Error('Not implemented'); },
			onWillResolve: Event.None,
			onDidResolve: Event.None,
			onDidChangeSessions: Event.None,
			onDidChangeSessionArchivedState: Event.None,
			resolve: async () => { },
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
			override resolveChatSessionItem = async () => undefined;
		});
		instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
			override readonly pendingResponseVersion = observableValue(this, 0);
			override hasPendingResponse = () => false;
		});
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override readonly model = model;
			override readonly onDidChangeSessionArchivedState = Event.None;
			override getSession = () => parent;
		});

		const container = document.createElement('div');
		let openedResource: URI | undefined;
		const control = store.add(instantiationService.createInstance(AgentSessionsControl, container, {
			overrideStyles: {},
			filter: createFilter(),
			source: 'test',
			createNewChat: () => { },
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
			overrideSessionOpen: async resource => { openedResource = resource; },
		}));
		control.layout(500, 500);
		await control.update();
		await timeout(0);

		const rowsBefore = control.element?.querySelectorAll('.monaco-list-row');
		assert.strictEqual(rowsBefore?.length, 2);
		assert.strictEqual(rowsBefore?.[0].querySelector<HTMLElement>('.agent-session-chat-twistie')?.style.paddingLeft, '0px');
		rowsBefore?.[0].dispatchEvent(new MouseEvent(EventType.CLICK, { bubbles: true, button: 0 }));
		await timeout(0);

		assert.deepStrictEqual({
			openedResource: openedResource?.toString(),
			visibleRows: control.element?.querySelectorAll('.monaco-list-row').length,
		}, {
			openedResource: resource.toString(),
			visibleRows: 2,
		});
	});
});
