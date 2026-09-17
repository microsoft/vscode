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
import { IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IAgentSessionsFilter } from '../../../browser/agentSessions/agentSessionsViewer.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('AgentSessionsControl', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
		const filter: IAgentSessionsFilter = {
			onDidChange: Event.None,
			exclude: () => false,
			getExcludes: () => ({ providers: [], states: [], archived: false, read: false, repositoryGroupCapped: true }),
			isDefault: () => true,
			reset: () => { },
		};
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
});
