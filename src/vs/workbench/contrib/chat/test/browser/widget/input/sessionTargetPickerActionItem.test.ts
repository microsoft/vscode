/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableFromEvent } from '../../../../../../../base/common/observable.js';
import { ManagedSettingsData } from '../../../../../../../base/common/policy.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ActionListItemKind, ActionListWidget, IActionListDelegate, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { COPILOT_SANDBOX_ENABLED_KEY, COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, COPILOT_TEMPORARY_DEFAULT_TO_LOCAL_HARNESS_KEY, IManagedSettingsService, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IAgentSdkSetupService } from '../../../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ICodexAccountService } from '../../../../../../services/agentHost/browser/codexAccountService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { AgentSessionProviders, AgentSessionTarget, getAgentSessionProviderDescription } from '../../../../browser/agentSessions/agentSessions.js';
import { SessionTypeAvailability } from '../../../../browser/agentSessions/sessionTypeAvailability.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';
import { IChatHarnessSwitchFeedbackSurveyService } from '../../../../browser/feedbackSurvey/chatHarnessSwitchFeedbackSurveyService.js';
import { createSessionTypePickerAction, getConfiguredSessionTypePickerAvailability, ISessionTypeItem, SessionTypePickerActionItem } from '../../../../browser/widget/input/sessionTargetPickerActionItem.js';
import { ChatConfiguration, CopilotHarnessIntroductionMode } from '../../../../common/constants.js';

const baseAction: IAction = {
	id: 'base',
	label: 'Base',
	tooltip: '',
	class: undefined,
	enabled: true,
	run: async () => { },
};

function createCodexItem(type: AgentSessionProviders.Codex | AgentSessionProviders.AgentHostCodex): ISessionTypeItem {
	return {
		type,
		label: 'Codex',
		hoverDescription: getAgentSessionProviderDescription(type),
		commandId: `open.${type}`,
	};
}

function getMarkdownValue(value: string | IMarkdownString | HTMLElement | (() => HTMLElement) | undefined): string | undefined {
	const resolved = typeof value === 'function' ? value() : value;
	return typeof resolved === 'string' ? resolved : resolved instanceof HTMLElement ? resolved.textContent ?? undefined : resolved?.value;
}

interface IAvailabilityInputs {
	readonly type: string;
	readonly allowSignedOutWhenUsable: boolean;
	/** Whether the harness is gated on a Copilot account. */
	readonly requiresCopilotSignIn: boolean;
	readonly entitlement?: ChatEntitlement;
	/** Agents that advertise a demand-driven SDK setup path. */
	readonly setupAgents?: readonly string[];
	readonly codexAccountStatus?: ICodexAccountService['account']['status'];
}

/** Availability for a harness that needs its own models and has none. */
function getAvailability({ type, allowSignedOutWhenUsable, requiresCopilotSignIn, entitlement = ChatEntitlement.Unknown, setupAgents = [], codexAccountStatus = 'unknown' }: IAvailabilityInputs): SessionTypeAvailability {
	const chatSessionsService = new class extends mock<IChatSessionsService>() {
		override getChatSessionContribution(candidate: string): ResolvedChatSessionsExtensionPoint | undefined {
			return candidate === type
				? { type, name: type, displayName: type, description: '', icon: undefined }
				: undefined;
		}
		override requiresCopilotSignInForSessionType(): boolean {
			return requiresCopilotSignIn;
		}
		override supportsAutoModelForSessionType(): boolean {
			return false;
		}
		override requiresCustomModelsForSessionType(): boolean {
			return true;
		}
	}();
	const entitlementService = new class extends mock<IChatEntitlementService>() {
		override get entitlement(): ChatEntitlement {
			return entitlement;
		}
		override get anonymous(): boolean {
			return false;
		}
		override get clientByokEnabled(): boolean {
			return false;
		}
	}();
	const languageModelsService = new class extends mock<ILanguageModelsService>() {
		override getLanguageModelIds(): string[] {
			return [];
		}
	}();
	const agentSdkSetupService = new class extends mock<IAgentSdkSetupService>() {
		override readonly setups = setupAgents.map(agent => ({ agent, download: 'ready' as const }));
	}();
	const codexAccountService = new class extends mock<ICodexAccountService>() {
		override readonly account = { status: codexAccountStatus };
	}();

	return getConfiguredSessionTypePickerAvailability(
		type,
		new TestConfigurationService({ [AgentHostAllowSignedOutWhenUsableSettingId]: allowSignedOutWhenUsable }),
		chatSessionsService,
		entitlementService,
		languageModelsService,
		agentSdkSetupService,
		codexAccountService,
		new NullManagedSettingsService(),
	);
}

function getCopilotAvailability(allowSignedOutWhenUsable: boolean): SessionTypeAvailability {
	return getAvailability({ type: SessionType.AgentHostCopilot, allowSignedOutWhenUsable, requiresCopilotSignIn: true });
}

suite('SessionTypePickerActionItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const activation of ['mouse', 'keyboard'] as const) {
		test(`opens inline policy help with ${activation} without selecting Local or closing the picker`, () => {
			const instantiation = store.add(new TestInstantiationService());
			const opened: string[] = [];
			instantiation.stub(IKeybindingService, new MockKeybindingService());
			instantiation.stub(IHoverService, NullHoverService);
			instantiation.stub(IOpenerService, {
				open: async resource => { opened.push(resource.toString()); return true; },
			});
			let selections = 0;
			let hides = 0;
			const action = createSessionTypePickerAction(
				baseAction,
				{ type: AgentSessionProviders.Local, label: 'Local', hoverDescription: '', commandId: 'open.local' },
				AgentSessionProviders.AgentHostCopilot, SessionTypeAvailability.DisabledByPolicy, true,
				{ label: 'Agent Types', order: 1 }, undefined, Codicon.vm, () => { selections++; },
			);
			const widget = store.add(instantiation.createInstance(
				ActionListWidget<IActionWidgetDropdownAction>, 'policyHelpTest', false,
				[{
					kind: ActionListItemKind.Action, item: action, label: action.label,
					disabled: !action.enabled, description: action.description, ariaDescription: action.ariaDescription,
				}],
				{ onHide: () => { hides++; }, onSelect: () => { selections++; } },
				undefined, undefined,
			));
			document.body.appendChild(widget.domNode);
			store.add(toDisposable(() => widget.domNode.remove()));
			widget.layout(24, 400);
			const link = widget.domNode.querySelector<HTMLAnchorElement>('.description a');
			assert.ok(link);
			link.focus();
			if (activation === 'mouse') {
				link.click();
			} else {
				link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			}
			assert.deepStrictEqual({
				opened, selections, hides, text: link.textContent,
				tabIndex: link.tabIndex, focused: document.activeElement === link,
				disabled: widget.domNode.querySelector('.monaco-list-row')?.classList.contains('option-disabled'),
			}, {
				opened: ['https://aka.ms/vscode-copilot-harness-policy'], selections: 0, hides: 0,
				text: 'Learn why', tabIndex: 0, focused: true, disabled: true,
			});
		});
	}

	function createManagedPicker(position: 'sidebar' | 'editor', hostAvailable = true, localEnabled = true) {
		const instantiation = store.add(new TestInstantiationService());
		const changed = store.add(new Emitter<void>());
		let settings: ManagedSettingsData = {};
		const managedSettings = new class extends NullManagedSettingsService {
			override readonly onDidChangeManagedSettings = changed.event;
			override getManagedSettings() { return settings; }
			override getManagedSettingValue(key: string) { return settings[key]; }
		}();
		const configuration = new TestConfigurationService({ [ChatConfiguration.EditorLocalAgentEnabled]: localEnabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IContextKeyService, store.add(new ContextKeyService(configuration)));
		instantiation.stub(IManagedSettingsService, managedSettings);
		instantiation.stub(IAgentHostEnablementService, {
			enabled: constObservable(hostAvailable),
			managedSandboxEnforced: observableFromEvent(changed.event, () => settings[COPILOT_SANDBOX_ENABLED_KEY] === true),
			managedSandboxAllowsBypass: constObservable(false),
		});
		const sessions = new class extends mock<IChatSessionsService>() {
			override readonly onDidChangeAvailability = Event.None;
			override getAllChatSessionContributions(): ResolvedChatSessionsExtensionPoint[] {
				return [{ type: SessionType.AgentHostCopilot, name: 'Copilot', displayName: 'Copilot', description: '', icon: Codicon.copilot }];
			}
			override getChatSessionContribution(type: string) { return this.getAllChatSessionContributions().find(contribution => contribution.type === type); }
			override requiresCopilotSignInForSessionType() { return false; }
			override supportsAutoModelForSessionType() { return true; }
		}();
		instantiation.stub(IChatSessionsService, sessions);
		let local: Pick<IActionListItem<never>, 'label' | 'disabled' | 'description' | 'ariaDescription' | 'hover'> | undefined;
		let selectLocal: () => void = () => assert.fail('Picker has not opened');
		instantiation.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				const item = items.find(item => item.label === 'Local');
				local = item;
				selectLocal = () => {
					assert.ok(item?.item);
					delegate.onSelect(item.item);
				};
			}
			override hide(): void { }
		}());
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async id => { commands.push(id); return undefined; } });
		instantiation.stub(IKeybindingService, new MockKeybindingService());
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() { }());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiation.stub(IWorkspaceContextService, new TestContextService());
		instantiation.stub(IChatEntitlementService, new TestChatEntitlementService());
		instantiation.stub(ILanguageModelsService, { getLanguageModelIds: () => [] });
		instantiation.stub(IAgentSdkSetupService, { setups: [] });
		instantiation.stub(ICodexAccountService, { account: { status: 'unknown' } });
		instantiation.stub(IChatHarnessSwitchFeedbackSurveyService, { prompt: () => { } });
		const action = instantiation.createInstance(MenuItemAction, { id: 'test.harnessPicker', title: 'Harness' }, undefined, undefined, undefined, undefined);
		const picker = store.add(instantiation.createInstance(SessionTypePickerActionItem, action, position, {
			getActiveSessionProvider: () => AgentSessionProviders.AgentHostCopilot,
		}, { compact: constObservable(false) }, URI.parse('vscode-chat-input://policy-test')));
		const container = dom.append(document.body, dom.$('.action-item'));
		store.add(toDisposable(() => container.remove()));
		picker.render(container);
		return {
			picker, configuration, commands,
			getLocal: () => local,
			selectLocal: () => selectLocal(),
			setManagedSettings: (values: ManagedSettingsData) => { settings = values; changed.fire(); },
		};
	}

	for (const position of ['sidebar', 'editor'] as const) {
		for (const hostAvailable of [false, true]) {
			test(`keeps policy-disabled Local visible and non-selectable in ${position} (host=${hostAvailable})`, () => {
				const fixture = createManagedPicker(position, hostAvailable);
				const snapshots = [];
				const policies: ManagedSettingsData[] = [
					{ 'permissions.deny': '["Shell"]' },
					{ 'permissions.deny': '["Read"]', 'permissions.defaultMode': 'manual' },
					{ 'permissions.deny': 'invalid' },
					{ [COPILOT_SANDBOX_ENABLED_KEY]: true },
					{ [COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY]: false },
					{ [COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY]: false, [COPILOT_TEMPORARY_DEFAULT_TO_LOCAL_HARNESS_KEY]: true },
				];
				for (const settings of policies) {
					fixture.setManagedSettings(settings);
					fixture.picker.show();
					const local = fixture.getLocal();
					fixture.selectLocal();
					snapshots.push({
						label: local?.label, disabled: local?.disabled,
						description: getMarkdownValue(local?.description),
						hover: getMarkdownValue(local?.hover?.content),
						ariaDescription: local?.ariaDescription,
					});
				}
				fixture.setManagedSettings({});
				fixture.picker.show();
				fixture.selectLocal();
				assert.deepStrictEqual({ snapshots, removed: fixture.getLocal()?.disabled, commands: fixture.commands }, {
					snapshots: Array.from({ length: 6 }, () => ({
						label: 'Local', disabled: true, description: '$(briefcase) Disabled by policy · [Learn why](https://aka.ms/vscode-copilot-harness-policy)',
						hover: 'Your organization\'s managed settings require the Copilot harness. [Learn why Local is disabled](https://aka.ms/vscode-copilot-harness-policy).',
						ariaDescription: 'Disabled by policy · Learn why. Your organization\'s managed settings require the Copilot harness. Learn why Local is disabled.',
					})),
					removed: false, commands: ['workbench.action.chat.openNewChatSessionInPlace.local'],
				});
			});
		}
	}

	test('blocks a previously enabled picker action when policy arrives while it is open', () => {
		const fixture = createManagedPicker('editor');
		fixture.picker.show();
		fixture.setManagedSettings({ 'permissions.deny': '["Shell"]' });
		fixture.selectLocal();
		assert.deepStrictEqual(fixture.commands, []);
	});

	test('preserves personal Local visibility settings and the managed default-to-Local escape hatch', async () => {
		const fixture = createManagedPicker('sidebar', true, false);
		fixture.picker.show();
		const hidden = fixture.getLocal() === undefined;
		fixture.setManagedSettings({ 'permissions.deny': '["Shell"]' });
		fixture.picker.show();
		const disabled = fixture.getLocal()?.disabled;
		fixture.setManagedSettings({});
		fixture.picker.show();
		const hiddenAgain = fixture.getLocal() === undefined;
		await fixture.configuration.setUserConfiguration(ChatConfiguration.EditorLocalAgentEnabled, true);
		fixture.setManagedSettings({ 'permissions.deny': '["Shell"]', [COPILOT_TEMPORARY_DEFAULT_TO_LOCAL_HARNESS_KEY]: true });
		fixture.picker.show();
		assert.deepStrictEqual({ hidden, disabled, hiddenAgain, escaped: fixture.getLocal()?.disabled }, { hidden: true, disabled: true, hiddenAgain: true, escaped: false });
	});

	test('empty deny and other managed permission or sandbox settings keep Local selectable', () => {
		const fixture = createManagedPicker('editor');
		const policies: ManagedSettingsData[] = [
			{ 'permissions.deny': '[]' },
			{ 'permissions.ask': '["Shell"]' },
			{ 'permissions.allow': '["Shell"]' },
			{ 'permissions.defaultMode': 'manual', 'permissions.disableBypassPermissionsMode': 'disable' },
			{ 'sandbox.enabled': false, 'sandbox.allowBypass': false, 'sandbox.sandboxMcpServers': true },
		];
		const disabled = policies.map(settings => {
			fixture.setManagedSettings({ 'permissions.deny': '["Shell"]' });
			fixture.setManagedSettings(settings);
			fixture.picker.show();
			fixture.selectLocal();
			return fixture.getLocal()?.disabled;
		});
		assert.deepStrictEqual({ disabled, commands: fixture.commands }, {
			disabled: policies.map(() => false),
			commands: policies.map(() => 'workbench.action.chat.openNewChatSessionInPlace.local'),
		});
	});

	test('keeps Cloud as a harness choice without nested creation controls', async () => {
		let selected = false;
		const item: ISessionTypeItem = {
			type: AgentSessionProviders.Cloud, label: 'Cloud', hoverDescription: '', commandId: 'open.cloud',
		};
		const action = createSessionTypePickerAction(
			baseAction, item, AgentSessionProviders.Cloud, SessionTypeAvailability.Available, true,
			{ label: 'Agent Types', order: 1 }, undefined, Codicon.cloud, () => { selected = true; },
		);
		await action.run();
		assert.deepStrictEqual({
			label: action.label,
			selected,
			inlineToggle: action.inlineToggle,
			standaloneToggle: action.standaloneToggle,
		}, {
			label: 'Cloud', selected: true, inlineToggle: undefined, standaloneToggle: undefined,
		});
	});

	test('applies signed-out Agent Host availability in editor chat', () => {
		assert.deepStrictEqual({
			enabled: getCopilotAvailability(true),
			disabled: getCopilotAvailability(false),
		}, {
			enabled: SessionTypeAvailability.Available,
			disabled: SessionTypeAvailability.SignInRequired,
		});
	});

	test('a harness whose agent advertises setup stays selectable, so demand-driven discovery can start', () => {
		const claude = (setupAgents: readonly string[]) => getAvailability({
			type: SessionType.AgentHostClaude,
			allowSignedOutWhenUsable: true,
			requiresCopilotSignIn: false,
			setupAgents,
		});

		assert.deepStrictEqual({
			withSetup: claude(['claude']),
			withoutSetup: claude([]),
		}, {
			withSetup: SessionTypeAvailability.Available,
			withoutSetup: SessionTypeAvailability.NoModels,
		});
	});

	test('another agent\'s setup does not unlock this harness', () => {
		assert.strictEqual(getAvailability({
			type: SessionType.AgentHostCodex,
			allowSignedOutWhenUsable: true,
			requiresCopilotSignIn: false,
			setupAgents: ['claude'],
		}), SessionTypeAvailability.NoModels);
	});

	test('a Copilot Free account can initialize Codex without enabling signed-out use', () => {
		assert.strictEqual(getAvailability({
			type: SessionType.AgentHostCodex,
			allowSignedOutWhenUsable: false,
			requiresCopilotSignIn: false,
			entitlement: ChatEntitlement.Free,
			setupAgents: ['codex'],
		}), SessionTypeAvailability.Available);
	});

	test('a ChatGPT account can initialize Codex without GitHub or the signed-out experiment', () => {
		assert.strictEqual(getAvailability({
			type: SessionType.AgentHostCodex,
			allowSignedOutWhenUsable: false,
			requiresCopilotSignIn: true,
			setupAgents: ['codex'],
			codexAccountStatus: 'signedIn',
		}), SessionTypeAvailability.Available);
	});

	test('an unknown Codex account can reach selection-time discovery without GitHub or the signed-out experiment', () => {
		const availability = (codexAccountStatus: ICodexAccountService['account']['status'], setupAgents = ['codex']) => getAvailability({
			type: SessionType.AgentHostCodex,
			allowSignedOutWhenUsable: false,
			requiresCopilotSignIn: true,
			setupAgents,
			codexAccountStatus,
		});

		assert.deepStrictEqual({
			beforeDiscovery: availability('unknown'),
			afterChatGPTDiscovery: availability('signedIn'),
			afterSignedOutDiscovery: availability('signedOut'),
			withoutSetup: availability('unknown', []),
		}, {
			beforeDiscovery: SessionTypeAvailability.Available,
			afterChatGPTDiscovery: SessionTypeAvailability.Available,
			afterSignedOutDiscovery: SessionTypeAvailability.SignInRequired,
			withoutSetup: SessionTypeAvailability.SignInRequired,
		});
	});

	test('a fully signed-out user still needs the signed-out experiment', () => {
		assert.strictEqual(getAvailability({
			type: SessionType.AgentHostCodex,
			allowSignedOutWhenUsable: false,
			requiresCopilotSignIn: true,
			setupAgents: ['codex'],
			codexAccountStatus: 'signedOut',
		}), SessionTypeAvailability.SignInRequired);
	});

	test('creates an available Codex extension action with hover context', () => {
		const item = createCodexItem(AgentSessionProviders.Codex);
		const action = createSessionTypePickerAction(
			baseAction,
			item,
			AgentSessionProviders.Codex,
			SessionTypeAvailability.Available,
			true,
			{ label: 'Other', order: 2 },
			undefined,
			Codicon.openai,
			() => { },
		);

		assert.deepStrictEqual({
			label: action.label,
			checked: action.checked,
			enabled: action.enabled,
			description: getMarkdownValue(action.description),
			ariaDescription: action.ariaDescription,
			hover: getMarkdownValue(action.hover?.content),
		}, {
			label: 'Codex',
			checked: true,
			enabled: true,
			description: undefined,
			ariaDescription: 'Open a new Codex session using the Codex extension from OpenAI. Codex sessions can be managed from the chat sessions view.',
			hover: 'Open a new Codex session using the Codex extension from OpenAI. Codex sessions can be managed from the chat sessions view.',
		});
	});

	test('reports categorized switches away from the Copilot harness', () => {
		const events: { readonly name: string; readonly data: unknown }[] = [];
		let selected: AgentSessionTarget = AgentSessionProviders.AgentHostCopilot;
		const run = Reflect.get(SessionTypePickerActionItem.prototype, '_run') as (this: {
			_getSelectedSessionType(): AgentSessionTarget;
			_getDefaultSessionType(): AgentSessionTarget;
			_reportCopilotHarnessTargetChanged(target: AgentSessionTarget): void;
			_promptForCopilotToLocalSwitch(previousTarget: AgentSessionTarget, target: AgentSessionTarget): void;
			readonly chatSessionsService: IChatSessionsService;
			readonly configurationService: IConfigurationService;
			readonly telemetryService: Pick<ITelemetryService, 'publicLog2'>;
			readonly chatSessionPosition: 'sidebar' | 'editor';
			readonly _isSessionsWindow: boolean;
			readonly delegate: { getSessionResource(): URI; setActiveSessionProvider(provider: AgentSessionTarget): void };
			readonly element: undefined;
		}, item: ISessionTypeItem) => void;
		const harness = {
			_getSelectedSessionType: () => selected,
			_getDefaultSessionType: () => AgentSessionProviders.AgentHostCopilot,
			_reportCopilotHarnessTargetChanged: Reflect.get(SessionTypePickerActionItem.prototype, '_reportCopilotHarnessTargetChanged'),
			_promptForCopilotToLocalSwitch: Reflect.get(SessionTypePickerActionItem.prototype, '_promptForCopilotToLocalSwitch'),
			chatSessionsService: new class extends mock<IChatSessionsService>() {
				override getChatSessionContribution(): undefined {
					return undefined;
				}
			}(),
			configurationService: new TestConfigurationService({
				'chat.copilotHarnessIntroduction.mode': CopilotHarnessIntroductionMode.AfterRequest,
			}),
			telemetryService: {
				publicLog2: (name?: string, data?: unknown) => {
					if (name) {
						events.push({ name, data });
					}
				},
			},
			chatSessionPosition: 'sidebar' as const,
			_isSessionsWindow: true,
			delegate: {
				getSessionResource: () => URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' }),
				setActiveSessionProvider: (provider: AgentSessionTarget) => { selected = provider; },
			},
			element: undefined,
		};

		run.call(harness, {
			type: AgentSessionProviders.AgentHostClaude,
			label: 'Claude',
			hoverDescription: '',
			commandId: 'open.claude',
		});
		run.call(harness, createCodexItem(AgentSessionProviders.AgentHostCodex));

		assert.deepStrictEqual({ selected, events }, {
			selected: AgentSessionProviders.AgentHostCodex,
			events: [{
				name: 'copilotHarnessTargetChanged',
				data: {
					mode: CopilotHarnessIntroductionMode.AfterRequest,
					fromHarness: 'copilot',
					toHarness: 'claude',
					surface: 'sidebar',
					chatSessionId: 'agent-host-copilotcli:/untitled-draft',
					sessionType: SessionType.AgentHostCopilot,
					harness: undefined,
				},
			}],
		});
	});

	test('prompts for feedback when switching from Copilot to Local', () => {
		const prompts: { readonly inputUri: string; readonly context: unknown }[] = [];
		const inputUri = URI.parse('vscode-chat-input://input-1');
		const prompt = Reflect.get(SessionTypePickerActionItem.prototype, '_promptForCopilotToLocalSwitch') as (this: {
			readonly chatSessionsService: IChatSessionsService;
			readonly configurationService: IConfigurationService;
			readonly harnessSwitchFeedbackSurveyService: { prompt(inputUri: URI, context: unknown): void };
			readonly inputUri: URI;
			readonly chatSessionPosition: 'sidebar' | 'editor';
			readonly delegate: { getSessionResource(): URI };
		}, previousTarget: AgentSessionTarget, target: AgentSessionTarget) => void;

		prompt.call({
			chatSessionsService: new class extends mock<IChatSessionsService>() {
				override getChatSessionContribution(): undefined {
					return undefined;
				}
			}(),
			configurationService: new TestConfigurationService({
				'chat.copilotHarnessIntroduction.mode': CopilotHarnessIntroductionMode.AfterRequest,
			}),
			harnessSwitchFeedbackSurveyService: {
				prompt: (surveyInputUri, context) => prompts.push({ inputUri: surveyInputUri.toString(), context }),
			},
			inputUri,
			chatSessionPosition: 'editor',
			delegate: {
				getSessionResource: () => URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' }),
			},
		}, AgentSessionProviders.AgentHostCopilot, AgentSessionProviders.Local);

		assert.deepStrictEqual(prompts, [{
			inputUri: inputUri.toString(),
			context: {
				mode: CopilotHarnessIntroductionMode.AfterRequest,
				surface: 'editor',
				chatSessionId: 'agent-host-copilotcli:/untitled-draft',
				sessionType: SessionType.AgentHostCopilot,
				harness: undefined,
			},
		}]);
	});

	test('creates plain accessible text for an unavailable Codex action', () => {
		const item = createCodexItem(AgentSessionProviders.AgentHostCodex);
		const action = createSessionTypePickerAction(
			baseAction,
			item,
			AgentSessionProviders.Codex,
			SessionTypeAvailability.SignInRequired,
			true,
			{ label: 'Other', order: 2 },
			undefined,
			Codicon.openai,
			() => { },
		);

		assert.deepStrictEqual({
			label: action.label,
			checked: action.checked,
			enabled: action.enabled,
			description: getMarkdownValue(action.description),
			ariaDescription: action.ariaDescription,
			hover: getMarkdownValue(action.hover?.content),
		}, {
			label: 'Codex',
			checked: false,
			enabled: false,
			description: '[Sign in](command:workbench.action.chat.triggerSetup)',
			ariaDescription: 'Sign in. Sign in to GitHub Copilot to use this agent.',
			hover: '[Sign in to GitHub Copilot](command:workbench.action.chat.triggerSetup) to use this agent.',
		});
	});
});
