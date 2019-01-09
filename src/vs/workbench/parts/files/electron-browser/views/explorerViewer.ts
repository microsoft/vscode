/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import * as DOM from 'vs/base/browser/dom';
import * as path from 'path';
import { URI } from 'vs/base/common/uri';
import { once } from 'vs/base/common/functional';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import * as errors from 'vs/base/common/errors';
import { IAction, ActionRunner as BaseActionRunner, IActionRunner } from 'vs/base/common/actions';
import * as comparers from 'vs/base/common/comparers';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import * as glob from 'vs/base/common/glob';
import { ResourceLabels, IFileLabelOptions, IResourceLabel } from 'vs/workbench/browser/labels';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IFilesConfiguration, SortOrder } from 'vs/workbench/parts/files/common/files';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperationError, FileOperationResult, IFileService, FileKind } from 'vs/platform/files/common/files';
import { DuplicateFileAction, AddFilesAction, IEditableData, IFileViewletState, FileCopiedContext } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { IDataSource, ITree, IAccessibilityProvider, IRenderer, ContextMenuEvent, ISorter, IFilter, IDragOverReaction, DRAG_OVER_ACCEPT_BUBBLE_DOWN, DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY, DRAG_OVER_ACCEPT_BUBBLE_UP, DRAG_OVER_ACCEPT_BUBBLE_UP_COPY, DRAG_OVER_REJECT } from 'vs/base/parts/tree/browser/tree';
import { DesktopDragAndDropData, ExternalElementsDragAndDropData } from 'vs/base/parts/tree/browser/treeDnd';
import { ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { ExplorerItem, NewStatPlaceholder, Model } from 'vs/workbench/parts/files/common/explorerModel';
import { DragMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { extractResources, SimpleFileResourceDragAndDrop, CodeDataTransfers, fillResourceDataTransfers } from 'vs/workbench/browser/dnd';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { DataTransfers, IDragAndDropData } from 'vs/base/browser/dnd';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { rtrim } from 'vs/base/common/strings';
import { IDialogService, IConfirmationResult, IConfirmation, getConfirmMessage } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';

export class FileDataSource implements IDataSource {
	constructor(
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileService private readonly fileService: IFileService,
		@IPartService private readonly partService: IPartService
	) { }

	public getId(tree: ITree, stat: ExplorerItem | Model): string {
		if (stat instanceof Model) {
			return 'model';
		}

		return `${stat.root.resource.toString()}:${stat.getId()}`;
	}

	public hasChildren(tree: ITree, stat: ExplorerItem | Model): boolean {
		return stat instanceof Model || (stat instanceof ExplorerItem && (stat.isDirectory || stat.isRoot));
	}

	public getChildren(tree: ITree, stat: ExplorerItem | Model): Promise<ExplorerItem[]> {
		if (stat instanceof Model) {
			return Promise.resolve(stat.roots);
		}

		// Return early if stat is already resolved
		if (stat.isDirectoryResolved) {
			return Promise.resolve(stat.getChildrenArray());
		}

		// Resolve children and add to fileStat for future lookup
		else {

			// Resolve
			const promise = this.fileService.resolveFile(stat.resource, { resolveSingleChildDescendants: true }).then(dirStat => {

				// Convert to view model
				const modelDirStat = ExplorerItem.create(dirStat, stat.root);

				// Add children to folder
				const children = modelDirStat.getChildrenArray();
				if (children) {
					children.forEach(child => {
						stat.addChild(child);
					});
				}

				stat.isDirectoryResolved = true;

				return stat.getChildrenArray();
			}, (e: any) => {
				// Do not show error for roots since we already use an explorer decoration to notify user
				if (!(stat instanceof ExplorerItem && stat.isRoot)) {
					this.notificationService.error(e);
				}

				return []; // we could not resolve any children because of an error
			});

			this.progressService.showWhile(promise, this.partService.isRestored() ? 800 : 3200 /* less ugly initial startup */);

			return promise;
		}
	}

	public getParent(tree: ITree, stat: ExplorerItem | Model): Promise<ExplorerItem | null> {
		if (!stat) {
			return Promise.resolve(null); // can be null if nothing selected in the tree
		}

		// Return if root reached
		if (tree.getInput() === stat) {
			return Promise.resolve(null);
		}

		// Return if parent already resolved
		if (stat instanceof ExplorerItem && stat.parent) {
			return Promise.resolve(stat.parent);
		}

		// We never actually resolve the parent from the disk for performance reasons. It wouldnt make
		// any sense to resolve parent by parent with requests to walk up the chain. Instead, the explorer
		// makes sure to properly resolve a deep path to a specific file and merges the result with the model.
		return Promise.resolve(null);
	}
}

export class FileViewletState implements IFileViewletState {
	private editableStats: Map<ExplorerItem, IEditableData>;

	constructor() {
		this.editableStats = new Map<ExplorerItem, IEditableData>();
	}

	public getEditableData(stat: ExplorerItem): IEditableData {
		return this.editableStats.get(stat);
	}

	public setEditable(stat: ExplorerItem, editableData: IEditableData): void {
		if (editableData) {
			this.editableStats.set(stat, editableData);
		}
	}

	public clearEditable(stat: ExplorerItem): void {
		this.editableStats.delete(stat);
	}
}

export class ActionRunner extends BaseActionRunner implements IActionRunner {
	private viewletState: FileViewletState;

	constructor(state: FileViewletState) {
		super();

		this.viewletState = state;
	}

	public run(action: IAction, context?: any): Promise<any> {
		return super.run(action, { viewletState: this.viewletState });
	}
}

export interface IFileTemplateData {
	elementDisposable: IDisposable;
	label: IResourceLabel;
	container: HTMLElement;
}

// Explorer Renderer
export class FileRenderer implements IRenderer {

	private static readonly ITEM_HEIGHT = 22;
	private static readonly FILE_TEMPLATE_ID = 'file';

	private config: IFilesConfiguration;
	private configListener: IDisposable;

	constructor(
		private state: FileViewletState,
		private labels: ResourceLabels,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
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
		templateData.elementDisposable.dispose();
		templateData.label.dispose();
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): IFileTemplateData {
		const elementDisposable = Disposable.None;
		const label = this.labels.create(container);

		return { elementDisposable, label, container };
	}

	public renderElement(tree: ITree, stat: ExplorerItem, templateId: string, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();

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

			templateData.elementDisposable = templateData.label.onDidRender(() => {
				tree.updateWidth(stat);
			});
		}

		// Input Box
		else {
			templateData.label.element.style.display = 'none';
			this.renderInputBox(templateData.container, tree, stat, editableData);
			templateData.elementDisposable = Disposable.None;
		}
	}

	private renderInputBox(container: HTMLElement, tree: ITree, stat: ExplorerItem, editableData: IEditableData): void {

		// Use a file label only for the icon next to the input box
		const label = this.labels.create(container);
		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : (stat.isDirectory || (stat instanceof NewStatPlaceholder && stat.isDirectoryPlaceholder())) ? FileKind.FOLDER : FileKind.FILE;
		const labelOptions: IFileLabelOptions = { hidePath: true, hideLabel: true, fileKind, extraClasses };

		const parent = stat.name ? resources.dirname(stat.resource) : stat.resource;
		const value = stat.name || '';

		label.setFile(resources.joinPath(parent, value || ' '), labelOptions); // Use icon for ' ' if name is empty.

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: editableData.validator
			},
			ariaLabel: nls.localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		inputBox.onDidChange(value => {
			label.setFile(resources.joinPath(parent, value || ' '), labelOptions); // update label icon while typing!
		});

		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
		inputBox.focus();

		const done = once((commit: boolean, blur: boolean) => {
			tree.clearHighlight();
			label.element.style.display = 'none';

			if (commit && inputBox.value) {
				editableData.action.run({ value: inputBox.value });
			}

			setTimeout(() => {
				if (!blur) { // https://github.com/Microsoft/vscode/issues/20269
					tree.domFocus();
				}
				dispose(toDispose);
				container.removeChild(label.element);
			}, 0);
		});

		const toDispose = [
			inputBox,
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					if (inputBox.validate()) {
						done(true, false);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false, false);
				}
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e: IKeyboardEvent) => {
				const initialRelPath: string = path.relative(stat.root.resource.path, stat.parent.resource.path);
				let projectFolderName: string = '';
				if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
					projectFolderName = paths.basename(stat.root.resource.path);	// show root folder name in multi-folder project
				}
				this.showInputMessage(inputBox, initialRelPath, projectFolderName, editableData.action.id);
			}),
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
				done(inputBox.isInputValid(), true);
			}),
			label,
			styler
		];
	}

	private showInputMessage(inputBox: InputBox, initialRelPath: string, projectFolderName: string = '', actionID: string) {
		if (inputBox.validate()) {
			const value = inputBox.value;
			if (value && /.[\\/]./.test(value)) {	// only show if there's at least one slash enclosed in the string
				let displayPath = path.normalize(path.join(projectFolderName, initialRelPath, value));
				displayPath = rtrim(displayPath, paths.nativeSep);

				const indexLastSlash: number = displayPath.lastIndexOf(paths.nativeSep);
				const name: string = displayPath.substring(indexLastSlash + 1);
				const leadingPathPart: string = displayPath.substring(0, indexLastSlash);

				let msg: string;
				switch (actionID) {
					case 'workbench.files.action.createFileFromExplorer':
						msg = nls.localize('createFileFromExplorerInfoMessage', "Create file **{0}** in **{1}**", name, leadingPathPart);
						break;
					case 'workbench.files.action.renameFile':
						msg = nls.localize('renameFileFromExplorerInfoMessage', "Move and rename to **{0}**", displayPath);
						break;
					case 'workbench.files.action.createFolderFromExplorer':	// fallthrough
					default:
						msg = nls.localize('createFolderFromExplorerInfoMessage', "Create folder **{0}** in **{1}**", name, leadingPathPart);
				}

				inputBox.showMessage({
					type: MessageType.INFO,
					content: msg,
					formatContent: true
				});
			} else if (value && /^\s|\s$/.test(value)) {
				inputBox.showMessage({
					content: nls.localize('whitespace', "Leading or trailing whitespace detected"),
					formatContent: true,
					type: MessageType.WARNING
				});
			} else {	// fixes #46744: inputbox hides again if all slashes are removed
				inputBox.hideMessage();
			}
		}
	}
}

// Explorer Accessibility Provider
export class FileAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, stat: ExplorerItem): string {
		return stat.name;
	}
}

// Explorer Controller
export class FileController extends WorkbenchTreeController implements IDisposable {
	private fileCopiedContextKey: IContextKey<boolean>;
	private contributedContextMenu: IMenu;
	private toDispose: IDisposable[];
	private previousSelectionRangeStop: ExplorerItem;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */ }, configurationService);

		this.fileCopiedContextKey = FileCopiedContext.bindTo(contextKeyService);
		this.toDispose = [];
	}

	public onLeftClick(tree: WorkbenchTree, stat: ExplorerItem | Model, event: IMouseEvent, origin: string = 'mouse'): boolean {
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
		tree.domFocus();
		if (stat instanceof NewStatPlaceholder) {
			return true;
		}

		// Allow to multiselect
		if ((tree.useAltAsMultipleSelectionModifier && event.altKey) || !tree.useAltAsMultipleSelectionModifier && (event.ctrlKey || event.metaKey)) {
			const selection = tree.getSelection();
			this.previousSelectionRangeStop = undefined;
			if (selection.indexOf(stat) >= 0) {
				tree.setSelection(selection.filter(s => s !== stat));
			} else {
				tree.setSelection(selection.concat(stat));
				tree.setFocus(stat, payload);
			}
		}

		// Allow to unselect
		else if (event.shiftKey) {
			const focus = tree.getFocus();
			if (focus) {
				if (this.previousSelectionRangeStop) {
					tree.deselectRange(stat, this.previousSelectionRangeStop);
				}
				tree.selectRange(focus, stat, payload);
				this.previousSelectionRangeStop = stat;
			}
		}

		// Select, Focus and open files
		else {

			// Expand / Collapse
			if (isDoubleClick || this.openOnSingleClick || this.isClickOnTwistie(event)) {
				tree.toggleExpansion(stat, event.altKey);
				this.previousSelectionRangeStop = undefined;
			}

			const preserveFocus = !isDoubleClick;
			tree.setFocus(stat, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to editor, we need to prevent default
			}

			tree.setSelection([stat], payload);

			if (!stat.isDirectory && (isDoubleClick || this.openOnSingleClick)) {
				let sideBySide = false;
				if (event) {
					sideBySide = tree.useAltAsMultipleSelectionModifier ? (event.ctrlKey || event.metaKey) : event.altKey;
				}

				this.openEditor(stat, { preserveFocus, sideBySide, pinned: isDoubleClick });
			}
		}

		return true;
	}

	public onMouseMiddleClick(tree: WorkbenchTree, element: ExplorerItem | Model, event: IMouseEvent): boolean {
		let sideBySide = false;
		if (event) {
			sideBySide = tree.useAltAsMultipleSelectionModifier ? (event.ctrlKey || event.metaKey) : event.altKey;
		}
		if (element instanceof ExplorerItem && !element.isDirectory) {
			this.openEditor(element, { preserveFocus: true, sideBySide, pinned: true });
		}

		return true;
	}

	public onContextMenu(tree: WorkbenchTree, stat: ExplorerItem | Model, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(stat);

		// update dynamic contexts
		this.fileCopiedContextKey.set(this.clipboardService.hasResources());

		if (!this.contributedContextMenu) {
			this.contributedContextMenu = this.menuService.createMenu(MenuId.ExplorerContext, tree.contextKeyService);
			this.toDispose.push(this.contributedContextMenu);
		}

		const anchor = { x: event.posx, y: event.posy };
		const selection = tree.getSelection();
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => {
				const actions: IAction[] = [];
				fillInContextMenuActions(this.contributedContextMenu, { arg: stat instanceof ExplorerItem ? stat.resource : {}, shouldForwardArgs: true }, actions, this.contextMenuService);
				return actions;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.domFocus();
				}
			},
			getActionsContext: () => selection && selection.indexOf(stat) >= 0
				? selection.map((fs: ExplorerItem) => fs.resource)
				: stat instanceof ExplorerItem ? [stat.resource] : []
		});

		return true;
	}

	public openEditor(stat: ExplorerItem, options: { preserveFocus: boolean; sideBySide: boolean; pinned: boolean; }): void {
		if (stat && !stat.isDirectory) {
			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'explorer' });

			this.editorService.openEditor({ resource: stat.resource, options }, options.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
		}
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

// Explorer Sorter
export class FileSorter implements ISorter {
	private toDispose: IDisposable[];
	private sortOrder: SortOrder;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
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

	public compare(tree: ITree, statA: ExplorerItem, statB: ExplorerItem): number {

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
interface CachedParsedExpression {
	original: glob.IExpression;
	parsed: glob.ParsedExpression;
}

export class FileFilter implements IFilter {

	private hiddenExpressionPerRoot: Map<string, CachedParsedExpression>;
	private workspaceFolderChangeListener: IDisposable;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.hiddenExpressionPerRoot = new Map<string, CachedParsedExpression>();

		this.registerListeners();
	}

	public registerListeners(): void {
		this.workspaceFolderChangeListener = this.contextService.onDidChangeWorkspaceFolders(() => this.updateConfiguration());
	}

	public updateConfiguration(): boolean {
		let needsRefresh = false;
		this.contextService.getWorkspace().folders.forEach(folder => {
			const configuration = this.configurationService.getValue<IFilesConfiguration>({ resource: folder.uri });
			const excludesConfig: glob.IExpression = (configuration && configuration.files && configuration.files.exclude) || Object.create(null);

			if (!needsRefresh) {
				const cached = this.hiddenExpressionPerRoot.get(folder.uri.toString());
				needsRefresh = !cached || !objects.equals(cached.original, excludesConfig);
			}

			const excludesConfigCopy = objects.deepClone(excludesConfig); // do not keep the config, as it gets mutated under our hoods

			this.hiddenExpressionPerRoot.set(folder.uri.toString(), { original: excludesConfigCopy, parsed: glob.parse(excludesConfigCopy) } as CachedParsedExpression);
		});

		return needsRefresh;
	}

	public isVisible(tree: ITree, stat: ExplorerItem): boolean {
		return this.doIsVisible(stat);
	}

	private doIsVisible(stat: ExplorerItem): boolean {
		if (stat instanceof NewStatPlaceholder || stat.isRoot) {
			return true; // always visible
		}

		// Hide those that match Hidden Patterns
		const cached = this.hiddenExpressionPerRoot.get(stat.root.resource.toString());
		if (cached && cached.parsed(paths.normalize(path.relative(stat.root.resource.path, stat.resource.path), true), stat.name, name => !!stat.parent.getChild(name))) {
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
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWindowService private readonly windowService: IWindowService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService
	) {
		super(stat => this.statToResource(stat), instantiationService);

		this.toDispose = [];

		this.updateDropEnablement();

		this.registerListeners();
	}

	private statToResource(stat: ExplorerItem): URI {
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
		const sources: ExplorerItem[] = data.getData();
		if (sources && sources.length) {

			// When dragging folders, make sure to collapse them to free up some space
			sources.forEach(s => {
				if (s.isDirectory && tree.isExpanded(s)) {
					tree.collapse(s, false);
				}
			});

			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(fillResourceDataTransfers, sources, originalEvent);

			// The only custom data transfer we set from the explorer is a file transfer
			// to be able to DND between multiple code file explorers across windows
			const fileResources = sources.filter(s => !s.isDirectory && s.resource.scheme === Schemas.file).map(r => r.resource.fsPath);
			if (fileResources.length) {
				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
			}
		}
	}

	public onDragOver(tree: ITree, data: IDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): IDragOverReaction {
		if (!this.dropEnabled) {
			return DRAG_OVER_REJECT;
		}

		const isCopy = originalEvent && ((originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh));
		const fromDesktop = data instanceof DesktopDragAndDropData;

		// Desktop DND
		if (fromDesktop) {
			const types: string[] = originalEvent.dataTransfer.types;
			const typesArray: string[] = [];
			for (const t of types) {
				typesArray.push(t.toLowerCase()); // somehow the types are lowercase
			}

			if (typesArray.indexOf(DataTransfers.FILES.toLowerCase()) === -1 && typesArray.indexOf(CodeDataTransfers.FILES.toLowerCase()) === -1) {
				return DRAG_OVER_REJECT;
			}
		}

		// Other-Tree DND
		else if (data instanceof ExternalElementsDragAndDropData) {
			return DRAG_OVER_REJECT;
		}

		// In-Explorer DND
		else {
			const sources: ExplorerItem[] = data.getData();
			if (target instanceof Model) {
				if (sources[0].isRoot) {
					return DRAG_OVER_ACCEPT_BUBBLE_DOWN(false);
				}

				return DRAG_OVER_REJECT;
			}

			if (!Array.isArray(sources)) {
				return DRAG_OVER_REJECT;
			}

			if (sources.some((source) => {
				if (source instanceof NewStatPlaceholder) {
					return true; // NewStatPlaceholders can not be moved
				}

				if (source.isRoot && target instanceof ExplorerItem && !target.isRoot) {
					return true; // Root folder can not be moved to a non root file stat.
				}

				if (source.resource.toString() === target.resource.toString()) {
					return true; // Can not move anything onto itself
				}

				if (source.isRoot && target instanceof ExplorerItem && target.isRoot) {
					// Disable moving workspace roots in one another
					return false;
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
				if (target.isReadonly) {
					return DRAG_OVER_REJECT;
				}
				return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY(true) : DRAG_OVER_ACCEPT_BUBBLE_DOWN(true);
			}

			if (this.contextService.getWorkspace().folders.every(folder => folder.uri.toString() !== target.resource.toString())) {
				return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_UP_COPY : DRAG_OVER_ACCEPT_BUBBLE_UP;
			}
		}

		return DRAG_OVER_REJECT;
	}

	public drop(tree: ITree, data: IDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): void {

		// Desktop DND (Import file)
		if (data instanceof DesktopDragAndDropData) {
			this.handleExternalDrop(tree, data, target, originalEvent);
		}

		// In-Explorer DND (Move/Copy file)
		else {
			this.handleExplorerDrop(tree, data, target, originalEvent);
		}
	}

	private handleExternalDrop(tree: ITree, data: DesktopDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): Promise<void> {
		const droppedResources = extractResources(originalEvent.browserEvent as DragEvent, true);

		// Check for dropped external files to be folders
		return this.fileService.resolveFiles(droppedResources).then(result => {

			// Pass focus to window
			this.windowService.focusWindow();

			// Handle folders by adding to workspace if we are in workspace context
			const folders = result.filter(r => r.success && r.stat.isDirectory).map(result => ({ uri: result.stat.resource }));
			if (folders.length > 0) {

				// If we are in no-workspace context, ask for confirmation to create a workspace
				let confirmedPromise: Promise<IConfirmationResult> = Promise.resolve({ confirmed: true });
				if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
					confirmedPromise = this.dialogService.confirm({
						message: folders.length > 1 ? nls.localize('dropFolders', "Do you want to add the folders to the workspace?") : nls.localize('dropFolder', "Do you want to add the folder to the workspace?"),
						type: 'question',
						primaryButton: folders.length > 1 ? nls.localize('addFolders', "&&Add Folders") : nls.localize('addFolder', "&&Add Folder")
					});
				}

				return confirmedPromise.then(res => {
					if (res.confirmed) {
						return this.workspaceEditingService.addFolders(folders);
					}

					return undefined;
				});
			}

			// Handle dropped files (only support FileStat as target)
			else if (target instanceof ExplorerItem && !target.isReadonly) {
				const addFilesAction = this.instantiationService.createInstance(AddFilesAction, tree, target, null);

				return addFilesAction.run(droppedResources.map(res => res.resource));
			}

			return undefined;
		});
	}

	private handleExplorerDrop(tree: ITree, data: IDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): Promise<void> {
		const sources: ExplorerItem[] = resources.distinctParents(data.getData(), s => s.resource);
		const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

		let confirmPromise: Promise<IConfirmationResult>;

		// Handle confirm setting
		const confirmDragAndDrop = !isCopy && this.configurationService.getValue<boolean>(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
		if (confirmDragAndDrop) {
			confirmPromise = this.dialogService.confirm({
				message: sources.length > 1 && sources.every(s => s.isRoot) ? nls.localize('confirmRootsMove', "Are you sure you want to change the order of multiple root folders in your workspace?")
					: sources.length > 1 ? getConfirmMessage(nls.localize('confirmMultiMove', "Are you sure you want to move the following {0} files?", sources.length), sources.map(s => s.resource))
						: sources[0].isRoot ? nls.localize('confirmRootMove', "Are you sure you want to change the order of root folder '{0}' in your workspace?", sources[0].name)
							: nls.localize('confirmMove', "Are you sure you want to move '{0}'?", sources[0].name),
				checkbox: {
					label: nls.localize('doNotAskAgain', "Do not ask me again")
				},
				type: 'question',
				primaryButton: nls.localize({ key: 'moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
			});
		} else {
			confirmPromise = Promise.resolve({ confirmed: true } as IConfirmationResult);
		}

		return confirmPromise.then(res => {

			// Check for confirmation checkbox
			let updateConfirmSettingsPromise: Promise<void> = Promise.resolve(undefined);
			if (res.confirmed && res.checkboxChecked === true) {
				updateConfirmSettingsPromise = this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false, ConfigurationTarget.USER);
			}

			return updateConfirmSettingsPromise.then(() => {
				if (res.confirmed) {
					const rootDropPromise = this.doHandleRootDrop(sources.filter(s => s.isRoot), target);
					return Promise.all(sources.filter(s => !s.isRoot).map(source => this.doHandleExplorerDrop(tree, source, target, isCopy)).concat(rootDropPromise)).then(() => undefined);
				}

				return Promise.resolve(undefined);
			});
		});
	}

	private doHandleRootDrop(roots: ExplorerItem[], target: ExplorerItem | Model): Promise<void> {
		if (roots.length === 0) {
			return Promise.resolve(undefined);
		}

		const folders = this.contextService.getWorkspace().folders;
		let targetIndex: number;
		const workspaceCreationData: IWorkspaceFolderCreationData[] = [];
		const rootsToMove: IWorkspaceFolderCreationData[] = [];

		for (const folder of folders) {
			const data = {
				uri: folder.uri
			};
			if (target instanceof ExplorerItem && folder.uri.toString() === target.resource.toString()) {
				targetIndex = workspaceCreationData.length;
			}

			if (roots.every(r => r.resource.toString() !== folder.uri.toString())) {
				workspaceCreationData.push(data);
			} else {
				rootsToMove.push(data);
			}
		}
		if (target instanceof Model) {
			targetIndex = workspaceCreationData.length;
		}

		workspaceCreationData.splice(targetIndex, 0, ...rootsToMove);
		return this.workspaceEditingService.updateFolders(0, workspaceCreationData.length, workspaceCreationData);
	}

	private doHandleExplorerDrop(tree: ITree, source: ExplorerItem, target: ExplorerItem | Model, isCopy: boolean): Promise<void> {
		if (!(target instanceof ExplorerItem)) {
			return Promise.resolve(undefined);
		}

		return tree.expand(target).then(() => {

			if (target.isReadonly) {
				return undefined;
			}

			// Reuse duplicate action if user copies
			if (isCopy) {
				return this.instantiationService.createInstance(DuplicateFileAction, tree, source, target).run();
			}

			// Otherwise move
			const targetResource = resources.joinPath(target.resource, source.name);

			return this.textFileService.move(source.resource, targetResource).then(undefined, error => {

				// Conflict
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
					const confirm: IConfirmation = {
						message: nls.localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
						detail: nls.localize('irreversible', "This action is irreversible!"),
						primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
						type: 'warning'
					};

					// Move with overwrite if the user confirms
					return this.dialogService.confirm(confirm).then(res => {
						if (res.confirmed) {
							return this.textFileService.move(source.resource, targetResource, true /* overwrite */).then(undefined, error => this.notificationService.error(error));
						}

						return undefined;
					});
				}

				// Any other error
				else {
					this.notificationService.error(error);
				}

				return undefined;
			});
		}, errors.onUnexpectedError);
	}
}
