/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Location } from '../../../../../../editor/common/languages.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ChatResponseAccessibleView, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, getToolSpecificDataDescription, getResultDetailsDescription, getToolInvocationA11yDescription } from '../../../browser/accessibility/chatResponseAccessibleView.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatExtensionsContent, IChatPullRequestContent, IChatSubagentToolInvocationData, IChatTerminalToolInvocationData, IChatTodoListContent, IChatToolInputInvocationData, IChatToolResourcesInvocationData } from '../../../common/chatService/chatService.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';

suite('ChatResponseAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('getToolSpecificDataDescription', () => {
		test('returns empty string for undefined', () => {
			assert.strictEqual(getToolSpecificDataDescription(undefined), '');
		});

		test('returns command line for terminal data', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: {
					original: 'npm install',
					toolEdited: 'npm ci',
					userEdited: 'npm install --save-dev'
				},
				language: 'bash'
			};
			// Should prefer userEdited over toolEdited over original
			assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm install --save-dev');
		});

		test('returns tool edited command for terminal data without user edit', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: {
					original: 'npm install',
					toolEdited: 'npm ci'
				},
				language: 'bash'
			};
			assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm ci');
		});

		test('returns original command for terminal data without edits', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: {
					original: 'npm install'
				},
				language: 'bash'
			};
			assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm install');
		});

		test('returns description for subagent data', () => {
			const subagentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				agentName: 'TestAgent',
				description: 'Running analysis',
				prompt: 'Analyze the code'
			};
			const result = getToolSpecificDataDescription(subagentData);
			assert.ok(result.includes('TestAgent'));
			assert.ok(result.includes('Running analysis'));
			assert.ok(result.includes('Analyze the code'));
		});

		test('handles subagent with only description', () => {
			const subagentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				description: 'Running analysis'
			};
			const result = getToolSpecificDataDescription(subagentData);
			assert.strictEqual(result, 'Running analysis');
		});

		test('returns extensions list for extensions data', () => {
			const extensionsData: IChatExtensionsContent = {
				kind: 'extensions',
				extensions: ['eslint', 'prettier', 'typescript']
			};
			const result = getToolSpecificDataDescription(extensionsData);
			assert.ok(result.includes('eslint'));
			assert.ok(result.includes('prettier'));
			assert.ok(result.includes('typescript'));
		});

		test('returns empty for empty extensions array', () => {
			const extensionsData: IChatExtensionsContent = {
				kind: 'extensions',
				extensions: []
			};
			assert.strictEqual(getToolSpecificDataDescription(extensionsData), '');
		});

		test('returns todo list description for todoList data', () => {
			const todoData: IChatTodoListContent = {
				kind: 'todoList',
				todoList: [
					{ id: '1', title: 'Task 1', status: 'in-progress' },
					{ id: '2', title: 'Task 2', status: 'completed' }
				]
			};
			const result = getToolSpecificDataDescription(todoData);
			assert.ok(result.includes('2 items'));
			assert.ok(result.includes('Task 1'));
			assert.ok(result.includes('in-progress'));
			assert.ok(result.includes('Task 2'));
			assert.ok(result.includes('completed'));
		});

		test('returns empty for empty todo list', () => {
			const todoData: IChatTodoListContent = {
				kind: 'todoList',
				todoList: []
			};
			assert.strictEqual(getToolSpecificDataDescription(todoData), '');
		});

		test('returns PR info for pullRequest data', () => {
			const prData: IChatPullRequestContent = {
				kind: 'pullRequest',
				uri: URI.file('/test'),
				command: { id: 'vscode.open', title: 'Open Pull Request', arguments: [URI.file('/test')] },
				title: 'Add new feature',
				description: 'This PR adds a great feature',
				author: 'testuser',
				linkTag: '#123'
			};
			const result = getToolSpecificDataDescription(prData);
			assert.ok(result.includes('Add new feature'));
			assert.ok(result.includes('testuser'));
		});

		test('returns raw input for input data (string)', () => {
			const inputData: IChatToolInputInvocationData = {
				kind: 'input',
				rawInput: 'some input string'
			};
			assert.strictEqual(getToolSpecificDataDescription(inputData), 'some input string');
		});

		test('returns JSON stringified for input data (object)', () => {
			const inputData: IChatToolInputInvocationData = {
				kind: 'input',
				rawInput: { key: 'value', nested: { data: 123 } }
			};
			const result = getToolSpecificDataDescription(inputData);
			assert.ok(result.includes('key'));
			assert.ok(result.includes('value'));
		});

		test('returns resources list for resources data with URIs', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: [
					URI.file('/path/to/file1.ts'),
					URI.file('/path/to/file2.ts')
				]
			};
			const result = getToolSpecificDataDescription(resourcesData);
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes('file2.ts'));
		});

		test('returns resources list for resources data with Locations', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: [
					{ uri: URI.file('/path/to/file1.ts'), range: new Range(1, 1, 10, 1) },
					{ uri: URI.file('/path/to/file2.ts'), range: new Range(5, 1, 15, 1) }
				]
			};
			const result = getToolSpecificDataDescription(resourcesData);
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes(':1')); // Line number included for Locations
			assert.ok(result.includes('file2.ts'));
			assert.ok(result.includes(':5')); // Line number included for Locations
		});

		test('returns resources list for mixed URIs and Locations', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: [
					URI.file('/path/to/file1.ts'),
					{ uri: URI.file('/path/to/file2.ts'), range: new Range(10, 1, 20, 1) }
				]
			};
			const result = getToolSpecificDataDescription(resourcesData);
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes('file2.ts'));
			assert.ok(result.includes(':10')); // Line number for Location only
		});

		test('returns empty for empty resources array', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: []
			};
			assert.strictEqual(getToolSpecificDataDescription(resourcesData), '');
		});
	});

	suite('getResultDetailsDescription', () => {
		test('returns empty object for undefined', () => {
			assert.deepStrictEqual(getResultDetailsDescription(undefined), {});
		});

		test('returns files for URI array', () => {
			const uris = [
				URI.file('/path/to/file1.ts'),
				URI.file('/path/to/file2.ts')
			];
			const result = getResultDetailsDescription(uris);
			assert.ok(result.files);
			assert.strictEqual(result.files!.length, 2);
			assert.ok(result.files![0].includes('file1.ts'));
			assert.ok(result.files![1].includes('file2.ts'));
		});

		test('returns files for Location array', () => {
			const locations: Location[] = [
				{ uri: URI.file('/path/to/file1.ts'), range: new Range(1, 1, 10, 1) },
				{ uri: URI.file('/path/to/file2.ts'), range: new Range(5, 1, 15, 1) }
			];
			const result = getResultDetailsDescription(locations);
			assert.ok(result.files);
			assert.strictEqual(result.files!.length, 2);
		});

		test('returns input and isError for IToolResultInputOutputDetails', () => {
			const details = {
				input: 'create_file path=/test/file.ts',
				output: [],
				isError: false
			};
			const result = getResultDetailsDescription(details);
			assert.strictEqual(result.input, 'create_file path=/test/file.ts');
			assert.strictEqual(result.isError, false);
		});

		test('returns isError true for errored IToolResultInputOutputDetails', () => {
			const details = {
				input: 'create_file path=/test/file.ts',
				output: [],
				isError: true
			};
			const result = getResultDetailsDescription(details);
			assert.strictEqual(result.isError, true);
		});
	});

	suite('getToolInvocationA11yDescription', () => {
		test('returns invocation message when not complete', () => {
			const result = getToolInvocationA11yDescription(
				'Creating file',
				'Created file',
				undefined,
				undefined,
				false
			);
			assert.strictEqual(result, 'Creating file');
		});

		test('returns past tense message when complete', () => {
			const result = getToolInvocationA11yDescription(
				'Creating file',
				'Created file',
				undefined,
				undefined,
				true
			);
			assert.strictEqual(result, 'Created file');
		});

		test('includes tool-specific data description', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: { original: 'npm test' },
				language: 'bash'
			};
			const result = getToolInvocationA11yDescription(
				'Running command',
				'Ran command',
				terminalData,
				undefined,
				true
			);
			assert.ok(result.includes('Ran command'));
			assert.ok(result.includes('npm test'));
		});

		test('includes files from result details when complete', () => {
			const uris = [
				URI.file('/path/to/file1.ts'),
				URI.file('/path/to/file2.ts')
			];
			const result = getToolInvocationA11yDescription(
				'Creating files',
				'Created files',
				undefined,
				uris,
				true
			);
			assert.ok(result.includes('Created files'));
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes('file2.ts'));
		});

		test('includes error status when result has error', () => {
			const details = {
				input: 'create_file path=/test/file.ts',
				output: [],
				isError: true
			};
			const result = getToolInvocationA11yDescription(
				'Creating file',
				'Created file',
				undefined,
				details,
				true
			);
			assert.ok(result.includes('Errored'));
		});

		test('does not show input when tool-specific data is provided', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: { original: 'npm test' },
				language: 'bash'
			};
			const details = {
				input: 'some redundant input',
				output: [],
				isError: false
			};
			const result = getToolInvocationA11yDescription(
				'Running command',
				'Ran command',
				terminalData,
				details,
				true
			);
			// Should have tool-specific data but not the "Input:" label
			assert.ok(result.includes('npm test'));
			assert.ok(!result.includes('Input:'));
		});

		test('shows input when no tool-specific data', () => {
			const details = {
				input: 'apply_patch file=/test/file.ts',
				output: [],
				isError: false
			};
			const result = getToolInvocationA11yDescription(
				'Applying patch',
				'Applied patch',
				undefined,
				details,
				true
			);
			assert.ok(result.includes('Applied patch'));
			assert.ok(result.includes('Input:'));
			assert.ok(result.includes('apply_patch'));
		});

		test('handles all parts together', () => {
			const subagentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				agentName: 'CodeReviewer',
				description: 'Reviewing code changes'
			};
			const uris = [URI.file('/src/test.ts')];
			const result = getToolInvocationA11yDescription(
				'Starting code review',
				'Completed code review',
				subagentData,
				uris,
				true
			);
			assert.ok(result.includes('Completed code review'));
			assert.ok(result.includes('CodeReviewer'));
			assert.ok(result.includes('Reviewing code changes'));
			assert.ok(result.includes('test.ts'));
		});
	});

	suite('getProvider', () => {
		test('omits thinking content when disabled in storage', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());
			storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, false, StorageScope.PROFILE, StorageTarget.USER);

			const responseItem = {
				response: { value: [{ kind: 'thinking', value: 'Hidden reasoning' }, { kind: 'markdownContent', content: new MarkdownString('Response content') }] },
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const items = [responseItem];
			let focusedItem: unknown = responseItem;

			const widget = {
				hasInputFocus: () => false,
				focusResponseItem: () => { focusedItem = responseItem; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('Response content'));
			assert.ok(!content.includes('Thinking: Hidden reasoning'));
		});

		test('prefers the latest response when focus is on a queued request', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());
			const responseItem = {
				response: { value: [{ kind: 'thinking', value: 'Reasoning' }, { kind: 'markdownContent', content: new MarkdownString('Response content') }] },
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const queuedRequest = { message: 'Queued request' };
			const items = [responseItem, queuedRequest];
			let focusedItem: unknown = queuedRequest;

			const widget = {
				hasInputFocus: () => true,
				focusResponseItem: () => { focusedItem = queuedRequest; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('Response content'));
			assert.ok(content.includes('Thinking: Reasoning'));
		});
	});
});
