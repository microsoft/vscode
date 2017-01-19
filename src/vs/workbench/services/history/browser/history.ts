/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import nls = require('vs/nls');
import labels = require('vs/base/common/labels');
import objects = require('vs/base/common/objects');
import URI from 'vs/base/common/uri';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IEditor as IBaseEditor, IEditorInput, ITextEditorOptions, IResourceInput } from 'vs/platform/editor/common/editor';
import { EditorInput, IGroupEvent, IEditorRegistry, Extensions, toResource, IEditorGroup } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileChangesEvent, IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { once } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { getExcludes, ISearchConfiguration } from 'vs/platform/search/common/search';
import { ParsedExpression, parse, IExpression } from 'vs/base/common/glob';

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
			return true; // push different editor inputs
		}

		if (!Selection.isISelection(this._selection) || !Selection.isISelection(other._selection)) {
			return true; // unknown selections
		}

		const liftedSelection = Selection.liftSelection(this._selection);
		const liftedOtherSelection = Selection.liftSelection(other._selection);

		if (Math.abs(liftedSelection.getStartPosition().lineNumber - liftedOtherSelection.getStartPosition().lineNumber) < EditorState.EDITOR_SELECTION_THRESHOLD) {
			return false; // ignore selection changes in the range of EditorState.EDITOR_SELECTION_THRESHOLD lines
		}

		return true;
	}
}

interface ISerializedFileHistoryEntry {
	resource?: string;
	resourceJSON: any;
}

export abstract class BaseHistoryService {
	protected toUnbind: IDisposable[];

	private activeEditorListeners: IDisposable[];
	private isPure: boolean;
	private showFullPath: boolean;

	protected excludes: ParsedExpression;
	private lastKnownExcludesConfig: IExpression;

	private static NLS_UNSUPPORTED = nls.localize('patchedWindowTitle', "[Unsupported]");

	constructor(
		protected editorGroupService: IEditorGroupService,
		protected editorService: IWorkbenchEditorService,
		protected contextService: IWorkspaceContextService,
		private configurationService: IConfigurationService,
		private environmentService: IEnvironmentService,
		integrityService: IIntegrityService,
		private titleService: ITitleService
	) {
		this.toUnbind = [];
		this.activeEditorListeners = [];
		this.isPure = true;

		// Window Title
		this.titleService.updateTitle(this.getWindowTitle(null));

		// Integrity
		integrityService.isPure().then(r => {
			if (!r.isPure) {
				this.isPure = false;
				this.titleService.updateTitle(this.getWindowTitle(this.editorService.getActiveEditorInput()));
			}
		});

		// Editor Input Changes
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

		// Configuration Changes
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(() => this.onConfigurationChanged(true)));
		this.onConfigurationChanged();
	}

	private onConfigurationChanged(update?: boolean): void {
		const currentShowPath = this.showFullPath;
		this.showFullPath = this.configurationService.lookup<boolean>('window.showFullPath').value;

		if (update && currentShowPath !== this.showFullPath) {
			this.updateWindowTitle(this.editorService.getActiveEditorInput());
		}

		const excludesConfig = getExcludes(this.configurationService.getConfiguration<ISearchConfiguration>());
		if (!objects.equals(excludesConfig, this.lastKnownExcludesConfig)) {
			const configChanged = !!this.lastKnownExcludesConfig;

			this.lastKnownExcludesConfig = excludesConfig;
			this.excludes = parse(excludesConfig, { trimForExclusions: true });

			if (configChanged) {
				this.handleExcludesChange();
			}
		}
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
		const control = getCodeEditor(activeEditor);
		if (control) {
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

		this.titleService.updateTitle(windowTitle);
	}

	protected abstract handleExcludesChange(): void;

	protected abstract handleEditorSelectionChangeEvent(editor?: IBaseEditor): void;

	protected abstract handleActiveEditorChange(editor?: IBaseEditor): void;

	protected getWindowTitle(input?: IEditorInput): string {
		let title = this.doGetWindowTitle(input);
		if (!this.isPure) {
			title = `${title} ${BaseHistoryService.NLS_UNSUPPORTED}`;
		}

		// Extension Development Host gets a special title to identify itself
		if (this.environmentService.isExtensionDevelopment) {
			return nls.localize('devExtensionWindowTitle', "[Extension Development Host] - {0}", title);
		}

		return title;
	}

	private doGetWindowTitle(input?: IEditorInput): string {
		const appName = this.environmentService.appNameLong;

		let prefix: string;
		const file = toResource(input, { filter: 'file' });
		if (file && this.showFullPath) {
			prefix = labels.getPathLabel(file);
			if ((platform.isMacintosh || platform.isLinux) && prefix.indexOf(this.environmentService.userHome) === 0) {
				prefix = `~${prefix.substr(this.environmentService.userHome.length)}`;
			}
		} else {
			prefix = input && input.getName();
		}

		if (prefix && input) {
			if (input.isDirty() && !platform.isMacintosh /* Mac has its own decoration in window */) {
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
	timestamp: number;
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
	private static MERGE_EVENT_CHANGES_THRESHOLD = 100;

	private stack: IStackEntry[];
	private index: number;
	private navigatingInStack: boolean;
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
		@IConfigurationService configurationService: IConfigurationService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IIntegrityService integrityService: IIntegrityService,
		@ITitleService titleService: ITitleService,
		@IFileService private fileService: IFileService,
		@IWindowService private windowService: IWindowService
	) {
		super(editorGroupService, editorService, contextService, configurationService, environmentService, integrityService, titleService);

		this.index = -1;
		this.stack = [];
		this.recentlyClosedFiles = [];
		this.loaded = false;
		this.registry = Registry.as<IEditorRegistry>(Extensions.Editors);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.lifecycleService.onShutdown(reason => this.save()));
		this.toUnbind.push(this.editorGroupService.onEditorOpenFail(editor => this.remove(editor)));
		this.toUnbind.push(this.editorGroupService.getStacksModel().onEditorClosed(event => this.onEditorClosed(event)));

		// File changes
		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));
	}

	private onFileChanges(e: FileChangesEvent): void {
		if (e.gotDeleted()) {
			this.remove(e); // remove from history files that got deleted or moved
		}
	}

	private onEditorClosed(event: IGroupEvent): void {

		// Track closing of pinned editor to support to reopen closed editors
		if (event.pinned) {
			const file = toResource(event.editor, { filter: 'file' }); // we only support files to reopen
			if (file) {

				// Remove all inputs matching and add as last recently closed
				this.removeFromRecentlyClosedFiles(event.editor);
				this.recentlyClosedFiles.push({ resource: file, index: event.index });

				// Bounding
				if (this.recentlyClosedFiles.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
					this.recentlyClosedFiles.shift();
				}
			}
		}
	}

	public reopenLastClosedEditor(): void {
		this.ensureHistoryLoaded();

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
		this.ensureHistoryLoaded();

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

		this.navigatingInStack = true;

		let openEditorPromise: TPromise<IBaseEditor>;
		if (entry.input instanceof EditorInput) {
			openEditorPromise = this.editorService.openEditor(entry.input, options);
		} else {
			openEditorPromise = this.editorService.openEditor({ resource: (entry.input as IResourceInput).resource, options });
		}

		openEditorPromise.done(() => {
			this.navigatingInStack = false;
		}, error => {
			this.navigatingInStack = false;
			errors.onUnexpectedError(error);
		});
	}

	protected handleEditorSelectionChangeEvent(editor?: IBaseEditor): void {
		this.handleEditorEventInStack(editor);
	}

	protected handleActiveEditorChange(editor?: IBaseEditor): void {
		this.handleEditorEventInHistory(editor);
		this.handleEditorEventInStack(editor);
	}

	private handleEditorEventInHistory(editor?: IBaseEditor): void {
		const input = editor ? editor.input : void 0;

		// Ensure we have at least a name to show and not configured to exclude input
		if (!input || !input.getName() || !this.include(input)) {
			return;
		}

		this.ensureHistoryLoaded();

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

	private include(input: IEditorInput | IResourceInput): boolean {
		if (input instanceof EditorInput) {
			return true; // include any non files
		}

		const resourceInput = input as IResourceInput;
		const relativePath = this.contextService.toWorkspaceRelativePath(resourceInput.resource);

		return !this.excludes(relativePath || resourceInput.resource.fsPath);
	}

	protected handleExcludesChange(): void {
		this.removeExcludedFromHistory();
	}

	public remove(input: IEditorInput | IResourceInput): void;
	public remove(input: FileChangesEvent): void;
	public remove(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.removeFromHistory(arg1);
		this.removeFromStack(arg1);
		this.removeFromRecentlyClosedFiles(arg1);
		this.removeFromRecentlyOpen(arg1);
	}

	private removeExcludedFromHistory(): void {
		this.ensureHistoryLoaded();

		this.history = this.history.filter(e => this.include(e));
	}

	private removeFromHistory(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.ensureHistoryLoaded();

		this.history = this.history.filter(e => !this.matches(arg1, e));
	}

	private handleEditorEventInStack(editor: IBaseEditor): void {
		const control = getCodeEditor(editor);

		// treat editor changes that happen as part of stack navigation specially
		// we do not want to add a new stack entry as a matter of navigating the
		// stack but we need to keep our currentFileEditorState up to date with
		// the navigtion that occurs.
		if (this.navigatingInStack) {
			if (control && editor.input) {
				this.currentFileEditorState = new EditorState(editor.input, control.getSelection());
			} else {
				this.currentFileEditorState = null; // we navigated to a non file editor
			}

			return;
		}

		if (control && editor.input) {
			this.handleTextEditorEvent(editor, control);

			return;
		}

		this.currentFileEditorState = null; // at this time we have no active file editor view state

		if (editor && editor.input) {
			this.handleNonTextEditorEvent(editor);
		}
	}

	private handleTextEditorEvent(editor: IBaseEditor, editorControl: editorCommon.IEditor): void {
		const stateCandidate = new EditorState(editor.input, editorControl.getSelection());
		if (!this.currentFileEditorState || this.currentFileEditorState.justifiesNewPushState(stateCandidate)) {
			this.currentFileEditorState = stateCandidate;

			let options: ITextEditorOptions;

			const selection = editorControl.getSelection();
			if (selection) {
				options = {
					selection: { startLineNumber: selection.startLineNumber, startColumn: selection.startColumn }
				};
			}

			this.add(editor.input, options, true /* from event */);
		}
	}

	private handleNonTextEditorEvent(editor: IBaseEditor): void {
		const currentStack = this.stack[this.index];
		if (currentStack && this.matches(editor.input, currentStack.input)) {
			return; // do not push same editor input again
		}

		this.add(editor.input, void 0, true /* from event */);
	}

	public add(input: IEditorInput, options?: ITextEditorOptions, fromEvent?: boolean): void {
		if (!this.navigatingInStack) {
			this.addToStack(input, options, fromEvent);
		}
	}

	private addToStack(input: IEditorInput, options?: ITextEditorOptions, fromEvent?: boolean): void {

		// Overwrite an entry in the stack if we have a matching input that comes
		// with editor options to indicate that this entry is more specific. Also
		// prevent entries that have the exact same options. Finally, Overwrite
		// entries if it came from an event and we detect that the change came in
		// very fast which indicates that it was not coming in from a user change
		// but rather rapid programmatic changes. We just take the last of the changes
		// to not cause too many entries on the stack.
		let replace = false;
		if (this.stack[this.index]) {
			const currentEntry = this.stack[this.index];
			if (this.matches(input, currentEntry.input) && (this.sameOptions(currentEntry.options, options) || (fromEvent && Date.now() - currentEntry.timestamp < HistoryService.MERGE_EVENT_CHANGES_THRESHOLD))) {
				replace = true;
			}
		}

		const stackInput = this.preferResourceInput(input);
		const entry = { input: stackInput, options, timestamp: fromEvent ? Date.now() : void 0 };

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
		const file = toResource(input, { filter: 'file' });
		if (file) {
			return { resource: file };
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

	private removeFromStack(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.stack = this.stack.filter(e => !this.matches(arg1, e.input));
		this.index = this.stack.length - 1; // reset index
	}

	private removeFromRecentlyClosedFiles(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.recentlyClosedFiles = this.recentlyClosedFiles.filter(e => !this.matchesFile(e.resource, arg1));
	}

	private removeFromRecentlyOpen(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		if (arg1 instanceof EditorInput || arg1 instanceof FileChangesEvent) {
			return; // for now do not delete from file events since recently open are likely out of workspace files for which there are no delete events
		}

		const input = arg1 as IResourceInput;

		this.windowService.removeFromRecentlyOpen([input.resource.fsPath]);
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

	private matches(arg1: IEditorInput | IResourceInput | FileChangesEvent, inputB: IEditorInput | IResourceInput): boolean {
		if (arg1 instanceof FileChangesEvent) {
			if (inputB instanceof EditorInput) {
				return false; // we only support this for IResourceInput
			}

			const resourceInputB = inputB as IResourceInput;

			return arg1.contains(resourceInputB.resource, FileChangeType.DELETED);
		}

		if (arg1 instanceof EditorInput && inputB instanceof EditorInput) {
			return arg1.matches(inputB);
		}

		if (arg1 instanceof EditorInput) {
			return this.matchesFile((inputB as IResourceInput).resource, arg1);
		}

		if (inputB instanceof EditorInput) {
			return this.matchesFile((arg1 as IResourceInput).resource, inputB);
		}

		const resourceInputA = arg1 as IResourceInput;
		const resourceInputB = inputB as IResourceInput;

		return resourceInputA && resourceInputB && resourceInputA.resource.toString() === resourceInputB.resource.toString();
	}

	private matchesFile(resource: URI, arg2: IEditorInput | IResourceInput | FileChangesEvent): boolean {
		if (arg2 instanceof FileChangesEvent) {
			return arg2.contains(resource, FileChangeType.DELETED);
		}

		if (arg2 instanceof EditorInput) {
			const file = toResource(arg2, { filter: 'file' });

			return file && file.toString() === resource.toString();
		}

		const resourceInput = arg2 as IResourceInput;

		return resourceInput && resourceInput.resource.toString() === resource.toString();
	}

	public getHistory(): (IEditorInput | IResourceInput)[] {
		this.ensureHistoryLoaded();

		return this.history.slice(0);
	}

	private ensureHistoryLoaded(): void {
		if (!this.loaded) {
			this.loadHistory();
		}

		this.loaded = true;
	}

	private save(): void {
		if (!this.history) {
			return; // nothing to save because history was not used
		}

		const entries: ISerializedFileHistoryEntry[] = this.history.map(input => {
			if (input instanceof EditorInput) {
				return void 0; // only file resource inputs are serializable currently
			}

			return { resourceJSON: (input as IResourceInput).resource.toJSON() };
		}).filter(serialized => !!serialized);

		this.storageService.store(HistoryService.STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE);
	}

	private loadHistory(): void {
		let entries: ISerializedFileHistoryEntry[] = [];

		const entriesRaw = this.storageService.get(HistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			entries = JSON.parse(entriesRaw);
		}

		this.history = entries.map(entry => {
			const serializedFileInput = entry as ISerializedFileHistoryEntry;
			if (serializedFileInput.resource || serializedFileInput.resourceJSON) {
				return { resource: !!serializedFileInput.resourceJSON ? URI.revive(serializedFileInput.resourceJSON) : URI.parse(serializedFileInput.resource) } as IResourceInput;
			}

			return void 0;
		}).filter(input => !!input);
	}
}