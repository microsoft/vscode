/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ChatContextUsageWidget, resolveContextWindowInputTokens } from '../../../../browser/widgetHosts/viewPane/chatContextUsageWidget.js';
import { IChatUsage } from '../../../../common/chatService/chatService.js';
import { ILanguageModelChatMetadata, ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IChatRequestModel, IChatResponseModel } from '../../../../common/model/chatModel.js';

const FULL_WINDOW = 1_000_000;
const DEFAULT_TIER = 200_000;

const schemaWithContextSize: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
		contextSize: { type: 'number', default: DEFAULT_TIER },
	}
};

// A model that exposes no context-size picker (e.g. no tiered pricing).
const schemaWithoutContextSize: ILanguageModelConfigurationSchema = {
	properties: {
		thinkingEffort: { enum: ['low', 'medium', 'high'], default: 'medium' },
	}
};

suite('resolveContextWindowInputTokens', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses an explicit configured contextSize over everything else', () => {
		assert.strictEqual(
			resolveContextWindowInputTokens({ contextSize: 500_000 }, schemaWithContextSize, FULL_WINDOW),
			500_000,
		);
	});

	test('falls back to the schema default tier when contextSize is absent (regression for #320393)', () => {
		// The exact bug: a resolved configuration missing `contextSize` must NOT
		// make the gauge jump to the model's full native window. It must match the
		// default tier the request uses.
		assert.strictEqual(
			resolveContextWindowInputTokens({ thinkingEffort: 'high' }, schemaWithContextSize, FULL_WINDOW),
			DEFAULT_TIER,
		);
		assert.strictEqual(
			resolveContextWindowInputTokens(undefined, schemaWithContextSize, FULL_WINDOW),
			DEFAULT_TIER,
		);
	});

	test('ignores a non-numeric configured contextSize and uses the schema default', () => {
		assert.strictEqual(
			resolveContextWindowInputTokens({ contextSize: 'big' }, schemaWithContextSize, FULL_WINDOW),
			DEFAULT_TIER,
		);
	});

	test('falls through to the full window when the schema has no contextSize default', () => {
		// Models without a context-size picker have no schema default, so default
		// and max are the same value and the full window is correct.
		assert.strictEqual(
			resolveContextWindowInputTokens({ thinkingEffort: 'high' }, schemaWithoutContextSize, FULL_WINDOW),
			FULL_WINDOW,
		);
		assert.strictEqual(
			resolveContextWindowInputTokens(undefined, undefined, FULL_WINDOW),
			FULL_WINDOW,
		);
	});

	test('returns undefined when neither a configured value, schema default, nor max window is available', () => {
		assert.strictEqual(resolveContextWindowInputTokens(undefined, undefined, undefined), undefined);
	});
});

suite('ChatContextUsageWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const AUTO_MODEL = 'vendor:auto';
	const CONCRETE_MODEL = 'vendor:gpt';

	// Mirrors the Agent Host scenario where the synthetic "auto" model advertises
	// a zero-sized context window (it routes to a concrete model) while the
	// concrete model exposes a real window. See issue #321781.
	const models: Record<string, Partial<ILanguageModelChatMetadata>> = {
		[AUTO_MODEL]: { maxInputTokens: 0, maxOutputTokens: 0 },
		[CONCRETE_MODEL]: { maxInputTokens: 100_000, maxOutputTokens: 8_000 },
	};

	function createLanguageModelsService(): ILanguageModelsService {
		return {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: (id: string) => models[id] as ILanguageModelChatMetadata | undefined,
			getModelConfiguration: (_id: string) => undefined,
		} as unknown as ILanguageModelsService;
	}

	function createWidget(): ChatContextUsageWidget {
		const hoverService = {
			setupDelayedHover: () => Disposable.None,
			showInstantHover: () => { },
		} as unknown as IHoverService;
		const instantiationService = {} as unknown as IInstantiationService;
		return store.add(new ChatContextUsageWidget(
			hoverService,
			instantiationService,
			createLanguageModelsService(),
			new MockContextKeyService(),
			store.add(new InMemoryStorageService()),
			new TestConfigurationService(),
		));
	}

	function createRequest(modelId: string, usage: IChatUsage | undefined): IChatRequestModel {
		const response = { usage, onDidChange: Event.None } as unknown as IChatResponseModel;
		return { modelId, response } as unknown as IChatRequestModel;
	}

	function usage(actualModelId?: string): IChatUsage {
		return { kind: 'usage', promptTokens: 50_000, completionTokens: 4_000, actualModelId };
	}

	test('falls back to the actual model window when "auto" is selected (regression for #321781)', () => {
		const widget = createWidget();
		// User has "auto" selected; "auto" has no window of its own but the
		// response reports the concrete model that actually served the request.
		widget.setSelectedModel(AUTO_MODEL);
		widget.update(createRequest(AUTO_MODEL, usage(CONCRETE_MODEL)));

		assert.strictEqual(widget.isVisible.get(), true);
		// 54,000 used / (100,000 + 8,000) window === 50%, proving the concrete
		// model's window was used as the denominator rather than "auto"'s zero.
		assert.strictEqual(widget.domNode.querySelector('.percentage-label')?.textContent, '50%');
	});

	test('stays hidden for "auto" when there is no actual model to fall back to', () => {
		const widget = createWidget();
		widget.setSelectedModel(AUTO_MODEL);
		widget.update(createRequest(AUTO_MODEL, usage(undefined)));

		assert.strictEqual(widget.isVisible.get(), false);
	});

	test('uses the selected concrete model window directly', () => {
		const widget = createWidget();
		widget.setSelectedModel(CONCRETE_MODEL);
		widget.update(createRequest(CONCRETE_MODEL, usage(undefined)));

		assert.strictEqual(widget.isVisible.get(), true);
		assert.strictEqual(widget.domNode.querySelector('.percentage-label')?.textContent, '50%');
	});
});
