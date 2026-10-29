/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { ShrinkEmptyLinesController } from '../../../../../editor/contrib/shrinkEmptyLines/browser/shrinkEmptyLines.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IChatAgent, IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { EmptyTextEditorHintContribution } from '../../browser/emptyTextEditorHint/emptyTextEditorHint.js';

suite('EmptyTextEditorHint', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const withInlineChat of [false, true]) {
		test(`scales the ${withInlineChat ? 'generate code' : 'select language'} hint with the empty line`, () => {
			const context = createHintEditor(store, withInlineChat);
			const shrunk = context.getHintSizing();

			context.editor.updateOptions({ shrinkEmptyLines: 1 });
			const regular = context.getHintSizing();

			assert.deepStrictEqual({
				shrunk,
				regular,
				linkCount: context.container.querySelectorAll('.empty-editor-hint a').length,
			}, {
				shrunk: { fontSize: '10px', lineHeight: '15px' },
				regular: { fontSize: '20px', lineHeight: '30px' },
				linkCount: withInlineChat ? 3 : 2,
			});
		});
	}

	test('updates hint sizing after font and shrinking configuration changes', () => {
		const context = createHintEditor(store);
		const results = [context.getHintSizing()];
		const options: IEditorOptions[] = [
			{ shrinkEmptyLines: 0.25 },
			{ fontSize: 24 },
			{ lineHeight: 40 },
			{ allowVariableFonts: false },
			{ allowVariableFonts: true },
			{ allowVariableLineHeights: false },
			{ allowVariableLineHeights: true },
		];

		for (const option of options) {
			context.editor.updateOptions(option);
			results.push(context.getHintSizing());
		}

		assert.deepStrictEqual(results, [
			{ fontSize: '10px', lineHeight: '15px' },
			{ fontSize: '5px', lineHeight: '8px' },
			{ fontSize: '6px', lineHeight: '8px' },
			{ fontSize: '6px', lineHeight: '10px' },
			{ fontSize: '24px', lineHeight: '40px' },
			{ fontSize: '6px', lineHeight: '10px' },
			{ fontSize: '24px', lineHeight: '40px' },
			{ fontSize: '6px', lineHeight: '10px' },
		]);
	});

	test('respects the variable-font override in accessibility mode', () => {
		const context = createHintEditor(store);
		const results = [context.getHintSizing()];

		context.setScreenReaderOptimized(true);
		results.push(context.getHintSizing());
		context.editor.updateOptions({ allowVariableFontsInAccessibilityMode: true });
		results.push(context.getHintSizing());
		context.editor.updateOptions({ allowVariableFonts: false });
		results.push(context.getHintSizing());
		context.editor.updateOptions({ allowVariableFontsInAccessibilityMode: false });
		results.push(context.getHintSizing());

		assert.deepStrictEqual(results, [
			{ fontSize: '10px', lineHeight: '15px' },
			{ fontSize: '20px', lineHeight: '30px' },
			{ fontSize: '10px', lineHeight: '15px' },
			{ fontSize: '10px', lineHeight: '15px' },
			{ fontSize: '20px', lineHeight: '30px' },
		]);
	});

	test('restores the smaller hint when the editor becomes empty again', () => {
		const context = createHintEditor(store);
		const before = context.getHintSizing();

		context.model.setValue('typed');
		context.editor.render(true);
		const hidden = context.container.querySelector('.empty-editor-hint') === null;
		context.model.setValue('');
		const after = context.getHintSizing();

		assert.deepStrictEqual({ before, hidden, after }, {
			before: { fontSize: '10px', lineHeight: '15px' },
			hidden: true,
			after: { fontSize: '10px', lineHeight: '15px' },
		});
	});
});

function createHintEditor(store: Pick<DisposableStore, 'add'>, withInlineChat = false) {
	const container = document.body.appendChild(document.createElement('div'));
	store.add(toDisposable(() => container.remove()));

	const instantiationService = createCodeEditorServices(store);
	const screenReaderChange = store.add(new Emitter<void>());
	let screenReaderOptimized = false;
	instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
		override onDidChangeScreenReaderOptimized = screenReaderChange.event;
		override isScreenReaderOptimized(): boolean { return screenReaderOptimized; }
	});
	instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() { });
	const agent = new class extends mock<IChatAgent>() {
		override locations = [ChatAgentLocation.EditorInline];
	};
	instantiationService.stub(IChatAgentService, {
		onDidChangeAgents: Event.None,
		getDefaultAgent: () => undefined,
		getActivatedAgents: () => withInlineChat ? [agent] : [],
	});
	instantiationService.stub(IInlineChatSessionService, {
		onWillStartSession: Event.None,
		onDidChangeSessions: Event.None,
		getSessionByTextModel: () => undefined,
	});

	const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
		fontSize: 20,
		lineHeight: 30,
		shrinkEmptyLines: 0.5,
		minimap: { enabled: false },
	}, { contributions: [] }));
	store.add(instantiationService.createInstance(EmptyTextEditorHintContribution, editor));
	const model = store.add(createTextModel('', null, undefined, URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' })));
	editor.setModel(model);
	store.add(new ShrinkEmptyLinesController(editor));
	editor.layout({ width: 1000, height: 500 });

	return {
		container,
		editor,
		model,
		setScreenReaderOptimized(value: boolean): void {
			screenReaderOptimized = value;
			screenReaderChange.fire();
		},
		getHintSizing() {
			editor.render(true);
			const hint = container.querySelector('.empty-editor-hint');
			assert.ok(hint);
			const style = getWindow(container).getComputedStyle(hint);
			return { fontSize: style.fontSize, lineHeight: style.lineHeight };
		},
	};
}
