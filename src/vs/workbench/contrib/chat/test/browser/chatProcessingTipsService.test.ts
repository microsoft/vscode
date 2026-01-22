/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatProcessingTipsService } from '../../browser/chatProcessingTipsService.js';
import { ChatMode, IChatMode } from '../../common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';

/**
 * Mock ChatInputPart for testing the processing tips service.
 */
class MockChatInputPart {
	private _selectedLanguageModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	private _currentModeObs: IObservable<IChatMode>;

	constructor(
		mode: IChatMode = ChatMode.Agent,
		modelIdentifier?: string
	) {
		this._currentModeObs = observableValue<IChatMode>('currentMode', mode);
		if (modelIdentifier) {
			this._selectedLanguageModel = {
				identifier: modelIdentifier,
				metadata: {
					id: modelIdentifier,
					vendor: 'test',
					name: modelIdentifier,
					family: 'test',
					version: '1.0',
					maxInputTokens: 0,
					maxOutputTokens: 0,
				} as any
			};
		}
	}

	get selectedLanguageModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedLanguageModel;
	}

	get currentModeObs(): IObservable<IChatMode> {
		return this._currentModeObs;
	}
}

/**
 * Mock ChatWidget that tracks placeholder changes.
 */
class MockChatWidget {
	private _placeholders: string[] = [];
	private _placeholderReset = false;

	readonly input: MockChatInputPart;

	constructor(
		mode: IChatMode = ChatMode.Agent,
		modelIdentifier?: string
	) {
		this.input = new MockChatInputPart(mode, modelIdentifier);
	}

	setInputPlaceholder(placeholder: string): void {
		this._placeholders.push(placeholder);
	}

	resetInputPlaceholder(): void {
		this._placeholderReset = true;
	}

	get placeholders(): string[] {
		return this._placeholders;
	}

	get wasPlaceholderReset(): boolean {
		return this._placeholderReset;
	}

	clearTracking(): void {
		this._placeholders = [];
		this._placeholderReset = false;
	}
}

suite('ChatProcessingTipsService', () => {
	let store: DisposableStore;
	let service: ChatProcessingTipsService;

	setup(() => {
		store = new DisposableStore();
		service = store.add(new ChatProcessingTipsService());
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('startTips shows first tip immediately for Agent mode', () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);

		// Should have shown at least one tip
		assert.strictEqual(widget.placeholders.length, 1);
		// The tip should be one of the Agent tips
		const knownAgentTips = [
			'Copilot can run terminal commands',
			'Try asking Copilot to run your tests',
			'Copilot can commit changes'
		];
		assert.ok(knownAgentTips.includes(widget.placeholders[0]));

		service.stopTips();
	});

	test('startTips shows first tip immediately for Edit mode', () => {
		const widget = new MockChatWidget(ChatMode.Edit, undefined);
		service.startTips(widget as any);

		// Should have shown at least one tip
		assert.strictEqual(widget.placeholders.length, 1);
		// The tip should be one of the Edit tips
		const knownEditTips = [
			'Use #codebase to find files automatically',
			'Reference specific files with #file'
		];
		assert.ok(knownEditTips.includes(widget.placeholders[0]));

		service.stopTips();
	});

	test('startTips shows first tip immediately for Ask mode', () => {
		const widget = new MockChatWidget(ChatMode.Ask, undefined);
		service.startTips(widget as any);

		// Should have shown at least one tip
		assert.strictEqual(widget.placeholders.length, 1);
		// The tip should be one of the Ask tips
		const knownAskTips = [
			'Ask about code in your workspace',
			'Try @workspace for project-wide questions'
		];
		assert.ok(knownAskTips.includes(widget.placeholders[0]));

		service.stopTips();
	});

	test('stopTips resets placeholder', () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);
		assert.strictEqual(widget.wasPlaceholderReset, false);

		service.stopTips();
		assert.strictEqual(widget.wasPlaceholderReset, true);
	});

	test('stopTips clears state', () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);
		service.stopTips();

		// Starting tips again should work correctly
		widget.clearTracking();
		service.startTips(widget as any);
		assert.strictEqual(widget.placeholders.length, 1);

		service.stopTips();
	});

	test('includes model upgrade tip for gpt-4o Copilot model', () => {
		const widget = new MockChatWidget(ChatMode.Agent, 'copilot/gpt-4o');
		service.startTips(widget as any);

		// Should have shown at least one tip
		assert.strictEqual(widget.placeholders.length, 1);

		// Stop to clear
		service.stopTips();
	});

	test('does not include model upgrade tip for BYOK model', () => {
		// Using a BYOK model (doesn't start with "copilot/")
		const widget = new MockChatWidget(ChatMode.Agent, 'anthropic/claude-3');
		service.startTips(widget as any);

		// Should have shown at least one tip (mode tips only)
		assert.strictEqual(widget.placeholders.length, 1);
		// The tip should only be a mode tip, not a model upgrade tip
		const knownAgentTips = [
			'Copilot can run terminal commands',
			'Try asking Copilot to run your tests',
			'Copilot can commit changes'
		];
		assert.ok(knownAgentTips.includes(widget.placeholders[0]));

		service.stopTips();
	});

	test('calling startTips twice clears previous tips', () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);
		assert.strictEqual(widget.placeholders.length, 1);

		// Call again
		service.startTips(widget as any);
		// Should have reset and shown new tip
		assert.ok(widget.wasPlaceholderReset);
		assert.strictEqual(widget.placeholders.length, 2); // first one + new one after reset

		service.stopTips();
	});

	test('calling stopTips without startTips does not throw', () => {
		// Should not throw
		service.stopTips();
	});
});
