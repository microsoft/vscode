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
		const children = [{
			...createSession(resource.with({ fragment: 'peer' }), 'Peer chat'),
			parentSession: { resource, label: 'Session' },
		}];
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

	test('persists session hierarchy expansion state', async () => {
		const resource = URI.parse('test:/persisted-session');
		const child = {
			...createSession(resource.with({ fragment: 'peer' }), 'Peer chat'),
			parentSession: { resource, label: 'Session' },
		};
		const parent = createSession(resource, 'Session', [child]);
		const model: IAgentSessionsModel = {
			sessions: [parent],
			resolved: true,
			getSession: candidate => candidate.toString() === resource.toString() ? parent : child,
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
			override getSession = (candidate: URI) => model.getSession(candidate);
		});
		const createControl = async () => {
			const container = document.createElement('div');
			const control = instantiationService.createInstance(AgentSessionsControl, container, {
				overrideStyles: {},
				filter: createFilter(),
				source: 'test',
				createNewChat: () => { },
				getHoverPosition: () => HoverPosition.BELOW,
				trackActiveEditorSession: () => false,
			});
			control.layout(500, 500);
			await control.update();
			await timeout(0);
			return control;
		};

		const first = await createControl();
		assert.strictEqual(first.element?.querySelectorAll('.monaco-list-row').length, 2);
		first.element?.querySelector<HTMLElement>('.agent-session-chat-twistie')?.click();
		await timeout(0);
		assert.strictEqual(first.element?.querySelectorAll('.monaco-list-row').length, 1);
		first.dispose();

		const second = await createControl();
		assert.strictEqual(second.element?.querySelectorAll('.monaco-list-row').length, 1);
		second.element?.querySelector<HTMLElement>('.agent-session-chat-twistie')?.click();
		await timeout(0);
		assert.strictEqual(second.element?.querySelectorAll('.monaco-list-row').length, 2);
		second.dispose();

		const third = store.add(await createControl());
		assert.strictEqual(third.element?.querySelectorAll('.monaco-list-row').length, 2);
	});

	test('renders hierarchy guides from visible filtered chats', async () => {
		const resource = URI.parse('test:/filtered-session');
		const children = ['First peer', 'Second peer'].map((label, index) => ({
			...createSession(resource.with({ fragment: `peer-${index}` }), label),
			parentSession: { resource, label: 'Parent session' },
		}));
		const parent = createSession(resource, 'Parent session', children);
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
			override getSession = (candidate: URI) => model.getSession(candidate);
		});
		const container = document.createElement('div');
		const control = store.add(instantiationService.createInstance(AgentSessionsControl, container, {
			overrideStyles: {},
			filter: createFilter(),
			source: 'test',
			createNewChat: () => { },
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
		}));
		control.layout(500, 500);
		await control.update();
		await timeout(0);

		control.openFind();
		const input = control.element?.querySelector<HTMLInputElement>('.monaco-tree-type-filter-input input');
		assert.ok(input);
		input.value = 'First peer';
		input.dispatchEvent(new InputEvent(EventType.INPUT, { bubbles: true }));
		await timeout(0);

		let rows = control.element?.querySelectorAll('.monaco-list-row');
		assert.deepStrictEqual({
			rowCount: rows?.length,
			parentHasGuide: rows?.[0].classList.contains('has-chat-children'),
			chatIsLast: rows?.[1].querySelector('.agent-session-chat-item')?.classList.contains('last-chat'),
		}, {
			rowCount: 2,
			parentHasGuide: true,
			chatIsLast: true,
		});

		input.value = 'Parent session';
		input.dispatchEvent(new InputEvent(EventType.INPUT, { bubbles: true }));
		await timeout(0);
		rows = control.element?.querySelectorAll('.monaco-list-row');

		assert.deepStrictEqual({
			rowCount: rows?.length,
			parentHasGuide: rows?.[0].classList.contains('has-chat-children'),
		}, {
			rowCount: 1,
			parentHasGuide: false,
		});

		input.dispatchEvent(new KeyboardEvent(EventType.KEY_DOWN, { key: 'Escape', bubbles: true }));
		control.dispose();
		await timeout(350);
	});
});
