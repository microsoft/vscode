/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { IEditor } from 'vs/editor/common/editorCommon';
import { ITextEditorOptions, IResourceInput, ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor as IBaseEditor, Extensions as EditorExtensions, EditorInput, IEditorCloseEvent, IEditorInputFactoryRegistry, toResource, Extensions as EditorInputExtensions, IFileInputFactory, IEditorIdentifier } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileChangesEvent, IFileService, FileChangeType, FILES_EXCLUDE_CONFIG } from 'vs/platform/files/common/files';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { once, debounceEvent } from 'vs/base/common/event';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { getExcludes, ISearchConfiguration } from 'vs/platform/search/common/search';
import { IExpression } from 'vs/base/common/glob';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceGlobMatcher } from 'vs/workbench/electron-browser/resources';
import { EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';

/**
 * Stores the selection & view state of an editor and allows to compare it to other selection states.
 */
export class TextEditorState {

	private static readonly EDITOR_SELECTION_THRESHOLD = 10; // number of lines to move in editor to justify for new state

	private textEditorSelection: ITextEditorSelection;

	constructor(private _editorInput: IEditorInput, private _selection: Selection) {
		this.textEditorSelection = Selection.isISelection(_selection) ? {
			startLineNumber: _selection.startLineNumber,
			startColumn: _selection.startColumn
		} : void 0;
	}

	get editorInput(): IEditorInput {
		return this._editorInput;
	}

	get selection(): ITextEditorSelection {
		return this.textEditorSelection;
	}

	justifiesNewPushState(other: TextEditorState, event?: ICursorPositionChangedEvent): boolean {
		if (event && event.source === 'api') {
			return true; // always let API source win (e.g. "Go to definition" should add a history entry)
		}

		if (!this._editorInput.matches(other._editorInput)) {
			return true; // different editor inputs
		}

		if (!Selection.isISelection(this._selection) || !Selection.isISelection(other._selection)) {
			return true; // unknown selections
		}

		const thisLineNumber = Math.min(this._selection.selectionStartLineNumber, this._selection.positionLineNumber);
		const otherLineNumber = Math.min(other._selection.selectionStartLineNumber, other._selection.positionLineNumber);

		if (Math.abs(thisLineNumber - otherLineNumber) < TextEditorState.EDITOR_SELECTION_THRESHOLD) {
			return false; // ignore selection changes in the range of EditorState.EDITOR_SELECTION_THRESHOLD lines
		}

		return true;
	}
}

interface ISerializedEditorHistoryEntry {
	resourceJSON?: object;
	editorInputJSON?: { typeId: string; deserialized: string; };
}

interface IStackEntry {
	input: IEditorInput | IResourceInput;
	selection?: ITextEditorSelection;
}

interface IRecentlyClosedFile {
	resource: URI;
	index: number;
}

export class HistoryService extends Disposable implements IHistoryService {

	_serviceBrand: any;

	private static readonly STORAGE_KEY = 'history.entries';
	private static readonly MAX_HISTORY_ITEMS = 200;
	private static readonly MAX_STACK_ITEMS = 20;
	private static readonly MAX_RECENTLY_CLOSED_EDITORS = 20;

	private activeEditorListeners: IDisposable[];
	private lastActiveEditor: IEditorIdentifier;

	private stack: IStackEntry[];
	private index: number;
	private lastIndex: number;
	private navigatingInStack: boolean;
	private currentTextEditorState: TextEditorState;

	private lastEditLocation: IStackEntry;

	private history: (IEditorInput | IResourceInput)[];
	private recentlyClosedFiles: IRecentlyClosedFile[];
	private loaded: boolean;
	private resourceFilter: ResourceGlobMatcher;

	private fileInputFactory: IFileInputFactory;

	private canNavigateBackContextKey: IContextKey<boolean>;
	private canNavigateForwardContextKey: IContextKey<boolean>;

	constructor(
		@IEditorService private editorService: EditorServiceImpl,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IFileService private fileService: IFileService,
		@IWindowsService private windowService: IWindowsService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super();

		this.activeEditorListeners = [];

		this.canNavigateBackContextKey = (new RawContextKey<boolean>('canNavigateBack', false)).bindTo(this.contextKeyService);
		this.canNavigateForwardContextKey = (new RawContextKey<boolean>('canNavigateForward', false)).bindTo(this.contextKeyService);

		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).getFileInputFactory();

		this.index = -1;
		this.lastIndex = -1;
		this.stack = [];
		this.recentlyClosedFiles = [];
		this.loaded = false;
		this.resourceFilter = this._register(instantiationService.createInstance(
			ResourceGlobMatcher,
			(root: URI) => this.getExcludes(root),
			(event: IConfigurationChangeEvent) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG) || event.affectsConfiguration('search.exclude')
		));

		this.registerListeners();

		// if the service is created late enough that an editor is already opened
		// make sure to trigger the onActiveEditorChanged() to track the editor
		// properly (fixes https://github.com/Microsoft/vscode/issues/59908)
		if (editorService.activeControl) {
			this.onActiveEditorChanged();
		}
	}

	private getExcludes(root?: URI): IExpression {
		const scope = root ? { resource: root } : void 0;

		return getExcludes(this.configurationService.getValue<ISearchConfiguration>(scope));
	}

	private registerListeners(): void {
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChanged()));
		this._register(this.editorService.onDidOpenEditorFail(event => this.remove(event.editor)));
		this._register(this.editorService.onDidCloseEditor(event => this.onEditorClosed(event)));
		this._register(this.storageService.onWillSaveState(reason => this.saveState()));
		this._register(this.fileService.onFileChanges(event => this.onFileChanges(event)));
		this._register(this.resourceFilter.onExpressionChange(() => this.handleExcludesChange()));
	}

	private onActiveEditorChanged(): void {
		const activeControl = this.editorService.activeControl;
		if (this.lastActiveEditor && this.matchesEditor(this.lastActiveEditor, activeControl)) {
			return; // return if the active editor is still the same
		}

		// Remember as last active editor (can be undefined if none opened)
		this.lastActiveEditor = activeControl ? { editor: activeControl.input, groupId: activeControl.group.id } : void 0;

		// Dispose old listeners
		dispose(this.activeEditorListeners);
		this.activeEditorListeners = [];

		// Propagate to history
		this.handleActiveEditorChange(activeControl);

		// Apply listener for selection changes if this is a text editor
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		const activeEditor = this.editorService.activeEditor;
		if (activeTextEditorWidget) {

			// Debounce the event with a timeout of 0ms so that multiple calls to
			// editor.setSelection() are folded into one. We do not want to record
			// subsequent history navigations for such API calls.
			this.activeEditorListeners.push(debounceEvent(activeTextEditorWidget.onDidChangeCursorPosition, (last, event) => event, 0)((event => {
				this.handleEditorSelectionChangeEvent(activeControl, event);
			})));

			// Track the last edit location by tracking model content change events
			// Use a debouncer to make sure to capture the correct cursor position
			// after the model content has changed.
			this.activeEditorListeners.push(debounceEvent(activeTextEditorWidget.onDidChangeModelContent, (last, event) => event, 0)((event => {
				this.lastEditLocation = { input: activeEditor };

				const position = activeTextEditorWidget.getPosition();
				if (position) {
					this.lastEditLocation.selection = {
						startLineNumber: position.lineNumber,
						startColumn: position.column
					};
				}
			})));
		}
	}

	private matchesEditor(identifier: IEditorIdentifier, editor?: IBaseEditor): boolean {
		if (!editor || !editor.group) {
			return false;
		}

		if (identifier.groupId !== editor.group.id) {
			return false;
		}

		return identifier.editor.matches(editor.input);
	}

	private onFileChanges(e: FileChangesEvent): void {
		if (e.gotDeleted()) {
			this.remove(e); // remove from history files that got deleted or moved
		}
	}

	private onEditorClosed(event: IEditorCloseEvent): void {

		// Track closing of editor to support to reopen closed editors (unless editor was replaced)
		if (!event.replaced) {
			const resource = event.editor ? event.editor.getResource() : void 0;
			const supportsReopen = resource && this.fileService.canHandleResource(resource); // we only support file'ish things to reopen
			if (supportsReopen) {

				// Remove all inputs matching and add as last recently closed
				this.removeFromRecentlyClosedFiles(event.editor);
				this.recentlyClosedFiles.push({ resource, index: event.index });

				// Bounding
				if (this.recentlyClosedFiles.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
					this.recentlyClosedFiles.shift();
				}
			}
		}
	}

	reopenLastClosedEditor(): void {
		this.ensureHistoryLoaded();

		let lastClosedFile = this.recentlyClosedFiles.pop();
		while (lastClosedFile && this.isFileOpened(lastClosedFile.resource, this.editorGroupService.activeGroup)) {
			lastClosedFile = this.recentlyClosedFiles.pop(); // pop until we find a file that is not opened
		}

		if (lastClosedFile) {
			this.editorService.openEditor({ resource: lastClosedFile.resource, options: { pinned: true, index: lastClosedFile.index } });
		}
	}

	openLastEditLocation(): void {
		if (this.lastEditLocation) {
			this.doNavigate(this.lastEditLocation, true);
		}
	}

	forward(acrossEditors?: boolean): void {
		if (this.stack.length > this.index + 1) {
			if (acrossEditors) {
				this.doForwardAcrossEditors();
			} else {
				this.doForwardInEditors();
			}
		}
	}

	private doForwardInEditors(): void {
		this.setIndex(this.index + 1);
		this.navigate();
	}

	private setIndex(value: number): void {
		this.lastIndex = this.index;
		this.index = value;

		this.updateContextKeys();
	}

	private doForwardAcrossEditors(): void {
		let currentIndex = this.index;
		const currentEntry = this.stack[this.index];

		// Find the next entry that does not match our current entry
		while (this.stack.length > currentIndex + 1) {
			currentIndex++;

			const previousEntry = this.stack[currentIndex];
			if (!this.matches(currentEntry.input, previousEntry.input)) {
				this.setIndex(currentIndex);
				this.navigate(true /* across editors */);

				break;
			}
		}
	}

	back(acrossEditors?: boolean): void {
		if (this.index > 0) {
			if (acrossEditors) {
				this.doBackAcrossEditors();
			} else {
				this.doBackInEditors();
			}
		}
	}

	last(): void {
		if (this.lastIndex === -1) {
			this.back();
		} else {
			this.setIndex(this.lastIndex);
			this.navigate();
		}
	}

	private doBackInEditors(): void {
		this.setIndex(this.index - 1);
		this.navigate();
	}

	private doBackAcrossEditors(): void {
		let currentIndex = this.index;
		const currentEntry = this.stack[this.index];

		// Find the next previous entry that does not match our current entry
		while (currentIndex > 0) {
			currentIndex--;

			const previousEntry = this.stack[currentIndex];
			if (!this.matches(currentEntry.input, previousEntry.input)) {
				this.setIndex(currentIndex);
				this.navigate(true /* across editors */);

				break;
			}
		}
	}

	clear(): void {
		this.ensureHistoryLoaded();

		// Navigation (next, previous)
		this.index = -1;
		this.lastIndex = -1;
		this.stack.splice(0);

		// Closed files
		this.recentlyClosedFiles = [];

		// History
		this.clearRecentlyOpened();

		this.updateContextKeys();
	}

	clearRecentlyOpened(): void {
		this.history = [];
	}

	private updateContextKeys(): void {
		this.canNavigateBackContextKey.set(this.stack.length > 0 && this.index > 0);
		this.canNavigateForwardContextKey.set(this.stack.length > 0 && this.index < this.stack.length - 1);
	}

	private navigate(acrossEditors?: boolean): void {
		this.navigatingInStack = true;

		this.doNavigate(this.stack[this.index], !acrossEditors).then(() => {
			this.navigatingInStack = false;
		}, error => {
			this.navigatingInStack = false;

			onUnexpectedError(error);
		});
	}

	private doNavigate(location: IStackEntry, withSelection: boolean): Thenable<IBaseEditor> {
		const options: ITextEditorOptions = {
			revealIfOpened: true // support to navigate across editor groups
		};

		// Unless we navigate across editors, support selection and
		// minimize scrolling by setting revealInCenterIfOutsideViewport
		if (location.selection && withSelection) {
			options.selection = location.selection;
			options.revealInCenterIfOutsideViewport = true;
		}

		if (location.input instanceof EditorInput) {
			return this.editorService.openEditor(location.input, options);
		}

		return this.editorService.openEditor({ resource: (location.input as IResourceInput).resource, options });
	}

	protected handleEditorSelectionChangeEvent(editor?: IBaseEditor, event?: ICursorPositionChangedEvent): void {
		this.handleEditorEventInStack(editor, event);
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
			once(historyInput.onDispose)(() => this.removeFromHistory(input));
		}
	}

	private include(input: IEditorInput | IResourceInput): boolean {
		if (input instanceof EditorInput) {
			return true; // include any non files
		}

		const resourceInput = input as IResourceInput;

		return !this.resourceFilter.matches(resourceInput.resource);
	}

	protected handleExcludesChange(): void {
		this.removeExcludedFromHistory();
	}

	remove(input: IEditorInput | IResourceInput): void;
	remove(input: FileChangesEvent): void;
	remove(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.removeFromHistory(arg1);
		this.removeFromStack(arg1);
		this.removeFromRecentlyClosedFiles(arg1);
		this.removeFromRecentlyOpened(arg1);
	}

	private removeExcludedFromHistory(): void {
		this.ensureHistoryLoaded();

		this.history = this.history.filter(e => this.include(e));
	}

	private removeFromHistory(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.ensureHistoryLoaded();

		this.history = this.history.filter(e => !this.matches(arg1, e));
	}

	private handleEditorEventInStack(control: IBaseEditor, event?: ICursorPositionChangedEvent): void {
		const codeEditor = control ? getCodeEditor(control.getControl()) : void 0;

		// treat editor changes that happen as part of stack navigation specially
		// we do not want to add a new stack entry as a matter of navigating the
		// stack but we need to keep our currentTextEditorState up to date with
		// the navigtion that occurs.
		if (this.navigatingInStack) {
			if (codeEditor && control.input) {
				this.currentTextEditorState = new TextEditorState(control.input, codeEditor.getSelection());
			} else {
				this.currentTextEditorState = null; // we navigated to a non text editor
			}
		}

		// normal navigation not part of history navigation
		else {

			// navigation inside text editor
			if (codeEditor && control.input) {
				this.handleTextEditorEvent(control, codeEditor, event);
			}

			// navigation to non-text editor
			else {
				this.currentTextEditorState = null; // at this time we have no active text editor view state

				if (control && control.input) {
					this.handleNonTextEditorEvent(control);
				}
			}
		}
	}

	private handleTextEditorEvent(editor: IBaseEditor, editorControl: IEditor, event?: ICursorPositionChangedEvent): void {
		const stateCandidate = new TextEditorState(editor.input, editorControl.getSelection());

		// Add to stack if we dont have a current state or this new state justifies a push
		if (!this.currentTextEditorState || this.currentTextEditorState.justifiesNewPushState(stateCandidate, event)) {
			this.add(editor.input, stateCandidate.selection);
		}

		// Otherwise we replace the current stack entry with this one
		else {
			this.replace(editor.input, stateCandidate.selection);
		}

		// Update our current text editor state
		this.currentTextEditorState = stateCandidate;
	}

	private handleNonTextEditorEvent(editor: IBaseEditor): void {
		const currentStack = this.stack[this.index];
		if (currentStack && this.matches(editor.input, currentStack.input)) {
			return; // do not push same editor input again
		}

		this.add(editor.input);
	}

	add(input: IEditorInput, selection?: ITextEditorSelection): void {
		if (!this.navigatingInStack) {
			this.addOrReplaceInStack(input, selection);
		}
	}

	private replace(input: IEditorInput, selection?: ITextEditorSelection): void {
		if (!this.navigatingInStack) {
			this.addOrReplaceInStack(input, selection, true /* force replace */);
		}
	}

	private addOrReplaceInStack(input: IEditorInput, selection?: ITextEditorSelection, forceReplace?: boolean): void {

		// Overwrite an entry in the stack if we have a matching input that comes
		// with editor options to indicate that this entry is more specific. Also
		// prevent entries that have the exact same options. Finally, Overwrite
		// entries if we detect that the change came in very fast which indicates
		// that it was not coming in from a user change but rather rapid programmatic
		// changes. We just take the last of the changes to not cause too many entries
		// on the stack.
		// We can also be instructed to force replace the last entry.
		let replace = false;
		const currentEntry = this.stack[this.index];
		if (currentEntry) {
			if (forceReplace) {
				replace = true; // replace if we are forced to
			} else if (this.matches(input, currentEntry.input) && this.sameSelection(currentEntry.selection, selection)) {
				replace = true; // replace if the input is the same as the current one and the selection as well
			}
		}

		const stackInput = this.preferResourceInput(input);
		const entry = { input: stackInput, selection };

		// Replace at current position
		if (replace) {
			this.stack[this.index] = entry;
		}

		// Add to stack at current position
		else {

			// If we are not at the end of history, we remove anything after
			if (this.stack.length > this.index + 1) {
				this.stack = this.stack.slice(0, this.index + 1);
			}

			this.stack.splice(this.index + 1, 0, entry);

			// Check for limit
			if (this.stack.length > HistoryService.MAX_STACK_ITEMS) {
				this.stack.shift(); // remove first and dispose
				if (this.lastIndex >= 0) {
					this.lastIndex--;
				}
			} else {
				this.setIndex(this.index + 1);
			}
		}

		// Remove this from the stack unless the stack input is a resource
		// that can easily be restored even when the input gets disposed
		if (stackInput instanceof EditorInput) {
			once(stackInput.onDispose)(() => this.removeFromStack(input));
		}

		// Context
		this.updateContextKeys();
	}

	private preferResourceInput(input: IEditorInput): IEditorInput | IResourceInput {
		if (this.fileInputFactory.isFileInput(input)) {
			return { resource: input.getResource() };
		}

		return input;
	}

	private sameSelection(selectionA?: ITextEditorSelection, selectionB?: ITextEditorSelection): boolean {
		if (!selectionA && !selectionB) {
			return true;
		}

		if ((!selectionA && selectionB) || (selectionA && !selectionB)) {
			return false;
		}

		return selectionA.startLineNumber === selectionB.startLineNumber; // we consider the history entry same if we are on the same line
	}

	private removeFromStack(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.stack = this.stack.filter(e => !this.matches(arg1, e.input));
		this.index = this.stack.length - 1; // reset index
		this.lastIndex = -1;

		this.updateContextKeys();
	}

	private removeFromRecentlyClosedFiles(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.recentlyClosedFiles = this.recentlyClosedFiles.filter(e => !this.matchesFile(e.resource, arg1));
	}

	private removeFromRecentlyOpened(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		if (arg1 instanceof EditorInput || arg1 instanceof FileChangesEvent) {
			return; // for now do not delete from file events since recently open are likely out of workspace files for which there are no delete events
		}

		const input = arg1 as IResourceInput;

		this.windowService.removeFromRecentlyOpened([input.resource]);
	}

	private isFileOpened(resource: URI, group: IEditorGroup): boolean {
		if (!group) {
			return false;
		}

		if (!this.editorService.isOpen({ resource }, group)) {
			return false; // fast check
		}

		return group.editors.some(e => this.matchesFile(resource, e));
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
			const inputResource = arg2.getResource();
			if (!inputResource) {
				return false;
			}

			if (this.partService.isCreated() && !this.fileService.canHandleResource(inputResource)) {
				return false; // make sure to only check this when workbench has started (for https://github.com/Microsoft/vscode/issues/48275)
			}

			return inputResource.toString() === resource.toString();
		}

		const resourceInput = arg2 as IResourceInput;

		return resourceInput && resourceInput.resource.toString() === resource.toString();
	}

	getHistory(): (IEditorInput | IResourceInput)[] {
		this.ensureHistoryLoaded();

		return this.history.slice(0);
	}

	private ensureHistoryLoaded(): void {
		if (!this.loaded) {
			this.loadHistory();
		}

		this.loaded = true;
	}

	private saveState(): void {
		if (!this.history) {
			return; // nothing to save because history was not used
		}

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories);

		const entries: ISerializedEditorHistoryEntry[] = this.history.map(input => {

			// Editor input: try via factory
			if (input instanceof EditorInput) {
				const factory = registry.getEditorInputFactory(input.getTypeId());
				if (factory) {
					const deserialized = factory.serialize(input);
					if (deserialized) {
						return { editorInputJSON: { typeId: input.getTypeId(), deserialized } } as ISerializedEditorHistoryEntry;
					}
				}
			}

			// File resource: via URI.toJSON()
			else {
				return { resourceJSON: (input as IResourceInput).resource.toJSON() } as ISerializedEditorHistoryEntry;
			}

			return void 0;
		}).filter(serialized => !!serialized);

		this.storageService.store(HistoryService.STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE);
	}

	private loadHistory(): void {
		let entries: ISerializedEditorHistoryEntry[] = [];

		const entriesRaw = this.storageService.get(HistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			entries = JSON.parse(entriesRaw).filter((entry: object) => !!entry);
		}

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories);

		this.history = entries.map(entry => {
			try {
				return this.safeLoadHistoryEntry(registry, entry);
			} catch (error) {
				onUnexpectedError(error);

				return void 0; // https://github.com/Microsoft/vscode/issues/60960
			}
		}).filter(input => !!input);
	}

	private safeLoadHistoryEntry(registry: IEditorInputFactoryRegistry, entry: ISerializedEditorHistoryEntry): IEditorInput | IResourceInput {
		const serializedEditorHistoryEntry = entry as ISerializedEditorHistoryEntry;

		// File resource: via URI.revive()
		if (serializedEditorHistoryEntry.resourceJSON) {
			return { resource: URI.revive(serializedEditorHistoryEntry.resourceJSON) } as IResourceInput;
		}

		// Editor input: via factory
		const { editorInputJSON } = serializedEditorHistoryEntry;
		if (editorInputJSON && editorInputJSON.deserialized) {
			const factory = registry.getEditorInputFactory(editorInputJSON.typeId);
			if (factory) {
				const input = factory.deserialize(this.instantiationService, editorInputJSON.deserialized);
				if (input) {
					once(input.onDispose)(() => this.removeFromHistory(input)); // remove from history once disposed
				}

				return input;
			}
		}

		return void 0;
	}

	getLastActiveWorkspaceRoot(schemeFilter?: string): URI {

		// No Folder: return early
		const folders = this.contextService.getWorkspace().folders;
		if (folders.length === 0) {
			return void 0;
		}

		// Single Folder: return early
		if (folders.length === 1) {
			const resource = folders[0].uri;
			if (!schemeFilter || resource.scheme === schemeFilter) {
				return resource;
			}

			return void 0;
		}

		// Multiple folders: find the last active one
		const history = this.getHistory();
		for (let i = 0; i < history.length; i++) {
			const input = history[i];
			if (input instanceof EditorInput) {
				continue;
			}

			const resourceInput = input as IResourceInput;
			if (schemeFilter && resourceInput.resource.scheme !== schemeFilter) {
				continue;
			}

			const resourceWorkspace = this.contextService.getWorkspaceFolder(resourceInput.resource);
			if (resourceWorkspace) {
				return resourceWorkspace.uri;
			}
		}

		// fallback to first workspace matching scheme filter if any
		for (let i = 0; i < folders.length; i++) {
			const resource = folders[i].uri;
			if (!schemeFilter || resource.scheme === schemeFilter) {
				return resource;
			}
		}

		return void 0;
	}

	getLastActiveFile(schemeFilter: string): URI {
		const history = this.getHistory();
		for (let i = 0; i < history.length; i++) {
			let resource: URI;

			const input = history[i];
			if (input instanceof EditorInput) {
				resource = toResource(input, { filter: schemeFilter });
			} else {
				resource = (input as IResourceInput).resource;
			}

			if (resource && resource.scheme === schemeFilter) {
				return resource;
			}
		}

		return void 0;
	}
}
