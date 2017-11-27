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
import resources = require('vs/base/common/resources');
import errors = require('vs/base/common/errors');
import { isString } from 'vs/base/common/types';
import { IAction, ActionRunner as BaseActionRunner, IActionRunner } from 'vs/base/common/actions';
import comparers = require('vs/base/common/comparers');
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import glob = require('vs/base/common/glob');
import { FileLabel, IFileLabelOptions } from 'vs/workbench/browser/labels';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { IFilesConfiguration, SortOrder } from 'vs/workbench/parts/files/common/files';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationError, FileOperationResult, IFileService, FileKind } from 'vs/platform/files/common/files';
import { ResourceMap } from 'vs/base/common/map';
import { DuplicateFileAction, ImportFileAction, IEditableData, IFileViewletState } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { IDataSource, ITree, IAccessibilityProvider, IRenderer, ContextMenuEvent, ISorter, IFilter, IDragAndDropData, IDragOverReaction, DRAG_OVER_ACCEPT_BUBBLE_DOWN, DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY, DRAG_OVER_ACCEPT_BUBBLE_UP, DRAG_OVER_ACCEPT_BUBBLE_UP_COPY, DRAG_OVER_REJECT } from 'vs/base/parts/tree/browser/tree';
import { DesktopDragAndDropData, ExternalElementsDragAndDropData, SimpleFileResourceDragAndDrop } from 'vs/base/parts/tree/browser/treeDnd';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { FileStat, NewStatPlaceholder, Model } from 'vs/workbench/parts/files/common/explorerModel';
import { DragMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IConfirmation, Severity, IConfirmationResult } from 'vs/platform/message/common/message';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { getPathLabel } from 'vs/base/common/labels';
import { extractResources } from 'vs/workbench/browser/editor';
import { relative } from 'path';

export class FileDataSource implements IDataSource {
	constructor(
		@IProgressService private progressService: IProgressService,
		@IMessageService private messageService: IMessageService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService
	) { }

	public getId(tree: ITree, stat: FileStat | Model): string {
		if (stat instanceof Model) {
			return 'model';
		}

		return `${stat.root.resource.toString()}:${stat.getId()}`;
	}

	public hasChildren(tree: ITree, stat: FileStat | Model): boolean {
		return stat instanceof Model || (stat instanceof FileStat && stat.isDirectory);
	}

	public getChildren(tree: ITree, stat: FileStat | Model): TPromise<FileStat[]> {
		if (stat instanceof Model) {
			return TPromise.as(stat.roots);
		}

		// Return early if stat is already resolved
		if (stat.isDirectoryResolved) {
			return TPromise.as(stat.children);
		}

		// Resolve children and add to fileStat for future lookup
		else {

			// Resolve
			const promise = this.fileService.resolveFile(stat.resource, { resolveSingleChildDescendants: true }).then(dirStat => {

				// Convert to view model
				const modelDirStat = FileStat.create(dirStat, stat.root);

				// Add children to folder
				for (let i = 0; i < modelDirStat.children.length; i++) {
					stat.addChild(modelDirStat.children[i]);
				}

				stat.isDirectoryResolved = true;

				return stat.children;
			}, (e: any) => {
				stat.hasChildren = false;
				this.messageService.show(Severity.Error, e);

				return []; // we could not resolve any children because of an error
			});

			this.progressService.showWhile(promise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);

			return promise;
		}
	}

	public getParent(tree: ITree, stat: FileStat | Model): TPromise<FileStat> {
		if (!stat) {
			return TPromise.as(null); // can be null if nothing selected in the tree
		}

		// Return if root reached
		if (tree.getInput() === stat) {
			return TPromise.as(null);
		}

		// Return if parent already resolved
		if (stat instanceof FileStat && stat.parent) {
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

	public hasSecondaryActions(tree: ITree, stat: FileStat | Model): boolean {
		if (stat instanceof NewStatPlaceholder) {
			return false;
		}

		return super.hasSecondaryActions(tree, stat);
	}

	public getSecondaryActions(tree: ITree, stat: FileStat | Model): TPromise<IAction[]> {
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

	private static readonly ITEM_HEIGHT = 22;
	private static readonly FILE_TEMPLATE_ID = 'file';

	private state: FileViewletState;
	private config: IFilesConfiguration;
	private configListener: IDisposable;

	constructor(
		state: FileViewletState,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.state = state;
		this.config = this.configurationService.getValue<IFilesConfiguration>();
		this.configListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer')) {
				this.config = this.configurationService.getValue();
			}
		});
	}

	dispose(): void {
		this.configListener.dispose();
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
			templateData.label.element.style.display = 'flex';
			const extraClasses = ['explorer-item'];
			templateData.label.setFile(stat.resource, {
				hidePath: true,
				fileKind: stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE,
				extraClasses,
				fileDecorations: this.config.explorer.decorations
			});
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
		const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : (stat.isDirectory || (stat instanceof NewStatPlaceholder && stat.isDirectoryPlaceholder())) ? FileKind.FOLDER : FileKind.FILE;
		const labelOptions: IFileLabelOptions = { hidePath: true, hideLabel: true, fileKind, extraClasses };
		label.setFile(stat.resource, labelOptions);

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: editableData.validator
			},
			ariaLabel: nls.localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		const parent = resources.dirname(stat.resource);
		inputBox.onDidChange(value => {
			label.setFile(parent.with({ path: paths.join(parent.path, value) }), labelOptions); // update label icon while typing!
		});

		const value = stat.name || '';
		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
		inputBox.focus();

		const done = once((commit: boolean) => {
			tree.clearHighlight();

			if (commit && inputBox.value) {
				this.state.actionProvider.runAction(tree, stat, editableData.action, { value: inputBox.value });
			}

			const restoreFocus = document.activeElement === inputBox.inputElement; // https://github.com/Microsoft/vscode/issues/20269
			setTimeout(() => {
				if (restoreFocus) {
					tree.DOMFocus();
				}
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
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */, keyboardSupport: false /* handled via IListService */ });

		this.contributedContextMenu = menuService.createMenu(MenuId.ExplorerContext, contextKeyService);

		this.state = state;
	}

	public onLeftClick(tree: ITree, stat: FileStat | Model, event: IMouseEvent, origin: string = 'mouse'): boolean {
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
		if (stat instanceof Model) {
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
		tree.toggleExpansion(stat, event.altKey);

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

	public onContextMenu(tree: ITree, stat: FileStat | Model, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(stat);

		if (!this.state.actionProvider.hasSecondaryActions(tree, stat)) {
			return true;
		}

		const anchor = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => {
				return this.state.actionProvider.getSecondaryActions(tree, stat).then(actions => {
					fillInActions(this.contributedContextMenu, stat instanceof FileStat ? { arg: stat.resource } : null, actions);
					return actions;
				});
			},
			getActionItem: this.state.actionProvider.getActionItem.bind(this.state.actionProvider, tree, stat),
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
			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'explorer' });

			this.editorService.openEditor({ resource: stat.resource, options }, options.sideBySide).done(null, errors.onUnexpectedError);
		}
	}
}

// Explorer Sorter
export class FileSorter implements ISorter {
	private toDispose: IDisposable[];
	private sortOrder: SortOrder;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		this.toDispose = [];

		this.updateSortOrder();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => this.updateSortOrder()));
	}

	private updateSortOrder(): void {
		this.sortOrder = this.configurationService.getValue('explorer.sortOrder') || 'default';
	}

	public compare(tree: ITree, statA: FileStat, statB: FileStat): number {

		// Do not sort roots
		if (statA.isRoot) {
			if (statB.isRoot) {
				return this.contextService.getWorkspaceFolder(statA.resource).index - this.contextService.getWorkspaceFolder(statB.resource).index;
			}

			return -1;
		}

		if (statB.isRoot) {
			return 1;
		}

		// Sort Directories
		switch (this.sortOrder) {
			case 'type':
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				if (statA.isDirectory && statB.isDirectory) {
					return comparers.compareFileNames(statA.name, statB.name);
				}

				break;

			case 'filesFirst':
				if (statA.isDirectory && !statB.isDirectory) {
					return 1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return -1;
				}

				break;

			case 'mixed':
				break; // not sorting when "mixed" is on

			default: /* 'default', 'modified' */
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				break;
		}

		// Sort "New File/Folder" placeholders
		if (statA instanceof NewStatPlaceholder) {
			return -1;
		}

		if (statB instanceof NewStatPlaceholder) {
			return 1;
		}

		// Sort Files
		switch (this.sortOrder) {
			case 'type':
				return comparers.compareFileExtensions(statA.name, statB.name);

			case 'modified':
				if (statA.mtime !== statB.mtime) {
					return statA.mtime < statB.mtime ? 1 : -1;
				}

				return comparers.compareFileNames(statA.name, statB.name);

			default: /* 'default', 'mixed', 'filesFirst' */
				return comparers.compareFileNames(statA.name, statB.name);
		}
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

// Explorer Filter
export class FileFilter implements IFilter {

	private static readonly MAX_SIBLINGS_FILTER_THRESHOLD = 2000;

	private hiddenExpressionPerRoot: Map<string, glob.IExpression>;
	private workspaceFolderChangeListener: IDisposable;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.hiddenExpressionPerRoot = new Map<string, glob.IExpression>();

		this.registerListeners();
	}

	public registerListeners(): void {
		this.workspaceFolderChangeListener = this.contextService.onDidChangeWorkspaceFolders(() => this.updateConfiguration());
	}

	public updateConfiguration(): boolean {
		let needsRefresh = false;
		this.contextService.getWorkspace().folders.forEach(folder => {
			const configuration = this.configurationService.getValue<IFilesConfiguration>({ resource: folder.uri });
			const excludesConfig = (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
			needsRefresh = needsRefresh || !objects.equals(this.hiddenExpressionPerRoot.get(folder.uri.toString()), excludesConfig);
			this.hiddenExpressionPerRoot.set(folder.uri.toString(), objects.deepClone(excludesConfig)); // do not keep the config, as it gets mutated under our hoods
		});

		return needsRefresh;
	}

	public isVisible(tree: ITree, stat: FileStat): boolean {
		return this.doIsVisible(stat);
	}

	private doIsVisible(stat: FileStat): boolean {
		if (stat instanceof NewStatPlaceholder || stat.isRoot) {
			return true; // always visible
		}

		// Workaround for O(N^2) complexity (https://github.com/Microsoft/vscode/issues/9962)
		let siblings = stat.parent && stat.parent.children && stat.parent.children;
		if (siblings && siblings.length > FileFilter.MAX_SIBLINGS_FILTER_THRESHOLD) {
			siblings = void 0;
		}

		// Hide those that match Hidden Patterns
		const siblingsFn = () => siblings && siblings.map(c => c.name);
		const expression = this.hiddenExpressionPerRoot.get(stat.root.resource.toString()) || Object.create(null);
		if (glob.match(expression, paths.normalize(relative(stat.root.resource.fsPath, stat.resource.fsPath), true), siblingsFn)) {
			return false; // hidden through pattern
		}

		return true;
	}

	public dispose(): void {
		this.workspaceFolderChangeListener = dispose(this.workspaceFolderChangeListener);
	}
}

// Explorer Drag And Drop Controller
export class FileDragAndDrop extends SimpleFileResourceDragAndDrop {

	private static readonly CONFIRM_DND_SETTING_KEY = 'explorer.confirmDragAndDrop';

	private toDispose: IDisposable[];
	private dropEnabled: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
		@IBackupFileService private backupFileService: IBackupFileService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
	) {
		super(stat => this.statToResource(stat));

		this.toDispose = [];

		this.updateDropEnablement();

		this.registerListeners();
	}

	private statToResource(stat: FileStat): URI {
		if (stat.isRoot) {
			return null; // Can not move root folder
		}

		if (stat.isDirectory) {
			return URI.from({ scheme: 'folder', path: stat.resource.path }); // indicates that we are dragging a folder
		}

		return stat.resource;
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => this.updateDropEnablement()));
	}

	private updateDropEnablement(): void {
		this.dropEnabled = this.configurationService.getValue('explorer.enableDragAndDrop');
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

		// Apply some datatransfer types to allow for dragging the element outside of the application
		if (source) {
			if (!source.isDirectory) {
				originalEvent.dataTransfer.setData('DownloadURL', [MIME_BINARY, source.name, source.resource.toString()].join(':'));
			}

			originalEvent.dataTransfer.setData('text/plain', getPathLabel(source.resource));
		}
	}

	public onDragOver(tree: ITree, data: IDragAndDropData, target: FileStat | Model, originalEvent: DragMouseEvent): IDragOverReaction {
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
			if (target instanceof Model) {
				return DRAG_OVER_REJECT;
			}

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

				if (!isCopy && resources.dirname(source.resource).toString() === target.resource.toString()) {
					return true; // Can not move a file to the same parent unless we copy
				}

				if (resources.isEqualOrParent(target.resource, source.resource, !isLinux /* ignorecase */)) {
					return true; // Can not move a parent folder into one of its children
				}

				return false;
			})) {
				return DRAG_OVER_REJECT;
			}
		}

		// All (target = model)
		if (target instanceof Model) {
			return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY(false) : DRAG_OVER_REJECT; // can only drop folders to workspace
		}

		// All (target = file/folder)
		else {
			if (target.isDirectory) {
				return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY(true) : DRAG_OVER_ACCEPT_BUBBLE_DOWN(true);
			}

			if (this.contextService.getWorkspace().folders.every(folder => folder.uri.toString() !== target.resource.toString())) {
				return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_UP_COPY : DRAG_OVER_ACCEPT_BUBBLE_UP;
			}
		}

		return DRAG_OVER_REJECT;
	}

	public drop(tree: ITree, data: IDragAndDropData, target: FileStat | Model, originalEvent: DragMouseEvent): void {
		let promise: TPromise<void> = TPromise.as(null);

		// Desktop DND (Import file)
		if (data instanceof DesktopDragAndDropData) {
			promise = this.handleExternalDrop(tree, data, target, originalEvent);
		}

		// In-Explorer DND (Move/Copy file)
		else {
			if (target instanceof FileStat) {
				promise = this.handleExplorerDrop(tree, data, target, originalEvent);
			}
		}

		promise.done(null, errors.onUnexpectedError);
	}

	private handleExternalDrop(tree: ITree, data: DesktopDragAndDropData, target: FileStat | Model, originalEvent: DragMouseEvent): TPromise<void> {
		const droppedResources = extractResources(originalEvent.browserEvent as DragEvent, true);

		// Check for dropped external files to be folders
		return this.fileService.resolveFiles(droppedResources).then(result => {

			// Pass focus to window
			this.windowService.focusWindow();

			// Handle folders by adding to workspace if we are in workspace context
			const folders = result.filter(r => r.success && r.stat.isDirectory).map(result => ({ uri: result.stat.resource }));
			if (folders.length > 0) {

				// If we are in no-workspace context, ask for confirmation to create a workspace
				let confirmed = true;
				if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
					confirmed = this.messageService.confirmSync({
						message: folders.length > 1 ? nls.localize('dropFolders', "Do you want to add the folders to the workspace?") : nls.localize('dropFolder', "Do you want to add the folder to the workspace?"),
						type: 'question',
						primaryButton: folders.length > 1 ? nls.localize('addFolders', "&&Add Folders") : nls.localize('addFolder', "&&Add Folder")
					});
				}

				if (confirmed) {
					return this.workspaceEditingService.addFolders(folders);
				}
			}

			// Handle dropped files (only support FileStat as target)
			else if (target instanceof FileStat) {
				const importAction = this.instantiationService.createInstance(ImportFileAction, tree, target, null);

				return importAction.run(droppedResources.map(res => res.resource));
			}

			return void 0;
		});
	}

	private handleExplorerDrop(tree: ITree, data: IDragAndDropData, target: FileStat, originalEvent: DragMouseEvent): TPromise<void> {
		const source: FileStat = data.getData()[0];
		const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

		let confirmPromise: TPromise<IConfirmationResult>;

		// Handle confirm setting
		const confirmDragAndDrop = !isCopy && this.configurationService.getValue<boolean>(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
		if (confirmDragAndDrop) {
			confirmPromise = this.messageService.confirm({
				message: nls.localize('confirmMove', "Are you sure you want to move '{0}'?", source.name),
				checkbox: {
					label: nls.localize('doNotAskAgain', "Do not ask me again")
				},
				type: 'question',
				primaryButton: nls.localize({ key: 'moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
			});
		} else {
			confirmPromise = TPromise.as({ confirmed: true } as IConfirmationResult);
		}

		return confirmPromise.then(confirmation => {

			// Check for confirmation checkbox
			let updateConfirmSettingsPromise: TPromise<void> = TPromise.as(void 0);
			if (confirmation.confirmed && confirmation.checkboxChecked === true) {
				updateConfirmSettingsPromise = this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false, ConfigurationTarget.USER);
			}

			return updateConfirmSettingsPromise.then(() => {
				if (confirmation.confirmed) {
					return this.doHandleExplorerDrop(tree, data, source, target, isCopy);
				}

				return TPromise.as(void 0);
			});
		});
	}

	private doHandleExplorerDrop(tree: ITree, data: IDragAndDropData, source: FileStat, target: FileStat, isCopy: boolean): TPromise<void> {
		return tree.expand(target).then(() => {

			// Reuse duplicate action if user copies
			if (isCopy) {
				return this.instantiationService.createInstance(DuplicateFileAction, tree, source, target).run();
			}

			const dirtyMoved: URI[] = [];

			// Success: load all files that are dirty again to restore their dirty contents
			// Error: discard any backups created during the process
			const onSuccess = () => TPromise.join(dirtyMoved.map(t => this.textFileService.models.loadOrCreate(t)));
			const onError = (error?: Error, showError?: boolean) => {
				if (showError) {
					this.messageService.show(Severity.Error, error);
				}

				return TPromise.join(dirtyMoved.map(d => this.backupFileService.discardResourceBackup(d)));
			};

			// 1. check for dirty files that are being moved and backup to new target
			const dirty = this.textFileService.getDirty().filter(d => resources.isEqualOrParent(d, source.resource, !isLinux /* ignorecase */));
			return TPromise.join(dirty.map(d => {
				let moved: URI;

				// If the dirty file itself got moved, just reparent it to the target folder
				if (source.resource.toString() === d.toString()) {
					moved = target.resource.with({ path: paths.join(target.resource.path, source.name) });
				}

				// Otherwise, a parent of the dirty resource got moved, so we have to reparent more complicated. Example:
				else {
					moved = target.resource.with({ path: paths.join(target.resource.path, d.path.substr(source.parent.resource.path.length + 1)) });
				}

				dirtyMoved.push(moved);

				const model = this.textFileService.models.get(d);

				return this.backupFileService.backupResource(moved, model.getValue(), model.getVersionId());
			}))

				// 2. soft revert all dirty since we have backed up their contents
				.then(() => this.textFileService.revertAll(dirty, { soft: true /* do not attempt to load content from disk */ }))

				// 3.) run the move operation
				.then(() => {
					const targetResource = target.resource.with({ path: paths.join(target.resource.path, source.name) });

					return this.fileService.moveFile(source.resource, targetResource).then(null, error => {

						// Conflict
						if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
							const confirm: IConfirmation = {
								message: nls.localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
								detail: nls.localize('irreversible', "This action is irreversible!"),
								primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
								type: 'warning'
							};

							// Move with overwrite if the user confirms
							if (this.messageService.confirmSync(confirm)) {
								const targetDirty = this.textFileService.getDirty().filter(d => resources.isEqualOrParent(d, targetResource, !isLinux /* ignorecase */));

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
}
