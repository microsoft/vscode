/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../../../../editor/common/editorCommon.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { IDynamicVariable } from '../../../../../common/attachments/chatVariables.js';
import { IChatWidget } from '../../../../../browser/chat.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import { ChatDynamicVariableModel } from '../../../../../browser/attachments/chatDynamicVariables.js';
import { InputEditorCommandArgumentHint } from '../../../../../browser/widget/input/editor/chatInputCommandArgumentHint.js';
import '../../../../../browser/widget/input/editor/chatInputEditorContrib.js';

suite('InputEditorCommandArgumentHint', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function commandReference(range: Range, argumentHint: string | undefined): IDynamicVariable {
		return {
			id: 'agent-host-command:plan',
			range,
			data: { $mid: 'agentHostCompletion', kind: 'command' },
			_meta: { command: 'plan', ...(argumentHint !== undefined ? { argumentHint } : {}) },
		};
	}

	function run(
		value: string,
		variables: IDynamicVariable[],
		trigger: 'parsedInput' | 'references' = 'parsedInput',
		operation?: (editor: IChatWidget['inputEditor'], widget: IChatWidget, hintContribution: InputEditorCommandArgumentHint, sessionResource: URI, viewModelEmitter: Emitter<void>, store: DisposableStore, activeInputEditorEmitter: Emitter<void>) => void,
		onDecorations?: (options: IDecorationOptions[]) => void,
		decorationType = 'chat-command-argument-hint',
	): IDecorationOptions[] {
		let captured: IDecorationOptions[] = [];
		let result: IDecorationOptions[] = [];
		withTestCodeEditor(value, {}, (editor, _vm, instantiationService) => {
			const store = new DisposableStore();
			try {
				const realSet = editor.setDecorationsByType.bind(editor);
				editor.setDecorationsByType = ((desc: string, key: string, opts: IDecorationOptions[]) => {
					if (key === decorationType) {
						captured = opts;
						onDecorations?.(opts);
					}
					return realSet(desc, key, opts);
				}) as typeof editor.setDecorationsByType;

				const parsedInputEmitter = store.add(new Emitter<void>());
				const referencesEmitter = store.add(new Emitter<void>());
				const viewModelEmitter = store.add(new Emitter<void>());
				const activeInputEditorEmitter = store.add(new Emitter<void>());
				const sessionResource = URI.parse('test:session');
				const dynamicVariableModel = { variables, onDidChangeReferences: referencesEmitter.event } as unknown as ChatDynamicVariableModel;
				const widget = {
					inputEditor: editor,
					onDidChangeParsedInput: parsedInputEmitter.event,
					onDidChangeViewModel: viewModelEmitter.event,
					onDidChangeActiveInputEditor: activeInputEditorEmitter.event,
					viewModel: { model: { sessionResource } },
					refreshParsedInput: () => undefined,
					getContrib: (id: string) => id === InputEditorCommandArgumentHint.ID ? hintContribution : id === ChatDynamicVariableModel.ID ? dynamicVariableModel : undefined,
				} as unknown as IChatWidget;

				assert.ok(ChatWidget.CONTRIBS.includes(InputEditorCommandArgumentHint), 'InputEditorCommandArgumentHint should be registered as a chat widget contribution');
				const hintContribution = store.add(instantiationService.createInstance(InputEditorCommandArgumentHint, widget));
				(trigger === 'references' ? referencesEmitter : parsedInputEmitter).fire();
				operation?.(editor, widget, hintContribution, sessionResource, viewModelEmitter, store, activeInputEditorEmitter);
				result = captured;
			} finally {
				store.dispose();
			}
		});
		return result;
	}

	test('styles the full accepted command prefix but not the typed argument', () => {
		for (const prefix of ['/fork', '/fork prompt']) {
			for (const argument of ['', 'user text\nsecond line']) {
				const range = new Range(1, 1, 1, prefix.length + 1);
				const decorations = run(`${prefix} `, [], 'parsedInput', (editor, _widget, contribution, session) => {
					contribution.showLocalHint(session, editor.getModel()!, range, prefix, 'hint');
					if (argument) {
						editor.executeEdits('test', [{ range: new Range(1, prefix.length + 2, 1, prefix.length + 2), text: argument }]);
					}
					assert.strictEqual(editor.getValue(), `${prefix} ${argument}`);
				}, undefined, 'chat-local-command-prefix');
				assert.deepStrictEqual(decorations, [{ range }]);
			}
		}
	});

	test('clears accepted prefix styling when its ownership is invalidated', () => {
		const operations = [
			(editor: IChatWidget['inputEditor']) => editor.executeEdits('test', [{ range: new Range(1, 12, 1, 13), text: '' }]),
			(editor: IChatWidget['inputEditor']) => editor.setValue(''),
		];
		for (const operation of operations) {
			const decorations = run('/fork prompt ', [], 'parsedInput', (editor, _widget, contribution, session) => {
				contribution.showLocalHint(session, editor.getModel()!, new Range(1, 1, 1, 13), '/fork prompt', 'prompt');
				operation(editor);
			}, undefined, 'chat-local-command-prefix');
			assert.deepStrictEqual(decorations, []);
		}
	});

	test('clears accepted prefix styling when the contribution is disposed', () => {
		let finalDecorations: IDecorationOptions[] | undefined;
		run('/fork prompt ', [], 'parsedInput', (editor, _widget, contribution, session) => {
			contribution.showLocalHint(session, editor.getModel()!, new Range(1, 1, 1, 13), '/fork prompt', 'prompt');
		}, options => finalDecorations = options, 'chat-local-command-prefix');
		assert.deepStrictEqual(finalDecorations, []);
	});

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

	test('restores a local hint after deleting an argument without creating a dynamic reference', () => {
		const history: IDecorationOptions[][] = [];
		const variables: IDynamicVariable[] = [];
		let hiddenAfterArgument = false;
		const decorations = run('/fork ', variables, 'parsedInput', (editor, _widget, hintContribution, sessionResource) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			editor.executeEdits('test', [{ range: new Range(1, 7, 1, 7), text: 'My fork' }]);
			const latestDecorations = history[history.length - 1];
			hiddenAfterArgument = latestDecorations?.length === 0;
			editor.executeEdits('test', [{ range: new Range(1, 7, 1, 14), text: '' }]);
		}, options => history.push(options));

		assert.deepStrictEqual({
			hiddenAfterArgument,
			decorations,
			variables,
		}, {
			hiddenAfterArgument: true,
			decorations: [{
				range: { startLineNumber: 1, endLineNumber: 1, startColumn: 7, endColumn: 1000 },
				renderOptions: { after: { contentText: 'title', color: undefined } }
			}],
			variables: [],
		});
	});

	test('clears a local hint after prefix edits and does not resurrect it when the prefix is restored', () => {
		const decorations = run('/fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			editor.executeEdits('test', [{ range: new Range(1, 2, 1, 3), text: '' }]);
			editor.executeEdits('test', [{ range: new Range(1, 2, 1, 2), text: 'f' }]);
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint after replacing the whole input with the same prefix', () => {
		const decorations = run('/fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			editor.setValue('/fork ');
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint after a non-flush multiline replacement restores the prefix', () => {
		const decorations = run('/fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			editor.executeEdits('test', [{ range: new Range(1, 7, 1, 7), text: 'argument\nnext line' }]);
			editor.executeEdits('test', [{ range: editor.getModel()!.getFullModelRange(), text: '/fork ' }]);
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint when leading whitespace becomes meaningful text', () => {
		const decorations = run('  /fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 3, 1, 8), '/fork', 'title');
			editor.executeEdits('test', [{ range: new Range(1, 1, 1, 3), text: 'a ' }]);
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint when the input editor changes models and then restores the original model', () => {
		const decorations = run('/fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource, _viewModelEmitter, store) => {
			const originalModel = editor.getModel();
			assert.ok(originalModel);
			hintContribution.showLocalHint(sessionResource, originalModel, new Range(1, 1, 1, 6), '/fork', 'title');
			const replacementModel = store.add(createTextModel('/fork '));
			editor.setModel(replacementModel);
			editor.setModel(originalModel);
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('keeps a hidden local hint ahead of a stale legacy reference fallback', () => {
		const decorations = run('/fork title ', [commandReference(new Range(1, 1, 1, 12), 'host')], 'parsedInput', (editor, _widget, hintContribution, sessionResource) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint when immediate Backspace deletes the accepted command', () => {
		const decorations = run('/', [], 'parsedInput', (editor, widget, hintContribution, sessionResource, _viewModelEmitter, store) => {
			const tokenDeleterCtor = ChatWidget.CONTRIBS.find(contrib => contrib.name === 'ChatTokenDeleter');
			assert.ok(tokenDeleterCtor, 'ChatTokenDeleter should be registered as a chat widget contribution');
			store.add(new tokenDeleterCtor(widget));

			editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '/fork ' }]);
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			editor.executeEdits('test', [{ range: new Range(1, 6, 1, 7), text: '' }]);
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint when the widget changes chat sessions', () => {
		const decorations = run('/fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource, viewModelEmitter) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			viewModelEmitter.fire();
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('clears a local hint when the active input editor changes', () => {
		const decorations = run('/fork ', [], 'parsedInput', (editor, _widget, hintContribution, sessionResource, _viewModelEmitter, _store, activeInputEditorEmitter) => {
			hintContribution.showLocalHint(sessionResource, editor.getModel()!, new Range(1, 1, 1, 6), '/fork', 'title');
			activeInputEditorEmitter.fire();
		});

		assert.deepStrictEqual(decorations, []);
	});

	test('renders ghost text after an accepted skill and ignores non-agent-host references', () => {
		const skill: IDynamicVariable = {
			id: 'file:///skills/design-prep/SKILL.md',
			range: new Range(1, 1, 1, 13),
			data: { $mid: 'agentHostCompletion', kind: 'skill' },
			_meta: { uri: 'file:///skills/design-prep/SKILL.md', argumentHint: '<problem>' },
		};
		const other: IDynamicVariable = { ...skill, id: 'other', data: 'file:///other.md' };
		assert.deepStrictEqual({ skill: run('/design-prep ', [skill]), other: run('/design-prep ', [other]) }, {
			skill: [{
				range: { startLineNumber: 1, endLineNumber: 1, startColumn: 14, endColumn: 1000 },
				renderOptions: { after: { contentText: '<problem>', color: undefined } }
			}],
			other: [],
		});
	});
});
