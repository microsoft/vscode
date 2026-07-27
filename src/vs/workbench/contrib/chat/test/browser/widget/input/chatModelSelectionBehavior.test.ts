/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { resolveModelIdentifier } from '../../../../common/modelSelection.js';
import { ChatInputModelSelectionController } from '../../../../browser/widget/input/chatInputModelSelectionController.js';

/**
 * Characterization tests for chat model selection.
 *
 * These describe the three user-facing rules in terms of what a user does and what they end up
 * on — never in terms of the controller's method names. Every interaction goes through
 * {@link ModelSelectionHarness}, so an API change is absorbed by that one class and these
 * scenarios keep proving the behavior is unchanged.
 *
 * The rules:
 *   1. A new (empty) conversation gets `chat.defaultModel` when that setting is set.
 *   2. Otherwise you get your remembered model — the last one you deliberately chose.
 *   3. When the remembered model is not selectable, a default stands in temporarily and the
 *      remembered one is reclaimed as soon as it can be offered again, unless a new deliberate
 *      choice replaced it meanwhile.
 */

interface IModelSpec {
	readonly id: string;
	/** Marks the model as the location default, i.e. what `findDefaultModel` prefers. */
	readonly isLocationDefault?: boolean;
	/** Omit to make the model unusable in agent mode. */
	readonly supportsAgentMode?: boolean;
	readonly sessionType?: string;
}

function buildModel(spec: IModelSpec): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: spec.id,
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: spec.id,
			name: spec.id,
			vendor: 'test',
			version: '1.0',
			family: spec.id,
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isDefaultForLocation: spec.isLocationDefault ? { [ChatAgentLocation.Chat]: true } : {},
			...(spec.sessionType ? { targetChatSessionType: spec.sessionType } : {}),
			capabilities: { toolCalling: !!spec.supportsAgentMode, agentMode: !!spec.supportsAgentMode },
		},
	};
}

interface IWorld {
	/** Models the catalog is currently publishing. */
	catalog: readonly IModelSpec[];
	sessionType?: string;
	mode?: ChatModeKind;
	/** A conversation with history, as opposed to a fresh one. */
	hasHistory?: boolean;
	/** The `chat.defaultModel` setting. */
	defaultModelSetting?: string;
	/** What persisted storage remembers from a previous session. */
	storedModel?: string;
}

/**
 * Drives the selection controller through user- and system-level events.
 *
 * This is the single seam between the scenarios below and the controller's API. When the API
 * changes, only the bodies of these methods change; every assertion in this file stays as-is,
 * which is what makes the scenarios usable as a rewrite safety net.
 */
class ModelSelectionHarness {

	private readonly _store = new DisposableStore();
	private readonly _catalogChanged = new Emitter<void>();
	private readonly _controller: ChatInputModelSelectionController;
	private _models: ILanguageModelChatMetadataAndIdentifier[];
	private _world: IWorld;

	constructor(world: IWorld) {
		this._world = world;
		this._models = world.catalog.map(buildModel);
		this._controller = this._store.add(new ChatInputModelSelectionController({
			location: ChatAgentLocation.Chat,
			getCurrentModeKind: () => this._world.mode ?? ChatModeKind.Ask,
			getCurrentSessionType: () => this._world.sessionType,
			isEmpty: () => !this._world.hasHistory,
			// A targeted pool is filtered by session only; the general pool is also filtered by
			// mode. This mirrors `filterModelsForSession` and is what makes mode-invalid models
			// reachable in targeted pools.
			getModels: sessionType => sessionType
				? this._models.filter(model => model.metadata.targetChatSessionType === sessionType)
				: this._models.filter(model => !model.metadata.targetChatSessionType),
			getAllModels: () => this._models,
			requiresCustomModels: () => false,
			getConfiguredModelValue: () => this._world.defaultModelSetting,
			resolveModelIdentifier: identifier => resolveModelIdentifier(this._models, identifier, true),
			subscribeToModelChanges: listener => this._catalogChanged.event(listener),
			getBoundConversationKey: () => 'chat:one',
			getVisibleConversationKey: () => 'chat:one',
			restoreModelConfiguration: () => { },
			applyModel: () => { },
		}));
		this._store.add(this._catalogChanged);
	}

	dispose(): void {
		this._store.dispose();
	}

	/** The user opens the input; persisted state is loaded. */
	open(): this {
		this._controller.initialize(this._world.storedModel, () => { });
		return this;
	}

	/** The user picks a model from the picker. */
	pick(id: string): this {
		this._controller.select(this._find(id), 'user', { effect: () => { }, rollbackOnError: false });
		return this;
	}

	/** The user invokes "reset to default". */
	resetToDefault(): this {
		this._controller.resetToDefault();
		return this;
	}

	/** The catalog republishes a different set of models, e.g. an agent host restarting. */
	publishes(catalog: readonly IModelSpec[]): this {
		this._models = catalog.map(buildModel);
		this._catalogChanged.fire();
		return this;
	}

	/** The user switches chat mode, which re-validates the current model. */
	switchMode(mode: ChatModeKind): this {
		this._world = { ...this._world, mode };
		this._controller.ensureCurrentModelSupported();
		return this;
	}

	/** The `chat.defaultModel` setting changes, or arrives late from policy. */
	setDefaultModelSetting(value: string | undefined): this {
		this._world = { ...this._world, defaultModelSetting: value };
		this._controller.applyConfiguredDefault();
		return this;
	}

	/** The model the user is currently on, or `undefined` when nothing is selected. */
	get selected(): string | undefined {
		return this._controller.currentModel.get()?.identifier;
	}

	/** Whether the shown selection is provisional and expected to change. */
	get isProvisional(): boolean {
		return this._controller.isAwaitingModel();
	}

	private _find(id: string): ILanguageModelChatMetadataAndIdentifier {
		const found = this._models.find(model => model.identifier === id);
		assert.ok(found, `model ${id} is not in the catalog`);
		return found;
	}
}

suite('Chat model selection behavior', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function harness(world: IWorld): ModelSelectionHarness {
		const created = new ModelSelectionHarness(world);
		disposables.add({ dispose: () => created.dispose() });
		return created;
	}

	const fast = { id: 'fast', supportsAgentMode: true };
	const smart = { id: 'smart', supportsAgentMode: true };
	const house = { id: 'house', isLocationDefault: true, supportsAgentMode: true };

	suite('rule 1 — a new conversation honors chat.defaultModel', () => {

		test('a fresh conversation opens on the configured model', () => {
			const chat = harness({ catalog: [fast, smart, house], defaultModelSetting: 'smart' }).open();
			assert.strictEqual(chat.selected, 'smart');
		});

		test('without the setting a fresh conversation opens on the location default', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open();
			assert.strictEqual(chat.selected, 'house');
		});

		test('the setting does not disturb a conversation that already has history', () => {
			const chat = harness({
				catalog: [fast, smart, house],
				hasHistory: true,
				storedModel: 'fast',
				defaultModelSetting: 'smart',
			}).open();
			assert.strictEqual(chat.selected, 'fast');
		});

		test('the setting applies when it arrives after the input was opened', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open();
			const beforeSetting = chat.selected;
			chat.setDefaultModelSetting('smart');
			assert.deepStrictEqual([beforeSetting, chat.selected], ['house', 'smart']);
		});

		test('a deliberate pick outranks the setting arriving later', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.setDefaultModelSetting('smart');
			assert.strictEqual(chat.selected, 'fast');
		});
	});

	suite('rule 2 — otherwise you get your remembered model', () => {

		test('a stored model is restored when the input opens', () => {
			const chat = harness({ catalog: [fast, smart, house], storedModel: 'fast' }).open();
			assert.strictEqual(chat.selected, 'fast');
		});

		test('a pick survives unrelated catalog updates', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.publishes([fast, smart, house]);
			assert.strictEqual(chat.selected, 'fast');
		});

		test('the most recent pick is the one remembered', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast').pick('smart');
			chat.publishes([house]).publishes([fast, smart, house]);
			assert.strictEqual(chat.selected, 'smart');
		});
	});

	suite('rule 3 — an unavailable model is stood in for, then reclaimed', () => {

		test('a pick that disappears is reclaimed when it returns', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.publishes([smart, house]);
			const whileGone = chat.selected;
			chat.publishes([fast, smart, house]);
			assert.deepStrictEqual([whileGone, chat.selected], ['house', 'fast']);
		});

		test('the stand-in is flagged as provisional while the pick is gone', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.publishes([smart, house]);
			const whileGone = chat.isProvisional;
			chat.publishes([fast, smart, house]);
			assert.deepStrictEqual([whileGone, chat.isProvisional], [true, false]);
		});

		test('a new pick made during the outage replaces what is reclaimed', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.publishes([smart, house]);
			chat.pick('smart');
			chat.publishes([fast, smart, house]);
			assert.strictEqual(chat.selected, 'smart');
		});

		test('a deliberate reset during the outage is not undone', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.publishes([smart, house]);
			chat.resetToDefault();
			chat.publishes([fast, smart, house]);
			assert.strictEqual(chat.selected, 'house');
		});

		test('a stored model absent at open is claimed once it is published', () => {
			const chat = harness({ catalog: [smart, house], storedModel: 'fast' }).open();
			const atOpen = chat.selected;
			chat.publishes([fast, smart, house]);
			assert.deepStrictEqual([atOpen, chat.selected], ['house', 'fast']);
		});

		test('repeated outages each reclaim the pick', () => {
			const chat = harness({ catalog: [fast, smart, house] }).open().pick('fast');
			chat.publishes([house]);
			const firstOutage = chat.selected;
			chat.publishes([fast, house]);
			const firstRecovery = chat.selected;
			chat.publishes([house]);
			chat.publishes([fast, house]);
			assert.deepStrictEqual(
				[firstOutage, firstRecovery, chat.selected],
				['house', 'fast', 'fast']);
		});
	});

	suite('mode changes', () => {

		// Targeted session pools are filtered by session type only, so they can offer models the
		// current mode cannot use. Agent mode requires tool calling.
		const askOnly = { id: 'ask-only', sessionType: 'agent-host' };
		const agentReady = { id: 'agent-ready', sessionType: 'agent-host', supportsAgentMode: true };

		test('switching to a mode the model cannot serve moves off it', () => {
			const chat = harness({ catalog: [askOnly, agentReady], sessionType: 'agent-host' })
				.open()
				.pick('ask-only');
			chat.switchMode(ChatModeKind.Agent);
			assert.strictEqual(chat.selected, 'agent-ready');
		});

		test('a model the mode cannot serve is not reclaimed', () => {
			const chat = harness({ catalog: [askOnly, agentReady], sessionType: 'agent-host' })
				.open()
				.pick('ask-only');
			chat.switchMode(ChatModeKind.Agent);
			chat.publishes([askOnly, agentReady]);
			assert.strictEqual(chat.selected, 'agent-ready');
		});

		test('a configured model the mode cannot serve is not applied', () => {
			const chat = harness({
				catalog: [askOnly, agentReady],
				sessionType: 'agent-host',
				mode: ChatModeKind.Agent,
				defaultModelSetting: 'ask-only',
			}).open();
			chat.publishes([askOnly, agentReady]);
			assert.strictEqual(chat.selected, 'agent-ready');
		});
	});

	suite('an empty catalog', () => {

		test('nothing is selected until the catalog publishes', () => {
			const chat = harness({ catalog: [], storedModel: 'fast' }).open();
			const whileEmpty = chat.selected;
			chat.publishes([fast, house]);
			assert.deepStrictEqual([whileEmpty, chat.selected], [undefined, 'fast']);
		});
	});
});
