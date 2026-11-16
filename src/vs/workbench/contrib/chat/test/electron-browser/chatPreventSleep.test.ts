/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { PREVENT_SLEEP_ENABLED } from '../../../../../platform/keepAwake/common/keepAwake.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { AgentSessionStatus, IAgentSession, IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';
import { IChatPreventSleepActivitySource, isKeepAwakeSessionType } from '../../common/chatPreventSleep.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ChatPreventSleepClaimContribution } from '../../electron-browser/chatPreventSleep.js';
import { EditorChatPreventSleepActivity } from '../../electron-browser/chatPreventSleepActivity.js';

suite('ChatPreventSleep', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('excludes cloud and remote types while accepting local and extension providers', () => {
		assert.deepStrictEqual([
			'local', 'copilotcli', 'agent-host-copilotcli', 'agent-host-claude', 'agent-host-codex', 'third-party',
			'copilot-cloud-agent', 'cloud-sandbox', 'cloud-sandbox-task', 'remote-host-copilotcli', 'remote-dynamic',
		].map(isKeepAwakeSessionType), [true, true, true, true, true, true, false, false, false, false, false]);
	});

	test('loaded active requests and unfiltered inventory react to changes and removal', () => {
		const active = observableValue('active', false);
		const models = observableValue<Iterable<IChatModel>>('models', [
			upcastPartial<IChatModel>({ sessionResource: URI.parse('copilot-cloud-agent:/cloud'), hasActiveRequest: observableValue('cloud', true) }),
			upcastPartial<IChatModel>({ sessionResource: URI.parse('vscode-chat-editor:/local'), hasActiveRequest: active }),
		]);
		const changed = store.add(new Emitter<void>());
		let sessions: IAgentSession[] = [];
		const inventory = upcastPartial<IAgentSessionsModel>({ onDidChangeSessions: changed.event, sessions: [], get sessionsIncludingAutomationRuns() { return sessions; } });
		const activity = new EditorChatPreventSleepActivity(
			upcastPartial<IChatService>({ chatModels: models }),
			upcastPartial<IAgentSessionsService>({ model: inventory }),
		);
		const values: boolean[] = [];
		store.add(autorun(reader => values.push(activity.busy.read(reader))));
		active.set(true, undefined); // hasActiveRequest also covers pending confirmations.
		active.set(false, undefined);
		sessions = [upcastPartial<IAgentSession>({ providerType: 'local', status: AgentSessionStatus.NeedsInput, isArchived: () => true })];
		changed.fire();
		sessions = [];
		changed.fire();
		assert.deepStrictEqual(values, [false, true, false, true, false]);
	});

	test('does not resolve inventory while disabled, reports only transitions and unsubscribes on disable', async () => {
		const configuration = new TestConfigurationService({ [PREVENT_SLEEP_ENABLED]: false });
		let inventoryReads = 0;
		const changed = store.add(new Emitter<void>());
		const source = new EditorChatPreventSleepActivity(
			upcastPartial<IChatService>({ chatModels: observableValue<Iterable<IChatModel>>('models', []) }),
			upcastPartial<IAgentSessionsService>({
				get model() {
					inventoryReads++;
					return upcastPartial<IAgentSessionsModel>({ onDidChangeSessions: changed.event, sessions: [] });
				},
			}),
		);
		const busy = observableValue('busy', true);
		const activity = upcastPartial<IChatPreventSleepActivitySource>({ busy: derived(reader => source.busy.read(reader) || busy.read(reader)) });
		const reports: boolean[] = [];
		store.add(new ChatPreventSleepClaimContribution(configuration, activity,
			upcastPartial<INativeHostService>({ updateKeepAwakeClaim: async value => { reports.push(value); } }),
			new NullLogService()));
		assert.deepStrictEqual({ inventoryReads, reports }, { inventoryReads: 0, reports: [] });
		await configuration.setUserConfiguration(PREVENT_SLEEP_ENABLED, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		changed.fire();
		busy.set(false, undefined);
		await configuration.setUserConfiguration(PREVENT_SLEEP_ENABLED, false);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		const readsAtDisable = inventoryReads;
		changed.fire();
		assert.deepStrictEqual({ reports, subscribed: changed.hasListeners(), readsUnchanged: inventoryReads === readsAtDisable }, {
			reports: [true, false], subscribed: false, readsUnchanged: true,
		});
	});
});
