/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { ModelSelectionReason, resolveModelIdentifier, resolveModelIdentifierFromCatalog } from '../../../../common/modelSelection.js';
import { ChatInputModelSelectionController, IChatInputModelSelectionRuntime } from '../../../../browser/widget/input/chatInputModelSelectionController.js';
import { ChatModelSelectionModel } from '../../../../browser/widget/input/chatModelSelectionModel.js';

function model(identifier: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: identifier,
			name: identifier,
			vendor: 'test',
			version: '1.0',
			family: identifier,
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isDefaultForLocation: {},
		},
	};
}

function targetedModel(identifier: string, sessionType: string): ILanguageModelChatMetadataAndIdentifier {
	const result = model(identifier);
	return { ...result, metadata: { ...result.metadata, targetChatSessionType: sessionType } };
}

interface IRuntimeState {
	models: ILanguageModelChatMetadataAndIdentifier[];
	resolved: boolean;
	readonly sessionType: string;
	readonly configuredModel?: string;
}

function createRuntime(
	selection: ChatModelSelectionModel,
	state: IRuntimeState,
	modelChanges: Emitter<string>,
	applied: string[],
): IChatInputModelSelectionRuntime {
	return {
		location: ChatAgentLocation.Chat,
		getCurrentModeKind: () => ChatModeKind.Ask,
		getCurrentSessionType: () => state.sessionType,
		isEmpty: () => true,
		getModels: () => state.models,
		getAllModels: () => state.models,
		requiresCustomModels: () => false,
		getConfiguredModelValue: () => state.configuredModel,
		resolveModelIdentifier: identifier => resolveModelIdentifier(state.models, identifier, state.resolved),
		subscribeToModelChanges: listener => modelChanges.event(listener),
		getBoundConversationKey: () => 'chat:one',
		getVisibleConversationKey: () => 'chat:one',
		restoreModelConfiguration: () => { },
		applyModel: model => {
			applied.push(model.identifier);
			selection.setCurrentModel(model, false);
		},
	};
}

suite('ChatModelSelectionModel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks explicit selection origin', () => {
		const selection = new ChatModelSelectionModel();
		const first = model('test/first');
		const second = model('test/second');

		selection.setCurrentModel(first, false);
		const automatic = {
			current: selection.currentModel.get()?.identifier,
			explicit: selection.userExplicitlySelectedModel,
		};
		selection.setCurrentModel(second, true);

		assert.deepStrictEqual({
			automatic,
			current: selection.currentModel.get()?.identifier,
			explicitAfterUserSelection: selection.userExplicitlySelectedModel,
		}, {
			automatic: { current: first.identifier, explicit: false },
			current: second.identifier,
			explicitAfterUserSelection: true,
		});
	});

	test('rolls back a failed automatic transition effect', () => {
		const selection = new ChatModelSelectionModel();
		const first = model('test/first');
		const second = model('test/second');
		selection.setCurrentModel(first, false);
		selection.setSelectionReason(ModelSelectionReason.FirstAvailable);
		const previousState = selection.captureState();
		selection.setCurrentModel(second, false);
		selection.setSelectionReason(ModelSelectionReason.ConfiguredDefault);

		assert.throws(() => selection.applyTransitionEffect(previousState, () => { throw new Error('rejected'); }), /rejected/);
		assert.deepStrictEqual({
			current: selection.currentModel.get()?.identifier,
			reason: selection.getCurrentReason(undefined),
		}, {
			current: first.identifier,
			reason: ModelSelectionReason.FirstAvailable,
		});
	});

	test('restores only for fresh own-pool session switches', () => {
		const selection = new ChatModelSelectionModel();
		const controller = disposables.add(new ChatInputModelSelectionController(selection, {} as IChatInputModelSelectionRuntime));

		controller.beginSessionSwitch(true, true, false);
		const restoreDuringFreshSwitch = controller.restorePerTypeModel;
		controller.endSessionSwitch();
		const restoreAfterSwitch = controller.restorePerTypeModel;
		controller.beginSessionSwitch(true, true, true);

		assert.deepStrictEqual({
			restoreDuringFreshSwitch,
			restoreAfterSwitch,
			carriedModelRestore: controller.restorePerTypeModel,
		}, {
			restoreDuringFreshSwitch: true,
			restoreAfterSwitch: false,
			carriedModelRestore: false,
		});
	});

	test('applies a fallback while waiting for a remembered model, then restores it', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const first = model('test/first');
		const second = model('test/second');
		let models = [first];
		let catalogResolved = false;
		const applied: string[] = [];
		const initialSelections: string[] = [];

		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => true,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, catalogResolved),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));
		controller.initialize(second.identifier, result => initialSelections.push(result.kind));
		const pending = controller.hasAuthoritativeModelWait();
		models = [first, second];
		catalogResolved = true;
		modelChanges.fire('test');

		assert.deepStrictEqual({
			initialSelections,
			pending,
			pendingAfterResolve: controller.hasAuthoritativeModelWait(),
			applied,
		}, {
			initialSelections: ['pending'],
			pending: true,
			pendingAfterResolve: false,
			applied: [first.identifier, second.identifier],
		});
	});

	test('applies a fallback while the configured default loads, then upgrades it', () => {
		const selection = new ChatModelSelectionModel();
		const byok = model('openai/byok');
		const configured = model('copilot/configured');
		let models = [byok];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => true,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => configured.metadata.id,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.initialize(undefined, () => { });
		const pending = controller.hasAuthoritativeModelWait();
		models = [byok, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ pending, applied, current: selection.currentModel.get()?.identifier }, {
			pending: false,
			applied: [byok.identifier, configured.identifier],
			current: configured.identifier,
		});
	});

	test('keeps an explicit selection when the configured default loads later', () => {
		const selection = new ChatModelSelectionModel();
		const byok = model('openai/byok');
		const explicit = model('openai/explicit');
		const configured = model('copilot/configured');
		let models = [byok, explicit];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => true,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => configured.metadata.id,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.initialize(undefined, () => { });
		controller.applyExplicitSelection(explicit, undefined, 'chat:one', () => applied.push(explicit.identifier), false);
		models = [byok, explicit, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ applied, current: selection.currentModel.get()?.identifier }, {
			applied: [byok.identifier, explicit.identifier],
			current: explicit.identifier,
		});
	});

	test('conversation restore cancels the startup remembered-model wait', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const remembered = model('copilot/remembered');
		const restored = model('test/restored');
		let models = [fallback, restored];
		let catalogResolved = false;
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, catalogResolved),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.initialize(remembered.identifier, () => { });
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [fallback, restored, remembered];
		catalogResolved = true;
		modelChanges.fire('test');

		assert.deepStrictEqual({
			pending: controller.hasAuthoritativeModelWait(),
			applied,
			current: selection.currentModel.get()?.identifier,
		}, {
			pending: false,
			applied: [fallback.identifier, restored.identifier],
			current: restored.identifier,
		});
	});

	test('late configured default does not overwrite a restored conversation model', () => {
		const selection = new ChatModelSelectionModel();
		const restored = model('test/restored');
		const configured = model('copilot/configured');
		let models = [restored];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => true,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => configured.metadata.id,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.initialize(undefined, () => { });
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [restored, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ applied, current: selection.currentModel.get()?.identifier }, {
			applied: [restored.identifier],
			current: restored.identifier,
		});
	});

	test('conversation restore cancels an older history wait', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const restored = model('test/restored');
		const history = model('test/history');
		let models = [restored];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.preselectFromHistory(history.identifier, 'chat:one');
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [restored, history];
		modelChanges.fire('test');

		assert.deepStrictEqual({ applied, current: selection.currentModel.get()?.identifier }, {
			applied: [restored.identifier],
			current: restored.identifier,
		});
	});

	test('fresh conversation precedence is configured, remembered, default, then first available', () => {
		const first = model('test/first');
		const remembered = model('test/remembered');
		const locationDefault = {
			...model('test/default'),
			metadata: {
				...model('test/default').metadata,
				isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
			},
		};

		const run = (configuredModel: string | undefined, rememberedModel: string | undefined, models: ILanguageModelChatMetadataAndIdentifier[]) => {
			const selection = new ChatModelSelectionModel();
			const applied: string[] = [];
			const runtime: IChatInputModelSelectionRuntime = {
				location: ChatAgentLocation.Chat,
				getCurrentModeKind: () => ChatModeKind.Ask,
				getCurrentSessionType: () => undefined,
				isEmpty: () => true,
				getModels: () => models,
				getAllModels: () => models,
				requiresCustomModels: () => false,
				getConfiguredModelValue: () => configuredModel,
				resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
				subscribeToModelChanges: () => toDisposable(() => { }),
				getBoundConversationKey: () => 'chat:one',
				getVisibleConversationKey: () => 'chat:one',
				restoreModelConfiguration: () => { },
				applyModel: selected => {
					applied.push(selected.identifier);
					selection.setCurrentModel(selected, false);
				},
			};
			disposables.add(new ChatInputModelSelectionController(selection, runtime)).initialize(rememberedModel, () => { });
			return applied[0];
		};

		assert.deepStrictEqual([
			run(locationDefault.metadata.id, remembered.identifier, [first, remembered, locationDefault]),
			run(undefined, remembered.identifier, [first, remembered, locationDefault]),
			run(undefined, undefined, [first, locationDefault]),
			run(undefined, undefined, [first]),
		], [locationDefault.identifier, remembered.identifier, locationDefault.identifier, first.identifier]);
	});

	test('applies provisional and configured defaults through the automatic path', () => {
		const selection = new ChatModelSelectionModel();
		const first = model('test/first');
		const second = model('test/second');
		const configuration: { model: string | undefined } = { model: undefined };
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => true,
			getModels: () => [first, second],
			getAllModels: () => [first, second],
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => configuration.model,
			resolveModelIdentifier: identifier => resolveModelIdentifier([first, second], identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.ensureCurrentModelSupported();
		const provisional = controller.provisionalModelId;
		configuration.model = second.metadata.id;
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ provisional, configuredApplied, applied }, {
			provisional: first.identifier,
			configuredApplied: true,
			applied: [first.identifier, second.identifier],
		});
	});

	test('replaces a BYOK first-available model when the Copilot default loads later', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const byok = model('openai/byok');
		const copilotDefault = {
			...model('copilot/auto'),
			metadata: {
				...model('copilot/auto').metadata,
				isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
			},
		};
		let models = [byok];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => true,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.initialize(undefined, () => { });
		const provisional = controller.provisionalModelId;
		models = [byok, copilotDefault];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ provisional, applied, current: selection.currentModel.get()?.identifier }, {
			provisional: byok.identifier,
			applied: [byok.identifier, copilotDefault.identifier],
			current: copilotDefault.identifier,
		});
	});

	test('drops cross-pool drafts and waits for a cold conversation model', () => {
		const selection = new ChatModelSelectionModel();
		const sessionType = 'agent-host-test';
		const general = model('test/general');
		const fallback = targetedModel('test/fallback', sessionType);
		const desired = targetedModel('test/desired', sessionType);
		const modelChanges = disposables.add(new Emitter<string>());
		let models = [fallback];
		let resolved = false;
		const applied: string[] = [];
		const restored: { modelId: string; configuration: Record<string, unknown> | undefined }[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => sessionType,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => true,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, resolved),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		const draft = controller.resolveDraftModel(general, sessionType, true);
		models = [];
		controller.syncFromConversationState(desired, { effort: 'high' }, sessionType, 'chat:one');
		const pending = controller.hasAuthoritativeModelWait();
		models = [fallback, desired];
		resolved = true;
		modelChanges.fire('test');

		assert.deepStrictEqual({
			draft: { model: draft.model?.identifier, changed: draft.changed },
			pending,
			pendingAfterResolve: controller.hasAuthoritativeModelWait(),
			applied,
			restored,
		}, {
			draft: { model: undefined, changed: true },
			pending: true,
			pendingAfterResolve: false,
			applied: [desired.identifier],
			restored: [{ modelId: desired.identifier, configuration: { effort: 'high' } }],
		});
	});

	test('syncFromConversationState waits through a resolved-but-empty agent-host pool and restores the model', () => {
		// Cold-restart race: the agent-host vendor is registered ("resolved") but its models arrive
		// later. Routed through the real catalog resolver, the agent-host grace keeps the absent
		// model `pending` (not `unavailable`), so the restore waits through the intermediate empty
		// re-resolutions and applies the model once the pool loads — instead of defaulting to Auto.
		// (If the grace in resolveModelIdentifierFromCatalog is removed, resolution is `unavailable`,
		// no wait is armed, and this test fails.)
		const selection = new ChatModelSelectionModel();
		const sessionType = 'agent-host-copilotcli';
		const base = targetedModel('agent-host-copilotcli:gpt-5.6-sol', sessionType);
		const desired = { ...base, metadata: { ...base.metadata, vendor: sessionType } };
		const modelChanges = disposables.add(new Emitter<string>());
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
		const applied: string[] = [];
		const restored: { modelId: string; configuration: Record<string, unknown> | undefined }[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => sessionType,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => true,
			getConfiguredModelValue: () => undefined,
			// Faithful to production: vendor is resolved but publishes models asynchronously.
			resolveModelIdentifier: identifier => resolveModelIdentifierFromCatalog(models, identifier, {
				hasLiveModels: vendor => models.some(m => m.metadata.vendor === vendor),
				hasResolved: () => true,
			}),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.syncFromConversationState(desired, { effort: 'high' }, sessionType, 'chat:one');
		const pending = controller.hasAuthoritativeModelWait();
		// An intermediate empty re-resolution must not end the wait or apply a default.
		modelChanges.fire('still-empty');
		const stillPendingAfterEmpty = controller.hasAuthoritativeModelWait();
		const appliedAfterEmpty = [...applied];
		// The real models finally arrive.
		models = [desired];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pending,
			stillPendingAfterEmpty,
			appliedAfterEmpty,
			pendingAfterLoad: controller.hasAuthoritativeModelWait(),
			applied,
			restored,
		}, {
			pending: true,
			stillPendingAfterEmpty: true,
			appliedAfterEmpty: [],
			pendingAfterLoad: false,
			applied: [desired.identifier],
			restored: [{ modelId: desired.identifier, configuration: { effort: 'high' } }],
		});
	});

	test('initialize waits for a resolved-but-empty agent-host pool and restores the remembered model', () => {
		// Root-fix regression test (Option 1). A NEW/untitled agent-host session restores its
		// remembered model via `initialize`. At cold start the agent-host vendor is registered
		// ("resolved") but its models have not arrived yet. Using the real catalog resolver, the
		// agent-host "empty is transient" grace must make the remembered model resolve as `pending`
		// (not `unavailable`) so `initialize` waits for the pool and applies the model on load,
		// instead of returning `none` and leaving the picker on Auto.
		//
		// If the fix in `isLanguageModelVendorAbsenceConclusive` is reverted, the resolution becomes
		// `unavailable`, `initialize` gets `none`, no wait is armed, and nothing is applied — this
		// test then fails on `pendingAfterInit`/`applied`/`current`.
		const selection = new ChatModelSelectionModel();
		const sessionType = 'agent-host-copilotcli';
		const remembered = targetedModel('agent-host-copilotcli:gpt-5.6-sol', sessionType);
		const modelChanges = disposables.add(new Emitter<string>());
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => sessionType,
			isEmpty: () => true,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => true,
			getConfiguredModelValue: () => undefined,
			// Faithful to production wiring: the vendor is resolved but publishes models
			// asynchronously, so route through the catalog resolver that applies the grace.
			resolveModelIdentifier: identifier => resolveModelIdentifierFromCatalog(models, identifier, {
				hasLiveModels: vendor => models.some(m => m.metadata.vendor === vendor),
				hasResolved: () => true,
			}),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.initialize(remembered.identifier, () => { });
		const pendingAfterInit = controller.hasAuthoritativeModelWait();
		const appliedAfterInit = [...applied];
		// An intermediate empty re-resolution must not end the wait or apply a default.
		modelChanges.fire('still-empty');
		const pendingAfterEmpty = controller.hasAuthoritativeModelWait();
		// The agent-host pool finally publishes its models.
		models = [remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterInit,
			appliedAfterInit,
			pendingAfterEmpty,
			pendingAfterLoad: controller.hasAuthoritativeModelWait(),
			applied,
			current: selection.currentModel.get()?.identifier,
		}, {
			pendingAfterInit: true,
			appliedAfterInit: [],
			pendingAfterEmpty: true,
			pendingAfterLoad: false,
			applied: [remembered.identifier],
			current: remembered.identifier,
		});
	});

	test('late best-match restore remains authoritative after configured-model refresh', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const sessionType = 'agent-host-test';
		const desired = targetedModel('test/desired', sessionType);
		const matchBase = targetedModel('test/match', sessionType);
		const match = { ...matchBase, metadata: { ...matchBase.metadata, id: desired.metadata.id } };
		const configured = targetedModel('test/configured', sessionType);
		const state: IRuntimeState = { models: [], resolved: false, sessionType, configuredModel: configured.metadata.id };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(selection, createRuntime(selection, state, modelChanges, applied)));

		controller.syncFromConversationState(desired, undefined, sessionType, 'chat:one');
		state.models = [match, configured];
		state.resolved = true;
		modelChanges.fire('test');
		controller.reconcileModelListChange(state.models);

		assert.deepStrictEqual({
			applied,
			current: selection.currentModel.get()?.identifier,
			reason: selection.selectionReason,
		}, {
			applied: [match.identifier],
			current: match.identifier,
			reason: ModelSelectionReason.SessionRestore,
		});
	});

	test('terminal restore fallback cancels an obsolete authoritative wait', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const sessionType = 'agent-host-test';
		const staleDesired = targetedModel('test/stale', sessionType);
		const fallback = targetedModel('test/fallback', sessionType);
		const inapplicable = model('test/inapplicable');
		const state: IRuntimeState = { models: [], resolved: false, sessionType };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(selection, createRuntime(selection, state, modelChanges, applied)));

		controller.syncFromConversationState(staleDesired, undefined, sessionType, 'chat:one');
		state.models = [fallback];
		state.resolved = true;
		controller.syncFromConversationState(inapplicable, undefined, sessionType, 'chat:one');
		state.models = [fallback, staleDesired];
		modelChanges.fire('test');

		assert.deepStrictEqual({ pending: controller.hasAuthoritativeModelWait(), applied }, {
			pending: false,
			applied: [fallback.identifier],
		});
	});

	test('does not apply a late history model after the visible conversation changes', () => {
		const selection = new ChatModelSelectionModel();
		const modelChanges = disposables.add(new Emitter<string>());
		const restored = model('test/restored');
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
		let visibleConversation = 'chat:one';
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => visibleConversation,
			getVisibleConversationKey: () => visibleConversation,
			restoreModelConfiguration: () => { },
			applyModel: selected => applied.push(selected.identifier),
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));

		controller.preselectFromHistory(restored.identifier, 'chat:one');
		visibleConversation = 'chat:two';
		models = [restored];
		modelChanges.fire('test');

		assert.deepStrictEqual(applied, []);
	});

	test('revalidates a selection when switching model pools', () => {
		const selection = new ChatModelSelectionModel();
		const general = model('test/general');
		const targeted = targetedModel('test/targeted', 'agent-host-test');
		const state: { sessionType: string | undefined } = { sessionType: undefined };
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => state.sessionType,
			isEmpty: () => true,
			getModels: type => type ? [targeted] : [general],
			getAllModels: () => [general, targeted],
			requiresCustomModels: () => true,
			getConfiguredModelValue: () => undefined,
			resolveModelIdentifier: identifier => resolveModelIdentifier([general, targeted], identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
				selection.setCurrentModel(selected, false);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(selection, runtime));
		selection.setCurrentModel(general, false);
		state.sessionType = 'agent-host-test';

		controller.revalidateForSessionType(() => { });

		assert.deepStrictEqual({ applied, current: selection.currentModel.get()?.identifier }, {
			applied: [targeted.identifier],
			current: targeted.identifier,
		});
	});
});
