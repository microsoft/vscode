/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationHandle, INotificationService, IPromptChoice, Severity } from '../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { CHAT_SPECIFIC_LAYOUT_SETTING, ChatLayoutPresentation } from '../../../../common/chatLayout.js';
import { SessionsLayoutContribution } from '../../browser/sessions.layout.contribution.js';

suite('Sessions chat layout configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('registers a false-default experimental window setting', () => {
		const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[CHAT_SPECIFIC_LAYOUT_SETTING];
		assert.deepStrictEqual({ type: property.type, default: property.default, scope: property.scope, tags: property.tags }, {
			type: 'boolean', default: false, scope: ConfigurationScope.WINDOW, tags: ['experimental'],
		});
	});

	test('offers reload on configuration changes without changing effective presentation and closes the prompt on revert', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const presentation = store.add(new ChatLayoutPresentation(configuration, true, constObservable(false)));
		const instantiation = store.add(new TestInstantiationService());
		sinon.stub(instantiation, 'createInstance').returns(store.add(new DisposableStore()));
		let choices: IPromptChoice[] = [];
		let prompts = 0;
		let closed = 0;
		let reloads = 0;
		const notifications = new class extends mock<INotificationService>() {
			override prompt(_severity: Severity, _message: string, actions: IPromptChoice[]): INotificationHandle {
				choices = actions;
				prompts++;
				return upcastPartial<INotificationHandle>({ close: () => closed++ });
			}
		}();
		const host = new class extends mock<IHostService>() {
			override async reload(): Promise<void> { reloads++; }
		}();
		store.add(new SessionsLayoutContribution(instantiation, upcastPartial<IAgentWorkbenchLayoutService>({
			agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, chatLayoutPresentation: presentation,
		}), configuration, notifications, host));
		const change = upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === CHAT_SPECIFIC_LAYOUT_SETTING });
		await configuration.setUserConfiguration(CHAT_SPECIFIC_LAYOUT_SETTING, true);
		configuration.onDidChangeConfigurationEmitter.fire(change);
		await choices[0].run();
		await configuration.setUserConfiguration(CHAT_SPECIFIC_LAYOUT_SETTING, false);
		configuration.onDidChangeConfigurationEmitter.fire(change);
		assert.deepStrictEqual({ prompts, closed, reloads, active: presentation.state.get().active }, {
			prompts: 1, closed: 1, reloads: 1, active: false,
		});
	});
});
