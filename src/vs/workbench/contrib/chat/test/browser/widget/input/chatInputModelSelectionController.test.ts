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
import { ModelSelectionReason, resolveModelIdentifierFromCatalog, type IIntendedModelSelection } from '../../../../common/modelSelection.js';
import { ChatInputModelSelectionController, IChatInputModelSelectionRuntime } from '../../../../browser/widget/input/chatInputModelSelectionController.js';

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

/**
 * Conversation-owned intent storage, standing in for `IInputModel.intendedModel`. Keying by
 * conversation reproduces the production guarantee — one record per conversation, reachable only
 * while that conversation is bound — rather than assuming it.
 */
function createIntentStore(
	boundKey: () => string | undefined,
	intents = new Map<string | undefined, IIntendedModelSelection | undefined>(),
): Pick<IChatInputModelSelectionRuntime, 'getIntentHolder'> {
	return {
		getIntentHolder: () => ({
			get intendedModel() { return intents.get(boundKey()); },
			setIntendedModel: (selection: IIntendedModelSelection | undefined) => { intents.set(boundKey(), selection); },
		}),
	};
}

interface IRuntimeState {
	models: ILanguageModelChatMetadataAndIdentifier[];
	readonly sessionType: string;
	configuredModel?: string;
	/** Defaults to `true` (a new/empty session). Set to `false` to model a reopened conversation with history. */
	isEmpty?: boolean;
	/** The conversation the input is bound to. Reassign to model the input rebinding to another chat. */
	conversationKey?: string;
	/**
	 * The intended model each conversation owns, standing in for `IInputModel.intendedModel`.
	 * Keyed by conversation so the production guarantee — one record per conversation, reachable
	 * only while that conversation is bound — is reproduced rather than assumed.
	 */
	readonly intents?: Map<string | undefined, IIntendedModelSelection | undefined>;
}

function createRuntime(
	state: IRuntimeState,
	modelChanges: Emitter<string>,
	applied: string[],
): IChatInputModelSelectionRuntime {
	const boundKey = () => state.conversationKey ?? 'chat:one';
	return {
		location: ChatAgentLocation.Chat,
		getCurrentModeKind: () => ChatModeKind.Ask,
		getCurrentSessionType: () => state.sessionType,
		isEmpty: () => state.isEmpty ?? true,
		getModels: () => state.models,
		getAllModels: () => state.models,
		requiresCustomModels: () => false,
		getConfiguredModelValue: () => state.configuredModel,
		subscribeToModelChanges: listener => modelChanges.event(listener),
		getBoundConversationKey: boundKey,
		...createIntentStore(boundKey, state.intents),
		restoreModelConfiguration: () => { },
		applyModel: model => applied.push(model.identifier),
	};
}

suite('ChatInputModelSelectionController', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks explicit selection origin', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], sessionType: 'test' }, modelChanges, [])));
		const first = model('test/first');
		const second = model('test/second');

		controller.applySelection(first, () => { }, false);
		const automatic = {
			current: controller.currentModel.get()?.identifier,
			explicit: controller.selectionReason,
		};
		controller.applySelection(second, () => { }, true, false);

		assert.deepStrictEqual({
			automatic,
			current: controller.currentModel.get()?.identifier,
			explicitAfterUserSelection: controller.selectionReason,
		}, {
			automatic: { current: first.identifier, explicit: undefined },
			current: second.identifier,
			explicitAfterUserSelection: ModelSelectionReason.UserSelection,
		});
	});

	test('rolls back a failed explicit selection effect', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], sessionType: 'test' }, modelChanges, [])));
		const first = model('test/first');
		const second = model('test/second');
		controller.applySelection(first, () => { }, false);

		assert.throws(() => controller.applySelection(second, () => { throw new Error('rejected'); }, true, true), /rejected/);
		assert.deepStrictEqual({
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
		}, {
			current: first.identifier,
			reason: undefined,
		});
	});

	test('restores only for fresh own-pool session switches', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({
			models: [],
			sessionType: 'test',
		}, modelChanges, [])));

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
		const modelChanges = disposables.add(new Emitter<string>());
		const first = model('test/first');
		const second = model('test/second');
		let models = [first];
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));
		controller.initialize(second.identifier);
		const pending = controller.isAwaitingRememberedModel();
		models = [first, second];
		modelChanges.fire('test');

		assert.deepStrictEqual({
			pending,
			pendingAfterResolve: controller.isAwaitingRememberedModel(),
			applied,
		}, {
			pending: true,
			pendingAfterResolve: false,
			applied: [first.identifier, second.identifier],
		});
	});

	test('restores a remembered model after split same-vendor catalog publication', () => {
		const first = model('test/first');
		const remembered = model('test/remembered');
		const modelChanges = disposables.add(new Emitter<string>());
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => applied.push(selected.identifier),
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier);
		models = [first];
		modelChanges.fire('partial');
		// The catalog calls the model conclusively gone; the reclaim must not depend on that verdict.
		const resolutionAfterPartial = resolveModelIdentifierFromCatalog(models, remembered.identifier, {
			hasLiveModels: vendor => models.some(model => model.metadata.vendor === vendor),
			hasResolved: () => true,
		}).kind;
		const pendingAfterPartial = controller.isAwaitingRememberedModel();
		models = [first, remembered];
		modelChanges.fire('complete');

		assert.deepStrictEqual({
			resolutionAfterPartial,
			pendingAfterPartial,
			pendingAfterComplete: controller.isAwaitingRememberedModel(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			resolutionAfterPartial: 'unavailable',
			pendingAfterPartial: true,
			pendingAfterComplete: false,
			applied: [first.identifier, remembered.identifier],
			current: remembered.identifier,
		});
	});

	test('explicit selection cancels an eventual remembered-model restore', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const explicit = model('test/explicit');
		const remembered = model('test/remembered');
		const state: IRuntimeState = { models: [fallback, explicit], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier);
		controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
		state.models = [fallback, explicit, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pending: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pending: false,
			applied: [fallback.identifier, explicit.identifier],
			current: explicit.identifier,
		});
	});

	test('programmatic selection cancels an eventual remembered-model restore', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const programmatic = model('test/programmatic');
		const remembered = model('test/remembered');
		const state: IRuntimeState = { models: [fallback, programmatic], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier);
		controller.applyProgrammaticSelection(programmatic);
		state.models = [fallback, programmatic, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pending: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
		}, {
			pending: false,
			applied: [fallback.identifier, programmatic.identifier],
			current: programmatic.identifier,
			reason: ModelSelectionReason.ProgrammaticSelection,
		});
	});

	test('pending programmatic selection applies when the model arrives', async () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const requested = model('test/requested');
		const state: IRuntimeState = { models: [], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		const result = controller.requestProgrammaticSelection(
			() => state.models.find(model => model.identifier === requested.identifier),
			'chat:one',
		);
		const pending = controller.hasPendingProgrammaticSelection();
		state.models = [requested];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pending,
			result: await result,
			pendingAfterLoad: controller.hasPendingProgrammaticSelection(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pending: true,
			result: true,
			pendingAfterLoad: false,
			applied: [requested.identifier],
			current: requested.identifier,
		});
	});

	test('explicit selection cancels a pending programmatic selection', async () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const requested = model('test/requested');
		const explicit = model('test/explicit');
		const state: IRuntimeState = { models: [explicit], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		const result = controller.requestProgrammaticSelection(
			() => state.models.find(model => model.identifier === requested.identifier),
			'chat:one',
		);
		controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
		state.models = [explicit, requested];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			result: await result,
			pending: controller.hasPendingProgrammaticSelection(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			result: false,
			pending: false,
			applied: [explicit.identifier],
			current: explicit.identifier,
		});
	});

	test('clearing a pending programmatic selection clears its authority', async () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const requested = model('test/requested');
		const state: IRuntimeState = { models: [], sessionType: 'local' };
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));

		const result = controller.requestProgrammaticSelection(
			() => state.models.find(model => model.identifier === requested.identifier),
			'chat:one',
		);
		controller.clearIntent();

		assert.deepStrictEqual({ result: await result, reason: controller.selectionReason }, {
			result: false,
			reason: undefined,
		});
	});

	test('location default improves the fallback without canceling remembered intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const remembered = model('test/remembered');
		const defaultBase = model('test/default');
		const locationDefault = {
			...defaultBase,
			metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
		};
		const state: IRuntimeState = { models: [fallback], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier);
		state.models = [fallback, locationDefault];
		controller.reconcileModelListChange(state.models);
		const pendingAfterDefault = controller.isAwaitingRememberedModel();
		state.models = [fallback, locationDefault, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterDefault,
			pendingAfterLoad: controller.isAwaitingRememberedModel(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterDefault: true,
			pendingAfterLoad: false,
			applied: [fallback.identifier, locationDefault.identifier, remembered.identifier],
			current: remembered.identifier,
		});
	});

	test('repairs a removed fallback without canceling remembered intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const replacement = model('test/replacement');
		const remembered = model('test/remembered');
		const state: IRuntimeState = { models: [fallback], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier);
		state.models = [replacement];
		modelChanges.fire('fallback-removed');
		const pendingAfterRepair = controller.isAwaitingRememberedModel();
		state.models = [replacement, remembered];
		modelChanges.fire('remembered-loaded');

		assert.deepStrictEqual({
			pendingAfterRepair,
			pendingAfterLoad: controller.isAwaitingRememberedModel(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterRepair: true,
			pendingAfterLoad: false,
			applied: [fallback.identifier, replacement.identifier, remembered.identifier],
			current: remembered.identifier,
		});
	});

	test('reclaims the selected model after it disappears and comes back', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const selected = targetedModel('agent-host/selected', 'agent-host');
		const other = targetedModel('agent-host/other', 'agent-host');
		const state: IRuntimeState = { models: [selected, other], sessionType: 'agent-host' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.applySelection(selected, () => { }, true, false);
		state.models = [other];
		modelChanges.fire('agent-host-restarting');
		const duringRestart = controller.currentModel.get()?.identifier;
		state.models = [selected, other];
		modelChanges.fire('agent-host-restarted');

		assert.deepStrictEqual({
			duringRestart,
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
			pending: controller.hasPendingIntent(),
			applied,
		}, {
			duringRestart: other.identifier,
			current: selected.identifier,
			// The restore reinstates the original authority rather than downgrading to `Remembered`.
			reason: ModelSelectionReason.UserSelection,
			pending: false,
			applied: [other.identifier, selected.identifier],
		});
	});

	test('reclaims a storage-seeded remembered model that disappears mid-session', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const remembered = model('test/remembered');
		const other = model('test/other');
		const state: IRuntimeState = { models: [remembered, other], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		// The remembered model is already available, so `initialize` applies it and arms no wait.
		controller.initialize(remembered.identifier);
		state.models = [other];
		modelChanges.fire('model-gone');
		const duringOutage = controller.currentModel.get()?.identifier;
		state.models = [remembered, other];
		modelChanges.fire('model-back');

		assert.deepStrictEqual({
			duringOutage,
			current: controller.currentModel.get()?.identifier,
			pending: controller.hasPendingIntent(),
			applied,
		}, {
			duringOutage: other.identifier,
			current: remembered.identifier,
			pending: false,
			applied: [remembered.identifier, other.identifier, remembered.identifier],
		});
	});

	test('reclaims the selected model even after a same-family substitute stood in', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const selected = model('test/selected');
		const substitute: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'test/substitute',
			metadata: { ...selected.metadata, id: 'test/substitute', name: 'test/substitute' },
		};
		const state: IRuntimeState = { models: [selected, substitute], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.applySelection(selected, () => { }, true, false);
		state.models = [substitute];
		modelChanges.fire('model-gone');
		const duringOutage = controller.currentModel.get()?.identifier;
		state.models = [selected, substitute];
		modelChanges.fire('model-back');

		assert.deepStrictEqual({
			duringOutage,
			current: controller.currentModel.get()?.identifier,
			applied,
		}, {
			// The shared family makes `substitute` a best match, so it stands in rather than the default.
			duringOutage: substitute.identifier,
			current: selected.identifier,
			applied: [substitute.identifier, selected.identifier],
		});
	});

	test('an explicit selection outlives the model it displaced', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const selected = model('test/selected');
		const other = model('test/other');
		const chosen = model('test/chosen');
		const state: IRuntimeState = { models: [selected, other, chosen], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.applySelection(selected, () => { }, true, false);
		state.models = [other, chosen];
		modelChanges.fire('model-removed');
		controller.applySelection(chosen, () => { }, true, false);
		state.models = [selected, other, chosen];
		modelChanges.fire('model-back');

		assert.deepStrictEqual({
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
			pending: controller.hasPendingIntent(),
			applied,
		}, {
			current: chosen.identifier,
			reason: ModelSelectionReason.UserSelection,
			pending: false,
			applied: [other.identifier],
		});
	});

	test('reclaims an explicit pick that was displaced while chat.defaultModel stood in', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const configured = model('test/configured');
		const picked = model('test/picked');
		const state: IRuntimeState = {
			models: [configured, picked],
			sessionType: 'local',
			configuredModel: configured.metadata.id,
		};
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.applySelection(picked, () => { }, true, false);
		state.models = [configured];
		modelChanges.fire('picked-gone');
		const duringOutage = controller.currentModel.get()?.identifier;
		const reasonDuringOutage = controller.selectionReason;
		state.models = [configured, picked];
		modelChanges.fire('picked-back');
		const afterReturn = controller.currentModel.get()?.identifier;
		// A later refresh must not let the configured default reclaim an explicit pick.
		modelChanges.fire('later-refresh');

		assert.deepStrictEqual({
			duringOutage,
			reasonDuringOutage,
			afterReturn,
			afterRefresh: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
		}, {
			duringOutage: configured.identifier,
			reasonDuringOutage: ModelSelectionReason.ConfiguredDefault,
			afterReturn: picked.identifier,
			afterRefresh: picked.identifier,
			reason: ModelSelectionReason.UserSelection,
		});
	});

	test('applies a fallback while the configured default loads, then upgrades it', () => {
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
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined);
		const pending = controller.hasPendingIntent();
		models = [byok, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ pending, applied, current: controller.currentModel.get()?.identifier }, {
			pending: false,
			applied: [byok.identifier, configured.identifier],
			current: configured.identifier,
		});
	});

	test('configured default supersedes pending remembered intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const configured = model('test/configured');
		const remembered = model('test/remembered');
		const state: IRuntimeState = {
			models: [fallback],
			sessionType: 'local',
			configuredModel: configured.metadata.id,
		};
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier);
		state.models = [fallback, configured, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pending: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
		}, {
			pending: false,
			applied: [fallback.identifier, configured.identifier],
			current: configured.identifier,
			reason: ModelSelectionReason.ConfiguredDefault,
		});
	});

	test('configured default claims an already selected fallback', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const defaultBase = model('test/default');
		const locationDefault = {
			...defaultBase,
			metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
		};
		const state: IRuntimeState = { models: [fallback], sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(undefined);
		state.configuredModel = fallback.metadata.id;
		state.models = [fallback, locationDefault];
		modelChanges.fire('configured');
		modelChanges.fire('unchanged');

		assert.deepStrictEqual({
			applied,
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
		}, {
			applied: [fallback.identifier],
			current: fallback.identifier,
			reason: ModelSelectionReason.ConfiguredDefault,
		});
	});

	test('keeps an explicit selection when the configured default loads later', () => {
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
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined);
		controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
		models = [byok, explicit, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
			applied: [byok.identifier, explicit.identifier],
			current: explicit.identifier,
		});
	});

	test('conversation restore cancels startup remembered intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const remembered = model('copilot/remembered');
		const restored = model('test/restored');
		let models = [fallback, restored];
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier);
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [fallback, restored, remembered];
		modelChanges.fire('test');

		assert.deepStrictEqual({
			pending: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pending: false,
			applied: [fallback.identifier, restored.identifier],
			current: restored.identifier,
		});
	});

	test('late configured default does not overwrite a restored conversation model', () => {
		// A genuine reopened conversation is NON-empty, so the configured default must never override
		// its restored model. The empty/new-session case (where the configured default wins over a
		// spilled-over restore) is covered by the empty-session tests above.
		const restored = model('test/restored');
		const configured = model('copilot/configured');
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
			getConfiguredModelValue: () => configured.metadata.id,
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined);
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [restored, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
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
				subscribeToModelChanges: () => toDisposable(() => { }),
				getBoundConversationKey: () => 'chat:one',
				...createIntentStore(() => 'chat:one'),
				restoreModelConfiguration: () => { },
				applyModel: selected => {
					applied.push(selected.identifier);
				},
			};
			disposables.add(new ChatInputModelSelectionController(runtime)).initialize(rememberedModel);
			return applied[0];
		};

		assert.deepStrictEqual([
			run(locationDefault.metadata.id, remembered.identifier, [first, remembered, locationDefault]),
			run(undefined, remembered.identifier, [first, remembered, locationDefault]),
			run(undefined, undefined, [first, locationDefault]),
			run(undefined, undefined, [first]),
		], [locationDefault.identifier, remembered.identifier, locationDefault.identifier, first.identifier]);
	});

	test('validation leaves an unselected picker alone, but a configured default still applies', () => {
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
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.ensureCurrentModelSupported();
		configuration.model = second.metadata.id;
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied }, {
			configuredApplied: true,
			applied: [second.identifier],
		});
	});

	test('re-applies the configured default over a spilled-over session-restore on an empty session', () => {
		// Regression for the local "+ new session" / back-to-list cases: a new empty session that
		// inherits the previous session's model as a session-restore must still reset to the
		// configured `chat.defaultModel`. See the SessionRestore-is-not-a-blocker rule in
		// `applyConfiguredDefault`.
		const gpt = model('test/gpt');
		const opus = model('test/opus');
		const modelChanges = disposables.add(new Emitter<string>());
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(
			createRuntime({ models: [gpt, opus], sessionType: 'test', configuredModel: gpt.metadata.id }, modelChanges, applied)));

		controller.beginSessionSwitch(true, false, false);
		controller.syncFromConversationState(opus, undefined, 'test', 'chat:one');
		const afterSpillover = controller.currentModel.get()?.identifier;
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ afterSpillover, configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
			afterSpillover: opus.identifier,
			configuredApplied: true,
			applied: [opus.identifier, gpt.identifier],
			current: gpt.identifier,
		});
	});

	test('keeps a reopened conversation on its own model instead of the configured default', () => {
		// Switching back to a chat that already has history must not re-seed it from
		// `chat.defaultModel` — that busts the prompt cache on every switch.
		const gpt = model('test/gpt');
		const opus = model('test/opus');
		const modelChanges = disposables.add(new Emitter<string>());
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(
			{ models: [gpt, opus], sessionType: 'test', configuredModel: gpt.metadata.id, isEmpty: false },
			modelChanges,
			applied)));

		controller.beginSessionSwitch(false, false, true);
		controller.initialize(opus.identifier);
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
			configuredApplied: false,
			applied: [opus.identifier],
			current: opus.identifier,
		});
	});

	test('preserves an explicit user pick on an empty session over the configured default', () => {
		const gpt = model('test/gpt');
		const opus = model('test/opus');
		const modelChanges = disposables.add(new Emitter<string>());
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(
			createRuntime({ models: [gpt, opus], sessionType: 'test', configuredModel: gpt.metadata.id }, modelChanges, applied)));

		controller.beginSessionSwitch(true, false, false);
		controller.applySelection(opus, () => applied.push(opus.identifier), true, false);
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier, userPicked: controller.selectionReason === ModelSelectionReason.UserSelection }, {
			configuredApplied: false,
			applied: [opus.identifier],
			current: opus.identifier,
			userPicked: true,
		});
	});

	test('keeps the restored model on a reopened non-empty conversation even when a default is configured', () => {
		const gpt = model('test/gpt');
		const opus = model('test/opus');
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => undefined,
			isEmpty: () => false,
			getModels: () => [gpt, opus],
			getAllModels: () => [gpt, opus],
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => gpt.metadata.id,
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => applied.push(selected.identifier),
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.syncFromConversationState(opus, undefined, undefined, 'chat:one');
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
			configuredApplied: false,
			applied: [opus.identifier],
			current: opus.identifier,
		});
	});

	test('leaves the spilled-over model sticky when no default model is configured', () => {
		// The fix must be inert when `chat.defaultModel` is unset: sticky "last-used" behavior wins.
		const gpt = model('test/gpt');
		const opus = model('test/opus');
		const modelChanges = disposables.add(new Emitter<string>());
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(
			createRuntime({ models: [gpt, opus], sessionType: 'test' }, modelChanges, applied)));

		controller.beginSessionSwitch(true, false, false);
		controller.syncFromConversationState(opus, undefined, 'test', 'chat:one');
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
			configuredApplied: false,
			applied: [opus.identifier],
			current: opus.identifier,
		});
	});

	test('replaces a BYOK first-available model when the Copilot default loads later', () => {
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined);
		models = [byok, copilotDefault];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
			applied: [byok.identifier, copilotDefault.identifier],
			current: copilotDefault.identifier,
		});
	});

	test('drops cross-pool drafts and waits for a cold conversation model', () => {
		const sessionType = 'agent-host-test';
		const general = model('test/general');
		const fallback = targetedModel('test/fallback', sessionType);
		const desired = targetedModel('test/desired', sessionType);
		const modelChanges = disposables.add(new Emitter<string>());
		let models = [fallback];
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		const draft = controller.resolveDraftModel(general, sessionType, true);
		models = [];
		controller.syncFromConversationState(desired, { effort: 'high' }, sessionType, 'chat:one');
		const awaiting = controller.isAwaitingRememberedModel();
		models = [fallback, desired];
		modelChanges.fire('test');

		assert.deepStrictEqual({
			draft: { model: draft.model?.identifier, changed: draft.changed },
			awaiting,
			awaitingAfterResolve: controller.isAwaitingRememberedModel(),
			applied,
			restored,
		}, {
			draft: { model: undefined, changed: true },
			awaiting: true,
			awaitingAfterResolve: false,
			applied: [desired.identifier],
			restored: [{ modelId: desired.identifier, configuration: { effort: 'high' } }],
		});
	});

	test('syncFromConversationState reclaims the conversation model however late the pool publishes', () => {
		// Cold-restart race: the agent-host vendor is registered but its models arrive later, and it
		// publishes in waves — first the workbench's BYOK models mirrored in over the bridge, then its
		// own. Whatever stand-in is shown meanwhile, the conversation's model is reclaimed the moment
		// it appears; no wave has to arrive by any particular deadline for the restore to be honoured.
		const sessionType = 'agent-host-copilotcli';
		const hostModel = (identifier: string, byokModelIdentifier?: string): ILanguageModelChatMetadataAndIdentifier => {
			const base = targetedModel(identifier, sessionType);
			return { ...base, metadata: { ...base.metadata, vendor: sessionType, byokModelIdentifier } };
		};
		const desired = hostModel('agent-host-copilotcli:gpt-5.6-sol');
		const bridged = hostModel('agent-host-copilotcli:openrouter/ai21/jamba-large-1.7', 'openrouter/OpenRouter/ai21/jamba-large-1.7');
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.syncFromConversationState(desired, { effort: 'high' }, sessionType, 'chat:one');
		const awaitingWhileEmpty = controller.isAwaitingRememberedModel();
		// Wave one: bridged BYOK copies only — the host's own catalog is still in flight.
		models = [bridged];
		modelChanges.fire('byok-bridge');
		const awaitingAfterBridge = controller.isAwaitingRememberedModel();
		// Wave two: the host's own models arrive.
		models = [bridged, desired];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			awaitingWhileEmpty,
			awaitingAfterBridge,
			awaitingAfterLoad: controller.isAwaitingRememberedModel(),
			current: controller.currentModel.get()?.identifier,
			finalApplied: applied[applied.length - 1],
			restored,
		}, {
			awaitingWhileEmpty: true,
			awaitingAfterBridge: true,
			awaitingAfterLoad: false,
			current: desired.identifier,
			finalApplied: desired.identifier,
			restored: [{ modelId: desired.identifier, configuration: { effort: 'high' } }],
		});
	});

	test('a stand-in echoed back by the conversation does not displace the model being awaited', () => {
		// Applying a model writes it into the conversation's input state, which the agent host
		// republishes as the session draft and syncs straight back. Without the echo guard that
		// round-trip is read as the session's own model, overwrites the model being waited for, and
		// makes a transient stand-in permanent — which is exactly how a restored session ends up
		// pinned to an arbitrary model from a half-published pool.
		const sessionType = 'agent-host-copilotcli';
		const hostModel = (identifier: string): ILanguageModelChatMetadataAndIdentifier => {
			const base = targetedModel(identifier, sessionType);
			return { ...base, metadata: { ...base.metadata, vendor: sessionType } };
		};
		const desired = hostModel('agent-host-copilotcli:gpt-5.6-sol');
		const bridged = hostModel('agent-host-copilotcli:openrouter/ai21/jamba-large-1.7');
		const modelChanges = disposables.add(new Emitter<string>());
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => sessionType,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => true,
			getConfiguredModelValue: () => undefined,
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.syncFromConversationState(desired, undefined, sessionType, 'chat:one');
		// Wave one publishes bridged copies only, so a stand-in is shown.
		models = [bridged];
		modelChanges.fire('byok-bridge');
		const standIn = controller.currentModel.get()?.identifier;
		// The stand-in round-trips through the draft and comes back as the session's model.
		controller.syncFromConversationState(bridged, undefined, sessionType, 'chat:one');
		const awaitingAfterEcho = controller.isAwaitingRememberedModel();
		models = [bridged, desired];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			standIn,
			awaitingAfterEcho,
			current: controller.currentModel.get()?.identifier,
		}, {
			standIn: bridged.identifier,
			awaitingAfterEcho: true,
			current: desired.identifier,
		});
	});

	test('a peer client genuinely selecting the stand-in supersedes the model being awaited', () => {
		// The echo guard keys on the local round-trip of our own stand-in. A state pushed in by
		// another connected client carries `ChatInputStateOrigin.Remote`, and that IS a real statement
		// about the session even when it names the very model we happen to be displaying — so it must
		// not be discarded as an echo.
		const sessionType = 'agent-host-copilotcli';
		const hostModel = (identifier: string): ILanguageModelChatMetadataAndIdentifier => {
			const base = targetedModel(identifier, sessionType);
			return { ...base, metadata: { ...base.metadata, vendor: sessionType } };
		};
		const desired = hostModel('agent-host-copilotcli:gpt-5.6-sol');
		const bridged = hostModel('agent-host-copilotcli:openrouter/ai21/jamba-large-1.7');
		const modelChanges = disposables.add(new Emitter<string>());
		let models: ILanguageModelChatMetadataAndIdentifier[] = [];
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => sessionType,
			isEmpty: () => false,
			getModels: () => models,
			getAllModels: () => models,
			requiresCustomModels: () => true,
			getConfiguredModelValue: () => undefined,
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.syncFromConversationState(desired, undefined, sessionType, 'chat:one');
		models = [bridged];
		modelChanges.fire('byok-bridge');
		// A peer picks the model we are showing as a stand-in.
		controller.syncFromConversationState(bridged, undefined, sessionType, 'chat:one', true);
		const awaitingAfterPeerPick = controller.isAwaitingRememberedModel();
		// The originally awaited model finally publishes — it must NOT reclaim the selection.
		models = [bridged, desired];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			awaitingAfterPeerPick,
			current: controller.currentModel.get()?.identifier,
		}, {
			awaitingAfterPeerPick: false,
			current: bridged.identifier,
		});
	});

	test('initialize keeps remembered intent through empty catalog updates', () => {
		const sessionType = 'test-session';
		const remembered = targetedModel('test:remembered', sessionType);
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier);
		const pendingAfterInit = controller.isAwaitingRememberedModel();
		const appliedAfterInit = [...applied];
		// An intermediate empty re-resolution must not end the wait or apply a default.
		modelChanges.fire('still-empty');
		const pendingAfterEmpty = controller.isAwaitingRememberedModel();
		// The remembered model finally appears.
		models = [remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterInit,
			appliedAfterInit,
			pendingAfterEmpty,
			pendingAfterLoad: controller.isAwaitingRememberedModel(),
			applied,
			current: controller.currentModel.get()?.identifier,
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
		const modelChanges = disposables.add(new Emitter<string>());
		const sessionType = 'agent-host-test';
		const desired = targetedModel('test/desired', sessionType);
		const matchBase = targetedModel('test/match', sessionType);
		const match = { ...matchBase, metadata: { ...matchBase.metadata, id: desired.metadata.id } };
		const configured = targetedModel('test/configured', sessionType);
		// A genuine reopened conversation is NON-empty, so its best-match restore stays authoritative and
		// the configured default must not override it. The empty-session behavior is covered above.
		const state: IRuntimeState = { models: [], sessionType, configuredModel: configured.metadata.id, isEmpty: false };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.syncFromConversationState(desired, undefined, sessionType, 'chat:one');
		state.models = [match, configured];
		modelChanges.fire('test');
		controller.reconcileModelListChange(state.models);

		assert.deepStrictEqual({
			applied,
			current: controller.currentModel.get()?.identifier,
			reason: controller.selectionReason,
		}, {
			applied: [match.identifier],
			current: match.identifier,
			reason: ModelSelectionReason.SessionRestore,
		});
	});

	test('a genuinely different conversation model cancels an outstanding restore', () => {
		// Distinct from the echoed stand-in above: this model was never applied by the controller,
		// so it is a real statement about the session and supersedes the model being waited for.
		const modelChanges = disposables.add(new Emitter<string>());
		const sessionType = 'agent-host-test';
		const staleDesired = targetedModel('test/stale', sessionType);
		const fallback = targetedModel('test/fallback', sessionType);
		const inapplicable = model('test/inapplicable');
		const state: IRuntimeState = { models: [], sessionType };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.syncFromConversationState(staleDesired, undefined, sessionType, 'chat:one');
		state.models = [fallback];
		controller.syncFromConversationState(inapplicable, undefined, sessionType, 'chat:one');
		state.models = [fallback, staleDesired];
		modelChanges.fire('test');

		assert.deepStrictEqual({ pending: controller.hasPendingIntent(), applied }, {
			pending: false,
			applied: [fallback.identifier],
		});
	});

	test('revalidates a selection when switching model pools', () => {
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
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));
		controller.applySelection(general, () => { }, false);
		state.sessionType = 'agent-host-test';

		controller.revalidateForSessionType(() => { });

		assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
			applied: [targeted.identifier],
			current: targeted.identifier,
		});
	});

	test('clears the previous model while the destination harness pool loads', () => {
		const sessionType = 'agent-host-test';
		const general = model('test/general');
		const targeted = targetedModel('test/targeted', sessionType);
		const modelChanges = disposables.add(new Emitter<string>());
		const state: { sessionType: string | undefined; targetedModels: ILanguageModelChatMetadataAndIdentifier[] } = {
			sessionType: undefined,
			targetedModels: [],
		};
		const applied: string[] = [];
		const runtime: IChatInputModelSelectionRuntime = {
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => ChatModeKind.Ask,
			getCurrentSessionType: () => state.sessionType,
			isEmpty: () => true,
			getModels: sessionType => sessionType ? state.targetedModels : [general],
			getAllModels: () => [general, ...state.targetedModels],
			requiresCustomModels: sessionType => sessionType === state.sessionType,
			getConfiguredModelValue: () => undefined,
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => applied.push(selected.identifier),
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));
		controller.applySelection(general, () => { }, false);

		state.sessionType = sessionType;
		controller.revalidateForSessionType(() => { });
		const modelWhileLoading = controller.currentModel.get()?.identifier;
		state.targetedModels = [targeted];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({ modelWhileLoading, applied, current: controller.currentModel.get()?.identifier }, {
			modelWhileLoading: undefined,
			applied: [targeted.identifier],
			current: targeted.identifier,
		});
	});

	test('initialize restores a remembered model after a non-empty initial catalog', () => {
		// The initial fallback remains provisional even when the catalog reports the remembered model unavailable.
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const remembered = model('test/remembered');
		let models = [fallback];
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier);
		const pendingAfterInit = controller.isAwaitingRememberedModel();
		models = [fallback, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterInit,
			pendingAfterLoad: controller.isAwaitingRememberedModel(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterInit: true,
			pendingAfterLoad: false,
			applied: [fallback.identifier, remembered.identifier],
			current: remembered.identifier,
		});
	});

	test('initialize does not arm a restore wait when there is nothing to wait for', () => {
		// Guard against over-arming: no remembered model, or a remembered model that is already
		// available, must not leave a catalog subscription armed.
		const build = (rememberedId: string | undefined, models: ILanguageModelChatMetadataAndIdentifier[]) => {
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
				subscribeToModelChanges: () => toDisposable(() => { }),
				getBoundConversationKey: () => 'chat:one',
				...createIntentStore(() => 'chat:one'),
				restoreModelConfiguration: () => { },
				applyModel: selected => {
					applied.push(selected.identifier);
				},
			};
			const controller = disposables.add(new ChatInputModelSelectionController(runtime));
			controller.initialize(rememberedId);
			return controller.hasPendingIntent();
		};
		const first = model('test/first');
		const remembered = model('test/remembered');

		assert.deepStrictEqual({
			noRememberedModel: build(undefined, [first]),
			rememberedAlreadyAvailable: build(remembered.identifier, [first, remembered]),
		}, {
			noRememberedModel: false,
			rememberedAlreadyAvailable: false,
		});
	});

	test('an explicit selection cancels the initialize restore wait', () => {
		// While the wait is armed, an explicit user pick must win permanently: the wait is cancelled
		// and a later appearance of the remembered model does not override the explicit selection.
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const explicit = model('test/explicit');
		const remembered = model('test/remembered');
		let models = [fallback, explicit];
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
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			...createIntentStore(() => 'chat:one'),
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier);
		const pendingAfterInit = controller.isAwaitingRememberedModel();
		controller.applySelection(explicit, () => applied.push(explicit.identifier), true, false);
		const pendingAfterExplicit = controller.isAwaitingRememberedModel();
		models = [fallback, explicit, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterInit,
			pendingAfterExplicit,
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterInit: true,
			pendingAfterExplicit: false,
			applied: [fallback.identifier, explicit.identifier],
			current: explicit.identifier,
		});
	});

	test('does not reclaim an explicit pick into a different conversation', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const first = model('test/first');
		const second = model('test/second');
		const state: IRuntimeState = { models: [first, second], sessionType: 'test', isEmpty: false };
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));

		// The user explicitly picks `second` in the conversation the input is bound to.
		controller.applySelection(second, () => { }, true, false);
		const afterPick = controller.currentModel.get()?.identifier;

		// The input rebinds to a different conversation, which lands on `first`. That
		// conversation carries no model of its own, so nothing re-remembers here.
		state.conversationKey = 'chat:two';
		controller.beginSessionSwitch(false, true, true);
		controller.applySelection(first, () => { }, false);
		controller.endSessionSwitch();
		const afterSwitch = controller.currentModel.get()?.identifier;

		// The agent host republishes its catalog, as it does periodically. The pick belongs
		// to the other conversation and must not be dragged into this one.
		modelChanges.fire('republished');

		assert.deepStrictEqual({
			afterPick,
			afterSwitch,
			current: controller.currentModel.get()?.identifier,
		}, {
			afterPick: second.identifier,
			afterSwitch: first.identifier,
			current: first.identifier,
		});
	});

	test('keeps reclaiming an explicit pick after an untitled conversation materializes', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const first = model('test/first');
		const second = model('test/second');
		const intents = new Map<string, IIntendedModelSelection | undefined>();
		const state: IRuntimeState = { models: [first, second], sessionType: 'test', conversationKey: 'chat:untitled', intents };
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));

		// The user picks `second` in an untitled conversation.
		controller.applySelection(second, () => { }, true, false);

		// The first send materializes it into a real session, which carries the untitled
		// conversation's intended model over to the real one (see `_materializeUntitledSession`).
		intents.set('chat:real', intents.get('chat:untitled'));
		state.conversationKey = 'chat:real';

		// Meanwhile the catalog momentarily drops the picked model, so a stand-in takes over.
		state.models = [first];
		modelChanges.fire('dropped');
		const whileMissing = controller.currentModel.get()?.identifier;

		// The catalog republishes the picked model.
		state.models = [first, second];
		modelChanges.fire('republished');

		assert.deepStrictEqual({
			whileMissing,
			current: controller.currentModel.get()?.identifier,
		}, {
			whileMissing: first.identifier,
			current: second.identifier,
		});
	});

	test('a conversation waiting for its own model is not reset by a pool rebind', () => {
		// `loadRemoteSession` seeds the conversation's model from request history as a bare id when
		// the catalog has not published it yet. Re-initializing from the profile preference (which
		// happens on every pool rebind) must not erase what the conversation is waiting for.
		const modelChanges = disposables.add(new Emitter<string>());
		const profilePreference = model('test/profile');
		const conversationModel = model('test/conversation');
		const intents = new Map<string | undefined, IIntendedModelSelection | undefined>();
		intents.set('chat:one', { modelId: conversationModel.identifier, reason: ModelSelectionReason.SessionRestore });
		const state: IRuntimeState = { models: [profilePreference], sessionType: 'test', isEmpty: false, intents };
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));

		controller.initialize(profilePreference.identifier);
		const whileUnpublished = controller.currentModel.get()?.identifier;

		state.models = [profilePreference, conversationModel];
		modelChanges.fire('published');

		assert.deepStrictEqual({
			whileUnpublished,
			current: controller.currentModel.get()?.identifier,
		}, {
			whileUnpublished: profilePreference.identifier,
			current: conversationModel.identifier,
		});
	});
});
