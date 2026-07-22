/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { IModelSelectionMemory, IModelSelectionModelsContext, IModelSelectionSessionContext, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier, resolveModelIdentifierFromCatalog, transitionModelSelection } from '../../common/modelSelection.js';

function model(identifier: string, metadataId = identifier, family = identifier, version = '1.0'): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: metadataId,
			name: identifier,
			vendor: 'test',
			version,
			family,
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isDefaultForLocation: {},
		},
	};
}

const first = model('target:first', 'first', 'first');
const second = model('target:second', 'second', 'second');

interface ITransitionOverrides {
	readonly session?: Partial<Extract<IModelSelectionSessionContext, { kind: 'untitled' | 'existing' }>>;
	readonly models?: Partial<IModelSelectionModelsContext>;
	readonly previous?: Partial<IModelSelectionMemory>;
}

function transition(overrides: ITransitionOverrides = {}) {
	return transitionModelSelection({
		session: {
			kind: 'untitled',
			key: 'provider/type',
			chatKey: 'chat:one',
			modelId: undefined,
			...overrides.session,
		},
		models: {
			available: [first, second],
			configuredModel: undefined,
			waitForConfiguredModel: false,
			rememberedModelId: undefined,
			desiredModelResolution: { kind: 'notRequested' },
			fallbackModel: first,
			...overrides.models,
		},
		previous: {
			sessionKey: 'provider/type',
			lastPushedChatKey: 'chat:one',
			currentModel: undefined,
			currentReason: undefined,
			...overrides.previous,
		},
	});
}

function summarize(result: ReturnType<typeof transitionModelSelection>) {
	return {
		current: result.currentModel?.identifier,
		pending: result.pendingSelection,
		effect: result.effect.kind,
		applied: result.effect.kind === 'apply' ? result.effect.model.identifier : undefined,
		reason: result.effect.kind === 'none' ? undefined : result.effect.reason,
		lastPushedChatKey: result.lastPushedChatKey,
	};
}

suite('ModelSelection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves identifier availability states', () => {
		assert.deepStrictEqual([
			resolveModelIdentifier([first], undefined, false),
			resolveModelIdentifier([first], first.identifier, false),
			resolveModelIdentifier([], first.identifier, false),
			resolveModelIdentifier([], first.identifier, true),
		], [
			{ kind: 'notRequested' },
			{ kind: 'available', model: first },
			{ kind: 'pending', identifier: first.identifier },
			{ kind: 'unavailable', identifier: first.identifier },
		]);
	});

	test('uses shared vendor readiness for empty and live catalogs', () => {
		const resolvedVendors = new Set(['copilot', 'ollama']);
		const liveVendors = new Set<string>();
		const vendorResolution = {
			hasLiveModels: (vendor: string) => liveVendors.has(vendor),
			hasResolved: (vendor: string) => resolvedVendors.has(vendor),
		};
		const emptyCopilot = resolveModelIdentifierFromCatalog([], 'copilot/remembered', vendorResolution);
		const emptyByok = resolveModelIdentifierFromCatalog([], 'ollama/remembered', vendorResolution);
		liveVendors.add('copilot');
		const liveCopilot = resolveModelIdentifierFromCatalog([], 'copilot/remembered', vendorResolution);

		assert.deepStrictEqual({ emptyCopilot, emptyByok, liveCopilot }, {
			emptyCopilot: { kind: 'pending', identifier: 'copilot/remembered' },
			emptyByok: { kind: 'unavailable', identifier: 'ollama/remembered' },
			liveCopilot: { kind: 'unavailable', identifier: 'copilot/remembered' },
		});
	});

	test('treats a resolved-but-empty agent-host vendor as still loading (pending)', () => {
		// Agent-host vendors publish their models asynchronously after the agent host connects, so —
		// like Copilot — an empty resolution during startup is transient (pending), not conclusive.
		// This is the root fix for the "restored agent-host session shows Auto" bug: without it the
		// absent model resolves as `unavailable`, and the restore gives up instead of waiting.
		const resolvedVendors = new Set(['agent-host-copilotcli', 'remote-abc-copilotcli']);
		const liveVendors = new Set<string>();
		const vendorResolution = {
			hasLiveModels: (vendor: string) => liveVendors.has(vendor),
			hasResolved: (vendor: string) => resolvedVendors.has(vendor),
		};
		const localDesired = 'agent-host-copilotcli:gpt-5.6-sol';
		const remoteDesired = 'remote-abc-copilotcli:gpt-5.6-sol';
		const emptyLocal = resolveModelIdentifierFromCatalog([], localDesired, vendorResolution);
		const emptyRemote = resolveModelIdentifierFromCatalog([], remoteDesired, vendorResolution);
		// Once the agent-host pool has published models (but not this one) the absence is conclusive.
		liveVendors.add('agent-host-copilotcli');
		const loadedWithout = resolveModelIdentifierFromCatalog([], localDesired, vendorResolution);

		assert.deepStrictEqual({ emptyLocal, emptyRemote, loadedWithout }, {
			emptyLocal: { kind: 'pending', identifier: localDesired },
			emptyRemote: { kind: 'pending', identifier: remoteDesired },
			loadedWithout: { kind: 'unavailable', identifier: localDesired },
		});
	});

	test('shares configured, desired, pending, then fallback precedence', () => {
		assert.deepStrictEqual([
			resolveInitialModelSelection({ configuredModelValue: 'second', configuredModel: second, waitForConfiguredModel: true, desiredModelResolution: { kind: 'available', model: first }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModelValue: 'second', configuredModel: undefined, waitForConfiguredModel: true, desiredModelResolution: { kind: 'available', model: first }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModelValue: 'second', configuredModel: undefined, waitForConfiguredModel: false, desiredModelResolution: { kind: 'available', model: first }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModelValue: undefined, configuredModel: undefined, waitForConfiguredModel: false, desiredModelResolution: { kind: 'available', model: second }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModelValue: undefined, configuredModel: undefined, waitForConfiguredModel: false, desiredModelResolution: { kind: 'pending', identifier: second.identifier }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModelValue: undefined, configuredModel: undefined, waitForConfiguredModel: false, desiredModelResolution: { kind: 'unavailable', identifier: second.identifier }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
		], [
			{ kind: 'apply', model: second, reason: ModelSelectionReason.ConfiguredDefault },
			{ kind: 'pending', selection: { source: 'configured', reference: 'second' } },
			{ kind: 'apply', model: first, reason: ModelSelectionReason.Remembered },
			{ kind: 'apply', model: second, reason: ModelSelectionReason.Remembered },
			{ kind: 'pending', selection: { source: 'desired', reference: second.identifier } },
			{ kind: 'apply', model: first, reason: ModelSelectionReason.FirstAvailable },
		]);
	});

	test('resolves configured model ids, families, and auto', () => {
		const auto = model('target:auto', 'auto');
		const opus45 = model('target:opus-4.5', 'claude-opus-4.5', 'opus', '4.5');
		const opus46 = model('target:opus-4.6', 'claude-opus-4.6', 'opus', '4.6');
		const opus410 = model('target:opus-4.10', 'claude-opus-4.10', 'opus', '4.10');
		const opusAlias = model('target:opus', 'opus', 'opus');

		assert.deepStrictEqual([
			resolveConfiguredModel(undefined, [auto]),
			resolveConfiguredModel('auto', [opus45, auto])?.identifier,
			resolveConfiguredModel('CLAUDE-OPUS-4.6', [opus45, opus46])?.identifier,
			resolveConfiguredModel('opus', [opus45, opus46, opus410])?.identifier,
			resolveConfiguredModel('opus', [opus410, opusAlias])?.identifier,
			resolveConfiguredModel('missing', [opus45]),
		], [
			undefined,
			auto.identifier,
			opus46.identifier,
			opus410.identifier,
			opusAlias.identifier,
			undefined,
		]);
	});

	test('restores, waits for, and repairs existing-session models', () => {
		assert.deepStrictEqual([
			summarize(transition({ session: { kind: 'existing', modelId: second.identifier }, models: { desiredModelResolution: { kind: 'available', model: second } }, previous: { currentModel: first } })),
			summarize(transition({ session: { kind: 'existing', modelId: 'target:missing' }, models: { desiredModelResolution: { kind: 'pending', identifier: 'target:missing' } }, previous: { currentModel: first } })),
			summarize(transition({ session: { kind: 'existing', modelId: 'target:missing' }, models: { rememberedModelId: second.identifier, desiredModelResolution: { kind: 'unavailable', identifier: 'target:missing' } } })),
			summarize(transition({ session: { kind: 'existing', modelId: undefined } })),
		], [{
			current: second.identifier, pending: undefined, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:one',
		}, {
			current: undefined, pending: { source: 'desired', reference: 'target:missing' }, effect: 'clear', applied: undefined, reason: ModelSelectionReason.SessionRestore, lastPushedChatKey: 'chat:one',
		}, {
			current: second.identifier, pending: undefined, effect: 'apply', applied: second.identifier, reason: ModelSelectionReason.RemovedModelFallback, lastPushedChatKey: 'chat:one',
		}, {
			current: first.identifier, pending: undefined, effect: 'apply', applied: first.identifier, reason: ModelSelectionReason.FirstAvailable, lastPushedChatKey: 'chat:one',
		}]);
	});

	test('uses the same new-conversation policy for configured, remembered, pending, and fallback models', () => {
		assert.deepStrictEqual([
			summarize(transition({ models: { configuredModel: second.metadata.id }, previous: { currentModel: first, lastPushedChatKey: 'chat:previous' } })),
			summarize(transition({ models: { rememberedModelId: second.identifier, desiredModelResolution: { kind: 'available', model: second } } })),
			summarize(transition({ models: { available: [first], rememberedModelId: second.identifier, desiredModelResolution: { kind: 'pending', identifier: second.identifier } }, previous: { lastPushedChatKey: 'chat:previous' } })),
			summarize(transition()),
		], [{
			current: second.identifier, pending: undefined, effect: 'apply', applied: second.identifier, reason: ModelSelectionReason.ConfiguredDefault, lastPushedChatKey: 'chat:one',
		}, {
			current: second.identifier, pending: undefined, effect: 'apply', applied: second.identifier, reason: ModelSelectionReason.Remembered, lastPushedChatKey: 'chat:one',
		}, {
			current: undefined, pending: { source: 'desired', reference: second.identifier }, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:previous',
		}, {
			current: first.identifier, pending: undefined, effect: 'apply', applied: first.identifier, reason: ModelSelectionReason.FirstAvailable, lastPushedChatKey: 'chat:one',
		}]);
	});

	test('configured default applies to fresh conversations but not restored drafts or existing sessions', () => {
		assert.deepStrictEqual([
			summarize(transition({
				session: { modelId: undefined },
				models: { configuredModel: second.metadata.id },
				previous: { currentModel: undefined, currentReason: undefined, lastPushedChatKey: 'chat:one' },
			})),
			summarize(transition({
				session: { modelId: first.identifier },
				models: { configuredModel: second.metadata.id, desiredModelResolution: { kind: 'available', model: first } },
				previous: { currentModel: undefined, currentReason: undefined, lastPushedChatKey: 'chat:one' },
			})),
			summarize(transition({
				session: { kind: 'existing', modelId: first.identifier },
				models: { configuredModel: second.metadata.id, desiredModelResolution: { kind: 'available', model: first } },
			})),
		], [{
			current: second.identifier, pending: undefined, effect: 'apply', applied: second.identifier, reason: ModelSelectionReason.ConfiguredDefault, lastPushedChatKey: 'chat:one',
		}, {
			current: first.identifier, pending: undefined, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:one',
		}, {
			current: first.identifier, pending: undefined, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:one',
		}]);
	});

	test('a new conversation reapplies the configured default after an explicit selection', () => {
		assert.deepStrictEqual(summarize(transition({
			session: { modelId: first.identifier },
			models: { configuredModel: second.metadata.id },
			previous: {
				currentModel: first,
				currentReason: ModelSelectionReason.UserSelection,
				lastPushedChatKey: 'chat:previous',
			},
		})), {
			current: second.identifier,
			pending: undefined,
			effect: 'apply',
			applied: second.identifier,
			reason: ModelSelectionReason.ConfiguredDefault,
			lastPushedChatKey: 'chat:one',
		});
	});

	test('switching untitled drafts for the same provider restores the incoming draft model', () => {
		assert.deepStrictEqual(summarize(transition({
			session: { key: 'provider/other-session', modelId: first.identifier },
			models: {
				configuredModel: second.metadata.id,
				desiredModelResolution: { kind: 'available', model: first },
			},
			previous: {
				currentModel: second,
				currentReason: ModelSelectionReason.ConfiguredDefault,
				lastPushedChatKey: 'chat:previous',
			},
		})), {
			current: first.identifier,
			pending: undefined,
			effect: 'none',
			applied: undefined,
			reason: undefined,
			lastPushedChatKey: 'chat:one',
		});
	});

	test('same-chat automatic selection still upgrades to the configured default', () => {
		assert.deepStrictEqual(summarize(transition({
			session: { modelId: first.identifier },
			models: { configuredModel: second.metadata.id },
			previous: {
				currentModel: first,
				currentReason: ModelSelectionReason.FirstAvailable,
			},
		})), {
			current: second.identifier,
			pending: undefined,
			effect: 'apply',
			applied: second.identifier,
			reason: ModelSelectionReason.ConfiguredDefault,
			lastPushedChatKey: 'chat:one',
		});
	});

	test('does not reapply an unchanged configured model for the same chat', () => {
		assert.deepStrictEqual([
			summarize(transition({
				models: { configuredModel: first.metadata.id },
				previous: { currentModel: first, currentReason: ModelSelectionReason.ConfiguredDefault },
			})),
			summarize(transition({
				models: { configuredModel: second.metadata.id },
				previous: { currentModel: first, currentReason: ModelSelectionReason.ConfiguredDefault },
			})),
			summarize(transition({
				models: { configuredModel: second.metadata.id },
				previous: { currentModel: first, currentReason: ModelSelectionReason.UserSelection },
			})),
		], [{
			current: first.identifier, pending: undefined, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:one',
		}, {
			current: second.identifier, pending: undefined, effect: 'apply', applied: second.identifier, reason: ModelSelectionReason.ConfiguredDefault, lastPushedChatKey: 'chat:one',
		}, {
			current: first.identifier, pending: undefined, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:one',
		}]);
	});

	test('falls back when a configured model is inapplicable to an authoritative provider pool', () => {
		assert.deepStrictEqual(summarize(transition({
			models: {
				configuredModel: 'missing-family',
				waitForConfiguredModel: false,
				available: [first],
				fallbackModel: first,
				desiredModelResolution: { kind: 'notRequested' },
			},
			previous: { lastPushedChatKey: 'chat:previous' },
		})), {
			current: first.identifier,
			pending: undefined,
			effect: 'apply',
			applied: first.identifier,
			reason: ModelSelectionReason.FirstAvailable,
			lastPushedChatKey: 'chat:one',
		});
	});

	test('preserves pending restoration for an empty existing-session catalog', () => {
		assert.deepStrictEqual(summarize(transition({
			session: { kind: 'existing', modelId: second.identifier },
			models: {
				available: [],
				desiredModelResolution: { kind: 'pending', identifier: second.identifier },
				fallbackModel: undefined,
			},
			previous: { currentModel: first },
		})), {
			current: undefined,
			pending: { source: 'desired', reference: second.identifier },
			effect: 'clear',
			applied: undefined,
			reason: ModelSelectionReason.SessionRestore,
			lastPushedChatKey: 'chat:one',
		});
	});

	test('repairs a stale current model while other models remain available', () => {
		const removed = model('target:removed');
		assert.deepStrictEqual(summarize(transition({
			models: {
				available: [first],
				desiredModelResolution: { kind: 'unavailable', identifier: removed.identifier },
				fallbackModel: first,
			},
			previous: { currentModel: removed },
		})), {
			current: first.identifier,
			pending: undefined,
			effect: 'apply',
			applied: first.identifier,
			reason: ModelSelectionReason.RemovedModelFallback,
			lastPushedChatKey: 'chat:one',
		});
	});

	test('resets on scope change, clears empty pools, and re-pushes reused chats', () => {
		assert.deepStrictEqual([
			summarize(transition({ previous: { sessionKey: 'other/type', currentModel: second } })),
			summarize(transition({ models: { available: [] }, previous: { currentModel: first } })),
			summarize(transition({ previous: { currentModel: second } })),
			summarize(transition({ previous: { currentModel: second, lastPushedChatKey: 'chat:previous' } })),
		], [{
			current: first.identifier, pending: undefined, effect: 'apply', applied: first.identifier, reason: ModelSelectionReason.FirstAvailable, lastPushedChatKey: 'chat:one',
		}, {
			current: undefined, pending: undefined, effect: 'clear', applied: undefined, reason: ModelSelectionReason.NoModels, lastPushedChatKey: 'chat:one',
		}, {
			current: second.identifier, pending: undefined, effect: 'none', applied: undefined, reason: undefined, lastPushedChatKey: 'chat:one',
		}, {
			current: second.identifier, pending: undefined, effect: 'apply', applied: second.identifier, reason: ModelSelectionReason.NewChatRepush, lastPushedChatKey: 'chat:one',
		}]);
	});
});
