/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import product from 'vs/platform/product';
import { IEditor as IBaseEditor } from 'vs/platform/editor/common/editor';
import { EditorInput, IGroupEvent, IEditorRegistry, Extensions, asFileEditorInput, IEditorGroup } from 'vs/workbench/common/editor';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorInput, ITextEditorOptions, IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { once } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';

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

		const liftedSelection = Selection.liftSelection(this._selection);
		const liftedOtherSelection = Selection.liftSelection(other._selection);

		if (Math.abs(liftedSelection.getStartPosition().lineNumber - liftedOtherSelection.getStartPosition().lineNumber) < EditorState.EDITOR_SELECTION_THRESHOLD) {
			// ignore selection changes in the range of EditorState.EDITOR_SELECTION_THRESHOLD lines
			return false;
		}

		return true;
	}
}

interface ILegacySerializedEditorInput {
	id: string;
	value: string;
}

interface ISerializedFileEditorInput {
	resource: string;
}

export abstract class BaseHistoryService {
	protected toUnbind: IDisposable[];

	private activeEditorListeners: IDisposable[];
	private _isPure: boolean;

	constructor(
		protected editorGroupService: IEditorGroupService,
		protected editorService: IWorkbenchEditorService,
		protected contextService: IWorkspaceContextService,
		private environmentService: IEnvironmentService,
		integrityService: IIntegrityService
	) {
		this.toUnbind = [];
		this.activeEditorListeners = [];
		this._isPure = true;

		// Window Title
		window.document.title = this.getWindowTitle(null);

		// Editor Input Changes
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		integrityService.isPure().then((r) => {
			if (!r.isPure) {
				this._isPure = false;
				window.document.title = this.getWindowTitle(null);
			}
		});
	}

	private onEditorsChanged(): void {

		// Dispose old listeners
		dispose(this.activeEditorListeners);
		this.activeEditorListeners = [];

		const activeEditor = this.editorService.getActiveEditor();
		const activeInput = activeEditor ? activeEditor.input : void 0;

		// Propagate to history
		this.onEditorEvent(activeEditor);

		// Apply listener for dirty and label changes
		if (activeInput instanceof EditorInput) {
			this.activeEditorListeners.push(activeInput.onDidChangeDirty(() => {
				this.updateWindowTitle(activeInput); // Calculate New Window Title when dirty state changes
			}));

			this.activeEditorListeners.push(activeInput.onDidChangeLabel(() => {
				this.updateWindowTitle(activeInput); // Calculate New Window Title when label changes
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
		const input = editor ? editor.input : null;

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
		if (!this._isPure) {
			title += nls.localize('patchedWindowTitle', " [Unsupported]");
		}

		// Extension Development Host gets a special title to identify itself
		if (this.environmentService.extensionDevelopmentPath) {
			return nls.localize('devExtensionWindowTitle', "[Extension Development Host] - {0}", title);
		}

		return title;
	}

	private doGetWindowTitle(input?: IEditorInput): string {
		const appName = product.nameLong;

		let prefix = input && input.getName();
		if (prefix && input) {
			if ((<EditorInput>input).isDirty() && !platform.isMacintosh /* Mac has its own decoration in window */) {
				prefix = nls.localize('prefixDecoration', "\u25cf {0}", prefix);
			}
		}

		const workspace = this.contextService.getWorkspace();
		if (workspace) {
			const wsName = workspace.name;

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
	input: IEditorInput | IResourceInput;
	options?: ITextEditorOptions;
}

interface IRecentlyClosedFile {
	resource: URI;
	index: number;
}

export class HistoryService extends BaseHistoryService implements IHistoryService {

	public _serviceBrand: any;

	private static STORAGE_KEY = 'history.entries';
	private static MAX_HISTORY_ITEMS = 200;
	private static MAX_STACK_ITEMS = 20;
	private static MAX_RECENTLY_CLOSED_EDITORS = 20;

	private stack: IStackEntry[];
	private index: number;
	private blockStackChanges: boolean;
	private currentFileEditorState: EditorState;

	private history: (IEditorInput | IResourceInput)[];
	private recentlyClosedFiles: IRecentlyClosedFile[];
	private loaded: boolean;
	private registry: IEditorRegistry;

	constructor(
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IIntegrityService integrityService: IIntegrityService
	) {
		super(editorGroupService, editorService, contextService, environmentService, integrityService);

		this.index = -1;
		this.stack = [];
		this.recentlyClosedFiles = [];
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
			const fileEditor = asFileEditorInput(event.editor); // we only support files to reopen
			if (fileEditor) {

				// Remove all inputs matching and add as last recently closed
				this.removeFromRecentlyClosedFiles(event.editor);
				this.recentlyClosedFiles.push({ resource: fileEditor.getResource(), index: event.index });

				// Bounding
				if (this.recentlyClosedFiles.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
					this.recentlyClosedFiles.shift();
				}
			}
		}
	}

	public reopenLastClosedEditor(): void {
		this.ensureLoaded();

		const stacks = this.editorGroupService.getStacksModel();

		let lastClosedFile = this.recentlyClosedFiles.pop();
		while (lastClosedFile && this.isFileOpened(lastClosedFile.resource, stacks.activeGroup)) {
			lastClosedFile = this.recentlyClosedFiles.pop(); // pop until we find a file that is not opened
		}

		if (lastClosedFile) {
			this.editorService.openEditor({ resource: lastClosedFile.resource, options: { pinned: true, index: lastClosedFile.index } });
		}
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
		this.recentlyClosedFiles = [];
	}

	private navigate(): void {
		const entry = this.stack[this.index];

		let options = entry.options;
		if (options) {
			options.revealIfVisible = true;
		} else {
			options = { revealIfVisible: true };
		}

		this.blockStackChanges = true;

		let openEditorPromise: TPromise<IBaseEditor>;
		if (entry.input instanceof EditorInput) {
			openEditorPromise = this.editorService.openEditor(entry.input, options);
		} else {
			openEditorPromise = this.editorService.openEditor({ resource: (entry.input as IResourceInput).resource, options });
		}

		openEditorPromise.done(() => {
			this.blockStackChanges = false;
		}, (error) => {
			this.blockStackChanges = false;
			errors.onUnexpectedError(error);
		});
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

		const historyInput = this.preferResourceInput(input);

		// Remove any existing entry and add to the beginning
		this.removeFromHistory(input);
		this.history.unshift(historyInput);

		// Respect max entries setting
		if (this.history.length > HistoryService.MAX_HISTORY_ITEMS) {
			this.history.pop();
		}

		// Remove this from the history unless the history input is a resource
		// that can easily be restored even when the input gets disposed
		if (historyInput instanceof EditorInput) {
			const onceDispose = once(historyInput.onDispose);
			onceDispose(() => {
				this.removeFromHistory(input);
			});
		}
	}

	public remove(input: IEditorInput | IResourceInput): void {
		this.removeFromHistory(input);
		this.removeFromStack(input);
		this.removeFromRecentlyClosedFiles(input);
	}

	private removeFromHistory(input: IEditorInput | IResourceInput, index?: number): void {
		this.ensureLoaded();

		if (typeof index !== 'number') {
			index = this.indexOf(input);
		}

		if (index >= 0) {
			this.history.splice(index, 1);
		}
	}

	private indexOf(input: IEditorInput | IResourceInput): number {
		for (let i = 0; i < this.history.length; i++) {
			const entry = this.history[i];
			if (this.matches(input, entry)) {
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
		const stateCandidate = new EditorState(editor.input, editor.getSelection());
		if (!this.currentFileEditorState || this.currentFileEditorState.justifiesNewPushState(stateCandidate)) {
			this.currentFileEditorState = stateCandidate;

			let options: ITextEditorOptions;
			if (storeSelection) {
				const selection = editor.getSelection();
				options = {
					selection: { startLineNumber: selection.startLineNumber, startColumn: selection.startColumn }
				};
			}

			this.add(editor.input, options);
		}
	}

	private handleNonTextEditorEvent(editor: IBaseEditor): void {
		const currentStack = this.stack[this.index];
		if (currentStack && this.matches(editor.input, currentStack.input)) {
			return; // do not push same editor input again
		}

		this.add(editor.input);
	}

	public add(input: IEditorInput, options?: ITextEditorOptions): void {
		if (!this.blockStackChanges) {
			this.addToStack(input, options);
		}
	}

	private addToStack(input: IEditorInput, options?: ITextEditorOptions): void {

		// Overwrite an entry in the stack if we have a matching input that comes
		// with editor options to indicate that this entry is more specific. Also
		// prevent entries that have the exact same options.
		let replace = false;
		if (this.stack[this.index]) {
			const currentEntry = this.stack[this.index];
			if (this.matches(input, currentEntry.input) && this.sameOptions(currentEntry.options, options)) {
				replace = true;
			}
		}

		const stackInput = this.preferResourceInput(input);
		const entry = { input: stackInput, options };

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

		// Remove this from the stack unless the stack input is a resource
		// that can easily be restored even when the input gets disposed
		if (stackInput instanceof EditorInput) {
			const onceDispose = once(stackInput.onDispose);
			onceDispose(() => {
				this.removeFromStack(input);
			});
		}
	}

	private preferResourceInput(input: IEditorInput): IEditorInput | IResourceInput {
		const fileInput = asFileEditorInput(input);
		if (fileInput) {
			return { resource: fileInput.getResource() };
		}

		return input;
	}

	private sameOptions(optionsA?: ITextEditorOptions, optionsB?: ITextEditorOptions): boolean {
		if (!optionsA && !optionsB) {
			return true;
		}

		if ((!optionsA && optionsB) || (optionsA && !optionsB)) {
			return false;
		}

		const s1 = optionsA.selection;
		const s2 = optionsB.selection;

		if (!s1 && !s2) {
			return true;
		}

		if ((!s1 && s2) || (s1 && !s2)) {
			return false;
		}

		return s1.startLineNumber === s2.startLineNumber; // we consider the history entry same if we are on the same line
	}

	private removeFromStack(input: IEditorInput | IResourceInput): void {
		this.stack.forEach((e, i) => {
			if (this.matches(input, e.input)) {
				this.stack.splice(i, 1);
				if (this.index >= i) {
					this.index--; // reduce index if the element is before index
				}
			}
		});
	}

	private removeFromRecentlyClosedFiles(input: IEditorInput | IResourceInput): void {
		this.recentlyClosedFiles.forEach((e, i) => {
			if (this.matchesFile(e.resource, input)) {
				this.recentlyClosedFiles.splice(i, 1);
			}
		});
	}

	private isFileOpened(resource: URI, group: IEditorGroup): boolean {
		if (!group) {
			return false;
		}

		if (!group.contains(resource)) {
			return false; // fast check
		}

		return group.getEditors().some(e => this.matchesFile(resource, e));
	}

	private matches(inputA: IEditorInput | IResourceInput, inputB: IEditorInput | IResourceInput): boolean {
		if (inputA instanceof EditorInput && inputB instanceof EditorInput) {
			return inputA.matches(inputB);
		}

		if (inputA instanceof EditorInput) {
			return this.matchesFile((inputB as IResourceInput).resource, inputA);
		}

		if (inputB instanceof EditorInput) {
			return this.matchesFile((inputA as IResourceInput).resource, inputB);
		}

		const resourceInputA = inputA as IResourceInput;
		const resourceInputB = inputB as IResourceInput;

		return resourceInputA && resourceInputB && resourceInputA.resource.toString() === resourceInputB.resource.toString();
	}

	private matchesFile(resource: URI, input: IEditorInput | IResourceInput): boolean {
		if (input instanceof EditorInput) {
			const fileInput = asFileEditorInput(input);

			return fileInput && fileInput.getResource().toString() === resource.toString();
		}

		const resourceInput = input as IResourceInput;

		return resourceInput && resourceInput.resource.toString() === resource.toString();
	}

	public getHistory(): (IEditorInput | IResourceInput)[] {
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

		const entries: ISerializedFileEditorInput[] = this.history.map(input => {
			if (input instanceof EditorInput) {
				return void 0; // only file resource inputs are serializable currently
			}

			return { resource: (input as IResourceInput).resource.toString() };
		}).filter(serialized => !!serialized);

		this.storageService.store(HistoryService.STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE);
	}

	private load(): void {
		let entries: (ILegacySerializedEditorInput | ISerializedFileEditorInput)[] = [];

		const entriesRaw = this.storageService.get(HistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			entries = JSON.parse(entriesRaw);
		}

		this.history = entries.map(entry => {
			const serializedLegacyInput = entry as ILegacySerializedEditorInput;
			const serializedFileInput = entry as ISerializedFileEditorInput;

			// Legacy support (TODO@Ben remove me - migration)
			if (serializedLegacyInput.id) {
				const factory = this.registry.getEditorInputFactory(serializedLegacyInput.id);
				if (factory && typeof serializedLegacyInput.value === 'string') {
					const fileInput = asFileEditorInput(factory.deserialize(this.instantiationService, serializedLegacyInput.value));
					if (fileInput) {
						return { resource: fileInput.getResource() } as IResourceInput;
					}

					return void 0;
				}
			}

			// New resource input support
			else if (serializedFileInput.resource) {
				return { resource: URI.parse(serializedFileInput.resource) } as IResourceInput;
			}

			return void 0;
		}).filter(input => !!input);
	}
}