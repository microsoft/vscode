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
import { mock } from '../../../../../base/test/common/mock.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IMcpService, IMcpServer } from '../../../mcp/common/mcpTypes.js';
import { URI } from '../../../../../base/common/uri.js';

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

/**
 * Creates mock services for testing.
 */
function createMockServices(options: {
	hasInstructionsFile?: boolean;
	hasPromptsFolder?: boolean;
	hasAgentsFolder?: boolean;
	hasMcpServers?: boolean;
	hasWorkspace?: boolean;
} = {}) {
	const {
		hasInstructionsFile = true,
		hasPromptsFolder = true,
		hasAgentsFolder = true,
		hasMcpServers = true,
		hasWorkspace = true,
	} = options;

	const mockFileService = new class extends mock<IFileService>() {
		override async exists(resource: URI): Promise<boolean> {
			const path = resource.path;
			if (path.endsWith('copilot-instructions.md')) {
				return hasInstructionsFile;
			}
			if (path.endsWith('/prompts')) {
				return hasPromptsFolder;
			}
			if (path.endsWith('/agents')) {
				return hasAgentsFolder;
			}
			return false;
		}
		override async resolve(resource: URI): Promise<any> {
			return {
				children: hasPromptsFolder || hasAgentsFolder ? [{ name: 'test.txt' }] : []
			};
		}
	}();

	const mockWorkspaceFolder: IWorkspaceFolder = {
		uri: URI.file('/test/workspace'),
		name: 'test',
		index: 0,
		toResource: (relativePath: string) => URI.file(`/test/workspace/${relativePath}`)
	};

	const mockWorkspace: IWorkspace = {
		id: 'test-workspace',
		folders: hasWorkspace ? [mockWorkspaceFolder] : [],
	};

	const mockWorkspaceContextService = new class extends mock<IWorkspaceContextService>() {
		override getWorkspace(): IWorkspace {
			return mockWorkspace;
		}
	}();

	const mockMcpService = new class extends mock<IMcpService>() {
		override readonly servers = observableValue<readonly IMcpServer[]>('servers', hasMcpServers ? [{ id: 'test-server' } as any] : []);
	}();

	return { mockFileService, mockWorkspaceContextService, mockMcpService };
}

suite('ChatProcessingTipsService', () => {
	let store: DisposableStore;
	let service: ChatProcessingTipsService;

	setup(() => {
		store = new DisposableStore();
		const { mockFileService, mockWorkspaceContextService, mockMcpService } = createMockServices();
		service = store.add(new ChatProcessingTipsService(
			mockFileService as IFileService,
			mockWorkspaceContextService as IWorkspaceContextService,
			mockMcpService as IMcpService
		));
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('startTips shows tip for Agent mode', async () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should have shown at least one tip
		assert.ok(widget.placeholders.length >= 1);

		service.stopTips();
	});

	test('startTips shows tip for Edit mode', async () => {
		const widget = new MockChatWidget(ChatMode.Edit, undefined);
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should have shown at least one tip
		assert.ok(widget.placeholders.length >= 1);

		service.stopTips();
	});

	test('startTips shows tip for Ask mode', async () => {
		const widget = new MockChatWidget(ChatMode.Ask, undefined);
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should have shown at least one tip
		assert.ok(widget.placeholders.length >= 1);

		service.stopTips();
	});

	test('stopTips resets placeholder', async () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		assert.strictEqual(widget.wasPlaceholderReset, false);

		service.stopTips();
		assert.strictEqual(widget.wasPlaceholderReset, true);
	});

	test('stopTips clears state', async () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		service.stopTips();

		// Starting tips again should work correctly
		widget.clearTracking();
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		assert.ok(widget.placeholders.length >= 1);

		service.stopTips();
	});

	test('shows customization tips when files are missing', async () => {
		const { mockFileService, mockWorkspaceContextService, mockMcpService } = createMockServices({
			hasInstructionsFile: false,
			hasPromptsFolder: false,
			hasAgentsFolder: false,
			hasMcpServers: false,
		});

		const customService = store.add(new ChatProcessingTipsService(
			mockFileService as IFileService,
			mockWorkspaceContextService as IWorkspaceContextService,
			mockMcpService as IMcpService
		));

		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		customService.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should show tips (mode tips + customization tips)
		assert.ok(widget.placeholders.length >= 1);

		customService.stopTips();
	});

	test('calling startTips twice clears previous tips', async () => {
		const widget = new MockChatWidget(ChatMode.Agent, undefined);
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		const firstCount = widget.placeholders.length;
		assert.ok(firstCount >= 1);

		// Call again
		service.startTips(widget as any);

		// Wait for async tip building
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should have reset and shown new tip
		assert.ok(widget.wasPlaceholderReset);
		assert.ok(widget.placeholders.length > firstCount);

		service.stopTips();
	});

	test('calling stopTips without startTips does not throw', () => {
		// Should not throw
		service.stopTips();
	});
});
