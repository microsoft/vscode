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
import {TextEditorOptions, EditorInput, IGroupEvent, IEditorRegistry, Extensions} from 'vs/workbench/common/editor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {Selection} from 'vs/editor/common/core/selection';
import {Position, IEditorInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {Registry} from 'vs/platform/platform';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

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

interface ISerializedEditorInput {
	id: string;
	value: string;
}

interface IInputWithPath {
	getPath?: () => string;
}

export abstract class BaseHistoryService {
	protected toUnbind: IDisposable[];

	private activeEditorListeners: IDisposable[];

	constructor(
		private eventService: IEventService,
		protected editorGroupService: IEditorGroupService,
		protected editorService: IWorkbenchEditorService,
		protected contextService: IWorkspaceContextService
	) {
		this.toUnbind = [];
		this.activeEditorListeners = [];

		// Window Title
		window.document.title = this.getWindowTitle(null);

		// Editor Input Changes
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
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
		this.handleActiveEditorChange(editor);
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

	protected abstract handleActiveEditorChange(editor?: IBaseEditor): void;

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

	private static STORAGE_KEY = 'history.entries';
	private static MAX_HISTORY_ITEMS = 200;
	private static MAX_STACK_ITEMS = 20;
	private static MAX_RECENTLY_CLOSED_EDITORS = 20;

	private stack: IStackEntry[];
	private index: number;
	private blockStackChanges: boolean;
	private currentFileEditorState: EditorState;

	private history: IEditorInput[];
	private recentlyClosed: IEditorInput[];
	private loaded: boolean;
	private registry: IEditorRegistry;

	constructor(
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(eventService, editorGroupService, editorService, contextService);

		this.index = -1;
		this.stack = [];
		this.recentlyClosed = [];
		this.loaded = false;
		this.registry = Registry.as<IEditorRegistry>(Extensions.Editors);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.lifecycleService.onShutdown(() => this.save()));
		this.toUnbind.push(this.editorGroupService.onEditorOpenFail(editor => this.remove(editor)));
		this.toUnbind.push(this.editorGroupService.getStacksModel().onEditorClosed(event => this.onEditorClosed(event)));
	}

	private onEditorClosed(event: IGroupEvent): void {

		// Track closing of pinned editor to support to reopen closed editors
		if (event.pinned) {
			const editor = this.restoreInput(event.editor); // closed editors are always disposed so we need to restore
			if (editor) {

				// Remove all inputs matching and add as last recently closed
				this.removeFromRecentlyClosed(editor);
				this.recentlyClosed.push(editor);

				// Bounding
				if (this.recentlyClosed.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
					this.recentlyClosed.shift();
				}

				// Restore on dispose
				editor.addOneTimeDisposableListener(EventType.DISPOSE, () => {
					this.restoreInRecentlyClosed(editor);
				});
			}
		}
	}

	public popLastClosedEditor(): IEditorInput {
		this.ensureLoaded();

		return this.recentlyClosed.pop();
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
		this.ensureLoaded();

		this.index = -1;
		this.stack.splice(0);
		this.history = [];
		this.recentlyClosed = [];
	}

	private navigate(): void {
		let state = this.stack[this.index];

		this.blockStackChanges = true;
		this.editorService.openEditor(state.input, state.options, this.findVisibleEditorPosition(state.input)).done(() => {
			this.blockStackChanges = false;
		}, (error) => {
			this.blockStackChanges = false;
			errors.onUnexpectedError(error);
		});
	}

	private findVisibleEditorPosition(input: IEditorInput): Position {
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

	protected handleEditorSelectionChangeEvent(editor?: IBaseEditor): void {
		this.handleEditorEventInStack(editor, true);
	}

	protected handleActiveEditorChange(editor?: IBaseEditor): void {
		this.handleEditorEventInHistory(editor);
		this.handleEditorEventInStack(editor, false);
	}

	private handleEditorEventInHistory(editor?: IBaseEditor): void {
		const input = editor ? editor.input : void 0;

		// Ensure we have at least a name to show
		if (!input || !input.getName()) {
			return;
		}

		this.ensureLoaded();

		// Remove any existing entry and add to the beginning
		this.removeFromHistory(input);
		this.history.unshift(input);

		// Respect max entries setting
		if (this.history.length > HistoryService.MAX_HISTORY_ITEMS) {
			this.history.pop();
		}

		// Restore on dispose
		input.addOneTimeDisposableListener(EventType.DISPOSE, () => {
			this.restoreInHistory(input);
		});
	}

	private restoreInHistory(input: IEditorInput): void {
		let index = this.indexOf(input);
		if (index < 0) {
			return;
		}

		// Using the factory we try to recreate the input
		const restoredInput = this.restoreInput(input);
		if (restoredInput) {
			this.history[index] = restoredInput;
		}

		// Factory failed, just remove entry then
		else {
			this.removeFromHistory(input, index);
		}
	}

	public remove(input: IEditorInput): void {
		this.removeFromHistory(input);
		this.removeFromStack(input);
		setTimeout(() => this.removeFromRecentlyClosed(input)); // race condition with editor close and dispose
	}

	private removeFromHistory(input: IEditorInput, index?: number): void {
		this.ensureLoaded();

		if (typeof index !== 'number') {
			index = this.indexOf(input);
		}

		if (index >= 0) {
			this.history.splice(index, 1);
		}
	}

	private indexOf(input: IEditorInput): number {
		for (let i = 0; i < this.history.length; i++) {
			let entry = this.history[i];
			if (entry.matches(input)) {
				return i;
			}
		}

		return -1;
	}

	private handleEditorEventInStack(editor: IBaseEditor, storeSelection: boolean): void {
		if (this.blockStackChanges) {
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
			if (this.stack.length > HistoryService.MAX_STACK_ITEMS) {
				this.stack.shift(); // remove first and dispose
				if (this.index > 0) {
					this.index--;
				}
			}
		}

		// Restore on dispose
		input.addOneTimeDisposableListener(EventType.DISPOSE, () => {
			this.restoreInStack(input);
		});
	}

	private restoreInStack(input: IEditorInput): void {
		let restoredInput: EditorInput;
		let restored = false;

		this.stack.forEach((e, i) => {
			if (e.input.matches(input)) {
				if (!restored) {
					restoredInput = this.restoreInput(input);
					restored = true;
				}

				if (restoredInput) {
					this.stack[i].input = restoredInput;
				} else {
					this.stack.splice(i, 1);
					if (this.index >= i) {
						this.index--; // reduce index if the element is before index
					}
				}
			}
		});
	}

	private restoreInRecentlyClosed(input: IEditorInput): void {
		let restoredInput: EditorInput;
		let restored = false;

		this.recentlyClosed.forEach((e, i) => {
			if (e.matches(input)) {
				if (!restored) {
					restoredInput = this.restoreInput(input);
					restored = true;
				}

				if (restoredInput) {
					this.recentlyClosed[i] = restoredInput;
				} else {
					this.stack.splice(i, 1);
				}
			}
		});
	}

	private restoreInput(input: IEditorInput): EditorInput {
		if (input instanceof EditorInput) {
			const factory = this.registry.getEditorInputFactory(input.getTypeId());
			if (factory) {
				const inputRaw = factory.serialize(input);
				if (inputRaw) {
					return factory.deserialize(this.instantiationService, inputRaw);
				}
			}
		}

		return null;
	}

	private removeFromStack(input: IEditorInput): void {
		this.stack.forEach((e, i) => {
			if (e.input.matches(input)) {
				this.stack.splice(i, 1);
				if (this.index >= i) {
					this.index--; // reduce index if the element is before index
				}
			}
		});
	}

	private removeFromRecentlyClosed(input: IEditorInput): void {
		this.recentlyClosed.forEach((e, i) => {
			if (e.matches(input)) {
				this.recentlyClosed.splice(i, 1);
			}
		});
	}

	public getHistory(): IEditorInput[] {
		this.ensureLoaded();

		return this.history.slice(0);
	}

	private ensureLoaded(): void {
		if (!this.loaded) {
			this.load();
		}

		this.loaded = true;
	}

	private save(): void {
		if (!this.history) {
			return; // nothing to save because history was not used
		}

		let entries: ISerializedEditorInput[] = this.history.map((input: EditorInput) => {
			let factory = this.registry.getEditorInputFactory(input.getTypeId());
			if (factory) {
				let value = factory.serialize(input);
				if (typeof value === 'string') {
					return {
						id: input.getTypeId(),
						value: value
					};
				}
			}

			return void 0;
		}).filter(serialized => !!serialized);

		this.storageService.store(HistoryService.STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE);
	}

	private load(): void {
		let entries: ISerializedEditorInput[] = [];
		let entriesRaw = this.storageService.get(HistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			entries = JSON.parse(entriesRaw);
		}

		this.history = entries.map(entry => {
			let factory = this.registry.getEditorInputFactory(entry.id);
			if (factory && typeof entry.value === 'string') {
				return factory.deserialize(this.instantiationService, entry.value);
			}

			return void 0;
		}).filter(input => !!input);
	}
}