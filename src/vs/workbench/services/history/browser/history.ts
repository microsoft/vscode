/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { parse, stringify } from 'vs/base/common/marshalling';
import { IEditor } from 'vs/editor/common/editorCommon';
import { ITextEditorOptions, IResourceEditorInput, TextEditorSelectionRevealType, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorPane, IEditorCloseEvent, EditorResourceAccessor, IEditorIdentifier, GroupIdentifier, EditorsOrder, SideBySideEditor, IUntypedEditorInput, isResourceEditorInput, isEditorInput, isSideBySideEditorInput, EditorCloseContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileChangesEvent, IFileService, FileChangeType, FILES_EXCLUDE_CONFIG, FileOperationEvent, FileOperation } from 'vs/platform/files/common/files';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { getCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { getExcludes, ISearchConfiguration, SEARCH_EXCLUDE_CONFIG } from 'vs/workbench/services/search/common/search';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { coalesce, remove } from 'vs/base/common/arrays';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { withNullAsUndefined } from 'vs/base/common/types';
import { addDisposableListener, EventType, EventHelper } from 'vs/base/browser/dom';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IdleValue } from 'vs/base/common/async';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

/**
 * Stores the selection & view state of an editor and allows to compare it to other selection states.
 */
class TextEditorState {

	private static readonly EDITOR_SELECTION_THRESHOLD = 10; // number of lines to move in editor to justify for new state

	constructor(private _editorInput: EditorInput, private _selection: Selection | null) { }

	get editorInput(): EditorInput {
		return this._editorInput;
	}

	get selection(): Selection | undefined {
		return withNullAsUndefined(this._selection);
	}

	justifiesNewPushState(other: TextEditorState, event?: ICursorPositionChangedEvent): boolean {
		if (event?.source === 'api') {
			return true; // always let API source win (e.g. "Go to definition" should add a history entry)
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

	/**
	 * The editor for the history entry. We currently only
	 * support untyped editor inputs with `resource`.
	 */
	editor: IResourceEditorInput;
}

interface IStackEntry {
	editor: EditorInput | IResourceEditorInput;
	selection?: Selection;
}

interface IRecentlyClosedEditor {
	editorId: string | undefined;
	editor: IUntypedEditorInput;

	resource: URI | undefined;
	associatedResources: URI[];

	index: number;
	sticky: boolean;
}

export class HistoryService extends Disposable implements IHistoryService {

	declare readonly _serviceBrand: undefined;

	private readonly activeEditorListeners = this._register(new DisposableStore());
	private lastActiveEditor?: IEditorIdentifier;

	private readonly editorStackListeners = new Map<EditorInput, DisposableStore>();

	constructor(
		@IEditorService private readonly editorService: EditorServiceImpl,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IPathService private readonly pathService: IPathService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
		this._register(this.editorService.onDidOpenEditorFail(event => this.remove(event.editor)));
		this._register(this.editorService.onDidCloseEditor(event => this.onDidCloseEditor(event)));
		this._register(this.editorService.onDidMostRecentlyActiveEditorsChange(() => this.handleEditorEventInRecentEditorsStack()));

		this._register(this.fileService.onDidFilesChange(event => this.onDidFilesChange(event)));
		this._register(this.fileService.onDidRunOperation(event => this.onDidFilesChange(event)));

		this._register(this.storageService.onWillSaveState(() => this.saveState()));

		// if the service is created late enough that an editor is already opened
		// make sure to trigger the onActiveEditorChanged() to track the editor
		// properly (fixes https://github.com/microsoft/vscode/issues/59908)
		if (this.editorService.activeEditorPane) {
			this.onDidActiveEditorChange();
		}

		// Mouse back/forward support
		const mouseBackForwardSupportListener = this._register(new DisposableStore());
		const handleMouseBackForwardSupport = () => {
			mouseBackForwardSupportListener.clear();

			if (this.configurationService.getValue('workbench.editor.mouseBackForwardToNavigate')) {
				mouseBackForwardSupportListener.add(addDisposableListener(this.layoutService.container, EventType.MOUSE_DOWN, e => this.onMouseDown(e)));
			}
		};

		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('workbench.editor.mouseBackForwardToNavigate')) {
				handleMouseBackForwardSupport();
			}
		}));

		handleMouseBackForwardSupport();
	}

	private onMouseDown(event: MouseEvent): void {

		// Support to navigate in history when mouse buttons 4/5 are pressed
		switch (event.button) {
			case 3:
				EventHelper.stop(event);
				this.back();
				break;
			case 4:
				EventHelper.stop(event);
				this.forward();
				break;
		}
	}

	private onDidActiveEditorChange(): void {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (this.lastActiveEditor && this.matchesEditor(this.lastActiveEditor, activeEditorPane)) {
			return; // return if the active editor is still the same
		}

		// Remember as last active editor (can be undefined if none opened)
		this.lastActiveEditor = activeEditorPane?.input && activeEditorPane.group ? { editor: activeEditorPane.input, groupId: activeEditorPane.group.id } : undefined;

		// Dispose old listeners
		this.activeEditorListeners.clear();

		// Handle editor change
		this.handleActiveEditorChange(activeEditorPane);

		// Apply listener for selection changes if this is a text editor
		const activeTextEditorControl = getCodeEditor(this.editorService.activeTextEditorControl);
		const activeEditor = this.editorService.activeEditor;
		if (activeTextEditorControl) {

			// Debounce the event with a timeout of 0ms so that multiple calls to
			// editor.setSelection() are folded into one. We do not want to record
			// subsequent history navigations for such API calls.
			this.activeEditorListeners.add(Event.debounce(activeTextEditorControl.onDidChangeCursorPosition, (last, event) => event, 0)((event => {
				this.handleEditorSelectionChangeEvent(activeEditorPane, event);
			})));

			// Track the last edit location by tracking model content change events
			// Use a debouncer to make sure to capture the correct cursor position
			// after the model content has changed.
			this.activeEditorListeners.add(Event.debounce(activeTextEditorControl.onDidChangeModelContent, (last, event) => event, 0)((event => {
				if (activeEditor) {
					this.rememberLastEditLocation(activeEditor, activeTextEditorControl);
				}
			})));
		}
	}

	private matchesEditor(identifier: IEditorIdentifier, editor?: IEditorPane): boolean {
		if (!editor || !editor.group) {
			return false;
		}

		if (identifier.groupId !== editor.group.id) {
			return false;
		}

		return editor.input ? identifier.editor.matches(editor.input) : false;
	}

	private onDidFilesChange(event: FileChangesEvent | FileOperationEvent): void {

		// External file changes (watcher)
		if (event instanceof FileChangesEvent) {
			if (event.gotDeleted()) {
				this.remove(event);
			}
		}

		// Internal file changes (e.g. explorer)
		else {

			// Delete
			if (event.isOperation(FileOperation.DELETE)) {
				this.remove(event);
			}

			// Move
			else if (event.isOperation(FileOperation.MOVE) && event.target.isFile) {
				this.move(event);
			}
		}
	}

	private handleEditorSelectionChangeEvent(editor?: IEditorPane, event?: ICursorPositionChangedEvent): void {
		this.handleEditorEventInNavigationStack(editor, event);
	}

	private handleActiveEditorChange(editor?: IEditorPane): void {
		this.handleEditorEventInHistory(editor);
		this.handleEditorEventInNavigationStack(editor);
	}

	private onEditorDispose(editor: EditorInput, listener: Function, mapEditorToDispose: Map<EditorInput, DisposableStore>): void {
		const toDispose = Event.once(editor.onWillDispose)(() => listener());

		let disposables = mapEditorToDispose.get(editor);
		if (!disposables) {
			disposables = new DisposableStore();
			mapEditorToDispose.set(editor, disposables);
		}

		disposables.add(toDispose);
	}

	private clearOnEditorDispose(editor: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent, mapEditorToDispose: Map<EditorInput, DisposableStore>): void {
		if (!isEditorInput(editor)) {
			return; // only supported when passing in an actual editor input
		}

		const disposables = mapEditorToDispose.get(editor);
		if (disposables) {
			dispose(disposables);
			mapEditorToDispose.delete(editor);
		}
	}

	private move(event: FileOperationEvent): void {
		this.moveInHistory(event);
		this.moveInNavigationStack(event);
	}

	private remove(input: EditorInput): void;
	private remove(event: FileChangesEvent): void;
	private remove(event: FileOperationEvent): void;
	private remove(arg1: EditorInput | FileChangesEvent | FileOperationEvent): void {
		this.removeFromHistory(arg1);
		this.removeFromNavigationStack(arg1);
		this.removeFromRecentlyClosedEditors(arg1);
		this.removeFromRecentlyOpened(arg1);
	}

	private removeFromRecentlyOpened(arg1: EditorInput | FileChangesEvent | FileOperationEvent): void {
		let resource: URI | undefined = undefined;
		if (isEditorInput(arg1)) {
			resource = EditorResourceAccessor.getOriginalUri(arg1);
		} else if (arg1 instanceof FileChangesEvent) {
			// Ignore for now (recently opened are most often out of workspace files anyway for which there are no file events)
		} else {
			resource = arg1.resource;
		}

		if (resource) {
			this.workspacesService.removeRecentlyOpened([resource]);
		}
	}

	clear(): void {

		// History
		this.clearRecentlyOpened();

		// Navigation (next, previous)
		this.navigationStackIndex = -1;
		this.lastNavigationStackIndex = -1;
		this.navigationStack.splice(0);
		this.editorStackListeners.forEach(listeners => dispose(listeners));
		this.editorStackListeners.clear();

		// Recently closed editors
		this.recentlyClosedEditors = [];

		// Context Keys
		this.updateContextKeys();
	}

	//#region Navigation (Go Forward, Go Backward)

	private static readonly MAX_NAVIGATION_STACK_ITEMS = 50;

	private navigationStack: IStackEntry[] = [];
	private navigationStackIndex = -1;
	private lastNavigationStackIndex = -1;

	private navigatingInStack = false;

	private currentTextEditorState: TextEditorState | null = null;

	forward(): void {
		if (this.navigationStack.length > this.navigationStackIndex + 1) {
			this.setIndex(this.navigationStackIndex + 1);
			this.navigate();
		}
	}

	back(): void {
		if (this.navigationStackIndex > 0) {
			this.setIndex(this.navigationStackIndex - 1);
			this.navigate();
		}
	}

	last(): void {
		if (this.lastNavigationStackIndex === -1) {
			this.back();
		} else {
			this.setIndex(this.lastNavigationStackIndex);
			this.navigate();
		}
	}

	private setIndex(value: number): void {
		this.lastNavigationStackIndex = this.navigationStackIndex;
		this.navigationStackIndex = value;

		// Context Keys
		this.updateContextKeys();
	}

	private navigate(): void {
		this.navigatingInStack = true;

		const navigateToStackEntry = this.navigationStack[this.navigationStackIndex];

		this.doNavigate(navigateToStackEntry).finally(() => { this.navigatingInStack = false; });
	}

	private doNavigate(location: IStackEntry): Promise<IEditorPane | undefined> {
		const options: ITextEditorOptions = {
			revealIfOpened: true, // support to navigate across editor groups,
			selection: location.selection,
			selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
		};

		if (isEditorInput(location.editor)) {
			return this.editorGroupService.activeGroup.openEditor(location.editor, options);
		}

		return this.editorService.openEditor({
			...location.editor,
			options: {
				...location.editor.options,
				...options
			}
		});
	}

	private handleEditorEventInNavigationStack(control: IEditorPane | undefined, event?: ICursorPositionChangedEvent): void {
		const codeEditor = control ? getCodeEditor(control.getControl()) : undefined;

		// treat editor changes that happen as part of stack navigation specially
		// we do not want to add a new stack entry as a matter of navigating the
		// stack but we need to keep our currentTextEditorState up to date with
		// the navigtion that occurs.
		if (this.navigatingInStack) {
			if (codeEditor && control?.input && !control.input.isDisposed()) {
				this.currentTextEditorState = new TextEditorState(control.input, codeEditor.getSelection());
			} else {
				this.currentTextEditorState = null; // we navigated to a non text or disposed editor
			}
		}

		// normal navigation not part of history navigation
		else {

			// navigation inside text editor
			if (codeEditor && control?.input && !control.input.isDisposed()) {
				this.handleTextEditorEventInNavigationStack(control, codeEditor, event);
			}

			// navigation to non-text disposed editor
			else {
				this.currentTextEditorState = null; // at this time we have no active text editor view state

				if (control?.input && !control.input.isDisposed()) {
					this.handleNonTextEditorEventInNavigationStack(control);
				}
			}
		}
	}

	private handleTextEditorEventInNavigationStack(editor: IEditorPane, editorControl: IEditor, event?: ICursorPositionChangedEvent): void {
		if (!editor.input) {
			return;
		}

		const stateCandidate = new TextEditorState(editor.input, editorControl.getSelection());

		// Add to stack if we dont have a current state or this new state justifies a push
		if (!this.currentTextEditorState || this.currentTextEditorState.justifiesNewPushState(stateCandidate, event)) {
			this.addToNavigationStack(editor.input, stateCandidate.selection);
		}

		// Otherwise we replace the current stack entry with this one
		else {
			this.replaceInNavigationStack(editor.input, stateCandidate.selection);
		}

		// Update our current text editor state
		this.currentTextEditorState = stateCandidate;
	}

	private handleNonTextEditorEventInNavigationStack(editor: IEditorPane): void {
		if (!editor.input) {
			return;
		}

		const currentStack = this.navigationStack[this.navigationStackIndex];
		if (currentStack && this.matches(editor.input, currentStack.editor)) {
			return; // do not push same editor input again
		}

		this.addToNavigationStack(editor.input);
	}

	private addToNavigationStack(input: EditorInput | IResourceEditorInput, selection?: Selection): void {
		if (!this.navigatingInStack) {
			this.doAddOrReplaceInNavigationStack(input, selection);
		}
	}

	private replaceInNavigationStack(input: EditorInput | IResourceEditorInput, selection?: Selection): void {
		if (!this.navigatingInStack) {
			this.doAddOrReplaceInNavigationStack(input, selection, true /* force replace */);
		}
	}

	private doAddOrReplaceInNavigationStack(input: EditorInput | IResourceEditorInput, selection?: Selection, forceReplace?: boolean): void {

		// Overwrite an entry in the stack if we have a matching input that comes
		// with editor options to indicate that this entry is more specific. Also
		// prevent entries that have the exact same options. Finally, Overwrite
		// entries if we detect that the change came in very fast which indicates
		// that it was not coming in from a user change but rather rapid programmatic
		// changes. We just take the last of the changes to not cause too many entries
		// on the stack.
		// We can also be instructed to force replace the last entry.
		let replace = false;
		const currentEntry = this.navigationStack[this.navigationStackIndex];
		if (currentEntry) {
			if (forceReplace) {
				replace = true; // replace if we are forced to
			} else if (this.matches(input, currentEntry.editor) && this.sameSelection(currentEntry.selection, selection)) {
				replace = true; // replace if the input is the same as the current one and the selection as well
			}
		}

		const stackEditorInput = this.preferResourceEditorInput(input);
		if (!stackEditorInput) {
			return;
		}

		const entry = { editor: stackEditorInput, selection };

		// Replace at current position
		let removedEntries: IStackEntry[] = [];
		if (replace) {
			removedEntries.push(this.navigationStack[this.navigationStackIndex]);
			this.navigationStack[this.navigationStackIndex] = entry;
		}

		// Add to stack at current position
		else {

			// If we are not at the end of history, we remove anything after
			if (this.navigationStack.length > this.navigationStackIndex + 1) {
				for (let i = this.navigationStackIndex + 1; i < this.navigationStack.length; i++) {
					removedEntries.push(this.navigationStack[i]);
				}

				this.navigationStack = this.navigationStack.slice(0, this.navigationStackIndex + 1);
			}

			// Insert entry at index
			this.navigationStack.splice(this.navigationStackIndex + 1, 0, entry);

			// Check for limit
			if (this.navigationStack.length > HistoryService.MAX_NAVIGATION_STACK_ITEMS) {
				removedEntries.push(this.navigationStack.shift()!); // remove first
				if (this.lastNavigationStackIndex >= 0) {
					this.lastNavigationStackIndex--;
				}
			} else {
				this.setIndex(this.navigationStackIndex + 1);
			}
		}

		// Clear editor listeners from removed entries
		for (const removedEntry of removedEntries) {
			this.clearOnEditorDispose(removedEntry.editor, this.editorStackListeners);
		}

		// Remove this from the stack unless the stack input is a resource
		// that can easily be restored even when the input gets disposed
		if (isEditorInput(stackEditorInput)) {
			this.onEditorDispose(stackEditorInput, () => this.removeFromNavigationStack(stackEditorInput), this.editorStackListeners);
		}

		// Context Keys
		this.updateContextKeys();
	}

	private preferResourceEditorInput(input: EditorInput): EditorInput | IResourceEditorInput;
	private preferResourceEditorInput(input: IResourceEditorInput): IResourceEditorInput | undefined;
	private preferResourceEditorInput(input: EditorInput | IResourceEditorInput): EditorInput | IResourceEditorInput | undefined;
	private preferResourceEditorInput(input: EditorInput | IResourceEditorInput): EditorInput | IResourceEditorInput | undefined {
		const resource = EditorResourceAccessor.getOriginalUri(input);

		// For now, only prefer well known schemes that we control to prevent
		// issues such as https://github.com/microsoft/vscode/issues/85204
		// from being used as resource inputs
		// resource inputs survive editor disposal and as such are a lot more
		// durable across editor changes and restarts
		const hasValidResourceEditorInputScheme =
			resource?.scheme === Schemas.file ||
			resource?.scheme === Schemas.vscodeRemote ||
			resource?.scheme === Schemas.userData ||
			resource?.scheme === this.pathService.defaultUriScheme;

		// Scheme is valid: prefer the untyped input
		// over the typed input if possible to keep
		// the entry across restarts
		if (hasValidResourceEditorInputScheme) {
			if (isEditorInput(input)) {
				const untypedInput = input.toUntyped();
				if (isResourceEditorInput(untypedInput)) {
					return untypedInput;
				}
			}

			return input;
		}

		// Scheme is invalid: allow the editor input
		// for as long as it is not disposed
		else {
			return isEditorInput(input) ? input : undefined;
		}
	}

	private sameSelection(selectionA?: Selection, selectionB?: Selection): boolean {
		if (!selectionA && !selectionB) {
			return true;
		}

		if (!selectionA || !selectionB) {
			return false;
		}

		return selectionA.startLineNumber === selectionB.startLineNumber; // we consider the history entry same if we are on the same line
	}

	private moveInNavigationStack(event: FileOperationEvent): void {
		const removed = this.removeFromNavigationStack(event);
		if (removed && event.target) {
			this.addToNavigationStack({ resource: event.target.resource });
		}
	}

	private removeFromNavigationStack(arg1: EditorInput | FileChangesEvent | FileOperationEvent): boolean {
		let removed = false;

		this.navigationStack = this.navigationStack.filter(entry => {
			const matches = this.matches(arg1, entry.editor);

			// Cleanup any listeners associated with the input when removing
			if (matches) {
				this.clearOnEditorDispose(arg1, this.editorStackListeners);
				removed = true;
			}

			return !matches;
		});
		this.navigationStackIndex = this.navigationStack.length - 1; // reset index
		this.lastNavigationStackIndex = -1;

		// Context Keys
		this.updateContextKeys();

		return removed;
	}

	private matches(arg1: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent, inputB: EditorInput | IResourceEditorInput): boolean {
		if (arg1 instanceof FileChangesEvent || arg1 instanceof FileOperationEvent) {
			if (isEditorInput(inputB)) {
				return false; // we only support this for `IResourceEditorInputs` that are file based
			}

			if (arg1 instanceof FileChangesEvent) {
				return arg1.contains(inputB.resource, FileChangeType.DELETED);
			}

			return this.matchesFile(inputB.resource, arg1);
		}

		if (isEditorInput(arg1)) {
			if (isEditorInput(inputB)) {
				return arg1.matches(inputB);
			}

			return this.matchesFile(inputB.resource, arg1);
		}

		if (isEditorInput(inputB)) {
			return this.matchesFile(arg1.resource, inputB);
		}

		return arg1 && inputB && this.uriIdentityService.extUri.isEqual(arg1.resource, inputB.resource);
	}

	private matchesFile(resource: URI, arg2: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent): boolean {
		if (arg2 instanceof FileChangesEvent) {
			return arg2.contains(resource, FileChangeType.DELETED);
		}

		if (arg2 instanceof FileOperationEvent) {
			return this.uriIdentityService.extUri.isEqualOrParent(resource, arg2.resource);
		}

		if (isEditorInput(arg2)) {
			const inputResource = arg2.resource;
			if (!inputResource) {
				return false;
			}

			if (this.lifecycleService.phase >= LifecyclePhase.Restored && !this.fileService.hasProvider(inputResource)) {
				return false; // make sure to only check this when workbench has restored (for https://github.com/microsoft/vscode/issues/48275)
			}

			return this.uriIdentityService.extUri.isEqual(inputResource, resource);
		}

		return this.uriIdentityService.extUri.isEqual(arg2?.resource, resource);
	}

	//#endregion

	//#region Recently Closed Editors

	private static readonly MAX_RECENTLY_CLOSED_EDITORS = 20;

	private recentlyClosedEditors: IRecentlyClosedEditor[] = [];
	private ignoreEditorCloseEvent = false;

	private onDidCloseEditor(event: IEditorCloseEvent): void {
		if (this.ignoreEditorCloseEvent) {
			return; // blocked
		}

		const { editor, context } = event;
		if (context === EditorCloseContext.REPLACE || context === EditorCloseContext.MOVE) {
			return; // ignore if editor was replaced or moved
		}

		const untypedEditor = editor.toUntyped();
		if (!untypedEditor) {
			return; // we need a untyped editor to restore from going forward
		}

		const associatedResources: URI[] = [];
		const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
		if (URI.isUri(editorResource)) {
			associatedResources.push(editorResource);
		} else if (editorResource) {
			associatedResources.push(...coalesce([editorResource.primary, editorResource.secondary]));
		}

		// Remove from list of recently closed before...
		this.removeFromRecentlyClosedEditors(editor);

		// ...adding it as last recently closed
		this.recentlyClosedEditors.push({
			editorId: editor.editorId,
			editor: untypedEditor,
			resource: EditorResourceAccessor.getOriginalUri(editor),
			associatedResources,
			index: event.index,
			sticky: event.sticky
		});

		// Bounding
		if (this.recentlyClosedEditors.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
			this.recentlyClosedEditors.shift();
		}

		// Context
		this.canReopenClosedEditorContextKey.set(true);
	}

	reopenLastClosedEditor(): void {

		// Open editor if we have one
		const lastClosedEditor = this.recentlyClosedEditors.pop();
		if (lastClosedEditor) {
			this.doReopenLastClosedEditor(lastClosedEditor);
		}

		// Update context
		this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
	}

	private async doReopenLastClosedEditor(lastClosedEditor: IRecentlyClosedEditor): Promise<void> {
		const options: IEditorOptions = { pinned: true, sticky: lastClosedEditor.sticky, index: lastClosedEditor.index, ignoreError: true };

		// Special sticky handling: remove the index property from options
		// if that would result in sticky state to not preserve or apply
		// wrongly.
		if (
			(lastClosedEditor.sticky && !this.editorGroupService.activeGroup.isSticky(lastClosedEditor.index)) ||
			(!lastClosedEditor.sticky && this.editorGroupService.activeGroup.isSticky(lastClosedEditor.index))
		) {
			options.index = undefined;
		}

		// Re-open editor unless already opened
		let editorPane: IEditorPane | undefined = undefined;
		if (!this.editorGroupService.activeGroup.contains(lastClosedEditor.editor)) {
			// Fix for https://github.com/microsoft/vscode/issues/107850
			// If opening an editor fails, it is possible that we get
			// another editor-close event as a result. But we really do
			// want to ignore that in our list of recently closed editors
			//  to prevent endless loops.
			this.ignoreEditorCloseEvent = true;
			try {
				editorPane = await this.editorService.openEditor({
					...lastClosedEditor.editor,
					options: {
						...lastClosedEditor.editor.options,
						...options
					}
				});
			} finally {
				this.ignoreEditorCloseEvent = false;
			}
		}

		// If no editor was opened, try with the next one
		if (!editorPane) {
			// Fix for https://github.com/microsoft/vscode/issues/67882
			// If opening of the editor fails, make sure to try the next one
			// but make sure to remove this one from the list to prevent
			// endless loops.
			remove(this.recentlyClosedEditors, lastClosedEditor);

			// Try with next one
			this.reopenLastClosedEditor();
		}
	}

	private removeFromRecentlyClosedEditors(arg1: EditorInput | FileChangesEvent | FileOperationEvent): void {
		this.recentlyClosedEditors = this.recentlyClosedEditors.filter(recentlyClosedEditor => {
			if (isEditorInput(arg1) && recentlyClosedEditor.editorId !== arg1.editorId) {
				return true; // keep: different editor identifiers
			}

			if (recentlyClosedEditor.resource && this.matchesFile(recentlyClosedEditor.resource, arg1)) {
				return false; // remove: editor matches directly
			}

			if (recentlyClosedEditor.associatedResources.some(associatedResource => this.matchesFile(associatedResource, arg1))) {
				return false; // remove: an associated resource matches
			}

			return true; // keep
		});

		// Update context
		this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
	}

	//#endregion

	//#region Last Edit Location

	private lastEditLocation: IStackEntry | undefined;

	private rememberLastEditLocation(activeEditor: EditorInput, activeTextEditorControl: ICodeEditor): void {
		this.lastEditLocation = { editor: activeEditor };
		this.canNavigateToLastEditLocationContextKey.set(true);

		const position = activeTextEditorControl.getPosition();
		if (position) {
			this.lastEditLocation.selection = new Selection(position.lineNumber, position.column, position.lineNumber, position.column);
		}
	}

	openLastEditLocation(): void {
		if (this.lastEditLocation) {
			this.doNavigate(this.lastEditLocation);
		}
	}

	//#endregion

	//#region Context Keys

	private readonly canNavigateBackContextKey = (new RawContextKey<boolean>('canNavigateBack', false, localize('canNavigateBack', "Whether it is possible to navigate back in editor history"))).bindTo(this.contextKeyService);
	private readonly canNavigateForwardContextKey = (new RawContextKey<boolean>('canNavigateForward', false, localize('canNavigateForward', "Whether it is possible to navigate forward in editor history"))).bindTo(this.contextKeyService);
	private readonly canNavigateToLastEditLocationContextKey = (new RawContextKey<boolean>('canNavigateToLastEditLocation', false, localize('canNavigateToLastEditLocation', "Whether it is possible to navigate to the last edit location"))).bindTo(this.contextKeyService);
	private readonly canReopenClosedEditorContextKey = (new RawContextKey<boolean>('canReopenClosedEditor', false, localize('canReopenClosedEditor', "Whether it is possible to reopen the last closed editor"))).bindTo(this.contextKeyService);

	private updateContextKeys(): void {
		this.contextKeyService.bufferChangeEvents(() => {
			this.canNavigateBackContextKey.set(this.navigationStack.length > 0 && this.navigationStackIndex > 0);
			this.canNavigateForwardContextKey.set(this.navigationStack.length > 0 && this.navigationStackIndex < this.navigationStack.length - 1);
			this.canNavigateToLastEditLocationContextKey.set(!!this.lastEditLocation);
			this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
		});
	}

	//#endregion

	//#region History

	private static readonly MAX_HISTORY_ITEMS = 200;
	private static readonly HISTORY_STORAGE_KEY = 'history.entries';

	private history: Array<EditorInput | IResourceEditorInput> | undefined = undefined;

	private readonly editorHistoryListeners = new Map<EditorInput, DisposableStore>();

	private readonly resourceExcludeMatcher = this._register(new IdleValue(() => {
		const matcher = this._register(this.instantiationService.createInstance(
			ResourceGlobMatcher,
			root => getExcludes(root ? this.configurationService.getValue<ISearchConfiguration>({ resource: root }) : this.configurationService.getValue<ISearchConfiguration>()) || Object.create(null),
			event => event.affectsConfiguration(FILES_EXCLUDE_CONFIG) || event.affectsConfiguration(SEARCH_EXCLUDE_CONFIG)
		));

		this._register(matcher.onExpressionChange(() => this.removeExcludedFromHistory()));

		return matcher;
	}));

	private handleEditorEventInHistory(editor?: IEditorPane): void {

		// Ensure we have not configured to exclude input and don't track invalid inputs
		const input = editor?.input;
		if (!input || input.isDisposed() || !this.includeInHistory(input)) {
			return;
		}

		// Remove any existing entry and add to the beginning
		this.removeFromHistory(input);
		this.addToHistory(input);
	}

	private addToHistory(input: EditorInput | IResourceEditorInput, insertFirst = true): void {
		this.ensureHistoryLoaded(this.history);

		const historyInput = this.preferResourceEditorInput(input);
		if (!historyInput) {
			return;
		}

		// Insert based on preference
		if (insertFirst) {
			this.history.unshift(historyInput);
		} else {
			this.history.push(historyInput);
		}

		// Respect max entries setting
		if (this.history.length > HistoryService.MAX_HISTORY_ITEMS) {
			this.clearOnEditorDispose(this.history.pop()!, this.editorHistoryListeners);
		}

		// React to editor input disposing if this is a typed editor
		if (isEditorInput(historyInput)) {
			this.onEditorDispose(historyInput, () => this.updateHistoryOnEditorDispose(historyInput), this.editorHistoryListeners);
		}
	}

	private updateHistoryOnEditorDispose(historyInput: EditorInput): void {

		// Any non side-by-side editor input gets removed directly on dispose
		if (!isSideBySideEditorInput(historyInput)) {
			this.removeFromHistory(historyInput);
		}

		// Side-by-side editors get special treatment: we try to distill the
		// possibly untyped resource inputs from both sides to be able to
		// offer these entries from the history to the user still.
		else {
			const resourceInputs: IResourceEditorInput[] = [];
			const sideInputs = historyInput.primary.matches(historyInput.secondary) ? [historyInput.primary] : [historyInput.primary, historyInput.secondary];
			for (const sideInput of sideInputs) {
				const candidateResourceInput = this.preferResourceEditorInput(sideInput);
				if (isResourceEditorInput(candidateResourceInput)) {
					resourceInputs.push(candidateResourceInput);
				}
			}

			// Insert the untyped resource inputs where our disposed
			// side-by-side editor input is in the history stack
			this.replaceInHistory(historyInput, ...resourceInputs);
		}
	}

	private includeInHistory(input: EditorInput | IResourceEditorInput): boolean {
		if (isEditorInput(input)) {
			return true; // include any non files
		}

		return !this.resourceExcludeMatcher.value.matches(input.resource);
	}

	private removeExcludedFromHistory(): void {
		this.ensureHistoryLoaded(this.history);

		this.history = this.history.filter(entry => {
			const include = this.includeInHistory(entry);

			// Cleanup any listeners associated with the input when removing from history
			if (!include) {
				this.clearOnEditorDispose(entry, this.editorHistoryListeners);
			}

			return include;
		});
	}

	private moveInHistory(event: FileOperationEvent): void {
		const removed = this.removeFromHistory(event);
		if (removed && event.target) {
			this.addToHistory({ resource: event.target.resource });
		}
	}

	removeFromHistory(arg1: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent): boolean {
		let removed = false;

		this.ensureHistoryLoaded(this.history);

		this.history = this.history.filter(entry => {
			const matches = this.matches(arg1, entry);

			// Cleanup any listeners associated with the input when removing from history
			if (matches) {
				this.clearOnEditorDispose(arg1, this.editorHistoryListeners);
				removed = true;
			}

			return !matches;
		});

		return removed;
	}

	private replaceInHistory(editor: EditorInput | IResourceEditorInput, ...replacements: ReadonlyArray<EditorInput | IResourceEditorInput>): void {
		this.ensureHistoryLoaded(this.history);

		let replaced = false;

		const newHistory: Array<EditorInput | IResourceEditorInput> = [];
		for (const entry of this.history) {

			// Entry matches and is going to be disposed + replaced
			if (this.matches(editor, entry)) {

				// Cleanup any listeners associated with the input when replacing from history
				this.clearOnEditorDispose(editor, this.editorHistoryListeners);

				// Insert replacements but only once
				if (!replaced) {
					newHistory.push(...replacements);
					replaced = true;
				}
			}

			// Entry does not match, but only add it if it didn't match
			// our replacements already
			else if (!replacements.some(replacement => this.matches(replacement, entry))) {
				newHistory.push(entry);
			}
		}

		// If the target editor to replace was not found, make sure to
		// insert the replacements to the end to ensure we got them
		if (!replaced) {
			newHistory.push(...replacements);
		}

		this.history = newHistory;
	}

	clearRecentlyOpened(): void {
		this.history = [];

		this.editorHistoryListeners.forEach(listeners => dispose(listeners));
		this.editorHistoryListeners.clear();
	}

	getHistory(): readonly (EditorInput | IResourceEditorInput)[] {
		this.ensureHistoryLoaded(this.history);

		return this.history;
	}

	private ensureHistoryLoaded(history: Array<EditorInput | IResourceEditorInput> | undefined): asserts history {
		if (!this.history) {

			// Until history is loaded, it is just empty
			this.history = [];

			// We want to seed history from opened editors
			// too as well as previous stored state, so we
			// need to wait for the editor groups being ready
			if (this.editorGroupService.isReady) {
				this.loadHistory();
			} else {
				(async () => {
					await this.editorGroupService.whenReady;

					this.loadHistory();
				})();
			}
		}
	}

	private loadHistory(): void {

		// Init as empty before adding - since we are about to
		// populate the history from opened editors, we capture
		// the right order here.
		this.history = [];

		// All stored editors from previous session
		const storedEditorHistory = this.loadHistoryFromStorage();

		// All restored editors from previous session
		// in reverse editor from least to most recently
		// used.
		const openedEditorsLru = [...this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)].reverse();

		// We want to merge the opened editors from the last
		// session with the stored editors from the last
		// session. Because not all editors can be serialised
		// we want to make sure to include all opened editors
		// too.
		// Opened editors should always be first in the history

		const handledEditors = new Set<string /* resource + editorId */>();

		// Add all opened editors first
		for (const { editor } of openedEditorsLru) {
			if (!this.includeInHistory(editor)) {
				continue;
			}

			// Add into history
			this.addToHistory(editor);

			// Remember as added
			if (editor.resource) {
				handledEditors.add(`${editor.resource.toString()}/${editor.editorId}`);
			}
		}

		// Add remaining from storage if not there already
		// We check on resource and `editorId` (from `override`)
		// to figure out if the editor has been already added.
		for (const editor of storedEditorHistory) {
			if (!handledEditors.has(`${editor.resource.toString()}/${editor.options?.override}`)) {
				this.addToHistory(editor, false /* at the end */);
			}
		}
	}

	private loadHistoryFromStorage(): Array<IResourceEditorInput> {
		let entries: ISerializedEditorHistoryEntry[] = [];

		const entriesRaw = this.storageService.get(HistoryService.HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			try {
				entries = coalesce(parse(entriesRaw));
			} catch (error) {
				onUnexpectedError(error); // https://github.com/microsoft/vscode/issues/99075
			}
		}

		return coalesce(entries.map(entry => entry.editor));
	}

	private saveState(): void {
		if (!this.history) {
			return; // nothing to save because history was not used
		}

		const entries: ISerializedEditorHistoryEntry[] = [];
		for (const editor of this.history) {
			if (isEditorInput(editor) || !isResourceEditorInput(editor)) {
				continue; // only save resource editor inputs
			}

			entries.push({ editor });
		}

		this.storageService.store(HistoryService.HISTORY_STORAGE_KEY, stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	//#endregion

	//#region Last Active Workspace/File

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
		for (const input of this.getHistory()) {
			if (isEditorInput(input)) {
				continue;
			}

			if (schemeFilter && input.resource.scheme !== schemeFilter) {
				continue;
			}

			const resourceWorkspace = this.contextService.getWorkspaceFolder(input.resource);
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
		for (const input of this.getHistory()) {
			let resource: URI | undefined;
			if (isEditorInput(input)) {
				resource = EditorResourceAccessor.getOriginalUri(input, { filterByScheme });
			} else {
				resource = input.resource;
			}

			if (resource?.scheme === filterByScheme) {
				return resource;
			}
		}

		return undefined;
	}

	//#endregion

	//#region Editor Most Recently Used History

	private recentlyUsedEditorsStack: readonly IEditorIdentifier[] | undefined = undefined;
	private recentlyUsedEditorsStackIndex = 0;

	private recentlyUsedEditorsInGroupStack: readonly IEditorIdentifier[] | undefined = undefined;
	private recentlyUsedEditorsInGroupStackIndex = 0;

	private navigatingInRecentlyUsedEditorsStack = false;
	private navigatingInRecentlyUsedEditorsInGroupStack = false;

	openNextRecentlyUsedEditor(groupId?: GroupIdentifier): void {
		const [stack, index] = this.ensureRecentlyUsedStack(index => index - 1, groupId);

		this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
	}

	openPreviouslyUsedEditor(groupId?: GroupIdentifier): void {
		const [stack, index] = this.ensureRecentlyUsedStack(index => index + 1, groupId);

		this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
	}

	private doNavigateInRecentlyUsedEditorsStack(editorIdentifier: IEditorIdentifier | undefined, groupId?: GroupIdentifier): void {
		if (editorIdentifier) {
			const acrossGroups = typeof groupId !== 'number' || !this.editorGroupService.getGroup(groupId);

			if (acrossGroups) {
				this.navigatingInRecentlyUsedEditorsStack = true;
			} else {
				this.navigatingInRecentlyUsedEditorsInGroupStack = true;
			}

			const group = this.editorGroupService.getGroup(editorIdentifier.groupId) ?? this.editorGroupService.activeGroup;
			group.openEditor(editorIdentifier.editor).finally(() => {
				if (acrossGroups) {
					this.navigatingInRecentlyUsedEditorsStack = false;
				} else {
					this.navigatingInRecentlyUsedEditorsInGroupStack = false;
				}
			});
		}
	}

	private ensureRecentlyUsedStack(indexModifier: (index: number) => number, groupId?: GroupIdentifier): [readonly IEditorIdentifier[], number] {
		let editors: readonly IEditorIdentifier[];
		let index: number;

		const group = typeof groupId === 'number' ? this.editorGroupService.getGroup(groupId) : undefined;

		// Across groups
		if (!group) {
			editors = this.recentlyUsedEditorsStack || this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
			index = this.recentlyUsedEditorsStackIndex;
		}

		// Within group
		else {
			editors = this.recentlyUsedEditorsInGroupStack || group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map(editor => ({ groupId: group.id, editor }));
			index = this.recentlyUsedEditorsInGroupStackIndex;
		}

		// Adjust index
		let newIndex = indexModifier(index);
		if (newIndex < 0) {
			newIndex = 0;
		} else if (newIndex > editors.length - 1) {
			newIndex = editors.length - 1;
		}

		// Remember index and editors
		if (!group) {
			this.recentlyUsedEditorsStack = editors;
			this.recentlyUsedEditorsStackIndex = newIndex;
		} else {
			this.recentlyUsedEditorsInGroupStack = editors;
			this.recentlyUsedEditorsInGroupStackIndex = newIndex;
		}

		return [editors, newIndex];
	}

	private handleEditorEventInRecentEditorsStack(): void {

		// Drop all-editors stack unless navigating in all editors
		if (!this.navigatingInRecentlyUsedEditorsStack) {
			this.recentlyUsedEditorsStack = undefined;
			this.recentlyUsedEditorsStackIndex = 0;
		}

		// Drop in-group-editors stack unless navigating in group
		if (!this.navigatingInRecentlyUsedEditorsInGroupStack) {
			this.recentlyUsedEditorsInGroupStack = undefined;
			this.recentlyUsedEditorsInGroupStackIndex = 0;
		}
	}

	//#endregion
}

registerSingleton(IHistoryService, HistoryService);
