/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IChatWidget } from '../../../browser/chat.js';
import { ChatDynamicVariableModel } from '../../../browser/attachments/chatDynamicVariables.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { URI } from '../../../../../../base/common/uri.js';

suite('ChatDynamicVariableModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('inserts files, folders, and selections as inline references', () => {
		const textModel = disposables.add(createTextModel(''));
		let position = new Position(1, 1);
		const decorationHovers: string[] = [];
		const inputEditor = {
			onDidChangeModelContent: textModel.onDidChangeContent.bind(textModel),
			getModel: () => textModel,
			getPosition: () => position,
			setPosition: (newPosition: Position) => position = Position.lift(newPosition),
			executeEdits: (_source: string, edits: { range: Range; text: string }[]) => {
				textModel.applyEdits(edits.map(edit => ({ range: edit.range, text: edit.text })));
				return true;
			},
			setDecorationsByType: (_description: string, _type: string, decorations: readonly { hoverMessage?: { value: string } }[]) => {
				decorationHovers.push(...decorations.map(decoration => decoration.hoverMessage?.value ?? ''));
				return decorations.map((_, index) => `decoration-${index}`);
			},
		};
		const widget = {
			inputEditor,
			input: {
				selectedLanguageModel: observableValue('selectedLanguageModel', { metadata: { family: 'gemini' } }),
			},
			onDidChangeActiveInputEditor: Event.None,
			refreshParsedInput: () => { },
		} as unknown as IChatWidget;
		const labelService = { getUriLabel: (uri: URI) => uri.path } as unknown as ILabelService;
		const model = disposables.add(new ChatDynamicVariableModel(widget, labelService));
		const file = URI.file('/workspace/file.ts');
		const folder = URI.file('/workspace/src');
		const entries: IChatRequestVariableEntry[] = [{
			id: file.toString(),
			kind: 'file',
			name: 'file.ts',
			value: file,
		}, {
			id: `${file}:2-4`,
			kind: 'file',
			name: 'file.ts',
			value: { uri: file, range: new Range(2, 3, 4, 8) },
		}, {
			id: folder.toString(),
			kind: 'directory',
			name: 'src',
			value: folder,
			imageCount: 11,
		}];

		assert.strictEqual(model.insertFileReferences(entries), true);
		assert.strictEqual(textModel.getValue(), '@file.ts @file.ts:2-4 @src ');
		assert.deepStrictEqual(model.variables.map(variable => ({
			id: variable.id,
			range: variable.range,
			isFile: variable.isFile,
			isDirectory: variable.isDirectory,
		})), [{
			id: file.toString(),
			range: new Range(1, 1, 1, 9),
			isFile: true,
			isDirectory: false,
		}, {
			id: `${file}:2-4`,
			range: new Range(1, 10, 1, 22),
			isFile: true,
			isDirectory: false,
		}, {
			id: folder.toString(),
			range: new Range(1, 23, 1, 27),
			isFile: false,
			isDirectory: true,
		}]);
		assert.deepStrictEqual(position, new Position(1, 28));
		assert.strictEqual(model.getFileReferenceAtPosition(new Position(1, 1))?.id, file.toString());
		assert.strictEqual(model.getFileReferenceAtPosition(new Position(1, 9)), undefined);
		assert.ok(decorationHovers.some(hover => hover.includes('exceeds&nbsp;the&nbsp;maximum&nbsp;of&nbsp;10&nbsp;images')), JSON.stringify(decorationHovers));
	});
});
