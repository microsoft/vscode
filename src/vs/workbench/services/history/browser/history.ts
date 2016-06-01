/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import nls = require('vs/nls');
import {EventType} from 'vs/base/common/events';
import {IEditor as IBaseEditor} from 'vs/platform/editor/common/editor';
import {TextEditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {Selection} from 'vs/editor/common/core/selection';
import {Position, IEditorInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';

/**
 * Stores the selection & view state of an editor and allows to compare it to other selection states.
 */
export class EditorState {

	private static EDITOR_SELECTION_THRESHOLD = 5; // number of lines to move in editor to justify for new state

	constructor(private _editorInput: IEditorInput, private _selection: Selection) {
	}

	public get editorInput(): IEditorInput {
		return this._editorInput;
	}

	public get selection(): Selection {
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
	protected toUnbind: IDisposable[];
	private activeEditorListeners: IDisposable[];

	constructor(
		private eventService: IEventService,
		protected editorService: IWorkbenchEditorService,
		protected contextService: IWorkspaceContextService
	) {
		this.toUnbind = [];
		this.activeEditorListeners = [];

		// Window Title
		window.document.title = this.getWindowTitle(null);

		// Editor Input Changes
		this.toUnbind.push(this.editorService.onEditorsChanged(() => this.onEditorsChanged()));
	}

	private onEditorsChanged(): void {

		// Dispose old listeners
		dispose(this.activeEditorListeners);
		this.activeEditorListeners = [];

		let activeEditor = this.editorService.getActiveEditor();
		let activeInput = activeEditor ? activeEditor.input : void 0;

		// Propagate to history
		this.onEditorEvent(activeEditor);

		// Apply listener for dirty changes
		if (activeInput instanceof EditorInput) {
			this.activeEditorListeners.push(activeInput.onDidChangeDirty(() => {
				this.updateWindowTitle(activeInput); // Calculate New Window Title when dirty state changes
			}));
		}

		// Apply listener for selection changes if this is a text editor
		if (activeEditor instanceof BaseTextEditor) {
			const control = activeEditor.getControl();
			this.activeEditorListeners.push(control.onDidChangeCursorPosition(event => {
				this.handleEditorSelectionChangeEvent(activeEditor);
			}));
		}
	}

	private onEditorEvent(editor: IBaseEditor): void {
		let input = editor ? editor.input : null;

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
			if ((<EditorInput>input).isDirty() && !platform.isMacintosh /* Mac has its own decoration in window */) {
				prefix = nls.localize('prefixDecoration', "\u25cf {0}", prefix);
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
		this.toUnbind = dispose(this.toUnbind);
	}
}

interface IStackEntry {
	input: IEditorInput;
	options?: TextEditorOptions;
}

export class HistoryService extends BaseHistoryService implements IHistoryService {

	public serviceId = IHistoryService;

	private static MAX_HISTORY_ITEMS = 200;

	private stack: IStackEntry[];
	private index: number;
	private blockEditorEvent: boolean;
	private currentFileEditorState: EditorState;

	constructor(
		eventService: IEventService,
		editorService: IWorkbenchEditorService,
		contextService: IWorkspaceContextService
	) {
		super(eventService, editorService, contextService);

		this.index = -1;
		this.stack = [];
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

	public clear(): void {
		this.index = -1;
		this.stack.splice(0);
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

		// If we are not at the end of history, we remove anything after
		if (this.stack.length > this.index + 1) {
			this.stack = this.stack.slice(0, this.index + 1);
		}

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
		input.addOneTimeDisposableListener(EventType.DISPOSE, () => {
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