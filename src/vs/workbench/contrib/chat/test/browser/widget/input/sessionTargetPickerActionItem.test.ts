/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { TerminalContribSettingId } from '../../../../../../../workbench/contrib/terminal/terminalContribExports.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { AgentSessionProviders, getAgentSessionProviderDescription } from '../../../../browser/agentSessions/agentSessions.js';
import { createAgentSdkSetupNotification } from '../../../../browser/agentSessions/agentHost/agentHostSdkSetupNotification.js';
import { SessionTypeAvailability } from '../../../../browser/agentSessions/sessionTypeAvailability.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../../browser/widget/input/chatInputNotificationService.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../common/constants.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';
import { IChatInputPickerOptions } from '../../../../browser/widget/input/chatInputPickerActionItem.js';
import { IExtensionPermissionState, IPermissionPickerDelegate, PermissionPickerActionItem } from '../../../../browser/widget/input/permissionPickerActionItem.js';
import { createSessionTypePickerAction, getConfiguredSessionTypePickerAvailability, ISessionTypeItem } from '../../../../browser/widget/input/sessionTargetPickerActionItem.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';

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

function getMarkdownValue(value: string | IMarkdownString | HTMLElement | undefined): string | undefined {
	return typeof value === 'string' ? value : value instanceof HTMLElement ? value.textContent ?? undefined : value?.value;
}

interface IAvailabilityInputs {
	readonly type: string;
	readonly allowSignedOutWhenUsable: boolean;
	/** Whether the harness is gated on a Copilot account. */
	readonly requiresCopilotSignIn: boolean;
	/** Notifications currently on offer, none dismissed. */
	readonly notifications?: readonly IChatInputNotification[];
}

/** Availability for a signed-out user whose harness needs its own models and has none. */
function getSignedOutAvailability({ type, allowSignedOutWhenUsable, requiresCopilotSignIn, notifications = [] }: IAvailabilityInputs): SessionTypeAvailability {
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
			return ChatEntitlement.Unknown;
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
	const notificationService = new class extends mock<IChatInputNotificationService>() {
		override getActiveNotification(filter?: (notification: IChatInputNotification) => boolean): IChatInputNotification | undefined {
			return notifications.find(notification => !filter || filter(notification));
		}
	}();

	return getConfiguredSessionTypePickerAvailability(
		type,
		new TestConfigurationService({ [AgentHostAllowSignedOutWhenUsableSettingId]: allowSignedOutWhenUsable }),
		chatSessionsService,
		entitlementService,
		languageModelsService,
		notificationService,
	);
}

function getCopilotAvailability(allowSignedOutWhenUsable: boolean): SessionTypeAvailability {
	return getSignedOutAvailability({ type: SessionType.AgentHostCopilot, allowSignedOutWhenUsable, requiresCopilotSignIn: true });
}

/** The real banner, so the test is bound to the ids and session scoping it actually publishes. */
function claudeSetupBanner(): readonly IChatInputNotification[] {
	const notification = createAgentSdkSetupNotification({ agent: 'claude', download: 'notDownloaded' }, 'Claude', 'downloadOffered');
	return notification ? [notification] : [];
}

suite('SessionTypePickerActionItem', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies signed-out Agent Host availability in editor chat', () => {
		assert.deepStrictEqual({
			enabled: getCopilotAvailability(true),
			disabled: getCopilotAvailability(false),
		}, {
			enabled: SessionTypeAvailability.Available,
			disabled: SessionTypeAvailability.SignInRequired,
		});
	});

	test('a harness whose SDK setup banner is on offer stays selectable, so the banner can be reached', () => {
		// The Claude harness no longer requires a Copilot account, so a signed-out
		// user with no Claude models lands on "No models available" — and the banner
		// telling them how to fix that only renders inside a Claude session.
		const claude = (notifications: readonly IChatInputNotification[]) => getSignedOutAvailability({
			type: SessionType.AgentHostClaude,
			allowSignedOutWhenUsable: true,
			requiresCopilotSignIn: false,
			notifications,
		});

		assert.deepStrictEqual({
			withBanner: claude(claudeSetupBanner()),
			withoutBanner: claude([]),
		}, {
			withBanner: SessionTypeAvailability.Available,
			withoutBanner: SessionTypeAvailability.NoModels,
		});
	});

	test('another agent\'s setup banner does not unlock this harness', () => {
		assert.strictEqual(getSignedOutAvailability({
			type: SessionType.AgentHostCodex,
			allowSignedOutWhenUsable: true,
			requiresCopilotSignIn: false,
			notifications: claudeSetupBanner(),
		}), SessionTypeAvailability.NoModels);
	});

	test('an unscoped notification does not unlock a harness that has nothing to offer', () => {
		// `getActiveNotification`'s session-type filter passes notifications with no
		// `sessionTypes` at all (a quota warning, say) — those must not read as setup.
		assert.strictEqual(getSignedOutAvailability({
			type: SessionType.AgentHostClaude,
			allowSignedOutWhenUsable: true,
			requiresCopilotSignIn: false,
			notifications: [{
				id: 'chat.quotaExceeded',
				severity: ChatInputNotificationSeverity.Warning,
				message: 'Out of quota',
				description: undefined,
				actions: [],
				dismissible: true,
				autoDismissOnMessage: false,
			}],
		}), SessionTypeAvailability.NoModels);
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

class RecordingPermissionActionWidgetService extends mock<IActionWidgetService>() {
	override isVisible = false;
	shownItems: readonly IActionListItem<IActionWidgetDropdownAction>[] = [];
	hideCalls = 0;

	override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], _delegate: IActionListDelegate<T>): void {
		this.shownItems = items as readonly IActionListItem<IActionWidgetDropdownAction>[];
		this.isVisible = true;
	}

	override updateItems<T>(_items: readonly IActionListItem<T>[], _focusItemId?: string): void { }
	override focusItemById(_itemId: string): void { }
	override hide(): void {
		this.hideCalls++;
		this.isVisible = false;
	}
}

class RecordingPreferencesService extends mock<IPreferencesService>() {
	openSettingsOptions: Parameters<IPreferencesService['openSettings']>[0] = undefined;

	override openSettings(options?: Parameters<IPreferencesService['openSettings']>[0]): ReturnType<IPreferencesService['openSettings']> {
		this.openSettingsOptions = options;
		return Promise.resolve(undefined);
	}
}

interface IPermissionPickerOptions {
	readonly extensionPermissions?: IExtensionPermissionState;
	readonly showSandboxToggle?: boolean;
}

suite('PermissionPickerActionItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function getActionItems(items: readonly IActionListItem<IActionWidgetDropdownAction>[]): readonly IActionListItem<IActionWidgetDropdownAction>[] {
		return items.filter(item => item.kind === ActionListItemKind.Action);
	}

	function createPicker(options: IPermissionPickerOptions = {}) {
		const actionWidgetService = new RecordingPermissionActionWidgetService();
		const preferencesService = new RecordingPreferencesService();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.PermissionsSandboxToggleEnabled]: options.showSandboxToggle === true,
		});
		const contextKeyService = new class extends mock<IContextKeyService>() { }();
		const keybindingService = new class extends mock<IKeybindingService>() {
			override appendKeybinding(label: string): string {
				return label;
			}
		}();
		const hoverService = new class extends mock<IHoverService>() {
			override setupDelayedHover(): IDisposable {
				return Disposable.None;
			}
		}();
		const delegate: IPermissionPickerDelegate = {
			currentPermissionLevel: observableValue('permissionLevel', ChatPermissionLevel.Default),
			setPermissionLevel: () => { },
			getExtensionPermissions: options.extensionPermissions ? () => options.extensionPermissions : undefined,
			isSandboxToggleApplicable: options.showSandboxToggle ? () => true : undefined,
			getSandboxToggleSettingId: options.showSandboxToggle ? () => 'test.sandbox' : undefined,
		};
		const action = upcastPartial<MenuItemAction>({
			id: 'chat.permissions',
			label: 'Permissions',
			tooltip: 'Permissions',
			enabled: true,
			run: async () => { },
		});
		const pickerOptions: IChatInputPickerOptions = {
			compact: observableValue('compact', false),
		};
		const picker = disposables.add(new PermissionPickerActionItem(
			action,
			delegate,
			pickerOptions,
			actionWidgetService,
			keybindingService,
			contextKeyService,
			NullTelemetryService,
			configurationService,
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IStorageService>() { }(),
			hoverService,
			preferencesService,
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		picker.render(container);
		picker.show();
		return { actionWidgetService, preferencesService };
	}

	test('adds Configure tools only to the Default permission', () => {
		const { actionWidgetService } = createPicker();
		const permissionItems = getActionItems(actionWidgetService.shownItems);

		assert.deepStrictEqual(permissionItems.map(item => ({
			id: item.item?.id,
			toolbarActions: item.item?.toolbarActions?.map(toolbarAction => ({
				id: toolbarAction.id,
				label: toolbarAction.label,
				tooltip: toolbarAction.tooltip,
				class: toolbarAction.class,
			})) ?? [],
		})), [
			{
				id: 'chat.permissions.default',
				toolbarActions: [{
					id: 'chat.permissions.configureTools',
					label: 'Configure tools',
					tooltip: 'Configure tools',
					class: ThemeIcon.asClassName(Codicon.gear),
				}],
			},
			{ id: 'chat.permissions.autoApprove', toolbarActions: [] },
			{ id: 'chat.permissions.autopilot', toolbarActions: [] },
			{ id: 'chat.permissions.learnMore', toolbarActions: [] },
		]);
	});

	test('opens the terminal auto-approve setting and closes the picker', async () => {
		const { actionWidgetService, preferencesService } = createPicker();
		const defaultItem = getActionItems(actionWidgetService.shownItems).find(item => item.item?.id === 'chat.permissions.default');
		assert.ok(defaultItem?.item?.toolbarActions?.[0]);

		await defaultItem.item.toolbarActions[0].run();

		assert.deepStrictEqual({
			hideCalls: actionWidgetService.hideCalls,
			openSettingsOptions: preferencesService.openSettingsOptions,
		}, {
			hideCalls: 1,
			openSettingsOptions: {
				jsonEditor: false,
				query: `@id:${TerminalContribSettingId.AutoApprove}`,
			},
		});
	});

	test('does not add Configure tools to extension-contributed permissions', () => {
		const extensionPermissions: IExtensionPermissionState = {
			sessionType: 'test',
			groupId: 'permissions',
			items: [{ id: 'custom', name: 'Custom permissions' }],
			selectedId: 'custom',
		};
		const { actionWidgetService } = createPicker({ extensionPermissions });

		assert.deepStrictEqual(getActionItems(actionWidgetService.shownItems).map(item => ({
			id: item.item?.id,
			toolbarActions: item.item?.toolbarActions?.map(toolbarAction => toolbarAction.id) ?? [],
		})), [
			{
				id: 'chat.permissions.ext.test.permissions.custom',
				toolbarActions: [],
			},
			{ id: 'chat.permissions.learnMore', toolbarActions: [] },
		]);
	});

	test('preserves the Default sandbox toggle and learn-more action', () => {
		const { actionWidgetService } = createPicker({ showSandboxToggle: true });
		const actionItems = getActionItems(actionWidgetService.shownItems);
		const defaultItem = actionItems.find(item => item.item?.id === 'chat.permissions.default');
		const learnMoreItem = actionItems.find(item => item.item?.id === 'chat.permissions.learnMore');

		assert.deepStrictEqual({
			sandboxLabel: defaultItem?.item?.inlineToggle?.label,
			learnMoreLabel: learnMoreItem?.label,
		}, {
			sandboxLabel: 'Sandboxing for terminal',
			learnMoreLabel: 'Learn more about permissions',
		});
	});
});
