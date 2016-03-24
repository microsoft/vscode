/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import * as nls from 'vs/nls';
// import {onUnexpectedError} from 'vs/base/common/errors';
import {KeyCode} from 'vs/base/common/keyCodes';
// import Severity from 'vs/base/common/severity';
// import {TPromise} from 'vs/base/common/winjs.base';
// import {IEditorService} from 'vs/platform/editor/common/editor';
// import {IEventService} from 'vs/platform/event/common/event';
// import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
// import {IMarkerService} from 'vs/platform/markers/common/markers';
// import {IMessageService} from 'vs/platform/message/common/message';
// import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
// import {EditorAction} from 'vs/editor/common/editorAction';
// import {ICommonCodeEditor, IEditorActionDescriptorData, IEditorContribution, IRange} from 'vs/editor/common/editorCommon';
import {ICommonCodeEditor, IEditorContribution} from 'vs/editor/common/editorCommon';
// import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
// import {bulkEdit} from 'vs/editor/common/services/bulkEdit';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
// import {IQuickFix2, QuickFixRegistry} from '../common/quickFix';
// import {QuickFixModel} from './quickFixModel';
// import {QuickFixSelectionWidget} from './quickFixSelectionWidget';


class PerfController implements IEditorContribution {

	static ID = 'editor.contrib.perfController';

	static getPerfController(editor:ICommonCodeEditor): PerfController {
		return <PerfController>editor.getContribution(PerfController.ID);
	}

	private _editor: ICodeEditor;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
	}

	public test1(): void {
		let sizes = [
			{width:200, height:500},
			{width:250, height:500},
			{width:300, height:500},
			{width:350, height:500},
			{width:400, height:500},
			{width:450, height:500},
			{width:500, height:500},
			{width:550, height:500},
			{width:600, height:500}
		];
		let funcs:Function[] = [];

		for (let i = 0; i < 100; i++) {
			for (let j = 0; j < sizes.length; j++) {
				let size = sizes[j];

				funcs.push(function(size) {
					this._editor.layout({width:size.width, height:size.height});
				}.bind(this, size));
			}
		}

		let run = () => {
			let func = funcs.shift();
			if (func) {
				func();
				this._editor.render();
				setTimeout(run, 20);
			}
		};

		setTimeout(run, 20);
	}

	public test2(): void {
		let funcs:Function[] = [];

		let lineIndex = 0;
		let lineCount = this._editor.getModel().getLineCount();
		for (let i = 0; i < 1000; i++) {
			lineIndex = (i % lineCount);

			funcs.push(function(lineIndex) {
				this._editor.setPosition({ lineNumber: lineIndex + 1, column: 1 });
				this._editor.revealPosition({ lineNumber: lineIndex + 1, column: 1 });
			}.bind(this, lineIndex));
		}

		let run = () => {
			let func = funcs.shift();
			if (func) {
				func();
				this._editor.render();
				setTimeout(run, 20);
			}
		};

		setTimeout(run, 20);
	}

	public getId(): string {
		return PerfController.ID;
	}

	public dispose(): void {

	}
}

CommonEditorRegistry.registerEditorCommand('perfTest1', 1000, { primary: KeyCode.F1 }, false, null, (ctx, editor, args) => {
	var controller = PerfController.getPerfController(editor);
	controller.test1();
});
CommonEditorRegistry.registerEditorCommand('perfTest2', 1000, { primary: KeyCode.F2 }, false, null, (ctx, editor, args) => {
	var controller = PerfController.getPerfController(editor);
	controller.test2();
});

EditorBrowserRegistry.registerEditorContribution(PerfController);