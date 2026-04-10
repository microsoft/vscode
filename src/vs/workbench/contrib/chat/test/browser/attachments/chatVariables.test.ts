/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IDynamicVariable } from '../../../common/attachments/chatVariables.js';
import { IChatWidget } from '../../../browser/chat.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../../../browser/attachments/chatVariables.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IToolData, IToolSet, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { observableValue } from '../../../../../../base/common/observable.js';

function createMockVariable(overrides?: Partial<IDynamicVariable>): IDynamicVariable {
	return {
		id: 'var-1',
		fullName: 'test-var',
		range: new Range(1, 1, 1, 10),
		data: 'test-data',
		...overrides,
	};
}

function createMockAttachment(overrides?: Partial<IChatRequestVariableEntry>): IChatRequestVariableEntry {
	return {
		id: 'attach-1',
		name: 'test-attachment',
		kind: 'file',
		value: 'test-value',
		...overrides,
	} as IChatRequestVariableEntry;
}

function createMockWidget(options: {
	hasViewModel?: boolean;
	supportsFileReferences?: boolean;
	contribVariables?: IDynamicVariable[];
	editing?: boolean;
	attachments?: IChatRequestVariableEntry[];
	editorTextLength?: number;
}): IChatWidget {
	const {
		hasViewModel = true,
		supportsFileReferences = true,
		contribVariables = [],
		editing = false,
		attachments = [],
		editorTextLength = 100,
	} = options;

	const contribModel = {
		id: ChatDynamicVariableModel.ID,
		variables: contribVariables,
	};

	return {
		viewModel: hasViewModel ? { editing: editing ? {} : undefined } : undefined,
		supportsFileReferences,
		getContrib: (id: string) => id === ChatDynamicVariableModel.ID ? contribModel : undefined,
		input: {
			attachmentModel: { attachments },
		},
		inputEditor: {
			getModel: () => ({
				getValueLength: () => editorTextLength,
				getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
			}),
		},
	} as unknown as IChatWidget;
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
		const toolData: IToolData = {
			id: 'tool-1',
			toolReferenceName: 'myTool',
			displayName: 'My Tool',
			modelDescription: 'A test tool',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};
		const expectedMap = new Map<IToolData | IToolSet, boolean>([[toolData, true]]);
		const entriesMap = observableValue('test', expectedMap);

		const widget = {
			input: {
				selectedToolsModel: { entriesMap },
			},
		} as unknown as IChatWidget;

		const result = getSelectedToolAndToolSetsForWidget(widget);
		assert.strictEqual(result, expectedMap);
	});
});
