/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Event} from 'vs/base/common/events';
import {IEditorSelection} from 'vs/editor/common/editorCommon';
import CommonEvents = require('vs/workbench/common/events');
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {Position} from 'vs/platform/editor/common/editor';

export import EventType = CommonEvents.EventType;

/**
 * Editor events are being emitted when the editor input changes, shows, is being saved or when the editor content changes.
 */
export class EditorEvent extends Event {
	public editor: BaseEditor;
	public editorId: string;
	public editorInput: EditorInput;
	public editorOptions: EditorOptions;
	public position: Position;

	private prevented: boolean;

	constructor(editor: BaseEditor, editorId: string, editorInput: EditorInput, editorOptions: EditorOptions, position: Position, originalEvent?: any) {
		super(originalEvent);

		this.editor = editor;
		this.editorId = editorId;
		this.editorInput = editorInput;
		this.editorOptions = editorOptions;
		this.position = position;
	}

	public prevent(): void {
		this.prevented = true;
	}

	public isPrevented(): boolean {
		return this.prevented;
	}
}

/**
 * Editor input events are being emitted when the editor input state changes.
 */
export class EditorInputEvent extends Event {
	public editorInput: EditorInput;

	constructor(editorInput: EditorInput, originalEvent?: any) {
		super(originalEvent);

		this.editorInput = editorInput;
	}
}

/**
 * A subclass of EditorEvent for text editor selection changes.
 */
export class TextEditorSelectionEvent extends EditorEvent {
	public selection: IEditorSelection;

	constructor(selection: IEditorSelection, editor: BaseEditor, editorId: string, editorInput: EditorInput, editorOptions: EditorOptions, position: Position, originalEvent?: any) {
		super(editor, editorId, editorInput, editorOptions, position, originalEvent);

		this.selection = selection;
	}
}