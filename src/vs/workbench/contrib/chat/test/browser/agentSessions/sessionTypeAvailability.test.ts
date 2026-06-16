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
		override getChatSessionContribution(type: string): ResolvedChatSessionsExtensionPoint | undefined {
			if (type === TYPE && config.registered) {
				return { type: TYPE, name: TYPE, displayName: TYPE, description: '', icon: undefined };
			}
			return undefined;
		}
	}();
}

function createEntitlementService(entitlement: ChatEntitlement): IChatEntitlementService {
	return new class extends mock<IChatEntitlementService>() {
		override get entitlement(): ChatEntitlement {
			return entitlement;
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

	function availability(config: ITypeConfig, entitlement: ChatEntitlement, modelTargets: readonly (string | undefined)[] = []): SessionTypeAvailability {
		return getSessionTypeAvailability(
			createChatSessionsService(config),
			createEntitlementService(entitlement),
			createLanguageModelsService(modelTargets),
			TYPE,
		);
	}

	test('available when the type supports the Auto fallback', () => {
		const config: ITypeConfig = { registered: true, supportsAutoModel: true, requiresCustomModels: true };
		assert.strictEqual(availability(config, ChatEntitlement.Free), SessionTypeAvailability.Available);
		assert.strictEqual(availability(config, ChatEntitlement.Pro), SessionTypeAvailability.Available);
	});

	test('available when a model targets the type, even without Auto', () => {
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
