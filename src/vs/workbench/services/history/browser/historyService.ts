/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IResourceEditorInput, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorPane, IEditorCloseEvent, EditorResourceAccessor, IEditorIdentifier, GroupIdentifier, EditorsOrder, SideBySideEditor, IUntypedEditorInput, isResourceEditorInput, isEditorInput, isSideBySideEditorInput, EditorCloseContext, IEditorPaneSelection, EditorPaneSelectionCompareResult, EditorPaneSelectionChangeReason, isEditorPaneWithSelection, IEditorPaneSelectionChangeEvent, IEditorPaneWithSelection, IEditorWillMoveEvent } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { GoFilter, GoScope, IHistoryService } from 'vs/workbench/services/history/common/history';
import { FileChangesEvent, IFileService, FileChangeType, FILES_EXCLUDE_CONFIG, FileOperationEvent, FileOperation } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { dispose, Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { getExcludes, ISearchConfiguration, SEARCH_EXCLUDE_CONFIG } from 'vs/workbench/services/search/common/search';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { coalesce, remove } from 'vs/base/common/arrays';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { addDisposableListener, EventType, EventHelper, WindowIdleValue } from 'vs/base/browser/dom';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { mainWindow } from 'vs/base/browser/window';

interface ISerializedEditorHistoryEntry {
	readonly editor: Omit<IResourceEditorInput, 'resource'> & { resource: string };
}

interface IRecentlyClosedEditor {
	readonly editorId: string | undefined;
	readonly editor: IUntypedEditorInput;

	readonly resource: URI | undefined;
	readonly associatedResources: URI[];

	readonly index: number;
	readonly sticky: boolean;
}

export class HistoryService extends Disposable implements IHistoryService {

	declare readonly _serviceBrand: undefined;

	private static readonly MOUSE_NAVIGATION_SETTING = 'workbench.editor.mouseBackForwardToNavigate';
	private static readonly NAVIGATION_SCOPE_SETTING = 'workbench.editor.navigationScope';

	private readonly activeEditorListeners = this._register(new DisposableStore());
	private lastActiveEditor: IEditorIdentifier | undefined = undefined;

	private readonly editorHelper = this.instantiationService.createInstance(EditorHelper);

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
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.registerListeners();

		// if the service is created late enough that an editor is already opened
		// make sure to trigger the onActiveEditorChanged() to track the editor
		// properly (fixes https://github.com/microsoft/vscode/issues/59908)
		if (this.editorService.activeEditorPane) {
			this.onDidActiveEditorChange();
		}
	}

	private registerListeners(): void {

		// Mouse back/forward support
		this.registerMouseNavigationListener();

		// Editor changes
		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
		this._register(this.editorService.onDidOpenEditorFail(event => this.remove(event.editor)));
		this._register(this.editorService.onDidCloseEditor(event => this.onDidCloseEditor(event)));
		this._register(this.editorService.onDidMostRecentlyActiveEditorsChange(() => this.handleEditorEventInRecentEditorsStack()));

		// Editor group changes
		this._register(this.editorGroupService.onDidRemoveGroup(e => this.onDidRemoveGroup(e)));

		// File changes
		this._register(this.fileService.onDidFilesChange(event => this.onDidFilesChange(event)));
		this._register(this.fileService.onDidRunOperation(event => this.onDidFilesChange(event)));

		// Storage
		this._register(this.storageService.onWillSaveState(() => this.saveState()));

		// Configuration
		this.registerEditorNavigationScopeChangeListener();

		// Context keys
		this._register(this.onDidChangeEditorNavigationStack(() => this.updateContextKeys()));
		this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.updateContextKeys()));
	}

	private onDidCloseEditor(e: IEditorCloseEvent): void {
		this.handleEditorCloseEventInHistory(e);
		this.handleEditorCloseEventInReopen(e);
	}

	private registerMouseNavigationListener(): void {
		const mouseBackForwardSupportListener = this._register(new DisposableStore());
		const handleMouseBackForwardSupport = () => {
			mouseBackForwardSupportListener.clear();

			if (this.configurationService.getValue(HistoryService.MOUSE_NAVIGATION_SETTING)) {
				this._register(Event.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
					const eventDisposables = disposables.add(new DisposableStore());
					eventDisposables.add(addDisposableListener(container, EventType.MOUSE_DOWN, e => this.onMouseDownOrUp(e, true)));
					eventDisposables.add(addDisposableListener(container, EventType.MOUSE_UP, e => this.onMouseDownOrUp(e, false)));

					mouseBackForwardSupportListener.add(eventDisposables);
				}, { container: this.layoutService.mainContainer, disposables: this._store }));
			}
		};

		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(HistoryService.MOUSE_NAVIGATION_SETTING)) {
				handleMouseBackForwardSupport();
			}
		}));

		handleMouseBackForwardSupport();
	}

	private onMouseDownOrUp(event: MouseEvent, isMouseDown: boolean): void {

		// Support to navigate in history when mouse buttons 4/5 are pressed
		// We want to trigger this on mouse down for a faster experience
		// but we also need to prevent mouse up from triggering the default
		// which is to navigate in the browser history.

		switch (event.button) {
			case 3:
				EventHelper.stop(event);
				if (isMouseDown) {
					this.goBack();
				}
				break;
			case 4:
				EventHelper.stop(event);
				if (isMouseDown) {
					this.goForward();
				}

				break;
		}
	}

	private onDidRemoveGroup(group: IEditorGroup): void {
		this.handleEditorGroupRemoveInNavigationStacks(group);
	}

	private onDidActiveEditorChange(): void {
		const activeEditorGroup = this.editorGroupService.activeGroup;
		const activeEditorPane = activeEditorGroup.activeEditorPane;
		if (this.lastActiveEditor && this.editorHelper.matchesEditorIdentifier(this.lastActiveEditor, activeEditorPane)) {
			return; // return if the active editor is still the same
		}

		// Remember as last active editor (can be undefined if none opened)
		this.lastActiveEditor = activeEditorPane?.input ? { editor: activeEditorPane.input, groupId: activeEditorPane.group.id } : undefined;

		// Dispose old listeners
		this.activeEditorListeners.clear();

		// Handle editor change unless the editor is transient
		if (!activeEditorPane?.group.isTransient(activeEditorPane.input)) {
			this.handleActiveEditorChange(activeEditorGroup, activeEditorPane);
		} else {
			this.logService.trace(`[History]: ignoring transient editor change (editor: ${activeEditorPane.input?.resource?.toString()}})`);
		}

		// Listen to selection changes unless the editor is transient
		if (isEditorPaneWithSelection(activeEditorPane)) {
			this.activeEditorListeners.add(activeEditorPane.onDidChangeSelection(e => {
				if (!activeEditorPane.group.isTransient(activeEditorPane.input)) {
					this.handleActiveEditorSelectionChangeEvent(activeEditorGroup, activeEditorPane, e);
				} else {
					this.logService.trace(`[History]: ignoring transient editor selection change (editor: ${activeEditorPane.input?.resource?.toString()}})`);
				}
			}));
		}

		// Context keys
		this.updateContextKeys();
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

	private handleActiveEditorChange(group: IEditorGroup, editorPane?: IEditorPane): void {
		this.handleActiveEditorChangeInHistory(editorPane);
		this.handleActiveEditorChangeInNavigationStacks(group, editorPane);
	}

	private handleActiveEditorSelectionChangeEvent(group: IEditorGroup, editorPane: IEditorPaneWithSelection, event: IEditorPaneSelectionChangeEvent): void {
		this.handleActiveEditorSelectionChangeInNavigationStacks(group, editorPane, event);
	}

	private move(event: FileOperationEvent): void {
		this.moveInHistory(event);
		this.moveInEditorNavigationStacks(event);
	}

	private remove(editor: EditorInput): void;
	private remove(event: FileChangesEvent): void;
	private remove(event: FileOperationEvent): void;
	private remove(arg1: EditorInput | FileChangesEvent | FileOperationEvent): void {
		this.removeFromHistory(arg1);
		this.removeFromEditorNavigationStacks(arg1);
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
		this.clearEditorNavigationStacks();

		// Recently closed editors
		this.recentlyClosedEditors = [];

		// Context Keys
		this.updateContextKeys();
	}

	//#region History Context Keys

	private readonly canNavigateBackContextKey = (new RawContextKey<boolean>('canNavigateBack', false, localize('canNavigateBack', "Whether it is possible to navigate back in editor history"))).bindTo(this.contextKeyService);
	private readonly canNavigateForwardContextKey = (new RawContextKey<boolean>('canNavigateForward', false, localize('canNavigateForward', "Whether it is possible to navigate forward in editor history"))).bindTo(this.contextKeyService);

	private readonly canNavigateBackInNavigationsContextKey = (new RawContextKey<boolean>('canNavigateBackInNavigationLocations', false, localize('canNavigateBackInNavigationLocations', "Whether it is possible to navigate back in editor navigation locations history"))).bindTo(this.contextKeyService);
	private readonly canNavigateForwardInNavigationsContextKey = (new RawContextKey<boolean>('canNavigateForwardInNavigationLocations', false, localize('canNavigateForwardInNavigationLocations', "Whether it is possible to navigate forward in editor navigation locations history"))).bindTo(this.contextKeyService);
	private readonly canNavigateToLastNavigationLocationContextKey = (new RawContextKey<boolean>('canNavigateToLastNavigationLocation', false, localize('canNavigateToLastNavigationLocation', "Whether it is possible to navigate to the last editor navigation location"))).bindTo(this.contextKeyService);

	private readonly canNavigateBackInEditsContextKey = (new RawContextKey<boolean>('canNavigateBackInEditLocations', false, localize('canNavigateBackInEditLocations', "Whether it is possible to navigate back in editor edit locations history"))).bindTo(this.contextKeyService);
	private readonly canNavigateForwardInEditsContextKey = (new RawContextKey<boolean>('canNavigateForwardInEditLocations', false, localize('canNavigateForwardInEditLocations', "Whether it is possible to navigate forward in editor edit locations history"))).bindTo(this.contextKeyService);
	private readonly canNavigateToLastEditLocationContextKey = (new RawContextKey<boolean>('canNavigateToLastEditLocation', false, localize('canNavigateToLastEditLocation', "Whether it is possible to navigate to the last editor edit location"))).bindTo(this.contextKeyService);

	private readonly canReopenClosedEditorContextKey = (new RawContextKey<boolean>('canReopenClosedEditor', false, localize('canReopenClosedEditor', "Whether it is possible to reopen the last closed editor"))).bindTo(this.contextKeyService);

	updateContextKeys(): void {
		this.contextKeyService.bufferChangeEvents(() => {
			const activeStack = this.getStack();

			this.canNavigateBackContextKey.set(activeStack.canGoBack(GoFilter.NONE));
			this.canNavigateForwardContextKey.set(activeStack.canGoForward(GoFilter.NONE));

			this.canNavigateBackInNavigationsContextKey.set(activeStack.canGoBack(GoFilter.NAVIGATION));
			this.canNavigateForwardInNavigationsContextKey.set(activeStack.canGoForward(GoFilter.NAVIGATION));
			this.canNavigateToLastNavigationLocationContextKey.set(activeStack.canGoLast(GoFilter.NAVIGATION));

			this.canNavigateBackInEditsContextKey.set(activeStack.canGoBack(GoFilter.EDITS));
			this.canNavigateForwardInEditsContextKey.set(activeStack.canGoForward(GoFilter.EDITS));
			this.canNavigateToLastEditLocationContextKey.set(activeStack.canGoLast(GoFilter.EDITS));

			this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
		});
	}

	//#endregion

	//#region Editor History Navigation (limit: 50)

	private readonly _onDidChangeEditorNavigationStack = this._register(new Emitter<void>());
	readonly onDidChangeEditorNavigationStack = this._onDidChangeEditorNavigationStack.event;

	private defaultScopedEditorNavigationStack: IEditorNavigationStacks | undefined = undefined;
	private readonly editorGroupScopedNavigationStacks = new Map<GroupIdentifier, { stack: IEditorNavigationStacks; disposable: IDisposable }>();
	private readonly editorScopedNavigationStacks = new Map<GroupIdentifier, Map<EditorInput, { stack: IEditorNavigationStacks; disposable: IDisposable }>>();

	private editorNavigationScope = GoScope.DEFAULT;

	private registerEditorNavigationScopeChangeListener(): void {
		const handleEditorNavigationScopeChange = () => {

			// Ensure to start fresh when setting changes
			this.disposeEditorNavigationStacks();

			// Update scope
			const configuredScope = this.configurationService.getValue(HistoryService.NAVIGATION_SCOPE_SETTING);
			if (configuredScope === 'editorGroup') {
				this.editorNavigationScope = GoScope.EDITOR_GROUP;
			} else if (configuredScope === 'editor') {
				this.editorNavigationScope = GoScope.EDITOR;
			} else {
				this.editorNavigationScope = GoScope.DEFAULT;
			}
		};

		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(HistoryService.NAVIGATION_SCOPE_SETTING)) {
				handleEditorNavigationScopeChange();
			}
		}));

		handleEditorNavigationScopeChange();
	}

	private getStack(group = this.editorGroupService.activeGroup, editor = group.activeEditor): IEditorNavigationStacks {
		switch (this.editorNavigationScope) {

			// Per Editor
			case GoScope.EDITOR: {
				if (!editor) {
					return new NoOpEditorNavigationStacks();
				}

				let stacksForGroup = this.editorScopedNavigationStacks.get(group.id);
				if (!stacksForGroup) {
					stacksForGroup = new Map<EditorInput, { stack: IEditorNavigationStacks; disposable: IDisposable }>();
					this.editorScopedNavigationStacks.set(group.id, stacksForGroup);
				}

				let stack = stacksForGroup.get(editor)?.stack;
				if (!stack) {
					const disposable = new DisposableStore();

					stack = disposable.add(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.EDITOR));
					disposable.add(stack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));

					stacksForGroup.set(editor, { stack, disposable });
				}

				return stack;
			}

			// Per Editor Group
			case GoScope.EDITOR_GROUP: {
				let stack = this.editorGroupScopedNavigationStacks.get(group.id)?.stack;
				if (!stack) {
					const disposable = new DisposableStore();

					stack = disposable.add(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.EDITOR_GROUP));
					disposable.add(stack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));

					this.editorGroupScopedNavigationStacks.set(group.id, { stack, disposable });
				}

				return stack;
			}

			// Global
			case GoScope.DEFAULT: {
				if (!this.defaultScopedEditorNavigationStack) {
					this.defaultScopedEditorNavigationStack = this._register(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.DEFAULT));

					this._register(this.defaultScopedEditorNavigationStack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
				}

				return this.defaultScopedEditorNavigationStack;
			}
		}
	}

	goForward(filter?: GoFilter): Promise<void> {
		return this.getStack().goForward(filter);
	}

	goBack(filter?: GoFilter): Promise<void> {
		return this.getStack().goBack(filter);
	}

	goPrevious(filter?: GoFilter): Promise<void> {
		return this.getStack().goPrevious(filter);
	}

	goLast(filter?: GoFilter): Promise<void> {
		return this.getStack().goLast(filter);
	}

	private handleActiveEditorChangeInNavigationStacks(group: IEditorGroup, editorPane?: IEditorPane): void {
		this.getStack(group, editorPane?.input).handleActiveEditorChange(editorPane);
	}

	private handleActiveEditorSelectionChangeInNavigationStacks(group: IEditorGroup, editorPane: IEditorPaneWithSelection, event: IEditorPaneSelectionChangeEvent): void {
		this.getStack(group, editorPane.input).handleActiveEditorSelectionChange(editorPane, event);
	}

	private handleEditorCloseEventInHistory(e: IEditorCloseEvent): void {
		const editors = this.editorScopedNavigationStacks.get(e.groupId);
		if (editors) {
			const editorStack = editors.get(e.editor);
			if (editorStack) {
				editorStack.disposable.dispose();
				editors.delete(e.editor);
			}

			if (editors.size === 0) {
				this.editorScopedNavigationStacks.delete(e.groupId);
			}
		}
	}

	private handleEditorGroupRemoveInNavigationStacks(group: IEditorGroup): void {

		// Global
		this.defaultScopedEditorNavigationStack?.remove(group.id);

		// Editor groups
		const editorGroupStack = this.editorGroupScopedNavigationStacks.get(group.id);
		if (editorGroupStack) {
			editorGroupStack.disposable.dispose();
			this.editorGroupScopedNavigationStacks.delete(group.id);
		}
	}

	private clearEditorNavigationStacks(): void {
		this.withEachEditorNavigationStack(stack => stack.clear());
	}

	private removeFromEditorNavigationStacks(arg1: EditorInput | FileChangesEvent | FileOperationEvent): void {
		this.withEachEditorNavigationStack(stack => stack.remove(arg1));
	}

	private moveInEditorNavigationStacks(event: FileOperationEvent): void {
		this.withEachEditorNavigationStack(stack => stack.move(event));
	}

	private withEachEditorNavigationStack(fn: (stack: IEditorNavigationStacks) => void): void {

		// Global
		if (this.defaultScopedEditorNavigationStack) {
			fn(this.defaultScopedEditorNavigationStack);
		}

		// Per editor group
		for (const [, entry] of this.editorGroupScopedNavigationStacks) {
			fn(entry.stack);
		}

		// Per editor
		for (const [, entries] of this.editorScopedNavigationStacks) {
			for (const [, entry] of entries) {
				fn(entry.stack);
			}
		}
	}

	private disposeEditorNavigationStacks(): void {

		// Global
		this.defaultScopedEditorNavigationStack?.dispose();
		this.defaultScopedEditorNavigationStack = undefined;

		// Per Editor group
		for (const [, stack] of this.editorGroupScopedNavigationStacks) {
			stack.disposable.dispose();
		}
		this.editorGroupScopedNavigationStacks.clear();

		// Per Editor
		for (const [, stacks] of this.editorScopedNavigationStacks) {
			for (const [, stack] of stacks) {
				stack.disposable.dispose();
			}
		}
		this.editorScopedNavigationStacks.clear();
	}

	//#endregion

	//#region Navigation: Next/Previous Used Editor

	private recentlyUsedEditorsStack: readonly IEditorIdentifier[] | undefined = undefined;
	private recentlyUsedEditorsStackIndex = 0;

	private recentlyUsedEditorsInGroupStack: readonly IEditorIdentifier[] | undefined = undefined;
	private recentlyUsedEditorsInGroupStackIndex = 0;

	private navigatingInRecentlyUsedEditorsStack = false;
	private navigatingInRecentlyUsedEditorsInGroupStack = false;

	openNextRecentlyUsedEditor(groupId?: GroupIdentifier): Promise<void> {
		const [stack, index] = this.ensureRecentlyUsedStack(index => index - 1, groupId);

		return this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
	}

	openPreviouslyUsedEditor(groupId?: GroupIdentifier): Promise<void> {
		const [stack, index] = this.ensureRecentlyUsedStack(index => index + 1, groupId);

		return this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
	}

	private async doNavigateInRecentlyUsedEditorsStack(editorIdentifier: IEditorIdentifier | undefined, groupId?: GroupIdentifier): Promise<void> {
		if (editorIdentifier) {
			const acrossGroups = typeof groupId !== 'number' || !this.editorGroupService.getGroup(groupId);

			if (acrossGroups) {
				this.navigatingInRecentlyUsedEditorsStack = true;
			} else {
				this.navigatingInRecentlyUsedEditorsInGroupStack = true;
			}

			const group = this.editorGroupService.getGroup(editorIdentifier.groupId) ?? this.editorGroupService.activeGroup;
			try {
				await group.openEditor(editorIdentifier.editor);
			} finally {
				if (acrossGroups) {
					this.navigatingInRecentlyUsedEditorsStack = false;
				} else {
					this.navigatingInRecentlyUsedEditorsInGroupStack = false;
				}
			}
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

	//#region File: Reopen Closed Editor (limit: 20)

	private static readonly MAX_RECENTLY_CLOSED_EDITORS = 20;

	private recentlyClosedEditors: IRecentlyClosedEditor[] = [];
	private ignoreEditorCloseEvent = false;

	private handleEditorCloseEventInReopen(event: IEditorCloseEvent): void {
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

	async reopenLastClosedEditor(): Promise<void> {

		// Open editor if we have one
		const lastClosedEditor = this.recentlyClosedEditors.pop();
		let reopenClosedEditorPromise: Promise<void> | undefined = undefined;
		if (lastClosedEditor) {
			reopenClosedEditorPromise = this.doReopenLastClosedEditor(lastClosedEditor);
		}

		// Update context
		this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);

		return reopenClosedEditorPromise;
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

			if (recentlyClosedEditor.resource && this.editorHelper.matchesFile(recentlyClosedEditor.resource, arg1)) {
				return false; // remove: editor matches directly
			}

			if (recentlyClosedEditor.associatedResources.some(associatedResource => this.editorHelper.matchesFile(associatedResource, arg1))) {
				return false; // remove: an associated resource matches
			}

			return true; // keep
		});

		// Update context
		this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
	}

	//#endregion

	//#region Go to: Recently Opened Editor (limit: 200, persisted)

	private static readonly MAX_HISTORY_ITEMS = 200;
	private static readonly HISTORY_STORAGE_KEY = 'history.entries';

	private history: Array<EditorInput | IResourceEditorInput> | undefined = undefined;

	private readonly editorHistoryListeners = new Map<EditorInput, DisposableStore>();

	private readonly resourceExcludeMatcher = this._register(new WindowIdleValue(mainWindow, () => {
		const matcher = this._register(this.instantiationService.createInstance(
			ResourceGlobMatcher,
			root => getExcludes(root ? this.configurationService.getValue<ISearchConfiguration>({ resource: root }) : this.configurationService.getValue<ISearchConfiguration>()) || Object.create(null),
			event => event.affectsConfiguration(FILES_EXCLUDE_CONFIG) || event.affectsConfiguration(SEARCH_EXCLUDE_CONFIG)
		));

		this._register(matcher.onExpressionChange(() => this.removeExcludedFromHistory()));

		return matcher;
	}));

	private handleActiveEditorChangeInHistory(editorPane?: IEditorPane): void {

		// Ensure we have not configured to exclude input and don't track invalid inputs
		const editor = editorPane?.input;
		if (!editor || editor.isDisposed() || !this.includeInHistory(editor)) {
			return;
		}

		// Remove any existing entry and add to the beginning
		this.removeFromHistory(editor);
		this.addToHistory(editor);
	}

	private addToHistory(editor: EditorInput | IResourceEditorInput, insertFirst = true): void {
		this.ensureHistoryLoaded(this.history);

		const historyInput = this.editorHelper.preferResourceEditorInput(editor);
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
			this.editorHelper.clearOnEditorDispose(this.history.pop()!, this.editorHistoryListeners);
		}

		// React to editor input disposing
		if (isEditorInput(editor)) {
			this.editorHelper.onEditorDispose(editor, () => this.updateHistoryOnEditorDispose(historyInput), this.editorHistoryListeners);
		}
	}

	private updateHistoryOnEditorDispose(editor: EditorInput | IResourceEditorInput): void {
		if (isEditorInput(editor)) {

			// Any non side-by-side editor input gets removed directly on dispose
			if (!isSideBySideEditorInput(editor)) {
				this.removeFromHistory(editor);
			}

			// Side-by-side editors get special treatment: we try to distill the
			// possibly untyped resource inputs from both sides to be able to
			// offer these entries from the history to the user still.
			else {
				const resourceInputs: IResourceEditorInput[] = [];
				const sideInputs = editor.primary.matches(editor.secondary) ? [editor.primary] : [editor.primary, editor.secondary];
				for (const sideInput of sideInputs) {
					const candidateResourceInput = this.editorHelper.preferResourceEditorInput(sideInput);
					if (isResourceEditorInput(candidateResourceInput)) {
						resourceInputs.push(candidateResourceInput);
					}
				}

				// Insert the untyped resource inputs where our disposed
				// side-by-side editor input is in the history stack
				this.replaceInHistory(editor, ...resourceInputs);
			}
		} else {

			// Remove any editor that should not be included in history
			if (!this.includeInHistory(editor)) {
				this.removeFromHistory(editor);
			}
		}
	}

	private includeInHistory(editor: EditorInput | IResourceEditorInput): boolean {
		if (isEditorInput(editor)) {
			return true; // include any non files
		}

		return !this.resourceExcludeMatcher.value.matches(editor.resource);
	}

	private removeExcludedFromHistory(): void {
		this.ensureHistoryLoaded(this.history);

		this.history = this.history.filter(entry => {
			const include = this.includeInHistory(entry);

			// Cleanup any listeners associated with the input when removing from history
			if (!include) {
				this.editorHelper.clearOnEditorDispose(entry, this.editorHistoryListeners);
			}

			return include;
		});
	}

	private moveInHistory(event: FileOperationEvent): void {
		if (event.isOperation(FileOperation.MOVE)) {
			const removed = this.removeFromHistory(event);
			if (removed) {
				this.addToHistory({ resource: event.target.resource });
			}
		}
	}

	removeFromHistory(arg1: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent): boolean {
		let removed = false;

		this.ensureHistoryLoaded(this.history);

		this.history = this.history.filter(entry => {
			const matches = this.editorHelper.matchesEditor(arg1, entry);

			// Cleanup any listeners associated with the input when removing from history
			if (matches) {
				this.editorHelper.clearOnEditorDispose(arg1, this.editorHistoryListeners);
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
			if (this.editorHelper.matchesEditor(editor, entry)) {

				// Cleanup any listeners associated with the input when replacing from history
				this.editorHelper.clearOnEditorDispose(editor, this.editorHistoryListeners);

				// Insert replacements but only once
				if (!replaced) {
					newHistory.push(...replacements);
					replaced = true;
				}
			}

			// Entry does not match, but only add it if it didn't match
			// our replacements already
			else if (!replacements.some(replacement => this.editorHelper.matchesEditor(replacement, entry))) {
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

		for (const [, disposable] of this.editorHistoryListeners) {
			dispose(disposable);
		}
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
			if (
				!handledEditors.has(`${editor.resource.toString()}/${editor.options?.override}`) &&
				this.includeInHistory(editor)
			) {
				this.addToHistory(editor, false /* at the end */);
			}
		}
	}

	private loadHistoryFromStorage(): Array<IResourceEditorInput> {
		const entries: IResourceEditorInput[] = [];

		const entriesRaw = this.storageService.get(HistoryService.HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
		if (entriesRaw) {
			try {
				const entriesParsed: ISerializedEditorHistoryEntry[] = JSON.parse(entriesRaw);
				for (const entryParsed of entriesParsed) {
					if (!entryParsed.editor || !entryParsed.editor.resource) {
						continue; // unexpected data format
					}

					try {
						entries.push({
							...entryParsed.editor,
							resource: typeof entryParsed.editor.resource === 'string' ?
								URI.parse(entryParsed.editor.resource) :  	//  from 1.67.x: URI is stored efficiently as URI.toString()
								URI.from(entryParsed.editor.resource)		// until 1.66.x: URI was stored very verbose as URI.toJSON()
						});
					} catch (error) {
						onUnexpectedError(error); // do not fail entire history when one entry fails
					}
				}
			} catch (error) {
				onUnexpectedError(error); // https://github.com/microsoft/vscode/issues/99075
			}
		}

		return entries;
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

			entries.push({
				editor: {
					...editor,
					resource: editor.resource.toString()
				}
			});
		}

		this.storageService.store(HistoryService.HISTORY_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	//#endregion

	//#region Last Active Workspace/File

	getLastActiveWorkspaceRoot(schemeFilter?: string, authorityFilter?: string): URI | undefined {

		// No Folder: return early
		const folders = this.contextService.getWorkspace().folders;
		if (folders.length === 0) {
			return undefined;
		}

		// Single Folder: return early
		if (folders.length === 1) {
			const resource = folders[0].uri;
			if ((!schemeFilter || resource.scheme === schemeFilter) && (!authorityFilter || resource.authority === authorityFilter)) {
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

			if (authorityFilter && input.resource.authority !== authorityFilter) {
				continue;
			}

			const resourceWorkspace = this.contextService.getWorkspaceFolder(input.resource);
			if (resourceWorkspace) {
				return resourceWorkspace.uri;
			}
		}

		// Fallback to first workspace matching scheme filter if any
		for (const folder of folders) {
			const resource = folder.uri;
			if ((!schemeFilter || resource.scheme === schemeFilter) && (!authorityFilter || resource.authority === authorityFilter)) {
				return resource;
			}
		}

		return undefined;
	}

	getLastActiveFile(filterByScheme: string, filterByAuthority?: string): URI | undefined {
		for (const input of this.getHistory()) {
			let resource: URI | undefined;
			if (isEditorInput(input)) {
				resource = EditorResourceAccessor.getOriginalUri(input, { filterByScheme });
			} else {
				resource = input.resource;
			}

			if (resource && resource.scheme === filterByScheme && (!filterByAuthority || resource.authority === filterByAuthority)) {
				return resource;
			}
		}

		return undefined;
	}

	//#endregion

	override dispose(): void {
		super.dispose();

		for (const [, stack] of this.editorGroupScopedNavigationStacks) {
			stack.disposable.dispose();
		}

		for (const [, editors] of this.editorScopedNavigationStacks) {
			for (const [, stack] of editors) {
				stack.disposable.dispose();
			}
		}

		for (const [, listener] of this.editorHistoryListeners) {
			listener.dispose();
		}
	}
}

registerSingleton(IHistoryService, HistoryService, InstantiationType.Eager);

class EditorSelectionState {

	constructor(
		private readonly editorIdentifier: IEditorIdentifier,
		readonly selection: IEditorPaneSelection | undefined,
		private readonly reason: EditorPaneSelectionChangeReason | undefined
	) { }

	justifiesNewNavigationEntry(other: EditorSelectionState): boolean {
		if (this.editorIdentifier.groupId !== other.editorIdentifier.groupId) {
			return true; // different group
		}

		if (!this.editorIdentifier.editor.matches(other.editorIdentifier.editor)) {
			return true; // different editor
		}

		if (!this.selection || !other.selection) {
			return true; // unknown selections
		}

		const result = this.selection.compare(other.selection);

		if (result === EditorPaneSelectionCompareResult.SIMILAR && (other.reason === EditorPaneSelectionChangeReason.NAVIGATION || other.reason === EditorPaneSelectionChangeReason.JUMP)) {
			// let navigation sources win even if the selection is `SIMILAR`
			// (e.g. "Go to definition" should add a history entry)
			return true;
		}

		return result === EditorPaneSelectionCompareResult.DIFFERENT;
	}
}

interface IEditorNavigationStacks extends IDisposable {
	readonly onDidChange: Event<void>;

	canGoForward(filter?: GoFilter): boolean;
	goForward(filter?: GoFilter): Promise<void>;
	canGoBack(filter?: GoFilter): boolean;
	goBack(filter?: GoFilter): Promise<void>;
	goPrevious(filter?: GoFilter): Promise<void>;
	canGoLast(filter?: GoFilter): boolean;
	goLast(filter?: GoFilter): Promise<void>;

	handleActiveEditorChange(editorPane?: IEditorPane): void;
	handleActiveEditorSelectionChange(editorPane: IEditorPaneWithSelection, event: IEditorPaneSelectionChangeEvent): void;

	clear(): void;
	remove(arg1: EditorInput | FileChangesEvent | FileOperationEvent | GroupIdentifier): void;
	move(event: FileOperationEvent): void;
}

class EditorNavigationStacks extends Disposable implements IEditorNavigationStacks {

	private readonly selectionsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.NONE, this.scope));
	private readonly editsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.EDITS, this.scope));
	private readonly navigationsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.NAVIGATION, this.scope));

	private readonly stacks: EditorNavigationStack[] = [
		this.selectionsStack,
		this.editsStack,
		this.navigationsStack
	];

	readonly onDidChange = Event.any(
		this.selectionsStack.onDidChange,
		this.editsStack.onDidChange,
		this.navigationsStack.onDidChange
	);

	constructor(
		private readonly scope: GoScope,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	canGoForward(filter?: GoFilter): boolean {
		return this.getStack(filter).canGoForward();
	}

	goForward(filter?: GoFilter): Promise<void> {
		return this.getStack(filter).goForward();
	}

	canGoBack(filter?: GoFilter): boolean {
		return this.getStack(filter).canGoBack();
	}

	goBack(filter?: GoFilter): Promise<void> {
		return this.getStack(filter).goBack();
	}

	goPrevious(filter?: GoFilter): Promise<void> {
		return this.getStack(filter).goPrevious();
	}

	canGoLast(filter?: GoFilter): boolean {
		return this.getStack(filter).canGoLast();
	}

	goLast(filter?: GoFilter): Promise<void> {
		return this.getStack(filter).goLast();
	}

	private getStack(filter = GoFilter.NONE): EditorNavigationStack {
		switch (filter) {
			case GoFilter.NONE: return this.selectionsStack;
			case GoFilter.EDITS: return this.editsStack;
			case GoFilter.NAVIGATION: return this.navigationsStack;
		}
	}

	handleActiveEditorChange(editorPane?: IEditorPane): void {

		// Always send to selections navigation stack
		this.selectionsStack.notifyNavigation(editorPane);
	}

	handleActiveEditorSelectionChange(editorPane: IEditorPaneWithSelection, event: IEditorPaneSelectionChangeEvent): void {
		const previous = this.selectionsStack.current;

		// Always send to selections navigation stack
		this.selectionsStack.notifyNavigation(editorPane, event);

		// Check for edits
		if (event.reason === EditorPaneSelectionChangeReason.EDIT) {
			this.editsStack.notifyNavigation(editorPane, event);
		}

		// Check for navigations
		//
		// Note: ignore if selections navigation stack is navigating because
		// in that case we do not want to receive repeated entries in
		// the navigation stack.
		else if (
			(event.reason === EditorPaneSelectionChangeReason.NAVIGATION || event.reason === EditorPaneSelectionChangeReason.JUMP) &&
			!this.selectionsStack.isNavigating()
		) {

			// A "JUMP" navigation selection change always has a source and
			// target. As such, we add the previous entry of the selections
			// navigation stack so that our navigation stack receives both
			// entries unless the user is currently navigating.

			if (event.reason === EditorPaneSelectionChangeReason.JUMP && !this.navigationsStack.isNavigating()) {
				if (previous) {
					this.navigationsStack.addOrReplace(previous.groupId, previous.editor, previous.selection);
				}
			}

			this.navigationsStack.notifyNavigation(editorPane, event);
		}
	}

	clear(): void {
		for (const stack of this.stacks) {
			stack.clear();
		}
	}

	remove(arg1: EditorInput | FileChangesEvent | FileOperationEvent | GroupIdentifier): void {
		for (const stack of this.stacks) {
			stack.remove(arg1);
		}
	}

	move(event: FileOperationEvent): void {
		for (const stack of this.stacks) {
			stack.move(event);
		}
	}
}

class NoOpEditorNavigationStacks implements IEditorNavigationStacks {
	onDidChange = Event.None;

	canGoForward(): boolean { return false; }
	async goForward(): Promise<void> { }
	canGoBack(): boolean { return false; }
	async goBack(): Promise<void> { }
	async goPrevious(): Promise<void> { }
	canGoLast(): boolean { return false; }
	async goLast(): Promise<void> { }

	handleActiveEditorChange(): void { }
	handleActiveEditorSelectionChange(): void { }

	clear(): void { }
	remove(): void { }
	move(): void { }

	dispose(): void { }
}

interface IEditorNavigationStackEntry {
	groupId: GroupIdentifier;
	editor: EditorInput | IResourceEditorInput;
	selection?: IEditorPaneSelection;
}

export class EditorNavigationStack extends Disposable {

	private static readonly MAX_STACK_SIZE = 50;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly mapEditorToDisposable = new Map<EditorInput, DisposableStore>();
	private readonly mapGroupToDisposable = new Map<GroupIdentifier, IDisposable>();

	private readonly editorHelper = this.instantiationService.createInstance(EditorHelper);

	private stack: IEditorNavigationStackEntry[] = [];

	private index = -1;
	private previousIndex = -1;

	private navigating: boolean = false;

	private currentSelectionState: EditorSelectionState | undefined = undefined;

	get current(): IEditorNavigationStackEntry | undefined {
		return this.stack[this.index];
	}

	private set current(entry: IEditorNavigationStackEntry | undefined) {
		if (entry) {
			this.stack[this.index] = entry;
		}
	}

	constructor(
		private readonly filter: GoFilter,
		private readonly scope: GoScope,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidChange(() => this.traceStack()));
		this._register(this.logService.onDidChangeLogLevel(() => this.traceStack()));
	}

	private traceStack(): void {
		if (this.logService.getLevel() !== LogLevel.Trace) {
			return;
		}

		const entryLabels: string[] = [];
		for (const entry of this.stack) {
			if (typeof entry.selection?.log === 'function') {
				entryLabels.push(`- group: ${entry.groupId}, editor: ${entry.editor.resource?.toString()}, selection: ${entry.selection.log()}`);
			} else {
				entryLabels.push(`- group: ${entry.groupId}, editor: ${entry.editor.resource?.toString()}, selection: <none>`);
			}
		}

		if (entryLabels.length === 0) {
			this.trace(`index: ${this.index}, navigating: ${this.isNavigating()}: <empty>`);
		} else {
			this.trace(`index: ${this.index}, navigating: ${this.isNavigating()}
${entryLabels.join('\n')}
			`);
		}
	}

	private trace(msg: string, editor: EditorInput | IResourceEditorInput | undefined | null = null, event?: IEditorPaneSelectionChangeEvent): void {
		if (this.logService.getLevel() !== LogLevel.Trace) {
			return;
		}

		let filterLabel: string;
		switch (this.filter) {
			case GoFilter.NONE: filterLabel = 'global';
				break;
			case GoFilter.EDITS: filterLabel = 'edits';
				break;
			case GoFilter.NAVIGATION: filterLabel = 'navigation';
				break;
		}

		let scopeLabel: string;
		switch (this.scope) {
			case GoScope.DEFAULT: scopeLabel = 'default';
				break;
			case GoScope.EDITOR_GROUP: scopeLabel = 'editorGroup';
				break;
			case GoScope.EDITOR: scopeLabel = 'editor';
				break;
		}

		if (editor !== null) {
			this.logService.trace(`[History stack ${filterLabel}-${scopeLabel}]: ${msg} (editor: ${editor?.resource?.toString()}, event: ${this.traceEvent(event)})`);
		} else {
			this.logService.trace(`[History stack ${filterLabel}-${scopeLabel}]: ${msg}`);
		}
	}

	private traceEvent(event?: IEditorPaneSelectionChangeEvent): string {
		if (!event) {
			return '<none>';
		}

		switch (event.reason) {
			case EditorPaneSelectionChangeReason.EDIT: return 'edit';
			case EditorPaneSelectionChangeReason.NAVIGATION: return 'navigation';
			case EditorPaneSelectionChangeReason.JUMP: return 'jump';
			case EditorPaneSelectionChangeReason.PROGRAMMATIC: return 'programmatic';
			case EditorPaneSelectionChangeReason.USER: return 'user';
		}
	}

	private registerGroupListeners(groupId: GroupIdentifier): void {
		if (!this.mapGroupToDisposable.has(groupId)) {
			const group = this.editorGroupService.getGroup(groupId);
			if (group) {
				this.mapGroupToDisposable.set(groupId, group.onWillMoveEditor(e => this.onWillMoveEditor(e)));
			}
		}
	}

	private onWillMoveEditor(e: IEditorWillMoveEvent): void {
		this.trace('onWillMoveEditor()', e.editor);

		if (this.scope === GoScope.EDITOR_GROUP) {
			return; // ignore move events if our scope is group based
		}

		for (const entry of this.stack) {
			if (entry.groupId !== e.groupId) {
				continue; // not in the group that reported the event
			}

			if (!this.editorHelper.matchesEditor(e.editor, entry.editor)) {
				continue; // not the editor this event is about
			}

			// Update to target group
			entry.groupId = e.target;
		}
	}

	//#region Stack Mutation

	notifyNavigation(editorPane: IEditorPane | undefined, event?: IEditorPaneSelectionChangeEvent): void {
		this.trace('notifyNavigation()', editorPane?.input, event);

		const isSelectionAwareEditorPane = isEditorPaneWithSelection(editorPane);
		const hasValidEditor = editorPane?.input && !editorPane.input.isDisposed();

		// Treat editor changes that happen as part of stack navigation specially
		// we do not want to add a new stack entry as a matter of navigating the
		// stack but we need to keep our currentEditorSelectionState up to date
		// with the navigtion that occurs.
		if (this.navigating) {
			this.trace(`notifyNavigation() ignoring (navigating)`, editorPane?.input, event);

			if (isSelectionAwareEditorPane && hasValidEditor) {
				this.trace('notifyNavigation() updating current selection state', editorPane?.input, event);

				this.currentSelectionState = new EditorSelectionState({ groupId: editorPane.group.id, editor: editorPane.input }, editorPane.getSelection(), event?.reason);
			} else {
				this.trace('notifyNavigation() dropping current selection state', editorPane?.input, event);

				this.currentSelectionState = undefined; // we navigated to a non-selection aware or disposed editor
			}
		}

		// Normal navigation not part of stack navigation
		else {
			this.trace(`notifyNavigation() not ignoring`, editorPane?.input, event);

			// Navigation inside selection aware editor
			if (isSelectionAwareEditorPane && hasValidEditor) {
				this.onSelectionAwareEditorNavigation(editorPane.group.id, editorPane.input, editorPane.getSelection(), event);
			}

			// Navigation to non-selection aware or disposed editor
			else {
				this.currentSelectionState = undefined; // at this time we have no active selection aware editor

				if (hasValidEditor) {
					this.onNonSelectionAwareEditorNavigation(editorPane.group.id, editorPane.input);
				}
			}
		}
	}

	private onSelectionAwareEditorNavigation(groupId: GroupIdentifier, editor: EditorInput, selection: IEditorPaneSelection | undefined, event?: IEditorPaneSelectionChangeEvent): void {
		if (this.current?.groupId === groupId && !selection && this.editorHelper.matchesEditor(this.current.editor, editor)) {
			return; // do not push same editor input again of same group if we have no valid selection
		}

		this.trace('onSelectionAwareEditorNavigation()', editor, event);

		const stateCandidate = new EditorSelectionState({ groupId, editor }, selection, event?.reason);

		// Add to stack if we dont have a current state or this new state justifies a push
		if (!this.currentSelectionState || this.currentSelectionState.justifiesNewNavigationEntry(stateCandidate)) {
			this.doAdd(groupId, editor, stateCandidate.selection);
		}

		// Otherwise we replace the current stack entry with this one
		else {
			this.doReplace(groupId, editor, stateCandidate.selection);
		}

		// Update our current navigation editor state
		this.currentSelectionState = stateCandidate;
	}

	private onNonSelectionAwareEditorNavigation(groupId: GroupIdentifier, editor: EditorInput): void {
		if (this.current?.groupId === groupId && this.editorHelper.matchesEditor(this.current.editor, editor)) {
			return; // do not push same editor input again of same group
		}

		this.trace('onNonSelectionAwareEditorNavigation()', editor);

		this.doAdd(groupId, editor);
	}

	private doAdd(groupId: GroupIdentifier, editor: EditorInput | IResourceEditorInput, selection?: IEditorPaneSelection): void {
		if (!this.navigating) {
			this.addOrReplace(groupId, editor, selection);
		}
	}

	private doReplace(groupId: GroupIdentifier, editor: EditorInput | IResourceEditorInput, selection?: IEditorPaneSelection): void {
		if (!this.navigating) {
			this.addOrReplace(groupId, editor, selection, true /* force replace */);
		}
	}

	addOrReplace(groupId: GroupIdentifier, editorCandidate: EditorInput | IResourceEditorInput, selection?: IEditorPaneSelection, forceReplace?: boolean): void {

		// Ensure we listen to changes in group
		this.registerGroupListeners(groupId);

		// Check whether to replace an existing entry or not
		let replace = false;
		if (this.current) {
			if (forceReplace) {
				replace = true; // replace if we are forced to
			} else if (this.shouldReplaceStackEntry(this.current, { groupId, editor: editorCandidate, selection })) {
				replace = true; // replace if the group & input is the same and selection indicates as such
			}
		}

		const editor = this.editorHelper.preferResourceEditorInput(editorCandidate);
		if (!editor) {
			return;
		}

		if (replace) {
			this.trace('replace()', editor);
		} else {
			this.trace('add()', editor);
		}

		const newStackEntry: IEditorNavigationStackEntry = { groupId, editor, selection };

		// Replace at current position
		const removedEntries: IEditorNavigationStackEntry[] = [];
		if (replace) {
			if (this.current) {
				removedEntries.push(this.current);
			}
			this.current = newStackEntry;
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
			this.stack.splice(this.index + 1, 0, newStackEntry);

			// Check for limit
			if (this.stack.length > EditorNavigationStack.MAX_STACK_SIZE) {
				removedEntries.push(this.stack.shift()!); // remove first
				if (this.previousIndex >= 0) {
					this.previousIndex--;
				}
			} else {
				this.setIndex(this.index + 1, true /* skip event, we fire it later */);
			}
		}

		// Clear editor listeners from removed entries
		for (const removedEntry of removedEntries) {
			this.editorHelper.clearOnEditorDispose(removedEntry.editor, this.mapEditorToDisposable);
		}

		// Remove this from the stack unless the stack input is a resource
		// that can easily be restored even when the input gets disposed
		if (isEditorInput(editor)) {
			this.editorHelper.onEditorDispose(editor, () => this.remove(editor), this.mapEditorToDisposable);
		}

		// Event
		this._onDidChange.fire();
	}

	private shouldReplaceStackEntry(entry: IEditorNavigationStackEntry, candidate: IEditorNavigationStackEntry): boolean {
		if (entry.groupId !== candidate.groupId) {
			return false; // different group
		}

		if (!this.editorHelper.matchesEditor(entry.editor, candidate.editor)) {
			return false; // different editor
		}

		if (!entry.selection) {
			return true; // always replace when we have no specific selection yet
		}

		if (!candidate.selection) {
			return false; // otherwise, prefer to keep existing specific selection over new unspecific one
		}

		// Finally, replace when selections are considered identical
		return entry.selection.compare(candidate.selection) === EditorPaneSelectionCompareResult.IDENTICAL;
	}

	move(event: FileOperationEvent): void {
		if (event.isOperation(FileOperation.MOVE)) {
			for (const entry of this.stack) {
				if (this.editorHelper.matchesEditor(event, entry.editor)) {
					entry.editor = { resource: event.target.resource };
				}
			}
		}
	}

	remove(arg1: EditorInput | FileChangesEvent | FileOperationEvent | GroupIdentifier): void {
		const previousStackSize = this.stack.length;

		// Remove all stack entries that match `arg1`
		this.stack = this.stack.filter(entry => {
			const matches = typeof arg1 === 'number' ? entry.groupId === arg1 : this.editorHelper.matchesEditor(arg1, entry.editor);

			// Cleanup any listeners associated with the input when removing
			if (matches) {
				this.editorHelper.clearOnEditorDispose(entry.editor, this.mapEditorToDisposable);
			}

			return !matches;
		});

		if (previousStackSize === this.stack.length) {
			return; // nothing removed
		}

		// Given we just removed entries, we need to make sure
		// to remove entries that are now identical and next
		// to each other to prevent no-op navigations.
		this.flatten();

		// Reset indeces
		this.index = this.stack.length - 1;
		this.previousIndex = -1;

		// Clear group listener
		if (typeof arg1 === 'number') {
			this.mapGroupToDisposable.get(arg1)?.dispose();
			this.mapGroupToDisposable.delete(arg1);
		}

		// Event
		this._onDidChange.fire();
	}

	private flatten(): void {
		const flattenedStack: IEditorNavigationStackEntry[] = [];

		let previousEntry: IEditorNavigationStackEntry | undefined = undefined;
		for (const entry of this.stack) {
			if (previousEntry && this.shouldReplaceStackEntry(entry, previousEntry)) {
				continue; // skip over entry when it is considered the same
			}

			previousEntry = entry;
			flattenedStack.push(entry);
		}

		this.stack = flattenedStack;
	}

	clear(): void {
		this.index = -1;
		this.previousIndex = -1;
		this.stack.splice(0);

		for (const [, disposable] of this.mapEditorToDisposable) {
			dispose(disposable);
		}
		this.mapEditorToDisposable.clear();

		for (const [, disposable] of this.mapGroupToDisposable) {
			dispose(disposable);
		}
		this.mapGroupToDisposable.clear();
	}

	override dispose(): void {
		super.dispose();

		this.clear();
	}

	//#endregion

	//#region Navigation

	canGoForward(): boolean {
		return this.stack.length > this.index + 1;
	}

	async goForward(): Promise<void> {
		const navigated = await this.maybeGoCurrent();
		if (navigated) {
			return;
		}

		if (!this.canGoForward()) {
			return;
		}

		this.setIndex(this.index + 1);
		return this.navigate();
	}

	canGoBack(): boolean {
		return this.index > 0;
	}

	async goBack(): Promise<void> {
		const navigated = await this.maybeGoCurrent();
		if (navigated) {
			return;
		}

		if (!this.canGoBack()) {
			return;
		}

		this.setIndex(this.index - 1);
		return this.navigate();
	}

	async goPrevious(): Promise<void> {
		const navigated = await this.maybeGoCurrent();
		if (navigated) {
			return;
		}

		// If we never navigated, just go back
		if (this.previousIndex === -1) {
			return this.goBack();
		}

		// Otherwise jump to previous stack entry
		this.setIndex(this.previousIndex);
		return this.navigate();
	}

	canGoLast(): boolean {
		return this.stack.length > 0;
	}

	async goLast(): Promise<void> {
		if (!this.canGoLast()) {
			return;
		}

		this.setIndex(this.stack.length - 1);
		return this.navigate();
	}

	private async maybeGoCurrent(): Promise<boolean> {

		// When this navigation stack works with a specific
		// filter where not every selection change is added
		// to the stack, we want to first reveal the current
		// selection before attempting to navigate in the
		// stack.

		if (this.filter === GoFilter.NONE) {
			return false; // only applies when  we are a filterd stack
		}

		if (this.isCurrentSelectionActive()) {
			return false; // we are at the current navigation stop
		}

		// Go to current selection
		await this.navigate();

		return true;
	}

	private isCurrentSelectionActive(): boolean {
		if (!this.current?.selection) {
			return false; // we need a current selection
		}

		const pane = this.editorService.activeEditorPane;
		if (!isEditorPaneWithSelection(pane)) {
			return false; // we need an active editor pane with selection support
		}

		if (pane.group.id !== this.current.groupId) {
			return false; // we need matching groups
		}

		if (!pane.input || !this.editorHelper.matchesEditor(pane.input, this.current.editor)) {
			return false; // we need matching editors
		}

		const paneSelection = pane.getSelection();
		if (!paneSelection) {
			return false; // we need a selection to compare with
		}

		return paneSelection.compare(this.current.selection) === EditorPaneSelectionCompareResult.IDENTICAL;
	}

	private setIndex(newIndex: number, skipEvent?: boolean): void {
		this.previousIndex = this.index;
		this.index = newIndex;

		// Event
		if (!skipEvent) {
			this._onDidChange.fire();
		}
	}

	private async navigate(): Promise<void> {
		this.navigating = true;

		try {
			if (this.current) {
				await this.doNavigate(this.current);
			}
		} finally {
			this.navigating = false;
		}
	}

	private doNavigate(location: IEditorNavigationStackEntry): Promise<IEditorPane | undefined> {
		let options: IEditorOptions = Object.create(null);

		// Apply selection if any
		if (location.selection) {
			options = location.selection.restore(options);
		}

		if (isEditorInput(location.editor)) {
			return this.editorService.openEditor(location.editor, options, location.groupId);
		}

		return this.editorService.openEditor({
			...location.editor,
			options: {
				...location.editor.options,
				...options
			}
		}, location.groupId);
	}

	isNavigating(): boolean {
		return this.navigating;
	}

	//#endregion
}

class EditorHelper {

	constructor(
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService
	) { }

	preferResourceEditorInput(editor: EditorInput): EditorInput | IResourceEditorInput;
	preferResourceEditorInput(editor: IResourceEditorInput): IResourceEditorInput | undefined;
	preferResourceEditorInput(editor: EditorInput | IResourceEditorInput): EditorInput | IResourceEditorInput | undefined;
	preferResourceEditorInput(editor: EditorInput | IResourceEditorInput): EditorInput | IResourceEditorInput | undefined {
		const resource = EditorResourceAccessor.getOriginalUri(editor);

		// For now, only prefer well known schemes that we control to prevent
		// issues such as https://github.com/microsoft/vscode/issues/85204
		// from being used as resource inputs
		// resource inputs survive editor disposal and as such are a lot more
		// durable across editor changes and restarts
		const hasValidResourceEditorInputScheme =
			resource?.scheme === Schemas.file ||
			resource?.scheme === Schemas.vscodeRemote ||
			resource?.scheme === Schemas.vscodeUserData ||
			resource?.scheme === this.pathService.defaultUriScheme;

		// Scheme is valid: prefer the untyped input
		// over the typed input if possible to keep
		// the entry across restarts
		if (hasValidResourceEditorInputScheme) {
			if (isEditorInput(editor)) {
				const untypedInput = editor.toUntyped();
				if (isResourceEditorInput(untypedInput)) {
					return untypedInput;
				}
			}

			return editor;
		}

		// Scheme is invalid: allow the editor input
		// for as long as it is not disposed
		else {
			return isEditorInput(editor) ? editor : undefined;
		}
	}

	matchesEditor(arg1: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent, inputB: EditorInput | IResourceEditorInput): boolean {
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

	matchesFile(resource: URI, arg2: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent): boolean {
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

	matchesEditorIdentifier(identifier: IEditorIdentifier, editorPane?: IEditorPane): boolean {
		if (!editorPane?.group) {
			return false;
		}

		if (identifier.groupId !== editorPane.group.id) {
			return false;
		}

		return editorPane.input ? identifier.editor.matches(editorPane.input) : false;
	}

	onEditorDispose(editor: EditorInput, listener: Function, mapEditorToDispose: Map<EditorInput, DisposableStore>): void {
		const toDispose = Event.once(editor.onWillDispose)(() => listener());

		let disposables = mapEditorToDispose.get(editor);
		if (!disposables) {
			disposables = new DisposableStore();
			mapEditorToDispose.set(editor, disposables);
		}

		disposables.add(toDispose);
	}

	clearOnEditorDispose(editor: EditorInput | IResourceEditorInput | FileChangesEvent | FileOperationEvent, mapEditorToDispose: Map<EditorInput, DisposableStore>): void {
		if (!isEditorInput(editor)) {
			return; // only supported when passing in an actual editor input
		}

		const disposables = mapEditorToDispose.get(editor);
		if (disposables) {
			dispose(disposables);
			mapEditorToDispose.delete(editor);
		}
	}
}
