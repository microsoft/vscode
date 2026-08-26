/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { AgentSessionProviders, getAgentSessionProviderDescription } from '../../../../browser/agentSessions/agentSessions.js';
import { createAgentSdkSetupNotification } from '../../../../browser/agentSessions/agentHost/agentHostSdkSetupNotification.js';
import { SessionTypeAvailability } from '../../../../browser/agentSessions/sessionTypeAvailability.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../../browser/widget/input/chatInputNotificationService.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';
import { createSessionTypePickerAction, getConfiguredSessionTypePickerAvailability, ISessionTypeItem } from '../../../../browser/widget/input/sessionTargetPickerActionItem.js';

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
