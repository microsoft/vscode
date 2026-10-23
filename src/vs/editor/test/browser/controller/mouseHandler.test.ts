/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { Color } from '../../../../base/common/color.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../browser/widget/codeEditor/codeEditorWidget.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('MouseHandler', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let previousColorMap: Color[] | null;

	suiteSetup(() => {
		// Without a token color map, the minimap of a real editor view reports unexpected errors
		previousColorMap = TokenizationRegistry.getColorMap();
		TokenizationRegistry.setColorMap([null!, Color.black, Color.white]);
	});

	suiteTeardown(() => {
		TokenizationRegistry.setColorMap(previousColorMap!);
	});

	function dispatchMouseMove(target: EventTarget, clientX: number, clientY: number): void {
		target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true, clientX, clientY }));
	}

	test('in an open shadow root, moving inside the editor does not fire onMouseLeave and moving outside does', () => {
		// Arrange
		const shadowHost = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(shadowHost);
		disposables.add(toDisposable(() => shadowHost.remove()));
		const container = mainWindow.document.createElement('div');
		shadowHost.attachShadow({ mode: 'open' }).appendChild(container);

		const instantiationService = createCodeEditorServices(disposables);
		const model = disposables.add(instantiateTextModel(instantiationService, 'hello world'));
		const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {}, { contributions: [] }));
		editor.setModel(model);
		editor.layout({ width: 400, height: 200 });

		const editorDomNode = editor.getDomNode()!;
		const editorRect = editorDomNode.getBoundingClientRect();
		const log: string[] = [];
		disposables.add(editor.onMouseMove(() => log.push('onMouseMove')));
		disposables.add(editor.onMouseLeave(() => log.push('onMouseLeave')));

		// Act
		log.push('move inside');
		dispatchMouseMove(editorDomNode, editorRect.left + 10, editorRect.top + 10);
		log.push('move inside');
		dispatchMouseMove(editorDomNode, editorRect.left + 20, editorRect.top + 10);
		log.push('move outside');
		dispatchMouseMove(mainWindow.document.body, editorRect.left + 10, editorRect.bottom + 10);

		// Assert
		assert.deepStrictEqual(log, [
			'move inside', 'onMouseMove',
			'move inside', 'onMouseMove',
			'move outside', 'onMouseLeave',
		]);
	});
});
