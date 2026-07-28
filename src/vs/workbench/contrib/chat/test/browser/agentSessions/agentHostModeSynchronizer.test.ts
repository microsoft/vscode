/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { agentHostAgentPickerStorageKey } from '../../../../../../platform/agentHost/common/customAgents.js';
import { StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { AgentHostModeSynchronizer } from '../../../browser/agentSessions/agentHost/agentHostModeSynchronizer.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatMode, IChatMode, IChatModes } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import type { IChatModeChangeEvent } from '../../../browser/widget/input/chatInputPart.js';

suite('AgentHostModeSynchronizer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-host-claude:/session-1');
	const agentUri = 'file:///agent.md';

	function createCustomMode(): IChatMode {
		return {
			id: agentUri,
			kind: ChatModeKind.Agent,
			isBuiltin: false,
		} as IChatMode;
	}

	function createModes(customModes: () => readonly IChatMode[], onDidChange: Event<void>): IChatModes {
		return {
			onDidChange,
			builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit],
			get custom() {
				return customModes();
			},
			findModeById: id => [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit, ...customModes()].find(mode => mode.id === id),
			findModeByName: name => [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit, ...customModes()].find(mode => mode.name?.get() === name),
			waitForPendingUpdates: async () => { },
		};
	}

	function createSynchronizer(initialMode: IChatMode, initialCustomModes: readonly IChatMode[] = [], resource: URI = sessionResource) {
		let customModes = [...initialCustomModes];
		const modeChanges = store.add(new Emitter<IChatModeChangeEvent>());
		const modesChanges = store.add(new Emitter<void>());
		const mode = observableValue<IChatMode>('mode', initialMode);
		const modes = createModes(() => customModes, modesChanges.event);
		const modesObservable = observableValue<IChatModes>('modes', modes);
		const setChatModeCalls: string[] = [];

		const widget = {
			viewModel: { sessionResource: resource },
			input: {
				onDidChangeCurrentChatMode: modeChanges.event,
				currentModeObs: mode,
				currentChatModesObs: modesObservable,
				setChatMode: (modeId: string) => {
					setChatModeCalls.push(modeId);
					const next = modes.findModeById(modeId);
					if (next) {
						mode.set(next, undefined);
					}
				},
			},
			onDidChangeViewModel: Event.None,
		} as unknown as IChatWidget;

		const widgetService = {
			getAllWidgets: () => [widget],
			onDidAddWidget: Event.None,
			onDidChangeFocusedSession: Event.None,
			getWidgetBySessionResource: (r: URI) => r.toString() === resource.toString() ? widget : undefined,
			lastFocusedWidget: widget,
		} as unknown as IChatWidgetService;

		const provisionalSessionService = {
			onDidChange: Event.None,
			get: () => undefined,
		} as unknown as IAgentHostUntitledProvisionalSessionService;

		const storageService = store.add(new TestStorageService());
		const environmentService = { isSessionsWindow: false } as IWorkbenchEnvironmentService;
		const synchronizer = store.add(new AgentHostModeSynchronizer(widgetService, provisionalSessionService, storageService, environmentService));

		return {
			modeChanges,
			modesChanges,
			setCustomModes: (next: readonly IChatMode[]) => {
				customModes = [...next];
			},
			setChatModeCalls,
			storageService,
			synchronizer,
		};
	}

	test('persists only user initiated custom agent changes', () => {
		const { modeChanges, storageService } = createSynchronizer(createCustomMode(), [createCustomMode()]);
		const key = agentHostAgentPickerStorageKey(sessionResource.scheme);

		modeChanges.fire({ isUserInitiated: false });
		assert.strictEqual(storageService.get(key, StorageScope.PROFILE), undefined);

		modeChanges.fire({ isUserInitiated: true });
		assert.strictEqual(storageService.get(key, StorageScope.PROFILE), agentUri);
	});

	test('does not force default Agent when storage is empty', async () => {
		const { setChatModeCalls } = createSynchronizer(ChatMode.Ask);

		await timeout(0);

		assert.deepStrictEqual(setChatModeCalls, []);
	});

	test('retries restore when custom modes load late', async () => {
		// The synchronizer only SEEDS the shared per-scheme agent into untitled (new) sessions;
		// established sessions restore their own persisted mode elsewhere (ChatInputPart). Use an
		// untitled resource so this exercises the seed-retry path when custom modes load late.
		const untitledResource = URI.parse('agent-host-claude:/untitled-session-1');
		const { modesChanges, setChatModeCalls, setCustomModes, storageService } = createSynchronizer(ChatMode.Agent, [], untitledResource);
		storageService.store(agentHostAgentPickerStorageKey(untitledResource.scheme), agentUri, StorageScope.PROFILE, StorageTarget.MACHINE);

		await timeout(0);
		assert.deepStrictEqual(setChatModeCalls, []);

		setCustomModes([createCustomMode()]);
		modesChanges.fire();
		await timeout(0);

		assert.deepStrictEqual(setChatModeCalls, [agentUri]);
	});

	test('does not restore the shared per-scheme agent to an established (non-untitled) session', async () => {
		// Regression for the "custom agent picker flips to a stale agent after send" bug: the
		// shared per-scheme agent is a seed for NEW sessions only, so an established/restored
		// session must never have it applied — even when its custom modes load late.
		const { modesChanges, setChatModeCalls, setCustomModes, storageService } = createSynchronizer(ChatMode.Agent);
		storageService.store(agentHostAgentPickerStorageKey(sessionResource.scheme), agentUri, StorageScope.PROFILE, StorageTarget.MACHINE);

		await timeout(0);
		setCustomModes([createCustomMode()]);
		modesChanges.fire();
		await timeout(0);

		assert.deepStrictEqual(setChatModeCalls, []);
	});
});
