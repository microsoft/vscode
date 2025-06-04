/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MiddleScrollController } from '../../browser/middleScroll.contribution.js';
import { ITestCodeEditor, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

suite('middleScroll', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function mockEditorDomNode(editor: ITestCodeEditor) {
		const domNode = document.createElement('div');
		stub(editor, 'getDomNode').returns(domNode);
		return domNode;
	}

	test('Adds the class to body', () => {
		withTestCodeEditor('test', {}, (editor) => {
			const editorDomNode = mockEditorDomNode(editor);
			const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

			middleScrollController.startScroll(10, 10);

			assert.ok(editorDomNode.classList.contains('scroll-editor-on-middle-click-editor'));

			middleScrollController.dispose();
		});
	});

	test('Removes the class from body', () => {
		withTestCodeEditor('test', {}, (editor) => {
			const editorDomNode = mockEditorDomNode(editor);
			const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

			middleScrollController.startScroll(10, 10);

			middleScrollController.stopScroll();

			assert.ok(!editorDomNode.classList.contains('scroll-editor-on-middle-click-editor'));

			middleScrollController.dispose();
		});
	});

	suite("directions", () => {
		test('n', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(10, 0);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'n');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(-2.5));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(0));

				middleScrollController.dispose();
			});
		});
		test('ne', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(20, 0);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'ne');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(-2.5));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(2.5));

				middleScrollController.dispose();
			});
		});
		test('e', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(20, 10);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'e');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(0));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(2.5));

				middleScrollController.dispose();
			});
		});
		test('se', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(20, 20);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'se');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(2.5));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(2.5));

				middleScrollController.dispose();
			});
		});
		test('s', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(10, 20);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 's');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(2.5));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(0));

				middleScrollController.dispose();
			});
		});
		test('sw', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(0, 20);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'sw');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(2.5));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(-2.5));

				middleScrollController.dispose();
			});
		});
		test('w', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(0, 10);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'w');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(0));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(-2.5));

				middleScrollController.dispose();
			});
		});
		test('nw', () => {
			withTestCodeEditor('test', {}, (editor) => {
				const editorDomNode = mockEditorDomNode(editor);
				const setScrollTopSpy = stub(editor, "setScrollTop");
				const setScrollLeftSpy = stub(editor, "setScrollLeft");
				const middleScrollController = editor.registerAndInstantiateContribution(MiddleScrollController.ID, MiddleScrollController);

				middleScrollController.startScroll(10, 10);
				middleScrollController.setCurrent(0, 0);
				middleScrollController.scrollPane();

				assert.equal(editorDomNode.getAttribute('data-scroll-direction'), 'nw');
				assert.ok(setScrollTopSpy.lastCall.calledWithExactly(-2.5));
				assert.ok(setScrollLeftSpy.lastCall.calledWithExactly(-2.5));

				middleScrollController.dispose();
			});
		});
	});
});
