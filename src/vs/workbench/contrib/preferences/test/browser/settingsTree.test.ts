/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, COPILOT_SANDBOX_ALLOW_DEV_TOOL_ACCESS_KEY, COPILOT_SANDBOX_ALLOW_LOCAL_NETWORK_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, COPILOT_SANDBOX_ENABLED_KEY, COPILOT_SANDBOX_LSP_SERVERS_KEY, COPILOT_SANDBOX_MCP_SERVERS_KEY, IManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { ISetting } from '../../../../services/preferences/common/preferences.js';
import { SettingsTarget } from '../../browser/preferencesWidgets.js';
import { AbstractSettingRenderer, SettingTreeRenderers } from '../../browser/settingsTree.js';
import { SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';
import { ExperimentalSettingsService, IExperimentalSettingsService } from '../../../../services/configuration/common/experimentalSettings.js';
import { APPLY_ALL_PROFILES_SETTING } from '../../../../services/configuration/common/configuration.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IManagedSettingsPresentationService, ManagedSettingsPresentationService } from '../../../../services/configuration/common/managedSettingsPresentation.js';
import { terminalContribConfiguration } from '../../../terminal/terminalContribExports.js';

class TestSettingRenderer extends AbstractSettingRenderer {
	readonly templateId = 'test';
	toolbarDisposed = false;

	constructor() {
		super(
			[],
			(_setting: ISetting, _settingTarget: SettingsTarget): IAction[] => [],
			undefined!,
			undefined!,
			undefined!,
			{
				createInstance: () => ({
					dispose() { },
					updateScopeOverrides() { },
					updateWorkspaceTrust() { },
					updateSyncIgnored() { },
					updateDefaultOverrideIndicator() { },
					updatePreviewIndicator() { },
					updateAdvancedIndicator() { },
				})
			} as never,
			undefined!,
			undefined!,
			undefined!,
			new TestConfigurationService(),
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ setupDelayedHover: () => Disposable.None } as never,
			undefined!,
		);
	}

	renderTemplate(container: HTMLElement) {
		return this.renderCommonTemplate(undefined, container, 'test');
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: unknown): void {
		this.renderSettingElement(element, index, templateData as never);
	}

	protected override renderSettingToolbar(_container: HTMLElement): ToolBar {
		return {
			setActions() { },
			dispose: () => this.toolbarDisposed = true
		} as unknown as ToolBar;
	}

	protected renderValue(): void {
	}
}

function createSettingElement(deprecationMessageSeverity: 'warning' | 'info'): SettingsTreeSettingElement {
	const element = new SettingsTreeSettingElement(
		{
			key: 'test.setting',
			type: 'string',
			description: [],
			deprecationMessage: 'Deprecated setting',
			deprecationMessageSeverity,
		} as unknown as ISetting,
		new SettingsTreeGroupElement('test', undefined, 'Test', 0, false),
		ConfigurationTarget.USER_LOCAL,
		true,
		undefined,
		undefined!,
		{ extensionRecommendations: undefined } as never,
		{ currentProfile: { isDefault: true } } as never,
		new TestConfigurationService() as unknown as never,
		false,
		new class extends mock<IExperimentalSettingsService>() { override hasAssignment() { return false; } }(),
		new class extends mock<IManagedSettingsPresentationService>() { override getValue() { return undefined; } }(),
	);
	element.inspectSelf = () => { };
	return element;
}

suite('SettingsTree renderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	assert.ok(terminalContribConfiguration);
	const configurationNode = { id: 'sandboxRendererPresentationTest', properties: Object.fromEntries(Object.entries(terminalContribConfiguration).filter(([, property]) => property.managedSettingsPresentation)) };
	suiteSetup(() => registry.registerConfiguration(configurationNode));
	suiteTeardown(() => registry.deregisterConfigurations([configurationNode]));

	for (const key of [AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, AgentSandboxSettingId.AgentSandboxAllowNetwork, AgentSandboxSettingId.AgentSandboxAllowLocalNetwork, AgentSandboxSettingId.AgentSandboxAllowDevToolAccess, AgentSandboxSettingId.AgentSandboxMcpServers, AgentSandboxSettingId.AgentSandboxLspServers]) {
		test(`renders managed state and unlocks ${key} after policy removal`, () => {
			const isEnabled = key === AgentSandboxSettingId.AgentSandboxEnabled;
			const isServerSandbox = key === AgentSandboxSettingId.AgentSandboxMcpServers || key === AgentSandboxSettingId.AgentSandboxLspServers;
			const configuration = new class extends TestConfigurationService {
				isSettingAppliedForAllProfiles(): boolean { return false; }
			}({ [key]: isEnabled ? 'off' : !isServerSandbox, [APPLY_ALL_PROFILES_SETTING]: [] });
			store.add(configuration.onDidChangeConfigurationEmitter);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
			let required = true;
			let allowBypass: boolean | undefined = false;
			let allowOutbound: boolean | undefined = false;
			let sandboxServers: boolean | undefined = true;
			instantiationService.stub(IManagedSettingsService, new class extends mock<IManagedSettingsService>() {
				override readonly onDidChangeManagedSettings = Event.None;
				override getManagedSettingValue(key: string) {
					if (key === COPILOT_SANDBOX_MCP_SERVERS_KEY || key === COPILOT_SANDBOX_LSP_SERVERS_KEY) {
						return sandboxServers;
					}
					if (key === COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY || key === COPILOT_SANDBOX_ALLOW_LOCAL_NETWORK_KEY || key === COPILOT_SANDBOX_ALLOW_DEV_TOOL_ACCESS_KEY) {
						return allowOutbound;
					}
					return key === COPILOT_SANDBOX_ALLOW_BYPASS_KEY ? allowBypass : key === COPILOT_SANDBOX_ENABLED_KEY && required ? true : undefined;
				}
			}());
			instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
			instantiationService.stub(IManagedSettingsPresentationService, store.add(instantiationService.createInstance(ManagedSettingsPresentationService)));
			instantiationService.stub(IUserDataSyncEnablementService, { isEnabled: () => false });
			const model = store.add(instantiationService.createInstance(SettingsTreeModel, { settingsTarget: ConfigurationTarget.USER_LOCAL }, true));
			model.update({
				id: 'test', label: 'Test',
				settings: [new class extends mock<ISetting>() {
					override key = key;
					override type = isEnabled ? 'string' : 'boolean';
					override enum = isEnabled ? ['off', 'on'] : undefined;
					override description = ['Sandbox setting'];
					override scope = ConfigurationScope.RESOURCE;
				}()],
			});
			const element = model.getElementsByName(key)![0];
			const renderers = store.add(instantiationService.createInstance(SettingTreeRenderers));
			const renderer = renderers.allRenderers.find(renderer => renderer.templateId === (isEnabled ? 'settings.enum.template' : 'settings.bool.template'))!;
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			store.add(toDisposable(() => renderer.disposeTemplate(template)));
			const node = new class extends mock<ITreeNode<SettingsTreeElement, never>>() { override element = element; }();
			const render = () => {
				renderer.renderElement(node, 0, template);
				return {
					disabled: isEnabled ? container.querySelector('select')!.disabled : container.querySelector('[role="checkbox"]')!.getAttribute('aria-disabled') === 'true',
					value: isEnabled ? container.querySelector('select')!.selectedOptions[0].text : container.querySelector('[role="checkbox"]')!.getAttribute('aria-checked') === 'true',
					indicator: container.textContent?.includes('Managed by organization'),
				};
			};
			const managed = render();
			allowBypass = true;
			allowOutbound = true;
			sandboxServers = false;
			const bypassAllowed = render();
			required = false;
			allowBypass = undefined;
			allowOutbound = undefined;
			sandboxServers = undefined;
			assert.deepStrictEqual({ managed, bypassAllowed, removed: render() }, {
				managed: { disabled: true, value: isEnabled ? 'on' : isServerSandbox, indicator: true },
				bypassAllowed: { disabled: isEnabled, value: isEnabled ? 'on' : !isServerSandbox, indicator: isEnabled },
				removed: { disabled: false, value: isEnabled ? 'off' : !isServerSandbox, indicator: false },
			});
		});
	}

	test('disposes the setting toolbar with its template', () => {
		const renderer = new TestSettingRenderer();
		const template = renderer.renderTemplate(document.createElement('div'));

		assert.strictEqual(renderer.toolbarDisposed, false);
		renderer.disposeTemplate(template);
		assert.strictEqual(renderer.toolbarDisposed, true);

		renderer.dispose();
	});

	test('renders informational deprecation severity', () => {
		const renderer = new TestSettingRenderer();
		const template = renderer.renderTemplate(document.createElement('div'));
		const element = createSettingElement('info');

		renderer.renderElement({ element } as never, 0, template);

		const icon = template.deprecationWarningElement.firstElementChild;
		assert.deepStrictEqual({
			isDeprecated: template.containerElement.classList.contains('is-deprecated'),
			isDeprecatedInfo: template.containerElement.classList.contains('is-deprecated-info'),
			iconClasses: icon?.className,
			iconRole: icon?.getAttribute('role'),
			iconAriaLabel: icon?.getAttribute('aria-label'),
		}, {
			isDeprecated: true,
			isDeprecatedInfo: true,
			iconClasses: 'codicon codicon-info',
			iconRole: 'img',
			iconAriaLabel: 'Info',
		});

		renderer.disposeTemplate(template);
		element.parent?.dispose();
		element.dispose();
		renderer.dispose();
	});
});
