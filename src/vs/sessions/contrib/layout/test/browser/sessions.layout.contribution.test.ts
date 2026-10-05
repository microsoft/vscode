/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SESSIONS_LAYOUT_MODE_SETTING, ChatLayoutPresentation } from '../../../../common/chatLayout.js';
import { SessionsLayoutContribution } from '../../browser/sessions.layout.contribution.js';

suite('Sessions chat layout configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('registers a session-default experimental window enum with descriptions', () => {
		const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[SESSIONS_LAYOUT_MODE_SETTING];
		assert.deepStrictEqual({ type: property.type, default: property.default, scope: property.scope, tags: property.tags, enum: property.enum, descriptions: property.enumDescriptions?.length }, {
			type: 'string', default: 'session', scope: ConfigurationScope.WINDOW, tags: ['experimental'], enum: ['session', 'chat', 'chat-shared'], descriptions: 3,
		});
	});

	test('does not register the unreleased former setting', () => {
		const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		assert.strictEqual(properties['sessions.experimental.chatSpecificLayout'], undefined);
	});

	test('keeps effective presentation unchanged until reload without listening for configuration changes', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const presentation = store.add(new ChatLayoutPresentation(configuration, true, constObservable(false)));
		const instantiation = store.add(new TestInstantiationService());
		sinon.stub(instantiation, 'createInstance').returns(store.add(new DisposableStore()));
		const configurationListener = sinon.spy(configuration, 'onDidChangeConfiguration');
		store.add(new SessionsLayoutContribution(instantiation, upcastPartial<IAgentWorkbenchLayoutService>({
			agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, chatLayoutPresentation: presentation,
		})));
		const change = upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === SESSIONS_LAYOUT_MODE_SETTING });
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_MODE_SETTING, 'chat');
		configuration.onDidChangeConfigurationEmitter.fire(change);
		const activeAfterEnable = presentation.state.get().active;
		const reloadedPresentation = store.add(new ChatLayoutPresentation(configuration, true, constObservable(false)));
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_MODE_SETTING, 'session');
		configuration.onDidChangeConfigurationEmitter.fire(change);
		assert.deepStrictEqual({
			configurationListeners: configurationListener.callCount,
			activeAfterEnable,
			activeAfterRevert: presentation.state.get().active,
			activeAfterReload: reloadedPresentation.state.get().active,
		}, {
			configurationListeners: 0,
			activeAfterEnable: false,
			activeAfterRevert: false,
			activeAfterReload: true,
		});
	});
});
