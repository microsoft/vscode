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
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ChatResponseAccessibleView, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, getToolSpecificDataDescription, getResultDetailsDescription, getToolInvocationA11yDescription } from '../../../browser/accessibility/chatResponseAccessibleView.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
suite('ChatResponseAccessibleView', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suite('getToolSpecificDataDescription', () => {
        test('returns empty string for undefined', () => {
            assert.strictEqual(getToolSpecificDataDescription(undefined), '');
        });
        test('returns command line for terminal data', () => {
            const terminalData = {
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
            const terminalData = {
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
            const terminalData = {
                kind: 'terminal',
                commandLine: {
                    original: 'npm install'
                },
                language: 'bash'
            };
            assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm install');
        });
        test('returns description for subagent data', () => {
            const subagentData = {
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
            const subagentData = {
                kind: 'subagent',
                description: 'Running analysis'
            };
            const result = getToolSpecificDataDescription(subagentData);
            assert.strictEqual(result, 'Running analysis');
        });
        test('returns extensions list for extensions data', () => {
            const extensionsData = {
                kind: 'extensions',
                extensions: ['eslint', 'prettier', 'typescript']
            };
            const result = getToolSpecificDataDescription(extensionsData);
            assert.ok(result.includes('eslint'));
            assert.ok(result.includes('prettier'));
            assert.ok(result.includes('typescript'));
        });
        test('returns empty for empty extensions array', () => {
            const extensionsData = {
                kind: 'extensions',
                extensions: []
            };
            assert.strictEqual(getToolSpecificDataDescription(extensionsData), '');
        });
        test('returns todo list description for todoList data', () => {
            const todoData = {
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
            const todoData = {
                kind: 'todoList',
                todoList: []
            };
            assert.strictEqual(getToolSpecificDataDescription(todoData), '');
        });
        test('returns PR info for pullRequest data', () => {
            const prData = {
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
            const inputData = {
                kind: 'input',
                rawInput: 'some input string'
            };
            assert.strictEqual(getToolSpecificDataDescription(inputData), 'some input string');
        });
        test('returns JSON stringified for input data (object)', () => {
            const inputData = {
                kind: 'input',
                rawInput: { key: 'value', nested: { data: 123 } }
            };
            const result = getToolSpecificDataDescription(inputData);
            assert.ok(result.includes('key'));
            assert.ok(result.includes('value'));
        });
        test('returns resources list for resources data with URIs', () => {
            const resourcesData = {
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
            const resourcesData = {
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
            const resourcesData = {
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
            const resourcesData = {
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
            assert.strictEqual(result.files.length, 2);
            assert.ok(result.files[0].includes('file1.ts'));
            assert.ok(result.files[1].includes('file2.ts'));
        });
        test('returns files for Location array', () => {
            const locations = [
                { uri: URI.file('/path/to/file1.ts'), range: new Range(1, 1, 10, 1) },
                { uri: URI.file('/path/to/file2.ts'), range: new Range(5, 1, 15, 1) }
            ];
            const result = getResultDetailsDescription(locations);
            assert.ok(result.files);
            assert.strictEqual(result.files.length, 2);
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
            const result = getToolInvocationA11yDescription('Creating file', 'Created file', undefined, undefined, false);
            assert.strictEqual(result, 'Creating file');
        });
        test('returns past tense message when complete', () => {
            const result = getToolInvocationA11yDescription('Creating file', 'Created file', undefined, undefined, true);
            assert.strictEqual(result, 'Created file');
        });
        test('includes tool-specific data description', () => {
            const terminalData = {
                kind: 'terminal',
                commandLine: { original: 'npm test' },
                language: 'bash'
            };
            const result = getToolInvocationA11yDescription('Running command', 'Ran command', terminalData, undefined, true);
            assert.ok(result.includes('Ran command'));
            assert.ok(result.includes('npm test'));
        });
        test('includes files from result details when complete', () => {
            const uris = [
                URI.file('/path/to/file1.ts'),
                URI.file('/path/to/file2.ts')
            ];
            const result = getToolInvocationA11yDescription('Creating files', 'Created files', undefined, uris, true);
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
            const result = getToolInvocationA11yDescription('Creating file', 'Created file', undefined, details, true);
            assert.ok(result.includes('Errored'));
        });
        test('does not show input when tool-specific data is provided', () => {
            const terminalData = {
                kind: 'terminal',
                commandLine: { original: 'npm test' },
                language: 'bash'
            };
            const details = {
                input: 'some redundant input',
                output: [],
                isError: false
            };
            const result = getToolInvocationA11yDescription('Running command', 'Ran command', terminalData, details, true);
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
            const result = getToolInvocationA11yDescription('Applying patch', 'Applied patch', undefined, details, true);
            assert.ok(result.includes('Applied patch'));
            assert.ok(result.includes('Input:'));
            assert.ok(result.includes('apply_patch'));
        });
        test('handles all parts together', () => {
            const subagentData = {
                kind: 'subagent',
                agentName: 'CodeReviewer',
                description: 'Reviewing code changes'
            };
            const uris = [URI.file('/src/test.ts')];
            const result = getToolInvocationA11yDescription('Starting code review', 'Completed code review', subagentData, uris, true);
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
            storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, false, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            const responseItem = {
                response: { value: [{ kind: 'thinking', value: 'Hidden reasoning' }, { kind: 'markdownContent', content: new MarkdownString('Response content') }] },
                model: { onDidChange: Event.None },
                setVote: () => undefined
            };
            const items = [responseItem];
            let focusedItem = responseItem;
            const widget = {
                hasInputFocus: () => false,
                focusResponseItem: () => { focusedItem = responseItem; },
                getFocus: () => focusedItem,
                focus: (item) => { focusedItem = item; },
                viewModel: { getItems: () => items }
            };
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
            };
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
            let focusedItem = queuedRequest;
            const widget = {
                hasInputFocus: () => true,
                focusResponseItem: () => { focusedItem = queuedRequest; },
                getFocus: () => focusedItem,
                focus: (item) => { focusedItem = item; },
                viewModel: { getItems: () => items }
            };
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
            };
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
        test('includes file path for URI inline references', () => {
            const instantiationService = store.add(new TestInstantiationService());
            const storageService = store.add(new TestStorageService());
            const inlineReferenceUri = URI.file('/path/to/index.ts');
            const responseItem = {
                response: {
                    value: [
                        { kind: 'markdownContent', content: new MarkdownString('See file ') },
                        { kind: 'inlineReference', inlineReference: inlineReferenceUri, name: 'index.ts' },
                        { kind: 'markdownContent', content: new MarkdownString(' for details') }
                    ]
                },
                model: { onDidChange: Event.None },
                setVote: () => undefined
            };
            const items = [responseItem];
            let focusedItem = responseItem;
            const widget = {
                hasInputFocus: () => false,
                focusResponseItem: () => { focusedItem = responseItem; },
                getFocus: () => focusedItem,
                focus: (item) => { focusedItem = item; },
                viewModel: { getItems: () => items }
            };
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
            };
            instantiationService.stub(IChatWidgetService, widgetService);
            instantiationService.stub(IStorageService, storageService);
            const accessibleView = new ChatResponseAccessibleView();
            const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
            assert.ok(provider);
            store.add(provider);
            const content = provider.provideContent();
            assert.ok(content.includes('index.ts'));
            assert.ok(content.includes(inlineReferenceUri.path));
            assert.ok(content.includes('See file'));
            assert.ok(content.includes('for details'));
        });
        test('includes file path and line number for Location inline references', () => {
            const instantiationService = store.add(new TestInstantiationService());
            const storageService = store.add(new TestStorageService());
            const fileLocation = {
                uri: URI.file('/src/app/main.ts'),
                range: new Range(42, 1, 42, 20)
            };
            const responseItem = {
                response: {
                    value: [
                        { kind: 'markdownContent', content: new MarkdownString('Error at ') },
                        { kind: 'inlineReference', inlineReference: fileLocation, name: 'main.ts' }
                    ]
                },
                model: { onDidChange: Event.None },
                setVote: () => undefined
            };
            const items = [responseItem];
            let focusedItem = responseItem;
            const widget = {
                hasInputFocus: () => false,
                focusResponseItem: () => { focusedItem = responseItem; },
                getFocus: () => focusedItem,
                focus: (item) => { focusedItem = item; },
                viewModel: { getItems: () => items }
            };
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
            };
            instantiationService.stub(IChatWidgetService, widgetService);
            instantiationService.stub(IStorageService, storageService);
            const accessibleView = new ChatResponseAccessibleView();
            const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
            assert.ok(provider);
            store.add(provider);
            const content = provider.provideContent();
            assert.ok(content.includes('main.ts'));
            assert.ok(content.includes(`${fileLocation.uri.path}:42`));
        });
        test('uses basename as name for URI inline references without explicit name', () => {
            const instantiationService = store.add(new TestInstantiationService());
            const storageService = store.add(new TestStorageService());
            const inlineReferenceUri = URI.file('/workspace/src/utils.ts');
            const responseItem = {
                response: {
                    value: [
                        { kind: 'inlineReference', inlineReference: inlineReferenceUri }
                    ]
                },
                model: { onDidChange: Event.None },
                setVote: () => undefined
            };
            const items = [responseItem];
            let focusedItem = responseItem;
            const widget = {
                hasInputFocus: () => false,
                focusResponseItem: () => { focusedItem = responseItem; },
                getFocus: () => focusedItem,
                focus: (item) => { focusedItem = item; },
                viewModel: { getItems: () => items }
            };
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
            };
            instantiationService.stub(IChatWidgetService, widgetService);
            instantiationService.stub(IStorageService, storageService);
            const accessibleView = new ChatResponseAccessibleView();
            const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
            assert.ok(provider);
            store.add(provider);
            const content = provider.provideContent();
            assert.ok(content.includes('utils.ts'));
            assert.ok(content.includes(inlineReferenceUri.path));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FjY2Vzc2liaWxpdHkvY2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sc0RBQXNELENBQUM7QUFDcEgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGlEQUFpRCxFQUFFLDhCQUE4QixFQUFFLDJCQUEyQixFQUFFLGdDQUFnQyxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDNVAsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFM0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFekYsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtJQUN4QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDNUMsSUFBSSxDQUFD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