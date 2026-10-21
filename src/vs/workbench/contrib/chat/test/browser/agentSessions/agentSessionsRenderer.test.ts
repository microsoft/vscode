/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { FuzzyScore } from '../../../../../../base/common/filters.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { ITreeNode } from '../../../../../../base/browser/ui/tree/tree.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { AgentSessionChatRenderer, AgentSessionRenderer, AgentSessionSectionRenderer } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { AgentSessionStatus, IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('AgentSessionsRenderer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const chat of [false, true]) {
		test(`keeps needs-input ${chat ? 'chat' : 'session'} row styling static`, () => {
			const viewer = append(mainWindow.document.body, $('.agent-sessions-viewer'));
			store.add(toDisposable(() => viewer.remove()));
			const row = append(viewer, $('.monaco-list-row'));
			const item = append(row, $(chat ? '.agent-session-chat-item.needs-input' : '.agent-session-item'));
			const iconColumn = append(item, $('.agent-session-icon-col'));
			const icon = append(iconColumn, $(chat ? '.agent-session-chat-icon.needs-input' : '.agent-session-icon.needs-input'));
			const glyph = append(icon, $('span.codicon.codicon-report-question'));
			const title = append(item, $(chat ? '.agent-session-chat-title' : '.agent-session-title', undefined, 'Waiting'));
			const titleStyle = mainWindow.getComputedStyle(title);

			assert.deepStrictEqual({
				animations: [row, item, icon, glyph, title].map(element => mainWindow.getComputedStyle(element).animationName),
				iconOpacity: mainWindow.getComputedStyle(icon).opacity,
				solidTitle: titleStyle.webkitTextFillColor === titleStyle.color,
			}, {
				animations: ['none', 'none', 'none', 'none', 'none'],
				iconOpacity: '1',
				solidTitle: true,
			});
		});
	}

	test('adds item classes to a normal tree row', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { });
		instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() { });
		const renderer = store.add(instantiationService.createInstance(
			AgentSessionRenderer,
			{ disableHover: true, getHoverPosition: () => HoverPosition.BELOW },
			undefined,
			observableValue<URI | undefined>('activeSessionResource', undefined),
		));
		const row = document.createElement('div');
		row.classList.add('monaco-list-row');
		const treeRow = document.createElement('div');
		const contents = document.createElement('div');
		row.appendChild(treeRow).appendChild(contents);

		const template = renderer.renderTemplate(contents);
		store.add({ dispose: () => renderer.disposeTemplate(template) });

		assert.deepStrictEqual([...row.classList], [
			'monaco-list-row',
			'agent-session-list-row',
			'agent-session-item-row',
		]);
	});

	test('adds section classes when the container is a sticky row', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const renderer = instantiationService.createInstance(AgentSessionSectionRenderer, {});
		const stickyRow = document.createElement('div');
		stickyRow.classList.add('monaco-list-row');

		const template = renderer.renderTemplate(stickyRow);
		store.add({ dispose: () => renderer.disposeTemplate(template) });

		assert.deepStrictEqual([...stickyRow.classList], [
			'monaco-list-row',
			'agent-session-list-row',
			'agent-session-section-row',
		]);
	});

	test('renders session chats as compact hierarchy rows', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { });
		instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() { });
		const sessionRenderer = store.add(instantiationService.createInstance(
			AgentSessionRenderer,
			{ disableHover: true, getHoverPosition: () => HoverPosition.BELOW },
			undefined,
			observableValue<URI | undefined>('activeSessionResource', undefined),
		));
		const renderer = instantiationService.createInstance(AgentSessionChatRenderer, sessionRenderer, (node: ITreeNode<IAgentSession, FuzzyScore>) => node.visibleChildIndex === 0);
		const row = document.createElement('div');
		row.classList.add('monaco-list-row');
		const contents = document.createElement('div');
		row.appendChild(document.createElement('div')).appendChild(contents);
		const template = renderer.renderTemplate(contents);
		store.add({ dispose: () => renderer.disposeTemplate(template) });

		const parentResource = URI.parse('test://session/default');
		const chat: IAgentSession = {
			providerType: 'test',
			providerLabel: 'Test',
			resource: URI.parse('test://session/default#peer'),
			status: AgentSessionStatus.NeedsInput,
			statusKnown: false,
			label: 'Peer chat',
			icon: Codicon.terminal,
			timing: {
				created: Date.now(),
				lastRequestStarted: undefined,
				lastRequestEnded: undefined,
			},
			parentSession: {
				resource: parentResource,
				label: 'Parent session',
			},
			isArchived: () => false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		};
		const node: ITreeNode<IAgentSession, FuzzyScore> = {
			element: chat,
			children: [],
			depth: 2,
			visibleChildrenCount: 0,
			visibleChildIndex: 0,
			collapsible: false,
			collapsed: false,
			visible: true,
			filterData: undefined,
		};
		renderer.renderElement(node, 0, template);

		assert.deepStrictEqual({
			rowClasses: [...row.classList],
			itemClasses: [...template.element.classList],
			title: template.element.querySelector('.label-name')?.textContent,
			hasChatIcon: !!template.element.querySelector('.agent-session-chat-icon'),
			hasNeutralChatIcon: !!template.element.querySelector('.codicon-circle-small-filled'),
			hasDetails: !!template.element.querySelector('.agent-session-details-row'),
		}, {
			rowClasses: ['monaco-list-row', 'agent-session-list-row', 'agent-session-chat-row'],
			itemClasses: ['agent-session-chat-item', 'last-chat'],
			title: 'Peer chat',
			hasChatIcon: true,
			hasNeutralChatIcon: true,
			hasDetails: false,
		});
	});
});
