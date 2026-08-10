/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../../../../editor/common/editorCommon.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { IDynamicVariable } from '../../../../../common/attachments/chatVariables.js';
import { IChatWidget } from '../../../../../browser/chat.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import { ChatDynamicVariableModel } from '../../../../../browser/attachments/chatDynamicVariables.js';
import '../../../../../browser/widget/input/editor/chatInputCommandArgumentHint.js';

suite('InputEditorCommandArgumentHint', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getCtor() {
		const ctor = ChatWidget.CONTRIBS.find(contrib => contrib.name === 'InputEditorCommandArgumentHint');
		assert.ok(ctor, 'InputEditorCommandArgumentHint should be registered as a chat widget contribution');
		return ctor!;
	}

	function commandReference(range: Range, argumentHint: string | undefined): IDynamicVariable {
		return {
			id: 'agent-host-command:plan',
			range,
			data: { $mid: 'agentHostCompletion', kind: 'command' },
			_meta: { command: 'plan', ...(argumentHint !== undefined ? { argumentHint } : {}) },
		};
	}

	function run(value: string, variables: IDynamicVariable[], trigger: 'parsedInput' | 'references' = 'parsedInput'): IDecorationOptions[] {
		let captured: IDecorationOptions[] = [];
		withTestCodeEditor(value, {}, (editor, _vm, instantiationService) => {
			const store = new DisposableStore();
			try {
				const realSet = editor.setDecorationsByType.bind(editor);
				editor.setDecorationsByType = ((desc: string, key: string, opts: IDecorationOptions[]) => {
					if (key === 'chat-command-argument-hint') {
						captured = opts;
					}
					return realSet(desc, key, opts);
				}) as typeof editor.setDecorationsByType;

				const parsedInputEmitter = store.add(new Emitter<void>());
				const referencesEmitter = store.add(new Emitter<void>());
				const dynamicVariableModel = { variables, onDidChangeReferences: referencesEmitter.event } as unknown as ChatDynamicVariableModel;
				const widget = {
					inputEditor: editor,
					onDidChangeParsedInput: parsedInputEmitter.event,
					getContrib: (id: string) => id === ChatDynamicVariableModel.ID ? dynamicVariableModel : undefined,
				} as unknown as IChatWidget;

				store.add(instantiationService.createInstance(getCtor(), widget));
				(trigger === 'references' ? referencesEmitter : parsedInputEmitter).fire();
			} finally {
				store.dispose();
			}
		});
		return captured;
	}

	test('renders ghost text after a command with a trailing space and an argument hint', () => {
		const decorations = run('/plan ', [commandReference(new Range(1, 1, 1, 6), 'task')]);
		assert.deepStrictEqual(decorations, [{
			range: { startLineNumber: 1, endLineNumber: 1, startColumn: 7, endColumn: 1000 },
			renderOptions: { after: { contentText: 'task', color: undefined } }
		}]);
	});

	test('renders ghost text when only the references change (accepted completion, no parsed-input change)', () => {
		const decorations = run('/plan ', [commandReference(new Range(1, 1, 1, 6), 'task')], 'references');
		assert.deepStrictEqual(decorations, [{
			range: { startLineNumber: 1, endLineNumber: 1, startColumn: 7, endColumn: 1000 },
			renderOptions: { after: { contentText: 'task', color: undefined } }
		}]);
	});

	test('renders nothing without an argument hint, once an argument is typed, or with leading text', () => {
		assert.deepStrictEqual(run('/plan ', [commandReference(new Range(1, 1, 1, 6), undefined)]), []);
		assert.deepStrictEqual(run('/plan task', [commandReference(new Range(1, 1, 1, 6), 'task')]), []);
		assert.deepStrictEqual(run('hi /plan ', [commandReference(new Range(1, 4, 1, 9), 'task')]), []);
	});
});
