/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IDynamicVariable, toAttachedContextDynamicVariable } from '../../../common/attachments/chatVariables.js';
import { IChatWidget } from '../../../browser/chat.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../../../browser/attachments/chatVariables.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IToolData, ToolDataSource, ToolAndToolSetEnablementMap } from '../../../common/tools/languageModelToolsService.js';
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
		const expectedMap = ToolAndToolSetEnablementMap.fromEntries([[toolData, true]]);
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

suite('inline attachment references', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps large attachment payloads out of inline reference state', () => {
		const attachment = createMockAttachment({
			kind: 'image',
			value: new Uint8Array(1024 * 1024),
		});
		const reference = toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 20));

		assert.deepStrictEqual({
			data: reference.data,
			hasAttachment: Object.hasOwn(reference, 'attachment'),
			isAttachmentReference: reference.isAttachmentReference,
			hasCompactSerializedState: JSON.stringify(reference).length < 500,
		}, {
			data: undefined,
			hasAttachment: false,
			isAttachmentReference: true,
			hasCompactSerializedState: true,
		});
	});
});

suite('ChatDynamicVariableModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not retain attachment payload after the backing attachment is removed', () => {
		const attachment = createMockAttachment({
			kind: 'image',
			value: new Uint8Array([1, 2, 3]),
			mimeType: 'image/png',
		});
		const attachments = [attachment];
		const onDidChangeModelContent = store.add(new Emitter<{ changes: readonly unknown[] }>());
		const onDidChangeActiveInputEditor = store.add(new Emitter<void>());
		const onDidChangeAttachments = store.add(new Emitter<{ deleted: readonly string[]; added: readonly IChatRequestVariableEntry[]; updated: readonly IChatRequestVariableEntry[] }>());
		const widget = {
			input: {
				attachmentModel: {
					attachments,
					onDidChange: onDidChangeAttachments.event,
				},
			},
			inputEditor: {
				onDidChangeModelContent: onDidChangeModelContent.event,
				getModel: () => undefined,
				setDecorationsByType: () => [],
			},
			onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
			refreshParsedInput: () => { },
		} as unknown as IChatWidget;
		const model = store.add(new ChatDynamicVariableModel(widget, {
			getUriLabel: () => '',
		} as unknown as ILabelService));

		model.addReference(toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 20)));
		attachments.length = 0;
		onDidChangeAttachments.fire({ deleted: [attachment.id], added: [], updated: [] });

		const inputState: Record<string, unknown> = {};
		model.getInputState(inputState);
		const serializedReference = (inputState[ChatDynamicVariableModel.ID] as IDynamicVariable[])[0];
		const requestReference = model.variables[0];
		assert.deepStrictEqual({
			serializedData: serializedReference.data,
			requestData: requestReference.data,
			hasSerializedAttachment: Object.hasOwn(serializedReference, 'attachment'),
			hasRequestAttachment: Object.hasOwn(requestReference, 'attachment'),
		}, {
			serializedData: undefined,
			requestData: undefined,
			hasSerializedAttachment: false,
			hasRequestAttachment: false,
		});
	});

	test('leaves image reference hovers to the custom hover participant', () => {
		const folderAttachment = createMockAttachment({
			id: 'folder',
			name: 'assets',
			kind: 'directory',
			value: URI.file('/workspace/assets'),
		});
		const imageAttachment = createMockAttachment({
			id: 'image',
			name: 'screenshot.png',
			kind: 'image',
			value: new Uint8Array([1, 2, 3]),
			mimeType: 'image/png',
			references: [{ reference: URI.file('/workspace/screenshot.png'), kind: 'reference' }],
		});
		const attachments = [folderAttachment, imageAttachment];
		const onDidChangeModelContent = store.add(new Emitter<{ changes: readonly unknown[] }>());
		const onDidChangeActiveInputEditor = store.add(new Emitter<void>());
		const onDidChangeAttachments = store.add(new Emitter<{ deleted: readonly string[]; added: readonly IChatRequestVariableEntry[]; updated: readonly IChatRequestVariableEntry[] }>());
		let folderHover = '';
		let hasImageDecorationHover = false;
		const widget = {
			input: {
				attachmentModel: {
					attachments,
					onDidChange: onDidChangeAttachments.event,
				},
			},
			inputEditor: {
				onDidChangeModelContent: onDidChangeModelContent.event,
				getModel: () => ({
					getValueInRange: () => '#attachment',
					getDecorationRange: () => new Range(1, 1, 1, 20),
				}),
				setDecorationsByType: (_owner: string, _type: string, decorations: Array<{ hoverMessage?: { value: string } }>) => {
					for (const decoration of decorations) {
						const value = decoration.hoverMessage?.value ?? '';
						if (value.includes('workspace/assets')) {
							folderHover = value;
						}
						if (value.includes('screenshot.png')) {
							hasImageDecorationHover = true;
						}
					}
					return decorations.map((_, index) => String(index));
				},
			},
			onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
			refreshParsedInput: () => { },
		} as unknown as IChatWidget;
		const model = store.add(new ChatDynamicVariableModel(widget, {
			getUriLabel: (uri: URI) => uri.path.slice(1),
		} as unknown as ILabelService));

		model.addReference(toAttachedContextDynamicVariable(folderAttachment, new Range(1, 1, 1, 20)));
		model.addReference(toAttachedContextDynamicVariable(imageAttachment, new Range(2, 1, 2, 20)));

		assert.deepStrictEqual({
			folderHover,
			hasImageDecorationHover,
		}, {
			folderHover: 'workspace/assets',
			hasImageDecorationHover: false,
		});
	});
});
