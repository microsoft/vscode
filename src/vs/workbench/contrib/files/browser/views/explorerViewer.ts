/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import * as DOM from 'vs/base/browser/dom';
import * as glob from 'vs/base/common/glob';
import { IListVirtualDelegate, ListDragOverEffect } from 'vs/base/browser/ui/list/list';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IFileService, FileKind, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IDisposable, Disposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IFileLabelOptions, IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { ITreeRenderer, ITreeNode, ITreeFilter, TreeVisibility, TreeFilterResult, IAsyncDataSource, ITreeSorter, ITreeDragAndDrop, ITreeDragOverReaction, TreeDragOverBubble } from 'vs/base/browser/ui/tree/tree';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, IExplorerService, IEditableData } from 'vs/workbench/contrib/files/common/files';
import { dirname, joinPath, isEqualOrParent, basename, hasToIgnoreCase, distinctParents } from 'vs/base/common/resources';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { localize } from 'vs/nls';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { once } from 'vs/base/common/functional';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { equals, deepClone } from 'vs/base/common/objects';
import * as path from 'vs/base/common/path';
import { ExplorerItem } from 'vs/workbench/contrib/files/common/explorerModel';
import { compareFileExtensions, compareFileNames } from 'vs/base/common/comparers';
import { fillResourceDataTransfers, CodeDataTransfers, extractResources } from 'vs/workbench/browser/dnd';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDragAndDropData, DataTransfers } from 'vs/base/browser/dnd';
import { Schemas } from 'vs/base/common/network';
import { DesktopDragAndDropData, ExternalElementsDragAndDropData, ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { isMacintosh } from 'vs/base/common/platform';
import { IDialogService, IConfirmationResult, IConfirmation, getConfirmMessage } from 'vs/platform/dialogs/common/dialogs';
import { ITextFileService, ITextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { URI } from 'vs/base/common/uri';
import { ITask, sequence } from 'vs/base/common/async';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { findValidPasteFileTarget } from 'vs/workbench/contrib/files/browser/fileActions';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';

export class ExplorerDelegate implements IListVirtualDelegate<ExplorerItem> {

	static readonly ITEM_HEIGHT = 22;

	getHeight(element: ExplorerItem): number {
		return ExplorerDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: ExplorerItem): string {
		return FilesRenderer.ID;
	}
}

export class ExplorerDataSource implements IAsyncDataSource<ExplorerItem | ExplorerItem[], ExplorerItem> {

	constructor(
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IFileService private readonly fileService: IFileService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) { }

	hasChildren(element: ExplorerItem | ExplorerItem[]): boolean {
		return Array.isArray(element) || element.isDirectory;
	}

	getChildren(element: ExplorerItem | ExplorerItem[]): Promise<ExplorerItem[]> {
		if (Array.isArray(element)) {
			return Promise.resolve(element);
		}

		const promise = element.fetchChildren(this.fileService, this.explorerService).then(undefined, e => {

			if (element instanceof ExplorerItem && element.isRoot) {
				if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
					// Single folder create a dummy explorer item to show error
					const placeholder = new ExplorerItem(element.resource, undefined, false);
					placeholder.isError = true;

					return [placeholder];
				}
			} else {
				// Do not show error for roots since we already use an explorer decoration to notify user
				this.notificationService.error(e);
			}

			return []; // we could not resolve any children because of an error
		});

		this.progressService.withProgress({
			location: ProgressLocation.Explorer,
			delay: this.layoutService.isRestored() ? 800 : 1200 // less ugly initial startup
		}, _progress => promise);

		return promise;
	}
}

export interface IFileTemplateData {
	elementDisposable: IDisposable;
	label: IResourceLabel;
	container: HTMLElement;
}

export class FilesRenderer implements ITreeRenderer<ExplorerItem, FuzzyScore, IFileTemplateData>, IDisposable {
	static readonly ID = 'file';

	private config: IFilesConfiguration;
	private configListener: IDisposable;

	constructor(
		private labels: ResourceLabels,
		private updateWidth: (stat: ExplorerItem) => void,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExplorerService private readonly explorerService: IExplorerService
	) {
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
		const label = this.labels.create(container, { supportHighlights: true });

		return { elementDisposable, label, container };
	}

	renderElement(node: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
		const stat = node.element;
		const editableData = this.explorerService.getEditableData(stat);

		// File Label
		if (!editableData) {
			templateData.label.element.style.display = 'flex';
			const extraClasses = ['explorer-item'];
			if (this.explorerService.isCut(stat)) {
				extraClasses.push('cut');
			}
			templateData.label.setFile(stat.resource, {
				hidePath: true,
				fileKind: stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE,
				extraClasses,
				fileDecorations: this.config.explorer.decorations,
				matches: createMatches(node.filterData)
			});

			templateData.elementDisposable = templateData.label.onDidRender(() => {
				this.updateWidth(stat);
			});
		}

		// Input Box
		else {
			templateData.label.element.style.display = 'none';
			templateData.elementDisposable = this.renderInputBox(templateData.container, stat, editableData);
		}
	}

	private renderInputBox(container: HTMLElement, stat: ExplorerItem, editableData: IEditableData): IDisposable {

		// Use a file label only for the icon next to the input box
		const label = this.labels.create(container);
		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE;
		const labelOptions: IFileLabelOptions = { hidePath: true, hideLabel: true, fileKind, extraClasses };

		const parent = stat.name ? dirname(stat.resource) : stat.resource;
		const value = stat.name || '';

		label.setFile(joinPath(parent, value || ' '), labelOptions); // Use icon for ' ' if name is empty.

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: (value) => {
					const content = editableData.validationMessage(value);
					if (!content) {
						return null;
					}

					return {
						content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		inputBox.onDidChange(value => {
			label.setFile(joinPath(parent, value || ' '), labelOptions); // update label icon while typing!
		});

		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.focus();
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });

		const done = once(async (success: boolean, blur: boolean) => {
			label.element.style.display = 'none';
			const value = inputBox.value;
			dispose(toDispose);
			container.removeChild(label.element);
			editableData.onFinish(value, success);
		});

		// It can happen that the tree re-renders this node. When that happens,
		// we're gonna get a blur event first and only after an element disposable.
		// Because of that, we should setTimeout the blur handler to differentiate
		// between the blur happening because of a unrender or because of a user action.
		let ignoreBlur = false;

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
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
				setTimeout(() => {
					if (!ignoreBlur) {
						done(inputBox.isInputValid(), true);
					}
				}, 0);
			}),
			label,
			styler
		];

		return toDisposable(() => ignoreBlur = true);
	}

	disposeElement?(element: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
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

export class FilesFilter implements ITreeFilter<ExplorerItem, FuzzyScore> {
	private hiddenExpressionPerRoot: Map<string, CachedParsedExpression>;
	private workspaceFolderChangeListener: IDisposable;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExplorerService private readonly explorerService: IExplorerService
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

			this.hiddenExpressionPerRoot.set(folder.uri.toString(), { original: excludesConfigCopy, parsed: glob.parse(excludesConfigCopy) });
		});

		return needsRefresh;
	}

	filter(stat: ExplorerItem, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore> {
		if (parentVisibility === TreeVisibility.Hidden) {
			return false;
		}
		if (this.explorerService.getEditableData(stat) || stat.isRoot) {
			return true; // always visible
		}

		// Hide those that match Hidden Patterns
		const cached = this.hiddenExpressionPerRoot.get(stat.root.resource.toString());
		if (cached && cached.parsed(path.relative(stat.root.resource.path, stat.resource.path), stat.name, name => !!(stat.parent && stat.parent.getChild(name)))) {
			return false; // hidden through pattern
		}

		return true;
	}

	public dispose(): void {
		dispose(this.workspaceFolderChangeListener);
	}
}

// // Explorer Sorter
export class FileSorter implements ITreeSorter<ExplorerItem> {

	constructor(
		@IExplorerService private readonly explorerService: IExplorerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) { }

	public compare(statA: ExplorerItem, statB: ExplorerItem): number {
		// Do not sort roots
		if (statA.isRoot) {
			if (statB.isRoot) {
				const workspaceA = this.contextService.getWorkspaceFolder(statA.resource);
				const workspaceB = this.contextService.getWorkspaceFolder(statB.resource);
				return workspaceA && workspaceB ? (workspaceA.index - workspaceB.index) : -1;
			}

			return -1;
		}

		if (statB.isRoot) {
			return 1;
		}

		const sortOrder = this.explorerService.sortOrder;

		// Sort Directories
		switch (sortOrder) {
			case 'type':
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				if (statA.isDirectory && statB.isDirectory) {
					return compareFileNames(statA.name, statB.name);
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

		// Sort Files
		switch (sortOrder) {
			case 'type':
				return compareFileExtensions(statA.name, statB.name);

			case 'modified':
				if (statA.mtime !== statB.mtime) {
					return (statA.mtime && statB.mtime && statA.mtime < statB.mtime) ? 1 : -1;
				}

				return compareFileNames(statA.name, statB.name);

			default: /* 'default', 'mixed', 'filesFirst' */
				return compareFileNames(statA.name, statB.name);
		}
	}
}

export class FileDragAndDrop implements ITreeDragAndDrop<ExplorerItem> {
	private static readonly CONFIRM_DND_SETTING_KEY = 'explorer.confirmDragAndDrop';

	private toDispose: IDisposable[];
	private dropEnabled = false;

	constructor(
		@INotificationService private notificationService: INotificationService,
		@IExplorerService private explorerService: IExplorerService,
		@IEditorService private editorService: IEditorService,
		@IDialogService private dialogService: IDialogService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
	) {
		this.toDispose = [];

		const updateDropEnablement = () => {
			this.dropEnabled = this.configurationService.getValue('explorer.enableDragAndDrop');
		};
		updateDropEnablement();
		this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => updateDropEnablement()));
	}

	onDragOver(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		if (!this.dropEnabled) {
			return false;
		}

		const isCopy = originalEvent && ((originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh));
		const fromDesktop = data instanceof DesktopDragAndDropData;
		const effect = (fromDesktop || isCopy) ? ListDragOverEffect.Copy : ListDragOverEffect.Move;

		// Desktop DND
		if (fromDesktop && originalEvent.dataTransfer) {
			const types = originalEvent.dataTransfer.types;
			const typesArray: string[] = [];
			for (let i = 0; i < types.length; i++) {
				typesArray.push(types[i].toLowerCase()); // somehow the types are lowercase
			}

			if (typesArray.indexOf(DataTransfers.FILES.toLowerCase()) === -1 && typesArray.indexOf(CodeDataTransfers.FILES.toLowerCase()) === -1) {
				return false;
			}
		}

		// Other-Tree DND
		else if (data instanceof ExternalElementsDragAndDropData) {
			return false;
		}

		// In-Explorer DND
		else {
			const items = (data as ElementsDragAndDropData<ExplorerItem>).elements;

			if (!target) {
				// Dropping onto the empty area. Do not accept if items dragged are already
				// children of the root unless we are copying the file
				if (!isCopy && items.every(i => !!i.parent && i.parent.isRoot)) {
					return false;
				}

				return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: false };
			}

			if (!Array.isArray(items)) {
				return false;
			}

			if (items.some((source) => {
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

				if (!isCopy && dirname(source.resource).toString() === target.resource.toString()) {
					return true; // Can not move a file to the same parent unless we copy
				}

				if (isEqualOrParent(target.resource, source.resource)) {
					return true; // Can not move a parent folder into one of its children
				}

				return false;
			})) {
				return false;
			}
		}

		// All (target = model)
		if (!target) {
			return { accept: true, bubble: TreeDragOverBubble.Down, effect };
		}

		// All (target = file/folder)
		else {
			if (target.isDirectory) {
				if (target.isReadonly) {
					return false;
				}

				return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: true };
			}

			if (this.contextService.getWorkspace().folders.every(folder => folder.uri.toString() !== target.resource.toString())) {
				return { accept: true, bubble: TreeDragOverBubble.Up, effect };
			}
		}

		return false;
	}

	getDragURI(element: ExplorerItem): string | null {
		if (this.explorerService.isEditable(element)) {
			return null;
		}

		return element.resource.toString();
	}

	getDragLabel(elements: ExplorerItem[]): string | undefined {
		if (elements.length > 1) {
			return String(elements.length);
		}

		return elements[0].name;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const items = (data as ElementsDragAndDropData<ExplorerItem>).elements;
		if (items && items.length && originalEvent.dataTransfer) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(fillResourceDataTransfers, items, originalEvent);

			// The only custom data transfer we set from the explorer is a file transfer
			// to be able to DND between multiple code file explorers across windows
			const fileResources = items.filter(s => !s.isDirectory && s.resource.scheme === Schemas.file).map(r => r.resource.fsPath);
			if (fileResources.length) {
				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
			}
		}
	}

	drop(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): void {
		// Find parent to add to
		if (!target) {
			target = this.explorerService.roots[this.explorerService.roots.length - 1];
		}
		if (!target.isDirectory && target.parent) {
			target = target.parent;
		}
		if (target.isReadonly) {
			return;
		}

		// Desktop DND (Import file)
		if (data instanceof DesktopDragAndDropData) {
			this.handleExternalDrop(data, target, originalEvent).then(undefined, e => this.notificationService.warn(e));
		}
		// In-Explorer DND (Move/Copy file)
		else {
			this.handleExplorerDrop(data, target, originalEvent).then(undefined, e => this.notificationService.warn(e));
		}
	}


	private async handleExternalDrop(data: DesktopDragAndDropData, target: ExplorerItem, originalEvent: DragEvent): Promise<void> {
		const droppedResources = extractResources(originalEvent, true);
		// Check for dropped external files to be folders
		const result = await this.fileService.resolveAll(droppedResources);

		// Pass focus to window
		this.windowService.focusWindow();

		// Handle folders by adding to workspace if we are in workspace context
		const folders = result.filter(r => r.success && r.stat && r.stat.isDirectory).map(result => ({ uri: result.stat!.resource }));
		if (folders.length > 0) {

			const buttons = [
				folders.length > 1 ? localize('copyFolders', "&&Copy Folders") : localize('copyFolder', "&&Copy Folder"),
				localize('cancel', "Cancel")
			];
			const workspaceFolderSchemas = this.contextService.getWorkspace().folders.map(f => f.uri.scheme);
			let message = folders.length > 1 ? localize('copyfolders', "Are you sure to want to copy folders?") : localize('copyfolder', "Are you sure to want to copy '{0}'?", basename(folders[0].uri));
			if (folders.some(f => workspaceFolderSchemas.indexOf(f.uri.scheme) >= 0)) {
				// We only allow to add a folder to the workspace if there is already a workspace folder with that scheme
				buttons.unshift(folders.length > 1 ? localize('addFolders', "&&Add Folders to Workspace") : localize('addFolder', "&&Add Folder to Workspace"));
				message = folders.length > 1 ? localize('dropFolders', "Do you want to copy the folders or add the folders to the workspace?")
					: localize('dropFolder', "Do you want to copy '{0}' or add '{0}' as a folder to the workspace?", basename(folders[0].uri));
			}

			const choice = await this.dialogService.show(Severity.Info, message, buttons);
			if (choice === buttons.length - 3) {
				return this.workspaceEditingService.addFolders(folders);
			}
			if (choice === buttons.length - 2) {
				return this.addResources(target, droppedResources.map(res => res.resource));
			}

			return undefined;
		}

		// Handle dropped files (only support FileStat as target)
		else if (target instanceof ExplorerItem) {
			return this.addResources(target, droppedResources.map(res => res.resource));
		}

		return undefined;
	}

	private addResources(target: ExplorerItem, resources: URI[]): Promise<any> {
		if (resources && resources.length > 0) {

			// Resolve target to check for name collisions and ask user
			return this.fileService.resolve(target.resource).then(targetStat => {

				// Check for name collisions
				const targetNames = new Set<string>();
				if (targetStat.children) {
					const ignoreCase = hasToIgnoreCase(target.resource);
					targetStat.children.forEach(child => {
						targetNames.add(ignoreCase ? child.name : child.name.toLowerCase());
					});
				}

				let overwritePromise: Promise<IConfirmationResult> = Promise.resolve({ confirmed: true });
				if (resources.some(resource => {
					return targetNames.has(!hasToIgnoreCase(resource) ? basename(resource) : basename(resource).toLowerCase());
				})) {
					const confirm: IConfirmation = {
						message: localize('confirmOverwrite', "A file or folder with the same name already exists in the destination folder. Do you want to replace it?"),
						detail: localize('irreversible', "This action is irreversible!"),
						primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
						type: 'warning'
					};

					overwritePromise = this.dialogService.confirm(confirm);
				}

				return overwritePromise.then(res => {
					if (!res.confirmed) {
						return [];
					}

					// Run add in sequence
					const addPromisesFactory: ITask<Promise<void>>[] = [];
					resources.forEach(resource => {
						addPromisesFactory.push(() => {
							const sourceFile = resource;
							const targetFile = joinPath(target.resource, basename(sourceFile));

							// if the target exists and is dirty, make sure to revert it. otherwise the dirty contents
							// of the target file would replace the contents of the added file. since we already
							// confirmed the overwrite before, this is OK.
							let revertPromise: Promise<ITextFileOperationResult | null> = Promise.resolve(null);
							if (this.textFileService.isDirty(targetFile)) {
								revertPromise = this.textFileService.revertAll([targetFile], { soft: true });
							}

							return revertPromise.then(() => {
								const copyTarget = joinPath(target.resource, basename(sourceFile));
								return this.fileService.copy(sourceFile, copyTarget, true).then(stat => {

									// if we only add one file, just open it directly
									if (resources.length === 1 && !stat.isDirectory) {
										this.editorService.openEditor({ resource: stat.resource, options: { pinned: true } });
									}
								});
							});
						});
					});

					return sequence(addPromisesFactory);
				});
			});
		}

		return Promise.resolve(undefined);
	}

	private handleExplorerDrop(data: IDragAndDropData, target: ExplorerItem, originalEvent: DragEvent): Promise<void> {
		const elementsData = (data as ElementsDragAndDropData<ExplorerItem>).elements;
		const items = distinctParents(elementsData, s => s.resource);
		const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

		let confirmPromise: Promise<IConfirmationResult>;

		// Handle confirm setting
		const confirmDragAndDrop = !isCopy && this.configurationService.getValue<boolean>(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
		if (confirmDragAndDrop) {
			confirmPromise = this.dialogService.confirm({
				message: items.length > 1 && items.every(s => s.isRoot) ? localize('confirmRootsMove', "Are you sure you want to change the order of multiple root folders in your workspace?")
					: items.length > 1 ? getConfirmMessage(localize('confirmMultiMove', "Are you sure you want to move the following {0} files?", items.length), items.map(s => s.resource))
						: items[0].isRoot ? localize('confirmRootMove', "Are you sure you want to change the order of root folder '{0}' in your workspace?", items[0].name)
							: localize('confirmMove', "Are you sure you want to move '{0}'?", items[0].name),
				checkbox: {
					label: localize('doNotAskAgain', "Do not ask me again")
				},
				type: 'question',
				primaryButton: localize({ key: 'moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
			});
		} else {
			confirmPromise = Promise.resolve({ confirmed: true });
		}

		return confirmPromise.then(res => {

			// Check for confirmation checkbox
			let updateConfirmSettingsPromise: Promise<void> = Promise.resolve(undefined);
			if (res.confirmed && res.checkboxChecked === true) {
				updateConfirmSettingsPromise = this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false, ConfigurationTarget.USER);
			}

			return updateConfirmSettingsPromise.then(() => {
				if (res.confirmed) {
					const rootDropPromise = this.doHandleRootDrop(items.filter(s => s.isRoot), target);
					return Promise.all(items.filter(s => !s.isRoot).map(source => this.doHandleExplorerDrop(source, target, isCopy)).concat(rootDropPromise)).then(() => undefined);
				}

				return Promise.resolve(undefined);
			});
		});
	}

	private doHandleRootDrop(roots: ExplorerItem[], target: ExplorerItem): Promise<void> {
		if (roots.length === 0) {
			return Promise.resolve(undefined);
		}

		const folders = this.contextService.getWorkspace().folders;
		let targetIndex: number | undefined;
		const workspaceCreationData: IWorkspaceFolderCreationData[] = [];
		const rootsToMove: IWorkspaceFolderCreationData[] = [];

		for (let index = 0; index < folders.length; index++) {
			const data = {
				uri: folders[index].uri,
				name: folders[index].name
			};
			if (target instanceof ExplorerItem && folders[index].uri.toString() === target.resource.toString()) {
				targetIndex = index;
			}

			if (roots.every(r => r.resource.toString() !== folders[index].uri.toString())) {
				workspaceCreationData.push(data);
			} else {
				rootsToMove.push(data);
			}
		}
		if (targetIndex === undefined) {
			targetIndex = workspaceCreationData.length;
		}

		workspaceCreationData.splice(targetIndex, 0, ...rootsToMove);
		return this.workspaceEditingService.updateFolders(0, workspaceCreationData.length, workspaceCreationData);
	}

	private doHandleExplorerDrop(source: ExplorerItem, target: ExplorerItem, isCopy: boolean): Promise<void> {
		// Reuse duplicate action if user copies
		if (isCopy) {
			const incrementalNaming = this.configurationService.getValue<IFilesConfiguration>().explorer.incrementalNaming;
			return this.fileService.copy(source.resource, findValidPasteFileTarget(target, { resource: source.resource, isDirectory: source.isDirectory, allowOverwrite: false }, incrementalNaming)).then(stat => {
				if (!stat.isDirectory) {
					return this.editorService.openEditor({ resource: stat.resource, options: { pinned: true } }).then(() => undefined);
				}

				return undefined;
			});
		}

		// Otherwise move
		const targetResource = joinPath(target.resource, source.name);
		if (source.isReadonly) {
			// Do not allow moving readonly items
			return Promise.resolve();
		}

		return this.textFileService.move(source.resource, targetResource).then(undefined, error => {

			// Conflict
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
				const confirm: IConfirmation = {
					message: localize('confirmOverwriteMessage', "'{0}' already exists in the destination folder. Do you want to replace it?", source.name),
					detail: localize('irreversible', "This action is irreversible!"),
					primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
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
	}
}
