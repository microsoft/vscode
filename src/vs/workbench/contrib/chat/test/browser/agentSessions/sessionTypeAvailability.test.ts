/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { getSessionTypeAvailability, getSessionTypePickerAvailability, SessionTypeAvailability } from '../../../browser/agentSessions/sessionTypeAvailability.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';

interface ITypeConfig {
	/** Whether the type's contribution has been registered yet. */
	readonly registered: boolean;
	/** Whether the type supports the synthetic "Auto" model fallback. */
	readonly supportsAutoModel: boolean;
	/** Whether the type requires its own (custom) models to produce a request. */
	readonly requiresCustomModels: boolean;
	/** Whether the type relies on a Copilot account (defaults to false). */
	readonly requiresCopilotSignIn?: boolean;
}

const TYPE = 'agent-host-test';

function createChatSessionsService(config: ITypeConfig, sessionType = TYPE): IChatSessionsService {
	return new class extends mock<IChatSessionsService>() {
		override supportsAutoModelForSessionType(type: string): boolean {
			return type === sessionType ? config.supportsAutoModel : false;
		}
		override requiresCustomModelsForSessionType(type: string): boolean {
			return type === sessionType ? config.requiresCustomModels : false;
		}
		override requiresCopilotSignInForSessionType(type: string): boolean {
			return type === sessionType ? !!config.requiresCopilotSignIn : false;
		}
		override getChatSessionContribution(type: string): ResolvedChatSessionsExtensionPoint | undefined {
			if (type === sessionType && config.registered) {
				return { type: sessionType, name: sessionType, displayName: sessionType, description: '', icon: undefined };
			}
			return undefined;
		}
	}();
}

function createEntitlementService(entitlement: ChatEntitlement, anonymous = false, clientByokEnabled = true): IChatEntitlementService {
	return new class extends mock<IChatEntitlementService>() {
		override get entitlement(): ChatEntitlement {
			return entitlement;
		}
		override get anonymous(): boolean {
			return anonymous;
		}
		override get clientByokEnabled(): boolean {
			return clientByokEnabled;
		}
	}();
}

/** A language models service whose models target the given session types. */
function createLanguageModelsService(targets: readonly (string | undefined)[]): ILanguageModelsService {
	const ids = targets.map((_, i) => `model-${i}`);
	return new class extends mock<ILanguageModelsService>() {
		override getLanguageModelIds(): string[] {
			return ids;
		}
		override lookupLanguageModel(id: string): ILanguageModelChatMetadata | undefined {
			const index = ids.indexOf(id);
			if (index === -1) {
				return undefined;
			}
			return { targetChatSessionType: targets[index] } as ILanguageModelChatMetadata;
		}
		override isModelHidden(): boolean {
			return false;
		}
	}();
}

function createByokLanguageModelsService(type: string, hidden: readonly string[] = [], sourceRegistered = true): ILanguageModelsService {
	const sourceIdentifier = 'gemini/gemini-2.5-flash';
	return new class extends mock<ILanguageModelsService>() {
		override getLanguageModelIds(): string[] {
			return sourceRegistered ? ['agent-host-byok', sourceIdentifier] : ['agent-host-byok'];
		}
		override lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
			if (identifier === 'agent-host-byok') {
				return { targetChatSessionType: type, byokModelIdentifier: sourceIdentifier } as ILanguageModelChatMetadata;
			}
			if (identifier === sourceIdentifier && sourceRegistered) {
				return { isBYOK: true } as ILanguageModelChatMetadata;
			}
			return undefined;
		}
		override isModelHidden(identifier: string): boolean {
			return hidden.includes(identifier);
		}
	}();
}

suite('getSessionTypeAvailability', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Copilot Agent Host remains setup-selectable when signed-out operation is enabled', () => {
		const pickerAvailability = (type: string, allowSignedOutWhenUsable: boolean) => getSessionTypePickerAvailability(type, SessionTypeAvailability.SignInRequired, allowSignedOutWhenUsable);
		assert.deepStrictEqual({
			localCopilot: pickerAvailability(SessionType.AgentHostCopilot, true),
			localClaude: pickerAvailability(SessionType.AgentHostClaude, true),
			localDisabled: pickerAvailability(SessionType.AgentHostCopilot, false),
			legacyCopilot: pickerAvailability(SessionType.CopilotCLI, true),
		}, {
			localCopilot: SessionTypeAvailability.Available,
			localClaude: SessionTypeAvailability.SignInRequired,
			localDisabled: SessionTypeAvailability.SignInRequired,
			legacyCopilot: SessionTypeAvailability.SignInRequired,
		});
	});

	function availability(config: ITypeConfig, entitlement: ChatEntitlement, modelTargets: readonly (string | undefined)[] = [], anonymous = false): SessionTypeAvailability {
		return getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(entitlement, anonymous),
			createLanguageModelsService(modelTargets),
			TYPE,
		);
	}

	test('available when the type supports the Auto fallback', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Free), SessionTypeAvailability.Available);
		assert.strictEqual(availability(config, ChatEntitlement.Pro), SessionTypeAvailability.Available);
	});

	test('signed-out user must sign in even when the type supports the Auto fallback', () => {
		// Copilot CLI: supportsAutoModel=true. The Auto model needs a Copilot
		// account and BYOK is not supported here, so a signed-out user can't use it.
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown), SessionTypeAvailability.SignInRequired);
	});

	test('signed-out user must sign in for a custom-model agent host type', () => {
		// e.g. an agent host Claude harness: supportsAutoModel=false, requiresCustomModels=true.
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown), SessionTypeAvailability.SignInRequired);
	});

	test('local Agent Host Copilot and Claude require sign-in without a usable BYOK model', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: true, requiresCopilotSignIn: true };
		const getAvailability = (type: string, entitlement: ChatEntitlement) => getSessionTypeAvailability(
			createChatSessionsService(config, type),
			createEntitlementService(entitlement),
			createLanguageModelsService([]),
			type,
		);

		assert.deepStrictEqual({
			signedOutCopilot: getAvailability(SessionType.AgentHostCopilot, ChatEntitlement.Unknown),
			signedOutClaude: getAvailability(SessionType.AgentHostClaude, ChatEntitlement.Unknown),
			freeClaude: getAvailability(SessionType.AgentHostClaude, ChatEntitlement.Free),
			proClaude: getAvailability(SessionType.AgentHostClaude, ChatEntitlement.Pro),
		}, {
			signedOutCopilot: SessionTypeAvailability.SignInRequired,
			signedOutClaude: SessionTypeAvailability.SignInRequired,
			freeClaude: SessionTypeAvailability.UpgradeRequired,
			proClaude: SessionTypeAvailability.NoModels,
		});
	});

	test('signed-out user must sign in for a delegation type (e.g. Cloud)', () => {
		// The cloud agent delegates to a remote Copilot: supportsAutoModel=false,
		// requiresCustomModels=false. It still needs a Copilot account, so a
		// signed-out user is prompted to sign in rather than offered the type.
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: false, requiresCopilotSignIn: true };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown), SessionTypeAvailability.SignInRequired);
	});

	test('signed-out user can still use a non-Copilot third-party type', () => {
		// A general contributed session type that doesn't rely on Copilot
		// (requiresCopilotSignIn defaults to false) must not be gated behind
		// sign-in: with an Auto fallback it stays available while signed out.
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: false };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown), SessionTypeAvailability.Available);
	});

	test('anonymous access lets a signed-out user use a Copilot-backed type', () => {
		// With chat.allowAnonymousAccess enabled, a signed-out user is granted
		// access without signing in, so a Copilot-backed type (e.g. the local
		// agent host) stays available rather than prompting to sign in.
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown, [], true), SessionTypeAvailability.Available);
	});

	test('available when a model targets the type, even without Auto', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Pro, [TYPE]), SessionTypeAvailability.Available);
	});

	test('a targeting model does NOT override sign-in for a Copilot-backed type', () => {
		// A native/CAPI model also targets the harness, but still needs Copilot auth.
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown, [TYPE]), SessionTypeAvailability.SignInRequired);
	});

	test('a visible Agent Host BYOK model overrides sign-in for a Copilot-backed type', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(ChatEntitlement.Unknown),
			createByokLanguageModelsService(TYPE),
			TYPE,
			true,
		), SessionTypeAvailability.Available);
	});

	test('an Agent Host BYOK model does not override sign-in when signed-out operation is disabled', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(ChatEntitlement.Unknown),
			createByokLanguageModelsService(TYPE),
			TYPE,
			false,
		), SessionTypeAvailability.SignInRequired);
	});

	test('an Agent Host BYOK model does not override sign-in when client BYOK is disabled', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(ChatEntitlement.Unknown, false, false),
			createByokLanguageModelsService(TYPE),
			TYPE,
			true,
		), SessionTypeAvailability.SignInRequired);
	});

	test('a hidden Agent Host BYOK copy or source model does not override sign-in', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		const availabilityForHidden = (hidden: readonly string[]) => getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(ChatEntitlement.Unknown),
			createByokLanguageModelsService(TYPE, hidden),
			TYPE,
			true,
		);
		assert.deepStrictEqual({
			copyHidden: availabilityForHidden(['agent-host-byok']),
			sourceHidden: availabilityForHidden(['gemini/gemini-2.5-flash']),
		}, {
			copyHidden: SessionTypeAvailability.SignInRequired,
			sourceHidden: SessionTypeAvailability.SignInRequired,
		});
	});

	test('a stale Agent Host BYOK copy does not override sign-in after its source is removed', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(ChatEntitlement.Unknown),
			createByokLanguageModelsService(TYPE, [], false),
			TYPE,
			true,
		), SessionTypeAvailability.SignInRequired);
	});

	test('a targeting model keeps the type available on a paid plan', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Pro, [TYPE]), SessionTypeAvailability.Available);
	});

	test('general-pool models (no target) do not make a custom-model type available', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Pro, [undefined, 'some-other-type']), SessionTypeAvailability.NoModels);
	});

	test('available while the contribution has not registered yet', () => {
		const config: ITypeConfig = { registered: false, supportsAutoModel: false, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Pro), SessionTypeAvailability.Available);
		assert.strictEqual(availability(config, ChatEntitlement.Free), SessionTypeAvailability.Available);
	});

	test('custom-model type with no models: upgrade for Free/EDU, no models for paid', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Free), SessionTypeAvailability.UpgradeRequired);
		assert.strictEqual(availability(config, ChatEntitlement.EDU), SessionTypeAvailability.UpgradeRequired);
		assert.strictEqual(availability(config, ChatEntitlement.Pro), SessionTypeAvailability.NoModels);
		assert.strictEqual(availability(config, ChatEntitlement.Business), SessionTypeAvailability.NoModels);
	});

	test('delegation type (no custom models) stays usable on a paid plan but requires upgrade for Free/EDU', () => {
		// e.g. the cloud agent: supportsAutoModel=false, requiresCustomModels=false.
		const config: ITypeConfig = { registered: true, supportsAutoModel: false, requiresCustomModels: false };
		assert.strictEqual(availability(config, ChatEntitlement.Free), SessionTypeAvailability.UpgradeRequired);
		assert.strictEqual(availability(config, ChatEntitlement.EDU), SessionTypeAvailability.UpgradeRequired);
		assert.strictEqual(availability(config, ChatEntitlement.Pro), SessionTypeAvailability.Available);
		assert.strictEqual(availability(config, ChatEntitlement.Enterprise), SessionTypeAvailability.Available);
	});
});
