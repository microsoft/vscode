/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {Event} from 'vs/base/common/events';
import {IEditorSelection} from 'vs/editor/common/editorCommon';
import {IEditor} from 'vs/platform/editor/common/editor';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {Position} from 'vs/platform/editor/common/editor';

/**
 * All workbench events are listed here. For DOM events, see Monaco.Base.DomUtils.EventType.
 */
export class EventType {

	/**
	 * Event type for when an editor is opened. This event is only sent once for a specific editor type until another
	 * editor type gets opened. For example, when the user opens a file, the editorOpened event will be sent. If another
	 * file is opened, this event will not be fired again. If the user opens, e.g. the diff editor, editorOpened will be
	 * fired, since another editor type opened.
	 */
	static EDITOR_OPENED = 'editorOpened';

	/**
	 * Event type for when an editor is closed because another editor type is opened.
	 */
	static EDITOR_CLOSED = 'editorClosed';

	/**
	 * Event to indciate that an editor input is about to open. This event can be prevented to do something else instead.
	 */
	static EDITOR_INPUT_OPENING = 'editorInputOpening';

	/**
	 * Event type for when the editor input is about to change. This event is being sent before (!) the input is being set
	 * to the active editor. Use EDITOR_INPUT_CHANGED to react after the input has been set and displayed by the editor.
	 *
	 * Note: This event will also be emitted when multiple editors are open and the user sets focus from the active editor
	 * to another one. This allows to detect a focus change of the active editor.
	 */
	static EDITOR_INPUT_CHANGING = 'editorInputChanging';

	/**
	 * Event type to indicate that the editor options of the current active editor are changing.
	 */
	static EDITOR_OPTIONS_CHANGING = 'editorOptionsChanging';

	/**
	 * Event type for when the editor input has been changed in the currently active editor. This event is being sent after
	 * the input has been set and displayed by the editor.
	 *
	 * Note: This event will also be emitted when multiple editors are open and the user sets focus from the active editor
	 * to another one. This allows to detect a focus change of the active editor.
	 */
	static EDITOR_INPUT_CHANGED = 'editorInputChanged';

	/**
	 * Event type for when the editor input state changed.
	 */
	static EDITOR_INPUT_STATE_CHANGED = 'editorInputStateChanged';

	/**
	 * Event type for when the editor input failed to be set to the editor.
	 */
	static EDITOR_SET_INPUT_ERROR = 'editorSetInputError';

	/**
	 * Event type for when the editor position has been changed
	 */
	static EDITOR_POSITION_CHANGED = 'editorPositionChanged';

	/**
	 * An event type that fires when a text editor changes its selection.
	 */
	static TEXT_EDITOR_SELECTION_CHANGED = 'textEditorSelectionChanged';

	/**
	 * An event type that fires when a text editor mode changes.
	 */
	static TEXT_EDITOR_MODE_CHANGED = 'textEditorModeChanged';

	/**
	 * An event type that fires when a text editor content changes.
	 */
	static TEXT_EDITOR_CONTENT_CHANGED = 'textEditorContentChanged';

	/**
	 * An event type that fires when a text editor content options changed.
	 */
	static TEXT_EDITOR_CONTENT_OPTIONS_CHANGED = 'textEditorContentOptionsChanged';

	/**
	 * An event type that fires when a text editor's configuration changes.
	 */
	static TEXT_EDITOR_CONFIGURATION_CHANGED = 'textEditorOptionsChanged';

	/**
	 * Event type for when a composite is about to open.
	 */
	static COMPOSITE_OPENING = 'compositeOpening';

	/**
	 * Event type for when a composite is opened.
	 */
	static COMPOSITE_OPENED = 'compositeOpened';

	/**
	 * Event type for when a composite is closed.
	 */
	static COMPOSITE_CLOSED = 'compositeClosed';

	/**
	 * Event type for when the workbench has been fully created.
	 */
	static WORKBENCH_CREATED = 'workbenchCreated';

	/**
	 * Event type for when the workbench is about to being disposed.
	 */
	static WORKBENCH_DISPOSING = 'workbenchDisposing';

	/**
	 * Event type for when the workbench is fully disposed.
	 */
	static WORKBENCH_DISPOSED = 'workbenchDisposed';

	/**
	 * Event type for when an untitled file is becoming dirty.
	 */
	static UNTITLED_FILE_DIRTY = 'untitledFileDirty';

	/**
	 * Event type for when an untitled file is deleted.
	 */
	static UNTITLED_FILE_DELETED = 'untitledFileDeleted';

	/**
	 * Event type for when a resources encoding changes.
	 */
	static RESOURCE_ENCODING_CHANGED = 'resourceEncodingChanged';

	/**
	 * Event type for when the workbench options change. Listeners should refresh their
	 * assumption on workbench options after this event is emitted.
	 */
	static WORKBENCH_OPTIONS_CHANGED = 'workbenchOptionsChanged';
}

/**
 * Editor events are being emitted when the editor input changes, shows, is being saved or when the editor content changes.
 */
export class EditorEvent extends Event {
	public editor: IEditor;
	public editorId: string;
	public editorInput: EditorInput;
	public editorOptions: EditorOptions;
	public position: Position;

	private prevented: boolean;

	constructor(editor: IEditor, editorId: string, editorInput: EditorInput, editorOptions: EditorOptions, position: Position, originalEvent?: any) {
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

	constructor(selection: IEditorSelection, editor: IEditor, editorId: string, editorInput: EditorInput, editorOptions: EditorOptions, position: Position, originalEvent?: any) {
		super(editor, editorId, editorInput, editorOptions, position, originalEvent);

		this.selection = selection;
	}
}

/**
 * Option change events are send when the options in the running instance change.
 */
export class OptionsChangeEvent extends Event {
	public key: string;
	public before: any;
	public after: any;

	constructor(key: string, before: any, after: any, originalEvent?: any) {
		super(originalEvent);

		this.key = key;
		this.before = before;
		this.after = after;
	}
}

/**
 * Command events are emitted when an action is being executed through a command handler (Keybinding).
 */
export class CommandEvent extends Event {
	public actionId: string;

	constructor(actionId: string, originalEvent?: any) {
		super(originalEvent);

		this.actionId = actionId;
	}
}

/**
 * Composite events are emitted when a composite opens or closes in the sidebar or panel.
 */
export class CompositeEvent extends Event {
	public compositeId: string;

	constructor(compositeId: string, originalEvent?: any) {
		super(originalEvent);

		this.compositeId = compositeId;
	}
}

export class ResourceEvent extends Event {
	public resource: URI;

	constructor(resource: URI, originalEvent?: any) {
		super(originalEvent);

		this.resource = resource;
	}
}

export class UntitledEditorEvent extends ResourceEvent {
	// No new methods
}