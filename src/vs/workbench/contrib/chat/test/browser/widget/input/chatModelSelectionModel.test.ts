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
	configuredModel?: string;
	/** Defaults to `true` (a new/empty session). Set to `false` to model a reopened conversation with history. */
	isEmpty?: boolean;
}

function createRuntime(
	state: IRuntimeState,
	modelChanges: Emitter<string>,
	applied: string[],
): IChatInputModelSelectionRuntime {
	return {
		location: ChatAgentLocation.Chat,
		getCurrentModeKind: () => ChatModeKind.Ask,
		getCurrentSessionType: () => state.sessionType,
		isEmpty: () => state.isEmpty ?? true,
		getModels: () => state.models,
		getAllModels: () => state.models,
		requiresCustomModels: () => false,
		getConfiguredModelValue: () => state.configuredModel,
		resolveModelIdentifier: identifier => resolveModelIdentifier(state.models, identifier, state.resolved),
		subscribeToModelChanges: listener => modelChanges.event(listener),
		getBoundConversationKey: () => 'chat:one',
		getVisibleConversationKey: () => 'chat:one',
		restoreModelConfiguration: () => { },
		applyModel: model => applied.push(model.identifier),
	};
}

suite('ChatInputModelSelectionController', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks explicit selection origin', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], resolved: true, sessionType: 'test' }, modelChanges, [])));
		const first = model('test/first');
		const second = model('test/second');

		controller.applyAutomaticSelection(first, () => { });
		const automatic = {
			current: controller.currentModel.get()?.identifier,
			explicit: controller.userExplicitlySelectedModel,
		};
		controller.applyExplicitSelection(second, () => { }, false);

		assert.deepStrictEqual({
			automatic,
			current: controller.currentModel.get()?.identifier,
			explicitAfterUserSelection: controller.userExplicitlySelectedModel,
		}, {
			automatic: { current: first.identifier, explicit: false },
			current: second.identifier,
			explicitAfterUserSelection: true,
		});
	});

	test('rolls back a failed explicit selection effect', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], resolved: true, sessionType: 'test' }, modelChanges, [])));
		const first = model('test/first');
		const second = model('test/second');
		controller.applyAutomaticSelection(first, () => { });

		assert.throws(() => controller.applyExplicitSelection(second, () => { throw new Error('rejected'); }, true), /rejected/);
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
			resolved: true,
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
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));
		controller.initialize(second.identifier, result => initialSelections.push(result.kind));
		const pending = controller.hasPendingIntent();
		models = [first, second];
		catalogResolved = true;
		modelChanges.fire('test');

		assert.deepStrictEqual({
			initialSelections,
			pending,
			pendingAfterResolve: controller.hasPendingIntent(),
			applied,
		}, {
			initialSelections: ['pending'],
			pending: true,
			pendingAfterResolve: false,
			applied: [first.identifier, second.identifier],
		});
	});

	test('explicit selection cancels an eventual remembered-model restore', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const explicit = model('test/explicit');
		const remembered = model('test/remembered');
		const state: IRuntimeState = { models: [fallback, explicit], resolved: true, sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier, () => { });
		controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
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
		const state: IRuntimeState = { models: [fallback, programmatic], resolved: true, sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier, () => { });
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
		const state: IRuntimeState = { models: [], resolved: false, sessionType: 'local' };
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
		const state: IRuntimeState = { models: [explicit], resolved: false, sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		const result = controller.requestProgrammaticSelection(
			() => state.models.find(model => model.identifier === requested.identifier),
			'chat:one',
		);
		controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
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
		const state: IRuntimeState = { models: [], resolved: false, sessionType: 'local' };
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

	test('location default improves the fallback and settles conclusively absent remembered intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const remembered = model('test/remembered');
		const defaultBase = model('test/default');
		const locationDefault = {
			...defaultBase,
			metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
		};
		const state: IRuntimeState = { models: [fallback], resolved: true, sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier, () => { });
		state.models = [fallback, locationDefault];
		controller.reconcileModelListChange(state.models);
		const pendingAfterDefault = controller.hasPendingIntent();
		state.models = [fallback, locationDefault, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterDefault,
			pendingAfterLoad: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterDefault: false,
			pendingAfterLoad: false,
			applied: [fallback.identifier, locationDefault.identifier],
			current: locationDefault.identifier,
		});
	});

	test('repairs a removed fallback and settles conclusively absent remembered intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const replacement = model('test/replacement');
		const remembered = model('test/remembered');
		const state: IRuntimeState = { models: [fallback], resolved: true, sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier, () => { });
		state.models = [replacement];
		modelChanges.fire('fallback-removed');
		const pendingAfterRepair = controller.hasPendingIntent();
		state.models = [replacement, remembered];
		modelChanges.fire('remembered-loaded');

		assert.deepStrictEqual({
			pendingAfterRepair,
			pendingAfterLoad: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterRepair: false,
			pendingAfterLoad: false,
			applied: [fallback.identifier, replacement.identifier],
			current: replacement.identifier,
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined, () => { });
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
			resolved: false,
			sessionType: 'local',
			configuredModel: configured.metadata.id,
		};
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(remembered.identifier, () => { });
		state.models = [fallback, configured, remembered];
		state.resolved = true;
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
		const state: IRuntimeState = { models: [fallback], resolved: true, sessionType: 'local' };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.initialize(undefined, () => { });
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined, () => { });
		controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
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
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier, () => { });
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [fallback, restored, remembered];
		catalogResolved = true;
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined, () => { });
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [restored, configured];
		controller.reconcileModelListChange(models);

		assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
			applied: [restored.identifier],
			current: restored.identifier,
		});
	});

	test('conversation restore cancels older history intent', () => {
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
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.preselectFromHistory(history.identifier, 'chat:one');
		controller.syncFromConversationState(restored, undefined, undefined, 'chat:one');
		models = [restored, history];
		modelChanges.fire('test');

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
				resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
				subscribeToModelChanges: () => toDisposable(() => { }),
				getBoundConversationKey: () => 'chat:one',
				getVisibleConversationKey: () => 'chat:one',
				restoreModelConfiguration: () => { },
				applyModel: selected => {
					applied.push(selected.identifier);
				},
			};
			disposables.add(new ChatInputModelSelectionController(runtime)).initialize(rememberedModel, () => { });
			return applied[0];
		};

		assert.deepStrictEqual([
			run(locationDefault.metadata.id, remembered.identifier, [first, remembered, locationDefault]),
			run(undefined, remembered.identifier, [first, remembered, locationDefault]),
			run(undefined, undefined, [first, locationDefault]),
			run(undefined, undefined, [first]),
		], [locationDefault.identifier, remembered.identifier, locationDefault.identifier, first.identifier]);
	});

	test('applies fallback and configured defaults through the automatic path', () => {
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
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.ensureCurrentModelSupported();
		configuration.model = second.metadata.id;
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied }, {
			configuredApplied: true,
			applied: [first.identifier, second.identifier],
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
			createRuntime({ models: [gpt, opus], resolved: true, sessionType: 'test', configuredModel: gpt.metadata.id }, modelChanges, applied)));

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

	test('preserves an explicit user pick on an empty session over the configured default', () => {
		const gpt = model('test/gpt');
		const opus = model('test/opus');
		const modelChanges = disposables.add(new Emitter<string>());
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(
			createRuntime({ models: [gpt, opus], resolved: true, sessionType: 'test', configuredModel: gpt.metadata.id }, modelChanges, applied)));

		controller.beginSessionSwitch(true, false, false);
		controller.applyExplicitSelection(opus, () => applied.push(opus.identifier), false);
		const configuredApplied = controller.applyConfiguredDefault();

		assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier, userPicked: controller.userExplicitlySelectedModel }, {
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
			resolveModelIdentifier: identifier => resolveModelIdentifier([gpt, opus], identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
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
			createRuntime({ models: [gpt, opus], resolved: true, sessionType: 'test' }, modelChanges, applied)));

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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(undefined, () => { });
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
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		const draft = controller.resolveDraftModel(general, sessionType, true);
		models = [];
		controller.syncFromConversationState(desired, { effort: 'high' }, sessionType, 'chat:one');
		const pending = controller.hasPendingIntent();
		models = [fallback, desired];
		resolved = true;
		modelChanges.fire('test');

		assert.deepStrictEqual({
			draft: { model: draft.model?.identifier, changed: draft.changed },
			pending,
			pendingAfterResolve: controller.hasPendingIntent(),
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
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.syncFromConversationState(desired, { effort: 'high' }, sessionType, 'chat:one');
		const pending = controller.hasPendingIntent();
		// An intermediate empty re-resolution must not end the wait or apply a default.
		modelChanges.fire('still-empty');
		const stillPendingAfterEmpty = controller.hasPendingIntent();
		const appliedAfterEmpty = [...applied];
		// The real models finally arrive.
		models = [desired];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pending,
			stillPendingAfterEmpty,
			appliedAfterEmpty,
			pendingAfterLoad: controller.hasPendingIntent(),
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

	test('initialize settles remembered intent after a conclusively empty catalog update', () => {
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier, () => { });
		const pendingAfterInit = controller.hasPendingIntent();
		const appliedAfterInit = [...applied];
		// An intermediate empty re-resolution must not end the wait or apply a default.
		modelChanges.fire('still-empty');
		const pendingAfterEmpty = controller.hasPendingIntent();
		// The agent-host pool finally publishes its models.
		models = [remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterInit,
			appliedAfterInit,
			pendingAfterEmpty,
			pendingAfterLoad: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterInit: true,
			appliedAfterInit: [],
			pendingAfterEmpty: false,
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
		const state: IRuntimeState = { models: [], resolved: false, sessionType, configuredModel: configured.metadata.id, isEmpty: false };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.syncFromConversationState(desired, undefined, sessionType, 'chat:one');
		state.models = [match, configured];
		state.resolved = true;
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

	test('terminal restore fallback cancels obsolete session intent', () => {
		const modelChanges = disposables.add(new Emitter<string>());
		const sessionType = 'agent-host-test';
		const staleDesired = targetedModel('test/stale', sessionType);
		const fallback = targetedModel('test/fallback', sessionType);
		const inapplicable = model('test/inapplicable');
		const state: IRuntimeState = { models: [], resolved: false, sessionType };
		const applied: string[] = [];
		const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));

		controller.syncFromConversationState(staleDesired, undefined, sessionType, 'chat:one');
		state.models = [fallback];
		state.resolved = true;
		controller.syncFromConversationState(inapplicable, undefined, sessionType, 'chat:one');
		state.models = [fallback, staleDesired];
		modelChanges.fire('test');

		assert.deepStrictEqual({ pending: controller.hasPendingIntent(), applied }, {
			pending: false,
			applied: [fallback.identifier],
		});
	});

	test('does not apply a late history model after the visible conversation changes', () => {
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
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.preselectFromHistory(restored.identifier, 'chat:one');
		visibleConversation = 'chat:two';
		models = [restored];
		modelChanges.fire('test');

		assert.deepStrictEqual(applied, []);
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
			resolveModelIdentifier: identifier => resolveModelIdentifier([general, targeted], identifier, true),
			subscribeToModelChanges: () => toDisposable(() => { }),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));
		controller.applyAutomaticSelection(general, () => { });
		state.sessionType = 'agent-host-test';

		controller.revalidateForSessionType(() => { });

		assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
			applied: [targeted.identifier],
			current: targeted.identifier,
		});
	});

	test('initialize waits for a conclusively-absent remembered model and swaps it in when it appears', () => {
		// Grace-independent restore. With the simple (conclusive) resolver the remembered model is
		// `unavailable` at cold start, so `initialize` applies a provisional fallback. The refactor
		// watches the catalog from the provisional-fallback path too (not only the `pending` path),
		// so when the remembered model shows up on a later change it is swapped in — instead of being
		// lost. Reverting the `initialize` restructure (arming the wait only for `pending`) leaves no
		// wait armed here, so `pendingAfterInit` is false and the remembered model is never applied.
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier, () => { });
		const pendingAfterInit = controller.hasPendingIntent();
		models = [fallback, remembered];
		modelChanges.fire('loaded');

		assert.deepStrictEqual({
			pendingAfterInit,
			pendingAfterLoad: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterInit: true,
			pendingAfterLoad: false,
			applied: [fallback.identifier, remembered.identifier],
			current: remembered.identifier,
		});
	});

	test('initialize stops waiting when the pool loads without the remembered model', () => {
		// Termination guard: the wait must not linger. Once the remembered model is conclusively
		// absent (the pool loaded with other models but not it), settle on the already-applied
		// fallback and tear the subscription down — without re-applying the fallback.
		const modelChanges = disposables.add(new Emitter<string>());
		const fallback = model('test/fallback');
		const other = model('test/other');
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier, () => { });
		const pendingAfterInit = controller.hasPendingIntent();
		models = [fallback, other];
		modelChanges.fire('loaded-without-remembered');

		assert.deepStrictEqual({
			pendingAfterInit,
			pendingAfterLoad: controller.hasPendingIntent(),
			applied,
			current: controller.currentModel.get()?.identifier,
		}, {
			pendingAfterInit: true,
			pendingAfterLoad: false,
			applied: [fallback.identifier],
			current: fallback.identifier,
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
				resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
				subscribeToModelChanges: () => toDisposable(() => { }),
				getBoundConversationKey: () => 'chat:one',
				getVisibleConversationKey: () => 'chat:one',
				restoreModelConfiguration: () => { },
				applyModel: selected => {
					applied.push(selected.identifier);
				},
			};
			const controller = disposables.add(new ChatInputModelSelectionController(runtime));
			controller.initialize(rememberedId, () => { });
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
			resolveModelIdentifier: identifier => resolveModelIdentifier(models, identifier, true),
			subscribeToModelChanges: listener => modelChanges.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: selected => {
				applied.push(selected.identifier);
			},
		};
		const controller = disposables.add(new ChatInputModelSelectionController(runtime));

		controller.initialize(remembered.identifier, () => { });
		const pendingAfterInit = controller.hasPendingIntent();
		controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
		const pendingAfterExplicit = controller.hasPendingIntent();
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
});
