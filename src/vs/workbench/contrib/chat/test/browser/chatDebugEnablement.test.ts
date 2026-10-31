/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AgentHostAgentDebugLogEnabledSettingId, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from '../../common/promptSyntax/promptTypes.js';
import { ChatDebugHomeView } from '../../browser/chatDebug/chatDebugHomeView.js';
import { renderChatDebugLoggingDisabledMessage, renderWireLogLoggingDisabledMessage } from '../../browser/chatDebug/chatDebugEnablement.js';
import { IChatWidgetService } from '../../browser/chat.js';
import { IPreferencesService, IOpenSettingsOptions } from '../../../../services/preferences/common/preferences.js';

suite('Chat debug enablement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createContainer(): HTMLElement {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		return container;
	}

	function createPreferencesService(openedSettings: IOpenSettingsOptions[]): IPreferencesService {
		return {
			openSettings(options: IOpenSettingsOptions) {
				openedSettings.push(options);
				return Promise.resolve(undefined);
			},
		} as unknown as IPreferencesService;
	}

	function clickEnableButton(container: HTMLElement): void {
		const button = container.querySelector<HTMLButtonElement>('button');
		assert.ok(button);
		button.click();
	}

	test('opens the session debug logging setting by id', () => {
		const openedSettings: IOpenSettingsOptions[] = [];
		const container = createContainer();
		const disposables = store.add(new DisposableStore());

		renderChatDebugLoggingDisabledMessage(container, URI.from({ scheme: 'agent-host-copilot', path: '/session' }), createPreferencesService(openedSettings), disposables);
		clickEnableButton(container);

		assert.deepStrictEqual(openedSettings, [{ jsonEditor: false, query: `@id:${AgentHostAgentDebugLogEnabledSettingId}` }]);
	});

	test('opens the AHP logging setting by id', () => {
		const openedSettings: IOpenSettingsOptions[] = [];
		const container = createContainer();
		const disposables = store.add(new DisposableStore());

		renderWireLogLoggingDisabledMessage(container, createPreferencesService(openedSettings), disposables);
		clickEnableButton(container);

		assert.deepStrictEqual(openedSettings, [{ jsonEditor: false, query: `@id:${AgentHostAhpJsonlLoggingSettingId}` }]);
	});

	test('opens the agent debug logging setting from the home view', () => {
		const openedSettings: IOpenSettingsOptions[] = [];
		const container = createContainer();
		const configurationService = {
			getValue: () => false,
			onDidChangeConfiguration: Event.None,
		} as unknown as IConfigurationService;
		const chatDebugService = {
			onDidAddEvent: Event.None,
			onDidChangeAvailableSessionResources: Event.None,
			getSessionResources: () => [],
		} as unknown as IChatDebugService;
		const view = store.add(new ChatDebugHomeView(
			container,
			{} as unknown as IChatService,
			chatDebugService,
			{} as unknown as IChatWidgetService,
			{} as unknown as ConstructorParameters<typeof ChatDebugHomeView>[4],
			configurationService,
			createPreferencesService(openedSettings),
		));

		view.show();
		clickEnableButton(container);

		assert.deepStrictEqual(openedSettings, [{ jsonEditor: false, query: `@id:${AgentHostAgentDebugLogEnabledSettingId}` }]);
	});

	test('opens the local debug logging setting by id for non-agent-host sessions', () => {
		const openedSettings: IOpenSettingsOptions[] = [];
		const container = createContainer();
		const disposables = store.add(new DisposableStore());

		renderChatDebugLoggingDisabledMessage(container, undefined, createPreferencesService(openedSettings), disposables);
		clickEnableButton(container);

		assert.deepStrictEqual(openedSettings, [{ jsonEditor: false, query: `@id:${AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING}` }]);
	});
});
