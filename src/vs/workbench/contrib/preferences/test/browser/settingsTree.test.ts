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
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, COPILOT_SANDBOX_ENABLED_KEY, IManagedSettingsService, NullManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { ISetting } from '../../../../services/preferences/common/preferences.js';
import { SettingsTarget } from '../../browser/preferencesWidgets.js';
import { AbstractSettingRenderer, ISettingChangeEvent, SettingTreeRenderers } from '../../browser/settingsTree.js';
import { SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';
import { ExperimentalSettingsService, IExperimentalSettingsService } from '../../../../services/configuration/common/experimentalSettings.js';
import { APPLY_ALL_PROFILES_SETTING } from '../../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestContextMenuService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

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
		new NullManagedSettingsService(),
	);
	element.inspectSelf = () => { };
	return element;
}

suite('SettingsTree renderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('array overrides', () => {
		function renderArray(settingsTarget: SettingsTarget, defaultValue: string[], inherited = false) {
			const key = 'terminal.integrated.commandsToSkipShell';
			const userValue = [...defaultValue, '-workbench.action.quickOpen'];
			const defaults = new TestConfigurationService({ [key]: defaultValue });
			const scoped = new TestConfigurationService(inherited ? {} : { [key]: userValue });
			const configuration = new class extends TestConfigurationService {
				isSettingAppliedForAllProfiles(): boolean { return false; }
				override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
					const inspected = super.inspect<T>(key, overrides);
					const defaultValue = defaults.getValue<T>(key);
					const scopedValue = scoped.getValue<T>(key);
					return {
						...inspected,
						defaultValue,
						workspaceValue: settingsTarget === ConfigurationTarget.WORKSPACE ? scopedValue : undefined,
						workspaceFolderValue: URI.isUri(settingsTarget) ? scopedValue : undefined,
						value: scopedValue ?? inspected.userValue ?? defaultValue,
					};
				}
			}({ [key]: userValue, [APPLY_ALL_PROFILES_SETTING]: [] });
			for (const service of [defaults, scoped, configuration]) {
				store.add(service.onDidChangeConfigurationEmitter);
			}
			const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
			instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: true });
			instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
			instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
			instantiationService.stub(IUserDataSyncEnablementService, { isEnabled: () => false });
			const contextMenuService = new class extends TestContextMenuService {
				delegate: Parameters<IContextMenuService['showContextMenu']>[0] | undefined;
				override showContextMenu(delegate: Parameters<IContextMenuService['showContextMenu']>[0]): void {
					this.delegate = delegate;
				}
			}();
			instantiationService.stub(IContextMenuService, contextMenuService);
			const model = store.add(instantiationService.createInstance(SettingsTreeModel, { settingsTarget }, true));
			model.update({
				id: 'test', label: 'Test',
				settings: [new class extends mock<ISetting>() {
					override key = key;
					override type = 'array';
					override arrayItemType = 'string';
					override description = [];
					override scope = ConfigurationScope.RESOURCE;
				}()],
			});
			const element = model.getElementsByName(key)![0];
			const renderers = store.add(instantiationService.createInstance(SettingTreeRenderers));
			const renderer = renderers.allRenderers.find(renderer => renderer.templateId === 'settings.array.template')!;
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			store.add(toDisposable(() => renderer.disposeTemplate(template)));
			const node = new class extends mock<ITreeNode<SettingsTreeElement, never>>() { override element = element; }();
			const render = () => renderer.renderElement(node, 0, template);
			render();
			const changes: Pick<ISettingChangeEvent, 'value' | 'manualReset'>[] = [];
			store.add(renderers.onDidChangeSetting(({ value, manualReset }) => changes.push({ value, manualReset })));
			const removeLastItem = () => {
				const remove = Array.from(container.querySelectorAll<HTMLElement>('[aria-label="Remove Item"]')).at(-1);
				assert.ok(remove, 'The inherited array item must be removable');
				remove.click();
			};
			const reset = async () => {
				renderers.showContextMenu(element, container);
				const action = contextMenuService.delegate?.getActions?.().find(action => action.id === 'settings.resetSetting');
				assert.ok(action);
				await action.run(element);
			};
			return { changes, removeLastItem, reset, render, scoped, key, element, userValue };
		}

		for (const defaultValue of [[], ['default-command']]) {
			test(`preserves the explicit ${defaultValue.length ? 'nonempty' : 'empty'} default array when clearing an inherited Agents value`, async () => {
				const { changes, removeLastItem, render, scoped, key, element } = renderArray(ConfigurationTarget.WORKSPACE, defaultValue, true);
				removeLastItem();
				await scoped.setUserConfiguration(key, changes[0].value);
				render();

				assert.deepStrictEqual({
					changes,
					displayed: element.value,
					configured: element.isConfigured,
				}, {
					changes: [{ value: defaultValue, manualReset: false }],
					displayed: defaultValue,
					configured: true,
				});
			});
		}

		for (const { name, target, expected } of [
			{ name: 'Workspace', target: ConfigurationTarget.WORKSPACE, expected: [] },
			{ name: 'Folder', target: URI.file('/workspace'), expected: [] },
			{ name: 'User', target: ConfigurationTarget.USER_LOCAL, expected: undefined },
		] as const) {
			test(`clearing a configured array respects the ${name} target`, () => {
				const { changes, removeLastItem } = renderArray(target, []);
				removeLastItem();
				assert.deepStrictEqual(changes, [{ value: expected, manualReset: false }]);
			});
		}

		test('Reset Setting still removes the Agents array override and restores inheritance', async () => {
			const { changes, reset, render, scoped, key, element, userValue } = renderArray(ConfigurationTarget.WORKSPACE, []);
			await reset();
			await scoped.setUserConfiguration(key, changes[0].value);
			render();

			assert.deepStrictEqual({
				changes,
				displayed: element.value,
				configured: element.isConfigured,
			}, {
				changes: [{ value: undefined, manualReset: true }],
				displayed: userValue,
				configured: false,
			});
		});
	});

	for (const key of [AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, AgentSandboxSettingId.AgentSandboxAllowNetwork]) {
		test(`renders managed state and unlocks ${key} after policy removal`, () => {
			const isEnabled = key === AgentSandboxSettingId.AgentSandboxEnabled || key === AgentSandboxSettingId.AgentSandboxWindowsEnabled;
			const configuration = new class extends TestConfigurationService {
				isSettingAppliedForAllProfiles(): boolean { return false; }
			}({ [key]: isEnabled ? 'off' : true, [APPLY_ALL_PROFILES_SETTING]: [] });
			store.add(configuration.onDidChangeConfigurationEmitter);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
			let required = true;
			let allowBypass: boolean | undefined = false;
			let allowOutbound: boolean | undefined = false;
			instantiationService.stub(IManagedSettingsService, new class extends mock<IManagedSettingsService>() {
				override readonly onDidChangeManagedSettings = Event.None;
				override getManagedSettingValue(key: string) {
					if (key === COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY) {
						return allowOutbound;
					}
					return key === COPILOT_SANDBOX_ALLOW_BYPASS_KEY ? allowBypass : key === COPILOT_SANDBOX_ENABLED_KEY && required ? true : undefined;
				}
			}());
			instantiationService.stub(IExperimentalSettingsService, store.add(new ExperimentalSettingsService()));
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
			const bypassAllowed = render();
			required = false;
			allowBypass = undefined;
			allowOutbound = undefined;
			assert.deepStrictEqual({ managed, bypassAllowed, removed: render() }, {
				managed: { disabled: true, value: isEnabled ? 'on' : false, indicator: true },
				bypassAllowed: { disabled: isEnabled, value: isEnabled ? 'on' : true, indicator: isEnabled },
				removed: { disabled: false, value: isEnabled ? 'off' : true, indicator: false },
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
