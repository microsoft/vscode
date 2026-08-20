/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier, resolveModelIdentifierFromCatalog, resolveModelIdentifierFromLanguageModels } from '../../common/modelSelection.js';

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

	test('treats an agent-host pool of only bridged BYOK models as still loading (pending)', () => {
		// The agent host mirrors the workbench's BYOK models into its pool as soon as the bridge is
		// up, but its own catalog only arrives once it has connected and authenticated. That first
		// wave must not make the vendor look live, or a restored session's model resolves as
		// `unavailable` and the restore falls back to an arbitrary bridged model.
		const sessionType = 'agent-host-copilotcli';
		const hostModel = (identifier: string, byokModelIdentifier?: string): ILanguageModelChatMetadataAndIdentifier => {
			const base = model(identifier);
			return { ...base, metadata: { ...base.metadata, vendor: sessionType, byokModelIdentifier } };
		};
		const desired = hostModel('agent-host-copilotcli:gpt-5.6-sol');
		const bridged = hostModel('agent-host-copilotcli:openrouter/ai21/jamba-large-1.7', 'openrouter/OpenRouter/ai21/jamba-large-1.7');
		const languageModelsService = { hasResolvedVendor: () => true };
		const resolve = (allModels: ILanguageModelChatMetadataAndIdentifier[]) =>
			resolveModelIdentifierFromLanguageModels(allModels, desired.identifier, languageModelsService, allModels);

		assert.deepStrictEqual({
			bridgedOnly: resolve([bridged]),
			ownModelsPublished: resolve([bridged, desired]),
			ownModelsPublishedWithout: resolve([bridged, hostModel('agent-host-copilotcli:auto')]),
		}, {
			bridgedOnly: { kind: 'pending', identifier: desired.identifier },
			ownModelsPublished: { kind: 'available', model: desired },
			ownModelsPublishedWithout: { kind: 'unavailable', identifier: desired.identifier },
		});
	});

	test('shares configured, desired, pending, then fallback precedence', () => {
		assert.deepStrictEqual([
			resolveInitialModelSelection({ configuredModel: second, desiredModelResolution: { kind: 'available', model: first }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModel: undefined, desiredModelResolution: { kind: 'available', model: second }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModel: undefined, desiredModelResolution: { kind: 'pending', identifier: second.identifier }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
			resolveInitialModelSelection({ configuredModel: undefined, desiredModelResolution: { kind: 'unavailable', identifier: second.identifier }, desiredReason: ModelSelectionReason.Remembered, fallbackModel: first, fallbackReason: ModelSelectionReason.FirstAvailable }),
		], [
			{ kind: 'apply', model: second, reason: ModelSelectionReason.ConfiguredDefault },
			{ kind: 'apply', model: second, reason: ModelSelectionReason.Remembered },
			{ kind: 'pending', selection: { reference: second.identifier } },
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
});
