/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isChrome } from '../../../../base/browser/browser.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AccessibilitySupport, IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import '../../../browser/coreCommands.js';
import { CodeEditorWidget } from '../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { createTextModel } from '../../common/testTextModel.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

interface EditContextSelection {
	readonly text: string;
	readonly selectionStart: number;
	readonly selectionEnd: number;
}

suite('Native EditContext system-caret ownership', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	// Other browsers use the textarea path. Chromium must satisfy the native prerequisites.
	const testNativeEditContext = isChrome || typeof Reflect.get(getActiveWindow(), 'EditContext') === 'function' ? test : test.skip;

	for (const fixture of [
		{ name: 'ASCII', text: 'lrd code text' },
		{ name: 'BMP Unicode', text: 'a caf\u00e9 omega' },
		{ name: 'emoji', text: 'a\u{1f642} caf\u00e9 omega' },
		{ name: 'distinct supplementary characters', text: 'a\u{1f642}\u{1d11e} caf\u00e9 omega' },
		{ name: 'combining marks', text: 'a e\u0301 caf\u00e9 omega' },
		{ name: 'multiline Unicode', text: 'alpha\u{1f642}\nbravo\u{1d11e}\ncharlie\u{10437}' }
	]) {
		testNativeEditContext(`synchronizes the pending ${fixture.name} system caret with the model and native EditContext`, async () => {
			const disposables = new DisposableStore();
			const container = document.createElement('div');
			container.style.width = '800px';
			container.style.height = '300px';
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));

			// Wait for an actual browser event, without a timer or a synthetic event.
			const nextSelectionChange = (): Promise<void> => new Promise(resolve => {
				const listener = () => {
					document.removeEventListener('selectionchange', listener);
					resolve();
				};
				document.addEventListener('selectionchange', listener);
				disposables.add(toDisposable(() => document.removeEventListener('selectionchange', listener)));
			});

			try {
				const accessibilityService = new class extends TestAccessibilityService {
					override isScreenReaderOptimized(): boolean { return true; }
					override getAccessibilitySupport(): AccessibilitySupport { return AccessibilitySupport.Enabled; }
				};
				const instantiationService = createCodeEditorServices(disposables,
					new ServiceCollection([IAccessibilityService, accessibilityService]));
				const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {
					accessibilitySupport: 'on',
					editContext: true,
					renderRichScreenReaderContent: false,
					automaticLayout: false,
				}, { contributions: [] }));
				const model = disposables.add(createTextModel(fixture.text));
				editor.setModel(model);
				editor.layout({ width: 800, height: 300 });

				const input = container.querySelector<HTMLElement>('.native-edit-context');
				assert.ok(input, 'A real native EditContext view is required');
				assert.strictEqual(editor.getOption(EditorOption.editContext), true);
				const getEditContext = () => (input as HTMLElement & { editContext?: EditContextSelection }).editContext;
				assert.ok(getEditContext(), 'The browser must provide native EditContext');
				const snapshot = () => {
					const selection = document.getSelection();
					const position = editor.getPosition();
					assert.ok(position);
					const editContext = getEditContext();
					return {
						focused: document.activeElement === input,
						model: model.getOffsetAt(position),
						domAnchor: selection?.anchorOffset,
						domFocus: selection?.focusOffset,
						selectionInContent: selection?.anchorNode === input.firstChild && selection?.focusNode === input.firstChild,
						editContextStart: editContext?.selectionStart,
						editContextEnd: editContext?.selectionEnd,
						textEqualsFixture: input.textContent === fixture.text,
					};
				};
				const expected = (offset: number) => ({
					focused: true, model: offset, domAnchor: offset, domFocus: offset,
					selectionInContent: true,
					editContextStart: model.getPositionAt(offset).column - 1,
					editContextEnd: model.getPositionAt(offset).column - 1,
					textEqualsFixture: true,
				});

				const finalCharacter = Array.from(fixture.text).at(-1)!;
				const initialOffset = fixture.text.length - finalCharacter.length;
				const initialSelectionEvent = nextSelectionChange();
				editor.setPosition(model.getPositionAt(initialOffset));
				editor.focus();
				editor.render(true);
				await initialSelectionEvent;
				assert.deepStrictEqual(snapshot(), expected(initialOffset));

				const selection = document.getSelection();
				assert.ok(selection && input.firstChild);
				const externalSelectionEvent = nextSelectionChange();
				selection.setBaseAndExtent(input.firstChild, 1, input.firstChild, 1);
				assert.strictEqual(snapshot().model, initialOffset, 'The browser event is still queued');
				// Exercise the real render before the queued external selectionchange.
				editor.render(true);
				assert.strictEqual(snapshot().domFocus, 1, JSON.stringify(snapshot()));
				await externalSelectionEvent;
				assert.deepStrictEqual(snapshot(), expected(1));

				// These are real editor commands, not synthesized OS key events.
				editor.trigger('test', 'cursorRight', {});
				editor.render(true);
				const rightOffset = 1 + String.fromCodePoint(fixture.text.codePointAt(1)!).length;
				assert.deepStrictEqual(snapshot(), expected(rightOffset));
				editor.trigger('test', 'cursorLeft', {});
				editor.render(true);
				assert.deepStrictEqual(snapshot(), expected(1));

				editor.pushUndoStop();
				editor.trigger('test', 'type', { text: 'X' });
				editor.pushUndoStop();
				editor.render(true);
				const editedText = fixture.text.slice(0, 1) + 'X' + fixture.text.slice(1);
				assert.deepStrictEqual({
					model: model.getValue(), exposed: input.textContent,
					position: model.getOffsetAt(editor.getPosition()!),
					nativeText: getEditContext()?.text,
					nativeStart: getEditContext()?.selectionStart,
					nativeEnd: getEditContext()?.selectionEnd,
				}, {
					model: editedText, exposed: editedText, position: 2,
					nativeText: editedText.split('\n')[0], nativeStart: 2, nativeEnd: 2,
				});
				await model.undo();
				editor.render(true);
				assert.deepStrictEqual(snapshot(), expected(1));

				const control = document.createElement('button');
				control.textContent = 'other control';
				document.body.appendChild(control);
				disposables.add(toDisposable(() => control.remove()));
				control.focus();
				selection.collapse(control.firstChild, 1);
				editor.focus();
				editor.render(true);
				assert.deepStrictEqual(snapshot(), expected(1));
			} finally {
				disposables.dispose();
			}
		});
	}
});
