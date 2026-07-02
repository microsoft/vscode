/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { getSessionTypeAvailability, SessionTypeAvailability } from '../../../browser/agentSessions/sessionTypeAvailability.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../../common/chatSessionsService.js';
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

function createChatSessionsService(config: ITypeConfig): IChatSessionsService {
	return new class extends mock<IChatSessionsService>() {
		override supportsAutoModelForSessionType(type: string): boolean {
			return type === TYPE ? config.supportsAutoModel : false;
		}
		override requiresCustomModelsForSessionType(type: string): boolean {
			return type === TYPE ? config.requiresCustomModels : false;
		}
		override requiresCopilotSignInForSessionType(type: string): boolean {
			return type === TYPE ? !!config.requiresCopilotSignIn : false;
		}
		override getChatSessionContribution(type: string): ResolvedChatSessionsExtensionPoint | undefined {
			if (type === TYPE && config.registered) {
				return { type: TYPE, name: TYPE, displayName: TYPE, description: '', icon: undefined };
			}
			return undefined;
		}
	}();
}

function createEntitlementService(entitlement: ChatEntitlement, anonymous = false): IChatEntitlementService {
	return new class extends mock<IChatEntitlementService>() {
		override get entitlement(): ChatEntitlement {
			return entitlement;
		}
		override get anonymous(): boolean {
			return anonymous;
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
	}();
}

suite('getSessionTypeAvailability', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
		// BYOK is not supported in the agent host / Copilot CLI, so a stale/cached
		// Copilot model still targeting the type must not unlock it when signed out.
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true, requiresCopilotSignIn: true };
		assert.strictEqual(availability(config, ChatEntitlement.Unknown, [TYPE]), SessionTypeAvailability.SignInRequired);
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
