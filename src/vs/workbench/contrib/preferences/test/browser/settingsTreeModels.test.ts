/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { Event } from '../../../../../base/common/event.js';
import { ManagedSettingValue } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { settingKeyToDisplayFormat, parseQuery, IParsedQuery, sanitizeId, SearchResultModel, SearchResultIdx, ISettingsEditorViewState, SettingsTreeSettingElement, SettingsTreeModel } from '../../browser/settingsTreeModels.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { COPILOT_SANDBOX_ALLOWED_HOSTS_KEY, COPILOT_SANDBOX_ALLOW_BYPASS_KEY, COPILOT_SANDBOX_ALLOW_DEV_TOOL_ACCESS_KEY, COPILOT_SANDBOX_ALLOW_LOCAL_NETWORK_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, COPILOT_SANDBOX_ENABLED_KEY, COPILOT_SANDBOX_LSP_SERVERS_KEY, COPILOT_SANDBOX_MCP_SERVERS_KEY, IManagedSettingsService, NullManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { IWorkbenchConfigurationService } from '../../../../services/configuration/common/configuration.js';
import { ExperimentalSettingsService, IExperimentalSettingsService } from '../../../../services/configuration/common/experimentalSettings.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ISetting, SettingMatchType } from '../../../../services/preferences/common/preferences.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { TestProductService, TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';
import { EXP_ASSIGNMENT_SETTING_TAG, POLICY_SETTING_TAG } from '../../common/preferences.js';
import { SettingsTarget } from '../../browser/preferencesWidgets.js';
import { LayoutSettings, ModernUIDensity } from '../../../../services/layout/browser/layoutService.js';
import { IManagedSettingsPresentationService, ManagedSettingsPresentationService } from '../../../../services/configuration/common/managedSettingsPresentation.js';
import { terminalContribConfiguration } from '../../../terminal/terminalContribExports.js';
import { SettingMatches } from '../../browser/preferencesSearch.js';
import { chatNetworkDomainConfigurationProperties } from '../../../chat/browser/chatNetworkConfiguration.js';

suite('SettingsTree Agents Window density', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(isSessionsWindow: boolean, settingsTarget: SettingsTarget) {
		const key = LayoutSettings.MODERN_UI_DENSITY;
		const defaults = new TestConfigurationService({ [key]: ModernUIDensity.Default });
		const workspace = new TestConfigurationService();
		const configuration = new class extends TestConfigurationService {
			isSettingAppliedForAllProfiles(): boolean { return false; }
			override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
				const inspected = super.inspect<T>(key, overrides);
				const defaultValue = defaults.getValue<T>(key);
				const workspaceValue = workspace.getValue<T>(key);
				return { ...inspected, defaultValue, workspaceValue, value: workspaceValue ?? inspected.userValue ?? defaultValue };
			}
		}({ [key]: ModernUIDensity.Compact });
		for (const service of [defaults, workspace, configuration]) {
			store.add(service.onDidChangeConfigurationEmitter);
		}
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchConfigurationService, configuration);
		instantiationService.stub(ILanguageService, { isRegisteredLanguageId: () => true });
		instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow });
		instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
		instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
		instantiationService.stub(IManagedSettingsPresentationService, store.add(instantiationService.createInstance(ManagedSettingsPresentationService)));
		const model = store.add(instantiationService.createInstance(SearchResultModel, { settingsTarget }, null, true));
		model.setResult(SearchResultIdx.Local, {
			filterMatches: [{
				setting: new class extends mock<ISetting>() {
					override key = key;
					override type = 'string';
					override enum = [ModernUIDensity.Default, ModernUIDensity.Compact];
					override description = [];
					override scope = ConfigurationScope.WINDOW;
				}(),
				matches: [], matchType: SettingMatchType.None, keyMatchScore: 0, score: 0,
			}],
			exactMatch: false,
		});
		const read = () => {
			const element = model.getElementsByName(key)![0];
			element.inspectSelf();
			return { value: element.value, defaultValue: element.defaultValue, configured: element.isConfigured };
		};
		return { workspace, read, key };
	}

	test('shows inherited density until an Agents Window override is set', async () => {
		const { workspace, read, key } = createModel(true, ConfigurationTarget.WORKSPACE);
		const inherited = read();
		await workspace.setUserConfiguration(key, ModernUIDensity.Default);
		const overridden = read();
		await workspace.setUserConfiguration(key, undefined);

		const inheritedState = { value: ModernUIDensity.Compact, defaultValue: ModernUIDensity.Default, configured: false };
		assert.deepStrictEqual({ inherited, overridden, reset: read() }, {
			inherited: inheritedState,
			overridden: { value: ModernUIDensity.Default, defaultValue: ModernUIDensity.Default, configured: true },
			reset: inheritedState,
		});
	});

	test('preserves the existing editor-window and User scope display', () => {
		assert.deepStrictEqual({
			editorWorkspace: createModel(false, ConfigurationTarget.WORKSPACE).read(),
			agentsUser: createModel(true, ConfigurationTarget.USER_LOCAL).read(),
		}, {
			editorWorkspace: { value: ModernUIDensity.Default, defaultValue: ModernUIDensity.Default, configured: false },
			agentsUser: { value: ModernUIDensity.Compact, defaultValue: ModernUIDensity.Default, configured: true },
		});
	});
});

suite('SettingsTree managed sandbox', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	assert.ok(terminalContribConfiguration);
	const configurationNode = { id: 'sandboxPresentationTest', properties: Object.fromEntries(Object.entries({ ...terminalContribConfiguration, ...chatNetworkDomainConfigurationProperties }).filter(([, property]) => property.managedSettingsPresentation)) };
	suiteSetup(() => registry.registerConfiguration(configurationNode));
	suiteTeardown(() => registry.deregisterConfigurations([configurationNode]));

	function createModel(settingsTarget: SettingsTarget = ConfigurationTarget.USER_LOCAL, localAccess = true, settingKeys?: (AgentSandboxSettingId | AgentNetworkDomainSettingId)[]) {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new class extends TestConfigurationService {
			isSettingAppliedForAllProfiles(): boolean { return false; }
		}({
			[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.Off,
			[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: localAccess,
			[AgentSandboxSettingId.AgentSandboxAllowNetwork]: localAccess,
			[AgentSandboxSettingId.AgentSandboxMcpServers]: localAccess,
			[AgentSandboxSettingId.AgentSandboxLspServers]: localAccess,
			[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess]: localAccess,
			[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork]: localAccess,
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: ['local.example'],
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const managed: Record<string, ManagedSettingValue | undefined> = {};
		instantiationService.stub(IManagedSettingsService, new class extends mock<IManagedSettingsService>() {
			override readonly onDidChangeManagedSettings = Event.None;
			override getManagedSettingValue(key: string) { return managed[key]; }
		}());
		instantiationService.stub(IManagedSettingsPresentationService, store.add(instantiationService.createInstance(ManagedSettingsPresentationService)));
		instantiationService.stub(IWorkbenchConfigurationService, configuration);
		instantiationService.stub(ILanguageService, { isRegisteredLanguageId: () => true });
		instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
		const viewState: ISettingsEditorViewState = { settingsTarget };
		const model = store.add(instantiationService.createInstance(SearchResultModel, viewState, null, true));
		const keys = settingKeys ?? [AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, AgentSandboxSettingId.AgentSandboxAllowNetwork];
		model.setResult(SearchResultIdx.Local, {
			filterMatches: keys.map(key => ({
				setting: new class extends mock<ISetting>() {
					override key = key;
					override type = key === AgentNetworkDomainSettingId.AllowedNetworkDomains ? 'array' : key === AgentSandboxSettingId.AgentSandboxEnabled ? 'string' : 'boolean';
					override arrayItemType = key === AgentNetworkDomainSettingId.AllowedNetworkDomains ? 'string' : undefined;
					override description = [];
					override scope = ConfigurationScope.RESOURCE;
				}(),
				matches: [], matchType: SettingMatchType.None, keyMatchScore: 0, score: 0,
			})),
			exactMatch: false,
		});
		const read = () => keys.map(key => {
			const element = model.getElementsByName(key)![0];
			element.inspectSelf();
			return {
				value: element.value,
				managed: element.hasPolicyValue,
				policyFilter: element.matchesAllTags(new Set([POLICY_SETTING_TAG])),
			};
		});
		return { model, managed, configuration, read, keys, viewState };
	}

	for (const allowedHosts of [[], ['managed.example', '*.managed.example']]) {
		test(`managed allowlist ${JSON.stringify(allowedHosts)} locks allowed domains and restores local preferences after removal`, () => {
			const key = AgentNetworkDomainSettingId.AllowedNetworkDomains;
			const { managed, configuration, read } = createModel(ConfigurationTarget.USER_LOCAL, true, [key]);
			const initial = read();
			managed[COPILOT_SANDBOX_ALLOWED_HOSTS_KEY] = JSON.stringify(allowedHosts);
			const locked = read();
			delete managed[COPILOT_SANDBOX_ALLOWED_HOSTS_KEY];
			assert.deepStrictEqual({ initial, locked, removed: read(), stored: configuration.getValue(key) }, {
				initial: [{ value: ['local.example'], managed: false, policyFilter: false }],
				locked: [{ value: allowedHosts, managed: true, policyFilter: true }],
				removed: initial,
				stored: ['local.example'],
			});
		});
	}

	test('ignores malformed managed allowlists in the presentation and preserves local values', () => {
		const key = AgentNetworkDomainSettingId.AllowedNetworkDomains;
		const { managed, configuration, read } = createModel(ConfigurationTarget.USER_LOCAL, true, [key]);
		const consoleWarn = stub(console, 'warn');
		try {
			const settings = ['not JSON', '["managed.example",1]', '{}', 'null', false].map(value => {
				managed[COPILOT_SANDBOX_ALLOWED_HOSTS_KEY] = value;
				return read();
			});
			assert.deepStrictEqual({
				settings,
				stored: configuration.getValue(key),
				warnings: consoleWarn.callCount,
			}, {
				settings: Array.from({ length: 5 }, () => [{ value: ['local.example'], managed: false, policyFilter: false }]),
				stored: ['local.example'],
				warnings: 5,
			});
		} finally {
			consoleWarn.restore();
		}
	});

	for (const enabled of [undefined, false, true]) {
		for (const allowBypass of [undefined, false, true]) {
			test(`resolved enabled=${enabled}, allowBypass=${allowBypass}`, () => {
				const { managed, read, configuration, keys } = createModel();
				managed[COPILOT_SANDBOX_ENABLED_KEY] = enabled;
				managed[COPILOT_SANDBOX_ALLOW_BYPASS_KEY] = allowBypass;
				const required = enabled === true;
				const bypassRestricted = (required && allowBypass !== true) || allowBypass === false;

				assert.deepStrictEqual({
					settings: read(),
					configured: keys.map(key => configuration.getValue(key)),
				}, {
					settings: [
						{ value: required ? 'on' : 'off', managed: required, policyFilter: required },
						{ value: !bypassRestricted, managed: bypassRestricted, policyFilter: bypassRestricted },
						{ value: true, managed: false, policyFilter: false },
					],
					configured: ['off', true, true],
				});
			});
		}
	}

	for (const target of [ConfigurationTarget.USER_LOCAL, ConfigurationTarget.USER_REMOTE, ConfigurationTarget.WORKSPACE] as const) {
		for (const localAccess of [false, true]) {
			for (const [key, policyKey, otherPolicyKey, managedValue] of [
				[AgentSandboxSettingId.AgentSandboxMcpServers, COPILOT_SANDBOX_MCP_SERVERS_KEY, COPILOT_SANDBOX_LSP_SERVERS_KEY, true],
				[AgentSandboxSettingId.AgentSandboxLspServers, COPILOT_SANDBOX_LSP_SERVERS_KEY, COPILOT_SANDBOX_MCP_SERVERS_KEY, true],
				[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess, COPILOT_SANDBOX_ALLOW_DEV_TOOL_ACCESS_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, false],
				[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork, COPILOT_SANDBOX_ALLOW_LOCAL_NETWORK_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, false],
			] as const) {
				test(`managed ${key} preserves local ${localAccess} in target ${target}`, () => {
					const { managed, read, configuration } = createModel(target, localAccess, [key]);
					const initial = read();
					managed[otherPolicyKey] = managedValue;
					const independent = read();
					managed[policyKey] = managedValue;
					const required = read();
					managed[policyKey] = !managedValue;
					const optional = read();
					delete managed[policyKey];
					assert.deepStrictEqual({ independent, required, optional, removed: read(), stored: configuration.getValue(key) }, {
						independent: initial,
						required: [{ value: managedValue, managed: true, policyFilter: true }],
						optional: initial,
						removed: initial,
						stored: localAccess,
					});
				});
			}

			test(`managed access restrictions preserve local ${localAccess} in target ${target}`, () => {
				const { managed, read, configuration, keys } = createModel(target, localAccess);
				const initial = read();
				managed[COPILOT_SANDBOX_ALLOW_BYPASS_KEY] = false;
				managed[COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY] = false;
				const denied = read().slice(1);
				managed[COPILOT_SANDBOX_ALLOW_BYPASS_KEY] = true;
				managed[COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY] = true;
				const allowed = read();
				delete managed[COPILOT_SANDBOX_ALLOW_BYPASS_KEY];
				delete managed[COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY];
				assert.deepStrictEqual({ denied, allowed, removed: read(), configured: keys.slice(1).map(key => configuration.getValue(key)) }, {
					denied: [
						{ value: false, managed: true, policyFilter: true },
						{ value: false, managed: true, policyFilter: true },
					],
					allowed: initial,
					removed: initial,
					configured: [localAccess, localAccess],
				});
			});
		}

		test(`refreshes existing rows and restores preferences after removal in target ${target}`, () => {
			const { managed, read } = createModel(target);
			const initial = read();
			managed[COPILOT_SANDBOX_ENABLED_KEY] = true;
			const required = read();
			managed[COPILOT_SANDBOX_ALLOW_BYPASS_KEY] = true;
			const bypassAllowed = read();
			delete managed[COPILOT_SANDBOX_ENABLED_KEY];
			delete managed[COPILOT_SANDBOX_ALLOW_BYPASS_KEY];

			assert.deepStrictEqual({ required: required.slice(0, 2), bypassAllowed, removed: read() }, {
				required: [
					{ value: 'on', managed: true, policyFilter: true },
					{ value: false, managed: true, policyFilter: true },
				],
				bypassAllowed: [
					{ value: 'on', managed: true, policyFilter: true },
					...initial.slice(1),
				],
				removed: initial,
			});
		});
	}

	test('runtime restrictions take precedence in the UI and leave configuration policies intact', () => {
		const { managed, configuration, read } = createModel();
		configuration.inspect = <T>(key: string) => ({
			policyValue: configuration.getValue<T>(key),
		});
		managed[COPILOT_SANDBOX_ENABLED_KEY] = true;
		const required = read().slice(0, 2);
		delete managed[COPILOT_SANDBOX_ENABLED_KEY];
		assert.deepStrictEqual({ required, removed: read().slice(0, 2) }, {
			required: [
				{ value: 'on', managed: true, policyFilter: true },
				{ value: false, managed: true, policyFilter: true },
			],
			removed: [
				{ value: 'off', managed: true, policyFilter: true },
				{ value: true, managed: true, policyFilter: true },
			],
		});
	});
});

suite('SettingsTree ExP assignments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel() {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new class extends TestConfigurationService {
			isSettingAppliedForAllProfiles(): boolean { return false; }
		}({ 'test.modified': true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const assignments = store.add(new ExperimentalSettingsService());
		instantiationService.stub(IWorkbenchConfigurationService, configuration);
		instantiationService.stub(ILanguageService, { isRegisteredLanguageId: () => true });
		instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(IExperimentalSettingsService, assignments);
		instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
		instantiationService.stub(IManagedSettingsPresentationService, store.add(instantiationService.createInstance(ManagedSettingsPresentationService)));
		const viewState: ISettingsEditorViewState = { settingsTarget: ConfigurationTarget.USER_LOCAL, tagFilters: new Set([EXP_ASSIGNMENT_SETTING_TAG]) };
		const model = store.add(instantiationService.createInstance(SearchResultModel, viewState, null, true));
		const settings = ['test.assigned', 'test.experimental', 'test.modified', 'test.spoofed'].map(key => new class extends mock<ISetting>() {
			override key = key;
			override type = 'boolean';
			override description = [];
			override scope = ConfigurationScope.RESOURCE;
			override tags = key === 'test.experimental' ? ['experimental'] : key === 'test.spoofed' ? [EXP_ASSIGNMENT_SETTING_TAG] : [];
		}());
		model.setResult(SearchResultIdx.Local, {
			filterMatches: settings.map(setting => ({ setting, matches: [], matchType: SettingMatchType.None, keyMatchScore: 0, score: 0 })),
			exactMatch: false,
		});
		const read = () => ({
			count: model.getUniqueResultsCount(),
			settings: model.root.children.filter((child): child is SettingsTreeSettingElement => child instanceof SettingsTreeSettingElement)
				.map(child => ({ key: child.setting.key, assigned: child.hasExPAssignment })),
		});
		return { assignments, model, viewState, configuration, read };
	}

	test('filters real assignments, not experimental or statically supplied tags', () => {
		const { assignments, model, read } = createModel();
		const empty = read();
		assignments.setAssignment('test.assigned', true);
		assignments.setAssignment('test.modified', true);
		model.updateChildren();
		const assigned = read();
		assignments.setAssignment('test.assigned', false);
		model.updateChildren();

		assert.deepStrictEqual({ empty, assigned, removed: read() }, {
			empty: { count: 0, settings: [] },
			assigned: { count: 2, settings: [{ key: 'test.assigned', assigned: true }, { key: 'test.modified', assigned: true }] },
			removed: { count: 1, settings: [{ key: 'test.modified', assigned: true }] },
		});
	});

	test('composes with modified and settings scope without changing assignment state', () => {
		const { assignments, model, viewState, read } = createModel();
		assignments.setAssignment('test.assigned', true);
		assignments.setAssignment('test.modified', true);
		viewState.tagFilters!.add('modified');
		model.updateChildren();
		const user = read();
		viewState.settingsTarget = ConfigurationTarget.WORKSPACE;
		model.updateChildren();
		const workspace = read();
		viewState.tagFilters!.delete('modified');
		model.updateChildren();

		assert.deepStrictEqual({ user, workspace, assignedInWorkspace: read() }, {
			user: { count: 1, settings: [{ key: 'test.modified', assigned: true }] },
			workspace: { count: 0, settings: [] },
			assignedInWorkspace: { count: 2, settings: [{ key: 'test.assigned', assigned: true }, { key: 'test.modified', assigned: true }] },
		});
	});

	test('resetting a modified setting leaves its assignment intact', async () => {
		const { assignments, model, viewState, configuration, read } = createModel();
		assignments.setAssignment('test.modified', true);
		viewState.tagFilters!.add('modified');
		model.updateChildren();
		const beforeReset = read();
		await configuration.setUserConfiguration('test.modified', undefined);
		model.updateChildren();
		const afterReset = read();
		viewState.tagFilters!.delete('modified');
		model.updateChildren();

		assert.deepStrictEqual({ beforeReset, afterReset, assignmentOnly: read() }, {
			beforeReset: { count: 1, settings: [{ key: 'test.modified', assigned: true }] },
			afterReset: { count: 0, settings: [] },
			assignmentOnly: { count: 1, settings: [{ key: 'test.modified', assigned: true }] },
		});
	});

	test('policy values do not hide an assignment or mark it as user-modified', () => {
		const { assignments, model, configuration } = createModel();
		assignments.setAssignment('test.modified', true);
		configuration.inspect = <T>(key: string) => ({
			value: configuration.getValue<T>(key),
			policyValue: configuration.getValue<T>(key),
		});
		model.updateChildren();
		const element = model.getElementsByName('test.modified')![0];
		assert.deepStrictEqual({
			assigned: element.hasExPAssignment,
			policy: element.hasPolicyValue,
			modified: element.isConfigured,
			matchesAssignment: element.matchesAllTags(new Set([EXP_ASSIGNMENT_SETTING_TAG])),
		}, { assigned: true, policy: true, modified: false, matchesAssignment: true });
	});

	test('parses assignment and modified filters separately from free text', () => {
		assert.deepStrictEqual(parseQuery('@modified @tag:expassigned font'), {
			tags: [EXP_ASSIGNMENT_SETTING_TAG, 'modified'],
			extensionFilters: [],
			featureFilters: [],
			idFilters: [],
			languageFilter: undefined,
			query: 'font',
		});
	});
});

suite('SettingsTree deprecation warnings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const search of [false, true]) {
		test(`keeps opted-in warnings visible without exposing unconfigured deprecated settings (search=${search})`, async () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new class extends TestConfigurationService {
				isSettingAppliedForAllProfiles(): boolean { return false; }
			}({ 'test.configured': true });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IWorkbenchConfigurationService, configuration);
			instantiationService.stub(ILanguageService, { isRegisteredLanguageId: () => true });
			instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
			instantiationService.stub(IProductService, TestProductService);
			instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
			instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
			instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
			instantiationService.stub(IManagedSettingsPresentationService, store.add(instantiationService.createInstance(ManagedSettingsPresentationService)));
			const viewState: ISettingsEditorViewState = { settingsTarget: ConfigurationTarget.USER_LOCAL };
			const model = store.add(search
				? instantiationService.createInstance(SearchResultModel, viewState, null, true)
				: instantiationService.createInstance(SettingsTreeModel, viewState, true));
			const settings = ['test.upcoming', 'test.deprecated', 'test.configured', 'test.explicitlyHidden', 'test.normal'].map(key => new class extends mock<ISetting>() {
				override key = key;
				override type = 'boolean';
				override description = [];
				override scope = ConfigurationScope.RESOURCE;
				override deprecationMessage = key === 'test.normal' ? undefined : 'This setting will be deprecated soon.';
				override deprecationMessageShowInSettings = key === 'test.upcoming' ? true : key === 'test.explicitlyHidden' ? false : undefined;
			}());
			const update = () => {
				if (model instanceof SearchResultModel) {
					model.setResult(SearchResultIdx.Local, {
						filterMatches: settings.map(setting => ({ setting, matches: [], matchType: SettingMatchType.None, keyMatchScore: 0, score: 0 })),
						exactMatch: false,
					});
				} else {
					model.update({ id: 'deprecationWarnings', label: '', settings });
				}
			};
			const visible = () => model.root.children
				.filter((child): child is SettingsTreeSettingElement => child instanceof SettingsTreeSettingElement)
				.map(child => ({ key: child.setting.key, warning: child.setting.deprecationMessage }));
			update();
			const initial = visible();
			await configuration.setUserConfiguration('test.configured', undefined);
			update();
			assert.deepStrictEqual({ initial, reset: visible() }, {
				initial: [
					{ key: 'test.upcoming', warning: 'This setting will be deprecated soon.' },
					{ key: 'test.configured', warning: 'This setting will be deprecated soon.' },
					{ key: 'test.normal', warning: undefined },
				],
				reset: [
					{ key: 'test.upcoming', warning: 'This setting will be deprecated soon.' },
					{ key: 'test.normal', warning: undefined },
				],
			});
		});
	}
});

suite('SettingsTree sandbox network search ordering', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sandbox search puts user-configured paths before allowed and denied domains', () => {
		const configuration = new class extends TestConfigurationService {
			isSettingAppliedForAllProfiles(): boolean { return false; }
		}();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchConfigurationService, configuration);
		instantiationService.stub(ILanguageService, { isRegisteredLanguageId: () => true });
		instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
		instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
		instantiationService.stub(IManagedSettingsPresentationService, store.add(instantiationService.createInstance(ManagedSettingsPresentationService)));
		const keys = [
			AgentSandboxSettingId.AgentSandboxUserConfiguredPaths,
			AgentNetworkDomainSettingId.AllowedNetworkDomains,
			AgentNetworkDomainSettingId.DeniedNetworkDomains,
		];
		const model = store.add(instantiationService.createInstance(SearchResultModel,
			{ settingsTarget: ConfigurationTarget.USER_LOCAL, query: 'sandbox' },
			new Map(keys.map((key, index) => [key, index])), true));
		const matches = [...keys].reverse().map(key => {
			const setting = new class extends mock<ISetting>() {
				override key = key;
				override type = 'array';
				override description = [];
				override scope = ConfigurationScope.APPLICATION;
				override keyRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: key.length + 1 };
			}();
			const match = new SettingMatches('sandbox', setting, true, configuration);
			return { setting, matches: match.matches, matchType: match.matchType, keyMatchScore: match.keyMatchScore, score: 0 };
		});
		model.setResult(SearchResultIdx.Local, { filterMatches: matches, exactMatch: false });
		assert.deepStrictEqual(model.getUniqueSearchResults()?.filterMatches.map(match => ({
			key: match.setting.key,
			matchType: match.matchType,
		})), keys.map(key => ({
			key,
			matchType: SettingMatchType.AllWordsInSettingsLabel | SettingMatchType.ContiguousQueryInSettingId,
		})));
	});
});

suite('SettingsTree', () => {
	test('settingKeyToDisplayFormat - sandbox outbound connections', () => {
		assert.deepStrictEqual([
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowNetwork),
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowNetwork, 'chat'),
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowNetwork, 'chat.agent.sandbox'),
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowNetwork, 'chat.agent.sandbox.network'),
			settingKeyToDisplayFormat('other.allowNetwork'),
		], [
			{ category: 'Chat › Agent › Sandbox › Network', label: 'Allow Outbound Connections' },
			{ category: 'Agent › Sandbox › Network', label: 'Allow Outbound Connections' },
			{ category: 'Network', label: 'Allow Outbound Connections' },
			{ category: '', label: 'Allow Outbound Connections' },
			{ category: 'Other', label: 'Allow Network' },
		]);
	});

	test('settingKeyToDisplayFormat - allowed network domains', () => {
		assert.deepStrictEqual([
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.AllowedNetworkDomains),
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.AllowedNetworkDomains, 'chat'),
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.AllowedNetworkDomains, 'chat.agent.sandbox'),
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.AllowedNetworkDomains, 'chat.agent.sandbox.network'),
		], [
			{ category: 'Chat › Agent › Sandbox › Network', label: 'Allowed Domains' },
			{ category: 'Agent › Sandbox › Network', label: 'Allowed Domains' },
			{ category: 'Network', label: 'Allowed Domains' },
			{ category: '', label: 'Allowed Domains' },
		]);
	});

	test('settingKeyToDisplayFormat - denied network domains', () => {
		assert.deepStrictEqual([
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.DeniedNetworkDomains),
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.DeniedNetworkDomains, 'chat.agent.sandbox'),
			settingKeyToDisplayFormat(AgentNetworkDomainSettingId.DeniedNetworkDomains, 'chat.agent.sandbox.network'),
		], [
			{ category: 'Chat › Agent › Sandbox › Network', label: 'Denied Domains' },
			{ category: 'Network', label: 'Denied Domains' },
			{ category: '', label: 'Denied Domains' },
		]);
	});

	test('settingKeyToDisplayFormat - sandbox bypass', () => {
		assert.deepStrictEqual([
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands),
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, 'chat'),
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, 'chat.agent.sandbox'),
			settingKeyToDisplayFormat('other.allowUnsandboxedCommands'),
		], [
			{ category: 'Chat › Agent › Sandbox', label: 'Allow Sandbox Bypass' },
			{ category: 'Agent › Sandbox', label: 'Allow Sandbox Bypass' },
			{ category: '', label: 'Allow Sandbox Bypass' },
			{ category: 'Other', label: 'Allow Unsandboxed Commands' },
		]);
	});

	test('settingKeyToDisplayFormat - sandbox local network', () => {
		assert.deepStrictEqual({
			keys: [AgentSandboxSettingId.AgentSandboxAllowNetwork, AgentSandboxSettingId.AgentSandboxAllowLocalNetwork],
			display: ['', 'chat', 'chat.agent.sandbox', 'chat.agent.sandbox.network'].map(group =>
				settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowLocalNetwork, group)),
		}, {
			keys: ['chat.agent.sandbox.network.allowNetwork', 'chat.agent.sandbox.network.allowLocalNetwork'],
			display: [
				{ category: 'Chat › Agent › Sandbox › Network', label: 'Allow Local Network' },
				{ category: 'Agent › Sandbox › Network', label: 'Allow Local Network' },
				{ category: 'Network', label: 'Allow Local Network' },
				{ category: '', label: 'Allow Local Network' },
			],
		});
	});

	test('settingKeyToDisplayFormat', () => {
		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar'),
			{
				category: 'Foo',
				label: 'Bar'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc'),
			{
				category: 'Foo › Bar',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.etcSomething'),
			{
				category: 'Foo Bar',
				label: 'Etc Something'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo'),
			{
				category: '',
				label: 'Foo'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.1leading.number'),
			{
				category: 'Foo › 1leading',
				label: 'Number'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.1Leading.number'),
			{
				category: 'Foo › 1 Leading',
				label: 'Number'
			});
	});

	test('settingKeyToDisplayFormat - sandbox placeholder settings', () => {
		assert.deepStrictEqual([
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxMcpServers, 'chat.agent.sandbox'),
			settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxLspServers, 'chat.agent.sandbox'),
		], [
			{ category: '', label: 'Sandbox MCP Servers' },
			{ category: '', label: 'Sandbox LSP Servers' },
		]);
	});

	test('settingKeyToDisplayFormat - sandbox developer tool file system access', () => {
		assert.deepStrictEqual({
			key: AgentSandboxSettingId.AgentSandboxAllowDevToolAccess,
			display: ['', 'chat', 'chat.agent.sandbox', 'chat.agent.sandbox.fileSystem'].map(group =>
				settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxAllowDevToolAccess, group)),
		}, {
			key: 'chat.agent.sandbox.fileSystem.allowDevToolAccess',
			display: [
				{ category: 'Chat › Agent › Sandbox › File System', label: 'Allow Dev Tool Access' },
				{ category: 'Agent › Sandbox › File System', label: 'Allow Dev Tool Access' },
				{ category: 'File System', label: 'Allow Dev Tool Access' },
				{ category: '', label: 'Allow Dev Tool Access' },
			],
		});
	});

	test('settingKeyToDisplayFormat - sandbox credential authentication', () => {
		for (const [key, label] of [
			[AgentSandboxSettingId.AgentSandboxAuthenticateGit, 'Authenticate git'],
			[AgentSandboxSettingId.AgentSandboxAuthenticateGh, 'Authenticate gh'],
		] as const) {
			assert.deepStrictEqual(
				['', 'chat.agent.sandbox', 'chat.agent.sandbox.credentials'].map(group => settingKeyToDisplayFormat(key, group)),
				[
					{ category: 'Chat › Agent › Sandbox › Credentials', label },
					{ category: 'Credentials', label },
					{ category: '', label },
				],
			);
		}
	});

	test('settingKeyToDisplayFormat - sandbox user-configured paths', () => {
		assert.deepStrictEqual(
			['', 'chat.agent.sandbox', 'chat.agent.sandbox.fileSystem'].map(group =>
				settingKeyToDisplayFormat(AgentSandboxSettingId.AgentSandboxUserConfiguredPaths, group)),
			[
				{ category: 'Chat › Agent › Sandbox › File System', label: 'User-Configured Paths' },
				{ category: 'File System', label: 'User-Configured Paths' },
				{ category: '', label: 'User-Configured Paths' },
			],
		);
	});

	test('settingKeyToDisplayFormat - with category', () => {
		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar', 'foo'),
			{
				category: '',
				label: 'Bar'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('disableligatures.ligatures', 'disableligatures'),
			{
				category: '',
				label: 'Ligatures'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'foo'),
			{
				category: 'Bar',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.etcSomething', 'foo'),
			{
				category: 'Foo Bar',
				label: 'Etc Something'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'foo/bar'),
			{
				category: '',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'something/foo'),
			{
				category: 'Bar',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('bar.etc', 'something.bar'),
			{
				category: '',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.etc', 'fooBar'),
			{
				category: '',
				label: 'Etc'
			});


		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.somethingElse.etc', 'fooBar'),
			{
				category: 'Something Else',
				label: 'Etc'
			});
	});

	test('settingKeyToDisplayFormat - known acronym/term', () => {
		assert.deepStrictEqual(
			settingKeyToDisplayFormat('css.someCssSetting'),
			{
				category: 'CSS',
				label: 'Some CSS Setting'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('powershell.somePowerShellSetting'),
			{
				category: 'PowerShell',
				label: 'Some PowerShell Setting'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('ocaml.server.extendedHover'),
			{
				category: 'OCaml › Server',
				label: 'Extended Hover'
			});
	});

	test('parseQuery', () => {
		function testParseQuery(input: string, expected: IParsedQuery) {
			assert.deepStrictEqual(
				parseQuery(input),
				expected,
				input
			);
		}

		testParseQuery(
			'',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@modified',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@tag:foo',
			<IParsedQuery>{
				tags: ['foo'],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@modified foo',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: 'foo',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@tag:foo @modified',
			<IParsedQuery>{
				tags: ['foo', 'modified'],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@tag:foo @modified my query',
			<IParsedQuery>{
				tags: ['foo', 'modified'],
				extensionFilters: [],
				query: 'my query',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'test @modified query',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: 'test  query',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'test @modified',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: 'test',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'query has @ for some reason',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				query: 'query has @ for some reason',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@ext:github.vscode-pull-request-github',
			<IParsedQuery>{
				tags: [],
				extensionFilters: ['github.vscode-pull-request-github'],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@ext:github.vscode-pull-request-github,vscode.git',
			<IParsedQuery>{
				tags: [],
				extensionFilters: ['github.vscode-pull-request-github', 'vscode.git'],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});
		testParseQuery(
			'@feature:scm',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: ['scm'],
				query: '',
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@feature:scm,terminal',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: ['scm', 'terminal'],
				query: '',
				idFilters: [],
				languageFilter: undefined
			});
		testParseQuery(
			'@id:files.autoSave',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: ['files.autoSave'],
				languageFilter: undefined
			});

		testParseQuery(
			'@id:files.autoSave,terminal.integrated.commandsToSkipShell',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: ['files.autoSave', 'terminal.integrated.commandsToSkipShell'],
				languageFilter: undefined
			});

		testParseQuery(
			'@lang:cpp',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: [],
				languageFilter: 'cpp'
			});

		testParseQuery(
			'@lang:cpp,python',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: [],
				languageFilter: 'cpp'
			});
	});

	test('sanitizeId replaces all dots and slashes', () => {
		assert.deepStrictEqual(
			[
				sanitizeId('root.editor.font.size'),
				sanitizeId('group/subgroup/setting.key'),
				sanitizeId('no-special-chars'),
				sanitizeId('single.dot'),
			],
			[
				'root_editor_font_size',
				'group_subgroup_setting_key',
				'no-special-chars',
				'single_dot',
			]
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
