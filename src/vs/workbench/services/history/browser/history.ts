/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEditor } from 'vs/editor/common/editorCommon';
import { ITextEditorOptions, IResourceInput, ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor as IBaseEditor, Extensions as EditorExtensions, EditorInput, IEditorCloseEvent, IEditorInputFactoryRegistry, toResource, Extensions as EditorInputExtensions, IFileInputFactory, IEditorIdentifier } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileChangesEvent, IFileService, FileChangeType, FILES_EXCLUDE_CONFIG } from 'vs/platform/files/common/files';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { Event } from 'vs/base/common/event';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { getCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { getExcludes, ISearchConfiguration } from 'vs/workbench/services/search/common/search';
import { IExpression } from 'vs/base/common/glob';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { coalesce } from 'vs/base/common/arrays';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { withNullAsUndefined } from 'vs/base/common/types';
import { addDisposableListener, EventType, EventHelper } from 'vs/base/browser/dom';

/**
 * Stores the selection & view state of an editor and allows to compare it to other selection states.
 */
export class TextEditorState {

	private static readonly EDITOR_SELECTION_THRESHOLD = 10; // number of lines to move in editor to justify for new state

	private textEditorSelection?: ITextEditorSelection;

	constructor(private _editorInput: IEditorInput, private _selection: Selection | null) {
		this.textEditorSelection = Selection.isISelection(_selection) ? {
			startLineNumber: _selection.startLineNumber,
			startColumn: _selection.startColumn
		} : undefined;
	}

	get editorInput(): IEditorInput {
		return this._editorInput;
	}

	get selection(): ITextEditorSelection | undefined {
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

	_serviceBrand!: ServiceIdentifier<any>;

	private static readonly STORAGE_KEY = 'history.entries';
	private static readonly MAX_HISTORY_ITEMS = 200;
	private static readonly MAX_STACK_ITEMS = 50;
	private static readonly MAX_RECENTLY_CLOSED_EDITORS = 20;

	private readonly activeEditorListeners = this._register(new DisposableStore());
	private lastActiveEditor?: IEditorIdentifier;

	private readonly editorHistoryListeners: Map<EditorInput, DisposableStore> = new Map();
	private readonly editorStackListeners: Map<EditorInput, DisposableStore> = new Map();

	private stack: IStackEntry[];
	private index: number;
	private lastIndex: number;
	private navigatingInStack = false;
	private currentTextEditorState: TextEditorState | null = null;

	private lastEditLocation: IStackEntry | undefined;

	private history: Array<IEditorInput | IResourceInput>;
	private recentlyClosedFiles: IRecentlyClosedFile[];
	private loaded: boolean;
	private resourceFilter: ResourceGlobMatcher;

	private fileInputFactory: IFileInputFactory;

	private canNavigateBackContextKey: IContextKey<boolean>;
	private canNavigateForwardContextKey: IContextKey<boolean>;
	private canNavigateToLastEditLocationContextKey: IContextKey<boolean>;

	constructor(
		@IEditorService private readonly editorService: EditorServiceImpl,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IWindowService private readonly windowService: IWindowService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.canNavigateBackContextKey = (new RawContextKey<boolean>('canNavigateBack', false)).bindTo(this.contextKeyService);
		this.canNavigateForwardContextKey = (new RawContextKey<boolean>('canNavigateForward', false)).bindTo(this.contextKeyService);
		this.canNavigateToLastEditLocationContextKey = (new RawContextKey<boolean>('canNavigateToLastEditLocation', false)).bindTo(this.contextKeyService);

		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).getFileInputFactory();

		this.index = -1;
		this.lastIndex = -1;
		this.stack = [];
		this.recentlyClosedFiles = [];
		this.loaded = false;
		this.resourceFilter = this._register(instantiationService.createInstance(
			ResourceGlobMatcher,
			(root?: URI) => this.getExcludes(root),
			(event: IConfigurationChangeEvent) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG) || event.affectsConfiguration('search.exclude')
		));

		this.registerListeners();
	}

	private getExcludes(root?: URI): IExpression {
		const scope = root ? { resource: root } : undefined;

		return getExcludes(scope ? this.configurationService.getValue<ISearchConfiguration>(scope) : this.configurationService.getValue<ISearchConfiguration>())!;
	}

	private registerListeners(): void {
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChanged()));
		this._register(this.editorService.onDidOpenEditorFail(event => this.remove(event.editor)));
		this._register(this.editorService.onDidCloseEditor(event => this.onEditorClosed(event)));
		this._register(this.storageService.onWillSaveState(() => this.saveState()));
		this._register(this.fileService.onFileChanges(event => this.onFileChanges(event)));
		this._register(this.resourceFilter.onExpressionChange(() => this.handleExcludesChange()));

		// if the service is created late enough that an editor is already opened
		// make sure to trigger the onActiveEditorChanged() to track the editor
		// properly (fixes https://github.com/Microsoft/vscode/issues/59908)
		if (this.editorService.activeControl) {
			this.onActiveEditorChanged();
		}

		// Mouse back/forward support
		const mouseBackForwardSupportListener = this._register(new DisposableStore());
		const handleMouseBackForwardSupport = () => {
			mouseBackForwardSupportListener.clear();

			if (this.configurationService.getValue('workbench.editor.mouseBackForwardToNavigate')) {
				mouseBackForwardSupportListener.add(addDisposableListener(this.layoutService.getWorkbenchElement(), EventType.MOUSE_DOWN, e => this.onMouseDown(e)));
			}
		};

		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('workbench.editor.mouseBackForwardToNavigate')) {
				handleMouseBackForwardSupport();
			}
		}));

		handleMouseBackForwardSupport();
	}

	private onMouseDown(e: MouseEvent): void {

		// Support to navigate in history when mouse buttons 4/5 are pressed
		switch (e.button) {
			case 3:
				EventHelper.stop(e);
				this.back();
				break;
			case 4:
				EventHelper.stop(e);
				this.forward();
				break;
		}
	}

	private onActiveEditorChanged(): void {
		const activeControl = this.editorService.activeControl;
		if (this.lastActiveEditor && this.matchesEditor(this.lastActiveEditor, activeControl)) {
			return; // return if the active editor is still the same
		}

		// Remember as last active editor (can be undefined if none opened)
		this.lastActiveEditor = activeControl && activeControl.input && activeControl.group ? { editor: activeControl.input, groupId: activeControl.group.id } : undefined;

		// Dispose old listeners
		this.activeEditorListeners.clear();

		// Propagate to history
		this.handleActiveEditorChange(activeControl);

		// Apply listener for selection changes if this is a text editor
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		const activeEditor = this.editorService.activeEditor;
		if (activeTextEditorWidget) {

			// Debounce the event with a timeout of 0ms so that multiple calls to
			// editor.setSelection() are folded into one. We do not want to record
			// subsequent history navigations for such API calls.
			this.activeEditorListeners.add(Event.debounce(activeTextEditorWidget.onDidChangeCursorPosition, (last, event) => event, 0)((event => {
				this.handleEditorSelectionChangeEvent(activeControl, event);
			})));

			// Track the last edit location by tracking model content change events
			// Use a debouncer to make sure to capture the correct cursor position
			// after the model content has changed.
			this.activeEditorListeners.add(Event.debounce(activeTextEditorWidget.onDidChangeModelContent, (last, event) => event, 0)((event => this.rememberLastEditLocation(activeEditor!, activeTextEditorWidget))));
		}
	}

	private rememberLastEditLocation(activeEditor: IEditorInput, activeTextEditorWidget: ICodeEditor): void {
		this.lastEditLocation = { input: activeEditor };
		this.canNavigateToLastEditLocationContextKey.set(true);

		const position = activeTextEditorWidget.getPosition();
		if (position) {
			this.lastEditLocation.selection = {
				startLineNumber: position.lineNumber,
				startColumn: position.column
			};
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
			const resource = event.editor ? event.editor.getResource() : undefined;
			const supportsReopen = resource && this.fileService.canHandleResource(resource); // we only support file'ish things to reopen
			if (resource && supportsReopen) {

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
			this.editorService.openEditor({ resource: lastClosedFile.resource, options: { pinned: true, index: lastClosedFile.index } }).then(editor => {

				// Fix for https://github.com/Microsoft/vscode/issues/67882
				// If opening of the editor fails, make sure to try the next one
				// but make sure to remove this one from the list to prevent
				// endless loops.
				if (!editor) {
					this.recentlyClosedFiles.pop();
					this.reopenLastClosedEditor();
				}
			});
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
		this.editorStackListeners.forEach(listeners => dispose(listeners));
		this.editorStackListeners.clear();

		// Closed files
		this.recentlyClosedFiles = [];

		// History
		this.clearRecentlyOpened();

		this.updateContextKeys();
	}

	clearRecentlyOpened(): void {
		this.history = [];

		this.editorHistoryListeners.forEach(listeners => dispose(listeners));
		this.editorHistoryListeners.clear();
	}

	private updateContextKeys(): void {
		this.canNavigateBackContextKey.set(this.stack.length > 0 && this.index > 0);
		this.canNavigateForwardContextKey.set(this.stack.length > 0 && this.index < this.stack.length - 1);
	}

	private navigate(acrossEditors?: boolean): void {
		this.navigatingInStack = true;

		this.doNavigate(this.stack[this.index], !acrossEditors).finally(() => this.navigatingInStack = false);
	}

	private doNavigate(location: IStackEntry, withSelection: boolean): Promise<IBaseEditor | undefined> {
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
		const input = editor ? editor.input : undefined;

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
			this.clearOnEditorDispose(this.history.pop()!, this.editorHistoryListeners);
		}

		// Remove this from the history unless the history input is a resource
		// that can easily be restored even when the input gets disposed
		if (historyInput instanceof EditorInput) {
			this.onEditorDispose(historyInput, () => this.removeFromHistory(historyInput), this.editorHistoryListeners);
		}
	}

	private onEditorDispose(editor: EditorInput, listener: Function, mapEditorToDispose: Map<EditorInput, DisposableStore>): void {
		const toDispose = Event.once(editor.onDispose)(() => listener());

		let disposables = mapEditorToDispose.get(editor);
		if (!disposables) {
			disposables = new DisposableStore();
			mapEditorToDispose.set(editor, disposables);
		}

		disposables.add(toDispose);
	}

	private clearOnEditorDispose(editor: IEditorInput | IResourceInput | FileChangesEvent, mapEditorToDispose: Map<EditorInput, DisposableStore>): void {
		if (editor instanceof EditorInput) {
			const disposables = mapEditorToDispose.get(editor);
			if (disposables) {
				dispose(disposables);
				mapEditorToDispose.delete(editor);
			}
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

		this.history = this.history.filter(e => {
			const include = this.include(e);

			// Cleanup any listeners associated with the input when removing from history
			if (!include) {
				this.clearOnEditorDispose(e, this.editorHistoryListeners);
			}

			return include;
		});
	}

	private removeFromHistory(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.ensureHistoryLoaded();

		this.history = this.history.filter(e => {
			const matches = this.matches(arg1, e);

			// Cleanup any listeners associated with the input when removing from history
			if (matches) {
				this.clearOnEditorDispose(arg1, this.editorHistoryListeners);
			}

			return !matches;
		});
	}

	private handleEditorEventInStack(control: IBaseEditor | undefined, event?: ICursorPositionChangedEvent): void {
		const codeEditor = control ? getCodeEditor(control.getControl()) : undefined;

		// treat editor changes that happen as part of stack navigation specially
		// we do not want to add a new stack entry as a matter of navigating the
		// stack but we need to keep our currentTextEditorState up to date with
		// the navigtion that occurs.
		if (this.navigatingInStack) {
			if (codeEditor && control && control.input) {
				this.currentTextEditorState = new TextEditorState(control.input, codeEditor.getSelection());
			} else {
				this.currentTextEditorState = null; // we navigated to a non text editor
			}
		}

		// normal navigation not part of history navigation
		else {

			// navigation inside text editor
			if (codeEditor && control && control.input) {
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
		if (!editor.input) {
			return;
		}

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
		if (!editor.input) {
			return;
		}

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
		let removedEntries: IStackEntry[] = [];
		if (replace) {
			removedEntries.push(this.stack[this.index]);
			this.stack[this.index] = entry;
		}

		// Add to stack at current position
		else {

			// If we are not at the end of history, we remove anything after
			if (this.stack.length > this.index + 1) {
				for (let i = this.index + 1; i < this.stack.length; i++) {
					removedEntries.push(this.stack[i]);
				}

				this.stack = this.stack.slice(0, this.index + 1);
			}

			// Insert entry at index
			this.stack.splice(this.index + 1, 0, entry);

			// Check for limit
			if (this.stack.length > HistoryService.MAX_STACK_ITEMS) {
				removedEntries.push(this.stack.shift()!); // remove first
				if (this.lastIndex >= 0) {
					this.lastIndex--;
				}
			} else {
				this.setIndex(this.index + 1);
			}
		}

		// Clear editor listeners from removed entries
		removedEntries.forEach(removedEntry => this.clearOnEditorDispose(removedEntry.input, this.editorStackListeners));

		// Remove this from the stack unless the stack input is a resource
		// that can easily be restored even when the input gets disposed
		if (stackInput instanceof EditorInput) {
			this.onEditorDispose(stackInput, () => this.removeFromStack(stackInput), this.editorStackListeners);
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

		if (!selectionA || !selectionB) {
			return false;
		}

		return selectionA.startLineNumber === selectionB.startLineNumber; // we consider the history entry same if we are on the same line
	}

	private removeFromStack(arg1: IEditorInput | IResourceInput | FileChangesEvent): void {
		this.stack = this.stack.filter(e => {
			const matches = this.matches(arg1, e.input);

			// Cleanup any listeners associated with the input when removing
			if (matches) {
				this.clearOnEditorDispose(arg1, this.editorStackListeners);
			}

			return !matches;
		});
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

			if (this.layoutService.isRestored() && !this.fileService.canHandleResource(inputResource)) {
				return false; // make sure to only check this when workbench has restored (for https://github.com/Microsoft/vscode/issues/48275)
			}

			return inputResource.toString() === resource.toString();
		}

		const resourceInput = arg2 as IResourceInput;

		return resourceInput && resourceInput.resource.toString() === resource.toString();
	}

	getHistory(): Array<IEditorInput | IResourceInput> {
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

		const entries: ISerializedEditorHistoryEntry[] = coalesce(this.history.map((input): ISerializedEditorHistoryEntry | undefined => {

			// Editor input: try via factory
			if (input instanceof EditorInput) {
				const factory = registry.getEditorInputFactory(input.getTypeId());
				if (factory) {
					const deserialized = factory.serialize(input);
					if (deserialized) {
						return { editorInputJSON: { typeId: input.getTypeId(), deserialized } };
					}
				}
			}

			// File resource: via URI.toJSON()
			else {
				return { resourceJSON: (input as IResourceInput).resource.toJSON() };
			}

			return undefined;
		}));

		this.storageService.store(HistoryService.STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE);
	}

	private loadHistory(): void {
		let entries: ISerializedEditorHistoryEntry[] = [];

		const entriesRaw = this.storageService.get(HistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			entries = coalesce(JSON.parse(entriesRaw));
		}

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories);

		this.history = coalesce(entries.map(entry => {
			try {
				return this.safeLoadHistoryEntry(registry, entry);
			} catch (error) {
				onUnexpectedError(error);

				return undefined; // https://github.com/Microsoft/vscode/issues/60960
			}
		}));
	}

	private safeLoadHistoryEntry(registry: IEditorInputFactoryRegistry, entry: ISerializedEditorHistoryEntry): IEditorInput | IResourceInput | undefined {
		const serializedEditorHistoryEntry = entry;

		// File resource: via URI.revive()
		if (serializedEditorHistoryEntry.resourceJSON) {
			return { resource: URI.revive(<UriComponents>serializedEditorHistoryEntry.resourceJSON) };
		}

		// Editor input: via factory
		const { editorInputJSON } = serializedEditorHistoryEntry;
		if (editorInputJSON && editorInputJSON.deserialized) {
			const factory = registry.getEditorInputFactory(editorInputJSON.typeId);
			if (factory) {
				const input = factory.deserialize(this.instantiationService, editorInputJSON.deserialized);
				if (input) {
					this.onEditorDispose(input, () => this.removeFromHistory(input), this.editorHistoryListeners);
				}

				return withNullAsUndefined(input);
			}
		}

		return undefined;
	}

	getLastActiveWorkspaceRoot(schemeFilter?: string): URI | undefined {

		// No Folder: return early
		const folders = this.contextService.getWorkspace().folders;
		if (folders.length === 0) {
			return undefined;
		}

		// Single Folder: return early
		if (folders.length === 1) {
			const resource = folders[0].uri;
			if (!schemeFilter || resource.scheme === schemeFilter) {
				return resource;
			}

			return undefined;
		}

		// Multiple folders: find the last active one
		const history = this.getHistory();
		for (const input of history) {
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
		for (const folder of folders) {
			const resource = folder.uri;
			if (!schemeFilter || resource.scheme === schemeFilter) {
				return resource;
			}
		}

		return undefined;
	}

	getLastActiveFile(filterByScheme: string): URI | undefined {
		const history = this.getHistory();
		for (const input of history) {
			let resource: URI | undefined;
			if (input instanceof EditorInput) {
				resource = toResource(input, { filterByScheme });
			} else {
				resource = (input as IResourceInput).resource;
			}

			if (resource && resource.scheme === filterByScheme) {
				return resource;
			}
		}

		return undefined;
	}
}

registerSingleton(IHistoryService, HistoryService);
