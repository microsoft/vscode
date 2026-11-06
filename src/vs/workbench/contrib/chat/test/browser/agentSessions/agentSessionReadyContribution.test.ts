/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { AgentSessionReadyContribution } from '../../../browser/agentSessions/experiments/agentSessionsExperiments.contribution.js';
import { IAgentSessionProjectionService } from '../../../browser/agentSessions/experiments/agentSessionProjectionService.js';
import { IAgentTitleBarStatusService } from '../../../browser/agentSessions/experiments/agentTitleBarStatusService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';

suite('AgentSessionReadyContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(initialWidgets: IChatWidget[] = []) {
		const added = store.add(new Emitter<IChatWidget>());
		const removed = store.add(new Emitter<IChatWidget>());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override onDidAddWidget = added.event;
			override onDidRemoveWidget = removed.event;
			override getAllWidgets() { return initialWidgets; }
		}());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.AgentSessionProjectionEnabled]: false,
		}));
		instantiationService.stub(IAgentTitleBarStatusService, new class extends mock<IAgentTitleBarStatusService>() {
			override exitSessionReadyMode() { }
		}());
		instantiationService.stub(IAgentSessionProjectionService, new class extends mock<IAgentSessionProjectionService>() {
			override onDidChangeProjectionMode = Event.None;
			override isActive = false;
		}());
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override model = new class extends mock<IAgentSessionsService['model']>() {
				override onDidChangeSessions = Event.None;
			}();
		}());
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override editingSessionsObs = constObservable([]);
		}());
		const contribution = store.add(instantiationService.createInstance(AgentSessionReadyContribution));
		return { added, removed, contribution };
	}

	function widget(location = ChatAgentLocation.Chat) {
		const changes = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = new class extends mock<IChatWidget>() {
			override readonly location = location;
			override onDidChangeViewModel = changes.event;
			override viewModel = undefined;
		}();
		return { widget, changes };
	}

	test('removing the watched widget releases its view model listener', () => {
		const watched = widget();
		const { removed } = create([watched.widget]);
		const before = watched.changes.hasListeners();
		removed.fire(watched.widget);
		assert.deepStrictEqual([before, watched.changes.hasListeners()], [true, false]);
	});

	test('removing another widget preserves the current widget listener', () => {
		const first = widget();
		const second = widget();
		const { added, removed } = create([first.widget]);
		added.fire(second.widget);
		removed.fire(first.widget);
		const afterOtherRemoval = [first.changes.hasListeners(), second.changes.hasListeners()];
		removed.fire(second.widget);
		assert.deepStrictEqual([afterOtherRemoval, second.changes.hasListeners()], [[false, true], false]);
	});

	test('inline widgets do not replace the watched chat widget', () => {
		const chat = widget();
		const inline = widget(ChatAgentLocation.EditorInline);
		const { added, removed, contribution } = create([chat.widget]);
		added.fire(inline.widget);
		removed.fire(inline.widget);
		const before = [chat.changes.hasListeners(), inline.changes.hasListeners()];
		contribution.dispose();
		assert.deepStrictEqual([before, chat.changes.hasListeners()], [[true, false], false]);
	});
});
