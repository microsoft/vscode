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
import { IAgentSdkSetupService } from '../../../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ICodexAccountService } from '../../../../../../services/agentHost/browser/codexAccountService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { AgentSessionProviders, getAgentSessionProviderDescription } from '../../../../browser/agentSessions/agentSessions.js';
import { SessionTypeAvailability } from '../../../../browser/agentSessions/sessionTypeAvailability.js';
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
	);
}

function getCopilotAvailability(allowSignedOutWhenUsable: boolean): SessionTypeAvailability {
	return getAvailability({ type: SessionType.AgentHostCopilot, allowSignedOutWhenUsable, requiresCopilotSignIn: true });
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
