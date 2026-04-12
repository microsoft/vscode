/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../../../browser/attachments/chatVariables.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { observableValue } from '../../../../../../base/common/observable.js';
function createMockVariable(overrides) {
    return {
        id: 'var-1',
        fullName: 'test-var',
        range: new Range(1, 1, 1, 10),
        data: 'test-data',
        ...overrides,
    };
}
function createMockAttachment(overrides) {
    return {
        id: 'attach-1',
        name: 'test-attachment',
        kind: 'file',
        value: 'test-value',
        ...overrides,
    };
}
function createMockWidget(options) {
    const { hasViewModel = true, supportsFileReferences = true, contribVariables = [], editing = false, attachments = [], editorTextLength = 100, } = options;
    const contribModel = {
        id: ChatDynamicVariableModel.ID,
        variables: contribVariables,
    };
    return {
        viewModel: hasViewModel ? { editing: editing ? {} : undefined } : undefined,
        supportsFileReferences,
        getContrib: (id) => id === ChatDynamicVariableModel.ID ? contribModel : undefined,
        input: {
            attachmentModel: { attachments },
        },
        inputEditor: {
            getModel: () => ({
                getValueLength: () => editorTextLength,
                getPositionAt: (offset) => ({ lineNumber: 1, column: offset + 1 }),
            }),
        },
    };
}
suite('getDynamicVariablesForWidget', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('returns empty when no viewModel', () => {
        const widget = createMockWidget({ hasViewModel: false });
        assert.deepStrictEqual(getDynamicVariablesForWidget(widget), []);
    });
    test('returns empty when file references not supported', () => {
        const widget = createMockWidget({ supportsFileReferences: false });
        assert.deepStrictEqual(getDynamicVariablesForWidget(widget), []);
    });
    test('returns contrib model variables when not editing', () => {
        const variables = [createMockVariable()];
        const widget = createMockWidget({ contribVariables: variables });
        assert.deepStrictEqual(getDynamicVariablesForWidget(widget), variables);
    });
    test('returns contrib model variables when editing with existing variables', () => {
        const variables = [createMockVariable()];
        const widget = createMockWidget({ editing: true, contribVariables: variables });
        assert.deepStrictEqual(getDynamicVariablesForWidget(widget), variables);
    });
    test('converts attachments to dynamic variables when editing with attachments and no contrib variables', () => {
        const attachments = [
            createMockAttachment({
                id: 'a1',
                name: 'file.ts',
                kind: 'file',
                value: 'file-value',
                range: { start: 0, endExclusive: 8 },
            }),
        ];
        const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
        const result = getDynamicVariablesForWidget(widget);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].id, 'a1');
        assert.strictEqual(result[0].fullName, 'file.ts');
        assert.strictEqual(result[0].isFile, true);
        assert.strictEqual(result[0].isDirectory, false);
        assert.strictEqual(result[0].data, 'file-value');
    });
    test('skips attachments without range when editing', () => {
        const attachments = [createMockAttachment({ range: undefined })];
        const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
        const result = getDynamicVariablesForWidget(widget);
        // No ranged attachments, falls back to contrib model variables (empty)
        assert.deepStrictEqual(result, []);
    });
    test('skips attachments with empty range', () => {
        const attachments = [createMockAttachment({ range: { start: 5, endExclusive: 5 } })];
        const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
        const result = getDynamicVariablesForWidget(widget);
        assert.deepStrictEqual(result, []);
    });
    test('skips attachments with out-of-bounds range', () => {
        const attachments = [createMockAttachment({ range: { start: 0, endExclusive: 200 } })];
        const widget = createMockWidget({ editing: true, attachments, editorTextLength: 100, contribVariables: [] });
        const result = getDynamicVariablesForWidget(widget);
        assert.deepStrictEqual(result, []);
    });
    test('skips attachments with negative start', () => {
        const attachments = [createMockAttachment({ range: { start: -1, endExclusive: 5 } })];
        const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
        const result = getDynamicVariablesForWidget(widget);
        assert.deepStrictEqual(result, []);
    });
    test('sets isDirectory for directory attachments', () => {
        const attachments = [
            createMockAttachment({
                kind: 'directory',
                range: { start: 0, endExclusive: 5 },
            }),
        ];
        const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
        const result = getDynamicVariablesForWidget(widget);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].isFile, false);
        assert.strictEqual(result[0].isDirectory, true);
    });
});
suite('getSelectedToolAndToolSetsForWidget', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('returns the entriesMap from the selected tools model', () => {
        const toolData = {
            id: 'tool-1',
            toolReferenceName: 'myTool',
            displayName: 'My Tool',
            modelDescription: 'A test tool',
            canBeReferencedInPrompt: true,
            source: ToolDataSource.Internal,
        };
        const expectedMap = new Map([[toolData, true]]);
        const entriesMap = observableValue('test', expectedMap);
        const widget = {
            input: {
                selectedToolsModel: { entriesMap },
            },
        };
        const result = getSelectedToolAndToolSetsForWidget(widget);
        assert.strictEqual(result, expectedMap);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZhcmlhYmxlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFHdEUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLG1DQUFtQyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFaEcsT0FBTyxFQUF1QixjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsU0FBUyxrQkFBa0IsQ0FBQyxTQUFxQztJQUNoRSxPQUFPO1FBQ04sRUFBRSxFQUFFLE9BQU87UUFDWCxRQUFRLEVBQUUsVUFBVTtRQUNwQixLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzdCLElBQUksRUFBRSxXQUFXO1FBQ2pCLEdBQUcsU0FBUztLQUNaLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxTQUE4QztJQUMzRSxPQUFPO1FBQ04sRUFBRSxFQUFFLFVBQVU7UUFDZCxJQUFJLEVBQUUsaUJBQWlCO1FBQ3ZCLElBQUksRUFBRSxNQUFNO1FBQ1osS0FBSyxFQUFFLFlBQVk7UUFDbkIsR0FBRyxTQUFTO0tBQ2lCLENBQUM7QUFDaEMsQ0FBQztB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