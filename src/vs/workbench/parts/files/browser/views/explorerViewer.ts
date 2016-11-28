/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import objects = require('vs/base/common/objects');
import DOM = require('vs/base/browser/dom');
import URI from 'vs/base/common/uri';
import { MIME_BINARY } from 'vs/base/common/mime';
import async = require('vs/base/common/async');
import paths = require('vs/base/common/paths');
import errors = require('vs/base/common/errors');
import { isString } from 'vs/base/common/types';
import { IAction, ActionRunner as BaseActionRunner, IActionRunner } from 'vs/base/common/actions';
import comparers = require('vs/base/common/comparers');
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { $, Builder } from 'vs/base/browser/builder';
import platform = require('vs/base/common/platform');
import glob = require('vs/base/common/glob');
import { FileLabel, IFileLabelOptions } from 'vs/workbench/browser/labels';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { IFilesConfiguration } from 'vs/workbench/parts/files/common/files';
import { LocalFileChangeEvent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileOperationResult, FileOperationResult, IFileStat, IFileService } from 'vs/platform/files/common/files';
import { DuplicateFileAction, ImportFileAction, PasteFileAction, keybindingForAction, IEditableData, IFileViewletState } from 'vs/workbench/parts/files/browser/fileActions';
import { IDataSource, ITree, IElementCallback, IAccessibilityProvider, IRenderer, ContextMenuEvent, ISorter, IFilter, IDragAndDrop, IDragAndDropData, IDragOverReaction, DRAG_OVER_ACCEPT_BUBBLE_DOWN, DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY, DRAG_OVER_ACCEPT_BUBBLE_UP, DRAG_OVER_ACCEPT_BUBBLE_UP_COPY, DRAG_OVER_REJECT } from 'vs/base/parts/tree/browser/tree';
import { DesktopDragAndDropData, ExternalElementsDragAndDropData } from 'vs/base/parts/tree/browser/treeDnd';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { ActionsRenderer } from 'vs/base/parts/tree/browser/actionsRenderer';
import { FileStat, NewStatPlaceholder } from 'vs/workbench/parts/files/common/explorerViewModel';
import { DragMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkspace, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEventService } from 'vs/platform/event/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IConfirmation, Severity } from 'vs/platform/message/common/message';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Keybinding } from 'vs/base/common/keybinding';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';

export class FileDataSource implements IDataSource {
	private workspace: IWorkspace;

	constructor(
		@IProgressService private progressService: IProgressService,
		@IMessageService private messageService: IMessageService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.workspace = contextService.getWorkspace();
	}

	public getId(tree: ITree, stat: FileStat): string {
		return stat.getId();
	}

	public hasChildren(tree: ITree, stat: FileStat): boolean {
		return stat.isDirectory;
	}

	public getChildren(tree: ITree, stat: FileStat): TPromise<FileStat[]> {

		// Return early if stat is already resolved
		if (stat.isDirectoryResolved) {
			return TPromise.as(stat.children);
		}

		// Resolve children and add to fileStat for future lookup
		else {

			// Resolve
			const promise = this.fileService.resolveFile(stat.resource, { resolveSingleChildDescendants: true }).then(dirStat => {

				// Convert to view model
				const modelDirStat = FileStat.create(dirStat);

				// Add children to folder
				for (let i = 0; i < modelDirStat.children.length; i++) {
					stat.addChild(modelDirStat.children[i]);
				}

				stat.isDirectoryResolved = true;

				return stat.children;
			}, (e: any) => {
				this.messageService.show(Severity.Error, e);

				return []; // we could not resolve any children because of an error
			});

			this.progressService.showWhile(promise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);

			return promise;
		}
	}

	public getParent(tree: ITree, stat: FileStat): TPromise<FileStat> {
		if (!stat) {
			return TPromise.as(null); // can be null if nothing selected in the tree
		}

		// Return if root reached
		if (this.workspace && stat.resource.toString() === this.workspace.resource.toString()) {
			return TPromise.as(null);
		}

		// Return if parent already resolved
		if (stat.parent) {
			return TPromise.as(stat.parent);
		}

		// We never actually resolve the parent from the disk for performance reasons. It wouldnt make
		// any sense to resolve parent by parent with requests to walk up the chain. Instead, the explorer
		// makes sure to properly resolve a deep path to a specific file and merges the result with the model.
		return TPromise.as(null);
	}
}

export class FileActionProvider extends ContributableActionProvider {
	private state: FileViewletState;

	constructor(state: any) {
		super();

		this.state = state;
	}

	public hasActions(tree: ITree, stat: FileStat): boolean {
		if (stat instanceof NewStatPlaceholder) {
			return false;
		}

		return super.hasActions(tree, stat);
	}

	public getActions(tree: ITree, stat: FileStat): TPromise<IAction[]> {
		if (stat instanceof NewStatPlaceholder) {
			return TPromise.as([]);
		}

		return super.getActions(tree, stat);
	}

	public hasSecondaryActions(tree: ITree, stat: FileStat): boolean {
		if (stat instanceof NewStatPlaceholder) {
			return false;
		}

		return super.hasSecondaryActions(tree, stat);
	}

	public getSecondaryActions(tree: ITree, stat: FileStat): TPromise<IAction[]> {
		if (stat instanceof NewStatPlaceholder) {
			return TPromise.as([]);
		}

		return super.getSecondaryActions(tree, stat);
	}

	public runAction(tree: ITree, stat: FileStat, action: IAction, context?: any): TPromise<any>;
	public runAction(tree: ITree, stat: FileStat, actionID: string, context?: any): TPromise<any>;
	public runAction(tree: ITree, stat: FileStat, arg: any, context: any = {}): TPromise<any> {
		context = objects.mixin({
			viewletState: this.state,
			stat
		}, context);

		if (!isString(arg)) {
			const action = <IAction>arg;
			if (action.enabled) {
				return action.run(context);
			}

			return null;
		}

		const id = <string>arg;
		let promise = this.hasActions(tree, stat) ? this.getActions(tree, stat) : TPromise.as([]);

		return promise.then((actions: IAction[]) => {
			for (let i = 0, len = actions.length; i < len; i++) {
				if (actions[i].id === id && actions[i].enabled) {
					return actions[i].run(context);
				}
			}

			promise = this.hasSecondaryActions(tree, stat) ? this.getSecondaryActions(tree, stat) : TPromise.as([]);

			return promise.then((actions: IAction[]) => {
				for (let i = 0, len = actions.length; i < len; i++) {
					if (actions[i].id === id && actions[i].enabled) {
						return actions[i].run(context);
					}
				}

				return null;
			});
		});
	}
}

export class FileViewletState implements IFileViewletState {
	private _actionProvider: FileActionProvider;
	private editableStats: { [resource: string]: IEditableData; };

	constructor() {
		this._actionProvider = new FileActionProvider(this);
		this.editableStats = Object.create(null);
	}

	public get actionProvider(): FileActionProvider {
		return this._actionProvider;
	}

	public getEditableData(stat: FileStat): IEditableData {
		return this.editableStats[stat.resource && stat.resource.toString()];
	}

	public setEditable(stat: FileStat, editableData: IEditableData): void {
		if (editableData) {
			this.editableStats[stat.resource && stat.resource.toString()] = editableData;
		}
	}

	public clearEditable(stat: FileStat): void {
		delete this.editableStats[stat.resource && stat.resource.toString()];
	}
}

export class ActionRunner extends BaseActionRunner implements IActionRunner {
	private viewletState: FileViewletState;

	constructor(state: FileViewletState) {
		super();

		this.viewletState = state;
	}

	public run(action: IAction, context?: any): TPromise<any> {
		return super.run(action, { viewletState: this.viewletState });
	}
}

// Explorer Renderer
export class FileRenderer extends ActionsRenderer implements IRenderer {

	private static ITEM_HEIGHT = 22;

	private state: FileViewletState;

	constructor(
		state: FileViewletState,
		actionRunner: IActionRunner,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super({
			actionProvider: state.actionProvider,
			actionRunner: actionRunner
		});

		this.state = state;
	}

	public getContentHeight(tree: ITree, element: any): number {
		return FileRenderer.ITEM_HEIGHT;
	}

	public renderContents(tree: ITree, stat: FileStat, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		const el = $(domElement).clearChildren();

		// File Rename/Add Input Field
		const editableData: IEditableData = this.state.getEditableData(stat);
		if (editableData) {
			return this.renderInputBox(el, tree, stat, editableData);
		}

		// Label
		return this.renderLabel(el, stat);
	}

	private renderLabel(container: Builder, stat: FileStat): IElementCallback {
		const label = this.instantiationService.createInstance(FileLabel, container.getHTMLElement(), void 0);

		const extraClasses = ['explorer-item'];
		label.setFile(stat.resource, { hidePath: true, isFolder: stat.isDirectory, extraClasses });

		return () => label.dispose();
	}

	private renderInputBox(container: Builder, tree: ITree, stat: FileStat, editableData: IEditableData): IElementCallback {
		const label = this.instantiationService.createInstance(FileLabel, container.getHTMLElement(), void 0);

		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const isFolder = stat.isDirectory || (stat instanceof NewStatPlaceholder && stat.isDirectoryPlaceholder());
		const labelOptions: IFileLabelOptions = { hidePath: true, hideLabel: true, isFolder, extraClasses };
		label.setFile(stat.resource, labelOptions);

		// Input field (when creating a new file or folder or renaming)
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: editableData.validator,
				showMessage: true
			},
			ariaLabel: nls.localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});

		const parent = paths.dirname(stat.resource.fsPath);
		inputBox.onDidChange(value => {
			label.setFile(URI.file(paths.join(parent, value)), labelOptions); // update label icon while typing!
		});

		const value = stat.name || '';
		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
		inputBox.focus();

		const done = async.once(commit => {
			tree.clearHighlight();

			if (commit && inputBox.value) {
				this.state.actionProvider.runAction(tree, stat, editableData.action, { value: inputBox.value });
			}

			setTimeout(() => {
				tree.DOMFocus();
				lifecycle.dispose(toDispose);
			}, 0);
		});

		const toDispose = [
			inputBox,
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					if (inputBox.validate()) {
						done(true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false);
				}
			}),
			DOM.addDisposableListener(inputBox.inputElement, 'blur', () => {
				done(inputBox.isInputValid());
			}),
			label
		];

		return () => done(true);
	}
}

// Explorer Accessibility Provider
export class FileAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, stat: FileStat): string {
		return nls.localize('filesExplorerViewerAriaLabel', "{0}, Files Explorer", stat.name);
	}
}

// Explorer Controller
export class FileController extends DefaultController {
	private didCatchEnterDown: boolean;
	private state: FileViewletState;

	private contributedContextMenu: IMenu;

	private workspace: IWorkspace;

	constructor(state: FileViewletState,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */ });

		this.contributedContextMenu = menuService.createMenu(MenuId.ExplorerContext, contextKeyService);

		this.workspace = contextService.getWorkspace();

		this.didCatchEnterDown = false;

		this.downKeyBindingDispatcher.set(platform.isMacintosh ? KeyMod.CtrlCmd | KeyCode.DownArrow : KeyCode.Enter, this.onEnterDown.bind(this));
		this.upKeyBindingDispatcher.set(platform.isMacintosh ? KeyMod.CtrlCmd | KeyCode.DownArrow : KeyCode.Enter, this.onEnterUp.bind(this));
		if (platform.isMacintosh) {
			this.upKeyBindingDispatcher.set(KeyMod.WinCtrl | KeyCode.Enter, this.onModifierEnterUp.bind(this)); // Mac: somehow Cmd+Enter does not work
		} else {
			this.upKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.Enter, this.onModifierEnterUp.bind(this)); // Mac: somehow Cmd+Enter does not work
		}
		this.downKeyBindingDispatcher.set(platform.isMacintosh ? KeyCode.Enter : KeyCode.F2, this.onF2.bind(this));
		this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.KEY_C, this.onCopy.bind(this));
		this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.KEY_V, this.onPaste.bind(this));

		if (platform.isMacintosh) {
			this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.UpArrow, this.onLeft.bind(this));
			this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.Backspace, this.onDelete.bind(this));
			this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace, this.onDelete.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(KeyCode.Delete, this.onDelete.bind(this));
			this.downKeyBindingDispatcher.set(KeyMod.Shift | KeyCode.Delete, this.onDelete.bind(this));
		}

		this.state = state;
	}

	/* protected */ public onLeftClick(tree: ITree, stat: FileStat, event: IMouseEvent, origin: string = 'mouse'): boolean {
		const payload = { origin: origin };
		const isDoubleClick = (origin === 'mouse' && event.detail === 2);

		// Handle Highlight Mode
		if (tree.getHighlight()) {

			// Cancel Event
			event.preventDefault();
			event.stopPropagation();

			tree.clearHighlight(payload);

			return false;
		}

		// Handle root
		if (this.workspace && stat.resource.toString() === this.workspace.resource.toString()) {
			tree.clearFocus(payload);
			tree.clearSelection(payload);

			return false;
		}

		// Cancel Event
		const isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
		if (!isMouseDown) {
			event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
		}
		event.stopPropagation();

		// Set DOM focus
		tree.DOMFocus();

		// Expand / Collapse
		tree.toggleExpansion(stat);

		// Allow to unselect
		if (event.shiftKey && !(stat instanceof NewStatPlaceholder)) {
			const selection = tree.getSelection();
			if (selection && selection.length > 0 && selection[0] === stat) {
				tree.clearSelection(payload);
			}
		}

		// Select, Focus and open files
		else if (!(stat instanceof NewStatPlaceholder)) {
			const preserveFocus = !isDoubleClick;
			tree.setFocus(stat, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to editor, we need to prevent default
			}

			tree.setSelection([stat], payload);

			if (!stat.isDirectory) {
				this.openEditor(stat, preserveFocus, event && (event.ctrlKey || event.metaKey), isDoubleClick);
			}
		}

		return true;
	}

	public onContextMenu(tree: ITree, stat: FileStat, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(stat);

		if (!this.state.actionProvider.hasSecondaryActions(tree, stat)) {
			return true;
		}

		const anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => {
				return this.state.actionProvider.getSecondaryActions(tree, stat).then(actions => {
					fillInActions(this.contributedContextMenu, stat.resource, actions);
					return actions;
				});
			},
			getActionItem: this.state.actionProvider.getActionItem.bind(this.state.actionProvider, tree, stat),
			getKeyBinding: (a): Keybinding => keybindingForAction(a.id, this.keybindingService),
			getActionsContext: (event) => {
				return {
					viewletState: this.state,
					stat,
					event
				};
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			}
		});

		return true;
	}

	private onEnterDown(tree: ITree, event: IKeyboardEvent): boolean {
		if (tree.getHighlight()) {
			return false;
		}

		const payload = { origin: 'keyboard' };

		const stat: FileStat = tree.getFocus();
		if (stat) {

			// Directory: Toggle expansion
			if (stat.isDirectory) {
				tree.toggleExpansion(stat);
			}

			// File: Open
			else {
				tree.setFocus(stat, payload);
				this.openEditor(stat, false, false);
			}
		}

		this.didCatchEnterDown = true;

		return true;
	}

	private onEnterUp(tree: ITree, event: IKeyboardEvent): boolean {
		if (!this.didCatchEnterDown || tree.getHighlight()) {
			return false;
		}

		const stat: FileStat = tree.getFocus();
		if (stat && !stat.isDirectory) {
			this.openEditor(stat, false, false);
		}

		this.didCatchEnterDown = false;

		return true;
	}

	private onModifierEnterUp(tree: ITree, event: IKeyboardEvent): boolean {
		if (tree.getHighlight()) {
			return false;
		}

		const stat: FileStat = tree.getFocus();
		if (stat && !stat.isDirectory) {
			this.openEditor(stat, false, true);
		}

		this.didCatchEnterDown = false;

		return true;
	}

	private onCopy(tree: ITree, event: IKeyboardEvent): boolean {
		const stat: FileStat = tree.getFocus();
		if (stat) {
			this.runAction(tree, stat, 'workbench.files.action.copyFile').done();

			return true;
		}

		return false;
	}

	private onPaste(tree: ITree, event: IKeyboardEvent): boolean {
		const stat: FileStat = tree.getFocus() || tree.getInput() /* root */;
		if (stat) {
			const pasteAction = this.instantiationService.createInstance(PasteFileAction, tree, stat);
			if (pasteAction._isEnabled()) {
				pasteAction.run().done(null, errors.onUnexpectedError);

				return true;
			}
		}

		return false;
	}

	private openEditor(stat: FileStat, preserveFocus: boolean, sideBySide: boolean, pinned = false): void {
		if (stat && !stat.isDirectory) {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'explorer' });

			this.editorService.openEditor({ resource: stat.resource, options: { preserveFocus, pinned } }, sideBySide).done(null, errors.onUnexpectedError);
		}
	}

	private onF2(tree: ITree, event: IKeyboardEvent): boolean {
		const stat: FileStat = tree.getFocus();

		if (stat) {
			this.runAction(tree, stat, 'workbench.files.action.triggerRename').done();

			return true;
		}

		return false;
	}

	private onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		const stat: FileStat = tree.getFocus();
		if (stat) {
			this.runAction(tree, stat, 'workbench.files.action.moveFileToTrash', event).done();

			return true;
		}

		return false;
	}

	private runAction(tree: ITree, stat: FileStat, id: string, event?: IKeyboardEvent): TPromise<any> {
		return this.state.actionProvider.runAction(tree, stat, id, { event });
	}
}

// Explorer Sorter
export class FileSorter implements ISorter {

	public compare(tree: ITree, statA: FileStat, statB: FileStat): number {
		if (statA.isDirectory && !statB.isDirectory) {
			return -1;
		}

		if (statB.isDirectory && !statA.isDirectory) {
			return 1;
		}

		if (statA.isDirectory && statB.isDirectory) {
			return statA.name.toLowerCase().localeCompare(statB.name.toLowerCase());
		}

		if (statA instanceof NewStatPlaceholder) {
			return -1;
		}

		if (statB instanceof NewStatPlaceholder) {
			return 1;
		}

		return comparers.compareFileNames(statA.name, statB.name);
	}
}

// Explorer Filter
export class FileFilter implements IFilter {

	private static MAX_SIBLINGS_FILTER_THRESHOLD = 2000;

	private hiddenExpression: glob.IExpression;

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		this.hiddenExpression = Object.create(null);
	}

	public updateConfiguration(configuration: IFilesConfiguration): boolean {
		const excludesConfig = (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
		const needsRefresh = !objects.equals(this.hiddenExpression, excludesConfig);

		this.hiddenExpression = objects.clone(excludesConfig); // do not keep the config, as it gets mutated under our hoods

		return needsRefresh;
	}

	public isVisible(tree: ITree, stat: FileStat): boolean {
		return this.doIsVisible(stat);
	}

	private doIsVisible(stat: FileStat): boolean {
		if (stat instanceof NewStatPlaceholder) {
			return true; // always visible
		}

		// Workaround for O(N^2) complexity (https://github.com/Microsoft/vscode/issues/9962)
		let siblings = stat.parent && stat.parent.children && stat.parent.children;
		if (siblings && siblings.length > FileFilter.MAX_SIBLINGS_FILTER_THRESHOLD) {
			siblings = void 0;
		}

		// Hide those that match Hidden Patterns
		const siblingsFn = () => siblings && siblings.map(c => c.name);
		if (glob.match(this.hiddenExpression, this.contextService.toWorkspaceRelativePath(stat.resource), siblingsFn)) {
			return false; // hidden through pattern
		}

		return true;
	}
}

// Explorer Drag And Drop Controller
export class FileDragAndDrop implements IDragAndDrop {
	private toDispose: IDisposable[];
	private dropEnabled: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IProgressService private progressService: IProgressService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService
	) {
		this.toDispose = [];

		this.onConfigurationUpdated(configurationService.getConfiguration<IFilesConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
	}

	private onConfigurationUpdated(config: IFilesConfiguration): void {
		this.dropEnabled = config && config.explorer && config.explorer.enableDragAndDrop;
	}

	public getDragURI(tree: ITree, stat: FileStat): string {
		if (stat.isDirectory) {
			return URI.from({ scheme: 'folder', path: stat.resource.fsPath }).toString(); // indicates that we are dragging a folder
		}

		return stat.resource.toString();
	}

	public getDragLabel(tree: ITree, elements: any[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}

		const stat = elements[0] as FileStat;
		return paths.basename(stat.resource.fsPath);
	}

	public onDragStart(tree: ITree, data: IDragAndDropData, originalEvent: DragMouseEvent): void {
		const sources: FileStat[] = data.getData();
		let source: FileStat = null;
		if (sources.length > 0) {
			source = sources[0];
		}

		// When dragging folders, make sure to collapse them to free up some space
		if (source && source.isDirectory && tree.isExpanded(source)) {
			tree.collapse(source, false);
		}

		// Native only: when a DownloadURL attribute is defined on the data transfer it is possible to
		// drag a file from the browser to the desktop and have it downloaded there.
		if (!(data instanceof DesktopDragAndDropData)) {
			if (source && !source.isDirectory) {
				originalEvent.dataTransfer.setData('DownloadURL', [MIME_BINARY, source.name, source.resource.toString()].join(':'));
			}
		}
	}

	public onDragOver(tree: ITree, data: IDragAndDropData, target: FileStat, originalEvent: DragMouseEvent): IDragOverReaction {
		if (!this.dropEnabled) {
			return DRAG_OVER_REJECT;
		}

		const isCopy = originalEvent && ((originalEvent.ctrlKey && !platform.isMacintosh) || (originalEvent.altKey && platform.isMacintosh));
		const fromDesktop = data instanceof DesktopDragAndDropData;

		// Desktop DND
		if (fromDesktop) {
			const dragData = (<DesktopDragAndDropData>data).getData();

			const types = dragData.types;
			const typesArray: string[] = [];
			for (let i = 0; i < types.length; i++) {
				typesArray.push(types[i]);
			}

			if (typesArray.length === 0 || !typesArray.some(type => { return type === 'Files'; })) {
				return DRAG_OVER_REJECT;
			}
		}

		// Other-Tree DND
		else if (data instanceof ExternalElementsDragAndDropData) {
			return DRAG_OVER_REJECT;
		}

		// In-Explorer DND
		else {
			const sources: FileStat[] = data.getData();
			if (!Array.isArray(sources)) {
				return DRAG_OVER_REJECT;
			}

			if (sources.some((source) => {
				if (source instanceof NewStatPlaceholder) {
					return true; // NewStatPlaceholders can not be moved
				}

				if (source.resource.toString() === target.resource.toString()) {
					return true; // Can not move anything onto itself
				}

				if (!isCopy && paths.dirname(source.resource.fsPath) === target.resource.fsPath) {
					return true; // Can not move a file to the same parent unless we copy
				}

				if (paths.isEqualOrParent(target.resource.fsPath, source.resource.fsPath)) {
					return true; // Can not move a parent folder into one of its children
				}

				return false;
			})) {
				return DRAG_OVER_REJECT;
			}
		}

		// All
		if (target.isDirectory) {
			return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY : DRAG_OVER_ACCEPT_BUBBLE_DOWN;
		}

		if (target.resource.toString() !== this.contextService.getWorkspace().resource.toString()) {
			return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_UP_COPY : DRAG_OVER_ACCEPT_BUBBLE_UP;
		}

		return DRAG_OVER_REJECT;
	}

	public drop(tree: ITree, data: IDragAndDropData, target: FileStat, originalEvent: DragMouseEvent): void {
		let promise: TPromise<void> = TPromise.as(null);

		// Desktop DND (Import file)
		if (data instanceof DesktopDragAndDropData) {
			const importAction = this.instantiationService.createInstance(ImportFileAction, tree, target, null);
			promise = importAction.run({
				input: {
					files: <FileList>(<DesktopDragAndDropData>data).getData().files
				}
			});
		}

		// In-Explorer DND (Move/Copy file)
		else {
			const source: FileStat = data.getData()[0];
			const isCopy = (originalEvent.ctrlKey && !platform.isMacintosh) || (originalEvent.altKey && platform.isMacintosh);

			promise = tree.expand(target).then(() => {

				// Reuse action if user copies
				if (isCopy) {
					const copyAction = this.instantiationService.createInstance(DuplicateFileAction, tree, source, target);
					return copyAction.run();
				}

				// Handle dirty (in file or inside the folder if any)
				let revertPromise: TPromise<any> = TPromise.as(null);
				const dirty = this.textFileService.getDirty().filter(d => paths.isEqualOrParent(d.fsPath, source.resource.fsPath));
				if (dirty.length) {
					let message: string;
					if (source.isDirectory) {
						if (dirty.length === 1) {
							message = nls.localize('dirtyMessageFolderOne', "You are moving a folder with unsaved changes in 1 file. Do you want to continue?");
						} else {
							message = nls.localize('dirtyMessageFolder', "You are moving a folder with unsaved changes in {0} files. Do you want to continue?", dirty.length);
						}
					} else {
						message = nls.localize('dirtyMessageFile', "You are moving a file with unsaved changes. Do you want to continue?");
					}

					const res = this.messageService.confirm({
						message,
						type: 'warning',
						detail: nls.localize('dirtyWarning', "Your changes will be lost if you don't save them."),
						primaryButton: nls.localize({ key: 'moveLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
					});

					if (!res) {
						return TPromise.as(null);
					}

					revertPromise = this.textFileService.revertAll(dirty);
				}

				return revertPromise.then(() => {
					const targetResource = URI.file(paths.join(target.resource.fsPath, source.name));
					let didHandleConflict = false;

					const onMove = (result: IFileStat) => {
						this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(source.clone(), result));
					};

					// Move File/Folder and emit event
					return this.fileService.moveFile(source.resource, targetResource).then(onMove, error => {

						// Conflict
						if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
							didHandleConflict = true;

							const confirm: IConfirmation = {
								message: nls.localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
								detail: nls.localize('irreversible', "This action is irreversible!"),
								primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace")
							};

							if (this.messageService.confirm(confirm)) {
								return this.fileService.moveFile(source.resource, targetResource, true).then(result => {
									const fakeTargetState = new FileStat(targetResource);
									this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(fakeTargetState, null));

									onMove(result);
								}, (error) => {
									this.messageService.show(Severity.Error, error);
								});
							}

							return;
						}

						this.messageService.show(Severity.Error, error);
					});
				});
			}, errors.onUnexpectedError);
		}

		this.progressService.showWhile(promise, 800);

		promise.done(null, errors.onUnexpectedError);
	}
}
