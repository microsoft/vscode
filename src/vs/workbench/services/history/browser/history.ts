/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import nls = require('vs/nls');
import {EventType} from 'vs/base/common/events';
import {IEditorSelection} from 'vs/editor/common/editorCommon';
import {IEditor as IBaseEditor} from 'vs/platform/editor/common/editor';
import {TextEditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {EditorEvent, TextEditorSelectionEvent, EventType as WorkbenchEventType, EditorInputEvent} from 'vs/workbench/common/events';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {Selection} from 'vs/editor/common/core/selection';
import {Position, IEditorInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

/**
 * Stores the selection & view state of an editor and allows to compare it to other selection states.
 */
export class EditorState {

	private static EDITOR_SELECTION_THRESHOLD = 5; // number of lines to move in editor to justify for new state

	constructor(private _editorInput: IEditorInput, private _selection: IEditorSelection) {
		//
	}

	public get editorInput(): IEditorInput {
		return this._editorInput;
	}

	public get selection(): IEditorSelection {
		return this._selection;
	}

	public justifiesNewPushState(other: EditorState): boolean {
		if (!this._editorInput.matches(other._editorInput)) {
			// push different editor inputs
			return true;
		}

		if (!Selection.isISelection(this._selection) || !Selection.isISelection(other._selection)) {
			// unknown selections
			return true;
		}

		let liftedSelection = Selection.liftSelection(this._selection);
		let liftedOtherSelection = Selection.liftSelection(other._selection);

		if (Math.abs(liftedSelection.getStartPosition().lineNumber - liftedOtherSelection.getStartPosition().lineNumber) < EditorState.EDITOR_SELECTION_THRESHOLD) {
			// ignore selection changes in the range of EditorState.EDITOR_SELECTION_THRESHOLD lines
			return false;
		}

		return true;
	}
}

interface IInputWithPath {
	getPath?: () => string;
}

export abstract class BaseHistoryService {
	protected toUnbind: { (): void; }[];

	constructor(
		private eventService: IEventService,
		protected editorService: IWorkbenchEditorService,
		protected contextService: IWorkspaceContextService
	) {
		this.toUnbind = [];

		// Window Title
		window.document.title = this.getWindowTitle(null);

		// Editor Input Changes
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_CHANGED, (e: EditorEvent) => this.onEditorInputChanged(e)));

		// Editor Input State Changes
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_STATE_CHANGED, (e: EditorInputEvent) => this.onEditorInputStateChanged(e.editorInput)));

		// Text Editor Selection Changes
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.TEXT_EDITOR_SELECTION_CHANGED, (event: TextEditorSelectionEvent) => this.onTextEditorSelectionChanged(event)));
	}

	private onEditorInputStateChanged(input: IEditorInput): void {

		// If an active editor is set, but is different from the one from the event, prevent update because the editor is not active.
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && !input.matches(activeEditor.input)) {
			return;
		}

		// Calculate New Window Title
		this.updateWindowTitle(input);
	}

	private onTextEditorSelectionChanged(event: TextEditorSelectionEvent): void {

		// If an active editor is set, but is different from the one from the event, prevent update because the editor is not active.
		let editor = event.editor;
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && editor && activeEditor !== editor) {
			return;
		}

		// Delegate to implementors
		this.handleEditorSelectionChangeEvent(event.editor);
	}

	private onEditorInputChanged(event: EditorEvent): void {
		this.onEditorEvent(event.editor);
	}

	private onEditorEvent(editor: IBaseEditor): void {
		let input = editor ? editor.input : null;

		// If an active editor is set, but is different from the one from the event, prevent update because the editor is not active.
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && editor && activeEditor !== editor) {
			return;
		}

		// Calculate New Window Title
		this.updateWindowTitle(input);

		// Delegate to implementors
		this.handleEditorInputChangeEvent(editor);
	}

	private updateWindowTitle(input?: IEditorInput): void {
		let windowTitle: string = null;
		if (input && input.getName()) {
			windowTitle = this.getWindowTitle(input);
		} else {
			windowTitle = this.getWindowTitle(null);
		}

		window.document.title = windowTitle;
	}

	protected abstract handleEditorSelectionChangeEvent(editor?: IBaseEditor): void;

	protected abstract handleEditorInputChangeEvent(editor?: IBaseEditor): void;

	protected getWindowTitle(input?: IEditorInput): string {
		let title = this.doGetWindowTitle(input);

		// Extension Development Host gets a special title to identify itself
		if (this.contextService.getConfiguration().env.extensionDevelopmentPath) {
			return nls.localize('devExtensionWindowTitle', "[Extension Development Host] - {0}", title);
		}

		return title;
	}

	private doGetWindowTitle(input?: IEditorInput): string {
		const appName = this.contextService.getConfiguration().env.appName;

		let prefix = input && input.getName();
		if (prefix && input) {
			let status = (<EditorInput>input).getStatus();
			if (status && status.decoration && !platform.isMacintosh /* Mac has its own decoration in window */) {
				prefix = nls.localize('prefixDecoration', "{0} {1}", status.decoration, prefix);
			}
		}

		let workspace = this.contextService.getWorkspace();
		if (workspace) {
			let wsName = workspace.name;

			if (prefix) {
				if (platform.isMacintosh) {
					return nls.localize('prefixWorkspaceTitleMac', "{0} - {1}", prefix, wsName); // Mac: do not append base title
				}

				return nls.localize('prefixWorkspaceTitle', "{0} - {1} - {2}", prefix, wsName, appName);
			}

			if (platform.isMacintosh) {
				return wsName; // Mac: do not append base title
			}

			return nls.localize('workspaceTitle', "{0} - {1}", wsName, appName);
		}

		if (prefix) {
			if (platform.isMacintosh) {
				return prefix; // Mac: do not append base title
			}

			return nls.localize('prefixTitle', "{0} - {1}", prefix, appName);
		}

		return appName;
	}

	protected findVisibleEditorPosition(input: IEditorInput): Position {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && input.matches(activeEditor.input)) {
			return activeEditor.position;
		}

		let editors = this.editorService.getVisibleEditors();
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];
			if (editor !== activeEditor && input.matches(editor.input)) {
				return editor.position;
			}
		}

		return null;
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}

interface IStackEntry {
	input: IEditorInput;
	options?: TextEditorOptions;
}

export class HistoryService extends BaseHistoryService implements IHistoryService {

	public serviceId = IHistoryService;

	private static MAX_HISTORY_ITEMS = 200;

	private _stack: IStackEntry[];
	private index: number;
	private blockEditorEvent: boolean;
	private currentFileEditorState: EditorState;
	private quickOpenService: IQuickOpenService;

	constructor(
		eventService: IEventService,
		editorService: IWorkbenchEditorService,
		contextService: IWorkspaceContextService,
		quickOpenService: IQuickOpenService
	) {
		super(eventService, editorService, contextService);

		this.quickOpenService = quickOpenService;

		this.index = -1;
	}

	private get stack(): IStackEntry[] {

		// Seed our stack from the persisted editor history
		if (!this._stack) {
			this._stack = [];
			let history = this.quickOpenService.getEditorHistory();

			for (let i = history.length - 1; i >= 0; i--) {
				this.addToStack(history[i]);
			}
		}

		return this._stack;
	}

	public forward(): void {
		if (this.stack.length > this.index + 1) {
			this.index++;
			this.navigate();
		}
	}

	public back(): void {
		if (this.index > 0) {
			this.index--;
			this.navigate();
		}
	}

	private navigate(): void {
		let state = this.stack[this.index];

		this.blockEditorEvent = true;
		this.editorService.openEditor(state.input, state.options, this.findVisibleEditorPosition(state.input)).done(() => {
			this.blockEditorEvent = false;
		}, (error) => {
			this.blockEditorEvent = false;
			errors.onUnexpectedError(error);
		});
	}

	protected handleEditorSelectionChangeEvent(editor?: IBaseEditor): void {
		this.handleEditorEvent(editor, true);
	}

	protected handleEditorInputChangeEvent(editor?: IBaseEditor): void {
		this.handleEditorEvent(editor, false);
	}

	private handleEditorEvent(editor: IBaseEditor, storeSelection: boolean): void {
		if (this.blockEditorEvent) {
			return; // while we open an editor due to a navigation, we do not want to update our stack
		}

		if (editor instanceof BaseTextEditor && editor.input) {
			this.handleTextEditorEvent(<BaseTextEditor>editor, storeSelection);

			return;
		}

		this.currentFileEditorState = null; // at this time we have no active file editor view state

		if (editor && editor.input) {
			this.handleNonTextEditorEvent(editor);
		}
	}

	private handleTextEditorEvent(editor: BaseTextEditor, storeSelection: boolean): void {
		let stateCandidate = new EditorState(editor.input, editor.getSelection());
		if (!this.currentFileEditorState || this.currentFileEditorState.justifiesNewPushState(stateCandidate)) {
			this.currentFileEditorState = stateCandidate;

			let options: TextEditorOptions;
			if (storeSelection) {
				options = new TextEditorOptions();
				options.selection(editor.getSelection().startLineNumber, editor.getSelection().startColumn);
			}

			this.addToStack(editor.input, options);
		}
	}

	private handleNonTextEditorEvent(editor: IBaseEditor): void {
		let currentStack = this.stack[this.index];
		if (currentStack && currentStack.input.matches(editor.input)) {
			return; // do not push same editor input again
		}

		this.addToStack(editor.input);
	}

	private addToStack(input: IEditorInput, options?: TextEditorOptions): void {

		// Overwrite an entry in the stack if we have a matching input that comes
		// with editor options to indicate that this entry is more specific.
		let replace = false;
		if (this.stack[this.index]) {
			let currentEntry = this.stack[this.index];
			if (currentEntry.input.matches(input) && !currentEntry.options) {
				replace = true;
			}
		}

		let entry = {
			input: input,
			options: options
		};

		// Replace at current position
		if (replace) {
			this.stack[this.index] = entry;
		}

		// Add to stack at current position
		else {
			this.index++;
			this.stack.splice(this.index, 0, entry);

			// Check for limit
			if (this.stack.length > HistoryService.MAX_HISTORY_ITEMS) {
				this.stack.shift(); // remove first
				if (this.index > 0) {
					this.index--;
				}
			}
		}

		// Take out on dispose
		input.addOneTimeListener(EventType.DISPOSE, () => {
			this.stack.forEach((e, i) => {
				if (e.input.matches(input)) {
					this.stack.splice(i, 1);
					if (this.index >= i) {
						this.index--; // reduce index if the element is before index
					}
				}
			});
		});
	}
}