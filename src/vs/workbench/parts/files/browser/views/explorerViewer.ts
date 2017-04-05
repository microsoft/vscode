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
import { once } from 'vs/base/common/functional';
import paths = require('vs/base/common/paths');
import errors = require('vs/base/common/errors');
import { isString } from 'vs/base/common/types';
import { IAction, ActionRunner as BaseActionRunner, IActionRunner } from 'vs/base/common/actions';
import comparers = require('vs/base/common/comparers');
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import glob = require('vs/base/common/glob');
import { FileLabel, IFileLabelOptions } from 'vs/workbench/browser/labels';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { IFilesConfiguration } from 'vs/workbench/parts/files/common/files';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileOperationResult, FileOperationResult, IFileService, isEqual, isEqualOrParent } from 'vs/platform/files/common/files';
import { ResourceMap } from 'vs/base/common/map';
import { DuplicateFileAction, ImportFileAction, IEditableData, IFileViewletState } from 'vs/workbench/parts/files/browser/fileActions';
import { IDataSource, ITree, IAccessibilityProvider, IRenderer, ContextMenuEvent, ISorter, IFilter, IDragAndDrop, IDragAndDropData, IDragOverReaction, DRAG_OVER_ACCEPT_BUBBLE_DOWN, DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY, DRAG_OVER_ACCEPT_BUBBLE_UP, DRAG_OVER_ACCEPT_BUBBLE_UP_COPY, DRAG_OVER_REJECT } from 'vs/base/parts/tree/browser/tree';
import { DesktopDragAndDropData, ExternalElementsDragAndDropData } from 'vs/base/parts/tree/browser/treeDnd';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { FileStat, NewStatPlaceholder } from 'vs/workbench/parts/files/common/explorerViewModel';
import { DragMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IConfirmation, Severity } from 'vs/platform/message/common/message';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ResolvedKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class FileDataSource implements IDataSource {
	constructor(
		@IProgressService private progressService: IProgressService,
		@IMessageService private messageService: IMessageService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) { }

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
		const workspace = this.contextService.getWorkspace();
		if (workspace && isEqual(stat.resource.fsPath, workspace.resource.fsPath)) {
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
	private editableStats: ResourceMap<IEditableData>;

	constructor() {
		this._actionProvider = new FileActionProvider(this);
		this.editableStats = new ResourceMap<IEditableData>();
	}

	public get actionProvider(): FileActionProvider {
		return this._actionProvider;
	}

	public getEditableData(stat: FileStat): IEditableData {
		return this.editableStats.get(stat.resource);
	}

	public setEditable(stat: FileStat, editableData: IEditableData): void {
		if (editableData) {
			this.editableStats.set(stat.resource, editableData);
		}
	}

	public clearEditable(stat: FileStat): void {
		this.editableStats.delete(stat.resource);
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

export interface IFileTemplateData {
	label: FileLabel;
	container: HTMLElement;
}

// Explorer Renderer
export class FileRenderer implements IRenderer {

	private static ITEM_HEIGHT = 22;
	private static FILE_TEMPLATE_ID = 'file';

	private state: FileViewletState;

	constructor(
		state: FileViewletState,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
	) {
		this.state = state;
	}

	public getHeight(tree: ITree, element: any): number {
		return FileRenderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: any): string {
		return FileRenderer.FILE_TEMPLATE_ID;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: IFileTemplateData): void {
		templateData.label.dispose();
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): IFileTemplateData {
		const label = this.instantiationService.createInstance(FileLabel, container, void 0);

		return { label, container };
	}

	public renderElement(tree: ITree, stat: FileStat, templateId: string, templateData: IFileTemplateData): void {
		const editableData: IEditableData = this.state.getEditableData(stat);

		// File Label
		if (!editableData) {
			templateData.label.element.style.display = 'block';
			const extraClasses = ['explorer-item'];
			templateData.label.setFile(stat.resource, { hidePath: true, isFolder: stat.isDirectory, extraClasses });
		}

		// Input Box
		else {
			templateData.label.element.style.display = 'none';
			this.renderInputBox(templateData.container, tree, stat, editableData);
		}
	}

	private renderInputBox(container: HTMLElement, tree: ITree, stat: FileStat, editableData: IEditableData): void {

		// Use a file label only for the icon next to the input box
		const label = this.instantiationService.createInstance(FileLabel, container, void 0);
		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const isFolder = stat.isDirectory || (stat instanceof NewStatPlaceholder && stat.isDirectoryPlaceholder());
		const labelOptions: IFileLabelOptions = { hidePath: true, hideLabel: true, isFolder, extraClasses };
		label.setFile(stat.resource, labelOptions);

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: editableData.validator,
				showMessage: true
			},
			ariaLabel: nls.localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		const parent = paths.dirname(stat.resource.fsPath);
		inputBox.onDidChange(value => {
			label.setFile(URI.file(paths.join(parent, value)), labelOptions); // update label icon while typing!
		});

		const value = stat.name || '';
		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
		inputBox.focus();

		const done = once(commit => {
			tree.clearHighlight();

			if (commit && inputBox.value) {
				this.state.actionProvider.runAction(tree, stat, editableData.action, { value: inputBox.value });
			}

			setTimeout(() => {
				tree.DOMFocus();
				lifecycle.dispose(toDispose);
				container.removeChild(label.element);
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
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
				done(inputBox.isInputValid());
			}),
			label,
			styler
		];
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
	private state: FileViewletState;

	private contributedContextMenu: IMenu;

	constructor(state: FileViewletState,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */, keyboardSupport: false /* handled via IListService */ });

		this.contributedContextMenu = menuService.createMenu(MenuId.ExplorerContext, contextKeyService);

		this.state = state;
	}

	public onLeftClick(tree: ITree, stat: FileStat, event: IMouseEvent, origin: string = 'mouse'): boolean {
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
		const workspace = this.contextService.getWorkspace();
		if (workspace && isEqual(stat.resource.fsPath, workspace.resource.fsPath)) {
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
				this.openEditor(stat, { preserveFocus, sideBySide: event && (event.ctrlKey || event.metaKey), pinned: isDoubleClick });
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
					fillInActions(this.contributedContextMenu, { arg: stat.resource }, actions);
					return actions;
				});
			},
			getActionItem: this.state.actionProvider.getActionItem.bind(this.state.actionProvider, tree, stat),
			getKeyBinding: (a): ResolvedKeybinding => this.keybindingService.lookupKeybinding(a.id),
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

	public openEditor(stat: FileStat, options: { preserveFocus: boolean; sideBySide: boolean; pinned: boolean; }): void {
		if (stat && !stat.isDirectory) {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'explorer' });

			this.editorService.openEditor({ resource: stat.resource, options }, options.sideBySide).done(null, errors.onUnexpectedError);
		}
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
		if (glob.match(this.hiddenExpression, this.contextService.toWorkspaceRelativePath(stat.resource, true), siblingsFn)) {
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
		@IProgressService private progressService: IProgressService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IBackupFileService private backupFileService: IBackupFileService
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

		const isCopy = originalEvent && ((originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh));
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

				if (isEqual(source.resource.fsPath, target.resource.fsPath)) {
					return true; // Can not move anything onto itself
				}

				if (!isCopy && isEqual(paths.dirname(source.resource.fsPath), target.resource.fsPath)) {
					return true; // Can not move a file to the same parent unless we copy
				}

				if (isEqualOrParent(target.resource.fsPath, source.resource.fsPath, !isLinux /* ignorecase */)) {
					return true; // Can not move a parent folder into one of its children
				}

				return false;
			})) {
				return DRAG_OVER_REJECT;
			}
		}

		// All
		if (target.isDirectory) {
			return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY(true) : DRAG_OVER_ACCEPT_BUBBLE_DOWN(true);
		}

		const workspace = this.contextService.getWorkspace();
		if (workspace && !isEqual(target.resource.fsPath, workspace.resource.fsPath)) {
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
			const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

			promise = tree.expand(target).then(() => {

				// Reuse duplicate action if user copies
				if (isCopy) {
					return this.instantiationService.createInstance(DuplicateFileAction, tree, source, target).run();
				}

				const dirtyMoved: URI[] = [];

				// Success: load all files that are dirty again to restore their dirty contents
				// Error: discard any backups created during the process
				const onSuccess = () => TPromise.join(dirtyMoved.map(t => this.textModelResolverService.createModelReference(t)));
				const onError = (error?: Error, showError?: boolean) => {
					if (showError) {
						this.messageService.show(Severity.Error, error);
					}

					return TPromise.join(dirtyMoved.map(d => this.backupFileService.discardResourceBackup(d)));
				};

				// 1. check for dirty files that are being moved and backup to new target
				const dirty = this.textFileService.getDirty().filter(d => isEqualOrParent(d.fsPath, source.resource.fsPath, !isLinux /* ignorecase */));
				return TPromise.join(dirty.map(d => {
					let moved: URI;

					// If the dirty file itself got moved, just reparent it to the target folder
					if (isEqual(source.resource.fsPath, d.fsPath)) {
						moved = URI.file(paths.join(target.resource.fsPath, source.name));
					}

					// Otherwise, a parent of the dirty resource got moved, so we have to reparent more complicated. Example:
					else {
						moved = URI.file(paths.join(target.resource.fsPath, d.fsPath.substr(source.parent.resource.fsPath.length + 1)));
					}

					dirtyMoved.push(moved);

					const model = this.textFileService.models.get(d);

					return this.backupFileService.backupResource(moved, model.getValue(), model.getVersionId());
				}))

					// 2. soft revert all dirty since we have backed up their contents
					.then(() => this.textFileService.revertAll(dirty, { soft: true /* do not attempt to load content from disk */ }))

					// 3.) run the move operation
					.then(() => {
						const targetResource = URI.file(paths.join(target.resource.fsPath, source.name));
						let didHandleConflict = false;

						return this.fileService.moveFile(source.resource, targetResource).then(null, error => {

							// Conflict
							if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
								didHandleConflict = true;

								const confirm: IConfirmation = {
									message: nls.localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
									detail: nls.localize('irreversible', "This action is irreversible!"),
									primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace")
								};

								// Move with overwrite if the user confirms
								if (this.messageService.confirm(confirm)) {
									const targetDirty = this.textFileService.getDirty().filter(d => isEqualOrParent(d.fsPath, targetResource.fsPath, !isLinux /* ignorecase */));

									// Make sure to revert all dirty in target first to be able to overwrite properly
									return this.textFileService.revertAll(targetDirty, { soft: true /* do not attempt to load content from disk */ }).then(() => {

										// Then continue to do the move operation
										return this.fileService.moveFile(source.resource, targetResource, true).then(onSuccess, error => onError(error, true));
									});
								}

								return onError();
							}

							return onError(error, true);
						});
					})

					// 4.) resolve those that were dirty to load their previous dirty contents from disk
					.then(onSuccess, onError);
			}, errors.onUnexpectedError);
		}

		this.progressService.showWhile(promise, 800);

		promise.done(null, errors.onUnexpectedError);
	}
}
