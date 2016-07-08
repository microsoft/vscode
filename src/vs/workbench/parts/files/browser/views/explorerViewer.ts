/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import objects = require('vs/base/common/objects');
import DOM = require('vs/base/browser/dom');
import URI from 'vs/base/common/uri';
import {MIME_BINARY} from 'vs/base/common/mime';
import async = require('vs/base/common/async');
import paths = require('vs/base/common/paths');
import errors = require('vs/base/common/errors');
import {isString} from 'vs/base/common/types';
import {IAction, ActionRunner as BaseActionRunner, IActionRunner} from 'vs/base/common/actions';
import comparers = require('vs/base/common/comparers');
import {InputBox} from 'vs/base/browser/ui/inputbox/inputBox';
import {$} from 'vs/base/browser/builder';
import platform = require('vs/base/common/platform');
import glob = require('vs/base/common/glob');
import {IDisposable} from 'vs/base/common/lifecycle';
import {ContributableActionProvider} from 'vs/workbench/browser/actionBarRegistry';
import {LocalFileChangeEvent, IFilesConfiguration, ITextFileService} from 'vs/workbench/parts/files/common/files';
import {IFileOperationResult, FileOperationResult, IFileStat, IFileService} from 'vs/platform/files/common/files';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {DuplicateFileAction, ImportFileAction, PasteFileAction, keybindingForAction, IEditableData, IFileViewletState} from 'vs/workbench/parts/files/browser/fileActions';
import {ConfirmResult} from 'vs/workbench/common/editor';
import {IDataSource, ITree, IElementCallback, IAccessibilityProvider, IRenderer, ContextMenuEvent, ISorter, IFilter, IDragAndDrop, IDragAndDropData, IDragOverReaction, DRAG_OVER_ACCEPT_BUBBLE_DOWN, DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY, DRAG_OVER_ACCEPT_BUBBLE_UP, DRAG_OVER_ACCEPT_BUBBLE_UP_COPY, DRAG_OVER_REJECT} from 'vs/base/parts/tree/browser/tree';
import labels = require('vs/base/common/labels');
import {DesktopDragAndDropData, ExternalElementsDragAndDropData} from 'vs/base/parts/tree/browser/treeDnd';
import {ClickBehavior, DefaultController} from 'vs/base/parts/tree/browser/treeDefaults';
import {ActionsRenderer} from 'vs/base/parts/tree/browser/actionsRenderer';
import {FileStat, NewStatPlaceholder} from 'vs/workbench/parts/files/common/explorerViewModel';
import {DragMouseEvent, IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IWorkspace} from 'vs/platform/workspace/common/workspace';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, IConfirmation, Severity} from 'vs/platform/message/common/message';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {Keybinding, CommonKeybindings} from 'vs/base/common/keyCodes';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMenuService, IMenu, MenuId} from 'vs/platform/actions/common/actions';
import {fillInActions} from 'vs/platform/actions/browser/menuItemActionItem';

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
			let promise = this.fileService.resolveFile(stat.resource, { resolveSingleChildDescendants: true }).then((dirStat: IFileStat) => {

				// Convert to view model
				let modelDirStat = FileStat.create(dirStat);

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
			stat: stat
		}, context);

		if (!isString(arg)) {
			let action = <IAction>arg;
			if (action.enabled) {
				return action.run(context);
			}

			return null;
		}

		let id = <string>arg;
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
	private state: FileViewletState;

	constructor(
		state: FileViewletState,
		actionRunner: IActionRunner,
		@IContextViewService private contextViewService: IContextViewService
	) {
		super({
			actionProvider: state.actionProvider,
			actionRunner: actionRunner
		});

		this.state = state;
	}

	public getContentHeight(tree: ITree, element: any): number {
		return 22;
	}

	public renderContents(tree: ITree, stat: FileStat, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		let el = $(domElement).clearChildren();
		let item = $('.explorer-item').addClass(this.iconClass(stat)).appendTo(el);

		// File/Folder label
		let editableData: IEditableData = this.state.getEditableData(stat);
		if (!editableData) {
			let label = $('.explorer-item-label').appendTo(item);
			$('a.plain').text(stat.name).appendTo(label);
			return null;
		}

		// Input field (when creating a new file or folder or renaming)
		let inputBox = new InputBox(item.getHTMLElement(), this.contextViewService, {
			validationOptions: {
				validation: editableData.validator,
				showMessage: true
			},
			ariaLabel: nls.localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});

		let value = stat.name || '';
		let lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
		inputBox.focus();

		let done = async.once(commit => {
			tree.clearHighlight();

			if (commit && inputBox.value) {
				this.state.actionProvider.runAction(tree, stat, editableData.action, { value: inputBox.value });
			}

			setTimeout(() => {
				tree.DOMFocus();
				lifecycle.dispose(toDispose);
			}, 0);
		});

		var toDispose = [
			inputBox,
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				if (e.equals(CommonKeybindings.ENTER)) {
					if (inputBox.validate()) {
						done(true);
					}
				} else if (e.equals(CommonKeybindings.ESCAPE)) {
					done(false);
				}
			}),
			DOM.addDisposableListener(inputBox.inputElement, 'blur', () => {
				done(inputBox.isInputValid());
			})
		];

		return () => done(true);
	}

	private iconClass(element: FileStat): string {
		if (element.isDirectory) {
			return 'folder-icon';
		}

		return 'text-file-icon';
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
		@ITextFileService private textFileService: ITextFileService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IEventService private eventService: IEventService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN });

		this.contributedContextMenu = menuService.createMenu(MenuId.ExplorerContext, keybindingService);

		this.workspace = contextService.getWorkspace();

		this.didCatchEnterDown = false;

		this.downKeyBindingDispatcher.set(platform.isMacintosh ? CommonKeybindings.CTRLCMD_DOWN_ARROW : CommonKeybindings.ENTER, this.onEnterDown.bind(this));
		this.upKeyBindingDispatcher.set(platform.isMacintosh ? CommonKeybindings.CTRLCMD_DOWN_ARROW : CommonKeybindings.ENTER, this.onEnterUp.bind(this));
		if (platform.isMacintosh) {
			this.upKeyBindingDispatcher.set(CommonKeybindings.WINCTRL_ENTER, this.onModifierEnterUp.bind(this)); // Mac: somehow Cmd+Enter does not work
		} else {
			this.upKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_ENTER, this.onModifierEnterUp.bind(this)); // Mac: somehow Cmd+Enter does not work
		}
		this.downKeyBindingDispatcher.set(platform.isMacintosh ? CommonKeybindings.ENTER : CommonKeybindings.F2, this.onF2.bind(this));
		this.downKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_C, this.onCopy.bind(this));
		this.downKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_V, this.onPaste.bind(this));

		if (platform.isMacintosh) {
			this.downKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_UP_ARROW, this.onLeft.bind(this));
			this.downKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_BACKSPACE, this.onDelete.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(CommonKeybindings.DELETE, this.onDelete.bind(this));
			this.downKeyBindingDispatcher.set(CommonKeybindings.SHIFT_DELETE, this.onDelete.bind(this));
		}

		this.state = state;
	}

	/* protected */ public onLeftClick(tree: ITree, stat: FileStat, event: IMouseEvent, origin: string = 'mouse'): boolean {
		let payload = { origin: origin };
		let isDoubleClick = (origin === 'mouse' && event.detail === 2);

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
		let isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
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
			let selection = tree.getSelection();
			if (selection && selection.length > 0 && selection[0] === stat) {
				tree.clearSelection(payload);
			}
		}

		// Select, Focus and open files
		else if (!(stat instanceof NewStatPlaceholder)) {
			let preserveFocus = !isDoubleClick;
			tree.setFocus(stat, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to editor, we need to prevent default
			}

			if (!stat.isDirectory) {
				tree.setSelection([stat], payload);

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

		let anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => {
				return this.state.actionProvider.getSecondaryActions(tree, stat).then(actions => {
					fillInActions(this.contributedContextMenu, actions);
					return actions;
				});
			},
			getActionItem: this.state.actionProvider.getActionItem.bind(this.state.actionProvider, tree, stat),
			getKeyBinding: (a): Keybinding => keybindingForAction(a.id),
			getActionsContext: () => {
				return {
					viewletState: this.state,
					stat: stat
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

		let payload = { origin: 'keyboard' };

		let stat: FileStat = tree.getFocus();
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

		let stat: FileStat = tree.getFocus();
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

		let stat: FileStat = tree.getFocus();
		if (stat && !stat.isDirectory) {
			this.openEditor(stat, false, true);
		}

		this.didCatchEnterDown = false;

		return true;
	}

	private onCopy(tree: ITree, event: IKeyboardEvent): boolean {
		let stat: FileStat = tree.getFocus();
		if (stat) {
			this.runAction(tree, stat, 'workbench.files.action.copyFile').done();

			return true;
		}

		return false;
	}

	private onPaste(tree: ITree, event: IKeyboardEvent): boolean {
		let stat: FileStat = tree.getFocus() || tree.getInput() /* root */;
		if (stat) {
			let pasteAction = this.instantiationService.createInstance(PasteFileAction, tree, stat);
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

			const editorInput = this.instantiationService.createInstance(FileEditorInput, stat.resource, stat.mime, void 0);
			this.editorService.openEditor(editorInput, { preserveFocus, pinned }, sideBySide).done(null, errors.onUnexpectedError);
		}
	}

	private onF2(tree: ITree, event: IKeyboardEvent): boolean {
		let stat: FileStat = tree.getFocus();

		if (stat) {
			this.runAction(tree, stat, 'workbench.files.action.triggerRename').done();

			return true;
		}

		return false;
	}

	private onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		let useTrash = !event.shiftKey;
		let stat: FileStat = tree.getFocus();
		if (stat) {
			this.runAction(tree, stat, useTrash ? 'workbench.files.action.moveFileToTrash' : 'workbench.files.action.deleteFile').done();

			return true;
		}

		return false;
	}

	private runAction(tree: ITree, stat: FileStat, id: string): TPromise<any> {
		return this.state.actionProvider.runAction(tree, stat, id);
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
	private hiddenExpression: glob.IExpression;

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		this.hiddenExpression = Object.create(null);
	}

	public updateConfiguration(configuration: IFilesConfiguration): boolean {
		let excludesConfig = (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
		let needsRefresh = !objects.equals(this.hiddenExpression, excludesConfig);

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

		let siblings = stat.parent && stat.parent.children && stat.parent.children.map(c => c.name);

		// Hide those that match Hidden Patterns
		if (glob.match(this.hiddenExpression, this.contextService.toWorkspaceRelativePath(stat.resource), siblings)) {
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
		return stat.resource && stat.resource.toString();
	}

	public onDragStart(tree: ITree, data: IDragAndDropData, originalEvent: DragMouseEvent): void {
		let sources: FileStat[] = data.getData();
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

		let isCopy = originalEvent && ((originalEvent.ctrlKey && !platform.isMacintosh) || (originalEvent.altKey && platform.isMacintosh));
		let fromDesktop = data instanceof DesktopDragAndDropData;

		// Desktop DND
		if (fromDesktop) {
			let dragData = (<DesktopDragAndDropData>data).getData();

			let types = dragData.types;
			let typesArray: string[] = [];
			for (let i = 0; i < types.length; i++) {
				typesArray.push(types[i]);
			}

			if (typesArray.length === 0 || !typesArray.some((type) => { return type === 'Files'; })) {
				return DRAG_OVER_REJECT;
			}
		}

		// Other-Tree DND
		else if (data instanceof ExternalElementsDragAndDropData) {
			return DRAG_OVER_REJECT;
		}

		// In-Explorer DND
		else {
			let sources: FileStat[] = data.getData();
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
			let importAction = this.instantiationService.createInstance(ImportFileAction, tree, target, null);
			promise = importAction.run({
				input: {
					files: <FileList>(<DesktopDragAndDropData>data).getData().files
				}
			});
		}

		// In-Explorer DND (Move/Copy file)
		else {
			let source: FileStat = data.getData()[0];
			let isCopy = (originalEvent.ctrlKey && !platform.isMacintosh) || (originalEvent.altKey && platform.isMacintosh);

			promise = tree.expand(target).then(() => {

				// Reuse action if user copies
				if (isCopy) {
					let copyAction = this.instantiationService.createInstance(DuplicateFileAction, tree, source, target);
					return copyAction.run();
				}

				// Handle dirty
				let saveOrRevertPromise: TPromise<boolean> = TPromise.as(null);
				if (this.textFileService.isDirty(source.resource)) {
					let res = this.textFileService.confirmSave([source.resource]);
					if (res === ConfirmResult.SAVE) {
						saveOrRevertPromise = this.textFileService.save(source.resource);
					} else if (res === ConfirmResult.DONT_SAVE) {
						saveOrRevertPromise = this.textFileService.revert(source.resource);
					} else if (res === ConfirmResult.CANCEL) {
						return TPromise.as(null);
					}
				}

				// For move, first check if file is dirty and save
				return saveOrRevertPromise.then(() => {

					// If the file is still dirty, do not touch it because a save is pending to the disk and we can not abort it
					if (this.textFileService.isDirty(source.resource)) {
						this.messageService.show(Severity.Warning, nls.localize('warningFileDirty', "File '{0}' is currently being saved, please try again later.", labels.getPathLabel(source.resource)));

						return TPromise.as(null);
					}

					let targetResource = URI.file(paths.join(target.resource.fsPath, source.name));
					let didHandleConflict = false;

					let onMove = (result: IFileStat) => {
						this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(source.clone(), result));
					};

					// Move File/Folder and emit event
					return this.fileService.moveFile(source.resource, targetResource).then(onMove, (error) => {

						// Conflict
						if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
							didHandleConflict = true;

							let confirm: IConfirmation = {
								message: nls.localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
								detail: nls.localize('irreversible', "This action is irreversible!"),
								primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace")
							};

							if (this.messageService.confirm(confirm)) {
								return this.fileService.moveFile(source.resource, targetResource, true).then((result) => {
									let fakeTargetState = new FileStat(targetResource);
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