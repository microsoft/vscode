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
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AgentWorkbenchLayout } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { SESSIONS_LAYOUT_SCOPE_SETTING, ChatLayoutPresentation } from '../../../../common/chatLayout.js';
import { SessionsLayoutContribution, SessionsSidePaneLayoutContribution } from '../../browser/sessions.layout.contribution.js';
import { ConfigurationMigration, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../../workbench/common/configuration.js';
import { LEGACY_SESSION_TOOLBAR_SETTING, SESSION_ACTIVITY_BAR_SETTING, SESSIONS_FLOATING_DETAILS_SETTING, SESSIONS_DETAILS_POSITION_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';

// Capture registration before configuration tests reset the shared registry.
const registeredProperties = { ...Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties() };

suite('Sessions chat layout configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('registers a chat-default experimental window enum with descriptions', () => {
		const property = registeredProperties[SESSIONS_LAYOUT_SCOPE_SETTING];
		assert.deepStrictEqual({ key: SESSIONS_LAYOUT_SCOPE_SETTING, type: property.type, default: property.default, scope: property.scope, tags: property.tags, experiment: property.experiment, enum: property.enum, descriptions: property.enumDescriptions?.length }, {
			key: 'sessions.experimental.layoutScope', type: 'string', default: 'chat', scope: ConfigurationScope.WINDOW, tags: ['experimental', 'onExP'], experiment: { mode: 'startup' }, enum: ['session-shared', 'chat-shared', 'chat'], descriptions: 3,
		});
	});

	test('does not register the unreleased former settings', () => {
		assert.deepStrictEqual(['sessions.experimental.chatSpecificLayout', 'sessions.layout.mode', 'sessions.experimental.sidePanePosition'].map(key => registeredProperties[key]), [undefined, undefined, undefined]);
	});

	test('registers opt-in window-scoped side-pane layout settings', () => {
		assert.deepStrictEqual([SESSIONS_DETAILS_POSITION_SETTING, SESSIONS_FLOATING_DETAILS_SETTING].map(key => {
			const property = registeredProperties[key];
			return { type: property.type, default: property.default, scope: property.scope, tags: property.tags };
		}), [
			{ type: 'string', default: 'right', scope: ConfigurationScope.WINDOW, tags: ['experimental'] },
			{ type: 'boolean', default: false, scope: ConfigurationScope.WINDOW, tags: ['experimental'] },
		]);
	});

	test('applies side-pane settings at startup and on change only to the desktop workbench', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const calls: (string | boolean)[] = [];
		const layout = upcastPartial<IAgentWorkbenchLayoutService>({
			agentWorkbenchLayout: AgentWorkbenchLayout.Desktop,
			setDetailsPosition: position => calls.push(position),
			setAuxiliaryBarFloating: floating => calls.push(floating),
		});
		const contribution = store.add(new SessionsSidePaneLayoutContribution(configuration, layout));
		await configuration.setUserConfiguration(SESSIONS_DETAILS_POSITION_SETTING, 'left');
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		await configuration.setUserConfiguration(SESSIONS_DETAILS_POSITION_SETTING, 'bottom');
		await configuration.setUserConfiguration(SESSIONS_FLOATING_DETAILS_SETTING, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		contribution.dispose();
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		store.add(new SessionsSidePaneLayoutContribution(configuration, upcastPartial<IAgentWorkbenchLayoutService>({
			...layout, agentWorkbenchLayout: AgentWorkbenchLayout.Mobile,
		})));
		assert.deepStrictEqual(calls, ['right', false, 'left', false, 'bottom', true]);
	});

	test('registers left, right, top, and bottom positions within the editor side panel', () => {
		assert.deepStrictEqual({
			options: registeredProperties[SESSIONS_DETAILS_POSITION_SETTING].enum,
			descriptions: registeredProperties[SESSIONS_DETAILS_POSITION_SETTING].enumDescriptions?.length,
		}, { options: ['right', 'left', 'top', 'bottom'], descriptions: 4 });
	});

	test('does not register a separate PR activity action opt-in setting', () => {
		assert.strictEqual(registeredProperties['sessions.sessionActivityBar.showGitHubActions'], undefined);
	});

	test('migrates the Session Toolbar setting to the Session Activity Bar setting unless that is already set', async () => {
		const migration = Registry.as<IConfigurationMigrationRegistry & { readonly migrations: readonly ConfigurationMigration[] }>(WorkbenchConfigurationExtensions.ConfigurationMigration).migrations
			.find(migration => migration.key === LEGACY_SESSION_TOOLBAR_SETTING);

		assert.deepStrictEqual({
			registered: registeredProperties[LEGACY_SESSION_TOOLBAR_SETTING],
			unset: await migration?.migrateFn(false, () => undefined),
			alreadySet: await migration?.migrateFn(false, () => true),
		}, {
			registered: undefined,
			unset: [[LEGACY_SESSION_TOOLBAR_SETTING, { value: undefined }], [SESSION_ACTIVITY_BAR_SETTING, { value: false }]],
			alreadySet: [[LEGACY_SESSION_TOOLBAR_SETTING, { value: undefined }]],
		});
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
		const change = upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === SESSIONS_LAYOUT_SCOPE_SETTING });
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_SCOPE_SETTING, 'chat');
		configuration.onDidChangeConfigurationEmitter.fire(change);
		const activeAfterEnable = presentation.state.get().active;
		const reloadedPresentation = store.add(new ChatLayoutPresentation(configuration, true, constObservable(false)));
		await configuration.setUserConfiguration(SESSIONS_LAYOUT_SCOPE_SETTING, 'session-shared');
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
