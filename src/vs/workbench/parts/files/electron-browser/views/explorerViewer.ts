/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import * as DOM from 'vs/base/browser/dom';
import * as glob from 'vs/base/common/glob';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IFileService, FileKind } from 'vs/platform/files/common/files';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { KeyCode } from 'vs/base/common/keyCodes';
import { FileLabel, IFileLabelOptions } from 'vs/workbench/browser/labels';
import { ITreeRenderer, ITreeNode, ITreeFilter, TreeVisibility, TreeFilterResult, IDataSource } from 'vs/base/browser/ui/tree/tree';
import { IFileViewletState, IEditableData } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, IExplorerService } from 'vs/workbench/parts/files/common/files';
import { dirname, joinPath, basename } from 'vs/base/common/resources';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { localize } from 'vs/nls';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { once } from 'vs/base/common/functional';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { normalize, join, nativeSep } from 'vs/base/common/paths';
import { rtrim } from 'vs/base/common/strings';
import { equals, deepClone } from 'vs/base/common/objects';
import * as path from 'path';
import { ExplorerItem, NewStatPlaceholder } from 'vs/workbench/parts/files/common/explorerService';

export class ExplorerDelegate implements IListVirtualDelegate<ExplorerItem> {

	private static readonly ITEM_HEIGHT = 22;

	getHeight(element: ExplorerItem): number {
		return ExplorerDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: ExplorerItem): string {
		return FilesRenderer.ID;
	}
}

export class ExplorerDataSource implements IDataSource<ExplorerItem> {

	constructor(
		@IExplorerService private explorerService: IExplorerService,
		@IProgressService private progressService: IProgressService,
		@INotificationService private notificationService: INotificationService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) { }

	hasChildren(element: ExplorerItem | null): boolean {
		return element === null || element.isDirectory;
	}

	getChildren(element: ExplorerItem | null): Promise<ExplorerItem[]> {
		if (element === null) {
			const roots = this.explorerService.roots;
			if (this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER || roots[0].isError) {
				// Display roots only when multi folder workspace
				return Promise.resolve(roots);
			}
			element = roots[0];
		}

		// Return early if stat is already resolved
		if (element.isDirectoryResolved) {
			return Promise.resolve(element.getChildrenArray());
		}

		// Resolve children and add to fileStat for future lookup
		else {
			// Resolve
			const promise = this.fileService.resolveFile(element.resource, { resolveSingleChildDescendants: true }).then(dirStat => {

				// Convert to view model
				const modelDirStat = ExplorerItem.create(dirStat, element.root);

				// Add children to folder
				const children = modelDirStat.getChildrenArray();
				if (children) {
					children.forEach(child => {
						element.addChild(child);
					});
				}

				element.isDirectoryResolved = true;

				return element.getChildrenArray();
			}, (e: any) => {
				// Do not show error for roots since we already use an explorer decoration to notify user
				if (!(element instanceof ExplorerItem && element.isRoot)) {
					this.notificationService.error(e);
				}

				return []; // we could not resolve any children because of an error
			});

			this.progressService.showWhile(promise, this.partService.isRestored() ? 800 : 3200 /* less ugly initial startup */);

			return promise;
		}
	}
}

export interface IFileTemplateData {
	elementDisposable: IDisposable;
	label: FileLabel;
	container: HTMLElement;
}

export class EditableExplorerItems implements IFileViewletState {
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

export class FilesRenderer implements ITreeRenderer<ExplorerItem, void, IFileTemplateData>, IDisposable {
	static readonly ID = 'file';

	private state: EditableExplorerItems;
	private config: IFilesConfiguration;
	private configListener: IDisposable;

	constructor(
		state: EditableExplorerItems,
		@IContextViewService private contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService

	) {
		this.state = state;
		this.config = this.configurationService.getValue<IFilesConfiguration>();
		this.configListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer')) {
				this.config = this.configurationService.getValue();
			}
		});
	}

	get templateId(): string {
		return FilesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IFileTemplateData {
		const elementDisposable = Disposable.None;
		const label = this.instantiationService.createInstance(FileLabel, container, void 0);

		return { elementDisposable, label, container };
	}

	renderElement(element: ITreeNode<ExplorerItem, void>, index: number, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
		const stat = element.element;
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
				// todo@isidor horizontal scrolling
				// this.tree.updateWidth(stat);
			});
		}

		// Input Box
		else {
			templateData.label.element.style.display = 'none';
			this.renderInputBox(templateData.container, stat, editableData);
			templateData.elementDisposable = Disposable.None;
		}
	}

	private renderInputBox(container: HTMLElement, stat: ExplorerItem, editableData: IEditableData): void {

		// Use a file label only for the icon next to the input box
		const label = this.instantiationService.createInstance(FileLabel, container, void 0);
		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : (stat.isDirectory || (stat instanceof NewStatPlaceholder && stat.isDirectoryPlaceholder())) ? FileKind.FOLDER : FileKind.FILE;
		const labelOptions: IFileLabelOptions = { hidePath: true, hideLabel: true, fileKind, extraClasses };

		const parent = stat.name ? dirname(stat.resource) : stat.resource;
		const value = stat.name || '';

		label.setFile(joinPath(parent, value || ' '), labelOptions); // Use icon for ' ' if name is empty.

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: editableData.validator
			},
			ariaLabel: localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		inputBox.onDidChange(value => {
			label.setFile(joinPath(parent, value || ' '), labelOptions); // update label icon while typing!
		});

		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
		inputBox.focus();

		const done = once(async (commit: boolean, blur: boolean) => {
			label.element.style.display = 'none';
			if (stat instanceof NewStatPlaceholder) {
				stat.destroy();
			}

			if (commit && inputBox.value) {
				await editableData.action.run({ value: inputBox.value });
			}
			dispose(toDispose);
			container.removeChild(label.element);
			// todo@isidor need to unset editable data
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
					projectFolderName = basename(stat.root.resource);	// show root folder name in multi-folder project
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
				let displayPath = normalize(join(projectFolderName, initialRelPath, value));
				displayPath = rtrim(displayPath, nativeSep);

				const indexLastSlash: number = displayPath.lastIndexOf(nativeSep);
				const name: string = displayPath.substring(indexLastSlash + 1);
				const leadingPathPart: string = displayPath.substring(0, indexLastSlash);

				let msg: string;
				switch (actionID) {
					case 'workbench.files.action.createFileFromExplorer':
						msg = localize('createFileFromExplorerInfoMessage', "Create file **{0}** in **{1}**", name, leadingPathPart);
						break;
					case 'workbench.files.action.renameFile':
						msg = localize('renameFileFromExplorerInfoMessage', "Move and rename to **{0}**", displayPath);
						break;
					case 'workbench.files.action.createFolderFromExplorer':	// fallthrough
					default:
						msg = localize('createFolderFromExplorerInfoMessage', "Create folder **{0}** in **{1}**", name, leadingPathPart);
				}

				inputBox.showMessage({
					type: MessageType.INFO,
					content: msg,
					formatContent: true
				});
			} else if (value && /^\s|\s$/.test(value)) {
				inputBox.showMessage({
					content: localize('whitespace', "Leading or trailing whitespace detected"),
					formatContent: true,
					type: MessageType.WARNING
				});
			} else {	// fixes #46744: inputbox hides again if all slashes are removed
				inputBox.hideMessage();
			}
		}
	}

	disposeElement?(element: ITreeNode<ExplorerItem, void>, index: number, templateData: IFileTemplateData): void {
		// noop
	}

	disposeTemplate(templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
		templateData.label.dispose();
	}

	dispose(): void {
		this.configListener.dispose();
	}
}

export class ExplorerAccessibilityProvider implements IAccessibilityProvider<ExplorerItem> {
	getAriaLabel(element: ExplorerItem): string {
		return element.name;
	}
}

interface CachedParsedExpression {
	original: glob.IExpression;
	parsed: glob.ParsedExpression;
}

export class FilesFilter implements ITreeFilter<ExplorerItem, void> {
	private hiddenExpressionPerRoot: Map<string, CachedParsedExpression>;
	private workspaceFolderChangeListener: IDisposable;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.hiddenExpressionPerRoot = new Map<string, CachedParsedExpression>();
		this.workspaceFolderChangeListener = this.contextService.onDidChangeWorkspaceFolders(() => this.updateConfiguration());
	}

	updateConfiguration(): boolean {
		let needsRefresh = false;
		this.contextService.getWorkspace().folders.forEach(folder => {
			const configuration = this.configurationService.getValue<IFilesConfiguration>({ resource: folder.uri });
			const excludesConfig: glob.IExpression = (configuration && configuration.files && configuration.files.exclude) || Object.create(null);

			if (!needsRefresh) {
				const cached = this.hiddenExpressionPerRoot.get(folder.uri.toString());
				needsRefresh = !cached || !equals(cached.original, excludesConfig);
			}

			const excludesConfigCopy = deepClone(excludesConfig); // do not keep the config, as it gets mutated under our hoods

			this.hiddenExpressionPerRoot.set(folder.uri.toString(), { original: excludesConfigCopy, parsed: glob.parse(excludesConfigCopy) } as CachedParsedExpression);
		});

		return needsRefresh;
	}

	filter(stat: ExplorerItem, parentVisibility: TreeVisibility): TreeFilterResult<void> {
		if (parentVisibility === TreeVisibility.Hidden) {
			return false;
		}
		if (stat instanceof NewStatPlaceholder || stat.isRoot) {
			return true; // always visible
		}

		// Hide those that match Hidden Patterns
		const cached = this.hiddenExpressionPerRoot.get(stat.root.resource.toString());
		if (cached && cached.parsed(normalize(path.relative(stat.root.resource.path, stat.resource.path), true), stat.name, name => !!stat.parent.getChild(name))) {
			return false; // hidden through pattern
		}

		return true;
	}

	public dispose(): void {
		this.workspaceFolderChangeListener = dispose(this.workspaceFolderChangeListener);
	}
}

// Explorer Controller
// export class FileController extends WorkbenchTreeController implements IDisposable {
// 	private fileCopiedContextKey: IContextKey<boolean>;
// 	private contributedContextMenu: IMenu;
// 	private previousSelectionRangeStop: ExplorerItem;

// 	constructor(
// 		@IEditorService private editorService: IEditorService,
// 		@IContextMenuService private contextMenuService: IContextMenuService,
// 		@ITelemetryService private telemetryService: ITelemetryService,
// 		@IMenuService private menuService: IMenuService,
// 		@IContextKeyService contextKeyService: IContextKeyService,
// 		@IClipboardService private clipboardService: IClipboardService,
// 		@IConfigurationService configurationService: IConfigurationService
// 	) {
// 		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */ }, configurationService);

// 		this.fileCopiedContextKey = FileCopiedContext.bindTo(contextKeyService);
// 	}

// 	public onLeftClick(tree: WorkbenchTree, stat: ExplorerItem | Model, event: IMouseEvent, origin: string = 'mouse'): boolean {
// 		const payload = { origin: origin };
// 		const isDoubleClick = (origin === 'mouse' && event.detail === 2);

// 		// Handle Highlight Mode
// 		if (tree.getHighlight()) {

// 			// Cancel Event
// 			event.preventDefault();
// 			event.stopPropagation();

// 			tree.clearHighlight(payload);

// 			return false;
// 		}

// 		// Handle root
// 		if (stat instanceof Model) {
// 			tree.clearFocus(payload);
// 			tree.clearSelection(payload);

// 			return false;
// 		}

// 		// Cancel Event
// 		const isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
// 		if (!isMouseDown) {
// 			event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
// 		}
// 		event.stopPropagation();

// 		// Set DOM focus
// 		tree.domFocus();
// 		if (stat instanceof NewStatPlaceholder) {
// 			return true;
// 		}

// 		// Allow to multiselect
// 		if ((tree.useAltAsMultipleSelectionModifier && event.altKey) || !tree.useAltAsMultipleSelectionModifier && (event.ctrlKey || event.metaKey)) {
// 			const selection = tree.getSelection();
// 			this.previousSelectionRangeStop = undefined;
// 			if (selection.indexOf(stat) >= 0) {
// 				tree.setSelection(selection.filter(s => s !== stat));
// 			} else {
// 				tree.setSelection(selection.concat(stat));
// 				tree.setFocus(stat, payload);
// 			}
// 		}

// 		// Allow to unselect
// 		else if (event.shiftKey) {
// 			const focus = tree.getFocus();
// 			if (focus) {
// 				if (this.previousSelectionRangeStop) {
// 					tree.deselectRange(stat, this.previousSelectionRangeStop);
// 				}
// 				tree.selectRange(focus, stat, payload);
// 				this.previousSelectionRangeStop = stat;
// 			}
// 		}

// 		// Select, Focus and open files
// 		else {

// 			// Expand / Collapse
// 			if (isDoubleClick || this.openOnSingleClick || this.isClickOnTwistie(event)) {
// 				tree.toggleExpansion(stat, event.altKey);
// 				this.previousSelectionRangeStop = undefined;
// 			}

// 			const preserveFocus = !isDoubleClick;
// 			tree.setFocus(stat, payload);

// 			if (isDoubleClick) {
// 				event.preventDefault(); // focus moves to editor, we need to prevent default
// 			}

// 			tree.setSelection([stat], payload);

// 			if (!stat.isDirectory && (isDoubleClick || this.openOnSingleClick)) {
// 				let sideBySide = false;
// 				if (event) {
// 					sideBySide = tree.useAltAsMultipleSelectionModifier ? (event.ctrlKey || event.metaKey) : event.altKey;
// 				}

// 				this.openEditor(stat, { preserveFocus, sideBySide, pinned: isDoubleClick });
// 			}
// 		}

// 		return true;
// 	}

// 	public onMouseMiddleClick(tree: WorkbenchTree, element: ExplorerItem | Model, event: IMouseEvent): boolean {
// 		let sideBySide = false;
// 		if (event) {
// 			sideBySide = tree.useAltAsMultipleSelectionModifier ? (event.ctrlKey || event.metaKey) : event.altKey;
// 		}
// 		if (element instanceof ExplorerItem && !element.isDirectory) {
// 			this.openEditor(element, { preserveFocus: true, sideBySide, pinned: true });
// 		}

// 		return true;
// 	}

// 	public openEditor(stat: ExplorerItem, options: { preserveFocus: boolean; sideBySide: boolean; pinned: boolean; }): void {
// 		if (stat && !stat.isDirectory) {
// 			/* __GDPR__
// 				"workbenchActionExecuted" : {
// 					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
// 					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
// 				}
// 			*/
// 			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'explorer' });

// 			this.editorService.openEditor({ resource: stat.resource, options }, options.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
// 		}
// 	}
// }

// // Explorer Sorter
// export class FileSorter implements ISorter {
// 	private toDispose: IDisposable[];
// 	private sortOrder: SortOrder;

// 	constructor(
// 		@IConfigurationService private configurationService: IConfigurationService,
// 		@IWorkspaceContextService private contextService: IWorkspaceContextService
// 	) {
// 		this.toDispose = [];

// 		this.updateSortOrder();

// 		this.registerListeners();
// 	}

// 	private registerListeners(): void {
// 		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => this.updateSortOrder()));
// 	}

// 	private updateSortOrder(): void {
// 		this.sortOrder = this.configurationService.getValue('explorer.sortOrder') || 'default';
// 	}

// 	public compare(tree: ITree, statA: ExplorerItem, statB: ExplorerItem): number {

// 		// Do not sort roots
// 		if (statA.isRoot) {
// 			if (statB.isRoot) {
// 				return this.contextService.getWorkspaceFolder(statA.resource).index - this.contextService.getWorkspaceFolder(statB.resource).index;
// 			}

// 			return -1;
// 		}

// 		if (statB.isRoot) {
// 			return 1;
// 		}

// 		// Sort Directories
// 		switch (this.sortOrder) {
// 			case 'type':
// 				if (statA.isDirectory && !statB.isDirectory) {
// 					return -1;
// 				}

// 				if (statB.isDirectory && !statA.isDirectory) {
// 					return 1;
// 				}

// 				if (statA.isDirectory && statB.isDirectory) {
// 					return comparers.compareFileNames(statA.name, statB.name);
// 				}

// 				break;

// 			case 'filesFirst':
// 				if (statA.isDirectory && !statB.isDirectory) {
// 					return 1;
// 				}

// 				if (statB.isDirectory && !statA.isDirectory) {
// 					return -1;
// 				}

// 				break;

// 			case 'mixed':
// 				break; // not sorting when "mixed" is on

// 			default: /* 'default', 'modified' */
// 				if (statA.isDirectory && !statB.isDirectory) {
// 					return -1;
// 				}

// 				if (statB.isDirectory && !statA.isDirectory) {
// 					return 1;
// 				}

// 				break;
// 		}

// 		// Sort "New File/Folder" placeholders
// 		if (statA instanceof NewStatPlaceholder) {
// 			return -1;
// 		}

// 		if (statB instanceof NewStatPlaceholder) {
// 			return 1;
// 		}

// 		// Sort Files
// 		switch (this.sortOrder) {
// 			case 'type':
// 				return comparers.compareFileExtensions(statA.name, statB.name);

// 			case 'modified':
// 				if (statA.mtime !== statB.mtime) {
// 					return statA.mtime < statB.mtime ? 1 : -1;
// 				}

// 				return comparers.compareFileNames(statA.name, statB.name);

// 			default: /* 'default', 'mixed', 'filesFirst' */
// 				return comparers.compareFileNames(statA.name, statB.name);
// 		}
// 	}

// 	public dispose(): void {
// 		this.toDispose = dispose(this.toDispose);
// 	}
// }

// export class FileDragAndDrop extends SimpleFileResourceDragAndDrop {

// 	private static readonly CONFIRM_DND_SETTING_KEY = 'explorer.confirmDragAndDrop';

// 	private toDispose: IDisposable[];
// 	private dropEnabled: boolean;

// 	constructor(
// 		@INotificationService private notificationService: INotificationService,
// 		@IDialogService private dialogService: IDialogService,
// 		@IWorkspaceContextService private contextService: IWorkspaceContextService,
// 		@IFileService private fileService: IFileService,
// 		@IConfigurationService private configurationService: IConfigurationService,
// 		@IInstantiationService instantiationService: IInstantiationService,
// 		@ITextFileService private textFileService: ITextFileService,
// 		@IWindowService private windowService: IWindowService,
// 		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
// 	) {
// 		super(stat => this.statToResource(stat), instantiationService);

// 		this.toDispose = [];

// 		this.updateDropEnablement();

// 		this.registerListeners();
// 	}

// 	private statToResource(stat: ExplorerItem): URI {
// 		if (stat.isDirectory) {
// 			return URI.from({ scheme: 'folder', path: stat.resource.path }); // indicates that we are dragging a folder
// 		}

// 		return stat.resource;
// 	}

// 	private registerListeners(): void {
// 		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => this.updateDropEnablement()));
// 	}

// 	private updateDropEnablement(): void {
// 		this.dropEnabled = this.configurationService.getValue('explorer.enableDragAndDrop');
// 	}

// 	public onDragStart(tree: ITree, data: IDragAndDropData, originalEvent: DragMouseEvent): void {
// 		const sources: ExplorerItem[] = data.getData();
// 		if (sources && sources.length) {

// 			// When dragging folders, make sure to collapse them to free up some space
// 			sources.forEach(s => {
// 				if (s.isDirectory && tree.isExpanded(s)) {
// 					tree.collapse(s, false);
// 				}
// 			});

// 			// Apply some datatransfer types to allow for dragging the element outside of the application
// 			this.instantiationService.invokeFunction(fillResourceDataTransfers, sources, originalEvent);

// 			// The only custom data transfer we set from the explorer is a file transfer
// 			// to be able to DND between multiple code file explorers across windows
// 			const fileResources = sources.filter(s => !s.isDirectory && s.resource.scheme === Schemas.file).map(r => r.resource.fsPath);
// 			if (fileResources.length) {
// 				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
// 			}
// 		}
// 	}

// 	public onDragOver(tree: ITree, data: IDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): IDragOverReaction {
// 		if (!this.dropEnabled) {
// 			return DRAG_OVER_REJECT;
// 		}

// 		const isCopy = originalEvent && ((originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh));
// 		const fromDesktop = data instanceof DesktopDragAndDropData;

// 		// Desktop DND
// 		if (fromDesktop) {
// 			const types: string[] = originalEvent.dataTransfer.types;
// 			const typesArray: string[] = [];
// 			for (let i = 0; i < types.length; i++) {
// 				typesArray.push(types[i].toLowerCase()); // somehow the types are lowercase
// 			}

// 			if (typesArray.indexOf(DataTransfers.FILES.toLowerCase()) === -1 && typesArray.indexOf(CodeDataTransfers.FILES.toLowerCase()) === -1) {
// 				return DRAG_OVER_REJECT;
// 			}
// 		}

// 		// Other-Tree DND
// 		else if (data instanceof ExternalElementsDragAndDropData) {
// 			return DRAG_OVER_REJECT;
// 		}

// 		// In-Explorer DND
// 		else {
// 			const sources: ExplorerItem[] = data.getData();
// 			if (target instanceof Model) {
// 				if (sources[0].isRoot) {
// 					return DRAG_OVER_ACCEPT_BUBBLE_DOWN(false);
// 				}

// 				return DRAG_OVER_REJECT;
// 			}

// 			if (!Array.isArray(sources)) {
// 				return DRAG_OVER_REJECT;
// 			}

// 			if (sources.some((source) => {
// 				if (source instanceof NewStatPlaceholder) {
// 					return true; // NewStatPlaceholders can not be moved
// 				}

// 				if (source.isRoot && target instanceof ExplorerItem && !target.isRoot) {
// 					return true; // Root folder can not be moved to a non root file stat.
// 				}

// 				if (source.resource.toString() === target.resource.toString()) {
// 					return true; // Can not move anything onto itself
// 				}

// 				if (source.isRoot && target instanceof ExplorerItem && target.isRoot) {
// 					// Disable moving workspace roots in one another
// 					return false;
// 				}

// 				if (!isCopy && resources.dirname(source.resource).toString() === target.resource.toString()) {
// 					return true; // Can not move a file to the same parent unless we copy
// 				}

// 				if (resources.isEqualOrParent(target.resource, source.resource, !isLinux /* ignorecase */)) {
// 					return true; // Can not move a parent folder into one of its children
// 				}

// 				return false;
// 			})) {
// 				return DRAG_OVER_REJECT;
// 			}
// 		}

// 		// All (target = model)
// 		if (target instanceof Model) {
// 			return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY(false) : DRAG_OVER_REJECT; // can only drop folders to workspace
// 		}

// 		// All (target = file/folder)
// 		else {
// 			if (target.isDirectory) {
// 				if (target.isReadonly) {
// 					return DRAG_OVER_REJECT;
// 				}
// 				return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_DOWN_COPY(true) : DRAG_OVER_ACCEPT_BUBBLE_DOWN(true);
// 			}

// 			if (this.contextService.getWorkspace().folders.every(folder => folder.uri.toString() !== target.resource.toString())) {
// 				return fromDesktop || isCopy ? DRAG_OVER_ACCEPT_BUBBLE_UP_COPY : DRAG_OVER_ACCEPT_BUBBLE_UP;
// 			}
// 		}

// 		return DRAG_OVER_REJECT;
// 	}

// 	public drop(tree: ITree, data: IDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): void {

// 		// Desktop DND (Import file)
// 		if (data instanceof DesktopDragAndDropData) {
// 			this.handleExternalDrop(tree, data, target, originalEvent);
// 		}

// 		// In-Explorer DND (Move/Copy file)
// 		else {
// 			this.handleExplorerDrop(tree, data, target, originalEvent);
// 		}
// 	}

// 	private handleExternalDrop(tree: ITree, data: DesktopDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): Promise<void> {
// 		const droppedResources = extractResources(originalEvent.browserEvent as DragEvent, true);

// 		// Check for dropped external files to be folders
// 		return this.fileService.resolveFiles(droppedResources).then(result => {

// 			// Pass focus to window
// 			this.windowService.focusWindow();

// 			// Handle folders by adding to workspace if we are in workspace context
// 			const folders = result.filter(r => r.success && r.stat.isDirectory).map(result => ({ uri: result.stat.resource }));
// 			if (folders.length > 0) {

// 				// If we are in no-workspace context, ask for confirmation to create a workspace
// 				let confirmedPromise: Promise<IConfirmationResult> = Promise.resolve({ confirmed: true });
// 				if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
// 					confirmedPromise = this.dialogService.confirm({
// 						message: folders.length > 1 ? nls.localize('dropFolders', "Do you want to add the folders to the workspace?") : nls.localize('dropFolder', "Do you want to add the folder to the workspace?"),
// 						type: 'question',
// 						primaryButton: folders.length > 1 ? nls.localize('addFolders', "&&Add Folders") : nls.localize('addFolder', "&&Add Folder")
// 					});
// 				}

// 				return confirmedPromise.then(res => {
// 					if (res.confirmed) {
// 						return this.workspaceEditingService.addFolders(folders);
// 					}

// 					return void 0;
// 				});
// 			}

// 			// Handle dropped files (only support FileStat as target)
// 			else if (target instanceof ExplorerItem && !target.isReadonly) {
// 				const addFilesAction = this.instantiationService.createInstance(AddFilesAction, tree, target, null);

// 				return addFilesAction.run(droppedResources.map(res => res.resource));
// 			}

// 			return void 0;
// 		});
// 	}

// 	private handleExplorerDrop(tree: ITree, data: IDragAndDropData, target: ExplorerItem | Model, originalEvent: DragMouseEvent): Promise<void> {
// 		const sources: ExplorerItem[] = resources.distinctParents(data.getData(), s => s.resource);
// 		const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

// 		let confirmPromise: Promise<IConfirmationResult>;

// 		// Handle confirm setting
// 		const confirmDragAndDrop = !isCopy && this.configurationService.getValue<boolean>(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
// 		if (confirmDragAndDrop) {
// 			confirmPromise = this.dialogService.confirm({
// 				message: sources.length > 1 && sources.every(s => s.isRoot) ? nls.localize('confirmRootsMove', "Are you sure you want to change the order of multiple root folders in your workspace?")
// 					: sources.length > 1 ? getConfirmMessage(nls.localize('confirmMultiMove', "Are you sure you want to move the following {0} files?", sources.length), sources.map(s => s.resource))
// 						: sources[0].isRoot ? nls.localize('confirmRootMove', "Are you sure you want to change the order of root folder '{0}' in your workspace?", sources[0].name)
// 							: nls.localize('confirmMove', "Are you sure you want to move '{0}'?", sources[0].name),
// 				checkbox: {
// 					label: nls.localize('doNotAskAgain', "Do not ask me again")
// 				},
// 				type: 'question',
// 				primaryButton: nls.localize({ key: 'moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
// 			});
// 		} else {
// 			confirmPromise = Promise.resolve({ confirmed: true } as IConfirmationResult);
// 		}

// 		return confirmPromise.then(res => {

// 			// Check for confirmation checkbox
// 			let updateConfirmSettingsPromise: Promise<void> = Promise.resolve(void 0);
// 			if (res.confirmed && res.checkboxChecked === true) {
// 				updateConfirmSettingsPromise = this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false, ConfigurationTarget.USER);
// 			}

// 			return updateConfirmSettingsPromise.then(() => {
// 				if (res.confirmed) {
// 					const rootDropPromise = this.doHandleRootDrop(sources.filter(s => s.isRoot), target);
// 					return Promise.all(sources.filter(s => !s.isRoot).map(source => this.doHandleExplorerDrop(tree, source, target, isCopy)).concat(rootDropPromise)).then(() => void 0);
// 				}

// 				return Promise.resolve(void 0);
// 			});
// 		});
// 	}

// 	private doHandleRootDrop(roots: ExplorerItem[], target: ExplorerItem | Model): Promise<void> {
// 		if (roots.length === 0) {
// 			return Promise.resolve(undefined);
// 		}

// 		const folders = this.contextService.getWorkspace().folders;
// 		let targetIndex: number;
// 		const workspaceCreationData: IWorkspaceFolderCreationData[] = [];
// 		const rootsToMove: IWorkspaceFolderCreationData[] = [];

// 		for (let index = 0; index < folders.length; index++) {
// 			const data = {
// 				uri: folders[index].uri
// 			};
// 			if (target instanceof ExplorerItem && folders[index].uri.toString() === target.resource.toString()) {
// 				targetIndex = workspaceCreationData.length;
// 			}

// 			if (roots.every(r => r.resource.toString() !== folders[index].uri.toString())) {
// 				workspaceCreationData.push(data);
// 			} else {
// 				rootsToMove.push(data);
// 			}
// 		}
// 		if (target instanceof Model) {
// 			targetIndex = workspaceCreationData.length;
// 		}

// 		workspaceCreationData.splice(targetIndex, 0, ...rootsToMove);
// 		return this.workspaceEditingService.updateFolders(0, workspaceCreationData.length, workspaceCreationData);
// 	}

// 	private doHandleExplorerDrop(tree: ITree, source: ExplorerItem, target: ExplorerItem | Model, isCopy: boolean): Promise<void> {
// 		if (!(target instanceof ExplorerItem)) {
// 			return Promise.resolve(void 0);
// 		}

// 		return tree.expand(target).then(() => {

// 			if (target.isReadonly) {
// 				return void 0;
// 			}

// 			// Reuse duplicate action if user copies
// 			if (isCopy) {
// 				return this.instantiationService.createInstance(DuplicateFileAction, tree, source, target).run();
// 			}

// 			// Otherwise move
// 			const targetResource = resources.joinPath(target.resource, source.name);

// 			return this.textFileService.move(source.resource, targetResource).then(void 0, error => {

// 				// Conflict
// 				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
// 					const confirm: IConfirmation = {
// 						message: nls.localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
// 						detail: nls.localize('irreversible', "This action is irreversible!"),
// 						primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
// 						type: 'warning'
// 					};

// 					// Move with overwrite if the user confirms
// 					return this.dialogService.confirm(confirm).then(res => {
// 						if (res.confirmed) {
// 							return this.textFileService.move(source.resource, targetResource, true /* overwrite */).then(void 0, error => this.notificationService.error(error));
// 						}

// 						return void 0;
// 					});
// 				}

// 				// Any other error
// 				else {
// 					this.notificationService.error(error);
// 				}

// 				return void 0;
// 			});
// 		}, errors.onUnexpectedError);
// 	}
// }
