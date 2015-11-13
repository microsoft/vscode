/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./rename';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import Severity from 'vs/base/common/severity';
import EventEmitter = require('vs/base/common/eventEmitter');
import {Range} from 'vs/editor/common/core/range';
import {IMessageService} from 'vs/platform/message/common/message';
import {IProgressService, IProgressRunner} from 'vs/platform/progress/common/progress';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

class LinkedEditingController {

	private editor: EditorCommon.ICommonCodeEditor;
	private listenersToRemove:EventEmitter.ListenerUnbind[];
	private decorations:string[];
	private isDisposed: boolean;
	private _onDispose: () => void;

	constructor(editor: EditorCommon.ICommonCodeEditor, selections: EditorCommon.ISelection[], ranges: EditorCommon.IRange[], onDispose: () => void) {
		this._onDispose = onDispose;
		this.editor = editor;
		this.isDisposed = false;

		// Decorate editing ranges
		this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
			var newDecorations: EditorCommon.IModelDeltaDecoration[] = [];
			for (var i = 0, len = selections.length; i < len; i++) {
				var className = 'linked-editing-placeholder';
				newDecorations.push({
					range: ranges[i],
					options: {
						className: className
					}
				});
			}

			this.decorations = changeAccessor.deltaDecorations([], newDecorations);
		});

		// Begin linked editing (multi-cursor)
		this.editor.setSelections(selections);

		this.listenersToRemove = [];
		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.CursorPositionChanged, (e:EditorCommon.ICursorPositionChangedEvent) => {
			if (this.isDisposed) {
				return;
			}
			var cursorCount = 1 + e.secondaryPositions.length;
			if (cursorCount !== this.decorations.length) {
				this.dispose();
			}
		}));
	}

	public onEnterOrEscape(): boolean {
		if (this.isDisposed) {
			return;
		}
		// Basically cancel multi-cursor
		this.editor.setSelection(this.editor.getSelection());
		this.dispose();
		return true;
	}

	public dispose(): void {
		if (this.isDisposed) {
			return;
		}
		this.isDisposed = true;
		this._onDispose();

		this.decorations = this.editor.deltaDecorations(this.decorations, []);

		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
	}

}

class LocalProgressService implements IProgressService {
	public serviceId = IProgressService;

	constructor(private _editor:EditorCommon.ICommonCodeEditor) {
		//
	}

	showWhile<T>(promise:TPromise<T>, delay?:number):TPromise<T> {

		var decoration: string,
			delayHandle: number;

		delayHandle = setTimeout(() => {
			decoration = this._addDecoration();
		}, delay || 0);

		return promise.then((value) => {
			clearTimeout(delayHandle);
			this._removeDecoration(decoration);
			return value;
		}, (err) => {
			clearTimeout(delayHandle);
			this._removeDecoration(decoration);
			throw err;
		});
	}

	private _addDecoration():string {

		var position = this._editor.getPosition(),
			word = this._editor.getModel().getWordAtPosition(position),
			decorationId:string;

		var decorations = this._editor.deltaDecorations([], [{
			range: {
				startLineNumber: position.lineNumber,
				startColumn: word.startColumn,
				endLineNumber: position.lineNumber,
				endColumn: word.endColumn
			},
			options: {
				inlineClassName: 'word-level-progress'
			}
		}]);

		return decorations[0];
	}

	private _removeDecoration(decorationId:string):void {
		if(decorationId) {
			this._editor.changeDecorations((accessor) => {
				accessor.deltaDecorations([decorationId], []);
			});
		}
	}

	public show(...args:any[]):IProgressRunner {
		throw new Error('not implemented');
	}
}

export class ChangeAllAction extends EditorAction {

	public static ID = 'editor.action.changeAll';

	private _idPool:number;
	private _messageService:IMessageService;
	private _progressService: IProgressService;
	private _currentController: LinkedEditingController;
	private _changeAllMode: IKeybindingContextKey<boolean>;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @IMessageService messageService: IMessageService, @IKeybindingService keybindingService: IKeybindingService) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable | Behaviour.ShowInContextMenu | Behaviour.UpdateOnCursorPositionChange);
		this._idPool = 0;
		this._messageService = messageService;
		this._progressService = new LocalProgressService(this.editor);
		this._currentController = null;
		this._changeAllMode = keybindingService.createKey(CONTEXT_CHANGE_ALL_MODE, false);
	}

	public getGroupId(): string {
		return '2_change/1_changeAll';
	}

	public isSupported():boolean {
		var mode = this.editor.getModel().getMode();

		return !!mode && !!mode.occurrencesSupport && super.isSupported();
	}

	public computeInfos(editor:EditorCommon.ICommonCodeEditor):TPromise<Modes.IOccurence[]> {
		var selection = editor.getSelection();
		var position = selection.getStartPosition();
		var model = editor.getModel();

		return this.editor.getModel().getMode().occurrencesSupport.findOccurrences(model.getAssociatedResource(), position);
	}

	public run():TPromise<boolean> {

		var myId = ++this._idPool,
			state = this.editor.captureState(EditorCommon.CodeEditorStateFlag.Position, EditorCommon.CodeEditorStateFlag.Value),
			capturedSelection = this.editor.getSelection(),
			infoPromise = this.computeInfos(this.editor);

		if(this._progressService) {
			this._progressService.showWhile(infoPromise, 500);
		}

		return infoPromise.then((infos:Modes.IOccurence[]) => {

			if(myId !== this._idPool) {
				return;
			}

			if(!state.validate(this.editor)) {
				return;
			}

			if(infos.length === 0) {
				return;
			}

			var ranges = infos.map((info) => {
				return info.range;
			});

			this._beginLinkedEditing(ranges, capturedSelection);

			return true;
		}, (e) => {
			this._messageService.show(Severity.Info, e);
		});
	}

	private _indexOf(ranges:EditorCommon.IRange[], lineNumber: number, column: number): number {
		var pos = {
			lineNumber: lineNumber,
			column: column
		};
		for (var i = 0; i < ranges.length; i++) {
			if (ranges[i].startLineNumber !== lineNumber) {
				// Only consider ranges that start on the same line as position
				continue;
			}
			if (Range.containsPosition(ranges[i], pos)) {
				return i;
			}
		}
		return -1;
	}

	private _beginLinkedEditing(ranges: EditorCommon.IRange[], capturedSelection: EditorCommon.IEditorSelection): void {
		if (this._currentController) {
			this._currentController.dispose();
			this._currentController = null;
		}
		var editorSelection = this.editor.getSelection();

		// Try to find a suitable range for the current editor position
		var foundRangeIndex = this._indexOf(ranges, editorSelection.positionLineNumber, editorSelection.positionColumn);

		if (foundRangeIndex === -1) {
			// Current editor position is outside of one of these ranges, try again with the original editor position
			editorSelection = capturedSelection;
			foundRangeIndex = this._indexOf(ranges, editorSelection.positionLineNumber, editorSelection.positionColumn);

			if (foundRangeIndex === -1) {
				// These ranges are bogus!
				return;
			}
		}

		var hasSelectionInFoundRange = false;
		if (!editorSelection.isEmpty()) {
			if (Range.containsPosition(ranges[foundRangeIndex], { lineNumber: editorSelection.selectionStartLineNumber, column: editorSelection.selectionStartColumn})) {
				hasSelectionInFoundRange = true;
			}
		}

		var deltaColumnForPosition: number, deltaColumnForStartSelection: number;
		if (hasSelectionInFoundRange) {
			deltaColumnForPosition = editorSelection.positionColumn - ranges[foundRangeIndex].startColumn;
			deltaColumnForStartSelection = editorSelection.selectionStartColumn - ranges[foundRangeIndex].startColumn;
		} else {
			deltaColumnForPosition = ranges[foundRangeIndex].endColumn - ranges[foundRangeIndex].startColumn;
			deltaColumnForStartSelection = 0;
		}

		var newEditorSelections: EditorCommon.ISelection[] = [];
		newEditorSelections.push({
			selectionStartLineNumber: ranges[foundRangeIndex].startLineNumber,
			selectionStartColumn: ranges[foundRangeIndex].startColumn + deltaColumnForStartSelection,
			positionLineNumber: ranges[foundRangeIndex].startLineNumber,
			positionColumn: ranges[foundRangeIndex].startColumn + deltaColumnForPosition,
		});

		for (var i = 0; i < ranges.length; i++) {
			if (i !== foundRangeIndex) {
				newEditorSelections.push({
					selectionStartLineNumber: ranges[i].startLineNumber,
					selectionStartColumn: ranges[i].startColumn + deltaColumnForStartSelection,
					positionLineNumber: ranges[i].startLineNumber,
					positionColumn: ranges[i].startColumn + deltaColumnForPosition,
				});
			}
		}

		this._changeAllMode.set(true);
		this._currentController = new LinkedEditingController(this.editor, newEditorSelections, ranges, () => {
			this._changeAllMode.reset();
		});
	}

	public leaveChangeAllMode(): void {
		if (this._currentController) {
			this._currentController.onEnterOrEscape();
			this._currentController = null;
		}
	}
}

var CONTEXT_CHANGE_ALL_MODE = 'inChangeAllMode';

var weight = CommonEditorRegistry.commandWeight(30);

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ChangeAllAction, ChangeAllAction.ID, nls.localize('changeAll.label', "Change All Occurrences"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.F2
}));
CommonEditorRegistry.registerEditorCommand('leaveChangeAllMode', weight, { primary: KeyCode.Enter, secondary: [KeyCode.Escape] }, true, CONTEXT_CHANGE_ALL_MODE,(ctx, editor, args) => {
	var action = <ChangeAllAction>editor.getAction(ChangeAllAction.ID);
	action.leaveChangeAllMode();
});